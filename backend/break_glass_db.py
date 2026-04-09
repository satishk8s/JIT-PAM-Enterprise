"""
Break-glass users: stored in SQLite on EC2.
These users log in with username/password and have full access; they assign Identity Center users as admins/roles.
"""
import os
import sqlite3
import hashlib
import secrets
from datetime import datetime

import pyotp

# DB path: backend/data/npamx_break_glass.db
_DATA_DIR = os.getenv('NPAMX_DATA_DIR') or os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(_DATA_DIR, exist_ok=True)
BREAK_GLASS_DB_PATH = os.getenv('BREAK_GLASS_DB_PATH') or os.path.join(_DATA_DIR, 'npamx_break_glass.db')
_PBKDF2_PREFIX = 'pbkdf2_sha256'
_PBKDF2_ROUNDS = max(200000, int(os.getenv('NPAMX_PASSWORD_HASH_ROUNDS', '310000')))


def _hash_password(password: str, salt: str = None, rounds: int = None) -> tuple:
    """Return (encoded_hash, salt) using PBKDF2-HMAC-SHA256."""
    if not salt:
        salt = secrets.token_hex(16)
    iterations = int(rounds or _PBKDF2_ROUNDS)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), iterations)
    return f'{_PBKDF2_PREFIX}${iterations}${digest.hex()}', salt


def _verify_password(password: str, stored_hash: str, salt: str) -> bool:
    encoded = str(stored_hash or '').strip()
    if encoded.startswith(f'{_PBKDF2_PREFIX}$'):
        try:
            _, rounds_str, digest_hex = encoded.split('$', 2)
            digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), int(rounds_str))
            return secrets.compare_digest(digest.hex(), digest_hex)
        except Exception:
            return False
    legacy_hash = hashlib.sha256((salt + password).encode('utf-8')).hexdigest()
    return secrets.compare_digest(legacy_hash, encoded)


def _needs_rehash(stored_hash: str) -> bool:
    return not str(stored_hash or '').startswith(f'{_PBKDF2_PREFIX}$')


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
                totp_secret TEXT,
                mfa_enabled INTEGER NOT NULL DEFAULT 0,
                totp_secret_secondary TEXT,
                mfa_secondary_enabled INTEGER NOT NULL DEFAULT 0,
                last_login_at TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        cols = {row[1] for row in conn.execute("PRAGMA table_info(break_glass_users)").fetchall()}
        if 'totp_secret' not in cols:
            conn.execute("ALTER TABLE break_glass_users ADD COLUMN totp_secret TEXT")
        if 'mfa_enabled' not in cols:
            conn.execute("ALTER TABLE break_glass_users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0")
        if 'totp_secret_secondary' not in cols:
            conn.execute("ALTER TABLE break_glass_users ADD COLUMN totp_secret_secondary TEXT")
        if 'mfa_secondary_enabled' not in cols:
            conn.execute("ALTER TABLE break_glass_users ADD COLUMN mfa_secondary_enabled INTEGER NOT NULL DEFAULT 0")
        if 'last_login_at' not in cols:
            conn.execute("ALTER TABLE break_glass_users ADD COLUMN last_login_at TEXT")
        conn.commit()
    finally:
        conn.close()


def add_user(email: str, password: str, role: str = 'SuperAdmin', totp_secret: str = '', mfa_enabled: bool = False) -> bool:
    """Add or replace a break-glass user. Returns True on success."""
    email = str(email or '').strip().lower()
    if not email or '@' not in email or not password:
        return False
    password_hash, salt = _hash_password(password)
    conn = sqlite3.connect(BREAK_GLASS_DB_PATH)
    try:
        conn.execute(
            """INSERT OR REPLACE INTO break_glass_users
               (email, password_hash, salt, role, totp_secret, mfa_enabled, totp_secret_secondary, mfa_secondary_enabled)
               VALUES (?, ?, ?, ?, ?, ?, NULL, 0)""",
            (email, password_hash, salt, role, str(totp_secret or '').strip() or None, 1 if mfa_enabled else 0)
        )
        conn.commit()
        return True
    finally:
        conn.close()


def get_user_by_email(email: str):
    """Return {'email', 'password_hash', 'salt', 'role', 'totp_secret', 'mfa_enabled'} or None."""
    email = str(email or '').strip().lower()
    if not email:
        return None
    conn = sqlite3.connect(BREAK_GLASS_DB_PATH)
    try:
        row = conn.execute(
            "SELECT email, password_hash, salt, role, totp_secret, mfa_enabled, totp_secret_secondary, mfa_secondary_enabled, last_login_at FROM break_glass_users WHERE email = ?",
            (email,)
        ).fetchone()
        if not row:
            return None
        return {
            'email': row[0],
            'password_hash': row[1],
            'salt': row[2],
            'role': row[3] or 'SuperAdmin',
            'totp_secret': row[4] or '',
            'mfa_enabled': bool(row[5]),
            'totp_secret_secondary': row[6] or '',
            'mfa_secondary_enabled': bool(row[7]),
            'last_login_at': row[8] or '',
        }
    finally:
        conn.close()


def count_break_glass_users(*, mfa_enabled_only: bool = False) -> int:
    conn = sqlite3.connect(BREAK_GLASS_DB_PATH)
    try:
        if mfa_enabled_only:
            row = conn.execute("SELECT COUNT(*) FROM break_glass_users WHERE mfa_enabled = 1").fetchone()
        else:
            row = conn.execute("SELECT COUNT(*) FROM break_glass_users").fetchone()
        return int((row or [0])[0] or 0)
    finally:
        conn.close()


