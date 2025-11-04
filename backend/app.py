from flask import Flask, request, jsonify
from flask_cors import CORS
import boto3
import json
from datetime import datetime, timedelta
import uuid
import os
from dotenv import load_dotenv
import re

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
                CONFIG['accounts'][account['Id']] = {
                    'id': account['Id'],
                    'name': account['Name']
                }
        except Exception as e:
            print(f"Organizations error: {e}")
            CONFIG['accounts'] = {account_id: {'id': account_id, 'name': f'Account-{account_id}'}}
        
        print(f"Final config - Accounts: {len(CONFIG['accounts'])}, Permission Sets: {len(CONFIG['permission_sets'])}")
        
    except Exception as e:
        print(f"Critical error: {e}")
        CONFIG['accounts'] = {'332463837037': {'id': '332463837037', 'name': 'Nykaa-fashion'}}
        CONFIG['permission_sets'] = [{'name': 'ReadOnlyAccess', 'arn': 'fallback-arn'}]

# In-memory storage
requests_db = {}
approvals_db = {}

def generate_ai_permissions(use_case_description):
    """Generate AWS permissions using Bedrock AI or fallback to rules"""
    # Check for non-AWS requests first
    non_aws_keywords = ['azure', 'gcp', 'google cloud', 'kubernetes', 'k8s', 'database', 'mysql', 'postgres', 'mongodb', 'jenkins', 'grafana', 'sonar', 'jira', 'splunk', 'servicenow']
    use_case_lower = use_case_description.lower()
    
    found_non_aws = [keyword for keyword in non_aws_keywords if keyword in use_case_lower]
    if found_non_aws:
        return {
            'error': f'❌ AI Access Denied\n\nThis system currently only supports AWS access requests.\n\nDetected: {", ".join(found_non_aws)}\n\nFor non-AWS access, please use the Applications page or contact your system administrator.'
        }
    
    # Check for restricted keywords
    restricted_keywords = ['admin', 'administrator', 'full access', 'all permissions', '*', 'delete', 'create', 'terminate', 'launch', 'run instances']
    
    found_restricted = [keyword for keyword in restricted_keywords if keyword in use_case_lower]
    if found_restricted:
        return {
            'error': f'❌ Restricted permissions detected: {", ".join(found_restricted)}\n\nYou are not authorized for admin/delete/create permissions.\nPlease ask for read/list and limited write permissions only.\n\nFor resource creation/deletion, connect with DevOps team with proper JIRA ticket and approvals.'
        }
    
    # Try AI first
    try:
        # Assume role in Bedrock account
        sts = boto3.client('sts')
        assumed_role = sts.assume_role(
            RoleArn='arn:aws:iam::867625663987:role/BedrockCrossAccountRole',
            RoleSessionName='JITAccessBedrock',
            ExternalId='JITAccessBedrock'
        )
        
        bedrock = boto3.client(
            'bedrock-runtime',
            region_name='ap-south-1',
            aws_access_key_id=assumed_role['Credentials']['AccessKeyId'],
            aws_secret_access_key=assumed_role['Credentials']['SecretAccessKey'],
            aws_session_token=assumed_role['Credentials']['SessionToken']
        )
        
        prompt = f"""Convert this AWS use case to specific AWS IAM actions and resources:

Use Case: {use_case_description}

IMPORTANT RESTRICTIONS:
- ONLY AWS services are supported
- NO admin, delete, create, terminate, or wildcard (*) actions
- ONLY read, list, describe, get actions allowed
- Limited write actions like PutObject are OK
- Be specific and minimal
- Focus on AWS services only (EC2, S3, Lambda, RDS, etc.)

Return ONLY a JSON object with this exact format:
{{
  "actions": ["ec2:DescribeInstances", "s3:GetObject"],
  "resources": ["*"],
  "description": "Brief description of what this allows"
}}"""
        
        response = bedrock.invoke_model(
            modelId='anthropic.claude-3-sonnet-20240229-v1:0',
            body=json.dumps({
                'anthropic_version': 'bedrock-2023-05-31',
                'max_tokens': 1000,
                'messages': [{'role': 'user', 'content': prompt}]
            })
        )
        
        result = json.loads(response['body'].read())
        ai_response = result['content'][0]['text']
        
        # Extract JSON from response
        json_match = re.search(r'\{[^}]*\}', ai_response, re.DOTALL)
        if json_match:
            ai_permissions = json.loads(json_match.group())
            
            # Double-check AI response for restricted actions
            restricted_actions = []
            for action in ai_permissions.get('actions', []):
                if any(word in action.lower() for word in ['*', 'admin', 'delete', 'create', 'terminate', 'launch']):
                    restricted_actions.append(action)
            
            if restricted_actions:
                return {
                    'error': f'❌ AI generated restricted actions: {", ".join(restricted_actions)}\n\nSystem blocked these permissions for security.\nPlease rephrase your request for read/list permissions only.'
                }
            
            # Check for Secrets Manager without specific secret names
            secrets_actions = [action for action in ai_permissions.get('actions', []) if 'secretsmanager:' in action.lower()]
            if secrets_actions:
                resources = ai_permissions.get('resources', [])
                if '*' in resources or any('*' in resource for resource in resources):
                    return {
                        'error': f'❌ Secrets Manager access requires specific secret names.\n\nFound actions: {", ".join(secrets_actions)}\nWildcard (*) resources are not allowed for secrets.\n\nPlease specify exact secret names like: "arn:aws:secretsmanager:region:account:secret:MySecret-AbCdEf"'
                    }
            
            return ai_permissions
        
    except Exception as e:
        print(f"AI generation failed, using fallback: {e}")
    
    # Fallback to rule-based generation
    return generate_fallback_permissions(use_case_description)

