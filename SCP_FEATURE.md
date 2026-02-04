# SCP Management Feature

## Tool Name Recommendations

**Top 5 Names:**
1. **CloudGuard Access Manager** ⭐ (Recommended)
2. Sentinel Access Platform
3. Nexus Cloud Governance
4. Prism Access Control
5. Aegis Cloud Manager

**Why "CloudGuard Access Manager":**
- Professional and enterprise-ready
- Clearly conveys security + access management
- Scalable name that fits JIT, PAM, and governance features
- Easy to remember and pronounce
- Works well for branding and marketing

---

## New Feature: SCP Management

### What is SCP Management?

Service Control Policies (SCPs) are AWS Organization-level policies that define maximum permissions for accounts. This feature allows admins to manage SCPs without accessing AWS Console.

### Features Implemented

#### 1. List All SCPs
- View all SCPs in organization
- Shows AWS-managed and custom policies
- Displays policy name, description, and type

#### 2. View SCP Details
- See full policy JSON content
- View attached accounts/OUs
- Read-only mode for AWS-managed policies

#### 3. Create New SCP
- Custom policy name and description
- JSON editor with syntax validation
- Template provided for quick start

#### 4. Edit SCP
- Modify policy content
- Update name and description
- Real-time JSON validation

#### 5. Delete SCP
- Remove custom SCPs
- Confirmation prompt
- Cannot delete AWS-managed policies

#### 6. Attach/Detach SCPs
- Attach policies to accounts or OUs
- Detach policies from targets
- View current attachments

---

## Files Created

### Backend
1. `/Users/satish.korra/Desktop/sso/backend/scp_manager.py`
   - SCPManager class with all SCP operations
   - Methods: list_policies, get_policy_content, create_policy, update_policy, delete_policy, attach_policy, detach_policy

### Frontend
2. `/Users/satish.korra/Desktop/sso/frontend/scp-manager.js`
   - UI functions for SCP management
   - Modal dialogs for create/view/edit
   - API integration

### Modified Files
3. `/Users/satish.korra/Desktop/sso/backend/app.py`
   - Added 8 new API endpoints for SCP operations

4. `/Users/satish.korra/Desktop/sso/frontend/index.html`
   - Added "SCPs" tab in admin panel
   - Included scp-manager.js script

5. `/Users/satish.korra/Desktop/sso/frontend/app.js`
   - Updated showAdminTab() to handle SCPs tab

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/scps` | List all SCPs |
| GET | `/api/admin/scps/<policy_id>` | Get SCP details |
| POST | `/api/admin/scps` | Create new SCP |
| PUT | `/api/admin/scps/<policy_id>` | Update SCP |
| DELETE | `/api/admin/scps/<policy_id>` | Delete SCP |
| POST | `/api/admin/scps/<policy_id>/attach` | Attach SCP to target |
| POST | `/api/admin/scps/<policy_id>/detach` | Detach SCP from target |
| GET | `/api/admin/accounts/<account_id>/scps` | Get account's SCPs |

---

## How to Use

### Access SCP Management
1. Login as admin
2. Go to "Admin" page
3. Click "SCPs" tab
4. View all SCPs in organization

### Create New SCP
1. Click "Create SCP" button
2. Enter policy name (e.g., "DenyS3DeleteInProd")
3. Add description
4. Edit JSON policy content
5. Click "Create SCP"

### View SCP
1. Click "View" button on any SCP
2. See full policy JSON
3. View attached accounts/OUs
4. Click "Close" to exit

### Edit SCP
1. Click "Edit" button on custom SCP
2. Modify JSON content
3. Click "Save Changes"

### Delete SCP
1. Click trash icon on custom SCP
2. Confirm deletion
3. SCP removed from organization

---

## Example SCP Policies

### 1. Deny S3 Bucket Deletion in Production
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Action": ["s3:DeleteBucket"],
    "Resource": "*"
  }]
}
```

