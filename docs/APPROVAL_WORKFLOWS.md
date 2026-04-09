# NPAMX Approval Workflow Runbook

This document explains how approval workflows work in NPAMX, how they are matched, and how they affect runtime request behavior.

## What Approval Workflows Control

Approval workflows determine:

- whether a request can be created for a given context
- who must approve it
- whether self-approval is allowed
- which stage is currently pending
- which approvers see the request

For database access, this is enforced at request creation and during approval actions.

## Workflow Match Criteria

Each workflow can match on:

- service type
- AWS account(s)
- environment
- data classification
- access level

For database requests, the final matching context is built from:

- selected account
- environment tag on account / OU / root
- database classification tags
- requested DB access level

## Current Database Access Model

The platform is designed around this style of approval matrix:

- nonprod + read only -> self approval
- nonprod + write/admin -> manager or named approver
- prod + non-PII + read -> controlled approval
- prod + PII + write -> strictest workflow / additional controls

## Workflow Fields

Key workflow-level fields:

- workflow name
- priority
- service type
- account selection
- environments
- data classifications
- access levels
- primary approver email
- secondary approver email
- security lead email

Key stage-level fields:

- stage name
- approver type
- mode
- primary approver email
- fallback approver email
- fallback reason

## Supported Approver Types

Current effective stage approver types include:

- `self`
- `self_approval`
- `requester`
- `requestor`
- `primary approver`
- `secondary approver`
- `security lead`
- specific email approver

For self-approval stages:

- requester becomes the stage approver
- request must still match a workflow that allows that access level

## Important Safety Rule

Self approval must not be used broadly for write/admin database access.

Current enforcement:

- self-approval workflows are allowed for read-only use cases
- write/admin workflows should point to named approvers

Recommended configuration:

### Nonprod Read Self

- environment: `NonProd`
- access levels: `Read Only`
- stage 1 approver type: `self`

### Nonprod Write Manager

- environment: `NonProd`
- access levels:
  - `Limited Write`
  - `Full Write`
  - `Admin`
- primary approver email: manager email
- stage 1 approver type: `primary approver`

## Runtime Behavior

## 1. Request Creation

When a user submits a request:

1. NPAMX computes request context
2. matching workflows are evaluated
3. highest-priority valid workflow wins
4. request is created with workflow metadata

The request stores:

- approval workflow name
- pending stage
- pending approvers
- approval history

## 2. Request Visibility

Database requests should be visible to:

- requester
- current approvers
- admins

This is important for:

- self-approval flows
- orphaned pending requests
- admin cleanup

## 3. Approval

When an approver clicks approve:

1. current stage is validated
2. approver identity is checked
3. stage is completed
4. if more stages remain, next stage becomes pending
5. if final stage completes, request becomes `approved`
6. activation can proceed

## 4. Activation

Approval completion does not automatically mean the user can already connect.

For database requests, activation includes:

- Vault JIT DB user creation
- IAM permission-set creation/assignment
- session state persistence

If activation fails, request can remain `approved` with an activation issue.

## 5. Active State

Once activation completes, request becomes `active`.

Then:

- user sees login details
- active sessions appear for admins
- revoke becomes meaningful

## 6. Revoke

Admin revoke should:

- revoke Vault lease / DB access
- clean up session state
- mark request `revoked`

If external cleanup succeeds but request state is stale, the request can still appear active in UI until persistence is corrected.

## Example Database Matrix

Recommended initial matrix:

### Workflow A: Nonprod Read Self

- service type: `Database`
- accounts: nonprod accounts
- environment: `NonProd`
- data classifications: leave broad initially if needed
- access levels: `Read Only`
- stage 1: `self`

### Workflow B: Nonprod Write Manager

- service type: `Database`
- accounts: nonprod accounts
- environment: `NonProd`
- access levels:
  - `Limited Write`
  - `Full Write`
  - `Admin`
- primary approver email: manager email
- stage 1: `primary approver`

### Workflow C: Prod Sensitive

- service type: `Database`
- accounts: prod accounts
- environment: `Prod`
- data classifications:
  - `pii`
  - `strict`
  - `confidential`
- access levels:
  - `Read Only`
  - `Limited Write`
  - `Full Write`
  - `Admin`
- stage 1: `primary approver`
- stage 2: `security lead`

## Troubleshooting

### 1. Request does not show under My Requests

Check:

- requester email stored on request
- request type is `database_access`
- status filter is correct
- requester/admin visibility rules

Useful host check:

```bash
sqlite3 /opt/npamx/data/npamx.db "select request_id, user_email, status, type from requests order by created_at desc limit 20;"
```

### 2. Self approval does not show approve button

Check:

- workflow stage approver type is really `self`
- access level did not accidentally match a write/admin workflow
- requester identity is the same email stored on the request

### 3. Request success message says pending but list is empty

This can be caused by:

- wrong status tab selected
- stale frontend request list
- backend visibility issue

### 4. Orphaned pending requests

Admins should be able to delete stale pending requests.

Host checks:

```bash
sqlite3 /opt/npamx/data/npamx.db "select request_id, status, user_email from requests where type='database_access';"
```

### 5. Approved request does not become active

Check activation path:

- Vault DB user creation
- IAM permission-set creation
- request activation error fields
- backend logs

### 6. Revoke does not disappear from UI

Check:

```bash
sqlite3 /opt/npamx/data/npamx.db "select request_id, status, json_extract(payload_json,'$.status') from requests where request_id='<REQUEST_ID>';"
sqlite3 /opt/npamx/data/npamx.db "select request_id, db_username, lease_id from db_sessions where request_id='<REQUEST_ID>';"
```

If needed, stale state can be corrected in SQLite and then the app restarted.

## Operational Notes

- Approval workflows are backend-managed data, not hardcoded frontend behavior.
- Environment and classification tagging directly influence workflow match.
- Database access should remain strict by default, with explicit read/write separation.
