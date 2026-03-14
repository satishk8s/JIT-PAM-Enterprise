"""
Docker entrypoint: same Flask app but serves frontend static files when FRONTEND_DIR is set.
Used only when running in Docker so one container can serve both API and frontend.
"""
import os
from flask import send_from_directory, abort

from app import app

FRONTEND_DIR = os.environ.get('FRONTEND_DIR', '').strip()
if FRONTEND_DIR and os.path.isdir(FRONTEND_DIR):
    @app.route('/')
    def index():
        return send_from_directory(FRONTEND_DIR, 'index.html')

    @app.route('/<path:path>')
    def serve_frontend(path):
        if path.startswith('api') or path.startswith('saml') or path.startswith('login'):
            abort(404)
        file_path = os.path.join(FRONTEND_DIR, path)
        if os.path.isfile(file_path):
            return send_from_directory(FRONTEND_DIR, path)
        return send_from_directory(FRONTEND_DIR, 'index.html')