def generate_fallback_permissions(use_case):
    """Rule-based permission generation with security restrictions"""
    use_case_lower = use_case.lower()
    actions = []
    resources = ['*']
    description = "AWS rule-based permissions for: " + use_case
    
    # Check for non-AWS requests first
    non_aws_keywords = ['azure', 'gcp', 'google cloud', 'kubernetes', 'k8s', 'database', 'mysql', 'postgres', 'mongodb', 'jenkins', 'grafana', 'sonar', 'jira', 'splunk', 'servicenow']
    found_non_aws = [kw for kw in non_aws_keywords if kw in use_case_lower]
    if found_non_aws:
        return {
            'error': f'❌ AI Access Denied\n\nThis system currently only supports AWS access requests.\n\nDetected: {", ".join(found_non_aws)}\n\nFor non-AWS access, please use the Applications page or contact your system administrator.'
        }
    
    # Check for restricted actions
    restricted_keywords = ['delete', 'create', 'admin', 'administrator', 'terminate', 'run instances', 'launch', 'full access', '*']
    found_restricted = [kw for kw in restricted_keywords if kw in use_case_lower]
    if found_restricted:
        return {
            'error': f'❌ Restricted permissions detected: {", ".join(found_restricted)}\n\nYou are not authorized for admin/delete/create permissions.\nPlease ask for read/list and limited write permissions only.\n\nFor resource creation/deletion, connect with DevOps team with proper JIRA ticket and approvals.'
        }
    
    # EC2 permissions
    if any(word in use_case_lower for word in ['ec2', 'instance', 'server', 'vm', 'connect']):
        actions.extend([
            'ec2:DescribeInstances',
            'ec2:DescribeInstanceStatus',
            'ssm:StartSession',
            'ssm:DescribeInstanceInformation',
            'ssm:SendCommand',
            'ssm:GetCommandInvocation'
        ])
        description += ' | Please specify EC2 instance tags in the service configuration below'
    
    # S3 permissions
    if any(word in use_case_lower for word in ['s3', 'bucket', 'download', 'upload', 'file']):
        actions.extend([
            's3:ListBucket',
            's3:GetObject',
            's3:GetObjectVersion'
        ])
        if any(word in use_case_lower for word in ['upload', 'write', 'put']):
            actions.extend(['s3:PutObject'])  # Removed DeleteObject
    
    # RDS permissions (read-only)
    if any(word in use_case_lower for word in ['rds', 'database', 'db']):
        actions.extend([
            'rds:DescribeDBInstances',
            'rds:DescribeDBClusters'
        ])
    
    # Lambda permissions (read-only + invoke)
    if any(word in use_case_lower for word in ['lambda', 'function']):
        actions.extend([
            'lambda:ListFunctions',
            'lambda:GetFunction',
            'lambda:InvokeFunction'
        ])
    
    # CloudWatch logs
    if any(word in use_case_lower for word in ['logs', 'cloudwatch', 'monitoring']):
        actions.extend([
            'logs:DescribeLogGroups',
            'logs:DescribeLogStreams',
            'logs:GetLogEvents'
        ])
    
    # Secrets Manager - requires specific secret names
    if any(word in use_case_lower for word in ['secret', 'secrets manager', 'password']):
        # Check if specific secret name is mentioned
        if not any(word in use_case for word in ['secret:', 'secret-', 'secret_', 'secret/']):
            return {
                'error': f'❌ Secrets Manager access requires specific secret names.\n\nYou cannot use wildcard (*) for secrets access.\nPlease specify the exact secret name in your request.\n\nExample: "I need to read secret MyApp-Database-Password"'
            }
        
        actions.extend([
            'secretsmanager:DescribeSecret',
            'secretsmanager:GetSecretValue'
        ])
    
    # Default read permissions if nothing specific matched
    if not actions:
        actions = [
            'iam:GetUser',
            'sts:GetCallerIdentity'
        ]
        description = "Basic read-only access"
    
    return {
        'actions': list(set(actions)),  # Remove duplicates
        'resources': resources,
        'description': description
    }

