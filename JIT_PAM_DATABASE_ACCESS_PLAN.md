# JIT + PAM Database Access System — Plan & Gap Analysis

**Document Purpose:** Assess current state vs. target security architecture and define the path to a production-ready, security-first system.

---

## Executive Summary

| Aspect | Current State | Target | Gap Severity |
|--------|---------------|--------|--------------|
| Credentials to users | **Returned in API response & shown in UI** | Never exposed | 🔴 CRITICAL |
| Database Access Proxy | **Does not exist** | Mandatory enforcement point | 🔴 CRITICAL |
| SQL enforcement | **Allows INSERT/UPDATE/DELETE** | SELECT only | 🔴 CRITICAL |
| Trust model | **Accepts creds from frontend** | Proxy fetches from Vault | 🔴 CRITICAL |
| AI role | Advisory only ✅ | Advisory only | ✅ OK |
| Audit logging | Partial | Full immutable log | 🟡 MEDIUM |

---

## 1. Current Architecture (What We Have)

```
User (Browser)
    ↓
JIT Web UI (index.html, databases.js)
    ↓  [sends: host, port, username, password, query]
Flask Backend (app.py)
    ↓  [validates request_id, expiry; calls execute_query with client-provided creds]
database_manager.execute_query()
    ↓  [connects directly to DB with provided credentials]
Database (MySQL)
```

**Vault:** Used to generate credentials on approval, but **password is returned to user** in the API response.

---

## 2. Target Architecture (What We Must Build)

```
User
    ↓
JIT Web UI (request only — no credentials, no direct DB path)
    ↓
Approval Engine (policy + human)
    ↓
Credential Broker (Vault)
    ↓
DATABASE ACCESS PROXY  ← ENFORCEMENT POINT (new component)
    ↓  [fetches creds from Vault; enforces SELECT-only; logs everything]
Database
```

**The Database Access Proxy is the ONLY component allowed to talk to the database.**

---

## 3. Critical Violations (Must Fix)

### 3.1 Credentials Exposed to Users 🔴

| Location | Issue |
|---------|-------|
| `app.py` ~3721 | `return jsonify({..., 'password': password if status == 'approved' else None})` |
| `databases.js` ~279 | `alert(\`...Password: ${data.password}...\`)` |
| `databases.js` ~325–366 | Connect modal asks user to enter "credentials from approval email" |
| `databases.js` ~435 | `body: JSON.stringify({...window.dbConn, query})` — sends password with every query |

**Principle violated:** *"No DB credentials exposed to users"*

**Fix:**  
- Never return `password` in any API response.  
- Proxy fetches credentials from Vault using `request_id` + backend-issued identity.  
- Frontend never sees or sends credentials.

---

### 3.2 No Database Access Proxy 🔴

**Current:** Flask app connects directly to the database using credentials from the request.

**Target:** A dedicated **Database Access Proxy** that:
- Runs in a private network (VPC / private subnet)
- Speaks native DB protocol (Postgres/MySQL)
- Is the **only** component that connects to the database
- Fetches credentials from Vault dynamically
- Authenticates users via backend-issued identity (JWT / mTLS)
- Enforces read-only (SELECT only) in code
- Logs every query and decision

**Fix:** Implement a new proxy service (e.g., Python/Go) that:
1. Accepts authenticated requests (JWT/session bound to `request_id` + TTL)
2. Looks up approval in backend, fetches creds from Vault
3. Connects to DB, executes only allowed queries, returns results
4. Never returns credentials to the caller

---

### 3.3 SQL Enforcement Is Insufficient 🔴

| Current `validate_sql_query` | Blocks | Missing |
|------------------------------|--------|---------|
| DROP DATABASE, DROP USER | ✅ | INSERT, UPDATE, DELETE |
| GRANT ALL, REVOKE ALL | ✅ | TRUNCATE, CREATE, ALTER, DROP TABLE |
| CREATE USER, ALTER USER | ✅ | CALL, EXEC, EXECUTE |
| SHUTDOWN, SYSTEM | ✅ | SELECT INTO, EXPLAIN ANALYZE |
| | | COPY, LOAD, EXPORT |

**`database_manager.execute_query`:**  
- If query does not start with `SELECT`, it **executes and commits** (lines 54–63).  
- No server-side enforcement of read-only.

**Fix:**  
- Proxy must **parse SQL deterministically** (no AI).  
- Allow **only** `SELECT`.  
- Block: INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, CALL, EXEC, SELECT INTO, EXPLAIN ANALYZE, COPY, LOAD, EXPORT.  
- Enforce: max rows, max execution time, max result size.

---

### 3.4 Trusting Request Parameters 🔴

**Current:** `execute_database_query` uses `host`, `port`, `username`, `password` from the request body.

**Risk:** Compromised frontend could send:
- Different host (e.g., prod DB)
- Different credentials
- Arbitrary connection parameters

**Fix:**  
- Proxy must **never** trust connection parameters from the client.  
- Proxy resolves `(request_id, user_identity)` → approval record → DB identifier.  
- Proxy fetches credentials from Vault for that DB.  
- Host/port come from approval metadata, not from the user.

---

## 4. What Is Acceptable (Keep / Align)

