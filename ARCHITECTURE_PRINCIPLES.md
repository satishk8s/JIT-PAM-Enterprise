# JIT Access System - Architecture Principles

## 🎯 CORE PRINCIPLE: DYNAMIC EVERYTHING

**CRITICAL RULE**: Nothing should be hardcoded. Everything must act instantly and dynamically.

---

## Dynamic Architecture Requirements

### 1. Service Detection (AWS Services)
- **NEVER** hardcode service-by-service logic with separate if-blocks
- **ALWAYS** use dictionary/map-based approach
- Services defined ONCE in a single data structure
- Adding new service = single line addition to dictionary
- System automatically detects and applies permissions

**Example - CORRECT Approach:**
```python
aws_services = {
    'ec2': {'keywords': ['ec2', 'instance'], 'read': ['ec2:Describe*'], 'delete': ['ec2:TerminateInstances']},
    's3': {'keywords': ['s3', 'bucket'], 'read': ['s3:List*', 's3:Get*'], 'delete': ['s3:DeleteObject']},
    # Add new service here - ONE LINE
}

# Single loop handles ALL services
for service, config in aws_services.items():
    if any(kw in use_case_lower for kw in config['keywords']):
        actions.extend(config['read'])
        if has_delete_intent and delete_allowed:
            actions.extend(config.get('delete', []))
```

**Example - WRONG Approach (NEVER DO THIS):**
```python
# ❌ WRONG - Hardcoded service-by-service logic
if 'ec2' in use_case:
    actions.extend(['ec2:Describe*'])
if 's3' in use_case:
    actions.extend(['s3:List*'])
if 'lambda' in use_case:
    actions.extend(['lambda:List*'])
# This requires code changes for every new service
```

---

### 2. Configuration Changes
- **NO Flask restarts** required for config changes
- Policy toggles (Delete/Create/Admin) apply instantly
- Account environment tags update in real-time
- Permission changes take effect immediately

---

### 3. Resource Discovery
- Use AWS APIs to discover resources dynamically
- **NEVER** maintain static lists of resources
- Resource Groups Tagging API for service discovery
- Describe/List APIs for resource enumeration

---

### 4. Validation Rules
- Wildcard validation based on action patterns (read vs write)
- Dynamic keyword matching for intent detection
- No hardcoded action lists except for ALWAYS_FORBIDDEN

---

### 5. UI Components
- Service selection populated from API responses
- Account dropdowns from AWS Organizations
- Permission sets from SSO Admin API
- Resources fetched on-demand per service

---

## Implementation Checklist

When adding ANY new feature, ask:

1. ✅ Can this be data-driven instead of code-driven?
2. ✅ Does this require code changes or just data updates?
3. ✅ Will adding similar items require code modifications?
4. ✅ Can this be discovered/fetched from AWS APIs?
5. ✅ Does this work instantly without restarts?

If answer to #3 is YES → **REFACTOR to dynamic approach**

---

## Key Dynamic Components

### Backend (app.py)
- `aws_services` dictionary: Single source for all service definitions
- Dynamic loop processes all services uniformly
- Policy config loaded from StrictPolicies class
- Account environment from CONFIG dictionary

### Frontend (wizard.js)
- Services loaded via `/api/discover-services`
- Resources loaded via `/api/resources/<service>`
- Accounts loaded via `/api/accounts`
- Permission sets loaded via `/api/permission-sets`

### Validation (strict_policies.py)
- Wildcard validation uses pattern matching
- Read action prefixes: `['get', 'list', 'describe', 'read', 'view', 'fetch', 'query', 'scan']`
- Dynamic environment-based policy enforcement

---

## Anti-Patterns to AVOID

❌ **Hardcoded Service Lists**
```python
if service == 'ec2':
    # 50 lines of EC2 logic
elif service == 's3':
    # 50 lines of S3 logic
elif service == 'lambda':
    # 50 lines of Lambda logic
```

❌ **Static Resource Lists**
```python
services = ['ec2', 's3', 'lambda', 'rds']  # WRONG
```

