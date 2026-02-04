# Testing Guide - ARN Fix & Wizard Reset

## Changes Applied

### 1. Backend Debug Logging
- Added debug logs to trace ARN generation
- Logs show: Built ARNs, Services, Selected Resources

### 2. Wizard State Management
- **Reset on Navigation**: Wizard resets when leaving "My Requests" page
- **Reset on Return**: Wizard resets when returning to "My Requests" page
- **Clear on Refresh**: State cleared on page refresh

### 3. Drafts in Navigation
- Moved "Drafts" button from AI Copilot to main navigation menu
- Appears between "My Requests" and "Generated Policy"
- Removed inline Save/Load buttons from AI section

## Testing Steps

### Test 1: ARN Generation (Lambda Delete)
1. Refresh browser (Cmd+R)
2. Go to "My Requests"
3. Select account
4. Click "Custom Access (AI)"
5. Select Lambda service
6. Select a Lambda function
7. In AI chat: "delete this lambda function"
8. Open browser console (Cmd+Option+I)
9. Check backend logs: `tail -f /tmp/sso_backend.log`
10. Look for lines starting with "🔍 Built resource ARNs:"
11. Generated policy should show specific Lambda ARN, NOT "*"

**Expected Output**:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["lambda:DeleteFunction"],
    "Resource": ["arn:aws:lambda:ap-south-1:ACCOUNT_ID:function:FUNCTION_NAME"]
  }]
}
```

### Test 2: Wizard Reset on Navigation
1. Select account and resources
2. Type something in AI chat
3. Navigate to "Policies" tab
4. Navigate back to "My Requests"
5. **Expected**: Fresh wizard page, no selections, no chat history

### Test 3: Wizard Reset on Page Refresh
1. Select account and resources
2. Refresh browser (Cmd+R)
3. Go to "My Requests"
4. **Expected**: Fresh wizard page, no selections

### Test 4: Drafts in Navigation
1. Select account and resources
2. Type in AI chat
3. Click "Drafts" in left navigation menu
4. **Expected**: Drafts modal opens
5. Save a draft (enter name)
6. Navigate away and back
7. Click "Drafts" again
8. **Expected**: Saved draft appears in list

### Test 5: Draft Load and Continue
1. Click "Drafts" in navigation
2. Click on a saved draft
3. **Expected**: 
   - Account selected
   - Resources selected
   - AI chat restored
   - Can continue conversation

## Debug Commands

### Check Backend Logs
```bash
tail -f /tmp/sso_backend.log | grep "🔍"
```

### Check if Backend is Running
```bash
lsof -i:5000
```

### Restart Backend
```bash
lsof -ti:5000 | xargs kill -9; sleep 2; cd /Users/satish.korra/Desktop/sso/backend && nohup python3 app.py > /tmp/sso_backend.log 2>&1 &
```

### Check Browser Console
```
Cmd+Option+I (Mac) or F12 (Windows)
Look for: "Backend response:", "Resources from backend:"
```

## Known Issues & Solutions

### Issue: Still seeing "*" in Resource
**Cause**: Backend might not be receiving selected_resources correctly
**Debug**: 
1. Check browser console for "Resources from backend:"
2. Check backend logs for "🔍 Selected resources:"
3. If empty, frontend isn't sending resources

**Fix**: Verify wizard.js line 462 sends `selected_resources: selectedResources`

### Issue: Wizard not resetting
**Cause**: clearWizardState() not being called
**Debug**: Add `console.log('Clearing wizard state')` in clearWizardState()
**Fix**: Ensure showPage() calls clearWizardState() when pageId === 'requests'

### Issue: Drafts button not working
**Cause**: request-drafts.js not loaded
**Debug**: Check browser console for "loadRequestDrafts is not defined"
**Fix**: Verify index.html includes `<script src="request-drafts.js"></script>`

## Expected Behavior Summary

| Action | Expected Result |
|--------|----------------|
| Delete Lambda | Specific Lambda ARN in policy |
| Delete ALB | Specific ALB ARN in policy |
| Navigate away from requests | Wizard resets |
| Return to requests page | Fresh wizard |
| Page refresh | All state cleared |
| Click Drafts in nav | Modal opens |
| Load draft | Full state restored |

## Files Modified

1. `/Users/satish.korra/Desktop/sso/backend/app.py` - Added debug logging
2. `/Users/satish.korra/Desktop/sso/frontend/wizard.js` - Added reset functions
3. `/Users/satish.korra/Desktop/sso/frontend/app.js` - Added reset on navigation
4. `/Users/satish.korra/Desktop/sso/frontend/index.html` - Moved Drafts to navigation
5. `/Users/satish.korra/Desktop/sso/frontend/request-drafts.js` - Draft management system

## Next Steps if ARN Still Shows "*"

If after testing you still see "*" in resources:

1. Check backend logs for "🔍 Built resource ARNs:" - if it shows correct ARNs, issue is in frontend
2. Check browser console for "Resources from backend:" - if it shows "*", issue is in backend
3. If backend shows correct ARNs but frontend shows "*", check wizard.js showPolicyModal() function
4. If backend shows "*", check if selected_resources is being passed correctly to build_resource_arns()
