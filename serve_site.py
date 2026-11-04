"""Serve the built cards locally with a refreshed completed-match feed."""

from __future__ import annotations

import argparse
import json
import threading
from datetime import UTC, datetime, timedelta
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from build_site import main as build_site
from shared_data import source_signature
from update_wta_champions import merge_draw_champions, save_history
from update_wta_draws import OUTPUT as DRAW_OUTPUT
from update_wta_draws import collect_draws
from update_wta_results import OUTPUT, ROOT, api_time, collect_results

_refresh_lock = threading.Lock()
_site_signature = None


def refresh_feed(output, collect, force=False):
    payload = json.loads(output.read_text(encoding="utf-8")) if output.is_file() else {}
    updated = api_time(payload.get("updated_at"))
    if force or updated is None or datetime.now(UTC) - updated > timedelta(minutes=5):
        try:
            fresh = collect()
            merge_draw_champions(fresh.get("champions", []))
            save_history(output, fresh)
            payload = fresh
        except Exception:
            if not payload:
                raise
            payload = dict(payload)
            payload["refresh_error"] = "WTA data could not be refreshed; showing the saved feed."
    return payload


def refresh_site_data():
    global _site_signature
    signature = source_signature()
    if signature != _site_signature:
        build_site()
        _site_signature = signature


class CardHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        url = urlsplit(self.path)
        path = url.path
        if path in {"/data/players.json", "/data/calendar_snapshot.json"}:
            try:
                with _refresh_lock:
                    if path == "/data/players.json":
                        refresh_feed(DRAW_OUTPUT, collect_draws)
                    refresh_site_data()
            except Exception as error:
                self.log_error("Shared ranking/calendar data unavailable: %s", error)
                self.send_error(503, "Shared data from tenis-fem-arg is unavailable")
                return None
            return super().do_GET()
        if path not in {"/data/recent_results.json", "/data/current_draws.json"}:
            return super().do_GET()
        output, collect = (
            (DRAW_OUTPUT, collect_draws) if path == "/data/current_draws.json" else (OUTPUT, collect_results)
        )
        try:
            with _refresh_lock:
                payload = refresh_feed(output, collect, force=parse_qs(url.query).get("refresh") == ["1"])
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
    refresh_site_data()
    handler = partial(CardHandler, directory=str(ROOT / "dist"))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Card preview: http://127.0.0.1:{args.port}/", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