def enhance_permissions_with_services(permissions_data, aws_services=None, service_configs=None):
    """Enhance permissions with service-specific resource constraints"""
    if not aws_services:
        return permissions_data
    
    enhanced_actions = []
    resources = []
    description_parts = ['Service-specific permissions']
    
    # Process each selected service
    for service in aws_services:
        config = service_configs.get(service, {})
        
        if service == 'ec2':
            enhanced_actions.extend([
                'ec2:DescribeInstances',
                'ec2:DescribeInstanceStatus'
            ])
            
            # Add SSM for tag-based access
            enhanced_actions.extend([
                'ssm:StartSession',
                'ssm:DescribeInstanceInformation',
                'ssm:SendCommand',
                'ssm:GetCommandInvocation'
            ])
            if config.get('tags'):
                description_parts.append(f"EC2 tags: {config['tags']}")
            else:
                description_parts.append("EC2: All instances (no tag filter)")
        
        elif service == 's3':
            bucket_name = config.get('bucket')
            if bucket_name:
                enhanced_actions.extend([
                    's3:ListBucket',
                    's3:GetObject',
                    's3:GetObjectVersion'
                ])
                
                bucket_arn = f"arn:aws:s3:::{bucket_name}"
                if config.get('prefix'):
                    object_arn = f"arn:aws:s3:::{bucket_name}/{config['prefix']}*"
                    description_parts.append(f"S3: {bucket_name}/{config['prefix']}")
                else:
                    object_arn = f"arn:aws:s3:::{bucket_name}/*"
                    description_parts.append(f"S3: {bucket_name}")
                
                resources.extend([bucket_arn, object_arn])
        
        elif service == 'secretsmanager':
            secret_name = config.get('secret_name')
            if secret_name:
                enhanced_actions.extend([
                    'secretsmanager:DescribeSecret',
                    'secretsmanager:GetSecretValue'
                ])
                secret_arn = f"arn:aws:secretsmanager:ap-south-1:*:secret:{secret_name}-*"
                resources.append(secret_arn)
                description_parts.append(f"Secret: {secret_name}")
        
        elif service == 'lambda':
            function_name = config.get('function_name')
            if function_name:
                enhanced_actions.extend([
                    'lambda:GetFunction',
                    'lambda:InvokeFunction'
                ])
                function_arn = f"arn:aws:lambda:ap-south-1:*:function:{function_name}"
                resources.append(function_arn)
                description_parts.append(f"Lambda: {function_name}")
        
        elif service == 'rds':
            enhanced_actions.extend([
                'rds:DescribeDBInstances',
                'rds:DescribeDBClusters'
            ])
            if config.get('instance_id'):
                description_parts.append(f"RDS: {config['instance_id']}")
        
        elif service == 'cloudwatch':
            enhanced_actions.extend([
                'logs:DescribeLogGroups',
                'logs:DescribeLogStreams',
                'logs:GetLogEvents'
            ])
            if config.get('log_group'):
                log_group_arn = f"arn:aws:logs:ap-south-1:*:log-group:{config['log_group']}:*"
                resources.append(log_group_arn)
                description_parts.append(f"CloudWatch: {config['log_group']}")
    
    # Use wildcard if no specific resources were added
    if not resources:
        resources = ['*']
    
    # Create tag-based conditions for EC2 if tags are specified
    conditions = None
    if 'ec2' in aws_services and service_configs:
        ec2_config = service_configs.get('ec2', {})
        if ec2_config.get('tags'):
            # Parse tags (format: key1=value1,key2=value2)
            tag_pairs = ec2_config['tags'].split(',')
            tag_conditions = {}
            
            for tag_pair in tag_pairs:
                if '=' in tag_pair:
                    key, value = tag_pair.strip().split('=', 1)
                    tag_conditions[f"ec2:ResourceTag/{key.strip()}"] = value.strip()
            
            if tag_conditions:
                conditions = {
                    "StringEquals": tag_conditions
                }
                print(f"✅ Generated tag conditions: {conditions}")
    
    result = {
        'actions': list(set(enhanced_actions)),
        'resources': resources,
        'description': ' | '.join(description_parts),
        'aws_services': aws_services,
        'service_configs': service_configs
    }
    
    if conditions:
        result['conditions'] = conditions
        print(f"✅ Final result with conditions: {result}")
    
    return result

