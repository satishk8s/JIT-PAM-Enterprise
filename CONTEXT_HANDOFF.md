# Project Context Handoff

Last updated: 2026-03-16 14:34:00 IST

This file is the working handoff for future chats. Update it after each material implementation so the next session can resume from repository state instead of rebuilding context manually.

## Product Goal

Build an enterprise-grade PAM platform with:

- SSO-first workforce access
- controlled break-glass access
- just-in-time privileged access workflows
- database access through Vault and IAM-based database authentication
- Docker/ECR-based deployment

## Current Priority

Current implementation focus is database access on Vault-issued dynamic credentials first, with IAM-based database authentication to follow.

Target flow:

1. User submits a database access request from the frontend.
2. Backend stores the request and runs approval logic.
3. After approval, backend activates access.
4. Vault creates the time-bound DB user/session when password-based flow is used.
5. User sees the issued DB username/login guidance in the application after approval/activation.
6. IAM DB auth and RDS Proxy are follow-on phases after the current password-based flow is verified end to end.

At the moment, the request-placement path and the first approval-engine pass are hardened. The next deep implementation area is the approval-to-activation chain, notificationing, and Vault/IAM lifecycle review.

Parallel product work now also includes:

- admin-managed documentation/support settings
- user home/history views based only on real backend data
- break-glass self-service profile management
- future DSPM-driven database classification and guardrail exceptions
- reusable infrastructure runbooks, including Vault setup

## Active Architecture

### Frontend

Authoritative active request flows:

- cloud access: `frontend/app.js`
- database access: `frontend/databases.js`

Legacy/older flows still exist but are being brought into alignment instead of trusted as primary architecture:

- `frontend/requests-chat.js`
- `frontend/structured-requests.js`
- `frontend/wizard.js`

### Backend

Primary backend entry point:

- `backend/app.py`

Legacy entry points were neutralized to avoid accidentally running weaker demo variants:

- `backend/app_clean.py`
- `backend/production_app.py`

### Deployment

- Docker build: root `Dockerfile`
- Backend runtime storage:
  - `backend/data/npamx.db`
  - `backend/data/npamx_break_glass.db`
- Vault runbook:
  - `docs/VAULT_RAFT_SETUP.md`
- backend Vault runtime now supports AppRole secret lookup from Secrets Manager via `VAULT_SECRET_ID_SECRET_NAME_*`
- backend Vault runtime now supports `VAULT_CACERT_*` so localhost or non-trusted hosts can connect to the self-signed Vault cluster
- frontend bootstrap now treats backend-served localhost on port `5001` as same-origin `/api`, so local end-to-end testing can run without patching `window.API_BASE`
- backend Vault DB connection name is engine-aware (`nonprod-mysql`, `nonprod-postgres`)
- temporary nonprod direct DB endpoint fallback is supported via `DB_CONNECT_ALLOW_DIRECT_NONPROD=true` for end-to-end UI testing before RDS Proxy
- current in-app DB query executor is MySQL-only; PostgreSQL request/approval/activation/credential retrieval can be tested, but PostgreSQL PAM terminal/query execution still needs implementation
- database request UI `Guided` mode is now feature-flagged off by default and visible AI wording was removed from the database access page
- database access page approval matrix text was updated to the current prod/non-prod PAM workflow expectations
- admin AWS Identity Center hierarchy rendering was reworked into a cleaner tree/card layout; environment tag save still uses the live backend endpoints
- policies page was simplified into a runtime-governance view instead of duplicating directory lists
- PAM role model is now moving around fixed roles: `Employee`, `Engineer`, `Admin`, `SuperAdmin`
- frontend and backend now distinguish engineer vs full admin more explicitly:
  - `Engineer` can access the admin console but not PAM admin assignment, features, or guardrails
  - `Admin`/`SuperAdmin` retain full governance controls
  - SSO users still do not see break-glass password/MFA management
- local Docker image built successfully as `npamx:v1.1`

## Current Authentication Model

### Workforce Users

- use IdP login only
- SAML/SSO-backed session
- no password login on the main user path

### Break-glass / Local Admin

- separate password login path
- backend-stored account
- mandatory TOTP MFA
- first-time bootstrap for initial `SuperAdmin`
- lockout and throttling enabled

## Authoritative Request Endpoints

### Cloud / Generic Access

- `POST /api/request-access`

### Database Access

- `POST /api/databases/request-access`
- `GET /api/databases/requests`
- `GET /api/databases/request/<request_id>/credentials`
- `POST /api/databases/request/<request_id>/activate`
- `GET /api/admin/approval-workflows`
- `POST /api/admin/approval-workflows`
- `DELETE /api/admin/approval-workflows/<workflow_id>`

## Important Recent Changes

### Auth and Security

- SSO-first login implemented
- restricted break-glass login implemented
- break-glass MFA bootstrap implemented
- SAML strict mode enforced
- CSRF/session/cookie hardening applied
- admin-only protection added for shared AI configuration

### Request-path Cleanup

- request submitters stopped using hardcoded `127.0.0.1:5000` in the active request flows
- active request submitters now use authenticated cookies and CSRF headers
- stale placeholder identities such as `admin@example.com`, `user@example.com`, and `user@company.com` were removed from active request creation
- database request frontend no longer silently falls back to the first account
- backend now rejects request creation when `account_id` or `db_instance_id` is missing
- global fetch protection now rewrites stale localhost API calls to same-origin deployed API routes

### Approval Workflow Status

Done:

