# Document 2: Changes Implemented

**Nykaa JIT Access Portal — Technical Documentation**  
**Document Type:** Change Log / Implementation Record  
**Version:** 1.0  
**Date:** February 2025  
**Audience:** Engineering, Security, Product Teams

---

## Executive Summary

This document records the **changes that have been implemented** in the Nykaa JIT Access Portal to date. These changes improve security (prompt injection guardrails, SQL validation), user experience (unified portal, OTP login), and UI consistency (icons, design system). The **critical database credential exposure** and **backend credential fetching** are planned for MVP 2 and are not yet implemented.

---

## 1. Change Categories Overview

| Category | Changes | Status |
|----------|---------|--------|
| **Prompt Injection & Input Validation** | New guard module, SQL validation, AI input checks | ✅ Implemented |
| **Database Access — Partial Hardening** | request_id, user_email for audit; validate_sql_query | ✅ Implemented |
| **User/Admin Portal Unification** | Single app, admin-only nav hidden for users | ✅ Implemented |
| **UI & Design System** | Icon fixes, logos, database page styling | ✅ Implemented |
| **User Login (OTP)** | Paste support, error feedback, demo hint | ✅ Implemented |
| **Credential Exposure** | Remove password from API/UI | ⬜ Planned (MVP 2) |
| **Backend Fetches Credentials** | Execute-query without client creds | ⬜ Planned (MVP 2) |

---

## 2. Prompt Injection & Input Validation

### 2.1 New Module: `prompt_injection_guard.py`

**Purpose:** Validate user input before sending to AI and validate SQL queries before execution.

**Changes:**

| Component | Description |
|----------|-------------|
| `validate_ai_input(user_input, check_sql)` | Blocks prompt injection patterns (role manipulation, jailbreak, output extraction) |
| `validate_sql_query(query)` | Blocks dangerous SQL: DROP DATABASE, DROP USER, GRANT ALL, CREATE USER, ALTER USER, SHUTDOWN, SYSTEM |
| `MAX_INPUT_LENGTH = 2000` | Prevents overflow attacks |
| `INJECTION_PATTERNS` | 25+ regex patterns for prompt injection |
| `SQL_INJECTION_PATTERNS` | Patterns for SQL injection in chat |

**Integration:**
- `app.py` `/api/databases/ai-chat`: Calls `validate_ai_input()` before sending to Bedrock
- `app.py` `/api/databases/execute-query`: Calls `validate_sql_query()` before executing

### 2.2 Enhanced `ai_validator.py` and `strict_policies.py`

- Expanded `FORBIDDEN_KEYWORDS` and injection patterns
- Stricter validation of AI-generated permission suggestions

---

## 3. Database Access — Partial Hardening

### 3.1 Execute-Query Endpoint Changes

**Before:** Accepted `host`, `port`, `username`, `password`, `query` from client.

**After (partial):**
- Still accepts credentials from client (to be removed in MVP 2)
- **Added:** `request_id` and `user_email` required for audit
- **Added:** Time-based enforcement — validates access is approved and not expired
- **Added:** User mismatch check — `user_email` must match request
- **Added:** `validate_sql_query()` before execution — blocks dangerous SQL

**Flow Diagram — Current Execute-Query:**

```
┌─────────────┐                    ┌─────────────┐                    ┌─────────────┐
│  Frontend   │                    │  Backend    │                    │  Database   │
└──────┬──────┘                    └──────┬──────┘                    └──────┬─────┘
       │                                  │                                  │
       │ POST execute-query               │                                  │
       │ { request_id, user_email,        │                                  │
       │   host, port, username,         │                                  │
       │   password, query }             │                                  │
       │─────────────────────────────────►│                                  │
       │                                  │ 1. Validate request_id exists    │
       │                                  │ 2. Validate user_email matches  │
       │                                  │ 3. Validate status=approved     │
       │                                  │ 4. Validate not expired         │
       │                                  │ 5. validate_sql_query(query)   │
       │                                  │ 6. execute_query(creds, query)  │
       │                                  │────────────────────────────────►│
       │                                  │◄────────────────────────────────│
       │◄─────────────────────────────────│                                  │
       │  Results                         │                                  │
```

### 3.2 Frontend: `databases.js` Updates

| Change | Description |
|--------|-------------|
| `request_id` passed to Connect | Approved databases list includes `request_id` for Connect button |
| `user_email` sent with execute-query | From `localStorage` for audit |
| `DB_API_BASE` dynamic | Uses `API_BASE` from app.js |
| Error handling | Improved handling for API errors in `sendDbAiMessage`, `executeQuery` |
| `showDatabaseConnectionModal` | Accepts `request_id`, `db_name` |
| `connectWithCredentials` | Passes `request_id` through to terminal |
| `showDatabaseTerminal` | Stores `requestId` in `window.dbConn` |
| `appendOutput` | Safe append with element existence check |

**Note:** Connect modal still asks for username/password. Credential removal is MVP 2.

---

## 4. User/Admin Portal Unification

### 4.1 Single Application for Both Roles

**Before:** Separate flows for admin vs user; potential confusion.

**After:**
- **Single entry:** `index.html` for both admin and user after login
- **User login:** `user-login.html` → sets `isAdmin: false`, `userRole: user` → redirects to `index.html`
- **Admin login:** `index.html` login form → sets `isAdmin` based on `ADMIN_USERS` list

### 4.2 Admin-Only Navigation

