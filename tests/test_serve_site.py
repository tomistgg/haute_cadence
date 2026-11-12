import json
import tempfile
import threading
import unittest
from contextlib import contextmanager
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from serve_site import PUBLIC_ORIGIN, CardHandler, NoPhotoRedirects, local_backend


@contextmanager
def running_server(handler):
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        worker = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        worker.start()
        try:
            yield server
        finally:
            server.shutdown()
            worker.join(timeout=5)


class SharedBackendHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.requests.append({
            "method": self.command, "path": self.path, "headers": self.headers,
            "body": self.rfile.read(int(self.headers.get("Content-Length", "0"))),
        })
        status, content_type, body = self.server.reply
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    do_POST = do_GET

    def log_message(self, *_args):
        pass


class DataRequestsTest(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.directory = Path(directory)
        (self.directory / "data").mkdir()
        (self.directory / "index.html").write_text("<title>Card editor</title>", encoding="utf-8")
        (self.directory / "data" / "surfaces.json").write_text('{"surfaces":[]}', encoding="utf-8")
        self.enterContext(patch.object(CardHandler, "log_message"))
        self.backend = self.enterContext(running_server(SharedBackendHandler))
        self.backend.requests = []
        self.backend.reply = (200, "application/json", b'{"data":{},"state":{"updated_at":"saved"}}')
        backend_url = f"http://127.0.0.1:{self.backend.server_port}"
        handler = partial(CardHandler, directory=directory, shared_backend=backend_url)
        self.server = self.enterContext(running_server(handler))
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def request(self, path, *, method="GET", headers=None, body=None):
        request = Request(self.base + path, data=body, method=method, headers=headers or {})
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return response.status, response.headers, response.read()

    def test_gets_shared_envelopes_and_preserves_backend_status_and_query(self):
        for path in (
            "/data/players", "/data/calendar", "/data/results", "/data/draws", "/data/champions",
            "/data/players/329081/form?year=2026&cursor=next",
        ):
            with self.subTest(path=path):
                status, headers, body = self.request(path, headers={
                    "Origin": "https://other.example", "Cookie": "private=cookie", "Authorization": "Bearer private",
                })
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(body), {"data": {}, "state": {"updated_at": "saved"}})
                self.assertEqual(headers["Cache-Control"], "no-store")
                self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
                upstream = self.backend.requests[-1]
                self.assertEqual((upstream["method"], upstream["path"], upstream["body"]), ("GET", path, b""))
                self.assertEqual(upstream["headers"]["Origin"], PUBLIC_ORIGIN)
                self.assertEqual(upstream["headers"]["Accept"], "application/json")
                self.assertIsNone(upstream["headers"]["Cookie"])
                self.assertIsNone(upstream["headers"]["Authorization"])
        for expected in (202, 429, 503):
            with self.subTest(status=expected):
                self.backend.reply = (expected, "application/json; charset=utf-8", b'{"state":{"status":"pending"}}')
                status, _, body = self.request("/data/results")
                self.assertEqual(status, expected)
                self.assertEqual(json.loads(body), {"state": {"status": "pending"}})

    def test_invalid_backend_response_becomes_an_unavailable_envelope(self):
        for content_type, body in (
            ("text/html", b"<html>failure</html>"),
            ("application/json", b"not JSON"),
            ("application/json", b"[]"),
            ("application/json", b"x" * (8 * 1024 * 1024 + 1)),
        ):
            with self.subTest(content_type=content_type, length=len(body)):
                self.backend.reply = (200, content_type, body)
                status, headers, payload = self.request("/data/results")
                self.assertEqual(status, 503)
                self.assertIn("temporarily unavailable", json.loads(payload)["error"])
                self.assertEqual(headers["Cache-Control"], "no-store")

    def test_refresh_forwards_only_empty_posts_from_local_origins(self):
        self.backend.reply = (202, "application/json", b'{"state":{"status":"running"}}')
        origins = [None, self.base, f"http://localhost:{self.server.server_port}",
                   f"http://[::1]:{self.server.server_port}"]
        for origin in origins:
            with self.subTest(origin=origin):
                headers = {"Cookie": "private=cookie", "Authorization": "Bearer private"}
                if origin:
                    headers["Origin"] = origin
                status, _, body = self.request("/data/results/refresh", method="POST", headers=headers, body=b"")
                self.assertEqual(status, 202)
                self.assertEqual(json.loads(body), {"state": {"status": "running"}})
                upstream = self.backend.requests[-1]
                self.assertEqual((upstream["method"], upstream["path"], upstream["body"]),
                                 ("POST", "/data/results/refresh", b""))
                self.assertEqual(upstream["headers"]["Origin"], PUBLIC_ORIGIN)
                self.assertIsNone(upstream["headers"]["Cookie"])
                self.assertIsNone(upstream["headers"]["Authorization"])

    def test_refresh_rejects_other_origins_and_request_bodies_without_contacting_backend(self):
        for headers in ({"Origin": PUBLIC_ORIGIN}, {"Origin": "https://other.example"},
                        {"Origin": "http://127.0.0.1:1"}, {"Origin": "null"}):
            with self.subTest(headers=headers):
                status, _, _ = self.request("/data/results/refresh", method="POST", headers=headers, body=b"")
                self.assertEqual(status, 403)
        for headers, body in (({}, b"data"), ({"Content-Length": "invalid"}, b""),
                              ({"Content-Length": "-1"}, b""), ({"Transfer-Encoding": "chunked"}, b"")):
            with self.subTest(headers=headers, body=body):
                status, _, payload = self.request("/data/results/refresh", method="POST", headers=headers, body=body)
                self.assertEqual(status, 400)
                self.assertIn("empty request", json.loads(payload)["error"])
        self.assertEqual(self.backend.requests, [])

    def test_unknown_and_retired_data_routes_cannot_serve_old_files(self):
        for filename in ("players.json", "calendar_snapshot.json", "recent_results.json", "current_draws.json",
                         "wta_champions.json", "unknown.json"):
            (self.directory / "data" / filename).write_text('{"old":true}', encoding="utf-8")
            self.assertEqual(self.request("/data/" + filename)[0], 404)
        for path in ("/api/tennis/tournaments", "/data/unknown", "/data/players/0/form",
                     "/data/players/12345678901/form", "/data/players/1/form/refresh", "/data/results/refresh"):
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[0], 404)
        for path in ("/api/tennis/tournaments", "/data/results", "/data/unknown/refresh",
                     "/data/results.json?refresh=1"):
            with self.subTest(path=path):
                self.assertEqual(self.request(path, method="POST", body=b"")[0], 404)
        self.assertEqual(self.backend.requests, [])

    def test_editor_and_surface_artwork_data_still_serve_as_static_files(self):
        status, _, body = self.request("/")
        self.assertEqual(status, 200)
        self.assertIn(b"Card editor", body)
        status, _, body = self.request("/data/surfaces.json")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {"surfaces": []})
        self.assertEqual(self.backend.requests, [])

    def test_photo_relay_is_limited_to_library_routes_types_and_size(self):
        self.assertIsNone(NoPhotoRedirects().redirect_request(None, None, 302, "", {}, "https://other.example"))
        with patch("serve_site.build_opener") as opener:
            fetch = opener.return_value.open
            upstream = fetch.return_value.__enter__.return_value
            upstream.status = 200
            upstream.headers = {"Content-Type": "application/json"}
            upstream.read.return_value = b'{"photos":[]}'
            status, _, body = self.request("/photos")
            self.assertEqual((status, json.loads(body)), (200, {"photos": []}))
            self.assertEqual(fetch.call_args.args[0].full_url, "https://tennis-wta-api.schiter-tomas.workers.dev/photos")
            self.assertEqual(fetch.call_args.args[0].get_header("Origin"), PUBLIC_ORIGIN)
            for content_type in ("image/png", "image/jpeg", "image/webp"):
                upstream.headers = {"Content-Type": content_type}
                upstream.read.return_value = b"photo"
                status, headers, body = self.request("/photos/player_1?v=2026-11-05")
                self.assertEqual((status, body), (200, b"photo"))
                self.assertEqual(headers["Content-Type"], content_type)
                self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
                self.assertTrue(fetch.call_args.args[0].full_url.endswith("/photos/player_1?v=2026-11-05"))
            requests_before = fetch.call_count
            for path in ("/photos/invalid/id", "/photos/player%2Fid", "/photos/player.html"):
                self.assertEqual(self.request(path)[0], 404)
            self.assertEqual(fetch.call_count, requests_before)
            for path, content_type, body in (
                ("/photos", "image/png", b"photo"),
                ("/photos/player_1", "application/json", b"{}"),
                ("/photos/player_1", "text/html", b"page"),
                ("/photos/player_1", "image/svg+xml", b"<svg/>"),
                ("/photos/player_1", "image/png", b"x" * (10 * 1024 * 1024 + 1)),
            ):
                with self.subTest(path=path, content_type=content_type, length=len(body)):
                    upstream.headers = {"Content-Type": content_type}
                    upstream.read.return_value = body
                    self.assertEqual(self.request(path)[0], 502)


class LocalBackendTest(unittest.TestCase):
    def test_only_explicit_local_http_ports_are_allowed(self):
        for value in ("http://127.0.0.1:8787", "http://localhost:8787/", "http://[::1]:8787"):
            with self.subTest(value=value):
                self.assertEqual(local_backend(value), value.rstrip("/"))
        for value in (
            "https://127.0.0.1:8787", "http://example.com:8787", "http://127.0.0.1", "http://localhost:invalid",
            "http://localhost:65536", "http://user:password@localhost:8787", "http://localhost:8787/data",
            "http://localhost:8787/?query=1", "http://localhost:8787/#fragment", "//localhost:8787",
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                local_backend(value)


if __name__ == "__main__":
    unittest.main()
