# Document 1: Current State — Before Changes

**Nykaa JIT Access Portal — Technical Documentation**  
**Document Type:** As-Is State Assessment  
**Version:** 1.0  
**Date:** February 2025  
**Audience:** Engineering, Security, Product Teams

---

## Executive Summary

This document describes the **current state** of the Nykaa JIT (Just-in-Time) Access Portal before the security enhancements planned for MVP 2. The system provides JIT and PAM (Privileged Access Management) capabilities for cloud resources (AWS EC2, S3) and database access (RDS/MySQL). This assessment focuses on database access, which has been identified as requiring security improvements.

**Key Finding:** The database access flow exposes credentials to end users and relies on client-supplied parameters for query execution. These gaps are addressed in MVP 2.

---

## 1. System Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           NYKAA JIT ACCESS PORTAL                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌──────────────┐         ┌──────────────┐         ┌──────────────────────┐   │
│   │   User       │         │   JIT Web    │         │   Flask Backend       │   │
│   │   Browser    │ ──────► │   UI         │ ──────► │   (app.py)           │   │
│   │              │  HTTPS  │   (React/    │  REST   │   Port 5000          │   │
│   └──────────────┘         │   Vanilla)   │   API   └──────────┬───────────┘   │
│                            └──────────────┘                    │                │
│                                     │                          │                │
│                                     │                          ▼                │
│                                     │               ┌──────────────────────┐   │
│                                     │               │  database_manager    │   │
│                                     │               │  vault_manager       │   │
│                                     │               │  terminal_server     │   │
│                                     │               └──────────┬───────────┘   │
│                                     │                          │                │
│                                     │                          ▼                │
│                                     │               ┌──────────────────────┐   │
│                                     └──────────────►│  RDS / MySQL         │   │
│                                                     │  AWS EC2 (SSH)       │   │
│                                                     │  S3                  │   │
│                                                     └──────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Inventory

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | HTML, JavaScript, CSS | JIT Web UI — login, requests, dashboard, query terminal |
| Backend | Flask (Python) | REST API, approval logic, credential management |
| Database Manager | mysql-connector | Execute SQL queries against RDS/MySQL |
| Vault Manager | HashiCorp hvac | Generate dynamic DB credentials (when Vault available) |
| Terminal Server | WebSocket (Python) | Browser-based SSH to EC2 instances |
| Storage | In-memory (requests_db) | Request/approval state (no persistent DB) |

---

## 2. Database Access Flow — Current State

### 2.1 End-to-End Flow Diagram

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────┐
│  User   │     │  JIT Web    │     │  Flask      │     │  Vault /    │     │  RDS     │
│         │     │  UI         │     │  Backend    │     │  Direct     │     │  MySQL   │
└────┬────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └────┬─────┘
     │                 │                   │                   │                 │
     │ 1. Request      │                   │                   │                 │
     │    Access       │                   │                   │                 │
     │────────────────►│                   │                   │                 │
     │                 │ 2. POST           │                   │                 │
     │                 │    /request-access│                   │                 │
     │                 │──────────────────►│                   │                 │
     │                 │                   │ 3. Create creds   │                 │
     │                 │                   │──────────────────►│                 │
     │                 │                   │                   │ 4. CREATE USER   │
     │                 │                   │                   │────────────────►│
     │                 │                   │ 5. Return         │                 │
     │                 │ 6. Response       │    password       │                 │
     │                 │    + PASSWORD     │◄──────────────────│                 │
     │                 │◄──────────────────│                   │                 │
     │ 7. Alert shows  │                   │                   │                 │
     │    PASSWORD     │                   │                   │                 │
     │◄────────────────│                   │                   │                 │
     │                 │                   │                   │                 │
     │ 8. User enters  │                   │                   │                 │
     │    creds in     │                   │                   │                 │
     │    Connect modal│                   │                   │                 │
     │────────────────►│                   │                   │                 │
     │                 │ 9. POST           │                   │                 │
     │                 │    /execute-query  │                   │                 │
     │                 │    + host,port,   │                   │                 │
     │                 │    username,      │                   │                 │
     │                 │    PASSWORD,query │                   │                 │
     │                 │──────────────────►│                   │                 │
     │                 │                   │ 10. Execute       │                 │
     │                 │                   │───────────────────────────────────►│
     │                 │                   │ 11. Results       │                 │
     │                 │ 12. Results       │◄───────────────────────────────────│
     │                 │◄──────────────────│                   │                 │
     │ 13. Display     │                   │                   │                 │
     │     results     │                   │                   │                 │
     │◄────────────────│                   │                   │                 │
     │                 │                   │                   │                 │