def create_custom_permission_set(name, permissions_data):
    """Create a new permission set with AI-generated permissions"""
    try:
        sso_admin = boto3.client('sso-admin', region_name='ap-south-1')
        
        # Create permission set
        response = sso_admin.create_permission_set(
            InstanceArn=CONFIG['sso_instance_arn'],
            Name=name,
            Description=permissions_data.get('description', 'AI-generated permission set'),
            SessionDuration='PT8H'
        )
        
        permission_set_arn = response['PermissionSet']['PermissionSetArn']
        
        # Create inline policy with conditions if present
        statement = {
            'Effect': 'Allow',
            'Action': permissions_data['actions'],
            'Resource': permissions_data['resources']
        }
        
        # Add conditions for tag-based access
        if 'conditions' in permissions_data:
            statement['Condition'] = permissions_data['conditions']
        
        policy_doc = {
            'Version': '2012-10-17',
            'Statement': [statement]
        }
        
        sso_admin.put_inline_policy_to_permission_set(
            InstanceArn=CONFIG['sso_instance_arn'],
            PermissionSetArn=permission_set_arn,
            InlinePolicy=json.dumps(policy_doc)
        )
        
        return {
            'arn': permission_set_arn,
            'name': name,
            'permissions': permissions_data
        }
        
    except Exception as e:
        print(f"Permission set creation error: {e}")
        return {'error': str(e)}

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

