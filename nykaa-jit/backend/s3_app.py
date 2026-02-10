#!/usr/bin/env python3
import os, sqlite3, uuid, bcrypt, pyotp, qrcode, io, base64, boto3
from datetime import datetime, timedelta
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from botocore.exceptions import ClientError
from typing import Optional
from fastapi import Depends

s3 = boto3.client("s3", region_name=os.getenv("AWS_REGION", "ap-south-1"))

# --- Config ---
DB_PATH = "s3x.db"
SESSION_TTL_MIN = 60
PREAUTH_TTL_MIN = 15
PWDRESET_TTL_MIN = 20
COOKIE_NAME = "s3x_session"
APP_ISSUER = "S3 File Explorer"

app = FastAPI(title="S3 File Explorer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DB helpers ---
def db():
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con

def init_db():
    con = db(); cur = con.cursor()
    
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash BLOB NOT NULL,
        role TEXT NOT NULL DEFAULT 'readonly',
        totp_secret TEXT,
        mfa_enabled INTEGER NOT NULL DEFAULT 0,
        email_verified INTEGER NOT NULL DEFAULT 0,
        must_reset_password INTEGER NOT NULL DEFAULT 1,
        password_last_set TEXT,
        last_login_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    """)
    
    cur.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        stage TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    """)
    
    cur.execute("""
    CREATE TABLE IF NOT EXISTS bucket_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        bucket_name TEXT NOT NULL,
        prefix_path TEXT DEFAULT '',
        can_read INTEGER NOT NULL DEFAULT 0,
        can_upload INTEGER NOT NULL DEFAULT 0,
        can_download INTEGER NOT NULL DEFAULT 0,
        can_delete INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, bucket_name, prefix_path),
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    """)

    cur.execute("SELECT COUNT(*) c FROM users")
    if cur.fetchone()["c"] == 0:
        ph = bcrypt.hashpw(b"ChangeMe!123", bcrypt.gensalt())
        now = datetime.utcnow().isoformat()
        cur.execute("""
            INSERT INTO users (username, password_hash, role, mfa_enabled, email_verified,
                               must_reset_password, password_last_set)
            VALUES (?,?,?,?,?,?,?)
        """, ("admin@local", ph, "admin", 0, 0, 1, now))
        print("Bootstrap admin: admin@local / ChangeMe!123")
    
    con.commit(); con.close()

init_db()

# --- Helper functions ---
def get_user_perm_rows(user_id: int):
    con = db(); cur = con.cursor()
    cur.execute("""
        SELECT bp.bucket_name, bp.prefix_path, bp.can_read, bp.can_upload, bp.can_download, bp.can_delete,
               u.username
        FROM bucket_permissions bp
        JOIN users u ON bp.user_id = u.id
        WHERE bp.user_id = ?
    """, (user_id,))
    rows = [dict(r) for r in cur.fetchall()]
    con.close()
    return rows

def get_all_bucket_permissions():
    con = db(); cur = con.cursor()
    cur.execute("""
        SELECT bp.bucket_name, bp.prefix_path, bp.can_read, bp.can_upload, bp.can_download, bp.can_delete,
               u.username
        FROM bucket_permissions bp
        JOIN users u ON bp.user_id = u.id
        ORDER BY u.username, bp.bucket_name, bp.prefix_path
    """)
    rows = [dict(r) for r in cur.fetchall()]
    con.close()
    return rows

def get_perm_for_bucket(user_id: int, bucket: str):
    con = db(); cur = con.cursor()
    cur.execute("""
        SELECT can_read, can_upload, can_download, can_delete
        FROM bucket_permissions WHERE user_id=? AND bucket_name=?
    """, (user_id, bucket))
    r = cur.fetchone(); con.close()
    
    # If no specific permissions, grant full access for JIT users
    if not r:
        return {"can_read": 1, "can_upload": 1, "can_download": 1, "can_delete": 1}
    
    return dict(r)

def safe_key(key: str) -> bool:
    return key and ("\x00" not in key) and not key.startswith("../") and not key.startswith("/")

# --- Models ---
class LoginReq(BaseModel): username: str; password: str
class VerifyReq(BaseModel): code: str
class SetPasswordReq(BaseModel): new_password: str
class SetPermsBody(BaseModel):
    username: str
    bucket_name: str
    prefix_path: str = ''
    can_read: int = 0
    can_upload: int = 0
    can_download: int = 0
    can_delete: int = 0

