# Flow Update Required - Implementation Plan

## Current Issues:
1. ✅ Fixed: Separate AI button showing on requests page (now hidden)
2. ⏳ Need: Structured flow: Account → Regions → Permission Sets → Services → Resources (MUST) → Actions → Policy
3. ⏳ Need: Get resources from AWS Resource Manager API
4. ⏳ Need: Policy with explicit ARNs (NO "*")
5. ⏳ Need: Show policy in floating bubble
6. ⏳ Need: Modern UI updates

## New Flow Structure:

### Step 1: Account Selection
- User clicks account card
- AI shows: "Great! Which region do you need access to?"

### Step 2: Region Selection  
- Show regions for selected account
- User clicks region
- AI shows: "Would you like to use an existing permission set or create custom permissions?"

### Step 3: Permission Set Selection
- Show available permission sets
- User can:
  - Click a permission set → Use it (skip to justification)
  - Click "Create Custom" → Continue to services

### Step 4: Service Selection (if custom)
- Show services
- User clicks services
- AI shows: "Now I need to know which specific resources. Let me fetch them..."

### Step 5: Resource Selection (COMPULSORY)
- Fetch resources from AWS Resource Manager API for selected service
- Show resource cards
- User MUST select at least one resource
- AI asks: "What actions do you need on these resources?"

### Step 6: Actions Selection
- User describes actions (e.g., "read", "write", "delete")
- AI clarifies and confirms

### Step 7: Policy Generation
- Generate policy with EXPLICIT resource ARNs (NO "*")
- Show policy in floating bubble
- Ask: "Would you like to see the policy?"
- If yes → Show in floating bubble
- Then: "Ready to submit for approval?"

### Step 8: Approval Process
- Show services available based on Resource Manager API
- Submit request

## Files to Update:

1. `backend/unified_assistant.py` - Update flow logic
2. `backend/app.py` - Add resource fetching, update policy generation
3. `frontend/unified-assistant.js` - Update to handle new steps
4. `frontend/requests-chat.js` - Update flow
5. `frontend/unified-assistant.css` - Modern UI updates
6. Policy generation - Ensure NO "*" in resource ARNs

## Next Steps:
1. Update backend flow logic
2. Add resource fetching from Resource Manager
3. Update frontend to show resources
4. Update policy generation
5. Add floating policy bubble
6. Modernize UI



