# JIT ACCESS PORTAL - STRICT RULES
## NEVER BREAK THESE RULES - READ BEFORE ANY CODE CHANGE

---

## 1. BEDROCK AI INTEGRATION RULES

### 1.1 Selected Resources Context
**CRITICAL**: Selected resources MUST be passed to Bedrock in EVERY user message, not just the first one.

```python
# ✅ CORRECT - Add to EVERY user message
if msg['role'] == 'user' and selected_services:
    content_text = f"[SELECTED_SERVICES: {', '.join(selected_services)}]\n{msg['content']}"

# ❌ WRONG - Only adding to first message
messages[0]['content'][0]['text'] = f"selected_resources: {', '.join(selected_services)}\n\n{messages[0]['content'][0]['text']}"
```

**Location**: `/backend/conversation_manager.py` - `_ask_bedrock_ai()` method

---

### 1.2 System Prompt Requirements
**CRITICAL**: System prompt MUST include:
1. Instruction to check `[SELECTED_SERVICES: ...]` tag
2. Validation step: If service NOT in tag, respond with warning
3. Both specific actions AND wildcards (Describe*, List*, Get*)
4. Complete action sets for common operations (attach VPC, modify health check, etc.)

**Location**: `/backend/conversation_manager.py` - `system_prompt` variable

---

### 1.3 Service Validation
**RULE**: AI must validate requested service exists in selected_resources BEFORE generating permissions.

```
If user asks for S3 but selected_resources = {lambda, ec2}:
Response: "⚠️ You haven't selected S3 resources. Please select S3 first."
```

---

## 2. PERMISSION GENERATION RULES

### 2.1 Action Completeness
**CRITICAL**: Always include BOTH specific actions AND wildcards

```json
// ✅ CORRECT
"actions": [
  "elasticloadbalancing:RegisterTargets",
  "elasticloadbalancing:DescribeTargetGroups", 
  "elasticloadbalancing:Describe*"
]

// ❌ WRONG - Only wildcards
"actions": ["elasticloadbalancing:Describe*"]

// ❌ WRONG - Missing wildcards
"actions": ["elasticloadbalancing:RegisterTargets"]
```

---

### 2.2 Intent Detection
**RULE**: Correctly identify user intent from keywords

- **DELETE**: delete, remove, cleanup, housekeep, terminate, destroy, wipe
- **WRITE**: attach, detach, update, modify, change, configure, create, add, register, enable, disable, put, set
- **READ**: read, view, list, describe, get, see, show, check

**Example**: "attach vpc to lambda" = WRITE intent, NOT READ

---

### 2.3 Resource ARN Generation
**RULE**: Build specific ARNs from selected_resources, not wildcards

```python
# ✅ CORRECT
if service == 's3':
    arns.append(f"arn:aws:s3:::{resource_id}")
    arns.append(f"arn:aws:s3:::{resource_id}/*")

# ❌ WRONG
arns = ['*']
```

**Location**: `/backend/app.py` - `build_resource_arns()` function

---

## 3. FRONTEND-BACKEND DATA FLOW

### 3.1 Selected Resources Structure
**CRITICAL**: Frontend must send selected_resources in this exact format:

```javascript
{
  "s3": [{"id": "my-bucket", "name": "my-bucket"}],
  "lambda": [{"id": "my-function", "name": "my-function"}],
  "elasticloadbalancing": [{"id": "arn:...", "name": "my-alb"}]
}
```

**Location**: `/frontend/wizard.js` - `selectedResources` variable

---

### 3.2 API Call Structure
**RULE**: Always pass selected_resources to backend

```javascript
// ✅ CORRECT
fetch('/api/generate-permissions', {
    body: JSON.stringify({ 
        use_case: useCase,
        account_id: accountId,
        conversation_id: conversationId,
        selected_resources: selectedResources  // MUST INCLUDE
    })
})
```

**Location**: `/frontend/wizard.js` - `chatWithAI()` function

