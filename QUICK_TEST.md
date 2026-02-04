# Quick Test Instructions

## Issue 1: ARN Still Shows "*"

### Test Steps:
1. Refresh browser (Cmd+R)
2. Go to "My Requests"
3. Select account
4. Click "Custom Access (AI)"
5. Select Lambda service
6. Select a Lambda function
7. In AI chat: "delete this lambda"
8. Open Terminal and run:
   ```bash
   tail -f /tmp/sso_backend.log
   ```
9. Look for lines starting with "=== build_resource_arns called ==="
10. Check what it shows for:
    - `selected_resources:`
    - `services:`
    - `Final ARNs:`

### Expected Output in Logs:
```
=== build_resource_arns called ===
selected_resources: {'lambda': [{'id': 'my-function', 'name': 'my-function'}]}
account_id: 123456789012
services: ['lambda']
✅ Final ARNs: ['arn:aws:lambda:ap-south-1:123456789012:function:my-function']
=== build_resource_arns done ===
```

### If You See:
- `selected_resources: {}` → Frontend not sending resources
- `services: []` → AI not detecting services
- `Final ARNs: ['*']` → Check why ARN construction failed

---

## Issue 2: No Save Draft Button

### Test Steps:
1. Refresh browser
2. Go to "My Requests"
3. Select account and resources
4. Scroll to AI Copilot section
5. Look for "Save Draft" button next to "AI Copilot" heading

### Expected:
- Button visible with icon: 💾 Save Draft
- Clicking it saves current request

---

## Issue 3: Wizard State Persists

### Test Steps:
1. Select account
2. Select Load Balancer service
3. Select some resources
4. Navigate to "Policies" tab
5. Navigate back to "My Requests"

### Expected:
- Fresh wizard page
- No account selected
- No services selected
- No resources selected

### If State Persists:
- Check browser console for errors
- Verify clearWizardState() is being called
- Check localStorage: `localStorage.getItem('wizardState')`

---

## Debug Commands

### Watch Backend Logs:
```bash
tail -f /tmp/sso_backend.log | grep -E "build_resource_arns|Selected resources|Final ARNs"
```

### Check Backend Running:
```bash
lsof -i:5000
```

### Clear Browser State:
```javascript
// In browser console (F12)
localStorage.clear();
location.reload();
```

### Test API Directly:
```bash
curl -X POST http://127.0.0.1:5000/api/generate-permissions \
  -H "Content-Type: application/json" \
  -d '{
    "use_case": "delete lambda",
    "account_id": "123456789012",
    "user_email": "test@example.com",
    "selected_resources": {
      "lambda": [{"id": "my-function", "name": "my-function"}]
    }
  }'
```

---

## What Was Fixed

### 1. Wizard State Reset
- Removed `loadWizardState()` from `loadAccountsDropdown()`
- Removed `saveWizardState()` calls from resource selection
- Added `clearWizardState()` call when showing requests page
- State no longer persists between page navigations

### 2. Save Draft Button
- Added "Save Draft" button back to AI Copilot section
- Button appears next to "AI Copilot" heading
- Saves current request to localStorage

### 3. Enhanced ARN Logging
- Added detailed logging in `build_resource_arns()`
- Shows what data is received
- Shows final ARNs generated
- Helps identify where ARN generation fails

---

## Next Steps

1. **Test ARN Generation:**
   - Make a request with Lambda
   - Check backend logs
   - Share the log output if still seeing "*"

2. **Test Wizard Reset:**
   - Navigate between tabs
   - Verify state clears

3. **Test Save Draft:**
   - Click Save Draft button
   - Navigate away
   - Click "Drafts" in menu
   - Verify draft appears

---

## Common Issues

### ARN Shows "*" - Possible Causes:

1. **Frontend not sending resources:**
   - Check browser console for errors
   - Verify `selectedResources` object has data

2. **Backend not receiving resources:**
   - Check logs for "selected_resources: {}"
   - Verify API request payload

3. **Service name mismatch:**
   - Frontend sends "elasticloadbalancing"
   - Backend expects "elasticloadbalancing"
   - Check service name consistency

4. **AI not detecting services:**
   - Check logs for "services: []"
   - AI might not be extracting service names correctly

---

## Files Modified

1. `/Users/satish.korra/Desktop/sso/backend/app.py`
   - Added debug logging to `build_resource_arns()`

2. `/Users/satish.korra/Desktop/sso/frontend/wizard.js`
   - Removed `loadWizardState()` call
   - Removed `saveWizardState()` calls

3. `/Users/satish.korra/Desktop/sso/frontend/app.js`
   - Enhanced `clearWizardState()` call in `showPage()`

4. `/Users/satish.korra/Desktop/sso/frontend/index.html`
   - Added "Save Draft" button to AI Copilot section