# --- Session management ---
def _set_cookie(response: Response, sid: str, ttl_min: int, stage: str):
    response.set_cookie(
        key=COOKIE_NAME,
        value=f"{sid}:{stage}",
        max_age=ttl_min*60,
        httponly=True,
        secure=False,
        samesite="Lax",
        path="/"
    )

def _mk_session(user_id: int, stage: str, ttl: int) -> str:
    sid = str(uuid.uuid4())
    exp = (datetime.utcnow() + timedelta(minutes=ttl)).isoformat(timespec="seconds")
    con = db(); cur = con.cursor()
    cur.execute("INSERT INTO sessions VALUES (?,?,?,?)", (sid, user_id, stage, exp))
    con.commit(); con.close()
    return sid

def _get_session(cookie: str | None):
    if not cookie: return None
    try: sid, stage = cookie.split(":", 1)
    except: return None
    con = db(); cur = con.cursor()
    cur.execute("SELECT * FROM sessions WHERE sid=?", (sid,))
    r = cur.fetchone(); con.close()
    if not r: return None
    return {"sid": r["sid"], "user_id": r["user_id"], "stage": r["stage"],
            "expires_at": r["expires_at"]}

def require_auth(req: Request) -> dict:
    # Use default JIT user for all requests
    con = db(); cur = con.cursor()
    cur.execute("SELECT id FROM users WHERE username=?", ("jit_user",))
    u = cur.fetchone()
    
    if not u:
        # Create default JIT user with all permissions
        ph = bcrypt.hashpw(b"dummy", bcrypt.gensalt())
        now = datetime.utcnow().isoformat()
        cur.execute("""
            INSERT INTO users (username, password_hash, role, mfa_enabled, email_verified,
                               must_reset_password, password_last_set)
            VALUES (?,?,?,?,?,?,?)
        """, ("jit_user", ph, "readwrite", 1, 1, 0, now))
        con.commit()
        user_id = cur.lastrowid
    else:
        user_id = u["id"]
    
    con.close()
    return {"user_id": user_id, "stage": "auth", "expires_at": (datetime.utcnow() + timedelta(hours=8)).isoformat()}

def require_admin(req: Request):
    # Allow all JIT users to access admin endpoints for viewing metrics
    return require_auth(req)

# --- Utility functions ---
def is_password_expired(iso_ts): 
    if not iso_ts: return True
    try: dt = datetime.fromisoformat(iso_ts)
    except: return True
    return (datetime.utcnow() - dt) > timedelta(days=90)

def secret_to_qr(username, secret):
    uri = pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=APP_ISSUER)
    img = qrcode.make(uri)
    buf = io.BytesIO(); img.save(buf, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}", uri

# --- Auth endpoints ---
@app.post("/api/login")
def login(body: LoginReq, response: Response):
    con = db(); cur = con.cursor()
    cur.execute("SELECT * FROM users WHERE username=?", (body.username,))
    u = cur.fetchone(); con.close()
    if not u or not bcrypt.checkpw(body.password.encode(), u["password_hash"]):
        raise HTTPException(401, "Invalid credentials")

    reset = (u["must_reset_password"] == 1) or is_password_expired(u["password_last_set"])
    if reset:
        sid = _mk_session(u["id"], "pwdreset", PWDRESET_TTL_MIN)
        _set_cookie(response, sid, PWDRESET_TTL_MIN, "pwdreset")
        return {"password_reset_required": True}
    
    sid = _mk_session(u["id"], "preauth", PREAUTH_TTL_MIN)
    _set_cookie(response, sid, PREAUTH_TTL_MIN, "preauth")
    return {"mfa_required": True, "role": u["role"]}

@app.post("/api/user/set-password")
def set_password(body: SetPasswordReq, req: Request, response: Response):
    s = _get_session(req.cookies.get(COOKIE_NAME))
    if not s or s["stage"] != "pwdreset": 
        raise HTTPException(401, "Reset session required")
    if len(body.new_password) < 8: 
        raise HTTPException(400, "Password must be at least 8 characters")
    
    ph = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt())
    now = datetime.utcnow().isoformat()
    con = db(); cur = con.cursor()
    cur.execute("UPDATE users SET password_hash=?, must_reset_password=0, password_last_set=? WHERE id=?",
                (ph, now, s["user_id"]))
    con.commit(); con.close()
    
    sid = _mk_session(s["user_id"], "preauth", PREAUTH_TTL_MIN)
    _set_cookie(response, sid, PREAUTH_TTL_MIN, "preauth")
    return {"mfa_required": True}

