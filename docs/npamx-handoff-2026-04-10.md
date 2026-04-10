# NPAMX Handoff And Pre-Push Checklist

Date: 2026-04-10  
Workspace: `/Users/sowmya/Documents/sso/JIT-PAM-Enterprise`

## Current Release Context

- Main working branch in this workspace started from: `codex/backup-2026-04-09`
- Latest desktop agent source version: `1.4.6`
- Personal repo should be treated as the live engineering mirror.
- Company repo should receive validated snapshots pulled from the personal repo.

## Release / Branch Workflow

Use one branch per release or hotfix so rollback is easy.

Recommended pattern:

1. Start from the latest stable branch.
2. Create a new branch using `codex/` prefix.
3. Make and validate the change.
4. Push to personal repo first.
5. Pull on company laptop.
6. Push from company laptop to company repo.

Recommended branch naming:

- `codex/release-v8.34`
- `codex/release-v8.35`
- `codex/hotfix-db-owner-email-2026-04-10`
- `codex/hotfix-agent-heartbeat-2026-04-10`

## Push Strategy

Preferred git remote transport:

- use SSH for the personal repo
- avoid cached HTTPS credentials from the wrong GitHub account

Suggested commands:

```bash
cd /Users/sowmya/Documents/sso/JIT-PAM-Enterprise
git checkout -b codex/release-2026-04-10-prepush-fixes
git remote set-url origin git@github.com:satishk8s/JIT-PAM-Enterprise.git
git add backend/app.py frontend/app.js frontend/index.html frontend/admin-functions.js frontend/databases.js frontend/db-governance.js desktop_agent/npamx_agent.py desktop_agent/build-agent-macos-linux.sh docs/npamx-handoff-2026-04-10.md
git commit -m "Stabilize PAM DB access, admin flows, profile gate, and agent updates"
git push -u origin codex/release-2026-04-10-prepush-fixes
```

Do not commit local build artifact folders:

- `build/`
- `dist/`
- `desktop_agent/dist-artifacts/`

## Company Laptop Codex Prompt

Use this prompt in the company laptop Codex app:

```text
You are working in the NPAMX/PAM repo:

/Users/sowmya/Documents/sso/JIT-PAM-Enterprise

Important rules:
1. Do not redesign or rewrite existing PAM DB access, revoke, approval, ticketing, or desktop-agent flows.
2. Do not make broad refactors.
3. Treat the personal repo branch as the engineering source of truth.
4. Your role is limited to lightweight troubleshooting, verification, and repo coordination.
5. Bug fixes and core logic changes will be done in the personal-laptop Codex chat, not here.
6. Never break current DB access wiring, Vault flows, agent pairing, DB sessions, or approval workflows.
7. Before any change, inspect current files and report impact briefly.

Current important architecture points:
- Frontend is vanilla HTML/CSS/JS
- Main shell: frontend/index.html, frontend/app.js
- DB UI: frontend/databases.js
- DB Governance UI: frontend/db-governance.js
- Backend: backend/app.py
- Agent: desktop_agent/npamx_agent.py

Current functional decisions already made:
- PAM remains the main UI
- DB Governance data must come from PAM backend BFF, not direct browser calls
- Desktop agent latest version is 1.4.6
- First-login workforce profile must require manager verification and mandatory team-name save before general app use
- Team name must be visible to admins in AWS Identity Center users view
- Security tab now owns DB Governance instead of keeping a duplicate top-level DB Governance tab
- Admin Management now contains Pending Approvals and Tickets Management
- Left-side Tickets page should behave as "my tickets"; admin-wide ticket visibility belongs in Tickets Management

Your allowed tasks:
- verify wiring
- inspect logs
- inspect UI data flow
- identify regressions
- prepare tiny safe fixes only if explicitly asked

Your disallowed tasks unless explicitly requested:
- changing auth model
- changing approval logic
- changing revoke logic
- changing agent token/session logic
- replacing PAM frontend structure
- introducing new frameworks

When asked to help:
- first inspect the relevant files
- summarize what is currently wired
- point out risks or bugs
- avoid speculative rewrites
```

## Claude CLI Review Prompt

Use this prompt in Claude CLI when you want a review only, not fixes:

```text
Review this repo for bugs, regressions, wiring issues, security issues, and admin/user flow inconsistencies, but do not modify code.

Repo:
/Users/sowmya/Documents/sso/JIT-PAM-Enterprise

Focus especially on:
- DB access request lifecycle
- DB approval matrix
- optional DB owner approval wiring
- revoke and force revoke behavior
- Redshift/RDS session cleanup behavior
- JIT permission-set lifecycle and deletion after revoke/expiry
- PAM tickets visibility rules
- pending approvals visibility for admins and approvers
- mandatory first-login team-name workforce profile gate
- AWS Identity Center users table showing team values
- security/guardrails enforcement paths
- DB Governance integration under Security tab
- notifications and bell count correctness
- audit log 30-day UI behavior
- admin trends wiring
- desktop agent pairing, heartbeat, status colors, stale AWS profile filtering, and R/W permission-set usability

Rules:
1. Do not edit files.
2. Do not propose a rewrite.
3. Report findings ordered by severity.
4. Include exact file paths and line references where possible.
5. Mention any likely regressions introduced by recent UI rewiring.
6. Mention any security concerns or authorization gaps clearly.
```

## Pre-Push Checklist

### Must-Have Product Rules