```

### 2.2 Step-by-Step Flow Description

| Step | Actor | Action | Data Exchanged |
|------|-------|--------|----------------|
| 1 | User | Clicks "Request Access" for selected database(s) | — |
| 2 | Frontend | POST `/api/databases/request-access` | databases, user_email, permissions, duration |
| 3 | Backend | Creates credentials via Vault or direct DB user creation | — |
| 4 | Vault/DB | Creates temporary DB user with granted permissions | — |
| 5 | Backend | Stores request in `requests_db` with `db_password` | — |
| 6 | Backend | Returns `{ status, request_id, password, message }` | **Password in response** |
| 7 | Frontend | Shows alert: "Username: X, Password: Y" | **Password displayed to user** |
| 8 | User | Clicks "Connect" → modal asks for username, password | User re-enters credentials |
| 9 | Frontend | POST `/api/databases/execute-query` | host, port, username, **password**, query |
| 10 | Backend | Validates request_id, expiry; calls `execute_query()` with client creds | — |
| 11 | DB | Executes query, returns results | — |
| 12–13 | Frontend | Displays results in query terminal | — |

---

## 3. Security Gaps Identified

### 3.1 Critical: Credentials Exposed to Users

| Location | Issue | Risk |
|----------|-------|------|
| `app.py` line ~3721 | `return jsonify({..., 'password': password})` | Password sent over network to browser |
| `databases.js` line ~279 | `alert(\`Password: ${data.password}\`)` | Password visible in UI, can be screenshotted/copied |
| Connect modal | User enters credentials from "approval email" | Credentials stored in `window.dbConn`, sent with every query |
| `execute-query` request body | Frontend sends `password` with each query | Credentials in every API call; vulnerable to MITM, logging |

**Principle Violated:** *Users must NEVER connect directly to databases; no DB credentials exposed to users.*

### 3.2 Critical: Trusting Client-Supplied Parameters

| Parameter | Source | Risk |
|-----------|--------|------|
| host | Client request | Compromised frontend could point to different DB (e.g., prod) |
| port | Client request | Could connect to wrong service |
| username | Client request | Could impersonate another user |
| password | Client request | Could use stolen credentials |

**Principle Violated:** *Assume everything can be compromised; design must still be safe under these failures.*

### 3.3 Critical: Insufficient SQL Enforcement

| Current Behavior | Gap |
|------------------|-----|
| `validate_sql_query()` | Blocks only: DROP DATABASE, DROP USER, GRANT ALL, CREATE USER, ALTER USER, SHUTDOWN, SYSTEM |
| `database_manager.execute_query()` | If query does not start with SELECT, **executes and commits** (INSERT/UPDATE/DELETE allowed) |
| No role-based enforcement | All approved users can run any SQL type (subject to DB user grants) |

**Principle Violated:** *Enforcement must be deterministic and server-side; allow ONLY SELECT (or role-based) strictly.*

### 3.4 Medium: No Immutable Audit Log

| Current State | Gap |
|---------------|-----|
| No structured audit log | Cannot trace all queries to user identity for compliance |
| Request stored in memory | Lost on restart; not persistent |

---

## 4. Current Database Request Data Model

### 4.1 Request Object (stored in `requests_db`)

```json
{
  "id": "uuid",
  "type": "database_access",
  "databases": [
    {
      "name": "mydb",
      "host": "xxx.rds.amazonaws.com",
      "port": 3306,
      "engine": "mysql"
    }
  ],
  "user_email": "user@company.com",
  "user_full_name": "User Name",
  "db_username": "jit_user_xxx",
  "db_password": "plaintext_password",
  "permissions": "SELECT,INSERT,UPDATE",
  "query_types": ["SELECT", "INSERT"],
  "duration_hours": 2,
  "justification": "Need to debug",
  "status": "approved",
  "expires_at": "2025-02-03T18:00:00",
  "created_at": "2025-02-03T16:00:00"
}
```

### 4.2 API Endpoints — Current Behavior

| Endpoint | Method | Purpose | Returns Credentials? |
|----------|--------|---------|----------------------|
| `/api/databases` | GET | List databases (RDS or mock) | No |
| `/api/databases/request-access` | POST | Request access, create user | **Yes — password** |
| `/api/databases/approved` | GET | List approved DBs for user | No (username only) |
| `/api/databases/execute-query` | POST | Execute SQL | N/A (accepts password from client) |
| `/api/databases/ai-chat` | POST | AI advisory for permissions | No |

---

## 5. Current UI Components (Database)

### 5.1 Database Discovery

- Account selector → fetches RDS instances from AWS (or mock)
- Table: database name, engine, host:port, status
- Checkbox to select databases for access request

### 5.2 Request Access Modal

- Fields: Name, DB username, permissions (checkboxes), duration, justification
- AI chat integration for permission suggestions
- Submit → calls `request-access` API

### 5.3 Approval Alert

- **Current:** Shows `Username: X, Password: Y` when approved
- **Issue:** Credentials exposed in browser

### 5.4 Connect Modal

- **Current:** Asks user to enter username, password, database name
- **Issue:** User must re-enter credentials; stored in `window.dbConn`

### 5.5 Query Terminal

- Input: SQL query
- Execute → sends `request_id`, `user_email`, `query`, **host, port, username, password**, `dbName`
- Displays results in scrollable output area

---

## 6. What Works Well (Current State)

| Area | Status | Notes |
|------|--------|------|
| Cloud access (EC2, S3) | ✅ Implemented | JIT request, approval, terminal/SSH |
| JIT Web UI | ✅ Implemented | Login, sidebar, dashboard, requests |
| Approval flow | ✅ Implemented | Request → approve → grant |
| Database request flow | ✅ Functional | End-to-end works; security gaps |
| Database AI chat | ✅ Advisory only | Explains permissions; does not enforce |
| Vault integration | ⚠️ Partial | Creates creds; returns to user |
| Time-based expiry | ✅ Implemented | Background cleanup revokes expired access |
| Prompt injection guard | ✅ Implemented | Validates AI input; basic SQL validation |

---

## 7. Architecture Diagram — Current Database Access

```
                    CURRENT STATE (BEFORE MVP 2)
                    ============================

    ┌─────────────────────────────────────────────────────────────────┐
    │                         USER BROWSER                             │
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
    │  │ Request     │  │ Alert shows │  │ Connect Modal            │ │
    │  │ Access Form │  │ PASSWORD    │  │ User enters username,    │ │
    │  │             │  │             │  │ password                 │ │
    │  └──────┬──────┘  └──────▲──────┘  └────────────┬────────────┘ │
    │         │                │                       │              │
    │         │                │  password in response  │              │
    │         │                │                       │              │
    │         └────────────────┼───────────────────────┘              │
    │                          │                                      │
    │  ┌───────────────────────┴───────────────────────────────────┐ │
    │  │  Query Terminal — sends host, port, username, PASSWORD,   │ │
    │  │  query with every request                                 │ │
    │  └───────────────────────────────────────────────────────────┘ │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                                    │ REST API (credentials in request)
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    FLASK BACKEND (app.py)                         │
    │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
    │  │ request-access  │  │ execute-query   │  │ database_manager │ │
    │  │ Returns password│  │ Accepts creds   │  │ Uses client      │ │
    │  │ to client       │  │ from client     │  │ creds to connect│ │
    │  └─────────────────┘  └─────────────────┘  └────────┬────────┘ │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Direct connection with client creds
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                         RDS / MySQL                              │
    └─────────────────────────────────────────────────────────────────┘
```

---

## 8. Summary

The current system provides a functional JIT database access flow but has **critical security gaps**:

1. **Credentials exposed** — Password returned in API and displayed in UI
2. **Client-supplied credentials** — Execute-query trusts host, port, username, password from frontend
3. **Insufficient SQL enforcement** — INSERT/UPDATE/DELETE allowed; no role-based control
4. **No audit trail** — Queries not logged for compliance

These gaps are addressed in **MVP 2** (see Document 3).

---

*End of Document 1*