### 4.1 AI Usage ✅

- `database_ai_chat` is advisory (explains permissions, suggests access).  
- AI does not approve, deny, or execute queries.  
- Aligns with: *"AI can assist (explain, summarize, flag)"*.

### 4.2 Approval Flow ✅

- Request → approval (policy + human) → status stored.  
- Time-based expiry and cleanup exist.  
- Align with target approval engine.

### 4.3 Vault Integration ✅

- `VaultManager.create_database_credentials` exists.  
- Must be used **only** by the proxy; credentials must never leave the proxy.

---

## 5. Anti-Patterns Present (Must Remove)

| Anti-Pattern | Present? | Location |
|--------------|----------|----------|
| Frontend query validation | Partial | `databases.js` — no real validation; backend is source of truth |
| AI checks/blocks queries | No | AI is advisory only ✅ |
| Client-side restrictions | Yes | Connect modal, query UI — UX only, not enforcement |
| Trusting request parameters | Yes | `execute_database_query` uses client creds |
| Returning DB credentials | Yes | `password` in `request-access` response |
| Terminal-based DB access | Partial | Web "query terminal" — acceptable if it talks to proxy only |

---

## 6. Implementation Roadmap

### Phase 1: Stop Credential Exposure (Immediate)

1. **Backend**
   - Remove `password` from `request-access` response.
   - Store credentials only server-side (or in Vault); never return to client.
   - Add `session_token` or similar for proxy auth (see Phase 2).

2. **Frontend**
   - Remove password from alerts and any UI.
   - Remove connect modal that asks for credentials.
   - "Connect" = request a proxy session; no credential input.

3. **Execute-query**
   - Stop accepting `username`, `password`, `host`, `port` from the client.
   - Accept only: `request_id`, `user_email` (or JWT), `query`.
   - Backend resolves DB and fetches creds from Vault (or internal store) for that `request_id`.

### Phase 2: Introduce Database Access Proxy

1. **Proxy service**
   - New process (e.g., `database_proxy.py` or separate service).
   - Listens on internal network only.
   - Endpoints: `POST /execute` (or similar) with `session_token` + `query`.

2. **Auth**
   - Backend issues short-lived token (JWT) bound to `request_id`, `user_email`, TTL.
   - Proxy validates token, checks approval, fetches creds from Vault.

3. **Enforcement**
   - Fetch creds from Vault for the approved DB.
   - Parse SQL: allow only `SELECT`.
   - Enforce max rows, timeout, result size.
   - Log: user, query, decision, timestamp, row count.

4. **Flask app**
   - `execute-query` becomes a thin layer: validate request, issue/validate token, forward to proxy.
   - Or: Flask calls proxy internally; proxy connects to DB.

### Phase 3: Harden SQL Enforcement

1. **Deterministic SQL parser**
   - Use a proper SQL parser (e.g., `sqlparse`, `sqlglot`) or a strict allowlist.
   - Allow only `SELECT` (no subqueries that write, no `SELECT INTO`).
   - Block all write and DDL keywords.

2. **Resource limits**
   - Max rows (e.g., 10,000).
   - Query timeout (e.g., 30s).
   - Max result size (e.g., 10 MB).

### Phase 4: Audit & Compliance

1. **Immutable audit log**
   - Every query: user, query text, allowed/blocked, timestamp, rows returned.
   - Store in append-only store (e.g., file, DB table, or external audit service).

2. **Session lifecycle**
   - Kill sessions on TTL expiry, policy violation, approval revocation.
   - Background job to revoke Vault leases and DB users.

---

## 7. Success Criteria Checklist

The system is correct only if:

- [ ] Users never receive DB credentials.
- [ ] A Database Access Proxy exists and is the only component that connects to the DB.
- [ ] Proxy fetches credentials from Vault; never from the client.
- [ ] Proxy enforces SELECT-only via deterministic parsing.
- [ ] Proxy enforces max rows, timeout, and result size.
- [ ] User identity is bound to approval and TTL (JWT/session).
- [ ] All access is logged (user, query, decision, timestamp).
- [ ] With compromised frontend, backend, or prompt-injected AI, the database still cannot be modified.
- [ ] All access is traceable to a human identity.

---

## 8. Design Mindset (Reminder)

| Principle | Meaning |
|-----------|---------|
| Security first | No feature at the cost of security. |
| Deterministic over intelligent | Code rules, not AI judgment. |
| Enforcement over explanation | Block in code; explain in UI. |
| Zero trust over convenience | Assume frontend and APIs can be abused. |

---

## 9. Quick Reference: Current vs Target

| Component | Current | Target |
|-----------|---------|--------|
| User → DB path | User has creds; frontend sends to backend | User has no creds; proxy fetches from Vault |
| Query execution | Flask + `database_manager` | Database Access Proxy only |
| Credential source | Client request + API response | Vault (proxy only) |
| SQL enforcement | Regex + `validate_sql_query`; `execute_query` allows writes | Deterministic parser; SELECT only |
| Identity | `user_email` + `request_id` in body | JWT/session bound to approval + TTL |
| Audit | Partial | Full, immutable |

---

*Document version: 1.0 | Last updated: 2025-02-03*
