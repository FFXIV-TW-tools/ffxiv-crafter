#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地 dev 預覽 server — 送 no-cache，重整即拿最新（避免瀏覽器快取舊版）。
用法：py -3.11 tools/serve.py [port]（預設 8809）。線上 CF Pages 用 _headers 控快取，不走此檔。"""
import http.server, sys, os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8809
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo 根目錄


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()


Handler.extensions_map.update({".wasm": "application/wasm", ".js": "text/javascript"})

# ThreadingHTTPServer：多執行緒，瀏覽器並行請求(html/css/js/wasm/data/icon)不互相阻塞
with http.server.ThreadingHTTPServer(("", PORT), Handler) as httpd:
    print("craft-solver dev (no-cache, threaded) → http://localhost:%d/" % PORT)
    httpd.serve_forever()