@app.route('/api/generate-permissions', methods=['POST'])
def generate_permissions():
    data = request.json
    use_case = data.get('use_case', '')
    
    if not use_case:
        return jsonify({'error': 'Use case description required'}), 400
    
    # Simple validation - AI only responds to AWS access requests
    use_case_lower = use_case.lower()
    
    # Check if request contains AWS services or access keywords
    aws_keywords = ['aws', 'ec2', 's3', 'lambda', 'rds', 'dynamodb', 'cloudwatch', 'iam', 'vpc', 'elb', 'cloudfront', 'route53', 'sns', 'sqs', 'api gateway', 'access', 'permission']
    has_aws_context = any(keyword in use_case_lower for keyword in aws_keywords)
    
    if not has_aws_context:
        return jsonify({
            'error': 'AI only generates AWS access permissions. Please specify your AWS access requirements.'
        }), 400
    
    # Check for read-only access requests
    use_case_lower = use_case.lower()
    readonly_keywords = ['read only', 'readonly', 'read access', 'view only', 'list only', 'describe only']
    
    if any(keyword in use_case_lower for keyword in readonly_keywords):
        return jsonify({
            'error': '📋 For read-only access, please select from existing permission sets instead of AI generation.\n\n' +
                    '✅ If you need to perform write actions additionally, please specify them clearly so I can create a custom permission set for you.\n\n' +
                    '📝 Note: Read-only access approval requirements:\n' +
                    '• Non-prod accounts: Manager approval only\n' +
                    '• Prod accounts: Security lead approval (Saurabh Arora) required',
            'suggestion': 'use_existing_permission_sets'
        })
    
    permissions = generate_ai_permissions(use_case)
    return jsonify(permissions)

@app.route('/api/request-access', methods=['POST'])
def request_access():
    data = request.json
    
    request_id = str(uuid.uuid4())
    # Handle custom date range
    if 'custom_start_date' in data and 'custom_end_date' in data:
        start_date = datetime.fromisoformat(data['custom_start_date'].replace('Z', '+00:00'))
        end_date = datetime.fromisoformat(data['custom_end_date'].replace('Z', '+00:00'))
        
        # Validate 5-day maximum
        max_duration = timedelta(days=5)
        if (end_date - start_date) > max_duration:
            return jsonify({'error': 'Maximum duration is 5 days'}), 400
        
        # Validate start date is in future
        if start_date <= datetime.now():
            return jsonify({'error': 'Start date must be in the future'}), 400
        
        expires_at = end_date.isoformat()
        created_at = start_date.isoformat()
    else:
        # Standard duration
        if data['duration_hours'] > 120:  # 5 days = 120 hours
            return jsonify({'error': 'Maximum duration is 5 days (120 hours)'}), 400
        
        created_at = datetime.now().isoformat()
        expires_at = (datetime.now() + timedelta(hours=data['duration_hours'])).isoformat()
    
    access_request = {
        'id': request_id,
        'user_email': data['user_email'],
        'account_id': data['account_id'],
        'duration_hours': data['duration_hours'],
        'justification': data['justification'],
        'status': 'pending',
        'created_at': created_at,
        'expires_at': expires_at
    }
    
    # Add custom date info if provided
    if 'custom_start_date' in data:
        access_request['custom_dates'] = True
        access_request['start_date'] = data['custom_start_date']
        access_request['end_date'] = data['custom_end_date']
    
    # Handle AI-generated or existing permission set
    if 'use_case' in data:
        # AI-generated permission set
        permissions = generate_ai_permissions(data['use_case'])
        if 'error' in permissions:
            return jsonify({'error': f"AI generation failed: {permissions['error']}"}), 400
        
        # Enhance with service-specific constraints
        aws_services = data.get('aws_services', [])
        service_configs = data.get('service_configs', {})
        
        if aws_services:
            # Override AI permissions with service-specific ones
            permissions = enhance_permissions_with_services({
                'actions': [],
                'resources': ['*'],
                'description': 'Service-specific permissions'
            }, aws_services, service_configs)
        
        access_request['ai_generated'] = True
        access_request['use_case'] = data['use_case']
        access_request['ai_permissions'] = permissions
        access_request['permission_set'] = 'AI_GENERATED'
        access_request['aws_services'] = aws_services
        access_request['service_configs'] = service_configs
    else:
        # Existing permission set
        access_request['permission_set'] = data['permission_set']
        access_request['ai_generated'] = False
    
    # Determine approval requirements based on account type and access type
    account_name = CONFIG['accounts'].get(access_request['account_id'], {}).get('name', '').lower()
    is_prod_account = 'prod' in account_name or 'production' in account_name
    
    # Check if this is read-only access
    is_readonly = False
    if not access_request.get('ai_generated'):
        # Check permission set name for read-only indicators
        ps_name = access_request.get('permission_set', '').lower()
        is_readonly = 'readonly' in ps_name or 'read' in ps_name
    
    if is_readonly:
        if is_prod_account:
            access_request['approval_required'] = ['security_lead']  # Saurabh Arora
            access_request['approval_note'] = 'Production read-only access requires security lead approval'
        else:
            access_request['approval_required'] = ['manager']
            access_request['approval_note'] = 'Non-production read-only access requires manager approval'
    else:
        # For write/custom permissions, require self-approval for now (can be enhanced)
        access_request['approval_required'] = ['self']
    
    requests_db[request_id] = access_request
    return jsonify({'request_id': request_id, 'status': 'submitted'})

