# Future Enhancements

## Manager Approval Integration

### 1. User Attributes Enhancement
```python
# Add to backend/app.py
def get_user_manager(user_email):
    """Get manager email from AD/Identity Store"""
    identitystore = boto3.client('identitystore')
    
    # Get user attributes including manager
    user_response = identitystore.describe_user(
        IdentityStoreId=CONFIG['identity_store_id'],
        UserId=user_id
    )
    
    # Extract manager email from custom attributes
    manager_email = user_response.get('Manager', {}).get('Value')
    return manager_email
```

### 2. Email Notification System
```python
# Add SES integration
def send_approval_email(request_data, approver_email, approver_type):
    ses = boto3.client('ses')
    
    approval_link = f"https://your-domain.com/approve/{request_data['id']}?role={approver_type}"
    
    ses.send_email(
        Source='noreply@yourcompany.com',
        Destination={'ToAddresses': [approver_email]},
        Message={
            'Subject': {'Data': f'AWS Access Approval Required - {request_data["user_email"]}'},
            'Body': {
                'Html': {'Data': f'''
                    <h3>Access Request Approval Required</h3>
                    <p><strong>User:</strong> {request_data["user_email"]}</p>
                    <p><strong>Account:</strong> {request_data["account_id"]}</p>
                    <p><strong>Permission:</strong> ReadOnlyAccess</p>
                    <p><strong>Duration:</strong> {request_data["duration_hours"]} hours</p>
                    <p><strong>Justification:</strong> {request_data["justification"]}</p>
                    
                    <a href="{approval_link}" style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none;">
                        Approve Request
                    </a>
                '''}
            }
        }
    )
```

### 3. AD Integration for Manager Lookup
- Query Active Directory for user's manager attribute
- Automatically route approval emails to manager
- Fallback to security team if no manager found

## Implementation Priority
1. ✅ Basic request/approval flow (DONE)
2. 🔄 AWS SSO integration with real credentials
3. 📧 Email notifications to managers
4. 🔐 AD authentication integration
5. ⏰ Automated access revocation
6. 📊 Audit logging and reporting