def is_bootstrap_required() -> bool:
    return count_break_glass_users(mfa_enabled_only=True) == 0


def get_pending_bootstrap_user():
    """Return the oldest break-glass user pending MFA enrollment, if any."""
    conn = sqlite3.connect(BREAK_GLASS_DB_PATH)
    try:
        row = conn.execute(
            """
            SELECT email, role, totp_secret, created_at
            FROM break_glass_users
            WHERE mfa_enabled = 0
            ORDER BY datetime(created_at) ASC, id ASC
            LIMIT 1
            """
        ).fetchone()
        if not row:
            return None
        return {
            'email': row[0],
            'role': row[1] or 'SuperAdmin',
            'totp_secret': row[2] or '',
            'created_at': row[3] or '',
        }
    finally:
        conn.close()


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def set_totp_secret(email: str, totp_secret: str, *, slot: str = 'primary', mfa_enabled: bool = False) -> bool:
    email = str(email or '').strip().lower()
    secret = str(totp_secret or '').strip()
    if not email or not secret:
        return False
    normalized_slot = 'secondary' if str(slot or '').strip().lower() == 'secondary' else 'primary'
    secret_column = 'totp_secret_secondary' if normalized_slot == 'secondary' else 'totp_secret'
    enabled_column = 'mfa_secondary_enabled' if normalized_slot == 'secondary' else 'mfa_enabled'
    conn = sqlite3.connect(BREAK_GLASS_DB_PATH)
    try:
        conn.execute(
            f"UPDATE break_glass_users SET {secret_column} = ?, {enabled_column} = ? WHERE email = ?",
            (secret, 1 if mfa_enabled else 0, email)
        )
        conn.commit()
        return True
    finally:
        conn.close()


def enable_mfa(email: str, *, slot: str = 'primary') -> bool:
    email = str(email or '').strip().lower()
    if not email:
        return False
    normalized_slot = 'secondary' if str(slot or '').strip().lower() == 'secondary' else 'primary'
    enabled_column = 'mfa_secondary_enabled' if normalized_slot == 'secondary' else 'mfa_enabled'
    conn = sqlite3.connect(BREAK_GLASS_DB_PATH)
    try:
        conn.execute(
            f"UPDATE break_glass_users SET {enabled_column} = 1 WHERE email = ?",
            (email,)
        )
        conn.commit()
        return True
    finally:
        conn.close()


def clear_totp_secret(email: str, *, slot: str = 'secondary') -> bool:
    email = str(email or '').strip().lower()
    if not email:
        return False
    normalized_slot = 'secondary' if str(slot or '').strip().lower() == 'secondary' else 'primary'
    secret_column = 'totp_secret_secondary' if normalized_slot == 'secondary' else 'totp_secret'
    enabled_column = 'mfa_secondary_enabled' if normalized_slot == 'secondary' else 'mfa_enabled'
    conn = sqlite3.connect(BREAK_GLASS_DB_PATH)
    try:
        conn.execute(
            f"UPDATE break_glass_users SET {secret_column} = NULL, {enabled_column} = 0 WHERE email = ?",
            (email,)
        )
        conn.commit()
        return True
    finally:
        conn.close()


def verify_totp_code(email: str, code: str, *, allow_pending: bool = False) -> bool:
    user = get_user_by_email(email)
    if not user:
        return False
    otp = str(code or '').strip().replace(' ', '')
    if len(otp) != 6 or not otp.isdigit():
        return False
    candidates = []
    primary_secret = str(user.get('totp_secret') or '').strip()
    secondary_secret = str(user.get('totp_secret_secondary') or '').strip()
    if primary_secret and (allow_pending or bool(user.get('mfa_enabled'))):
        candidates.append(primary_secret)
    if secondary_secret and bool(user.get('mfa_secondary_enabled')):
        candidates.append(secondary_secret)
    for secret in candidates:
        try:
            if pyotp.TOTP(secret).verify(otp, valid_window=1):
                return True
        except Exception:
            continue
    return False


def update_last_login(email: str) -> bool:
    email = str(email or '').strip().lower()
    if not email:
        return False
    conn = sqlite3.connect(BREAK_GLASS_DB_PATH)
    try:
        conn.execute(
            "UPDATE break_glass_users SET last_login_at = ? WHERE email = ?",
            (datetime.utcnow().isoformat(timespec='seconds'), email)
        )
        conn.commit()
        return True
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
    return {
        'email': user['email'],
        'role': user['role'],
        'needs_password_upgrade': _needs_rehash(user['password_hash']),
        'mfa_enabled': bool(user.get('mfa_enabled')),
        'totp_secret': user.get('totp_secret') or '',
        'totp_secret_secondary': user.get('totp_secret_secondary') or '',
        'mfa_secondary_enabled': bool(user.get('mfa_secondary_enabled')),
    }


def upgrade_password_hash(email: str, password: str) -> bool:
    """Upgrade a verified legacy password hash to the current PBKDF2 format."""
    email = str(email or '').strip().lower()
    if not email or not password:
        return False
    password_hash, salt = _hash_password(password)
    conn = sqlite3.connect(BREAK_GLASS_DB_PATH)
    try:
        conn.execute(
            "UPDATE break_glass_users SET password_hash = ?, salt = ? WHERE email = ?",
            (password_hash, salt, email)
        )
        conn.commit()
        return True
    finally:
        conn.close()