| Element | Class | Visibility |
|---------|-------|------------|
| Admin Panel button (header) | `admin-only-nav` | Hidden for non-admin |
| Reports & Audit (sidebar) | `admin-only-nav` | Hidden for non-admin |
| Configuration > Integrations | `admin-only-nav` | Hidden for non-admin |

**Implementation:** `App.js` `updateUIForRole()` hides `.admin-only-nav` when `isAdmin === false`.

### 4.3 Shared for All Users

- Dashboard, My Requests, Generated Policy, Approval Workflows
- Troubleshooting, Active Sessions
- Instances, Containers, S3, GCS, Databases, Terminal
- Same request page, same layout

### 4.4 New/Updated Files

| File | Change |
|------|--------|
| `user-login.html` | New — standalone user login; redirects to index.html |
| `user-portal.html` | Simplified to redirect (index.html if logged in, else user-login.html) |
| `index.html` | Added `admin-only-nav` to admin-specific elements; title "Nykaa JIT Access Portal" |
| `App.js` | `updateUIForRole()` enhanced to hide admin-only elements |

---

## 5. UI & Design System

### 5.1 Icon and Font Fixes

| File | Change |
|------|--------|
| `design-system.css` | `font-family: Inter` applied only to text elements; Font Awesome classes get explicit `font-family` and `font-weight` to prevent "hamburger" icon breakage |
| `vendor-icons.css` | Added `min-width`, `min-height`, `flex-shrink: 0`, `vertical-align: middle` for custom icons (`.icon-aws`, `.icon-database`, etc.) |
| `styles.css` | Adjusted `.sidebar-nav .nav-item i` for proper icon display |

### 5.2 Database Page Styling

| File | Change |
|------|--------|
| `databases.css` | New — form layouts, table styles, query terminal placeholders |
| `index.html` | Linked `databases.css`, `databases.js`; database page structure |

### 5.3 Logos

| Change | Description |
|-------|-------------|
| Cloud/service logos | `index.html` uses `<img>` tags for AWS, GCP, Azure, Oracle, S3, RDS, Kubernetes from `assets/logos/` |
| Font Awesome | Used for generic DB icons (MongoDB, MySQL, MSSQL, PostgreSQL) |
| `styles.css` | Rules for `.nav-logo`, `.page-title-logo`, `.card-logo` |

---

## 6. User Login (OTP) Improvements

### 6.1 OTP Paste Support

**Problem:** Pasting "123456" into first OTP box only filled one digit (maxlength=1).

**Fix:** Paste handler on OTP container:
- Intercepts paste event
- Extracts digits, distributes across 6 inputs
- Focuses last box when 6 digits pasted

### 6.2 Error Feedback

**Before:** Silent failure when OTP incomplete.

**After:** Alert: "Please enter all 6 digits. Demo: use 123456"

### 6.3 Demo Hint

- Added text: "Demo: enter or paste 123456" below OTP inputs

### 6.4 Session Handling

- If email missing when verifying OTP, alert: "Session expired. Please go back and enter your email again."

### 6.5 User Role Storage

- `doUserLogin()` now sets `localStorage.setItem('userRole', 'user')`

---

## 7. Flow Diagram — Changes Summary

```
                    IMPLEMENTED CHANGES — FLOW IMPACT
                    ===================================

    User Login (user-login.html)
    ┌─────────────────────────────────────────────────────────────┐
    │  Email → OTP (paste supported) → doUserLogin()               │
    │  Sets: isLoggedIn, userEmail, isAdmin=false, userRole=user    │
    │  Redirects to index.html                                     │
    └─────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    index.html (Unified Portal)
    ┌─────────────────────────────────────────────────────────────┐
    │  updateUIForRole() → hides admin-only-nav for non-admin      │
    │  Same sidebar, same request page for all                     │
    └─────────────────────────────────────────────────────────────┘

    Database Execute-Query (Partial Hardening)
    ┌─────────────────────────────────────────────────────────────┐
    │  Required: request_id, user_email (for audit)                │
    │  Validates: approval, expiry, user match                      │
    │  validate_sql_query() blocks dangerous SQL                    │
    │  ⚠️ Still accepts credentials from client (MVP 2 fix)         │
    └─────────────────────────────────────────────────────────────┘

    AI Chat (database_ai_chat)
    ┌─────────────────────────────────────────────────────────────┐
    │  validate_ai_input() before sending to Bedrock               │
    │  Blocks prompt injection, SQL patterns in chat               │
    └─────────────────────────────────────────────────────────────┘
```

---

## 8. Files Modified — Summary

| Area | Files |
|------|-------|
| Backend | `app.py`, `prompt_injection_guard.py` (new), `ai_validator.py`, `strict_policies.py` |
| Frontend | `databases.js`, `index.html`, `styles.css`, `design-system.css`, `vendor-icons.css`, `databases.css` (new) |
| Login/Portal | `user-login.html`, `user-portal.html`, `App.js` |
| Assets | `assets/logos/` (logos for cloud providers) |

---

## 9. What Remains (MVP 2)

The following are **not yet implemented** and are planned for MVP 2:

| Item | Description |
|------|-------------|
| Remove password from API | `request-access` must not return `password` |
| Remove credential UI | No password in alert; no connect modal asking for creds |
| Backend fetches credentials | `execute-query` accepts only `request_id`, `user_email`, `query`; backend resolves creds |
| Role-based SQL | Predefined roles (Read-only, Limited Write, Full Write, Admin) |
| Audit logging | Immutable log for all queries |

---

*End of Document 2*
