"""
Docker entrypoint: same Flask app but serves frontend static files when FRONTEND_DIR is set.
Used only when running in Docker so one container can serve both API and frontend.
"""
import os
from flask import send_from_directory, abort

from app import app

FRONTEND_DIR = os.environ.get('FRONTEND_DIR', '').strip()
if FRONTEND_DIR and os.path.isdir(FRONTEND_DIR):
    def _serve_frontend_file(filename: str, *, is_html: bool = False):
        response = send_from_directory(FRONTEND_DIR, filename)
        if is_html:
            # Always fetch a fresh HTML shell after blue/green cutovers so the
            # browser picks up the latest versioned JS/CSS assets immediately.
            response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
        return response

    @app.route('/')
    def index():
        return _serve_frontend_file('index.html', is_html=True)

    @app.route('/<path:path>')
    def serve_frontend(path):
        if path.startswith('api') or path.startswith('saml') or path.startswith('login'):
            abort(404)
        file_path = os.path.join(FRONTEND_DIR, path)
        if os.path.isfile(file_path):
            return _serve_frontend_file(path, is_html=path.endswith('.html'))
        return _serve_frontend_file('index.html', is_html=True)