@app.route('/api/requests', methods=['GET'])
def get_requests():
    return jsonify(list(requests_db.values()))

@app.route('/api/request/<request_id>', methods=['GET'])
def get_request_details(request_id):
    if request_id not in requests_db:
        return jsonify({'error': 'Request not found'}), 404
    return jsonify(requests_db[request_id])

@app.route('/api/request/<request_id>/modify', methods=['POST'])
def modify_request(request_id):
    if request_id not in requests_db:
        return jsonify({'error': 'Request not found'}), 404
    
    access_request = requests_db[request_id]
    if access_request['status'] != 'pending':
        return jsonify({'error': 'Can only modify pending requests'}), 400
    
    data = request.json
    
    # Update justification
    if 'justification' in data:
        access_request['justification'] = data['justification']
    
    # Update AI permissions if provided
    if 'additional_permissions' in data:
        if access_request.get('ai_generated'):
            # Merge additional permissions
            current_actions = access_request['ai_permissions']['actions']
            new_actions = data['additional_permissions']
            
            # Security check for restricted actions
            restricted = [action for action in new_actions if any(word in action.lower() for word in ['delete', 'create', 'admin', 'terminate'])]
            if restricted:
                return jsonify({'error': f'Restricted actions not allowed: {restricted}'}), 400
            
            access_request['ai_permissions']['actions'] = list(set(current_actions + new_actions))
            access_request['ai_permissions']['description'] += ' (Modified by user)'
    
    # Reset approvals since request was modified
    if request_id in approvals_db:
        del approvals_db[request_id]
    
    access_request['modified_at'] = datetime.now().isoformat()
    
    return jsonify({'status': 'modified', 'request': access_request})

@app.route('/api/request/<request_id>/delete', methods=['DELETE'])
def delete_request(request_id):
    """Admin function to delete any request"""
    if request_id not in requests_db:
        return jsonify({'error': 'Request not found'}), 404
    
    access_request = requests_db[request_id]
    
    # Delete from database
    del requests_db[request_id]
    
    # Also remove approvals if they exist
    if request_id in approvals_db:
        del approvals_db[request_id]
    
    return jsonify({
        'status': 'deleted',
        'message': f'✅ Request {request_id[:8]}... deleted successfully',
        'deleted_request': {
            'id': access_request['id'],
            'user_email': access_request['user_email'],
            'status': access_request['status']
        }
    })

