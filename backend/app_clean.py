from flask import Flask, request, jsonify
from flask_cors import CORS
import boto3
import json
from datetime import datetime, timedelta
import uuid
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# Configuration - will be populated from AWS
CONFIG = {
    'accounts': {},
    'permission_sets': [],
    'sso_instance_arn': 'arn:aws:sso:::instance/ssoins-65955f0870d9f06f',
    'identity_store_id': 'd-9f677136b2',
    'sso_start_url': 'https://nykaa.awsapps.com/start'
}

def initialize_aws_config():
    """Fetch real AWS SSO configuration"""
    print("Initializing AWS config...")
    try:
        # Test AWS credentials first
        sts = boto3.client('sts')
        identity = sts.get_caller_identity()
        print(f"AWS Identity: {identity}")
        
        account_id = identity['Account']
        print(f"Current account: {account_id}")
        
        # Get permission sets
        try:
            sso_admin = boto3.client('sso-admin', region_name='ap-south-1')
            
            permission_sets = []
            next_token = None
            
            while True:
                if next_token:
                    response = sso_admin.list_permission_sets(
                        InstanceArn=CONFIG['sso_instance_arn'],
                        NextToken=next_token,
                        MaxResults=100
                    )
                else:
                    response = sso_admin.list_permission_sets(
                        InstanceArn=CONFIG['sso_instance_arn'],
                        MaxResults=100
                    )
                
                permission_sets.extend(response.get('PermissionSets', []))
                
                if 'NextToken' not in response:
                    break
                next_token = response['NextToken']
            
            print(f"Found {len(permission_sets)} permission sets")
            
            # Get permission set details
            CONFIG['permission_sets'] = []
            for ps_arn in permission_sets:
                try:
                    ps_details = sso_admin.describe_permission_set(
                        InstanceArn=CONFIG['sso_instance_arn'],
                        PermissionSetArn=ps_arn
                    )['PermissionSet']
                    
                    CONFIG['permission_sets'].append({
                        'name': ps_details['Name'],
                        'arn': ps_arn
                    })
                except Exception as e:
                    print(f"Error getting permission set details: {e}")
            
        except Exception as e:
            print(f"SSO error: {e}")
            CONFIG['permission_sets'] = [
                {'name': 'ReadOnlyAccess', 'arn': 'arn:aws:iam::aws:policy/ReadOnlyAccess'},
                {'name': 'PowerUserAccess', 'arn': 'arn:aws:iam::aws:policy/PowerUserAccess'}
            ]
        
        # Get accounts
        try:
            org_client = boto3.client('organizations')
            accounts = []
            paginator = org_client.get_paginator('list_accounts')
            for page in paginator.paginate():
                accounts.extend(page['Accounts'])
            
            CONFIG['accounts'] = {}
            for account in accounts:
                account_type = 'prod' if any(word in account['Name'].lower() for word in ['prod', 'production']) else 'non-prod'
                CONFIG['accounts'][account['Id']] = {
                    'id': account['Id'],
                    'name': account['Name'],
                    'type': account_type
                }
        except Exception as e:
            print(f"Organizations error: {e}")
            CONFIG['accounts'] = {account_id: {'id': account_id, 'name': f'Account-{account_id}', 'type': 'non-prod'}}
        
        print(f"Final config - Accounts: {len(CONFIG['accounts'])}, Permission Sets: {len(CONFIG['permission_sets'])}")
        
    except Exception as e:
        print(f"Critical error: {e}")
        CONFIG['accounts'] = {'123456789012': {'id': '123456789012', 'name': 'Fallback Account', 'type': 'non-prod'}}
        CONFIG['permission_sets'] = [{'name': 'ReadOnlyAccess', 'arn': 'fallback-arn'}]

# In-memory storage
requests_db = {}
approvals_db = {}

@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    if not CONFIG['accounts']:
        initialize_aws_config()
    return jsonify(CONFIG['accounts'])

@app.route('/api/permission-sets', methods=['GET'])
def get_permission_sets():
    if not CONFIG['permission_sets']:
        initialize_aws_config()
    return jsonify(CONFIG['permission_sets'])

@app.route('/api/debug/find-user/<email>', methods=['GET'])
def debug_find_user(email):
    try:
        identitystore = boto3.client('identitystore', region_name='ap-south-1')
        results = {}
        
        # Try email search
        try:
            response = identitystore.list_users(
                IdentityStoreId=CONFIG['identity_store_id'],
                Filters=[{'AttributePath': 'Emails.Value', 'AttributeValue': email}]
            )
            results['email_search'] = {'count': len(response['Users']), 'users': response['Users']}
        except Exception as e:
            results['email_search'] = {'error': str(e)}
        
        # Try username variations
        username_variations = [email, email.lower(), email.title()]
        if '@' in email:
            base = email.split('@')[0]
            username_variations.extend([
                f"{base}@Nykaa.local",
                f"{base.lower()}@Nykaa.local",
                f"{base.title()}@Nykaa.local"
            ])
        
        for username in username_variations:
            try:
                response = identitystore.list_users(
                    IdentityStoreId=CONFIG['identity_store_id'],
                    Filters=[{'AttributePath': 'UserName', 'AttributeValue': username}]
                )
                if response['Users']:
                    results[f'username_{username}'] = {'count': len(response['Users']), 'users': response['Users']}
            except Exception as e:
                results[f'username_{username}'] = {'error': str(e)}
        
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)})

