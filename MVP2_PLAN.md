# MVP 2 — Database Access Security & Roles

**Status:** Plan ready for implementation  
**Prerequisite:** MVP 1 (partially implemented)  
**Focus:** Secure database access with predefined roles — no credentials to users, backend-enforced SQL rules

---

## MVP 1 — What's Already Done (Parked for Now)

| Component | Status | Notes |
|-----------|--------|-------|
| Cloud access (EC2, S3, instances) | ✅ Implemented | PAM/JIT for AWS resources |
| Terminal / SSH access | ✅ Implemented | WebSocket terminal |
| JIT Web UI | ✅ Implemented | Login, sidebar, requests, dashboard |
| Approval flow | ✅ Implemented | Request → approve → grant |
| Database request flow | ⚠️ Partial | Request, approve, execute — but credentials exposed |
| Database AI chat | ✅ Implemented | Advisory only (permissions help) |
| Vault integration | ⚠️ Partial | Creates creds, but returns password to user |

**MVP 1 is parked.** We focus only on database access in MVP 2.

---

## MVP 2 — Scope

### In Scope
- Database access only (request → approve → run queries)
- Remove credential exposure (no password to user)
- Backend fetches credentials; frontend never sees them
- SQL enforcement by role (Read-only, Limited Write, Full Write, Admin)
- Basic audit logging
- Predefined JIT roles for DB access

### Out of Scope (MVP 2)
- Cloud access changes (EC2, S3, etc.)
- Separate Database Access Proxy (EC2 + Vault) — Phase 2 later
- New UI redesign
- HashiCorp Vault setup from scratch

---

## Predefined JIT Roles (Database Access)

| Role ID | Role Name | Allowed SQL Operations | Approval Level |
|---------|-----------|------------------------|----------------|
| `read_only` | Read-only | SELECT, EXPLAIN | Auto / Manager |
| `read_limited_write` | Read + Limited Write | SELECT, INSERT, UPDATE, DELETE (no DDL) | Manager |
| `read_full_write` | Read + Full Write | SELECT, DML, DDL (CREATE, ALTER, DROP) | Manager + CISO |
| `admin` | Admin | All operations including GRANT, CREATE USER | CISO + DBA |

### SQL Operations by Role

| Operation | read_only | read_limited_write | read_full_write | admin |
|-----------|-----------|--------------------|-----------------|-------|
| SELECT | ✅ | ✅ | ✅ | ✅ |
| EXPLAIN | ✅ | ✅ | ✅ | ✅ |
| INSERT | ❌ | ✅ | ✅ | ✅ |
| UPDATE | ❌ | ✅ | ✅ | ✅ |
| DELETE | ❌ | ✅ | ✅ | ✅ |
| TRUNCATE | ❌ | ❌ | ✅ | ✅ |
| CREATE TABLE | ❌ | ❌ | ✅ | ✅ |
| ALTER TABLE | ❌ | ❌ | ✅ | ✅ |
| DROP TABLE | ❌ | ❌ | ✅ | ✅ |
| CREATE USER | ❌ | ❌ | ❌ | ✅ |
| GRANT / REVOKE | ❌ | ❌ | ❌ | ✅ |

---

## MVP 2 — Implementation Phases

### Phase 2.1: Stop Credential Exposure
**Goal:** User never sees or sends DB credentials.

| Task | File(s) | What |
|------|---------|------|
| 2.1.1 | `backend/app.py` | Remove `password` from `request-access` response |
| 2.1.2 | `frontend/databases.js` | Remove password from approval alert |
| 2.1.3 | `frontend/databases.js` | Remove connect modal (username/password input) |
| 2.1.4 | `frontend/databases.js` | "Connect" = open query UI with `request_id` only; no credential fields |

**Deliverable:** User gets approval; "Connect" opens query terminal without entering credentials.

---

### Phase 2.2: Backend Fetches Credentials
**Goal:** Execute-query does not accept credentials from frontend.