❌ **Restart-Required Config**
```python
# Config loaded once at startup - WRONG
CONFIG = load_config()  # Never reloaded
```

❌ **Duplicate Logic**
```python
# Same logic repeated for each service - WRONG
if 'ec2' in use_case:
    actions.append('ec2:Describe*')
    if delete_allowed:
        actions.append('ec2:TerminateInstances')

if 's3' in use_case:
    actions.append('s3:List*')
    if delete_allowed:
        actions.append('s3:DeleteObject')
```

---

## Benefits of Dynamic Architecture

1. **Extensibility**: Add new AWS services without code changes
2. **Maintainability**: Single source of truth for service definitions
3. **Instant Updates**: Config changes apply immediately
4. **Scalability**: Handles any number of services uniformly
5. **Testability**: Easy to test with different service configurations
6. **Future-Proof**: Works with new AWS services automatically

---

## Future Enhancements (All Dynamic)

- [ ] Load `aws_services` dictionary from database/config file
- [ ] Admin UI to add/edit service definitions
- [ ] Auto-discover new AWS services via AWS API
- [ ] Dynamic policy rule engine (rules stored in DB)
- [ ] Real-time config sync across multiple backend instances

---

## Remember

> "If you find yourself copying and pasting code with minor changes, you're doing it wrong. Make it data-driven."

> "If adding a new item requires modifying code in multiple places, refactor to a dynamic approach."

> "The best code is code that doesn't need to change when requirements change."

---

## Security Policies Enforced

### 1. ALWAYS Forbidden Actions (Never Allowed)
- `*` - Wildcard permissions
- IAM: CreateUser, CreateRole, AttachUserPolicy, AttachRolePolicy, PutUserPolicy, PutRolePolicy, DeleteUser, DeleteRole
- `organizations:*` - Organization management
- `account:*` - Account management  
- `sts:AssumeRole` - Privilege escalation prevention
- `lambda:CreateFunction`, `lambda:UpdateFunctionCode` - Code execution prevention
- `ec2:RunInstances` - Instance creation
- `rds:CreateDBInstance` - Database creation
- `s3:DeleteBucket` - Bucket deletion always forbidden
- `dynamodb:DeleteTable` - Table deletion always forbidden
- `kms:ScheduleKeyDeletion` - Key deletion always forbidden

### 2. Configurable Delete Actions (Admin Toggle)
- `s3:DeleteObject`, `s3:DeleteObjectVersion`
- `logs:DeleteLogStream`, `logs:DeleteLogGroup`
- `lambda:DeleteFunction`
- `ec2:TerminateInstances`
- `rds:DeleteDBInstance`
- `secretsmanager:DeleteSecret`
- `dynamodb:DeleteItem`
- `sqs:DeleteQueue`, `sns:DeleteTopic`

### 3. Forbidden Keywords (Prompt Injection Prevention)
- "full access", "all permissions", "*:*"
- "create user", "create role", "delete user", "delete role"
- "attach policy", "detach policy", "assume role"
- "bypass", "override", "ignore policy", "disable security"

### 4. Wildcard Rules
- ✅ Allowed for read actions: `Get*`, `List*`, `Describe*`, `Read*`, `View*`, `Fetch*`, `Query*`, `Scan*`
- ❌ Blocked for write actions

### 5. Max Duration Limits
- Production: 8 hours
- Non-Production: 120 hours (5 days)
- Sandbox: 168 hours (7 days)

### 6. Secrets Manager
- Must specify exact secret ARN
- Wildcard `*` not allowed

### 7. Resource Patterns
- No IAM role access: `arn:aws:iam::*:role/*`
- No IAM user access: `arn:aws:iam::*:user/*`

### 8. Approval Requirements
- Production: Manager + Security approval
- Write actions: Manager approval
- Read-only: Self-approval

### 9. Cancellation Detection
- Detects negative intent: "no more required", "poc over", "not needed", "cancel"
- Prevents accidental permission generation

---

**Last Updated**: 2024-01-15
**Principle Owner**: System Architect
**Status**: MANDATORY - All developers must follow