---

### 3.3 Backend Conversation Storage
**RULE**: Store selected_resources in conversation object

```python
# ✅ CORRECT
ConversationManager.conversations[conversation_id] = {
    'selected_resources': selected_resources or {},  // MUST STORE
    'messages': [...],
    ...
}
```

**Location**: `/backend/conversation_manager.py` - `start_conversation()` method

---

## 4. POLICY PERSISTENCE RULES

### 4.1 Generated Policy Storage
**RULE**: Store generated policy globally AND update Policy page

```javascript
// ✅ CORRECT
let currentGeneratedPolicy = null;

function showPolicyModal(policy) {
    currentGeneratedPolicy = policy;  // Store globally
    updatePolicyPage(policy);         // Update Policy tab
    // ... show modal
}
```

**Location**: `/frontend/wizard.js` - `showPolicyModal()` function

---

### 4.2 Policy Page Display
**RULE**: Policy must persist after modal closes

```javascript
function updatePolicyPage(policy) {
    const policyContent = document.getElementById('policyContent');
    policyContent.innerHTML = `...${JSON.stringify(policy, null, 2)}...`;
}
```

**Location**: `/frontend/wizard.js` - `updatePolicyPage()` function

---

## 5. CHAT TIMEOUT RULES

### 5.1 Timer Management
**RULE**: 5-minute backend timeout, 4.5-minute frontend warning

```python
# Backend
'expires_at': datetime.now() + timedelta(minutes=5)

# Frontend
setTimeout(() => { /* warning */ }, 4.5 * 60 * 1000)
```

**Locations**: 
- `/backend/conversation_manager.py` - `start_conversation()`
- `/frontend/wizard.js` - `startChatExpiryTimer()`

---

### 5.2 Auto-save on Expiry
**RULE**: Save conversation to drafts if user doesn't respond

```javascript
function saveChatToDraft() {
    const chatDrafts = JSON.parse(localStorage.getItem('chatDrafts') || '[]');
    chatDrafts.unshift({...});
    localStorage.setItem('chatDrafts', JSON.stringify(chatDrafts.slice(0, 5)));
}
```

**Location**: `/frontend/wizard.js` - `saveChatToDraft()` function

---

## 6. GUARDRAILS RULES

### 6.1 Guardrails Feature Location
**CRITICAL**: Guardrails MUST remain in Security tab, never remove

**Location**: `/frontend/index.html` - Admin Panel > Security > Guardrails sub-tab

**Components**:
1. Service Access Restrictions (block KMS, Secrets Manager, etc.)
2. Delete Operation Restrictions (block delete on specific services)
3. Create Operation Restrictions (block create on specific services)
4. Custom Guardrails (tag-based, name pattern, ARN pattern)
5. AI Guardrail Generator (with MFA verification)

### 6.2 AI Guardrails Generator Workflow
**RULE**: AI must parse admin requirements and generate appropriate guardrails

**Example Input**: "Block all delete operations on production KMS keys and Secrets Manager"

**Expected Output**:
```json
{
  "serviceRestrictions": [],
  "deleteRestrictions": [
    {"service": "kms", "environment": "prod", "reason": "Prevent accidental key deletion"},
    {"service": "secretsmanager", "environment": "prod", "reason": "Protect sensitive credentials"}
  ],
  "createRestrictions": [],
  "customGuardrails": []
}
```

**Service Mapping**:
- "management account" → organizations
- "identity store" → identitystore
- "kms" or "encryption keys" → kms
- "secrets manager" → secretsmanager

**MFA Requirement**: 6-digit MFA token required for AI-generated guardrails

**Location**: `/backend/guardrails_generator.py` - `generate_guardrails()` method

### 6.2 IP Restrictions
**CRITICAL**: IP restrictions MUST remain in Security tab

**Components**:
- Blocked IP Addresses list
- Allowed IP Addresses (whitelist)
- Enable/disable IP whitelist toggle

