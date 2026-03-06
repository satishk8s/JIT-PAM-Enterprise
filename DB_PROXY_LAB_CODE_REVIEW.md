# DB Proxy Lab Code Review (proxy.py / sql_guard.py / vault_client.py / pam-backend-policy.hcl)

Last updated: 2026-03-06
Reviewed source: user-shared file contents from `db-proxy-lab` and `/opt/vault/pam-backend-policy.hcl`

## 1) Files Reviewed

1. `proxy.py`
2. `sql_guard.py`
3. `vault_client.py`
4. `pam-backend-policy.hcl`

## 2) Executive Summary

This lab code is useful as a prototype, but it is not production-safe in current form.

Main blockers:

1. It is not a real PostgreSQL protocol proxy (line-based forwarding will not work with normal DB clients).
2. Vault token validation path is unsafe and likely broken (`expire_time` parsing and privileged token usage model).
3. SQL controls are operation-level only and can be bypassed for data-aware controls (no table/column/join enforcement).

Recommendation: do not deploy this lab proxy as-is in production.

## 3) Detailed Findings

## 3.1 `proxy.py`

### High Risk / Correctness

1. **Not pgwire-compliant proxy behavior**
- The code reads query text with `readline()` and forwards raw text to DB socket.
- PostgreSQL client/server communication is binary protocol, not plain line-based SQL text streaming.
- Most real clients (`psql`, DBeaver, app drivers) will not work correctly with this design.

2. **Response handling is incorrect**
- Reads only one line from DB (`await db_reader.readline()`), which cannot represent full query result/protocol frames.

3. **Token transport not hardened**
- Expects token on first line from client.
- No TLS/mTLS enforcement in this code path, so token can be exposed if network path is not strictly protected.

4. **Session and authorization binding is weak**
- No binding to specific approved request ID, schema/table scope, or client identity beyond token metadata.

### Medium Risk

1. `allowed_ops` is trusted from metadata with minimal normalization.
2. No per-query size limits, no full I/O timeout policy, and weak backpressure controls.
3. Logging may capture sensitive SQL text directly.

## 3.2 `sql_guard.py`

### High Risk

1. **First-keyword split is insufficient**
- `extract_operation` uses `sql.split()[0]`.
- Can be bypassed by comments/CTEs/complex constructs and gives no object-level protection.

### Functional Gap

1. No table-level allowlist checks.
2. No join-path inspection.
3. No `SELECT *` enforcement policy.
4. No exfiltration pattern controls (`COPY ... TO`, output/file exports, etc.).

## 3.3 `vault_client.py`

### High Risk

1. **Privileged token validation model**
- Global `hvac.Client(... token=VAULT_TOKEN)` validates user tokens via `lookup_token(token)`.
- This implies proxy has high-power Vault token and can inspect/revoke broadly.
- Prefer least-privilege model with scoped AppRole and request-scoped metadata lookup design.

2. **`expire_time` parsing bug**
- `lookup["data"]["expire_time"]` is not an epoch integer in Vault token lookup responses.
- `datetime.utcfromtimestamp(...)` is likely incorrect and can break TTL enforcement.

3. **No robust validation checks**
- Missing checks for revoked/expired/renewable state handling with safe parser.
- Missing defensive handling when `meta` keys are absent.

### Medium Risk

1. No explicit Vault namespace/TLS verify configuration in this file.
2. Revocation helper can become too broad if token policy is not tightly scoped.

## 3.4 `pam-backend-policy.hcl`

### Observations

1. Policy allows `database/roles/*`, `database/creds/*`, `database/config/*`, and `sys/leases/*`.
2. This is close to backend dynamic-credentials needs, but still broad for strict least privilege.

### Gaps / Improvements

1. If proxy/backend must introspect token by itself, define exact minimal auth/token lookup capability path and avoid broad token powers.
2. Split policy by component:
- Backend policy (create roles/creds/revoke leases)
- Proxy policy (read-only token/session verification only, if needed)

## 4) What Can Be Reused

1. The `validate_sql()` concept in `proxy.py` blocking multi-statement is a good baseline.
2. The idea of operation allowlist derived from session context is valid.
3. Session-expiry checks in the loop are directionally correct.

## 5) Mandatory Changes Before Any Production Use

1. Replace line-based proxy with protocol-correct layer (or keep current NPAM backend execution model and enforce there).
2. Replace keyword-only SQL guard with AST-based parser enforcement (table/column/join aware).
3. Fix Vault session validation model:
- no broad static root-like token on proxy
- correct expiry parsing
- strict metadata schema checks
4. Enforce TLS/mTLS for proxy client connections.
5. Add deterministic request binding:
- session must map to `request_id`, user, account, db, schema/table scope, expiry
6. Add structured audit:
- user, request_id, session_id, sql fingerprint, tables accessed, decision, reason

## 6) Recommended Architecture for Your Current Scope (PAM + Proxy only)

1. Keep approvals and credential/session issuance in PAM backend.
2. Proxy enforces query policy using request-scoped entitlements.
3. DB grants from Vault remain least privilege (defense in depth).
4. Direct DB access remains blocked at org/network control level.

## 7) Extra Files Needed for Final Hardening Plan

Please share these to complete an implementation-ready hardening checklist:

1. Proxy systemd unit file and startup script.
2. Proxy environment file (redact secrets).
3. Current network/TLS termination design for proxy endpoint.
4. Any nginx/ALB/LB config in front of proxy.
5. Sample real client connection path (PAM terminal, CLI, DBeaver).
6. `pip freeze` from proxy venv.

