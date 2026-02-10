# Database Access with Proxy + Vault — Learning Guide

This document teaches you the concepts as we build. Read each section before we implement it.

---

## Part 1: Why We Need a Proxy

### The Problem (Current Flow — Insecure)

```
┌─────────┐     "Here's my password"      ┌─────────┐     Connects with     ┌──────────┐
│  User   │ ──────────────────────────►  │  Flask  │ ───────────────────►  │ Database │
│(Browser)│     (credentials in request)  │ Backend │     user's creds      │ (MySQL)  │
└─────────┘                               └─────────┘                       └──────────┘
```

**Risks:**
1. **Credentials travel over the network** — even if HTTPS, they're in the request/response
2. **Frontend can be compromised** — malicious JS could steal credentials
3. **No single enforcement point** — Flask trusts whatever the client sends
4. **User could connect directly** — with creds, user could bypass our app and connect to DB from anywhere

### The Solution (Target Flow — Secure)

```
┌─────────┐     "Run this SELECT query"    ┌─────────┐     "Execute for      ┌─────────────┐     Connects with    ┌──────────┐
│  User   │ ──────────────────────────►  │  Flask  │ ──────────────────►  │   PROXY    │ ─────────────────►  │ Database │
│(Browser)│     (NO credentials ever)    │ Backend │     request_id"      │ (enforcer) │     Vault creds     │ (MySQL)  │
└─────────┘                               └─────────┘     (internal only)   └─────────────┘                    └──────────┘
                                                │                                  │
                                                │                                  │ Fetches creds
                                                │                                  ▼
                                                │                           ┌──────────┐
                                                └──────────────────────────► │  Vault   │
                                                     (stores/retrieves       │ (secrets)│
                                                      credentials)          └──────────┘
```

**Key principle:** The **Proxy** is the **ONLY** component that ever connects to the database. Users never see credentials.

---

## Part 2: What is HashiCorp Vault?

**Vault** = A secrets management tool. Think of it as a secure vault (like a bank) for passwords, API keys, DB credentials.

### Why use Vault instead of storing passwords in our DB?

| Approach | Risk |
|----------|------|
| Store password in Flask's memory/dict | Lost on restart; no audit; single point of failure |
| Store in database | DB breach = all creds leaked |
| **Vault** | Credentials generated on-demand; time-limited; revocable; audited |

### How Vault works for databases:

1. **Vault connects to your MySQL** (one-time setup) with an admin account
2. **You define a "role"** — e.g., "users with this role can get read-only access to database X"
3. **When user is approved**, we ask Vault: "Generate temporary credentials for role X"
4. **Vault creates a new DB user** (e.g., `v-root-abc123`) with SELECT-only, valid for 2 hours
5. **We use those creds** in the proxy to connect
6. **After 2 hours**, Vault revokes them automatically

**We never store the password long-term.** Vault generates it, we use it once per query (or cache in proxy memory briefly), then it expires.

---

## Part 3: What Does the Proxy Do?

The **Database Access Proxy** is a small service that:

| Responsibility | Why |
|-----------------|-----|
| **Accepts requests only from Flask** | Runs on localhost/internal network; not exposed to internet |
| **Receives: request_id, query** | Never receives credentials from the client |
| **Fetches credentials** | From Flask (Phase 1) or Vault (Phase 2) — never from user |
| **Validates SQL** | **SELECT only** — blocks INSERT, UPDATE, DELETE, DROP, etc. |
| **Executes query** | Connects to DB, runs query, returns results |
| **Logs everything** | Who, what query, when, allowed/blocked — for audit |

### Why "enforcement point"?

Even if the frontend is hacked, or someone sends a malicious request:
- They never get credentials
- They can't run `DROP TABLE` — proxy blocks it
- Every attempt is logged

**Security in depth:** We don't rely on the frontend to "not send bad queries." The proxy **enforces** it in code.

---

## Part 4: Implementation Phases

### Phase 1: Proxy as Enforcement Layer (We'll build this first)

