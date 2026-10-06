#!/usr/bin/env python3
"""Minimal "cloud" stand-in for the intercom journey.

Serves /srv over HTTP and answers with a Content-Disposition header
(filename derived from the path), so the portal's metadata snapshot can
be proven end to end. Also serves files whose NAMES carry script tags —
the journey asserts they render escaped.

Usage (inside the container):
    python3 /srv/cloud_mock.py <port>
"""

import os
import sys
import urllib.parse
from http.server import SimpleHTTPRequestHandler, HTTPServer


class CloudHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # real clouds send the DECODED filename in Content-Disposition
        name = urllib.parse.unquote(self.path.rsplit("/", 1)[-1])
        if name:
            self.send_header(
                "Content-Disposition", f'attachment; filename="{name}"'
            )
        super().end_headers()


if __name__ == "__main__":
    # docker exec starts in / — serve the mounted /srv instead
    os.chdir("/srv")
    HTTPServer(("0.0.0.0", int(sys.argv[1])), CloudHandler).serve_forever()
