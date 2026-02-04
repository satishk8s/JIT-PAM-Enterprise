# Document 3: Roadmap — Next Steps (MVP 2)

**Nykaa JIT Access Portal — Technical Documentation**  
**Document Type:** Implementation Roadmap  
**Version:** 1.0  
**Date:** February 2025  
**Audience:** Engineering, Security, Product Teams

---

## Executive Summary

This document defines the **MVP 2 roadmap** for securing database access in the Nykaa JIT Access Portal. MVP 2 focuses exclusively on database access: removing credential exposure, having the backend fetch credentials internally, enforcing role-based SQL, and adding audit logging. Cloud access (EC2, S3) remains unchanged. The target architecture aligns with security-first principles: users never see credentials, enforcement is server-side and deterministic.

---

## 1. MVP 2 Scope

### 1.1 In Scope

| Item | Description |
|------|--------------|
| Credential removal | No password returned in API; no credential input in UI |
| Backend credential resolution | Execute-query accepts only request_id, user_email, query; backend fetches creds from internal store |
| Role-based SQL enforcement | Predefined roles: Read-only, Limited Write, Full Write, Admin |
| Audit logging | Immutable log for every query |
| UI for roles | Role selector in request form; role display in approved list |

### 1.2 Out of Scope (MVP 2)

| Item | When |
|------|------|
| Database Access Proxy (EC2) | Post–MVP 2, when infrastructure ready |
| HashiCorp Vault setup | Post–MVP 2 |
| Cloud access changes | Parked |
| New UI redesign | Parked |

---

## 2. Target Architecture — After MVP 2

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    TARGET ARCHITECTURE (MVP 2)                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌──────────────┐         ┌──────────────┐         ┌──────────────────────┐   │
│   │   User       │         │   JIT Web    │         │   Flask Backend       │   │
│   │   Browser    │ ──────► │   UI         │ ──────► │   (app.py)             │   │
│   │              │  HTTPS  │              │  REST   │                       │   │
│   │  NO CREDS    │         │  NO CREDS    │   API   │  Resolves creds       │   │
│   │  IN BROWSER  │         │  SENT        │         │  from requests_db      │   │
│   └──────────────┘         └──────────────┘         └──────────┬───────────┘   │
│                                                                  │                │
│                                                                  │ Internal only  │
│                                                                  ▼                │
│                                                       ┌──────────────────────┐   │
│                                                       │  database_manager     │   │
│                                                       │  + role enforcement   │   │
│                                                       │  + audit_log          │   │
│                                                       └──────────┬───────────┘   │
│                                                                  │                │
│                                                                  ▼                │
│                                                       ┌──────────────────────┐   │
│                                                       │  RDS / MySQL         │   │
│                                                       └──────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Target Flow — After MVP 2

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────┐
│  User   │     │  JIT Web    │     │  Flask      │     │  RDS     │
│         │     │  UI         │     │  Backend    │     │  MySQL   │
└────┬────┘     └──────┬──────┘     └──────┬──────┘     └────┬─────┘
     │                 │                   │                 │
     │ 1. Request     │                   │                 │
     │    Access      │                   │                 │
     │   (with role)  │                   │                 │
     │───────────────►│                   │                 │
     │                │ 2. POST          │                 │
     │                │  request-access   │                 │
     │                │  (NO password     │                 │
     │                │   in response)    │                 │
     │                │─────────────────►│                 │
     │                │ 3. { status,      │                 │
     │                │  request_id }     │                 │
     │                │◄─────────────────│                 │
     │ 4. "Approved"  │                   │                 │
     │  (no password) │                   │                 │
     │◄───────────────│                   │                 │
     │                │                   │                 │
     │ 5. Connect     │                   │                 │
     │  (no creds)    │                   │                 │
     │───────────────►│                   │                 │
     │                │ 6. POST         │                 │
     │                │  execute-query   │                 │
     │                │  { request_id,   │                 │
     │                │  user_email,   │                 │
     │                │  query }        │                 │
     │                │  NO creds       │                 │
     │                │─────────────────►│                 │
     │                │                   │ 7. Lookup      │
     │                │                   │  creds from    │
     │                │                   │  requests_db   │
     │                │                   │ 8. Validate    │
     │                │                   │  role + SQL    │
     │                │                   │ 9. Execute     │
     │                │                   │────────────────►│
     │                │                   │◄────────────────│
     │                │ 10. Results      │                 │
     │                │ + audit log      │                 │
     │                │◄─────────────────│                 │
     │ 11. Results    │                   │                 │
     │◄───────────────│                   │                 │
     │                │                   │                 │
