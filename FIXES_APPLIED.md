# Fixes Applied - ARN Generation & State Persistence

## Issues Fixed

### 1. ARN Wildcard Issue ✅
**Problem**: AI was generating `"Resource": ["*"]` instead of specific ALB ARNs

**Root Cause**: AI only received service names via `[SELECTED_SERVICES: ...]` tag but not the actual resource ARNs

**Solution**: 
- Updated `conversation_manager.py` to pass actual resource ARNs to AI
- Added `[SELECTED_RESOURCES: service1: arn1, arn2 | service2: arn3]` tag to every user message
- Updated AI system prompt with STEP 5 to use specific ARNs from the tag
- AI now instructed to NEVER use "*" when specific ARNs are provided

**Files Modified**:
- `/Users/satish.korra/Desktop/sso/backend/conversation_manager.py`

**Changes**:
```python
# Before: Only service names
content_text = f"[SELECTED_SERVICES: {', '.join(selected_services)}]\n{msg['content']}"

# After: Service names + actual ARNs
resource_arns = []
for service, resources in selected_resources.items():
    arns = [r.get('id', '') for r in resources]
    resource_arns.append(f"{service}: {', '.join(arns)}")

content_text = f"[SELECTED_SERVICES: {', '.join(selected_services)}]\n[SELECTED_RESOURCES: {' | '.join(resource_arns)}]\n{msg['content']}"
```

**System Prompt Addition**:
```
STEP 5: USE SPECIFIC RESOURCE ARNs
- Extract ARNs from [SELECTED_RESOURCES: ...] tag
- For S3: use both bucket ARN and bucket/* ARN
- For ELB/ALB: ARN is already complete (arn:aws:elasticloadbalancing:...)
- For EC2/Lambda/RDS: ARN is already complete
- NEVER use "*" wildcard when specific ARNs are provided in [SELECTED_RESOURCES]
```

---

### 2. Page State Persistence Issue ✅
**Problem**: When navigating between tabs, account and service selections were lost

**Root Cause**: No localStorage persistence for wizard state

**Solution**:
- Added `loadWizardState()` function to restore saved state on page load
- Added `saveWizardState()` function to save state whenever resources are selected/deselected
- Added `clearWizardState()` function to reset state when starting new request
- State includes: accountId, selectedResources, timestamp

**Files Modified**:
- `/Users/satish.korra/Desktop/sso/frontend/wizard.js`

**Functions Added**:
```javascript
function loadWizardState() {
    const saved = localStorage.getItem('wizardState');
    if (saved) {
        const state = JSON.parse(saved);
        // Restore account selection
        // Restore selected resources
    }
}

function saveWizardState() {
    localStorage.setItem('wizardState', JSON.stringify({
        accountId: accountId,
        selectedResources: selectedResources,
        timestamp: Date.now()
    }));
}
```

**Auto-save Triggers**:
- When user selects/deselects a service
- When user selects/deselects a resource
- State restored when page loads or user returns to request page

---

### 3. Request Drafts System ✅
**Problem**: No way to save incomplete requests and resume later

**Solution**: Created comprehensive draft system with auto-save

**Files Created**:
- `/Users/satish.korra/Desktop/sso/frontend/request-drafts.js`

**Features**:
- **Save Draft**: Manually save current request with custom name
- **Load Drafts**: View all saved drafts in modal with details
- **Auto-save**: Automatically saves every 2 minutes
- **Delete Draft**: Remove unwanted drafts
- **Draft Details**: Shows account, resources, use case, timestamp
- **Restore**: One-click restore of entire request state

**Draft Storage**:
- Stores last 20 drafts in localStorage
- Each draft includes:
  - Account ID
  - Selected resources
  - Duration
  - Justification
  - Use case
  - Conversation ID
  - Conversation history
  - Timestamp

**UI Integration**:
- Added "Save Draft" and "Load Drafts" buttons in AI Copilot section
- Drafts modal shows all saved requests with resource counts
- Click to load, trash icon to delete

**Files Modified**:
- `/Users/satish.korra/Desktop/sso/frontend/index.html` - Added buttons and script include

---

## Testing Instructions

### Test 1: ARN Generation
1. Refresh browser (Cmd+R)
2. Go to "My Requests" tab
3. Select account
4. Select "Custom Access (AI)"
5. Select elasticloadbalancing service
6. Select an ALB resource
7. In AI chat, type: "delete this alb"
8. Check browser console (Cmd+Option+I) - should see `[SELECTED_RESOURCES: elasticloadbalancing: arn:aws:...]`
9. Generate policy - should show specific ALB ARN, NOT "*"

### Test 2: State Persistence
1. Select account and resources
2. Navigate to "Policies" tab
3. Navigate back to "My Requests" tab
4. Account and resources should still be selected

### Test 3: Request Drafts
1. Select account and resources
2. Type something in AI chat
3. Click "Save Draft" button
4. Clear selections (refresh page)
5. Click "Load Drafts" button
6. Click on saved draft
7. All selections should be restored

### Test 4: Auto-save
1. Select account and resources
2. Wait 2 minutes
3. Click "Load Drafts"
4. Should see auto-saved draft with timestamp

---

## Backend Changes Summary

**File**: `conversation_manager.py`
- Line ~175: Added resource ARN extraction and formatting
- Line ~185: Updated system prompt to include [SELECTED_RESOURCES] tag
- Line ~220: Added STEP 5 for using specific ARNs

---

## Frontend Changes Summary

**File**: `wizard.js`
- Lines 1-30: Added state persistence functions
- Line 45: Call loadWizardState() after loading accounts
- Line 100: Call clearWizardState() when resetting
- Line 220: Call saveWizardState() when toggling services
- Line 305: Call saveWizardState() when toggling resources

**File**: `request-drafts.js` (NEW)
- Complete draft management system
- Save, load, delete, auto-save functionality

**File**: `index.html`
- Line 462-475: Added draft buttons to AI Copilot section
- Line 2414: Included request-drafts.js script

---

## Expected Behavior After Fixes

1. **Specific ARNs**: AI will generate policies with actual resource ARNs instead of "*"
2. **Persistent State**: Account/service/resource selections persist when switching tabs
3. **Draft System**: Users can save incomplete requests and resume later
4. **Auto-save**: Requests automatically saved every 2 minutes
5. **No Data Loss**: Users won't lose progress when navigating away

---

## Notes

- SSO credentials expired - need to refresh bedrock_config.json with new temp credentials
- Backend running on http://127.0.0.1:5000
- All changes are backward compatible
- No database changes required
- localStorage used for client-side persistence (no backend changes needed)
