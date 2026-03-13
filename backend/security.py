"""
Production security: headers, rate limiting, CSRF, audit hook.
Security Baseline: RBAC for admin is in app.py (enforce_admin_api_access).
"""
from __future__ import annotations

import os
import secrets
import time
from collections import defaultdict
from threading import Lock

# Rate limit: in-memory (per process). For multi-worker use Redis in production.
_RATE_LIMIT_STORE = defaultdict(list)
_RATE_LIMIT_LOCK = Lock()

# Limits: (max_requests, window_seconds)
RATE_LIMIT_AUTH = (10, 60)       # login/SAML: 10 per minute per IP
RATE_LIMIT_SENSITIVE = (30, 60) # approve/deny/revoke, request-access: 30/min
RATE_LIMIT_GLOBAL = (200, 60)   # general API: 200/min per IP
RATE_LIMIT_PER_USER = (100, 60) # per authenticated user: 100/min (in addition to IP)


def _get_client_ip():
    from flask import request
    return request.headers.get("X-Real-IP") or request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.remote_addr or "unknown"


def _get_current_user_for_rate_limit():
    """Return session user identifier for per-user rate limit, or None."""
    from flask import session
    u = session.get("user") or session.get("email") or ""
    return str(u).strip() or None


def _rate_limit_key(prefix: str = "", user: str = None):
    ip = _get_client_ip()
    if user:
        return f"{prefix}:user:{user}"
    return f"{prefix}:{ip}"


def _check_rate_limit(key: str, max_requests: int, window_seconds: int) -> bool:
    """Return True if allowed, False if rate limited."""
    now = time.time()
    with _RATE_LIMIT_LOCK:
        times = _RATE_LIMIT_STORE[key]
        times[:] = [t for t in times if now - t < window_seconds]
        if len(times) >= max_requests:
            return False
        times.append(now)
    return True


def rate_limit_exempt(view):
    """Decorator to mark a view as exempt from rate limiting (e.g. health)."""
    view._rate_limit_exempt = True
    return view


def apply_security_headers(app):
    """Add security headers to all responses."""
    @app.after_request
    def _security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if os.environ.get("FLASK_ENV", "").lower() == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        # CSP: allow same origin and common CDNs; no inline scripts in production
        csp = os.environ.get("CONTENT_SECURITY_POLICY", "").strip()
        if csp:
            response.headers["Content-Security-Policy"] = csp
        return response
    return app


def init_rate_limit(app):
    """Register before_request: rate limit per IP and per user (when authenticated)."""
    @app.before_request
    def _rate_limit():
        from flask import request, jsonify
        view = request.endpoint and app.view_functions.get(request.endpoint)
        if getattr(view, "_rate_limit_exempt", False):
            return None
        path = request.path or ""
        ip = _get_client_ip()
        user = _get_current_user_for_rate_limit()
        key_global = _rate_limit_key("global", user=None)
        if path.startswith("/api/login") or path.startswith("/saml/") or path == "/login":
            key = _rate_limit_key("auth", user=None)
            max_r, window = RATE_LIMIT_AUTH
        elif any(path.startswith(p) for p in ("/api/approve/", "/api/request/", "/api/databases/request-access", "/api/request-access", "/api/request-for-others")):
            key = _rate_limit_key("sensitive", user=user)
            max_r, window = RATE_LIMIT_SENSITIVE
        else:
            key = key_global
            max_r, window = RATE_LIMIT_GLOBAL
        if not _check_rate_limit(key, max_r, window):
            return jsonify({"error": "Too many requests"}), 429
        if key != key_global and not _check_rate_limit(key_global, RATE_LIMIT_GLOBAL[0], RATE_LIMIT_GLOBAL[1]):
            return jsonify({"error": "Too many requests"}), 429
        # Per-user limit for authenticated requests (so one user cannot exhaust IP quota)
        if user and path.startswith("/api/"):
            key_user = _rate_limit_key("user", user=user)
            if not _check_rate_limit(key_user, RATE_LIMIT_PER_USER[0], RATE_LIMIT_PER_USER[1]):
                return jsonify({"error": "Too many requests"}), 429
        return None
    return app


# ---- CSRF (state-changing requests) ----
CSRF_EXEMPT_PATHS = frozenset([
    "/saml/acs", "/api/v1/auth/saml/acs",
    "/login", "/api/login", "/api/v1/auth/login",
    "/api/admin/check-pam-admin",
    "/api/auth/break-glass-login",
])
CSRF_HEADER = "X-CSRF-Token"
CSRF_COOKIE = "XSRF-TOKEN"


def init_csrf(app):
    """Require X-CSRF-Token header for POST/PUT/PATCH/DELETE; exempt SAML/acs and login."""

    @app.before_request
    def _csrf_check():
        from flask import request, jsonify, session
        if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
            return None
        path = (request.path or "").rstrip("/")
        if path in CSRF_EXEMPT_PATHS or any(path.startswith(p.rstrip("/")) for p in ("/saml/", "/api/login", "/api/v1/auth/login", "/api/auth/break-glass-login")):
            return None
        if request.path.startswith("/api/admin/check-pam-admin"):
            return None
        token_header = (request.headers.get(CSRF_HEADER) or "").strip()
        token_cookie = (request.cookies.get(CSRF_COOKIE) or "").strip()
        if not token_cookie or not secrets.compare_digest(token_header, token_cookie):
            return jsonify({"error": "Invalid or missing CSRF token"}), 403
        return None

    @app.after_request
    def _set_csrf_cookie(response):
        from flask import request, session
        if session.get("user") and not request.cookies.get(CSRF_COOKIE):
            token = secrets.token_urlsafe(32)
            response.set_cookie(
                CSRF_COOKIE,
                value=token,
                httponly=False,
                samesite="Lax",
                secure=os.environ.get("FLASK_ENV", "").lower() == "production",
                max_age=3600 * 12,
            )
        return response

    return app


def set_csrf_cookie_in_response(response, request):
    """Set XSRF-TOKEN cookie when user logs in (so SPA can send X-CSRF-Token header)."""
    token = secrets.token_urlsafe(32)
    response.set_cookie(
        CSRF_COOKIE,
        value=token,
        httponly=False,
        samesite="Lax",
        secure=os.environ.get("FLASK_ENV", "").lower() == "production",
        max_age=3600 * 12,
    )
    return response


# ---- Response sanitization (Security Baseline: no secrets in responses) ----
SENSITIVE_KEYS = frozenset([
    "password", "vault_token", "secret", "token", "api_key", "access_key", "secret_key",
    "db_password", "aws_secret", "authorization", "cookie",
])


def sanitize_json_response(data):
    """Recursively mask values for keys that look like secrets. Call from endpoints or after_request."""
    if data is None:
        return None
    if isinstance(data, list):
        return [sanitize_json_response(x) for x in data]
    if isinstance(data, dict):
        out = {}
        for k, v in data.items():
            k_low = str(k).lower()
            if any(s in k_low for s in SENSITIVE_KEYS) and v is not None and v != "":
                out[k] = "***"
            else:
                out[k] = sanitize_json_response(v)
        return out
    return data