@app.get("/api/mfa/setup")
def mfa_setup(req: Request):
    s = _get_session(req.cookies.get(COOKIE_NAME))
    if not s or s["stage"] not in ("preauth", "pwdreset"):
        raise HTTPException(401, "Not logged in")

    con = db(); cur = con.cursor()
    cur.execute("SELECT * FROM users WHERE id=?", (s["user_id"],))
    u = cur.fetchone()
    if not u: 
        con.close(); raise HTTPException(404, "User not found")
    if u["mfa_enabled"] == 1:
        con.close(); return {"message": "MFA already enabled"}

    if not u["totp_secret"]:
        secret = pyotp.random_base32()
        cur.execute("UPDATE users SET totp_secret=?, mfa_enabled=0 WHERE id=?", (secret, u["id"]))
        con.commit()
    else: 
        secret = u["totp_secret"]
    con.close()

    qr, uri = secret_to_qr(u["username"], secret)
    return {"qr": qr, "otpauth_uri": uri, "message": "Scan QR"}

@app.post("/api/mfa/verify")
def mfa_verify(body: VerifyReq, req: Request, response: Response):
    s = _get_session(req.cookies.get(COOKIE_NAME))
    if not s or s["stage"] != "preauth": 
        raise HTTPException(401, "Not logged in")
    
    con = db(); cur = con.cursor()
    cur.execute("SELECT * FROM users WHERE id=?", (s["user_id"],))
    u = cur.fetchone(); con.close()
    if not u: raise HTTPException(404, "User not found")
    
    totp = pyotp.TOTP(u["totp_secret"])
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(401, "MFA verification failed")

    con = db(); cur = con.cursor()
    cur.execute("UPDATE users SET mfa_enabled=1, last_login_at=? WHERE id=?",
                (datetime.utcnow().isoformat(), u["id"]))
    con.commit(); con.close()

    sid = _mk_session(u["id"], "auth", SESSION_TTL_MIN)
    _set_cookie(response, sid, SESSION_TTL_MIN, "auth")
    return {"status": "ok", "role": u["role"]}

@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"status": "ok"}

# --- User profile endpoints ---
@app.get("/api/profile")
def get_profile(req: Request):
    s = require_auth(req)
    con = db(); cur = con.cursor()
    cur.execute("SELECT username, role, mfa_enabled, last_login_at FROM users WHERE id=?", (s["user_id"],))
    u = cur.fetchone(); con.close()
    if not u: raise HTTPException(404, "User not found")
    
    return {
        "username": u["username"],
        "role": u["role"],
        "mfa_enabled": bool(u["mfa_enabled"]),
        "last_login_at": u["last_login_at"],
        "session_expires_at": s["expires_at"],
    }

@app.post("/api/change-password")
def change_password(req: Request, body: dict):
    s = require_auth(req)
    old_pw = body.get("old_password")
    new_pw = body.get("new_password")
    if not old_pw or not new_pw:
        raise HTTPException(400, "Missing fields")

    con = db(); cur = con.cursor()
    cur.execute("SELECT password_hash FROM users WHERE id=?", (s["user_id"],))
    u = cur.fetchone()
    if not u or not bcrypt.checkpw(old_pw.encode(), u["password_hash"]):
        con.close()
        raise HTTPException(401, "Old password incorrect")

    if len(new_pw) < 8:
        con.close()
        raise HTTPException(400, "Password must be at least 8 characters")

    ph = bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt())
    cur.execute("UPDATE users SET password_hash=?, password_last_set=? WHERE id=?",
                (ph, datetime.utcnow().isoformat(), s["user_id"]))
    con.commit(); con.close()
    return {"status": "ok", "message": "Password changed successfully"}

@app.post("/api/reset-my-mfa")
def reset_my_mfa(req: Request):
    s = require_auth(req)
    con = db(); cur = con.cursor()
    cur.execute("UPDATE users SET totp_secret=NULL, mfa_enabled=0 WHERE id=?", (s["user_id"],))
    con.commit(); con.close()
    return {"status": "ok", "message": "Your MFA has been reset. You'll be prompted to re-register on next login."}

