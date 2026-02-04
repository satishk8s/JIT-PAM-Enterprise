# Test Terminal Flow

## Step 1: Submit Instance Access Request
1. Go to **Instances** page (sidebar)
2. Select an account from dropdown
3. Check one or more instances
4. Click **Request Access** button
5. Fill the form:
   - Request For: Myself
   - Duration: 2 hours
   - Sudo Access: Toggle ON/OFF
   - Justification: "Testing terminal access"
6. Click **Submit Request**
7. You'll see: "⏳ Access request submitted! Status: Pending Approval"

## Step 2: Approve the Request
1. Go to **My Requests** page (sidebar)
2. Find your request (status: PENDING)
3. Click the **✓** (checkmark) button to approve
4. Confirm approval
5. Status changes to APPROVED

## Step 3: Connect via Terminal
1. Go to **Terminal** page (sidebar - bottom)
2. You'll see "My Approved Instances" table
3. Your approved instances will be listed with:
   - Instance ID
   - Name
   - Private IP
   - Expires At
   - **Connect** button
4. Click **Connect** button
5. AWS Session Manager will open in a new tab
6. You'll be logged into the EC2 instance

## What Happens Behind the Scenes:
- When approved, backend creates a user on the EC2 instance via SSM
- User is added to sudoers if sudo was approved
- Session Manager connects you as that user
- All commands are logged to CloudWatch
- On expiry, user is automatically removed from the instance

## To Test Now:
1. Restart backend: `python app.py`
2. Refresh browser
3. Follow steps above
