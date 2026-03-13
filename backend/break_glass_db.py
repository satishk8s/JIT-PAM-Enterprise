"""
Break-glass users: stored in SQLite on EC2.
These users log in with username/password and have full access; they assign Identity Center users as admins/roles.
"""
import os
import sqlite3
import hashlib
import secrets

# DB path: backend/data/npamx_break_glass.db
_DATA_DIR = os.getenv('NPAMX_DATA_DIR') or os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(_DATA_DIR, exist_ok=True)
BREAK_GLASS_DB_PATH = os.getenv('BREAK_GLASS_DB_PATH') or os.path.join(_DATA_DIR, 'npamx_break_glass.db')


def _hash_password(password: str, salt: str = None) -> tuple:
    """Return (hash_hex, salt). Uses SHA-256 with salt for storage."""
    if not salt:
        salt = secrets.token_hex(16)
    h = hashlib.sha256((salt + password).encode('utf-8')).hexdigest()
    return h, salt


def _verify_password(password: str, stored_hash: str, salt: str) -> bool:
    h, _ = _hash_password(password, salt)
    return secrets.compare_digest(h, stored_hash)


def init_db():
    """Create break_glass_users table if not exists."""
    conn = sqlite3.connect(BREAK_GLASS_DB_PATH)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS break_glass_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'SuperAdmin',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.commit()
    finally:
        conn.close()


def add_user(email: str, password: str, role: str = 'SuperAdmin') -> bool:
    """Add or replace a break-glass user. Returns True on success."""
    email = str(email or '').strip().lower()
    if not email or '@' not in email or not password:
        return False
    password_hash, salt = _hash_password(password)
    conn = sqlite3.connect(BREAK_GLASS_DB_PATH)
    try:
        conn.execute(
            """INSERT OR REPLACE INTO break_glass_users (email, password_hash, salt, role)
               VALUES (?, ?, ?, ?)""",
            (email, password_hash, salt, role)
        )
        conn.commit()
        return True
    finally:
        conn.close()


def get_user_by_email(email: str):
    """Return {'email', 'password_hash', 'salt', 'role'} or None."""
    email = str(email or '').strip().lower()
    if not email:
        return None
    conn = sqlite3.connect(BREAK_GLASS_DB_PATH)
    try:
        row = conn.execute(
            "SELECT email, password_hash, salt, role FROM break_glass_users WHERE email = ?",
            (email,)
        ).fetchone()
        if not row:
            return None
        return {
            'email': row[0],
            'password_hash': row[1],
            'salt': row[2],
            'role': row[3] or 'SuperAdmin',
        }
    finally:
        conn.close()


def verify_break_glass_user(email: str, password: str):
    """
    Verify email/password. Returns {'email', 'role'} on success, None on failure.
    """
    user = get_user_by_email(email)
    if not user:
        return None
    if not _verify_password(password, user['password_hash'], user['salt']):
        return None
    return {'email': user['email'], 'role': user['role']}