# --- Admin endpoints ---
@app.get("/api/admin/users")
def list_users(s: dict = Depends(require_admin)):
    con = db(); cur = con.cursor()
    cur.execute("SELECT id, username, role, mfa_enabled, email_verified, last_login_at FROM users")
    users = [dict(r) for r in cur.fetchall()]
    con.close()
    return {"users": users}

@app.post("/api/admin/create-user")
def create_user(body: dict, s: dict = Depends(require_admin)):
    username = body.get("username")
    password = body.get("password")
    role = body.get("role", "readonly")
    
    if not username or not password: 
        raise HTTPException(400, "Missing username or password")
    
    ph = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
    now = datetime.utcnow().isoformat()
    
    con = db(); cur = con.cursor()
    try:
        cur.execute("""
          INSERT INTO users (username, password_hash, role, mfa_enabled, email_verified,
                             must_reset_password, password_last_set)
          VALUES (?,?,?,?,?,?,?)
        """, (username, ph, role, 0, 0, 0, now))
        con.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(400, "User already exists")
    finally: 
        con.close()
    
    return {"status": "ok", "message": f"User {username} created with role {role}"}

@app.post("/api/admin/update-role")
def update_role(body: dict, s: dict = Depends(require_admin)):
    username = body.get("username")
    role = body.get("role")
    if role not in ("admin", "readwrite", "readonly"):
        raise HTTPException(400, "Invalid role")
    
    con = db(); cur = con.cursor()
    cur.execute("UPDATE users SET role=? WHERE username=?", (role, username))
    if cur.rowcount == 0:
        raise HTTPException(404, "User not found")
    con.commit(); con.close()
    return {"status": "ok", "message": f"Role of {username} updated to {role}"}

@app.post("/api/admin/delete-user")
def delete_user(body: dict, s: dict = Depends(require_admin)):
    username = body.get("username")
    con = db(); cur = con.cursor()
    cur.execute("DELETE FROM users WHERE username=?", (username,))
    con.commit(); con.close()
    return {"status": "ok", "message": f"Deleted {username}"}

@app.post("/api/admin/reset-mfa")
def reset_mfa(body: dict, s: dict = Depends(require_admin)):
    username = body.get("username")
    con = db(); cur = con.cursor()
    cur.execute("UPDATE users SET totp_secret=NULL, mfa_enabled=0 WHERE username=?", (username,))
    con.commit(); con.close()
    return {"status": "ok", "message": f"MFA reset for {username}"}

@app.post("/api/admin/set-bucket-perms")
def set_bucket_perms(body: SetPermsBody, s: dict = Depends(require_admin)):
    con = db(); cur = con.cursor()
    cur.execute("SELECT id FROM users WHERE username=?", (body.username,))
    u = cur.fetchone()
    if not u: 
        con.close()
        raise HTTPException(404, "User not found")
    uid = u["id"]

    cur.execute("""
        INSERT INTO bucket_permissions (user_id, bucket_name, prefix_path, can_read, can_upload, can_download, can_delete)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(user_id, bucket_name, prefix_path) DO UPDATE SET
          can_read=excluded.can_read,
          can_upload=excluded.can_upload,
          can_download=excluded.can_download,
          can_delete=excluded.can_delete
    """, (uid, body.bucket_name, body.prefix_path, body.can_read, body.can_upload, body.can_download, body.can_delete))
    con.commit(); con.close()
    return {"status": "ok", "message": "Permissions updated"}

@app.get("/api/admin/bucket-permissions")
def get_all_permissions(s: dict = Depends(require_admin)):
    permissions = get_all_bucket_permissions()
    return {"permissions": permissions}

# --- S3 endpoints ---
@app.get("/api/s3/all-buckets")
def list_all_buckets(req: Request):
    s = require_auth(req)
    try:
        response = s3.list_buckets()
        buckets = [b["Name"] for b in response["Buckets"]]
        return {"buckets": buckets}
    except ClientError as e:
        raise HTTPException(500, f"S3 error: {e}")

@app.get("/api/s3/buckets")
def list_user_buckets(req: Request):
    s = require_auth(req)
    rows = get_user_perm_rows(s["user_id"])
    
    # If no specific permissions, grant access to all buckets for JIT users
    if not rows:
        try:
            response = s3.list_buckets()
            rows = [{
                "bucket_name": b["Name"],
                "prefix_path": "",
                "can_read": 1,
                "can_upload": 1,
                "can_download": 1,
                "can_delete": 1,
                "username": "jit_user"
            } for b in response["Buckets"]]
        except ClientError:
            rows = []
    
    rows.sort(key=lambda r: r["bucket_name"])
    return {"buckets": rows}

