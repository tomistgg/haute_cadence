"""Serve the card editor with a local shared-data backend and the existing photo library."""

from __future__ import annotations

import argparse
import json
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from build_site import ROOT
from build_site import main as build_site

SHARED_ROUTE = r"/data/(?:players|calendar|results|draws|champions|players/[1-9]\d{0,9}/form)"
LEGACY_FEEDS = {
    "/data/players.json", "/data/calendar_snapshot.json", "/data/recent_results.json", "/data/current_draws.json",
}
PUBLIC_ORIGIN = "https://tomistgg.github.io"


class NoPhotoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def local_backend(value: str) -> str:
    url = urlsplit(value)
    if (url.scheme != "http" or url.hostname not in {"localhost", "127.0.0.1", "::1"}
            or url.username or url.password or url.path not in {"", "/"} or url.query or url.fragment):
        raise ValueError("The preview backend must be a localhost HTTP address.")
    try:
        if url.port is None:
            raise ValueError("The preview backend needs an explicit port.")
    except ValueError as error:
        raise ValueError("The preview backend needs a valid explicit port.") from error
    return value.rstrip("/")


class CardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, shared_backend="http://127.0.0.1:8787", **kwargs):
        self.shared_backend = local_backend(shared_backend)
        super().__init__(*args, **kwargs)

    def json_response(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def shared_data(self, url, method="GET"):
        upstream = self.shared_backend + url.path + ("?" + url.query if url.query else "")
        request = Request(upstream, data=b"" if method == "POST" else None, method=method, headers={
            "Origin": PUBLIC_ORIGIN, "Accept": "application/json", "User-Agent": "Haute-Cadence-local-preview",
        })
        try:
            try:
                response = build_opener(NoPhotoRedirects).open(request, timeout=90 if method == "POST" else 30)
            except HTTPError as error:
                response = error
            with response:
                body = response.read(8 * 1024 * 1024 + 1)
                if (response.headers.get("Content-Type", "").split(";")[0].strip() != "application/json"
                        or len(body) > 8 * 1024 * 1024):
                    raise ValueError("Invalid shared-data response")
                payload = json.loads(body)
                if not isinstance(payload, dict):
                    raise ValueError("Invalid shared-data envelope")
                self.json_response(payload, response.status)
        except (BrokenPipeError, ConnectionResetError):
            return
        except (OSError, ValueError) as error:
            self.log_error("Shared data unavailable: %s", error)
            self.json_response({"error": "Shared data is temporarily unavailable. Please try again."}, 503)

    def player_photos(self, url):
        upstream = "https://tennis-wta-api.schiter-tomas.workers.dev" + url.path
        if url.query:
            upstream += "?" + url.query
        try:
            request = Request(upstream, headers={
                "Origin": PUBLIC_ORIGIN, "Accept": "application/json, image/*", "User-Agent": "Mozilla/5.0",
            })
            with build_opener(NoPhotoRedirects).open(request, timeout=20) as response:
                content_type = response.headers.get("Content-Type", "").split(";")[0].strip()
                expected = {"application/json"} if url.path == "/photos" else {"image/png", "image/jpeg", "image/webp"}
                body = response.read(10 * 1024 * 1024 + 1)
                if response.status != 200 or content_type not in expected or len(body) > 10 * 1024 * 1024:
                    raise ValueError("Invalid photo library response")
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "public, max-age=300")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            return
        except (OSError, ValueError) as error:
            self.log_error("Player photos unavailable: %s", error)
            self.send_error(502, "Player photos are temporarily unavailable")

    def do_GET(self):
        url = urlsplit(self.path)
        if re.fullmatch(SHARED_ROUTE, url.path):
            return self.shared_data(url)
        if url.path == "/photos" or re.fullmatch(r"/photos/[A-Za-z0-9_-]+", url.path):
            return self.player_photos(url)
        if (url.path in LEGACY_FEEDS or url.path.startswith("/api/")
                or url.path.startswith("/data/") and url.path != "/data/surfaces.json"):
            self.send_error(404, "Unknown data endpoint")
            return None
        return super().do_GET()

    def do_POST(self):
        url = urlsplit(self.path)
        if not re.fullmatch(SHARED_ROUTE + r"/refresh", url.path):
            self.json_response({"error": "Unknown refresh endpoint."}, 404)
            return
        origins = {f"http://{host}:{self.server.server_port}" for host in ("127.0.0.1", "localhost", "[::1]")}
        if self.headers.get("Origin") not in origins | {None}:
            self.json_response({"error": "Website origin is not allowed."}, 403)
            return
        try:
            empty = int(self.headers.get("Content-Length", "0")) == 0 and not self.headers.get("Transfer-Encoding")
        except ValueError:
            empty = False
        if not empty:
            self.json_response({"error": "Refresh accepts an empty request only."}, 400)
            return
        self.shared_data(url, "POST")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--shared-backend", default="http://127.0.0.1:8787")
    args = parser.parse_args()
    try:
        backend = local_backend(args.shared_backend)
    except ValueError as error:
        parser.error(str(error))
    build_site(shared_data=True)
    handler = partial(CardHandler, directory=str(ROOT / "dist"), shared_backend=backend)
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Card editor: http://127.0.0.1:{args.port}/", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