- backend workflow storage in `backend/data/approval_workflows.json`
- admin CRUD APIs for approval workflows
- form-based workflow manager in `frontend/workflow-designer.js`
- workflow-driven database approval resolution during request creation
- stage-based approve/deny handling for database requests
- DB requests list/details now surface workflow name, approval note, pending stage, and current approvers
- approver visibility is backend-derived from authenticated session instead of browser-supplied requester email
- approval engine is intended to remain backend-owned, not split into a separate service in this phase

Not yet fully completed:

- email/SNS/SES notifications
- non-database workflow binding for cloud, storage, S3, and instance requests
- admin UX for overlapping-workflow detection and richer policy validation
- future object-scope approver resolution for manager / security / PII-specific cases

### User Experience / Admin Settings Status

Done:

- Documentation and Support header shortcuts restored as real feature-gated capabilities
- admin-managed settings API is used for documentation home URL, documentation search URL, and support email
- user Home page shows request-history blocks for databases, cloud, workloads, and storage
- user Home History page shows last-90-day request list plus approved/denied history chart
- NPAMX title and Home nav now route users back to Home
- live IST clock is shown in the authenticated header
- break-glass password and MFA management moved into `My Profile`
- break-glass users can enroll a primary and backup MFA device
- login light-theme visibility improved

Not yet fully completed:

- support/documentation search analytics
- more complete non-break-glass profile actions
- browser-tested polish pass for the new Home/Profile views

### DSPM / Guardrails Direction

Planned next for database governance:

- Aurva DSPM integration should be admin-configurable under `Admin -> Integrations`
- backend should call Aurva, not the frontend
- request evaluation should classify DB/table scope as PII or non-PII before approval routing
- `PII + prod + read` should route into approval workflow
- `PII + prod + write` should deny by default unless an admin-created time-bound guardrail exception exists
- guardrail exceptions should be stored server-side with user, account, DB, schema, table, access type, start/end, reason, and audit trail

### Database Request Creation Status

Done:

- authenticated submit path
- account validation
- database instance validation
- sanitized database targets
- safer account selection on frontend

Not yet fully completed:

- approval orchestration cleanup past the DB stage resolver
- Vault provisioning contract review
- IAM permission set lifecycle review
- post-approval credential UX verification

## Files To Read First In Future Sessions

- `backend/app.py`
- `backend/security.py`
- `backend/break_glass_db.py`
- `frontend/index.html`
- `frontend/app.js`
- `frontend/databases.js`
- `frontend/requests-chat.js`
- `frontend/structured-requests.js`
- `frontend/wizard.js`
- `docs/SECURITY_HARDENING.md`

## Next Recommended Work Order

1. Review database approval endpoints and approval-state transitions.
2. Review `_activate_database_access_request()` and the Vault/IAM branches.
3. Add approval notifications and pending-approvals inbox behavior.
4. Bind the same approval-engine model to cloud/storage/instance request types.
5. Add automated tests around auth, request creation, approvals, and database credential access.
6. Add PostgreSQL query execution support in the PAM terminal path if interactive PG sessions are required in-app.

## Operational Notes

- User wants no repeated context rebuild in future chats.
- User wants enterprise-grade, secure, fast behavior over demo shortcuts.
- User may also use Claude CLI with Opus 4.6 to inspect backend code in parallel.

## Update Rule

After every material change, append:

- date
- what was implemented
- affected files
- next logical step

## Change Log

### 2026-03-14

- Hardened login, break-glass, MFA bootstrap, SAML, Docker baseline, and request-creation flows.
- Current state is safe enough to continue into database approval and activation work without relying on demo request paths.
- Added backend-managed approval workflows and bound database request approvals to the workflow engine.

### 2026-03-16

- Added backend Vault AppRole secret lookup from Secrets Manager and engine-aware Vault DB connection selection in `backend/vault_manager.py`.
- Added temporary direct nonprod DB endpoint fallback in `backend/app.py` so end-to-end UI testing can proceed before RDS Proxy exists.
- Removed `FLUSH PRIVILEGES` from backend-generated MySQL Vault role SQL because the least-privilege Vault management user does not need it.
- Updated Vault runbook and backend env example to reflect current nonprod runtime values and the RDS Proxy deferral.
- Next step: set the backend runtime envs, build the image, deploy it, and test the MySQL request -> approval -> activation path through the UI.
- Replaced prompt-based DB approvals with server-validated approver actions and approval summaries in the UI.
- Removed browser-trusted `user_email` checks from DB request listing, details, activation, credential retrieval, bulk delete, and terminal execution.
- Added centralized fetch rewriting so older admin tabs using localhost API paths still route through same-origin session and CSRF protection.
- Added admin-managed documentation/support settings, user Home history views, live IST header clock, and real break-glass profile management with backup MFA support.
- Remediated critical/high security findings before `v1.1` push:
  - locked `/api/request/<id>/revoke` to full admin roles
  - removed hardcoded Identity Center defaults from source and added env/Secrets Manager runtime loading
  - disabled the unsafe terminal WebSocket server entirely
  - sanitized JSON 5xx responses to avoid leaking internal exception strings
  - changed SAML ACS and `/api/v1/auth/saml/acs` to POST-only
  - replaced org-specific username suffix hardcoding with configurable suffix envs
  - added default CSP and SQLite-backed shared rate limiting for multi-worker deployments
  - added Vault cache locking for threaded gunicorn use
  - removed committed sample PII from `backend/org_users.json`
  - updated nginx template for HTTPS redirect + TLS termination
  - changed Docker runtime to env-driven gunicorn workers with default `1`
- Updated `scripts/npamx.env.example` to use secret-name envs for Flask and Vault runtime values.
- Next step: rotate the Vault AppRole `secret_id`, create/update runtime secrets in Secrets Manager, rebuild the image, and deploy behind HTTPS on the PAM EC2.