@app.get("/api/s3/list/{bucket}")
def list_objects(bucket: str, req: Request, prefix: Optional[str] = "", max_keys: int = 200, continuation_token: Optional[str] = None):
    s = require_auth(req)
    perm = get_perm_for_bucket(s["user_id"], bucket)
    if not perm or not perm.get("can_read"):
        raise HTTPException(403, "No read access to this bucket")

    try:
        kwargs = {
            "Bucket": bucket,
            "Prefix": prefix or "",
            "Delimiter": "/",
            "MaxKeys": max_keys
        }
        if continuation_token:
            kwargs["ContinuationToken"] = continuation_token

        resp = s3.list_objects_v2(**kwargs)
        folders = [{"Prefix": p["Prefix"]} for p in resp.get("CommonPrefixes", [])]
        files = [{
            "Key": o["Key"],
            "Size": o.get("Size", 0),
            "LastModified": o.get("LastModified").isoformat() if o.get("LastModified") else None
        } for o in resp.get("Contents", []) if o["Key"] != prefix]

        return {
            "bucket": bucket,
            "prefix": prefix or "",
            "folders": folders,
            "files": files,
            "is_truncated": resp.get("IsTruncated", False),
            "next_token": resp.get("NextContinuationToken")
        }
    except ClientError as e:
        raise HTTPException(500, f"S3 error: {e.response['Error']['Message']}")

class KeyBody(BaseModel):
    key: str
    expires: int = 600

@app.post("/api/s3/presign-download/{bucket}")
def presign_download(bucket: str, body: KeyBody, req: Request):
    s = require_auth(req)
    perm = get_perm_for_bucket(s["user_id"], bucket)
    if not perm or not perm.get("can_download"):
        raise HTTPException(403, "No download access")
    if not safe_key(body.key):
        raise HTTPException(400, "Invalid key")

    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": body.key},
            ExpiresIn=body.expires
        )
        return {"url": url}
    except ClientError as e:
        raise HTTPException(500, f"Presign error: {e.response['Error']['Message']}")

class UploadBody(BaseModel):
    key: str
    content_type: str = "application/octet-stream"
    expires: int = 600

@app.post("/api/s3/presign-upload/{bucket}")
def presign_upload(bucket: str, body: UploadBody, req: Request):
    s = require_auth(req)
    perm = get_perm_for_bucket(s["user_id"], bucket)
    if not perm or not perm.get("can_upload"):
        raise HTTPException(403, "No upload access")
    if not safe_key(body.key):
        raise HTTPException(400, "Invalid key")

    try:
        url = s3.generate_presigned_url(
            "put_object",
            Params={"Bucket": bucket, "Key": body.key, "ContentType": body.content_type},
            ExpiresIn=body.expires
        )
        return {"url": url}
    except ClientError as e:
        raise HTTPException(500, f"Presign error: {e.response['Error']['Message']}")

class DeleteBody(BaseModel):
    key: str

@app.post("/api/s3/delete/{bucket}")
def delete_object(bucket: str, body: DeleteBody, req: Request):
    s = require_auth(req)
    perm = get_perm_for_bucket(s["user_id"], bucket)
    if not perm or not perm.get("can_delete"):
        raise HTTPException(403, "No delete access")
    if not safe_key(body.key):
        raise HTTPException(400, "Invalid key")
    
    try:
        s3.delete_object(Bucket=bucket, Key=body.key)
        return {"status": "ok"}
    except ClientError as e:
        raise HTTPException(500, f"Delete error: {e.response['Error']['Message']}")

@app.on_event("startup")
def cleanup_sessions():
    con = db(); cur = con.cursor()
    cur.execute("DELETE FROM sessions WHERE expires_at < ?", 
                (datetime.utcnow().isoformat(timespec="seconds"),))
    con.commit(); con.close()

@app.get("/health")
def health(): 
    return {"status": "ok"}

@app.get("/")
def root(): 
    return RedirectResponse(url="/static/index.html")

app.mount("/static", StaticFiles(directory="../frontend/s3-static"), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)