```

---

## 3. Predefined JIT Roles (Database Access)

### 3.1 Role Definitions

| Role ID | Role Name | Allowed SQL Operations | Approval Level |
|---------|-----------|------------------------|----------------|
| `read_only` | Read-only | SELECT, EXPLAIN | Auto / Manager |
| `read_limited_write` | Read + Limited Write | SELECT, INSERT, UPDATE, DELETE (no DDL) | Manager |
| `read_full_write` | Read + Full Write | SELECT, DML, DDL (CREATE, ALTER, DROP, TRUNCATE) | Manager + CISO |
| `admin` | Admin | All operations including GRANT, CREATE USER | CISO + DBA |

### 3.2 SQL Operations by Role

| Operation | read_only | read_limited_write | read_full_write | admin |
|-----------|-----------|-------------------|-----------------|-------|
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

## 4. MVP 2 Implementation Phases

### Phase 2.1: Stop Credential Exposure

**Goal:** User never sees or sends DB credentials.

| Task ID | File(s) | Change |
|---------|---------|--------|
| 2.1.1 | `backend/app.py` | Remove `password` from `request-access` response |
| 2.1.2 | `frontend/databases.js` | Remove password from approval alert |
| 2.1.3 | `frontend/databases.js` | Remove connect modal (username/password input) |
| 2.1.4 | `frontend/databases.js` | "Connect" opens query UI with `request_id` only; no credential fields |

**Deliverable:** User gets approval; "Connect" opens query terminal without entering credentials.

**Flow After 2.1:**

```
    Approval Response (BEFORE)              Approval Response (AFTER)
    ─────────────────────────              ─────────────────────────
    {                                       {
      status: "approved",                      status: "approved",
      request_id: "uuid",                     request_id: "uuid",
      password: "abc123",   ← REMOVE          message: "Access granted"
      message: "..."                          // NO password
    }                                       }
```

---

### Phase 2.2: Backend Fetches Credentials

**Goal:** Execute-query does not accept credentials from frontend.

| Task ID | File(s) | Change |
|---------|---------|--------|
| 2.2.1 | `backend/app.py` | Change `execute-query` to accept only `request_id`, `user_email`, `query`, `db_name` |
| 2.2.2 | `backend/app.py` | Resolve host, port, username, password from `requests_db[request_id]` |
| 2.2.3 | `frontend/databases.js` | Send only `request_id`, `user_email`, `query`, `dbName` |
| 2.2.4 | `frontend/databases.js` | Remove `dbConn.password`; store only `request_id`, `db_name`, `host`, `port` for display |

**Deliverable:** Backend looks up credentials internally; frontend never has them.

**Execute-Query Request (BEFORE vs AFTER):**

```
    BEFORE (client sends creds)              AFTER (backend resolves)
    ─────────────────────────              ───────────────────────
    {                                       {
      request_id,                             request_id,
      user_email,                             user_email,
      host,         ← REMOVE                  query,
      port,         ← REMOVE                 dbName
      username,     ← REMOVE                }
      password,     ← REMOVE
      query,
      dbName
    }