**Location**: `/frontend/index.html` - Admin Panel > Security > Security sub-tab

---

## 7. SECURITY RULES

### 6.1 KMS Deletion
**RULE**: KMS deletion is STRICTLY FORBIDDEN

```python
if 'kms' in service and 'delete' in action.lower():
    return {'error': '❌ KMS deletion forbidden. Contact CISO.'}
```

**Locations**: 
- `/backend/conversation_manager.py` - System prompt
- `/backend/app.py` - Validation layer

---

### 6.2 Delete/Create Toggle Respect
**CRITICAL**: AI MUST respect admin toggle settings for delete/create operations

```python
# ✅ CORRECT - Check toggle settings based on account environment
if has_delete_intent:
    if account_env == 'prod':
        delete_allowed = policy_config.get('allow_delete_prod', False)
    else:
        delete_allowed = policy_config.get('allow_delete_nonprod', False)
    
    if not delete_allowed:
        return {'error': 'Delete disabled by admin'}

# ❌ WRONG - Hardcoded blocking without checking toggles
if 'DELETE' in detected_intents:
    return {'error': 'Destructive operation detected'}
```

**Location**: `/backend/app.py` - `generate_fallback_permissions()` function

**RULE**: Intent classifier should NOT block delete operations - let StrictPolicies handle it based on toggle settings

### 6.3 Delete Confirmation
**RULE**: DELETE operations require explicit confirmation from AI

```
User: "delete s3 objects"
AI: "⚠️ Confirm deletion of S3 resources?"
User: "yes" or "confirm"
AI: Generate delete permissions
```

---

## 7. TESTING CHECKLIST

Before committing ANY change, verify:

- [ ] Selected resources passed to Bedrock in EVERY message
- [ ] System prompt includes [SELECTED_SERVICES: ...] validation
- [ ] Generated actions include BOTH specific + wildcards
- [ ] Intent correctly identified (attach = WRITE, not READ)
- [ ] Service validation works (blocks unselected services)
- [ ] Generated policy persists in Policy tab
- [ ] Resource ARNs are specific, not wildcards
- [ ] Chat timeout and auto-save working

---

## 8. COMMON MISTAKES TO AVOID

### ❌ MISTAKE 1: Only adding selected_resources to first message
**FIX**: Add to EVERY user message with `[SELECTED_SERVICES: ...]` tag

### ❌ MISTAKE 2: Generating only wildcards (Describe*)
**FIX**: Include BOTH specific actions AND wildcards

### ❌ MISTAKE 3: Wrong intent detection (attach = READ)
**FIX**: Update WRITE keywords list, add examples to system prompt

### ❌ MISTAKE 4: Not validating service selection
**FIX**: Check [SELECTED_SERVICES: ...] tag before generating

### ❌ MISTAKE 5: Policy disappears after modal closes
**FIX**: Store in currentGeneratedPolicy + update Policy page

---

## 9. FILE LOCATIONS REFERENCE

| Component | File | Key Functions |
|-----------|------|---------------|
| Bedrock AI | `/backend/conversation_manager.py` | `_ask_bedrock_ai()`, `start_conversation()` |
| Permission Generation | `/backend/app.py` | `generate_permissions()`, `build_resource_arns()` |
| Frontend Chat | `/frontend/wizard.js` | `chatWithAI()`, `showPolicyModal()`, `updatePolicyPage()` |
| Policy Display | `/frontend/index.html` | Policy page, Troubleshooting page |

---

## 10. DEBUGGING COMMANDS

```bash
# Check Bedrock credentials
grep -A 3 "Bedrock AI enabled" backend/logs.txt

# Verify selected_resources in message
grep "SELECTED_SERVICES" backend/logs.txt

# Check generated actions
grep "actions" backend/logs.txt | tail -5
```

---

## FINAL RULE: READ THIS DOCUMENT BEFORE EVERY CODE CHANGE