@app.route('/api/request-access', methods=['POST'])
def request_access():
    data = request.json
    
    request_id = str(uuid.uuid4())
    access_request = {
        'id': request_id,
        'user_email': data['user_email'],
        'account_id': data['account_id'],
        'permission_set': data['permission_set'],
        'duration_hours': data['duration_hours'],
        'justification': data['justification'],
        'status': 'pending',
        'created_at': datetime.now().isoformat(),
        'expires_at': (datetime.now() + timedelta(hours=data['duration_hours'])).isoformat()
    }
    
    # Determine approval workflow
    account = CONFIG['accounts'][data['account_id']]
    if account['type'] == 'prod':
        access_request['approval_required'] = ['manager', 'security']
    else:
        access_request['approval_required'] = ['admin']
    
    requests_db[request_id] = access_request
    return jsonify({'request_id': request_id, 'status': 'submitted'})

@app.route('/api/requests', methods=['GET'])
def get_requests():
    return jsonify(list(requests_db.values()))

@app.route('/api/approve/<request_id>', methods=['POST'])
def approve_request(request_id):
    data = request.json
    approver_role = data['approver_role']
    
    if request_id not in requests_db:
        return jsonify({'error': 'Request not found'}), 404
    
    access_request = requests_db[request_id]
    
    # Track approvals
    if request_id not in approvals_db:
        approvals_db[request_id] = []
    
    approvals_db[request_id].append({
        'approver_role': approver_role,
        'approved_at': datetime.now().isoformat()
    })
    
    # Check if all approvals received
    required_approvals = set(access_request['approval_required'])
    received_approvals = set([a['approver_role'] for a in approvals_db[request_id]])
    
    if required_approvals.issubset(received_approvals):
        # Grant access
        result = grant_access(access_request)
        
        if 'error' in result:
            access_request['status'] = 'failed'
            return jsonify({'status': 'failed', 'error': result['error']})
        
        access_request['status'] = 'approved'
        access_request['granted_at'] = datetime.now().isoformat()
        
        return jsonify({
            'status': 'approved', 
            'access_granted': True,
            'message': f"✅ Access granted! Login to AWS SSO to see the new access.",
            'sso_start_url': CONFIG['sso_start_url']
        })
    else:
        return jsonify({'status': 'partial_approval', 'pending': list(required_approvals - received_approvals)})

def grant_access(access_request):
    """Grant AWS SSO access"""
    try:
        sso_admin = boto3.client('sso-admin', region_name='ap-south-1')
        identitystore = boto3.client('identitystore', region_name='ap-south-1')
        
        print(f"Granting access for user: {access_request['user_email']}")
        
        # Find user - try multiple methods
        user_response = {'Users': []}
        
        # Try email search
        try:
            user_response = identitystore.list_users(
                IdentityStoreId=CONFIG['identity_store_id'],
                Filters=[{'AttributePath': 'Emails.Value', 'AttributeValue': access_request['user_email']}]
            )
            print(f"Email search: {len(user_response['Users'])} users found")
        except Exception as e:
            print(f"Email search failed: {e}")
        
        # Try username variations
        if not user_response['Users']:
            base_email = access_request['user_email']
            username_part = base_email.split('@')[0] if '@' in base_email else base_email
            
            username_variations = [
                base_email,
                f"{username_part}@Nykaa.local",
                f"{username_part.lower()}@Nykaa.local",
                f"{username_part.title()}@Nykaa.local"
            ]
            
            for username in username_variations:
                try:
                    user_response = identitystore.list_users(
                        IdentityStoreId=CONFIG['identity_store_id'],
                        Filters=[{'AttributePath': 'UserName', 'AttributeValue': username}]
                    )
                    print(f"Username '{username}': {len(user_response['Users'])} users found")
                    if user_response['Users']:
                        break
                except Exception as e:
                    print(f"Username '{username}' search failed: {e}")
        
        if not user_response['Users']:
            return {'error': 'User not found in Identity Store'}
        
        user_id = user_response['Users'][0]['UserId']
        user_name = user_response['Users'][0]['UserName']
        print(f"Found user: {user_name} (ID: {user_id})")
        
        # Create account assignment
        account_id = CONFIG['accounts'][access_request['account_id']]['id']
        permission_set_arn = access_request['permission_set']
        
        print(f"Creating assignment: Account={account_id}, PermissionSet={permission_set_arn}")
        
        response = sso_admin.create_account_assignment(
            InstanceArn=CONFIG['sso_instance_arn'],
            TargetId=account_id,
            TargetType='AWS_ACCOUNT',
            PermissionSetArn=permission_set_arn,
            PrincipalType='USER',
            PrincipalId=user_id
        )
        
        assignment_status = response['AccountAssignmentCreationStatus']
        print(f"Assignment created: {assignment_status['RequestId']} - Status: {assignment_status['Status']}")
        
        return {
            'success': True, 
            'assignment_id': assignment_status['RequestId'],
            'status': assignment_status['Status']
        }
        
    except Exception as e:
        print(f"Error granting access: {str(e)}")
        import traceback
        traceback.print_exc()
        return {'error': str(e)}

# Initialize on startup
initialize_aws_config()

if __name__ == '__main__':
    app.run(debug=True, port=5000)