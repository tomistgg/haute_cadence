import json
import tempfile
import threading
import unittest
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import urlopen

from serve_site import CardHandler, NoPhotoRedirects


class DataRequestsTest(unittest.TestCase):
    def test_photo_relay_is_limited_to_library_routes_types_and_size(self):
        self.assertIsNone(NoPhotoRedirects().redirect_request(None, None, 302, "", {}, "https://other.example"))
        with (
            patch("serve_site.build_opener") as opener,
            patch.object(CardHandler, "log_message"),
            ThreadingHTTPServer(("127.0.0.1", 0), CardHandler) as server,
        ):
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            base = f"http://127.0.0.1:{server.server_port}"
            fetch = opener.return_value.open
            upstream = fetch.return_value.__enter__.return_value
            upstream.status = 200
            upstream.headers = {"Content-Type": "application/json"}
            upstream.read.return_value = b'{"photos":[]}'
            try:
                with urlopen(base + "/photos", timeout=5) as response:
                    self.assertEqual(json.load(response), {"photos": []})
                self.assertEqual(fetch.call_args.args[0].full_url, "https://tennis-wta-api.schiter-tomas.workers.dev/photos")
                self.assertEqual(fetch.call_args.args[0].get_header("Origin"), "https://tomistgg.github.io")
                upstream.headers = {"Content-Type": "image/png"}
                upstream.read.return_value = b"photo"
                with urlopen(base + "/photos/player_1?v=2026-11-05", timeout=5) as response:
                    self.assertEqual(response.read(), b"photo")
                self.assertTrue(fetch.call_args.args[0].full_url.endswith("/photos/player_1?v=2026-11-05"))
                requests_before = fetch.call_count
                with self.assertRaises(HTTPError) as invalid:
                    urlopen(base + "/photos/invalid/id", timeout=5)
                self.assertEqual(invalid.exception.code, 404)
                invalid.exception.close()
                self.assertEqual(fetch.call_count, requests_before)
                for content_type, body in (("text/html", b"page"), ("image/png", b"x" * (10 * 1024 * 1024 + 1))):
                    upstream.headers = {"Content-Type": content_type}
                    upstream.read.return_value = body
                    with self.assertRaises(HTTPError) as invalid:
                        urlopen(base + "/photos/player_1", timeout=5)
                    self.assertEqual(invalid.exception.code, 502)
                    invalid.exception.close()
            finally:
                server.shutdown()
                worker.join(timeout=5)

    def test_missing_artwork_returns_503_then_data_is_served_after_repair(self):
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory) / "data"
            data_dir.mkdir()
            payloads = {"players.json": {"players": [{"id": "1"}]}, "calendar_snapshot.json": {"weeks": {}}}
            for filename, payload in payloads.items():
                (data_dir / filename).write_text(json.dumps(payload), encoding="utf-8")
            handler = partial(CardHandler, directory=directory)
            with (
                patch("serve_site.refresh_feed"),
                patch("serve_site.refresh_site_data") as refresh,
                patch.object(CardHandler, "log_message"),
                ThreadingHTTPServer(("127.0.0.1", 0), handler) as server,
            ):
                worker = threading.Thread(target=server.serve_forever, daemon=True)
                worker.start()
                base = f"http://127.0.0.1:{server.server_port}/data/"
                try:
                    refresh.side_effect = FileNotFoundError("Missing site asset")
                    for filename in payloads:
                        with self.assertRaises(HTTPError) as error:
                            urlopen(base + filename, timeout=5)
                        self.assertEqual(error.exception.code, 503)
                        error.exception.close()
                    refresh.side_effect = None
                    for filename, payload in payloads.items():
                        with urlopen(base + filename, timeout=5) as response:
                            self.assertEqual(response.status, 200)
                            self.assertEqual(json.load(response), payload)
                finally:
                    server.shutdown()
                    worker.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