| Task | File(s) | What |
|------|---------|------|
| 2.2.1 | `backend/app.py` | Change `execute-query` to accept only `request_id`, `user_email`, `query`, `db_name` |
| 2.2.2 | `backend/app.py` | Resolve host, port, username, password from `requests_db[request_id]` |
| 2.2.3 | `frontend/databases.js` | Send only `request_id`, `user_email`, `query`, `dbName` — never credentials |
| 2.2.4 | `frontend/databases.js` | Remove `dbConn` password; store only `request_id`, `db_name`, `host`, `port` for display |

**Deliverable:** Backend looks up credentials internally; frontend never has them.

---

### Phase 2.3: SQL Enforcement by Role
**Goal:** Proxy/backend enforces allowed operations per role.

| Task | File(s) | What |
|------|---------|------|
| 2.3.1 | `backend/app.py` | Store `role` in database access request (read_only, read_limited_write, etc.) |
| 2.3.2 | `backend/request-access` | Accept `role` in request; default `read_only` |
| 2.3.3 | `backend/prompt_injection_guard.py` | Extend `validate_sql_query(query, role)` — allow/block by role |
| 2.3.4 | `backend/database_manager.py` | Reject non-allowed queries before execution |
| 2.3.5 | `frontend/databases.js` | Add role selector in request form (Read-only, Limited Write, Full Write, Admin) |

**Deliverable:** Each request has a role; only allowed SQL for that role is executed.

---

### Phase 2.4: Audit Logging
**Goal:** Log every query for compliance.

| Task | File(s) | What |
|------|---------|------|
| 2.4.1 | `backend/` | Create `audit_log.py` or add to app — append-only log |
| 2.4.2 | `backend/app.py` | Log before/after execute: user_email, request_id, query, role, allowed/blocked, rows, timestamp |
| 2.4.3 | `backend/` | Log to file (e.g. `audit/db_queries.log`) or DB table |

**Deliverable:** Immutable audit trail for all DB access.

---

### Phase 2.5: UI Updates for Roles
**Goal:** User can request and see role in UI.

| Task | File(s) | What |
|------|---------|------|
| 2.5.1 | `frontend/databases.js` | Role dropdown in request form |
| 2.5.2 | `frontend/databases.js` | Show role in approved databases list |
| 2.5.3 | `frontend/index.html` | Ensure database request UI has role field |

**Deliverable:** Clear role selection and display in UI.

---

## Execution Order

```
Phase 2.1 (Credentials)  →  Phase 2.2 (Backend fetches)  →  Phase 2.3 (Roles + SQL)
         ↓                            ↓                              ↓
    Phase 2.4 (Audit) — can start after 2.2
         ↓
    Phase 2.5 (UI for roles) — can run parallel with 2.3
```

**Recommended sequence:**
1. **2.1** — Stop credential exposure
2. **2.2** — Backend fetches credentials
3. **2.3** — Role-based SQL enforcement
4. **2.4** — Audit logging
5. **2.5** — UI for roles (can overlap with 2.3)

---

## What Stays the Same

- Same UI layout (sidebar, pages, theme)
- Same login flow (admin/user)
- Same approval flow (request → approve)
- Same database discovery (RDS list, mock fallback)
- Same AI chat (advisory only)
- Cloud access (EC2, S3, etc.) — unchanged

---

## Post–MVP 2 (Future)

| Item | When | Who |
|------|------|-----|
| Database Access Proxy (EC2) | When infra ready | You: EC2, Vault, network. Me: proxy code |
| HashiCorp Vault setup | When ready | You: Vault server, DB engine. Me: config guidance |
| Table allowlist for Limited Write | Optional enhancement | Me |

---

## Summary Checklist

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 2.1 | No credentials to user | ✅ |
| 2.2 | Backend fetches creds internally | ✅ |
| 2.3 | Role-based SQL enforcement | ✅ |
| 2.4 | Audit log for all queries | ✅ |
| 2.5 | Role selector in UI | ✅ |

---

*Document version: 1.0 | Ready for implementation*

