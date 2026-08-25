# devserver.py — no-cache 정적 서버 (개발용; 배포는 GitHub Pages)
import http.server, functools, os

class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a): pass

os.chdir(r'C:\Users\scj94\Documents\Claude\amhaengeosa')
http.server.ThreadingHTTPServer(('127.0.0.1', 8123), H).serve_forever()
