# JIT + PAM Production Readiness Analysis

**Date:** February 3, 2026  
**Backup Created:** `sso_backup_20260203_173529`

---

## Executive Summary

This document analyzes three critical areas blocking production deployment:
1. **UI Modernization** – outdated styling, tabs, icons, theme
2. **Prompt Injection Guardrails** – need stronger AI input validation
3. **JIT RDS Database Access** – time-based access and query execution

**Constraint:** No changes to frontend/backend logic or mechanisms—only styling, guardrails, and RDS enhancements.

---

## 1. UI / Styling Issues

### 1.1 Current State

| Area | Current State | Issue |
|------|---------------|-------|
| **CSS Files** | 15+ CSS files with overlapping rules | Conflicting variables, cascade order unclear |
| **Color Variables** | `styles.css`: `#4A90E2` vs `design-system.css`: `#38BDF8` | Inconsistent primary color |
| **Theme** | Light/dark toggle exists | Dark theme vars differ across files |
| **Tabs** | `admin-tab-btn`, `integration-tab-btn`, `request-type-tab`, `status-tab` | Multiple tab styles, no unified design |
| **Icons** | Font Awesome + custom `.icon-database`, `.icon-s3`, etc. | Mixed sources, inconsistent sizing |
| **Buttons** | `.btn-primary`, `.btn-secondary` defined in multiple files | Different padding, radius, colors |
| **Sidebar** | `.sidebar`, `.nav-item`, `.nav-category` | Works but styling scattered |

### 1.2 CSS File Inventory

```
styles.css          - Base styles, login, sidebar, tables (3956 lines)
design-system.css   - Typography, admin tabs, flow builder (109 lines)
enterprise-theme.css- Security-grade colors, buttons (830 lines)
security-ui.css     - Admin panel, audit tables (1400+ lines)
dark-theme-fix.css  - Dark mode table overrides
unified-design-system.css - Tab/table consolidation
guardrails-redesign.css   - Guardrail tabs
vendor-icons.css    - Cloud provider icons
```

### 1.3 Recommended Approach (Styling Only)

- Consolidate color variables into a single `:root` block
- Unify tab styles (one `.tab-btn` / `.tab-content` pattern)
- Standardize icon sizing (20px default, 24px for cards)
- Align button styles (8px radius, consistent padding)
- Ensure dark theme uses same variable names everywhere

---

## 2. Prompt Injection Guardrails

### 2.1 Current Implementation

**`ai_validator.py`** – Injection patterns (8 patterns):
```python
injection_patterns = [
    r'ignore.*previous.*instruction',
    r'disregard.*rule',
    r'override.*policy',
    r'bypass.*restriction',
    r'you.*must.*allow',
    r'system.*prompt',
    r'admin.*access.*required',
    r'emergency.*override'
]
```

**`strict_policies.py`** – Forbidden keywords:
```python
FORBIDDEN_KEYWORDS = [
    'full access', 'all permissions', '*:*',
    'create user', 'create role', 'delete user', 'delete role',
    'attach policy', 'detach policy', 'assume role',
    'bypass', 'override', 'ignore policy', 'disable security'
]
```

**`guardrails_config.json`** – Mostly empty:
```json
{
  "serviceRestrictions": [],
  "deleteRestrictions": [],
  "createRestrictions": [],
  "customGuardrails": []
}
```

### 2.2 Gaps

| Attack Type | Current Coverage | Gap |
|-------------|------------------|-----|
| Role manipulation | Partial | "you are now", "act as admin" |
| Delimiter injection | None | `---`, `###`, `<<<` to break context |
| Encoding bypass | None | Base64, Unicode escapes |
| Jailbreak phrases | Partial | "DAN", "jailbreak", "developer mode" |
| Instruction override | Good | Covered |
| SQL injection in DB chat | None | Database AI chat has no input validation |
| Output extraction | None | "print", "output", "reveal" |

### 2.3 Recommended Additions (Guardrails Only)

- Add 15–20 more injection patterns (jailbreak, role, delimiter)
- Add input length limits (e.g., 2000 chars for AI input)
- Add SQL injection detection for database AI chat
- Add output-leak patterns ("print your instructions", "reveal system prompt")
- Extend `guardrails_config.json` with configurable patterns

---

## 3. JIT RDS Database Access

### 3.1 Current Implementation

**Backend (`app.py`):**
- `GET /api/databases` – Returns hardcoded mock data (1 MySQL DB)
- `POST /api/databases/request-access` – Creates user, stores in `requests_db`
- `GET /api/databases/approved` – Returns approved DBs for user
- `POST /api/databases/execute-query` – Executes SQL via `database_manager.execute_query`

**Backend (`database_manager.py`):**
- `create_database_user()` – MySQL only
- `execute_query()` – No expiry check
- `revoke_database_access()` – Exists but not called on expiry

**Frontend:**
- `databases.js` – Full implementation (request modal, AI chat, query terminal)
- `index.html` – `databasesPage` shows "coming-soon" placeholder
- **Missing:** `databaseAccountSelect`, `databasesTableBody`, `requestDbAccessBtn`, `approvedDatabasesTableBody`, `databaseTerminalContainer` – not in HTML

### 3.2 Gaps

| Feature | Status | Gap |
|---------|--------|-----|
| List RDS from AWS | ❌ | `get_databases()` returns mock data |
| Time-based access | ⚠️ | `expires_at` stored but not enforced on execute |
| Query execution expiry | ❌ | `execute_database_query()` does not check `expires_at` |
| Auto-revoke on expiry | ❌ | No background job to revoke expired access |
| Database page UI | ❌ | Placeholder only; databases.js expects full DOM |
| PostgreSQL support | ❌ | `database_manager` is MySQL-only |

### 3.3 Recommended Approach (Logic-Preserving)

1. **Time-based enforcement**
   - In `execute_database_query()`, validate that the user’s access is still within `expires_at`
   - Require `request_id` in execute payload to look up approval and expiry

2. **RDS discovery**
   - Add `GET /api/databases?account_id=X&region=Y` that calls `boto3 rds.describe_db_instances()`
   - Keep mock fallback when AWS not configured

3. **Wire Database UI**
   - Replace `databasesPage` "coming-soon" block with the DOM structure expected by `databases.js`
   - Ensure `loadDatabases()` / `loadDatabasesByAccount()` are called when page is shown

4. **Background cleanup**
   - Extend existing `background_cleanup` to revoke expired database users via `revoke_database_access()`

---

## 4. File Reference

### UI / Styling
- `frontend/styles.css`
- `frontend/design-system.css`
- `frontend/enterprise-theme.css`
- `frontend/security-ui.css`
- `frontend/index.html` (sidebar, tabs, buttons)

### Prompt Injection
- `backend/ai_validator.py`
- `backend/strict_policies.py`
- `backend/guardrails_config.json`
- `backend/unified_assistant.py` (AI input handling)
- Database AI chat: `backend/app.py` `database_ai_chat()`

### RDS / Databases
- `backend/app.py` – `/api/databases/*` routes
- `backend/database_manager.py`
- `frontend/databases.js`
- `frontend/index.html` – `#databasesPage`

---

## 5. Implementation Order

1. **Prompt injection guardrails** – Backend-only, low risk
2. **RDS time-based enforcement** – Backend-only, preserves flow
3. **Database page UI wiring** – Add DOM, call existing `databases.js` functions
4. **UI styling consolidation** – CSS-only, no logic changes

---

*Analysis complete. Ready for implementation phases.*