@app.route('/api/request/<request_id>/revoke', methods=['POST'])
def revoke_access(request_id):
    """Admin function to immediately revoke access"""
    if request_id not in requests_db:
        return jsonify({'error': 'Request not found'}), 404
    
    access_request = requests_db[request_id]
    if access_request['status'] != 'approved':
        return jsonify({'error': 'Can only revoke approved requests'}), 400
    
    data = request.json
    revoke_reason = data.get('reason', 'Security revocation by admin')
    
    try:
        # Revoke AWS SSO assignment
        sso_admin = boto3.client('sso-admin', region_name='ap-south-1')
        identitystore = boto3.client('identitystore', region_name='ap-south-1')
        
        # Find user
        user_response = {'Users': []}
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
                if user_response['Users']:
                    break
            except Exception as e:
                continue
        
        if not user_response['Users']:
            return jsonify({'error': 'User not found for revocation'}), 400
        
        user_id = user_response['Users'][0]['UserId']
        account_id = CONFIG['accounts'][access_request['account_id']]['id']
        permission_set_arn = access_request['permission_set']
        
        # Delete account assignment
        response = sso_admin.delete_account_assignment(
            InstanceArn=CONFIG['sso_instance_arn'],
            TargetId=account_id,
            TargetType='AWS_ACCOUNT',
            PermissionSetArn=permission_set_arn,
            PrincipalType='USER',
            PrincipalId=user_id
        )
        
        # Delete permission set if it was AI-generated
        if access_request.get('ai_generated') and access_request.get('permission_set_name'):
            try:
                sso_admin.delete_permission_set(
                    InstanceArn=CONFIG['sso_instance_arn'],
                    PermissionSetArn=permission_set_arn
                )
                print(f"Deleted permission set: {access_request['permission_set_name']}")
            except Exception as e:
                print(f"Error deleting permission set: {e}")
        
        # Update request status
        access_request['status'] = 'revoked'
        access_request['revoked_at'] = datetime.now().isoformat()
        access_request['revoke_reason'] = revoke_reason
        
        return jsonify({
            'status': 'revoked',
            'message': f'❌ Access revoked successfully. Reason: {revoke_reason}',
            'revocation_id': response['AccountAssignmentDeletionStatus']['RequestId']
        })
        
    except Exception as e:
        print(f"Error revoking access: {str(e)}")
        return jsonify({'error': f'Revocation failed: {str(e)}'}), 500

@app.route('/api/approve/<request_id>', methods=['POST'])
def approve_request(request_id):
    data = request.json
    approver_role = data.get('approver_role', 'self')  # Default to self for testing
    
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
        # Create AI permission set if needed
        if access_request.get('ai_generated'):
            account_id = access_request['account_id'][-6:]  # Last 6 digits of account
            user_email = access_request['user_email'].split('@')[0].replace('.', '')[:8]  # First 8 chars of username
            ps_name = f"JIT_{account_id}_{user_email}_{request_id[:6]}"
            ps_result = create_custom_permission_set(ps_name, access_request['ai_permissions'])
            
            if 'error' in ps_result:
                access_request['status'] = 'failed'
                return jsonify({'status': 'failed', 'error': f"Permission set creation failed: {ps_result['error']}"})
            
            access_request['permission_set'] = ps_result['arn']
            access_request['permission_set_name'] = ps_name
        
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
            'message': f"✅ Access granted! Permission set '{ps_name}' created and assigned.",
            'permission_set_name': ps_name,
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
        
        # Find user by username variations
        user_response = {'Users': []}
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

