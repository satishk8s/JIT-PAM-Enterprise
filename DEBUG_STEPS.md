# Debugging Steps for Request Modal

## Issue
1. Clicking "Cloud Access" tab should show only cloud provider cards, but all tabs are showing
2. Clicking "AWS" should show step indicators and accounts + permission sets, but nothing happens

## What to Check

1. **Open Browser Console (F12)**
   - Look for any JavaScript errors
   - Check if functions are being called (you should see console.log messages)

2. **Test Tab Switching**
   - Click "Cloud Access" tab
   - Console should show: "showRequestTypeTab called with type: cloud"
   - Only "cloudAccessTab" panel should be visible
   - Other panels (vmAccessTab, dbAccessTab, storageAccessTab) should be hidden

3. **Test Cloud Provider Selection**
   - Click "AWS" button
   - Console should show: "=== selectCloudProvider called === aws"
   - Type tabs should disappear
   - Flow steps should appear with step indicators
   - Accounts and permission sets should load

4. **If Functions Not Called**
   - Check if `structured-requests.js` is loaded
   - Check browser console for: "✅ structured-requests.js loaded"
   - Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

5. **If CSS Not Working**
   - Check if `structured-requests.css` is loaded
   - Inspect element on panels - they should have `display: none !important` when not active
   - Only active panel should have `display: block !important`

## Expected Console Output

When clicking "Cloud Access":
```
showRequestTypeTab called with type: cloud
Hiding panel: cloudAccessTab
Hiding panel: vmAccessTab
Hiding panel: dbAccessTab
Hiding panel: storageAccessTab
Showing panel: cloudAccessTab
```

When clicking "AWS":
```
=== selectCloudProvider called === aws
✅ Type tabs hidden
Hiding panel: cloudAccessTab
✅ Content area found, creating flow steps...
✅ Flow steps HTML created, length: [number]
✅ Flow steps inserted, waiting for DOM...
⏳ Loading step 1...
=== loadAccountStep called ===
✅ Loading account step, contentDiv found: [element]
✅ Accounts response: [object]
✅ Permission sets: [array]
✅ Rendering accounts and permission sets...
```



