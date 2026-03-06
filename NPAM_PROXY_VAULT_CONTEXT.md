# NPAM Proxy + Vault Context (Persistent Handover)

Last updated: 2026-03-06
Scope lock: PAM + Proxy only. Direct DB access is out of scope for now.

## 1) Current Decision

- All database access control is enforced through NPAM request flow and proxy path.
- Org-level controls will block direct database access outside proxy.
- Future direct-client controls can be added later, but current design assumes proxy-mediated execution.

## 2) Current Runtime Components

- Backend API: `backend/app.py`
- SQL proxy service: `backend/database_proxy.py`
- SQL rule checks (current regex model): `backend/sql_enforcer.py`
- Vault dynamic DB user/session creation: `backend/vault_manager.py`
- DB execution helper: `backend/database_manager.py`
- Persistent store (SQLite): `backend/persistence.py`
- DB query audit logging: `backend/audit_log.py`

## 3) What Is Already Implemented

1. RDS tag-based request gating for `Data_Classification`.
2. Guardrails to block write requests on configured account+instance unless user/group exception exists.
3. Approval flow for DB requests before activation.
4. Vault dynamic credential flow with operation-based least-privilege mapping.
5. IAM Identity Center permission set assignment for IAM DB auth flow.
6. Permission set cleanup path on revoke/expiry/delete.
7. Query execution audit logging to file + SQLite.

## 4) Important Current Limitations

1. Request model is still instance/database oriented. No schema/table/column request object yet.
2. SQL enforcement is regex/keyword based, not AST based.
3. No robust join-table containment checks for indirect access patterns.
4. No Aurva DSPM integration yet.
5. No classification cache table yet (`pam_data_classification` not present).
6. Vault grants for MySQL are still mostly database scope (`db.*`), not table-specific grants.

## 5) Target Design (Next)

## 5.1 Request model extension

Add to DB access request payload:

- `schema`
- `table`
- `columns` (optional)
- `query_type`
- `duration_hours`
- `ticket_or_reason`

## 5.2 Aurva integration

- New backend client for Aurva classification APIs.
- Resolve classification for `(instance, database, schema, table)`.
- Fail closed for unknown/failed classification on production-sensitive paths.

## 5.3 Classification cache

Add SQLite table:

- `pam_data_classification(instance, database, schema, table, classification, sensitivity, last_scan_time, source_hash, updated_at)`

Behavior:

- Read-through cache on request submit.
- Background refresh every 6-12 hours.
- Manual refresh endpoint for admin if needed.

## 5.4 Policy decision engine

Implement deterministic matrix:

- NON-PII: SELECT auto / writes manager approval
- PII: SELECT manager+security / writes security+data-owner
- HIGH sensitivity: any query security+data-governance

## 5.5 Proxy inspection hardening

Replace regex-only model with SQL AST parsing:

- Deny `SELECT *` where policy disallows wildcard reads
- Deny disallowed tables in FROM/JOIN/CTE/subquery
- Deny exfil primitives (`INTO OUTFILE`, `COPY ... TO`, dump-like patterns)
- Enforce row limits for broad read queries

## 5.6 Vault least privilege hardening

Generate request-scoped grants at table level (and column level where supported).
This is defense in depth if proxy checks miss anything.

## 6) Non-Negotiable Security Rules

1. Deny by default on policy ambiguity.
2. Do not grant privileges broader than request scope.
3. Do not expose real DB endpoints to browser clients.
4. Keep activation and decision logs with request and session IDs.
5. Keep all cleanup idempotent (safe retries for revoke/delete flows).

## 7) What Must Be Collected From Aurva Team

1. API auth mechanism and token lifecycle.
2. Classification endpoint contract and filters.
3. Taxonomy and precedence (`PII`, `Sensitive`, `Confidential`, `HIGH`, etc.).
4. Freshness/SLA guarantees and `last_scan_time` semantics.
5. Stable object keys for mapping instance/db/schema/table.
6. Error model and retry/backoff expectations.
7. Non-prod endpoint + sample responses for integration testing.

## 8) New Chat Quick Start

If a new Codex session starts, read this file first, then inspect:

1. `backend/app.py` (DB request + approval + activation + cleanup)
2. `backend/database_proxy.py` (query execution enforcement point)
3. `backend/sql_enforcer.py` (current enforcement baseline)
4. `backend/vault_manager.py` (grant and dynamic user creation)
5. `backend/persistence.py` (SQLite schema and extension points)

Additional context docs:

1. `DB_PROXY_LAB_CODE_REVIEW.md` (review of external `db-proxy-lab` files: `proxy.py`, `sql_guard.py`, `vault_client.py`, and Vault policy)