```

---

### Phase 2.3: SQL Enforcement by Role

**Goal:** Backend enforces allowed operations per role.

| Task ID | File(s) | Change |
|---------|---------|--------|
| 2.3.1 | `backend/app.py` | Store `role` in database access request |
| 2.3.2 | `backend/app.py` | Accept `role` in `request-access`; default `read_only` |
| 2.3.3 | `backend/prompt_injection_guard.py` | Extend `validate_sql_query(query, role)` — allow/block by role |
| 2.3.4 | `backend/database_manager.py` | Reject non-allowed queries before execution |
| 2.3.5 | `frontend/databases.js` | Add role selector in request form |

**Deliverable:** Each request has a role; only allowed SQL for that role is executed.

---

### Phase 2.4: Audit Logging

**Goal:** Log every query for compliance.

| Task ID | File(s) | Change |
|---------|---------|--------|
| 2.4.1 | `backend/` | Create `audit_log.py` or add to app |
| 2.4.2 | `backend/app.py` | Log before/after execute: user_email, request_id, query, role, allowed/blocked, rows, timestamp |
| 2.4.3 | `backend/` | Log to file (e.g. `audit/db_queries.log`) or DB table |

**Audit Log Entry Format:**

```
timestamp | user_email | request_id | role | query_hash | allowed | rows_returned | error
```

---

### Phase 2.5: UI Updates for Roles

**Goal:** User can request and see role in UI.

| Task ID | File(s) | Change |
|---------|---------|--------|
| 2.5.1 | `frontend/databases.js` | Role dropdown in request form |
| 2.5.2 | `frontend/databases.js` | Show role in approved databases list |
| 2.5.3 | `frontend/index.html` | Ensure database request UI has role field |

---

## 5. Execution Order

```
    Phase 2.1: Stop Credential Exposure
                    │
                    ▼
    Phase 2.2: Backend Fetches Credentials
                    │
                    ├──────────────────────────────────┐
                    ▼                                  ▼
    Phase 2.3: SQL Enforcement by Role      Phase 2.4: Audit Logging
                    │                                  │
                    └────────────────┬─────────────────┘
                                     ▼
                    Phase 2.5: UI Updates for Roles
                    (can run parallel with 2.3)
```

**Recommended sequence:**
1. **2.1** — Stop credential exposure
2. **2.2** — Backend fetches credentials
3. **2.3** — Role-based SQL enforcement
4. **2.4** — Audit logging
5. **2.5** — UI for roles (can overlap with 2.3)

---

## 6. Post–MVP 2: Database Access Proxy (Future)

### 6.1 Target Architecture with Proxy

```
    User → JIT Web UI → Approval Engine → Credential Broker (Vault)
                                              │
                                              ▼
                                    DATABASE ACCESS PROXY
                                    (EC2, private subnet)
                                              │
                                              ▼
                                         Database
```

### 6.2 Proxy Responsibilities

| Responsibility | Description |
|----------------|-------------|
| Authenticate | Validate JWT/session from JIT backend |
| Fetch creds | Get temp credentials from Vault (never from client) |
| Enforce SQL | Only allowed operations per role |
| Execute | Connect to DB, run query, return results |
| Log | Immutable audit trail |

### 6.3 Prerequisites (Your Side)

| Item | Description |
|------|--------------|
| EC2 | Instance in private subnet, reachable from JIT backend |
| Vault | HashiCorp Vault with Database Secrets Engine |
| Network | Security groups: backend → proxy → RDS |
| DB user for Vault | `vault_admin` with CREATE USER, GRANT, DROP USER |

---

## 7. Success Criteria Checklist

| Criterion | Status |
|-----------|--------|
| Users never receive DB credentials | ⬜ |
| Backend fetches credentials internally | ⬜ |
| Execute-query accepts only request_id, user_email, query, db_name | ⬜ |
| Role-based SQL enforcement | ⬜ |
| Audit log for all queries | ⬜ |
| Role selector in UI | ⬜ |
| With compromised frontend, DB cannot be modified | ⬜ |
| All access traceable to human identity | ⬜ |

---

## 8. What Stays the Same

- Same UI layout (sidebar, pages, theme)
- Same login flow (admin/user)
- Same approval flow (request → approve)
- Same database discovery (RDS list, mock fallback)
- Same AI chat (advisory only)
- Cloud access (EC2, S3, etc.) — unchanged

---

## 9. Document References

| Document | Purpose |
|----------|---------|
| Document 1: Current State Before | As-is assessment; security gaps |
| Document 2: Changes Implemented | What has been done to date |
| Document 3: Roadmap Next Steps | MVP 2 plan; this document |
| JIT_PAM_DATABASE_ACCESS_PLAN.md | Detailed security architecture |
| MVP2_PLAN.md | Concise implementation checklist |

---

*End of Document 3*
