# Security Hardening

Last updated: 2026-03-14 18:55:00 IST

This is the living human-readable security record for the PAM platform. Update it whenever authentication, authorization, request-routing, secret handling, deployment, or privileged-access behavior changes.

## Objective

The application is being moved from demo-grade behavior to an enterprise PAM baseline:

- SSO-first for workforce users
- strictly isolated break-glass access
- least-privilege request workflows
- no demo credentials or silent fallback behavior
- Docker/ECR-friendly deployment
- server-side enforcement over client-side trust

## Security Baseline Implemented

### 1. Authentication and Login

- Workforce login is SSO-first through the IdP path.
- Password login is restricted to break-glass and local PAM admin use.
- Test/demo login labels and low-trust login shortcuts were removed from the main login surface.
- Frontend now validates the real backend session before showing the app.
- Backend logout clears server session state and CSRF cookies.

### 2. Break-glass Access

- Break-glass users are stored in backend EC2-backed SQLite storage, not browser state.
- First-time bootstrap now creates the initial break-glass `SuperAdmin` through the main app.
- MFA enrollment is mandatory during bootstrap.
- Break-glass login requires password plus TOTP MFA.
- Passwords are stored using PBKDF2 with upgrade support for older hashes.
- Failed sign-in attempts are rate-limited and locked out.
- Only one pending bootstrap account is allowed at a time to avoid inconsistent first-time state.

### 3. Session and HTTP Security

- Flask is proxy-aware for deployment behind nginx/ALB.
- Production cookie flags are hardened with `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Session lifetime is explicitly controlled.
- CSRF protection is enforced for state-changing authenticated requests.
- Security headers are applied centrally.
- Auth and sensitive endpoints are marked `no-store`.

### 4. SAML / SSO Hardening

- SAML strict mode is enabled.
- Production now requires a valid `APP_BASE_URL`.
- Insecure hardcoded HTTP fallback for SAML ACS was removed.
- Backend session is rotated/cleared on successful SSO login.

### 5. Request Path Hardening

- Request creation is now split by domain rather than mixing all privileged flows into one path.
- Generic cloud access uses `/api/request-access`.
- Database access uses `/api/databases/request-access`.
- Backend now rejects request creation when required target context is missing.
- Frontend request flows were updated to stop using hardcoded localhost API paths.
- Frontend request flows were updated to stop using placeholder users and silent account fallbacks.
- Authenticated request creation now uses cookies and CSRF headers.

### 6. Database Access Flow Hardening

For the current database-access implementation:

- request creation now requires authenticated session context
- `account_id` is mandatory
- `db_instance_id` is mandatory
- selected database targets are sanitized before being stored
- the frontend no longer silently chooses the first account
- the frontend no longer falls back to fake requester identities

This reduces wrong-account, wrong-instance, and wrong-user provisioning risk before Vault or IAM activation happens.

### 7. Admin and Config Protection

- Shared AI configuration is now admin-protected.
- Approval workflows are now admin-managed backend data, not hardcoded approver logic.
- Database approvals are evaluated from the current workflow stage and authenticated approver identity.
- Legacy runnable backend entry points were neutralized to prevent starting weaker demo backends accidentally.
- Demo-style local fallback behavior in admin user creation was removed.

### 8. Approval and Database Ownership Hardening

- Database approval visibility is now derived from the authenticated backend session.
- Pending database approvals are visible to the current stage approver without trusting browser-supplied `user_email`.
- Database approve/deny actions now follow the workflow engine instead of prompt-based role selection in the UI.
- Database request details expose approval summary fields instead of raw internal workflow state.
- Sensitive database owner actions such as credential retrieval, activation retry, bulk delete, and terminal query execution now resolve the actor from server session state.

### 9. Frontend API and CSRF Hardening

- Global fetch protection now rewrites stale `localhost` and `127.0.0.1` API calls to the deployed same-origin API path.
- Internal API calls automatically carry authenticated cookies.
- State-changing internal API calls automatically attach CSRF tokens when missing.
- This reduces breakage across older admin tabs that still contained hardcoded local API endpoints.

### 10. Deployment Hardening

- A real root `Dockerfile` now exists for reproducible Docker/ECR builds.
- Default production DB admin credentials were removed from startup artifacts.
- `Dockerfile` is no longer ignored by git.
- Main login/app entrypoint was consolidated to the hardened frontend path.

### 11. User-Facing Operational Hardening

- Documentation and Support shortcuts are now admin-configured and feature-gated instead of pointing to dummy surfaces.
- The user Home page now shows only backend-derived request history from the last 90 days.
- Home history charts only show approved and denied outcomes, removing misleading placeholder progress data.
- Break-glass account maintenance moved into `My Profile` instead of dummy top-right actions.
- Break-glass users can now manage a primary and backup TOTP authenticator device.
- Light-theme login visibility was hardened so inputs, help panels, and MFA blocks remain readable.

## Security-sensitive Files

- `backend/app.py`
- `backend/security.py`
- `backend/break_glass_db.py`
- `backend/add_break_glass_user.py`
- `frontend/index.html`
- `frontend/app.js`
- `frontend/databases.js`
- `frontend/workflow-designer.js`
- `frontend/requests-chat.js`
- `frontend/structured-requests.js`
- `frontend/wizard.js`
- `Dockerfile`

## Current Secure Patterns To Keep

- Never trust browser identity when the server session can resolve the user.
- Never default privileged request targets such as account, instance, or requester.
- Never trust client-supplied `user_email` for request ownership, approvals, or database credential access.
- Never keep working localhost-only API paths in production-facing UI.
- Never expose real DB endpoints directly to end users when proxying is intended.
- Never allow break-glass access without MFA.
- Never allow shared configuration writes from non-admin users.

## Remaining High-priority Areas

- database approval to activation chain
- Vault contract validation and secret-handling review
- IAM permission-set creation and cleanup review
- removal/quarantine of remaining demo data and hardcoded sample content outside the active request path
- formal automated tests for auth, request creation, and privileged flows

## Update Rule

Whenever a material security change is made, append:

- what changed
- why it was changed
- affected files
- any operational follow-up required

## Recent Security Change Log

### 2026-03-14

- Hardened login to SSO-first plus restricted break-glass/local admin path.
- Added first-time break-glass bootstrap with MFA enrollment and EC2-backed persistence.
- Added PBKDF2 password hashing and break-glass login throttling/lockout.
- Enforced strict SAML production configuration.
- Added reproducible Docker build definition and removed insecure startup defaults.
- Hardened request creation so cloud and database requests fail closed on missing target context.
- Removed stale localhost and placeholder-identity request submitters from active frontend flows.
- Replaced demo approval-workflow behavior with backend-stored workflow rules and stage-based DB approvals.
- Removed browser-trusted `user_email` ownership checks from database approval, credential, activation, and terminal flows.
- Added centralized fetch rewriting plus CSRF/cookie auto-attachment to stabilize active admin tabs that still called localhost APIs.
- Added feature-gated Documentation and Support shortcuts backed by admin-managed runtime settings.
- Added real user Home and Home History views backed only by actual backend request data from the last 90 days.
- Added real break-glass profile management for password change, primary MFA enrollment, backup MFA enrollment, and backup MFA removal.