### 2. Deny EC2 Instance Termination
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Action": ["ec2:TerminateInstances"],
    "Resource": "*"
  }]
}
```

### 3. Restrict Regions
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Action": "*",
    "Resource": "*",
    "Condition": {
      "StringNotEquals": {
        "aws:RequestedRegion": ["us-east-1", "ap-south-1"]
      }
    }
  }]
}
```

### 4. Deny KMS Key Deletion
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Action": [
      "kms:ScheduleKeyDeletion",
      "kms:DeleteAlias"
    ],
    "Resource": "*"
  }]
}
```

---

## Security Considerations

1. **IAM Permissions Required:**
   - `organizations:ListPolicies`
   - `organizations:DescribePolicy`
   - `organizations:CreatePolicy`
   - `organizations:UpdatePolicy`
   - `organizations:DeletePolicy`
   - `organizations:AttachPolicy`
   - `organizations:DetachPolicy`

2. **Best Practices:**
   - Test SCPs in non-prod accounts first
   - Always have a rollback plan
   - Document all SCP changes
   - Use descriptive policy names
   - Review attached targets before deletion

3. **Limitations:**
   - Cannot modify AWS-managed policies
   - SCPs don't grant permissions, only restrict
   - Maximum 5 SCPs per account/OU
   - Policy size limit: 5,120 characters

---

## Testing

### Test SCP Management
1. Refresh browser
2. Go to Admin → SCPs tab
3. Should see list of existing SCPs
4. Click "Create SCP" to test creation
5. Click "View" to see policy details

### Verify Backend
```bash
# Check if backend is running
lsof -i:5000

# Check logs
tail -f /tmp/sso_backend.log

# Test API directly
curl http://127.0.0.1:5000/api/admin/scps
```

---

## Future Enhancements

1. **SCP Templates Library**
   - Pre-built SCP templates for common scenarios
   - One-click deployment

2. **SCP Impact Analysis**
   - Preview which accounts/users will be affected
   - Simulate policy before applying

3. **SCP Compliance Checker**
   - Validate SCPs against compliance frameworks
   - Suggest improvements

4. **SCP Version History**
   - Track all changes to SCPs
   - Rollback to previous versions

5. **Bulk Operations**
   - Attach/detach multiple SCPs at once
   - Apply SCPs to multiple accounts

---

## Integration with Existing Features

### 1. Guardrails + SCPs
- Guardrails enforce at JIT level
- SCPs enforce at AWS Organization level
- Combined: Multi-layer security

### 2. Account Tagging + SCPs
- Tag accounts by environment
- Apply environment-specific SCPs automatically
- Example: Prod accounts get stricter SCPs

### 3. AI Copilot + SCPs
- AI checks SCPs before generating permissions
- Prevents generating permissions that SCPs would block
- Smarter permission recommendations

---

## Demo Script

**For Presentation:**

1. **Show Current Tool Capabilities:**
   - JIT Access Management
   - AI-Powered Permission Generation
   - Guardrails System
   - Account Tagging

2. **Introduce SCP Management:**
   - "Now we're adding AWS Organization-level governance"
   - "Manage SCPs without touching AWS Console"

3. **Live Demo:**
   - Navigate to Admin → SCPs
   - Show existing SCPs
   - Create new SCP: "DenyS3DeleteInProd"
   - View policy JSON
   - Attach to production OU

4. **Highlight Benefits:**
   - Centralized governance
   - No AWS Console access needed
   - Audit trail of all changes
   - Integrated with existing features

---

## Branding Update

**Old Name:** JIT Access Portal  
**New Name:** CloudGuard Access Manager

**Tagline Options:**
- "Enterprise Cloud Access & Governance Platform"
- "Secure, Intelligent, Governed Cloud Access"
- "Your Cloud Security Command Center"

**Update in:**
- index.html (page title)
- Login page header
- Documentation
- README.md