```
User → Flask (validates request) → Proxy (enforces SELECT, executes) → DB
                                      ↑
                              Flask passes creds over localhost
                              (creds from requests_db or Vault response)
```

**Learning:** The proxy doesn't fetch from Vault yet. Flask fetches creds (from memory/Vault), passes to proxy over internal channel. Proxy's job: enforce SELECT-only, execute, log.

### Phase 2: Proxy Fetches from Vault

```
User → Flask (validates, issues token) → Proxy (validates token, fetches from Vault, executes) → DB
```

**Learning:** Proxy gets a short-lived token from Flask. Proxy uses that token to fetch creds from Vault. Credentials never touch Flask's memory.

### Phase 3: Full Zero-Trust

- Proxy in private subnet
- mTLS between Flask and Proxy
- Vault dynamic credentials with automatic rotation

---

## Part 5: SQL Enforcement — Why "SELECT Only"?

**Principle:** JIT database access is for **reading data**, not changing it.

| Query Type | Allowed? | Why |
|-------------|----------|-----|
| `SELECT * FROM users` | ✅ | Read-only, safe |
| `INSERT INTO ...` | ❌ | Modifies data |
| `UPDATE ...` | ❌ | Modifies data |
| `DELETE FROM ...` | ❌ | Destructive |
| `DROP TABLE ...` | ❌ | Destructive |
| `SELECT * INTO ...` | ❌ | Writes to another table |

**How we enforce:** Use a SQL parser (e.g., `sqlparse`) to detect the first keyword. If it's not `SELECT`, reject.

---

## Part 6: Request Flow (Step by Step)

1. **User requests access** (databases.js) → `POST /api/databases/request-access`
2. **Flask** creates request, calls Vault for creds, stores in `requests_db`, returns `request_id` (no password)
3. **User sees "Approved"** in UI — can click "Connect & Run Queries"
4. **User types query** → `POST /api/databases/execute-query` with `{ request_id, user_email, query }`
5. **Flask** validates: request exists, user matches, not expired
6. **Flask** gets creds from `requests_db`, calls **Proxy** (localhost): `POST /execute` with `{ host, port, user, password, database, query }`
7. **Proxy** validates SQL (SELECT only), connects to DB, executes, returns results
8. **Flask** returns results to user

**User never sees:** host, port, username, password.

---

## Part 7: File Structure We'll Create

```
backend/
├── app.py              # Flask — will call proxy instead of database_manager.execute_query
├── database_manager.py # Keep for create_database_user, revoke; remove execute_query from direct use
├── database_proxy.py   # NEW — proxy service (Flask app or standalone)
├── vault_manager.py    # Existing — Vault integration
└── sql_enforcer.py     # NEW — SELECT-only validation
```

---

## Quick Reference: Key Terms

| Term | Meaning |
|------|---------|
| **Vault** | HashiCorp Vault — secrets management; generates temporary DB credentials |
| **Proxy** | Database Access Proxy — only component that connects to DB; enforces rules |
| **JIT** | Just-in-Time — access granted when needed, expires automatically |
| **Zero Trust** | Never trust the client; verify everything server-side |
| **Enforcement point** | A component that blocks bad requests in code, not just UI |

---

---

## Part 8: How to Run

### 1. Start the Database Proxy (in a separate terminal)

```bash
cd backend
python database_proxy.py
# Listens on http://127.0.0.1:5002
```

### 2. Start the Flask Backend

```bash
cd backend
python app.py
# Listens on http://127.0.0.1:5000
```

### 3. Environment Variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `USE_DB_PROXY` | `true` | If `false`, Flask connects to DB directly (dev fallback) |
| `DB_PROXY_URL` | `http://127.0.0.1:5002` | Proxy URL for Flask to call |
| `DB_PROXY_PORT` | `5002` | Port for proxy to listen on |

### 4. Test the Proxy

```bash
curl http://127.0.0.1:5002/health
# Should return: {"status":"ok","service":"database-proxy"}
```

---

*Implementation complete. See `backend/database_proxy.py` and `backend/sql_enforcer.py`.*