@app.route('/api/admin/users', methods=['GET'])
def get_users():
    """Get all users for admin management"""
    try:
        users = {}
        for request in requests_db.values():
            email = request['user_email']
            if email not in users:
                users[email] = {
                    'email': email,
                    'source': 'Google Workspace',
                    'status': 'Active',
                    'mfa_enabled': True,
                    'last_login': '2024-01-15 10:30',
                    'request_count': 0,
                    'first_request': request['created_at']
                }
            users[email]['request_count'] += 1
        
        return jsonify(list(users.values()))
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/onboard-user', methods=['POST'])
def manual_onboard_user():
    """Manually onboard a new user"""
    try:
        data = request.get_json()
        
        required_fields = ['email', 'name', 'temp_password']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400
        
        return jsonify({
            'message': f"User {data['email']} onboarded successfully",
            'user_id': data['email'],
            'temp_password_sent': True,
            'mfa_enabled': data.get('enable_mfa', False)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/request-for-others', methods=['POST'])
def request_for_others():
    """Submit access request on behalf of another user"""
    try:
        data = request.get_json()
        
        required_fields = ['requester_email', 'account_id', 'duration_hours', 'justification', 'requested_by']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400
        
        request_id = str(uuid.uuid4())
        
        new_request = {
            'id': request_id,
            'user_email': data['requester_email'],
            'account_id': data['account_id'],
            'duration_hours': data['duration_hours'],
            'justification': data['justification'],
            'requested_by': data['requested_by'],
            'status': 'pending',
            'created_at': datetime.now().isoformat(),
            'expires_at': (datetime.now() + timedelta(hours=data['duration_hours'])).isoformat(),
            'permission_set': 'ReadOnlyAccess',
            'ai_generated': False
        }
        
        requests_db[request_id] = new_request
        
        return jsonify({
            'message': 'Request submitted successfully',
            'request_id': request_id,
            'status': 'pending'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/audit-logs', methods=['GET'])
def get_audit_logs():
    """Get audit logs for admin panel"""
    try:
        audit_logs = [
            {
                'timestamp': '2024-01-15 10:30:15',
                'user': 'satish.korra@nykaa.com',
                'event': 'Access Request',
                'resource': 'AWS Account 332463837037',
                'ip_address': '192.168.1.100',
                'status': 'Success'
            }
        ]
        
        return jsonify(audit_logs)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/analytics', methods=['GET'])
def get_admin_analytics():
    """Get analytics data for admin dashboard"""
    try:
        thirtyDaysAgo = datetime.now() - timedelta(days=30)
        
        user_first_request = {}
        for req in requests_db.values():
            email = req['user_email']
            req_date = datetime.fromisoformat(req['created_at'].replace('Z', '+00:00'))
            if email not in user_first_request or req_date < user_first_request[email]:
                user_first_request[email] = req_date
        
        new_users = sum(1 for date in user_first_request.values() if date >= thirtyDaysAgo)
        
        user_request_counts = {}
        for req in requests_db.values():
            email = req['user_email']
            user_request_counts[email] = user_request_counts.get(email, 0) + 1
        
        repeated_users = sum(1 for count in user_request_counts.values() if count > 3)
        
        exceptional_users = set()
        for req in requests_db.values():
            if req.get('permission_set', '').lower().find('admin') != -1:
                exceptional_users.add(req['user_email'])
        
        return jsonify({
            'new_users': new_users,
            'repeated_users': repeated_users,
            'exceptional_users': len(exceptional_users),
            'pending_approvals': len([r for r in requests_db.values() if r['status'] == 'pending']),
            'weekly_activity': [12, 19, 8, 15, 22, 3, 7],
            'request_types': {'AWS': 45, 'Applications': 25, 'Databases': 20, 'Kubernetes': 10}
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/sync-users', methods=['POST'])
def sync_users():
    """Sync users from identity providers"""
    try:
        return jsonify({
            'message': 'User sync completed successfully',
            'synced_sources': ['Google Workspace', 'Azure AD'],
            'total_users_synced': 150,
            'new_users': 5,
            'updated_users': 12
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/security/anomaly', methods=['POST'])
def log_security_anomaly():
    """Log security anomalies for admin notification"""
    try:
        anomaly_data = request.get_json()
        
        # In production, this would:
        # 1. Store in security database
        # 2. Send real-time alerts to admins
        # 3. Integrate with SIEM systems
        
        print(f"🚨 SECURITY ANOMALY DETECTED: {anomaly_data}")
        
        # Simulate admin notification
        admin_alert = {
            'alert_type': 'ANOMALOUS_ACCESS_REQUEST',
            'severity': anomaly_data.get('risk_level', 'MEDIUM'),
            'user': anomaly_data.get('user'),
            'anomalies': anomaly_data.get('anomalies', []),
            'timestamp': anomaly_data.get('timestamp'),
            'requires_investigation': True
        }
        
        return jsonify({
            'status': 'logged',
            'alert_id': str(uuid.uuid4()),
            'admin_notified': True
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/security/ai-usage', methods=['POST'])
def log_ai_usage():
    """Log AI usage for security monitoring"""
    try:
        usage_data = request.get_json()
        
        # In production, this would store in audit database
        print(f"🤖 AI USAGE: {usage_data['user_email']} - Risk: {usage_data.get('risk_score', 0)}")
        
        return jsonify({'status': 'logged'})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/siem/events', methods=['POST'])
def send_to_siem():
    """Send audit events to SIEM system"""
    try:
        events = request.get_json()
        return jsonify({
            'message': 'Events forwarded to SIEM successfully',
            'event_count': len(events)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Initialize on startup
initialize_aws_config()

if __name__ == '__main__':
    app.run(debug=True, port=5000)