- PAM remains primary UI.
- DB Governance is consumed through PAM backend only.
- No direct browser call to DB Governance service.
- Team name is mandatory before using app flows.
- Team must be visible to admins for user tracking.
- Agent changes must preserve pairing, heartbeat, and current DB connection wiring.

### Items Requested And Current Status

1. First-login workforce profile gate
- Status: wired in frontend and backend-supported
- Expected behavior:
  - user sees manager details
  - user is told to verify manager
  - if manager is wrong, contact IT
  - if correct, user must enter team name and save profile
  - until saved, app usage is blocked by the profile gate

2. Show team in admin AWS Identity Center users
- Status: wired
- Backend merges saved business profile fields into live/cached Identity Center user rows
- Frontend users table now has Team column

3. My Requests wiring
- Status: rechecked in code
- DB request status handling currently distinguishes:
  - `pending`
  - `approved`
  - `active`
  - `expired`
  - `rejected`
- Previously fixed local behavior:
  - approved DB views include approved and active where required
  - approved-databases listing no longer hides expired rows silently

4. Tickets tab should show only the current user’s tickets
- Status: wired
- Left-side Tickets page now uses `/api/tickets`
- Export from the left-side page also uses the current user scope

5. Admin should have all-users ticket visibility
- Status: wired
- New `Tickets Management` subtab under `Admin -> Management`
- Uses `/api/admin/tickets`

6. Remove Active Sessions from left nav for users
- Status: already wired earlier

7. Optional DB owner email and pending approval visibility
- Status: wired earlier in backend/request flow
- Needs live validation after deploy:
  - pending email delivery
  - visibility under approvals

8. Pending Approvals under Admin -> Management
- Status: wired in UI
- Backend pending approval payload includes all request families and approver visibility context
- Needs live validation with real pending requests

9. Duplicate / miswired pending approvals under integrations
- Status: cleaned on current UI path
- Management is the intended location

10. Guardrails bypass check
- Status: code review still required
- No new bypass path intentionally added in this pass
- Live verification still required for:
  - cloud
  - db
  - workloads
  - storage

11. Merge Security DB Users with DB Governance
- Status: wired
- Top-level admin DB Governance button removed
- Security subtab now labeled `DB Governance`
- Governance view mounts into Security and local DB inventory remains in same section

12. Audit logs
- Status: UI trimmed
- Audit page defaults to last 30 days through date filters
- Export-to-S3 UI removed from audit screen
- Historical archive remains an S3 concern outside this page

13. Trends tab
- Status: existing chart code still present
- Needs live verification for:
  - day
  - week
  - month
  - year windows
- No major rewrite done in this pass

14. Database sessions latency
- Status: admin revoke UX improved earlier with progress state
- Live performance still depends on backend/Vault/AWS cleanup timing

15. Notifications bell stale counts / old welcome notifications
- Status: earlier filtering fix exists in repo
- Needs live validation after deploy

16. Mass email / preview / CC / BCC / 1000 words
- Status: existing announcement flow already supports:
  - preview-send
  - send
  - CC
  - BCC
  - up to 1000 words
- UI lives under admin feedback/notification area

17. Desktop agent icon/theme/heartbeat
- Status: wired
- Current source version: `1.4.6`
- Includes:
  - pink icon
  - white `N`
  - explicit light-theme palette for readability
  - heartbeat auto-start after login and on app reopen

18. Agent permission-set usability
- Status: wired earlier
- Includes:
  - stale JIT/AWS profile filtering
  - search box for AWS Account / Permission Set
  - inline help markers

19. DB permission-set naming
- Status: wired earlier
- Permission sets now include R/W marker
- DB usernames remain unchanged

20. Non-prod access duration rules
- Status: wired earlier
- Current intended rule:
  - prod: up to 3 days
  - non-prod/sandbox read-only: up to 30 days
  - non-prod/sandbox write/admin: up to 5 days
- Needs live UI validation on request form

## Validation Commands

Run before push:

```bash
python3 -m py_compile /Users/sowmya/Documents/sso/JIT-PAM-Enterprise/backend/app.py /Users/sowmya/Documents/sso/JIT-PAM-Enterprise/desktop_agent/npamx_agent.py
node --check /Users/sowmya/Documents/sso/JIT-PAM-Enterprise/frontend/app.js
node --check /Users/sowmya/Documents/sso/JIT-PAM-Enterprise/frontend/admin-functions.js
node --check /Users/sowmya/Documents/sso/JIT-PAM-Enterprise/frontend/databases.js
node --check /Users/sowmya/Documents/sso/JIT-PAM-Enterprise/frontend/db-governance.js
bash -n /Users/sowmya/Documents/sso/JIT-PAM-Enterprise/desktop_agent/build-agent-macos-linux.sh
```

## Live Validation Checklist

Do these after backend deploy and agent rebuild:

1. First login forces team-name save before normal usage.
2. Manager hint shows correctly.
3. Team appears in Admin -> Identity Center -> Users.
4. Left-side Tickets page shows only the logged-in user’s tickets.
5. Admin -> Management -> Tickets Management shows all users’ tickets.
6. Admin -> Management -> Pending Approvals shows pending items across request families.
7. DB owner email receives approval mail and sees pending item.
8. Security -> DB Governance shows governance data and local DB inventory together.
9. Audit logs default to 30-day range.
10. Notification bell no longer shows stale old welcome items as active unread noise.
11. Agent heartbeat updates last-seen continuously.
12. Agent colors remain readable on dark-theme macOS.
13. Agent permission-set search works and stale deleted entries are not shown.

