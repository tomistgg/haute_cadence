"""Serve the built cards locally with a refreshed completed-match feed."""

from __future__ import annotations

import argparse
import json
import threading
from datetime import UTC, datetime, timedelta
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from update_wta_champions import save_history
from update_wta_draws import OUTPUT as DRAW_OUTPUT
from update_wta_draws import collect_draws
from update_wta_results import OUTPUT, ROOT, api_time, collect_results

_refresh_lock = threading.Lock()


class CardHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if path not in {"/data/recent_results.json", "/data/current_draws.json"}:
            return super().do_GET()
        output, collect = (
            (DRAW_OUTPUT, collect_draws) if path == "/data/current_draws.json" else (OUTPUT, collect_results)
        )
        try:
            with _refresh_lock:
                payload = json.loads(output.read_text(encoding="utf-8")) if output.is_file() else {}
                updated = api_time(payload.get("updated_at"))
                if updated is None or datetime.now(UTC) - updated > timedelta(minutes=5):
                    try:
                        payload = collect()
                        save_history(output, payload)
                    except Exception as error:
                        if not payload:
                            raise
                        payload["refresh_error"] = "WTA data could not be refreshed; showing the saved feed."
                        self.log_error("WTA result refresh failed: %s", error)
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as error:
            self.log_error("WTA result feed unavailable: %s", error)
            self.send_error(503, "WTA result feed is temporarily unavailable")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    handler = partial(CardHandler, directory=str(ROOT / "dist"))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Card preview: http://127.0.0.1:{args.port}/", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
