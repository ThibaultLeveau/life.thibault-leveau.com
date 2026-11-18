"""Synthetic public website for isolated container acceptance, never production."""
from http.server import BaseHTTPRequestHandler, HTTPServer

PAGE = '''<!doctype html><html><head><title>Lemon pasta source</title></head><body>
<main><h1>Human check</h1><button style="position:absolute;top:100px;left:100px;width:200px;height:70px" onclick="document.cookie='checked=yes; SameSite=Lax';location.href='/recipe'">I am here</button></main>
</body></html>'''
RECIPE = '''<!doctype html><html><head><title>Lemon pasta</title>
<script type="application/ld+json">{"@type":"Recipe","name":"Lemon pasta","recipeIngredient":["1 lemon","200 g pasta"],"recipeYield":"2","recipeInstructions":"Boil pasta and add lemon."}</script>
</head><body><main><h1>Lemon pasta</h1><p>Serves 2. One lemon, 200 g pasta. Boil and mix.</p><p id="network">Checking blocked destination</p></main>
<script>fetch('http://127.0.0.1:8090/health').then(()=>{document.querySelector('#network').textContent='Unexpected local access'}).catch(()=>{document.querySelector('#network').textContent='Local network denied'});</script></body></html>'''

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/redirect':
            self.send_response(302)
            self.send_header('Location', 'http://169.254.169.254/latest/meta-data/')
            self.end_headers()
            return
        body = (RECIPE if self.path == '/recipe' and 'checked=yes' in self.headers.get('Cookie', '') else PAGE).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *_):
        pass

HTTPServer(('0.0.0.0', 80), Handler).serve_forever()
