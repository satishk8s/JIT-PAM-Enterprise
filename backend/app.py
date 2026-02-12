from flask import Flask, request, jsonify
from flask_cors import CORS
import boto3
from botocore.config import Config
import json
from datetime import datetime, timedelta
import uuid
import os
from dotenv import load_dotenv
import re
import threading
import time
from strict_policies import StrictPolicies
from ai_validator import AIValidator
from user_sync_engine import UserSyncEngine
from enforcement_engine import EnforcementEngine

load_dotenv()

app = Flask(__name__)
CORS(app)

def load_org_policies():
    """Load organizational policies from config file"""
    try:
        with open('org_policies.json', 'r') as f:
            return json.load(f)
    except:
        return {}  # Fallback to empty policies

# Configuration - will be populated from AWS (fallback avoids blocking on first request)
CONFIG = {
    'accounts': {'poc': {'id': 'poc', 'name': 'POC Account', 'environment': 'nonprod'}},
    'permission_sets': [{'name': 'ReadOnlyAccess', 'arn': 'fallback-arn'}],
    'sso_instance_arn': 'arn:aws:sso:::instance/ssoins-65955f0870d9f06f',
    'identity_store_id': 'd-9f677136b2',
    'sso_start_url': 'https://nykaa.awsapps.com/start'
}

# Short timeout so expired AWS creds don't hang the app
AWS_CONFIG = Config(connect_timeout=3, read_timeout=5)

def initialize_aws_config():
    """Fetch real AWS SSO configuration"""
    print("Initializing AWS config...")
    try:
        # Test AWS credentials first (with timeout to avoid hang on expired creds)
        sts = boto3.client('sts', config=AWS_CONFIG)
        identity = sts.get_caller_identity()
        print(f"AWS Identity: {identity}")
        
        account_id = identity['Account']
        print(f"Current account: {account_id}")
        
        # Use current account as POC account
        CONFIG['accounts'] = {
            account_id: {'id': account_id, 'name': f'POC-Account-{account_id}', 'environment': 'nonprod'}
        }
        
        # Get permission sets
        try:
            sso_admin = boto3.client('sso-admin', region_name='ap-south-1', config=AWS_CONFIG)
            
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
            org_client = boto3.client('organizations', config=AWS_CONFIG)
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
            # Already set current account above
        
        print(f"Final config - Accounts: {len(CONFIG['accounts'])}, Permission Sets: {len(CONFIG['permission_sets'])}")
        
    except Exception as e:
        print(f"Critical error: {e}")
        # Fallback: Do NOT call AWS again (would hang with expired creds)
        CONFIG['accounts'] = {'poc': {'id': 'poc', 'name': 'POC Account', 'environment': 'nonprod'}}
        CONFIG['permission_sets'] = [{'name': 'ReadOnlyAccess', 'arn': 'fallback-arn'}]

# Persistent storage (survives backend restart)
REQUESTS_FILE = os.path.join(os.path.dirname(__file__), 'data', 'requests.json')

def _load_requests():
    global requests_db, approvals_db
    requests_db = {}
    approvals_db = {}
    try:
        os.makedirs(os.path.dirname(REQUESTS_FILE), exist_ok=True)
        if os.path.exists(REQUESTS_FILE):
            with open(REQUESTS_FILE, 'r') as f:
                data = json.load(f)
                requests_db = {k: v for k, v in (data.get('requests') or {}).items()}
                approvals_db = {k: v for k, v in (data.get('approvals') or {}).items()}
            print(f"Loaded {len(requests_db)} requests from {REQUESTS_FILE}")
    except Exception as e:
        print(f"Could not load requests: {e}")

def _save_requests():
    try:
        os.makedirs(os.path.dirname(REQUESTS_FILE), exist_ok=True)
        def _serialize(obj):
            if hasattr(obj, 'isoformat'):
                return obj.isoformat()
            raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
        with open(REQUESTS_FILE, 'w') as f:
            json.dump({'requests': requests_db, 'approvals': approvals_db}, f, indent=0, default=_serialize)
    except Exception as e:
        print(f"Could not save requests: {e}")

_load_requests()

def build_resource_arns(selected_resources, account_id, services):
    """Dynamically build resource ARNs from selected resources"""
    print(f"\n=== build_resource_arns called ===")
    print(f"selected_resources: {selected_resources}")
    print(f"account_id: {account_id}")
    print(f"services: {services}")
    
    if not selected_resources or not services:
        print(f"⚠️ Returning wildcard - selected_resources empty: {not selected_resources}, services empty: {not services}")
        return ['*']
    
    arns = []
    region = 'ap-south-1'
    
    for service in services:
        resources = selected_resources.get(service, [])
        if not resources:
            continue
        
        for resource in resources:
            resource_id = resource.get('id', '')
            
            if service == 's3':
                arns.append(f"arn:aws:s3:::{resource_id}")
                arns.append(f"arn:aws:s3:::{resource_id}/*")
            elif service == 'ec2':
                arns.append(f"arn:aws:ec2:{region}:{account_id}:instance/{resource_id}")
            elif service == 'lambda':
                arns.append(f"arn:aws:lambda:{region}:{account_id}:function:{resource_id}")
            elif service == 'rds':
                arns.append(f"arn:aws:rds:{region}:{account_id}:db:{resource_id}")
            elif service == 'dynamodb':
                arns.append(f"arn:aws:dynamodb:{region}:{account_id}:table/{resource_id}")
            elif service == 'secretsmanager':
                arns.append(resource_id)  # Already full ARN
            elif service == 'logs':
                arns.append(f"arn:aws:logs:{region}:{account_id}:log-group:{resource_id}:*")
            elif service == 'sns':
                arns.append(resource_id)  # Already full ARN
            elif service == 'sqs':
                arns.append(resource_id)  # Already full ARN
            elif service == 'elasticloadbalancing':
                arns.append(resource_id)  # Already full ARN
            elif service == 'kms':
                arns.append(f"arn:aws:kms:{region}:{account_id}:key/{resource_id}")
            else:
                print(f"⚠️ Unknown service: {service}, using wildcard")
                arns.append('*')  # Fallback for unknown services
    
    final_arns = arns if arns else ['*']
    print(f"✅ Final ARNs: {final_arns}")
    print(f"=== build_resource_arns done ===\n")
    return final_arns

def generate_ai_permissions(use_case_description, account_env='nonprod'):
    """Generate AWS permissions using Bedrock AI or fallback to rules"""
    # CRITICAL: Always load fresh config (admin may have changed toggles)
    policy_config = StrictPolicies.get_config()
    print(f"🔄 [generate_ai_permissions] Fresh config: delete_nonprod={policy_config.get('allow_delete_nonprod')}, delete_prod={policy_config.get('allow_delete_prod')}")
    
    # Check for non-AWS requests first
    non_aws_keywords = ['azure', 'gcp', 'google cloud', 'kubernetes', 'k8s', 'database', 'mysql', 'postgres', 'mongodb', 'jenkins', 'grafana', 'sonar', 'jira', 'splunk', 'servicenow']
    use_case_lower = use_case_description.lower()
    
    found_non_aws = [keyword for keyword in non_aws_keywords if keyword in use_case_lower]
    if found_non_aws:
        return {
            'error': f'❌ AI Access Denied\n\nThis system currently only supports AWS access requests.\n\nDetected: {", ".join(found_non_aws)}\n\nFor non-AWS access, please use the Applications page or contact your system administrator.'
        }
    
    print(f"Generating permissions for {account_env} environment")
    
    # Check for delete intent first
    delete_intent_keywords = ['delete', 'remove', 'cleanup', 'clean', 'housekeep', 'terminate', 'destroy', 'purge', 'clear', 'wipe', 'erase', 'drop', 'kill', "don't need", "dont need", "no longer need", "not needed", "no more required", "not required", "get rid of", "dispose", "lets remove", "let's remove", "exclude", "consuming bill", "costing money", "wasting money", "unnecessary cost"]
    has_delete_intent = any(keyword in use_case_lower for keyword in delete_intent_keywords)
    
    # Check for create actions ONLY if NOT a delete request
    if not has_delete_intent:
        create_keywords = ['create', 'launch', 'run instances']
        has_create = any(keyword in use_case_lower for keyword in create_keywords)
        if has_create:
            if account_env == 'prod' and not policy_config.get('allow_create_prod', False):
                return {'error': '❌ Create actions are disabled in production. Contact DevOps team.'}
            if account_env != 'prod' and not policy_config.get('allow_create_nonprod', False):
                return {'error': '❌ Create actions are disabled. Contact DevOps team.'}
    
    # Check for admin actions
    admin_keywords = ['admin', 'administrator', 'full access', 'all permissions', '*']
    has_admin = any(keyword in use_case_lower for keyword in admin_keywords)
    if has_admin:
        if account_env == 'prod' and not policy_config.get('allow_admin_prod', False):
            return {'error': '❌ Admin actions are disabled in production. Contact CISO.'}
        if account_env == 'sandbox' and not policy_config.get('allow_admin_sandbox', True):
            return {'error': '❌ Admin actions are disabled in sandbox.'}
        if account_env not in ['prod', 'sandbox'] and not policy_config.get('allow_admin_nonprod', False):
            return {'error': '❌ Admin actions are disabled. Contact security team.'}
    
    # Try AI first
    try:
        # Use direct credentials (no role assumption)
        bedrock = boto3.client(
            'bedrock-runtime',
            region_name='ap-south-1'
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
            
            # CRITICAL: Check delete actions against toggle settings FIRST
            delete_actions = [action for action in ai_permissions.get('actions', []) if any(word in action.lower() for word in ['delete', 'terminate', 'remove'])]
            if delete_actions:
                # Check if delete is allowed based on environment
                if account_env == 'prod':
                    delete_allowed = policy_config.get('allow_delete_prod', False)
                else:
                    delete_allowed = policy_config.get('allow_delete_nonprod', False)
                
                print(f"🗑️ AI generated delete actions: {delete_actions}")
                print(f"🔍 Delete allowed ({account_env}): {delete_allowed}")
                
                if not delete_allowed:
                    env_label = 'production' if account_env == 'prod' else 'non-production'
                    return {'error': f'❌ Delete/Cleanup actions are disabled in {env_label} environments. Contact security team.'}
            
            # Double-check AI response for restricted actions
            restricted_actions = []
            for action in ai_permissions.get('actions', []):
                if any(word in action.lower() for word in ['*', 'admin', 'create', 'launch']):
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
        print(f"❌ Bedrock AI failed: {e}")
        print(f"🔄 Falling back to keyword parser")
    
    # Fallback to rule-based generation
    result = generate_fallback_permissions(use_case_description, account_env)
    result['fallback'] = True
    return result

def generate_fallback_permissions(use_case, account_env='nonprod'):
    """Rule-based permission generation with security restrictions"""
    use_case_lower = use_case.lower()
    actions = []
    resources = ['*']
    description = "AWS rule-based permissions for: " + use_case
    
    print(f"🔑 KEYWORD PARSER: Processing use case: {use_case_lower}")
    
    # Check for explicit cancellation only
    cancel_keywords = ['cancel this', 'nevermind', 'never mind', 'forget it', 'abort']
    if any(kw in use_case_lower for kw in cancel_keywords):
        return {'error': '❌ Request cancelled. No permissions generated.'}
    
    # Check for non-AWS requests first
    non_aws_keywords = ['azure', 'gcp', 'google cloud', 'kubernetes', 'k8s', 'database', 'mysql', 'postgres', 'mongodb', 'jenkins', 'grafana', 'sonar', 'jira', 'splunk', 'servicenow']
    found_non_aws = [kw for kw in non_aws_keywords if kw in use_case_lower]
    if found_non_aws:
        return {
            'error': f'❌ AI Access Denied\n\nThis system currently only supports AWS access requests.\n\nDetected: {", ".join(found_non_aws)}\n\nFor non-AWS access, please use the Applications page or contact your system administrator.'
        }
    
    # Get policy settings
    policy_config = StrictPolicies.get_config()
    
    # Detect if user wants delete/cleanup actions - check FIRST before service detection
    delete_intent_keywords = ['delete', 'remove', 'cleanup', 'clean', 'housekeep', 'terminate', 'destroy', 'purge', 'clear', 'wipe', 'erase', 'drop', 'kill', "don't need", "dont need", "doesn't need", "doesnt need", "no longer need", "not needed", "no more required", "not required", "get rid of", "dispose", "lets remove", "let's remove", "exclude", "consuming bill", "costing money", "wasting money", "unnecessary cost"]
    has_delete_intent = any(kw in use_case_lower for kw in delete_intent_keywords)
    print(f"🗑️ Delete intent detected: {has_delete_intent}")
    
    # Check if delete is allowed based on environment
    if account_env == 'prod':
        delete_allowed = policy_config.get('allow_delete_prod', False)
    else:
        delete_allowed = policy_config.get('allow_delete_nonprod', True)  # Default to True for non-prod
    
    print(f"🔍 Use case: {use_case_lower}")
    print(f"🔍 Account environment: {account_env}")
    print(f"🔍 Policy config: {policy_config}")
    print(f"🗑️ Delete intent: {has_delete_intent}, Delete allowed ({account_env}): {delete_allowed}")
    
    # BLOCK REQUEST if delete intent detected but not allowed
    if has_delete_intent and not delete_allowed:
        env_label = 'production' if account_env == 'prod' else 'non-production'
        return {'error': f'❌ Delete/Cleanup actions are disabled in {env_label} environments. Contact security team.'}
    
    # Check create actions ONLY if NOT a delete request
    if not has_delete_intent:
        create_keywords = ['create', 'run instances', 'launch', 'provision', 'spin up']
        has_create = any(kw in use_case_lower for kw in create_keywords)
        if has_create:
            if account_env == 'prod' and not policy_config.get('allow_create_prod', False):
                return {'error': '❌ Create actions are disabled in production. Contact DevOps team.'}
            if account_env != 'prod' and not policy_config.get('allow_create_nonprod', False):
                return {'error': '❌ Create actions are disabled. Contact DevOps team.'}
    
    # Check admin actions
    admin_keywords = ['admin', 'administrator', 'full access', 'all permissions']
    has_admin = any(kw in use_case_lower for kw in admin_keywords)
    if has_admin:
        if account_env == 'prod' and not policy_config.get('allow_admin_prod', False):
            return {'error': '❌ Admin actions are disabled in production. Contact CISO.'}
        if account_env == 'sandbox' and not policy_config.get('allow_admin_sandbox', True):
            return {'error': '❌ Admin actions are disabled in sandbox.'}
        if account_env not in ['prod', 'sandbox'] and not policy_config.get('allow_admin_nonprod', False):
            return {'error': '❌ Admin actions are disabled. Contact security team.'}
    
    # Dynamic AWS service detection with common patterns
    aws_services = {
        'ec2': {'keywords': ['ec2', 'instance', 'server', 'vm'], 'read': ['ec2:Describe*', 'ssm:StartSession', 'ssm:DescribeInstanceInformation'], 'write': ['ec2:ModifyInstanceAttribute', 'ec2:AssociateIamInstanceProfile', 'ec2:ReplaceIamInstanceProfileAssociation', 'ec2:StartInstances', 'ec2:StopInstances', 'ec2:RebootInstances', 'iam:PassRole'], 'delete': ['ec2:TerminateInstances']},
        's3': {'keywords': ['s3', 'bucket'], 'read': ['s3:ListBucket', 's3:GetObject', 's3:GetObjectVersion'], 'write': ['s3:PutObject'], 'delete': ['s3:DeleteObject', 's3:DeleteObjectVersion']},
        'lambda': {'keywords': ['lambda', 'function'], 'read': ['lambda:List*', 'lambda:Get*', 'lambda:InvokeFunction'], 'delete': ['lambda:DeleteFunction']},
        'dynamodb': {'keywords': ['dynamodb', 'dynamo', 'table'], 'read': ['dynamodb:List*', 'dynamodb:Describe*', 'dynamodb:Scan', 'dynamodb:Query'], 'delete': ['dynamodb:DeleteItem', 'dynamodb:DeleteTable']},
        'rds': {'keywords': ['rds', 'database', 'db'], 'read': ['rds:Describe*'], 'delete': ['rds:DeleteDBInstance']},
        'cloudwatch': {'keywords': ['logs', 'cloudwatch', 'monitoring'], 'read': ['logs:Describe*', 'logs:Get*'], 'delete': ['logs:DeleteLogGroup']},
        'elb': {'keywords': ['load balancer', 'loadbalancer', 'elb', 'alb', 'nlb', 'elasticloadbalancing'], 'read': ['elasticloadbalancing:Describe*'], 'write': ['elasticloadbalancing:RegisterTargets', 'elasticloadbalancing:DeregisterTargets', 'elasticloadbalancing:ModifyLoadBalancerAttributes', 'elasticloadbalancing:ModifyTargetGroup'], 'delete': ['elasticloadbalancing:DeleteLoadBalancer', 'elasticloadbalancing:DeleteTargetGroup']},
        'kms': {'keywords': ['kms', 'key', 'encryption'], 'read': ['kms:List*', 'kms:Describe*'], 'delete': []},
        'sns': {'keywords': ['sns', 'topic', 'notification'], 'read': ['sns:List*', 'sns:Get*'], 'delete': ['sns:DeleteTopic']},
        'sqs': {'keywords': ['sqs', 'queue'], 'read': ['sqs:List*', 'sqs:Get*'], 'delete': ['sqs:DeleteQueue']},
        'ecs': {'keywords': ['ecs', 'container', 'task'], 'read': ['ecs:List*', 'ecs:Describe*'], 'delete': ['ecs:DeleteService', 'ecs:DeleteCluster']},
        'eks': {'keywords': ['eks', 'kubernetes', 'k8s'], 'read': ['eks:List*', 'eks:Describe*'], 'delete': ['eks:DeleteCluster']},
        'elasticache': {'keywords': ['elasticache', 'redis', 'memcached'], 'read': ['elasticache:Describe*'], 'delete': ['elasticache:DeleteCacheCluster']},
        'secretsmanager': {'keywords': ['secret', 'secrets', 'secretsmanager', 'secrets manager', 'password'], 'read': ['secretsmanager:List*', 'secretsmanager:Describe*', 'secretsmanager:GetSecretValue'], 'delete': ['secretsmanager:DeleteSecret']},
    }
    
    detected_services = []
    for service, config in aws_services.items():
        # Match keywords as whole words using regex word boundaries
        service_detected = False
        for kw in config['keywords']:
            # Use regex to match whole words only
            pattern = r'\b' + re.escape(kw) + r'\b'
            if re.search(pattern, use_case_lower):
                service_detected = True
                break
        
        if service_detected:
            detected_services.append(service)
            
            # Add delete actions if intent detected and allowed
            if has_delete_intent and delete_allowed:
                if service == 'kms':
                    return {'error': '❌ KMS key deletion is strictly forbidden. Contact CISO.'}
                delete_actions = config.get('delete', [])
                print(f"➕ Adding delete actions for {service}: {delete_actions}")
                actions.extend(delete_actions)
            elif any(w in use_case_lower for w in ['write', 'modify', 'update', 'change', 'attach', 'start', 'stop', 'reboot']):
                # Add write actions for modify operations
                write_actions = config.get('write', [])
                print(f"➕ Adding write actions for {service}: {write_actions}")
                actions.extend(write_actions)
                # Also add read actions for context
                actions.extend(config['read'])
            else:
                # Only add read actions if NOT a delete/write request
                print(f"➕ Adding read actions for {service}")
                actions.extend(config['read'])
            
            # Add write actions for S3
            if service == 's3' and any(w in use_case_lower for w in ['upload', 'write', 'put']):
                actions.extend(config.get('write', []))
            
            # Add write actions for ELB
            if service == 'elb' and any(w in use_case_lower for w in ['attach', 'register', 'modify', 'update', 'change']):
                actions.extend(config.get('write', []))
    
    if detected_services:
        description = f"Access to {', '.join(detected_services).upper()}"
        if has_delete_intent and delete_allowed:
            description += ' | Delete enabled'
    
    # Secrets Manager special validation
    if 'secretsmanager' in detected_services:
        if not any(word in use_case for word in ['secret:', 'secret-', 'secret_', 'secret/']):
            return {'error': '❌ Secrets Manager requires specific secret names. Example: "read secret MyApp-DB-Password"'}
    
    # If no service detected, return error
    if not detected_services:
        return {'error': '❌ No AWS service detected. Please specify service (e.g., EC2, S3, Lambda, DynamoDB, RDS, ECS, SNS, SQS).'}
    
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
        
        # Create SEPARATE statements per service for security
        statements = []
        if 'grouped_actions' in permissions_data:
            for service, data in permissions_data['grouped_actions'].items():
                statements.append({
                    'Sid': service.upper().replace('-', ''),
                    'Effect': 'Allow',
                    'Action': data['actions'],
                    'Resource': data['resources']
                })
        else:
            # Fallback for old format
            statements.append({
                'Effect': 'Allow',
                'Action': permissions_data.get('actions', []),
                'Resource': permissions_data.get('resources', ['*'])
            })
        
        policy_doc = {
            'Version': '2012-10-17',
            'Statement': statements
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

@app.route('/health')
@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'service': 'npam-backend'})

@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    if not CONFIG['accounts']:
        initialize_aws_config()
    # Always return something - never block. Fallback for expired AWS creds.
    if not CONFIG['accounts']:
        CONFIG['accounts'] = {'poc': {'id': 'poc', 'name': 'POC Account', 'environment': 'nonprod'}}
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

from intent_classifier import IntentClassifier
from conversation_manager import ConversationManager
from guardrails_generator import GuardrailsGenerator
from scp_manager import SCPManager
from access_rules import AccessRules
from help_assistant import HelpAssistant
from scp_troubleshoot import SCPTroubleshoot
from unified_assistant import UnifiedAssistant

@app.route('/api/generate-permissions', methods=['POST'])
def generate_permissions():
    print("\n" + "="*80)
    print("🚀 /api/generate-permissions CALLED")
    print("="*80)
    data = request.json
    use_case = data.get('use_case', '')
    account_id = data.get('account_id', '')
    conversation_id = data.get('conversation_id')  # For multi-turn conversation
    user_email = data.get('user_email', 'user@example.com')
    selected_resources = data.get('selected_resources', {})  # {service: [{id, name}]}
    
    print(f"📝 Use case: {use_case}")
    print(f"🆔 Conversation ID: {conversation_id}")
    print(f"📦 Selected resources: {list(selected_resources.keys())}")
    
    if not use_case:
        return jsonify({'error': 'Use case description required'}), 400
    
    # CHECK ACCESS RULES: Enforce group-based restrictions
    print(f"🔒 Checking access rules for user: {user_email}")
    rules = AccessRules.get_rules()
    print(f"📋 Total rules: {len(rules.get('rules', []))}")
    
    for rule in rules.get('rules', []):
        if not rule.get('enabled'):
            continue
        
        # Check if user is in restricted group
        groups_path = os.path.join(os.path.dirname(__file__), 'user_groups.json')
        with open(groups_path, 'r') as f:
            groups_data = json.load(f)
        
        user_groups = [g['id'] for g in groups_data['groups'] if user_email in g.get('members', [])]
        print(f"👤 User {user_email} is in groups: {user_groups}")
        print(f"🚫 Rule restricts groups: {rule.get('groups', [])}")
        
        if any(g in rule.get('groups', []) for g in user_groups):
            print(f"✅ User matched restricted group!")
            # User is in restricted group - check if requesting denied service
            use_case_lower = use_case.lower()
            denied_services = rule.get('denied_services', [])
            print(f"🚫 Denied services: {denied_services}")
            print(f"📝 Use case: {use_case_lower}")
            
            # Also check selected_resources for denied services
            selected_service_ids = list(selected_resources.keys()) if selected_resources else []
            print(f"📦 Selected services: {selected_service_ids}")
            
            for denied_service in denied_services:
                # Check both use case text and selected resources
                if denied_service.lower() in use_case_lower or denied_service in selected_service_ids:
                    print(f"❌ BLOCKED: User requested denied service {denied_service}")
                    return jsonify({
                        'error': f'❌ Access Denied\n\nYour group is restricted from requesting {denied_service.upper()} access.\n\nAllowed services: {", ".join([s.upper() for s in rule.get("allowed_services", [])])}\n\nContact your administrator for access to other services.'
                    }), 403
    
    print(f"✅ Access rules check passed for {user_email}")
    print(f"📦 Selected resources: {list(selected_resources.keys()) if selected_resources else 'None'}")
    
    # Get account environment
    account_env = 'nonprod'
    if account_id and account_id in CONFIG['accounts']:
        account_env = CONFIG['accounts'][account_id].get('environment', 'nonprod')
    
    print(f"Account: {account_id}, Environment: {account_env}")
    
    # CHECK FOR EC2 TERMINAL ACCESS - Redirect to Instances page
    terminal_keywords = ['connect to ec2', 'connect ec2', 'ssh', 'login to ec2', 'terminal', 'shell access', 'access ec2', 'connect to instance']
    use_case_lower = use_case.lower()
    if 'ec2' in list(selected_resources.keys()) and any(kw in use_case_lower for kw in terminal_keywords):
        return jsonify({
            'redirect_to_terminal': True,
            'message': 'For terminal/SSH access to EC2 instances, please use the Instances page under Workloads section.'
        })
    
    # CRITICAL: Load fresh policy config on EVERY request (admin may have changed toggles)
    policy_config = StrictPolicies.get_config()
    print(f"🔄 Fresh policy config loaded: delete_nonprod={policy_config.get('allow_delete_nonprod')}, delete_prod={policy_config.get('allow_delete_prod')}")
    
    # CONVERSATIONAL AI FLOW - Always try conversation first
    print(f"🤖 Conversation ID: {conversation_id}")
    print(f"🤖 Use case: {use_case}")
    print(f"🤖 Selected resources: {list(selected_resources.keys())}")
    
    if conversation_id:
        # Continue existing conversation
        ConversationManager.add_message(conversation_id, 'user', use_case)
        clarification = ConversationManager.ask_ai_clarification(conversation_id, selected_resources)
        
        if clarification.get('needs_clarification'):
            return jsonify({
                'needs_clarification': True,
                'question': clarification['question'],
                'conversation_id': conversation_id
            })
        elif clarification.get('ready'):
            # Check for terminal redirect
            if clarification.get('redirect_to_terminal'):
                return jsonify({
                    'redirect_to_terminal': True,
                    'message': clarification.get('message', 'Please use Instances page for terminal access'),
                    'conversation_id': conversation_id
                })
            
            if clarification.get('intent') == 'create':
                ConversationManager.end_conversation(conversation_id)
                return jsonify({'error': 'Infrastructure provisioning detected. Please contact DevOps team.'}), 400
            
            # Generate from AI understanding
            intent = clarification.get('intent', 'read')
            services = clarification.get('services', [])
            actions = clarification.get('actions', [])
            grouped_actions = clarification.get('grouped_actions', {})
            
            # Handle grouped actions (separate statements per service)
            if grouped_actions:
                print(f"📦 Grouped actions: {list(grouped_actions.keys())}")
                for service, data in grouped_actions.items():
                    svc_actions = data.get('actions', [])
                    delete_acts = [a for a in svc_actions if any(w in a.lower() for w in ['delete', 'terminate'])]
                    if delete_acts and not policy_config.get(f'allow_delete_{account_env}' if account_env == 'prod' else 'allow_delete_nonprod', False):
                        ConversationManager.end_conversation(conversation_id)
                        return jsonify({'error': f'❌ Delete disabled in {account_env}.'}), 403
                    create_acts = [a for a in svc_actions if any(w in a.lower() for w in ['create', 'runinstances'])]
                    if create_acts and not policy_config.get(f'allow_create_{account_env}' if account_env == 'prod' else 'allow_create_nonprod', False):
                        ConversationManager.end_conversation(conversation_id)
                        return jsonify({'error': f'❌ Create disabled in {account_env}.'}), 403
                return jsonify({'grouped_actions': grouped_actions, 'description': clarification.get('description', 'Multi-service'), 'conversation_id': conversation_id})
            
            if actions:
                # Check for KMS deletion
                if any('kms' in action.lower() and ('delete' in action.lower() or 'disable' in action.lower() or 'schedule' in action.lower()) for action in actions):
                    ConversationManager.end_conversation(conversation_id)
                    return jsonify({'error': '❌ KMS key deletion is strictly forbidden. Contact CISO.'}), 403
                
                # CRITICAL: Check delete actions against toggles
                delete_actions = [action for action in actions if any(word in action.lower() for word in ['delete', 'terminate', 'remove'])]
                if delete_actions:
                    if account_env == 'prod':
                        delete_allowed = policy_config.get('allow_delete_prod', False)
                    else:
                        delete_allowed = policy_config.get('allow_delete_nonprod', False)
                    
                    print(f"🗑️ Delete actions: {delete_actions}, allowed: {delete_allowed}")
                    if not delete_allowed:
                        env_label = 'production' if account_env == 'prod' else 'non-production'
                        ConversationManager.end_conversation(conversation_id)
                        return jsonify({'error': f'❌ Delete/Cleanup actions are disabled in {env_label} environments. Contact security team.'}), 403
                
                # Check create actions against toggles
                create_actions = [action for action in actions if any(word in action.lower() for word in ['create', 'runinstances', 'launch'])]
                if create_actions:
                    if account_env == 'prod':
                        create_allowed = policy_config.get('allow_create_prod', False)
                    else:
                        create_allowed = policy_config.get('allow_create_nonprod', False)
                    
                    print(f"🏗️ Create actions: {create_actions}, allowed: {create_allowed}")
                    if not create_allowed:
                        env_label = 'production' if account_env == 'prod' else 'non-production'
                        ConversationManager.end_conversation(conversation_id)
                        return jsonify({'error': f'❌ Create actions are disabled in {env_label} environments. Contact DevOps team.'}), 403
                
                # Check admin actions against toggles
                admin_actions = [action for action in actions if any(word in action.lower() for word in ['*', 'admin', 'full'])]
                if admin_actions:
                    if account_env == 'prod':
                        admin_allowed = policy_config.get('allow_admin_prod', False)
                    elif account_env == 'sandbox':
                        admin_allowed = policy_config.get('allow_admin_sandbox', True)
                    else:
                        admin_allowed = policy_config.get('allow_admin_nonprod', False)
                    
                    print(f"👑 Admin actions: {admin_actions}, allowed: {admin_allowed}")
                    if not admin_allowed:
                        ConversationManager.end_conversation(conversation_id)
                        return jsonify({'error': f'❌ Admin actions are disabled. Contact CISO.'}), 403
                
                # AI provided specific actions - determine intent from actions
                detected_intent = 'READ'
                if any('delete' in action.lower() or 'terminate' in action.lower() for action in actions):
                    detected_intent = 'DELETE'
                elif any('create' in action.lower() or 'put' in action.lower() or 'write' in action.lower() for action in actions):
                    detected_intent = 'WRITE'
                
                # Use resources from Bedrock AI response (it decides based on context)
                resource_arns = clarification.get('resources', ['*'])
                print(f"🤖 Bedrock resources: {resource_arns}")
                
                # CHECK WITH SCP AI: Proactive SCP warnings
                scp_warnings = []
                if account_id:
                    scp_warnings = SCPTroubleshoot.check_default_scps(account_id, actions)
                
                response_data = {
                    'actions': actions,
                    'resources': resource_arns,
                    'description': f"{detected_intent} access to {', '.join([s.upper() for s in services]) if services else 'AWS services'}",
                    'conversation_id': conversation_id
                }
                
                # Add SCP warnings if any
                if scp_warnings:
                    response_data['scp_warnings'] = scp_warnings
                
                # DON'T end conversation - allow user to continue adding services
                return jsonify(response_data)
            else:
                # Build use case from AI understanding with proper formatting
                service_names = ' '.join([f"{s} buckets" if s == 's3' else f"{s} instances" if s == 'ec2' else s for s in services])
                use_case = f"{intent} {service_names}"
                print(f"🔨 Built use case from keyword matcher: '{use_case}'")
                ConversationManager.end_conversation(conversation_id)
    else:
        # New request - start conversation
        region = data.get('region', 'ap-south-1')
        conv_id = ConversationManager.start_conversation(user_email, use_case, account_env, selected_resources, account_id, region)
        clarification = ConversationManager.ask_ai_clarification(conv_id, selected_resources)
        
        if clarification.get('needs_clarification'):
            return jsonify({
                'needs_clarification': True,
                'question': clarification['question'],
                'conversation_id': conv_id
            })
        elif clarification.get('ready'):
            # Check for terminal redirect
            if clarification.get('redirect_to_terminal'):
                return jsonify({
                    'redirect_to_terminal': True,
                    'message': clarification.get('message', 'Please use Instances page for terminal access'),
                    'conversation_id': conv_id
                })
            
            if clarification.get('intent') == 'create':
                ConversationManager.end_conversation(conv_id)
                return jsonify({'error': 'Infrastructure provisioning detected. Please contact DevOps team.'}), 400
            
            # Generate from AI understanding
            intent = clarification.get('intent', 'read')
            services = clarification.get('services', [])
            actions = clarification.get('actions', [])
            grouped_actions = clarification.get('grouped_actions', {})
            
            # Handle grouped actions (separate statements per service)
            if grouped_actions:
                print(f"📦 Grouped actions: {list(grouped_actions.keys())}")
                for service, data in grouped_actions.items():
                    svc_actions = data.get('actions', [])
                    delete_acts = [a for a in svc_actions if any(w in a.lower() for w in ['delete', 'terminate'])]
                    if delete_acts and not policy_config.get(f'allow_delete_{account_env}' if account_env == 'prod' else 'allow_delete_nonprod', False):
                        ConversationManager.end_conversation(conv_id)
                        return jsonify({'error': f'❌ Delete disabled in {account_env}.'}), 403
                    create_acts = [a for a in svc_actions if any(w in a.lower() for w in ['create', 'runinstances'])]
                    if create_acts and not policy_config.get(f'allow_create_{account_env}' if account_env == 'prod' else 'allow_create_nonprod', False):
                        ConversationManager.end_conversation(conv_id)
                        return jsonify({'error': f'❌ Create disabled in {account_env}.'}), 403
                return jsonify({'grouped_actions': grouped_actions, 'description': clarification.get('description', 'Multi-service'), 'conversation_id': conv_id})
            
            if actions:
                # Check for KMS deletion
                if any('kms' in action.lower() and ('delete' in action.lower() or 'disable' in action.lower() or 'schedule' in action.lower()) for action in actions):
                    ConversationManager.end_conversation(conv_id)
                    return jsonify({'error': '❌ KMS key deletion is strictly forbidden. Contact CISO.'}), 403
                
                # CRITICAL: Check delete actions against toggles
                delete_actions = [action for action in actions if any(word in action.lower() for word in ['delete', 'terminate', 'remove'])]
                if delete_actions:
                    if account_env == 'prod':
                        delete_allowed = policy_config.get('allow_delete_prod', False)
                    else:
                        delete_allowed = policy_config.get('allow_delete_nonprod', False)
                    
                    print(f"🗑️ Delete actions: {delete_actions}, allowed: {delete_allowed}")
                    if not delete_allowed:
                        env_label = 'production' if account_env == 'prod' else 'non-production'
                        ConversationManager.end_conversation(conv_id)
                        return jsonify({'error': f'❌ Delete/Cleanup actions are disabled in {env_label} environments. Contact security team.'}), 403
                
                # Check create actions against toggles
                create_actions = [action for action in actions if any(word in action.lower() for word in ['create', 'runinstances', 'launch'])]
                if create_actions:
                    if account_env == 'prod':
                        create_allowed = policy_config.get('allow_create_prod', False)
                    else:
                        create_allowed = policy_config.get('allow_create_nonprod', False)
                    
                    print(f"🏗️ Create actions: {create_actions}, allowed: {create_allowed}")
                    if not create_allowed:
                        env_label = 'production' if account_env == 'prod' else 'non-production'
                        ConversationManager.end_conversation(conv_id)
                        return jsonify({'error': f'❌ Create actions are disabled in {env_label} environments. Contact DevOps team.'}), 403
                
                # Check admin actions against toggles
                admin_actions = [action for action in actions if any(word in action.lower() for word in ['*', 'admin', 'full'])]
                if admin_actions:
                    if account_env == 'prod':
                        admin_allowed = policy_config.get('allow_admin_prod', False)
                    elif account_env == 'sandbox':
                        admin_allowed = policy_config.get('allow_admin_sandbox', True)
                    else:
                        admin_allowed = policy_config.get('allow_admin_nonprod', False)
                    
                    print(f"👑 Admin actions: {admin_actions}, allowed: {admin_allowed}")
                    if not admin_allowed:
                        ConversationManager.end_conversation(conv_id)
                        return jsonify({'error': f'❌ Admin actions are disabled. Contact CISO.'}), 403
                
                # AI provided specific actions - determine intent from actions
                detected_intent = 'READ'
                if any('delete' in action.lower() or 'terminate' in action.lower() for action in actions):
                    detected_intent = 'DELETE'
                elif any('create' in action.lower() or 'put' in action.lower() or 'write' in action.lower() for action in actions):
                    detected_intent = 'WRITE'
                
                # Use resources from Bedrock AI response (it decides based on context)
                resource_arns = clarification.get('resources', ['*'])
                print(f"🤖 Bedrock resources: {resource_arns}")
                
                # DON'T end conversation - allow user to continue
                return jsonify({
                    'actions': actions,
                    'resources': resource_arns,
                    'description': f"{detected_intent} access to {', '.join([s.upper() for s in services]) if services else 'AWS services'}",
                    'conversation_id': conv_id
                })
            else:
                # Build use case from AI understanding with proper formatting
                service_names = ' '.join([f"{s} buckets" if s == 's3' else f"{s} instances" if s == 'ec2' else s for s in services])
                use_case = f"{intent} {service_names}"
                ConversationManager.end_conversation(conv_id)
    
    # STRICT VALIDATION LAYER 1: Validate user input for prompt injection
    is_valid, error = StrictPolicies.validate_user_input(use_case)
    if not is_valid:
        return jsonify({'error': error}), 403
    
    # STRICT VALIDATION LAYER 2: Detect non-AWS requests
    is_non_aws, detected_services = AIValidator.detect_non_aws_request(use_case)
    if is_non_aws:
        return jsonify({
            'error': f'❌ AI only generates AWS permissions. Detected: {", ".join(detected_services)}. Use Applications page for non-AWS access.'
        }), 400
    
    # LAYER 3: Intent Detection
    intent_result = IntentClassifier.detect_intent(use_case)
    
    # Route infrastructure requests to DevOps (skip if handled by conversation)
    if not conversation_id:
        if intent_result['requires_infrastructure']:
            return jsonify({
                'error': intent_result['message'],
                'intent_analysis': intent_result,
                'suggestion': 'create_jira_ticket'
            }), 400
        
        # Delete operations are validated by StrictPolicies based on toggle settings
        # Don't block here - let the policy validation handle it
    
    # Simple validation - AI only responds to AWS access requests
    use_case_lower = use_case.lower()
    
    # Check for explicitly non-AWS requests only
    non_aws_keywords = ['azure', 'gcp', 'google cloud', 'mysql', 'postgres', 'mongodb', 'jenkins', 'grafana', 'sonar', 'jira', 'splunk', 'servicenow', 'okta', 'onelogin', 'auth0', 'ping', 'duo']
    found_non_aws = [kw for kw in non_aws_keywords if kw in use_case_lower]
    
    if found_non_aws:
        return jsonify({
            'error': f'AI only generates AWS permissions. Detected non-AWS: {", ".join(found_non_aws)}. Use Applications page for non-AWS access.'
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
    
    # Generate AI permissions with account environment
    print(f"🎯 Calling generate_ai_permissions with use_case: '{use_case}'")
    ai_output = generate_ai_permissions(use_case, account_env)
    
    # Log which method was used
    print(f"🤖 Generation method: {'Bedrock AI' if not ai_output.get('fallback') else 'Keyword Parser'}")
    
    # Check if AI generation failed
    if 'error' in ai_output:
        return jsonify(ai_output), 400
    
    # STRICT VALIDATION LAYER 4: Validate AI output
    is_valid, sanitized_output, error = AIValidator.validate_ai_response(
        ai_output, use_case, account_env
    )
    
    if not is_valid:
        return jsonify({'error': error}), 403
    
    # STRICT VALIDATION LAYER 4.5: Filter actions to only selected services
    if selected_resources:
        selected_service_ids = list(selected_resources.keys())
        filtered_actions = []
        for action in sanitized_output.get('actions', []):
            service_prefix = action.split(':')[0].lower()
            if service_prefix in selected_service_ids:
                filtered_actions.append(action)
        
        if filtered_actions:
            sanitized_output['actions'] = filtered_actions
            print(f"✅ Filtered actions to selected services: {selected_service_ids}")
        else:
            print(f"⚠️ No actions matched selected services, keeping original")
    
    # STRICT VALIDATION LAYER 5: Check duration limits
    duration = data.get('duration_hours', 8)
    is_valid, error = StrictPolicies.validate_duration(duration, account_env)
    if not is_valid:
        return jsonify({'error': error}), 403
    
    # STRICT VALIDATION LAYER 6: Determine approval requirements
    requires_approval, approval_type = StrictPolicies.requires_approval(
        sanitized_output['actions'], account_env
    )
    
    sanitized_output['requires_approval'] = requires_approval
    sanitized_output['approval_type'] = approval_type
    sanitized_output['account_environment'] = account_env
    
    return jsonify(sanitized_output)

@app.route('/api/request-access', methods=['POST'])
def request_access():
    data = request.json
    user_email = data.get('user_email')
    
    # CHECK ACCESS RULES: Enforce group-based restrictions
    rules = AccessRules.get_rules()
    for rule in rules.get('rules', []):
        if not rule.get('enabled'):
            continue
        
        # Check if user is in restricted group
        groups_path = os.path.join(os.path.dirname(__file__), 'user_groups.json')
        with open(groups_path, 'r') as f:
            groups_data = json.load(f)
        
        user_groups = [g['id'] for g in groups_data['groups'] if user_email in g.get('members', [])]
        
        if any(g in rule.get('groups', []) for g in user_groups):
            # User is in restricted group - check if requesting denied service
            use_case = data.get('use_case', '').lower()
            denied_services = rule.get('denied_services', [])
            
            for denied_service in denied_services:
                if denied_service in use_case:
                    return jsonify({
                        'error': f'❌ Access Denied\n\nYour group is restricted from requesting {denied_service.upper()} access.\n\nAllowed services: {", ".join([s.upper() for s in rule.get("allowed_services", [])])}\n\nContact your administrator for access to other services.'
                    }), 403
    
    # ENFORCEMENT: Apply strict organizational policies
    org_policies = load_org_policies()  # Load from config/database
    allowed, violations, action = EnforcementEngine.enforce_policy(data, org_policies)
    
    print(f"🔒 Enforcement check: allowed={allowed}, violations={violations}")
    
    if not allowed:
        # STRICT ENFORCEMENT: Block request
        recommendations = EnforcementEngine.get_recommendation(data, org_policies)
        print(f"❌ Request blocked: {violations}")
        return jsonify({
            'error': 'Request blocked by organizational policy',
            'violations': violations,
            'recommendations': recommendations,
            'enforcement': 'STRICT'
        }), 403
    
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
    if data.get('ai_permissions'):
        permissions = data['ai_permissions']
        
        access_request['ai_generated'] = True
        access_request['use_case'] = data.get('use_case', 'AI-generated access')
        access_request['ai_permissions'] = permissions
        access_request['permission_set'] = 'AI_GENERATED'
    elif 'use_case' in data:
        # Fallback: generate if not provided
        permissions = generate_ai_permissions(data['use_case'])
        if 'error' in permissions:
            return jsonify({'error': f"AI generation failed: {permissions['error']}"}), 400
        
        access_request['ai_generated'] = True
        access_request['use_case'] = data['use_case']
        access_request['ai_permissions'] = permissions
        access_request['permission_set'] = 'AI_GENERATED'
    else:
        # Existing permission set
        access_request['permission_set'] = data['permission_set']
        access_request['ai_generated'] = False
    
    # Store enforcement metadata
    access_request['enforcement_action'] = action
    access_request['policy_violations'] = violations
    
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
    _save_requests()
    return jsonify({'request_id': request_id, 'status': 'submitted'})

@app.route('/api/requests', methods=['GET'])
def get_requests():
    return jsonify(list(requests_db.values()))

@app.route('/api/request/<request_id>', methods=['GET'])
def get_request_details(request_id):
    if request_id not in requests_db:
        return jsonify({'error': 'Request not found'}), 404
    return jsonify(requests_db[request_id])

@app.route('/api/databases/requests', methods=['GET'])
def get_database_requests():
    """Get database access requests for current user, filterable by status"""
    user_email = request.args.get('user_email')
    status_filter = request.args.get('status')  # pending, approved, denied, all
    if not user_email:
        return jsonify({'error': 'user_email required'}), 400
    db_requests = []
    for req_id, req in requests_db.items():
        if req.get('type') != 'database_access' or req.get('user_email') != user_email:
            continue
        s = req.get('status', '')
        expires_at = req.get('expires_at', '')
        is_expired = False
        if expires_at:
            try:
                exp = datetime.fromisoformat(expires_at.replace('Z', '+00:00').replace('+00:00', ''))
                is_expired = datetime.now() >= exp
            except Exception:
                pass
        # Map to UI status
        if s == 'pending':
            ui_status = 'pending'
        elif s == 'denied':
            ui_status = 'rejected'
        elif s == 'approved' and not is_expired:
            ui_status = 'in_progress'
        elif s == 'approved' and is_expired:
            ui_status = 'completed'
        else:
            ui_status = s
        if status_filter and status_filter != 'all' and ui_status != status_filter:
            continue
        db_requests.append({
            'request_id': req_id,
            'status': ui_status,
            'databases': req.get('databases', []),
            'role': req.get('role', 'read_only'),
            'duration_hours': req.get('duration_hours', 2),
            'justification': req.get('justification', ''),
            'created_at': req.get('created_at', ''),
            'expires_at': expires_at,
        })
    return jsonify({'requests': db_requests})


@app.route('/api/databases/request/<request_id>/update-duration', methods=['POST'])
def update_database_request_duration(request_id):
    """Update duration only for pending database requests (no DB name, env, endpoint changes)"""
    if request_id not in requests_db:
        return jsonify({'error': 'Request not found'}), 404
    req = requests_db[request_id]
    if req.get('type') != 'database_access':
        return jsonify({'error': 'Not a database request'}), 400
    if req.get('status') != 'pending':
        return jsonify({'error': 'Can only edit pending requests'}), 400
    data = request.get_json() or {}
    duration = data.get('duration_hours')
    if duration is None:
        return jsonify({'error': 'duration_hours required'}), 400
    try:
        duration = int(duration)
        if duration < 1 or duration > 24:
            return jsonify({'error': 'Duration must be 1-24 hours'}), 400
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid duration'}), 400
    req['duration_hours'] = duration
    req['expires_at'] = (datetime.now() + timedelta(hours=duration)).isoformat()
    req['modified_at'] = datetime.now().isoformat()
    return jsonify({'status': 'updated', 'request_id': request_id, 'duration_hours': duration})


@app.route('/api/request/<request_id>/modify', methods=['POST'])
def modify_request(request_id):
    if request_id not in requests_db:
        return jsonify({'error': 'Request not found'}), 404
    
    access_request = requests_db[request_id]
    if access_request['status'] != 'pending':
        return jsonify({'error': 'Can only modify pending requests'}), 400
    
    data = request.get_json() or {}
    
    # Database access: only duration and justification (no DB name, env, endpoint)
    if access_request.get('type') == 'database_access':
        if 'duration_hours' in data:
            try:
                d = int(data['duration_hours'])
                if 1 <= d <= 24:
                    access_request['duration_hours'] = d
                    access_request['expires_at'] = (datetime.now() + timedelta(hours=d)).isoformat()
            except (TypeError, ValueError):
                pass
        if 'justification' in data:
            access_request['justification'] = data['justification']
        access_request['modified_at'] = datetime.now().isoformat()
        return jsonify({'status': 'modified', 'request': access_request})
    
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
    _save_requests()
    return jsonify({'status': 'modified', 'request': access_request})

@app.route('/api/request/<request_id>/deny', methods=['POST'])
def deny_request(request_id):
    """Deny a pending request (works for cloud, database, instance)"""
    if request_id not in requests_db:
        return jsonify({'error': 'Request not found'}), 404
    access_request = requests_db[request_id]
    if access_request.get('status') != 'pending':
        return jsonify({'error': 'Can only deny pending requests'}), 400
    data = request.get_json(silent=True) or {}
    access_request['status'] = 'denied'
    access_request['denied_at'] = datetime.now().isoformat()
    access_request['denial_reason'] = data.get('reason', 'Denied by approver')
    _save_requests()
    return jsonify({'status': 'denied', 'message': 'Request denied'})

@app.route('/api/request/<request_id>/delete', methods=['DELETE'])
def delete_request(request_id):
    """Admin function to delete any request"""
    if request_id not in requests_db:
        return jsonify({'error': 'Request not found'}), 404
    
    access_request = requests_db[request_id]
    
    # Delete from database
    del requests_db[request_id]
    if request_id in approvals_db:
        del approvals_db[request_id]
    _save_requests()
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
    
    # Handle database_access requests (self-approve for testing; ciso for prod)
    if access_request.get('type') == 'database_access':
        required = set(access_request.get('approval_required', ['self']))
        received = {approver_role}
        # For testing: allow 'self' to satisfy 'ciso' on database requests
        if approver_role == 'self':
            received.add('ciso')
        if required.issubset(received):
            access_request['status'] = 'approved'
            access_request['approved_at'] = datetime.now().isoformat()
            # Create DB user (same as auto-approved flow)
            admin_user = os.getenv('DB_ADMIN_USER', 'admin')
            admin_password = os.getenv('DB_ADMIN_PASSWORD', 'admin123')
            role = access_request.get('role', 'read_only')
            if role == 'admin':
                sql_perms = 'ALL PRIVILEGES'
            elif role == 'read_full_write':
                sql_perms = 'SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, TRUNCATE'
            elif role == 'read_limited_write':
                sql_perms = 'SELECT, INSERT, UPDATE, DELETE'
            else:
                sql_perms = 'SELECT'
            create_error = None
            pwd = access_request.get('db_password') or generate_password()
            access_request['db_password'] = pwd
            for db in access_request.get('databases', []):
                result = create_database_user(
                    host=db['host'],
                    port=int(db.get('port', 3306)),
                    admin_user=admin_user,
                    admin_password=admin_password,
                    new_user=access_request.get('db_username'),
                    new_password=pwd,
                    database=db.get('name', ''),
                    permissions=sql_perms
                )
                if result.get('error'):
                    create_error = result['error']
                    break
            if create_error:
                access_request['status'] = 'failed'
                return jsonify({'status': 'failed', 'error': f'DB user creation failed: {create_error}'})
            _save_requests()
            return jsonify({
                'status': 'approved',
                'message': '✅ Database access approved! Go to Databases tab to connect.'
            })
        return jsonify({'status': 'partial_approval', 'message': 'More approvals needed', 'pending': list(required - received)})
    
    # Handle instance access requests differently
    if access_request.get('type') == 'instance_access':
        access_request['status'] = 'approved'
        access_request['approved_at'] = datetime.now().isoformat()
        
        print(f"✅ Approved instance access request {request_id}")
        print(f"Request details: {access_request}")
        
        # Create users on instances
        username = access_request['username']
        sudo_access = access_request.get('sudo_access', False)
        
        for instance in access_request['instances']:
            result = create_user_on_instance(instance['id'], username, sudo_access)
            if result.get('success'):
                print(f"✅ User {username} created on {instance['id']}")
        
        _save_requests()
        return jsonify({
            'status': 'approved',
            'message': f"✅ Instance access approved! Go to Terminal tab to connect."
        })
    
    # Handle AWS account access requests
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
        
        ps_name = access_request.get('permission_set_name') or access_request.get('permission_set', '')
        msg = f"✅ Access granted! Permission set '{ps_name}' created and assigned." if ps_name else "✅ Access granted! Login to AWS SSO to see the new access."
        _save_requests()
        return jsonify({
            'status': 'approved', 
            'access_granted': True,
            'message': msg,
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
        # Return mock users for now - integrate with your user database
        users = [
            {
                'first_name': 'Satish',
                'last_name': 'Korra',
                'email': 'satish.korra@nykaa.com',
                'phone': '+91-9876543210',
                'department': 'DevOps',
                'group': 'DevOps Team',
                'role': 'admin'
            }
        ]
        return jsonify(users)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/create-user', methods=['POST'])
def create_user():
    """Create new user in JIT console"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required = ['first_name', 'last_name', 'email', 'phone', 'department', 'group', 'role']
        for field in required:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400
        
        # Store user (integrate with your user database)
        print(f"Creating user: {data['first_name']} {data['last_name']} ({data['email']})")
        print(f"Role: {data['role']}, Group: {data['group']}, Department: {data['department']}")
        
        return jsonify({
            'status': 'success',
            'message': f"User {data['first_name']} {data['last_name']} created successfully",
            'user': data
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/create-group', methods=['POST'])
def create_group():
    """Create new group with permissions"""
    try:
        data = request.get_json()
        
        group_name = data.get('name')
        permissions = data.get('permissions', [])
        
        if not group_name:
            return jsonify({'error': 'Group name is required'}), 400
        
        print(f"Creating group: {group_name}")
        print(f"Permissions: {', '.join(permissions)}")
        
        return jsonify({
            'status': 'success',
            'message': f"Group {group_name} created successfully",
            'group': {'name': group_name, 'permissions': permissions}
        })
        
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
        _save_requests()
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

@app.route('/api/admin/account/<account_id>/tag', methods=['PUT'])
def update_account_tag(account_id):
    """Update account environment tag"""
    try:
        data = request.get_json()
        environment = data.get('environment')
        
        if account_id in CONFIG['accounts']:
            CONFIG['accounts'][account_id]['environment'] = environment
            print(f"Account {account_id} tagged as {environment}")
            return jsonify({'status': 'success', 'account_id': account_id, 'environment': environment})
        else:
            return jsonify({'error': 'Account not found'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/account/<account_id>/jit', methods=['PUT'])
def update_account_jit(account_id):
    """Update account JIT requirement"""
    try:
        data = request.get_json()
        jit_required = data.get('jit_required')
        
        if account_id in CONFIG['accounts']:
            CONFIG['accounts'][account_id]['jit_required'] = jit_required
            print(f"Account {account_id} JIT requirement set to {jit_required}")
            return jsonify({'status': 'success', 'account_id': account_id, 'jit_required': jit_required})
        else:
            return jsonify({'error': 'Account not found'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/account/<account_id>/duration', methods=['PUT'])
def update_account_duration(account_id):
    """Update account max duration"""
    try:
        data = request.get_json()
        max_duration = data.get('max_duration')
        
        if account_id in CONFIG['accounts']:
            CONFIG['accounts'][account_id]['max_duration'] = max_duration
            print(f"Account {account_id} max duration set to {max_duration}hrs")
            return jsonify({'status': 'success', 'account_id': account_id, 'max_duration': max_duration})
        else:
            return jsonify({'error': 'Account not found'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/sync-accounts-from-ou', methods=['POST'])
def sync_accounts_from_ou():
    """Auto-tag accounts based on AWS OU structure"""
    try:
        org_client = boto3.client('organizations')
        
        # Get all OUs
        roots = org_client.list_roots()['Roots']
        root_id = roots[0]['Id']
        
        synced_count = 0
        
        # List all OUs
        paginator = org_client.get_paginator('list_organizational_units_for_parent')
        for page in paginator.paginate(ParentId=root_id):
            for ou in page['OrganizationalUnits']:
                ou_name = ou['Name'].lower()
                ou_id = ou['Id']
                
                # Determine environment from OU name
                if 'prod' in ou_name or 'production' in ou_name:
                    environment = 'prod'
                elif 'dev' in ou_name or 'development' in ou_name:
                    environment = 'dev'
                elif 'sandbox' in ou_name or 'test' in ou_name:
                    environment = 'sandbox'
                else:
                    environment = 'nonprod'
                
                # Get accounts in this OU
                acc_paginator = org_client.get_paginator('list_accounts_for_parent')
                for acc_page in acc_paginator.paginate(ParentId=ou_id):
                    for account in acc_page['Accounts']:
                        account_id = account['Id']
                        if account_id in CONFIG['accounts']:
                            CONFIG['accounts'][account_id]['environment'] = environment
                            CONFIG['accounts'][account_id]['ou_name'] = ou_name
                            synced_count += 1
                            print(f"Auto-tagged {account_id} as {environment} (OU: {ou_name})")
        
        return jsonify({
            'status': 'success',
            'synced_count': synced_count,
            'message': f'Successfully synced {synced_count} accounts from OU structure'
        })
        
    except Exception as e:
        print(f"Error syncing from OU: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/instances', methods=['GET'])
def get_instances():
    """Get all EC2 instances across accounts"""
    try:
        ec2 = boto3.client('ec2', region_name='ap-south-1')
        sts = boto3.client('sts')
        current_account = sts.get_caller_identity()['Account']
        
        instances = []
        response = ec2.describe_instances()
        
        for reservation in response['Reservations']:
            for instance in reservation['Instances']:
                name = next((tag['Value'] for tag in instance.get('Tags', []) if tag['Key'] == 'Name'), None)
                instances.append({
                    'id': instance['InstanceId'],
                    'name': name,
                    'type': instance.get('InstanceType'),
                    'state': instance['State']['Name'],
                    'account_id': current_account,
                    'private_ip': instance.get('PrivateIpAddress'),
                    'public_ip': instance.get('PublicIpAddress')
                })
        
        return jsonify({'instances': instances})
        
    except Exception as e:
        print(f"Error fetching instances: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/instances/start-session', methods=['POST'])
def start_ssm_session():
    """Start AWS Systems Manager session"""
    try:
        data = request.get_json()
        instance_id = data.get('instance_id')
        instance_name = data.get('instance_name')
        
        if not instance_id:
            return jsonify({'error': 'instance_id required'}), 400
        
        ssm = boto3.client('ssm', region_name='ap-south-1')
        
        # Start session
        response = ssm.start_session(
            Target=instance_id
        )
        
        session_id = response['SessionId']
        
        # Generate Session Manager URL
        region = 'ap-south-1'
        session_url = f"https://ap-south-1.console.aws.amazon.com/systems-manager/session-manager/{session_id}?region={region}"
        
        print(f"✅ Session started: {session_id} for {instance_id}")
        
        return jsonify({
            'status': 'success',
            'session_id': session_id,
            'session_url': session_url,
            'instance_id': instance_id,
            'instance_name': instance_name
        })
        
    except Exception as e:
        print(f"Error starting session: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/instances/request-access', methods=['POST'])
def request_instance_access():
    """Request JIT access to EC2 instances"""
    try:
        data = request.get_json()
        instances = data.get('instances', [])
        account_id = data.get('account_id')
        user_email = data.get('user_email', 'satish.korra@nykaa.com') or 'satish.korra@nykaa.com'
        request_for = data.get('request_for', 'myself')
        justification = data.get('justification')
        duration_hours = data.get('duration_hours', 2)
        sudo_access = data.get('sudo_access', False)
        
        username = user_email.split('@')[0].replace('.', '_')
        
        # Determine approval requirement
        if sudo_access:
            status = 'pending'
            approval_message = 'Requires Manager + Security Lead approval'
        else:
            status = 'pending'
            approval_message = 'Requires Manager approval'
        
        request_id = str(uuid.uuid4())
        expires_at = datetime.now() + timedelta(hours=duration_hours)
        
        access_request = {
            'id': request_id,
            'type': 'instance_access',
            'instances': instances,
            'account_id': account_id,
            'user_email': user_email,
            'username': username,
            'request_for': request_for,
            'justification': justification,
            'duration_hours': duration_hours,
            'sudo_access': sudo_access,
            'status': status,
            'approval_required': ['self'],
            'created_at': datetime.now().isoformat(),
            'expires_at': expires_at.isoformat()
        }
        
        requests_db[request_id] = access_request
        _save_requests()
        print(f"📝 Instance access request: {request_id} - {len(instances)} instances - {status}")
        
        return jsonify({
            'status': status,
            'request_id': request_id,
            'expires_at': access_request['expires_at'],
            'message': approval_message
        })
        
    except Exception as e:
        print(f"Error requesting access: {e}")
        return jsonify({'error': str(e)}), 500



@app.route('/api/instances/approved', methods=['GET'])
def get_approved_instances():
    """Get approved instances for current user"""
    try:
        user_email = request.args.get('user_email', 'satish.korra@nykaa.com')
        approved_instances = []
        
        print(f"Looking for approved instances for {user_email}")
        print(f"Total requests in DB: {len(requests_db)}")
        
        for req_id, req in requests_db.items():
            print(f"Request {req_id}: type={req.get('type')}, email={req.get('user_email')}, status={req.get('status')}")
            
            if (req.get('type') == 'instance_access' and 
                req.get('user_email') == user_email and 
                req.get('status') == 'approved'):
                
                print(f"✅ Found approved instance request: {req_id}")
                for instance in req.get('instances', []):
                    approved_instances.append({
                        'request_id': req_id,
                        'instance_id': instance['id'],
                        'instance_name': instance['name'],
                        'private_ip': instance.get('private_ip'),
                        'public_ip': instance.get('public_ip'),
                        'expires_at': req['expires_at'],
                        'sudo_access': req.get('sudo_access', False)
                    })
        
        print(f"Returning {len(approved_instances)} approved instances")
        return jsonify({'instances': approved_instances})
        
    except Exception as e:
        print(f"Error getting approved instances: {e}")
        return jsonify({'error': str(e)}), 500

def create_user_on_instance(instance_id, username, sudo_access=False):
    """Create user on EC2 instance via SSM Run Command"""
    try:
        ssm = boto3.client('ssm', region_name='ap-south-1')
        
        # Generate temporary password
        temp_password = str(uuid.uuid4())[:12]
        
        # Build commands
        commands = [
            f'useradd -m -s /bin/bash {username}',
            f'echo "{username}:{temp_password}" | chpasswd',
            f'mkdir -p /home/{username}/.ssh',
            f'chown -R {username}:{username} /home/{username}/.ssh',
            f'chmod 700 /home/{username}/.ssh'
        ]
        
        # Add to sudoers if sudo access approved
        if sudo_access:
            commands.append(f'echo "{username} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/jit-{username}')
            commands.append(f'chmod 440 /etc/sudoers.d/jit-{username}')
        
        # Execute via SSM
        response = ssm.send_command(
            InstanceIds=[instance_id],
            DocumentName='AWS-RunShellScript',
            Parameters={'commands': commands},
            Comment=f'JIT Access: Create user {username}'
        )
        
        command_id = response['Command']['CommandId']
        print(f"✅ SSM Command sent: {command_id} - Creating user {username} on {instance_id}")
        
        return {'success': True, 'command_id': command_id, 'username': username}
        
    except Exception as e:
        print(f"❌ Error creating user on instance: {e}")
        return {'error': str(e)}

def remove_user_from_instance(instance_id, username):
    """Remove user from EC2 instance via SSM Run Command"""
    try:
        ssm = boto3.client('ssm', region_name='ap-south-1')
        
        commands = [
            f'pkill -u {username}',  # Kill all user processes
            f'userdel -r {username}',  # Delete user and home directory
            f'rm -f /etc/sudoers.d/jit-{username}'  # Remove sudoers entry
        ]
        
        response = ssm.send_command(
            InstanceIds=[instance_id],
            DocumentName='AWS-RunShellScript',
            Parameters={'commands': commands},
            Comment=f'JIT Access: Remove user {username}'
        )
        
        command_id = response['Command']['CommandId']
        print(f"✅ SSM Command sent: {command_id} - Removing user {username} from {instance_id}")
        
        return {'success': True, 'command_id': command_id}
        
    except Exception as e:
        print(f"❌ Error removing user from instance: {e}")
        return {'error': str(e)}

@app.route('/api/instances/cleanup-expired', methods=['POST'])
def cleanup_expired_instance_access():
    """Cleanup expired instance access - remove users from instances"""
    try:
        now = datetime.now()
        cleaned_count = 0
        
        for request_id, access_request in list(requests_db.items()):
            if 'instance_id' not in access_request:
                continue
            
            expires_at = datetime.fromisoformat(access_request['expires_at'].replace('Z', '+00:00'))
            
            if expires_at <= now and access_request.get('status') == 'auto_approved' and access_request.get('user_created'):
                # Remove user from instance
                instance_id = access_request['instance_id']
                username = access_request['username']
                
                result = remove_user_from_instance(instance_id, username)
                
                if result.get('success'):
                    access_request['status'] = 'expired'
                    access_request['user_removed'] = True
                    access_request['removed_at'] = now.isoformat()
                    cleaned_count += 1
                    print(f"🧹 Cleaned up expired access: {username} from {instance_id}")
        
        return jsonify({
            'status': 'success',
            'cleaned_count': cleaned_count,
            'message': f'Cleaned up {cleaned_count} expired access requests'
        })
        
    except Exception as e:
        print(f"Error cleaning up expired access: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/instances/log-session', methods=['POST'])
def log_instance_session():
    """Log instance session for audit"""
    try:
        data = request.get_json()
        print(f"📝 Session Log: {data}")
        
        # In production, store in database or send to CloudWatch
        return jsonify({'status': 'logged'})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/discover-services', methods=['GET'])
def discover_services():
    """Discover all AWS services with resources in the account using Resource Explorer"""
    try:
        account_id = request.args.get('account_id')
        region = 'ap-south-1'
        
        # Use AWS Resource Groups Tagging API to discover all resources
        tagging = boto3.client('resourcegroupstaggingapi', region_name=region)
        
        discovered_services = set()
        paginator = tagging.get_paginator('get_resources')
        
        for page in paginator.paginate():
            for resource in page['ResourceTagMappingList']:
                arn = resource['ResourceARN']
                # Extract service from ARN (format: arn:aws:service:region:account:resource)
                parts = arn.split(':')
                if len(parts) >= 3:
                    service = parts[2]
                    discovered_services.add(service)
        
        # Map AWS service names to friendly names
        service_map = {
            'ec2': {'name': 'EC2 Instances', 'icon': '🖥️'},
            's3': {'name': 'S3 Buckets', 'icon': '🪣'},
            'rds': {'name': 'RDS Databases', 'icon': '🗄️'},
            'lambda': {'name': 'Lambda Functions', 'icon': '⚡'},
            'dynamodb': {'name': 'DynamoDB Tables', 'icon': '📊'},
            'secretsmanager': {'name': 'Secrets Manager', 'icon': '🔐'},
            'logs': {'name': 'CloudWatch Logs', 'icon': '📝'},
            'eks': {'name': 'EKS Clusters', 'icon': '☸️'},
            'ecs': {'name': 'ECS Services', 'icon': '🐳'},
            'elasticloadbalancing': {'name': 'Load Balancers', 'icon': '⚖️'},
            'elasticache': {'name': 'ElastiCache', 'icon': '⚡'},
            'sns': {'name': 'SNS Topics', 'icon': '📢'},
            'sqs': {'name': 'SQS Queues', 'icon': '📬'},
            'kinesis': {'name': 'Kinesis Streams', 'icon': '🌊'},
            'cloudfront': {'name': 'CloudFront', 'icon': '🌐'},
            'apigateway': {'name': 'API Gateway', 'icon': '🚪'},
            'elasticbeanstalk': {'name': 'Elastic Beanstalk', 'icon': '🌱'},
            'cloudformation': {'name': 'CloudFormation', 'icon': '📚'},
            'iam': {'name': 'IAM Resources', 'icon': '👤'},
            'kms': {'name': 'KMS Keys', 'icon': '🔑'}
        }
        
        services = []
        for service in sorted(discovered_services):
            if service in service_map:
                services.append({
                    'id': service,
                    'name': service_map[service]['name'],
                    'icon': service_map[service]['icon']
                })
        
        print(f"✅ Discovered {len(services)} services with resources")
        return jsonify({'services': services})
        
    except Exception as e:
        print(f"Error discovering services: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/resources/<service>', methods=['GET'])
def get_resources(service):
    """Get AWS resources for selected service from current account"""
    try:
        account_id = request.args.get('account_id')
        resources = []
        region = 'ap-south-1'
        
        if service == 'ec2':
            ec2 = boto3.client('ec2', region_name=region)
            response = ec2.describe_instances()
            for reservation in response['Reservations']:
                for instance in reservation['Instances']:
                    name = next((tag['Value'] for tag in instance.get('Tags', []) if tag['Key'] == 'Name'), instance['InstanceId'])
                    resources.append({
                        'id': instance['InstanceId'], 
                        'name': name,
                        'type': instance.get('InstanceType'),
                        'state': instance['State']['Name']
                    })
        elif service == 's3':
            s3 = boto3.client('s3')
            response = s3.list_buckets()
            for bucket in response['Buckets']:
                resources.append({'id': bucket['Name'], 'name': bucket['Name']})
        elif service == 'rds':
            rds = boto3.client('rds', region_name=region)
            response = rds.describe_db_instances()
            for db in response['DBInstances']:
                resources.append({
                    'id': db['DBInstanceIdentifier'], 
                    'name': db['DBInstanceIdentifier'], 
                    'engine': db['Engine'],
                    'status': db['DBInstanceStatus']
                })
        elif service == 'lambda':
            lambda_client = boto3.client('lambda', region_name=region)
            response = lambda_client.list_functions()
            for func in response['Functions']:
                resources.append({
                    'id': func['FunctionName'], 
                    'name': func['FunctionName'], 
                    'runtime': func['Runtime']
                })
        elif service == 'dynamodb':
            dynamodb = boto3.client('dynamodb', region_name=region)
            response = dynamodb.list_tables()
            for table_name in response['TableNames']:
                resources.append({'id': table_name, 'name': table_name})
        elif service == 'secretsmanager':
            secrets = boto3.client('secretsmanager', region_name=region)
            response = secrets.list_secrets()
            for secret in response['SecretList']:
                resources.append({'id': secret['ARN'], 'name': secret['Name']})
        elif service == 'logs':
            logs = boto3.client('logs', region_name=region)
            response = logs.describe_log_groups()
            for log_group in response['logGroups']:
                resources.append({'id': log_group['logGroupName'], 'name': log_group['logGroupName']})
        elif service == 'eks':
            eks = boto3.client('eks', region_name=region)
            response = eks.list_clusters()
            for cluster_name in response['clusters']:
                cluster = eks.describe_cluster(name=cluster_name)['cluster']
                resources.append({
                    'id': cluster_name, 
                    'name': cluster_name,
                    'status': cluster['status']
                })
        elif service == 'ecs':
            ecs = boto3.client('ecs', region_name=region)
            response = ecs.list_clusters()
            for cluster_arn in response['clusterArns']:
                cluster_name = cluster_arn.split('/')[-1]
                resources.append({'id': cluster_arn, 'name': cluster_name})
        elif service == 'elasticloadbalancing':
            elb = boto3.client('elbv2', region_name=region)
            response = elb.describe_load_balancers()
            for lb in response['LoadBalancers']:
                resources.append({
                    'id': lb['LoadBalancerArn'], 
                    'name': lb['LoadBalancerName'],
                    'type': lb['Type']
                })
        elif service == 'sns':
            sns = boto3.client('sns', region_name=region)
            response = sns.list_topics()
            for topic in response['Topics']:
                topic_name = topic['TopicArn'].split(':')[-1]
                resources.append({'id': topic['TopicArn'], 'name': topic_name})
        elif service == 'sqs':
            sqs = boto3.client('sqs', region_name=region)
            response = sqs.list_queues()
            for queue_url in response.get('QueueUrls', []):
                queue_name = queue_url.split('/')[-1]
                resources.append({'id': queue_url, 'name': queue_name})
        elif service == 'kms':
            kms = boto3.client('kms', region_name=region)
            response = kms.list_keys()
            for key in response['Keys']:
                key_metadata = kms.describe_key(KeyId=key['KeyId'])['KeyMetadata']
                resources.append({
                    'id': key['KeyId'], 
                    'name': key_metadata.get('Description', key['KeyId'])
                })
        
        print(f"✅ Found {len(resources)} resources for {service}")
        return jsonify({'resources': resources})
        
    except Exception as e:
        print(f"Error fetching resources for {service}: {e}")
        return jsonify({'error': str(e)}), 500

# Background cleanup job
def background_cleanup():
    """Background thread to cleanup expired instance access"""
    while True:
        try:
            time.sleep(300)  # Run every 5 minutes
            print("🧹 Running background cleanup...")
            
            now = datetime.now()
            for request_id, access_request in list(requests_db.items()):
                if 'instance_id' not in access_request:
                    continue
                
                expires_at_str = access_request.get('expires_at', '')
                if not expires_at_str:
                    continue
                    
                expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00').replace('+00:00', ''))
                
                if expires_at <= now and access_request.get('status') == 'auto_approved' and access_request.get('user_created'):
                    instance_id = access_request['instance_id']
                    username = access_request['username']
                    
                    result = remove_user_from_instance(instance_id, username)
                    
                    if result.get('success'):
                        access_request['status'] = 'expired'
                        access_request['user_removed'] = True
                        access_request['removed_at'] = now.isoformat()
                        print(f"✅ Cleaned up: {username} from {instance_id}")
            
            # Cleanup expired database access - revoke DB users
            for request_id, access_request in list(requests_db.items()):
                if access_request.get('type') != 'database_access' or access_request.get('status') != 'approved':
                    continue
                expires_at_str = access_request.get('expires_at', '')
                if not expires_at_str:
                    continue
                expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00').replace('+00:00', ''))
                if expires_at <= now:
                    try:
                        admin_user = os.getenv('DB_ADMIN_USER', 'admin')
                        admin_password = os.getenv('DB_ADMIN_PASSWORD', 'admin123')
                        for db in access_request.get('databases', []):
                            revoke_result = revoke_database_access(
                                host=db['host'],
                                port=int(db.get('port', 3306)),
                                admin_user=admin_user,
                                admin_password=admin_password,
                                username=access_request.get('db_username', '')
                            )
                            if not revoke_result.get('error'):
                                print(f"✅ Revoked DB access: {access_request.get('db_username')} from {db.get('name')}")
                        access_request['status'] = 'expired'
                        access_request['revoked_at'] = now.isoformat()
                    except Exception as db_err:
                        print(f"❌ DB revoke error: {db_err}")
        except Exception as e:
            print(f"❌ Background cleanup error: {e}")

@app.route('/api/admin/sync-from-identity-center', methods=['POST'])
def sync_from_identity_center():
    """Sync users and groups from AWS Identity Center"""
    try:
        identity_store_id = CONFIG.get('identity_store_id')
        if not identity_store_id:
            return jsonify({'error': 'Identity Store ID not configured'}), 400
        
        users, groups, status = UserSyncEngine.sync_from_identity_center(identity_store_id)
        
        return jsonify({
            'status': status['status'],
            'users': users,
            'groups': groups,
            'summary': status
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/sync-from-ad', methods=['POST'])
def sync_from_ad():
    """Sync users and groups from Active Directory"""
    try:
        ad_config = request.get_json()
        
        required = ['domain', 'ldap_url', 'bind_dn', 'bind_password', 'user_base_dn', 'group_base_dn']
        for field in required:
            if field not in ad_config:
                return jsonify({'error': f'{field} is required'}), 400
        
        users, groups, status = UserSyncEngine.sync_from_active_directory(ad_config)
        
        return jsonify({
            'status': status['status'],
            'users': users,
            'groups': groups,
            'summary': status
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/request-feature', methods=['POST'])
def request_feature():
    """Log feature request from admin"""
    try:
        data = request.get_json()
        feature = data.get('feature')
        
        print(f"📋 Feature request: {feature} at {data.get('requested_at')}")
        
        return jsonify({
            'status': 'received',
            'message': 'Feature request logged. Contact sales if not in license.'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/toggle-feature', methods=['POST'])
def toggle_feature():
    """Enable or disable feature for organization"""
    try:
        data = request.get_json()
        feature = data.get('feature')
        enabled = data.get('enabled')
        
        print(f"✅ Feature {feature} {'enabled' if enabled else 'disabled'}")
        
        # Store in database (for now just log)
        return jsonify({
            'status': 'success',
            'feature': feature,
            'enabled': enabled
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/push-to-identity-center', methods=['POST'])
def push_to_identity_center():
    """Push manually created users/groups to Identity Center"""
    try:
        data = request.get_json()
        users = data.get('users', [])
        groups = data.get('groups', [])
        
        identity_store_id = CONFIG.get('identity_store_id')
        result = UserSyncEngine.push_to_identity_center(identity_store_id, users, groups)
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/delete-permissions-config', methods=['GET'])
def get_delete_permissions_config():
    """Get current delete permissions configuration"""
    try:
        config = StrictPolicies.get_config()
        return jsonify({
            'allowDeleteNonProd': config.get('allow_delete_nonprod', True),
            'allowDeleteProd': config.get('allow_delete_prod', False),
            'contactEmails': config.get('contact_emails', {})
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/delete-permissions-policy', methods=['POST'])
def update_delete_permissions_policy():
    """Update delete permissions policy"""
    try:
        data = request.get_json()
        
        config_update = {
            'allow_delete_nonprod': data.get('allowDeleteNonProd', True),
            'allow_delete_prod': data.get('allowDeleteProd', False)
        }
        
        StrictPolicies.update_config(config_update)
        
        print(f"✅ Delete policy updated: NonProd={config_update['allow_delete_nonprod']}, Prod={config_update['allow_delete_prod']}")
        
        return jsonify({
            'status': 'success',
            'message': 'Delete permissions policy updated successfully'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/create-permissions-policy', methods=['POST'])
def update_create_permissions_policy():
    """Update create permissions policy"""
    try:
        data = request.get_json()
        
        config_update = {
            'allow_create_nonprod': data.get('allowCreateNonProd', False),
            'allow_create_prod': data.get('allowCreateProd', False)
        }
        
        StrictPolicies.update_config(config_update)
        
        print(f"✅ Create policy updated: NonProd={config_update['allow_create_nonprod']}, Prod={config_update['allow_create_prod']}")
        
        return jsonify({
            'status': 'success',
            'message': 'Create permissions policy updated successfully'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/admin-permissions-policy', methods=['POST'])
def update_admin_permissions_policy():
    """Update admin permissions policy"""
    try:
        data = request.get_json()
        
        config_update = {
            'allow_admin_nonprod': data.get('allowAdminNonProd', False),
            'allow_admin_prod': data.get('allowAdminProd', False),
            'allow_admin_sandbox': data.get('allowAdminSandbox', True)
        }
        
        StrictPolicies.update_config(config_update)
        
        print(f"✅ Admin policy updated: NonProd={config_update['allow_admin_nonprod']}, Prod={config_update['allow_admin_prod']}, Sandbox={config_update['allow_admin_sandbox']}")
        
        return jsonify({
            'status': 'success',
            'message': 'Admin permissions policy updated successfully'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/policy-settings', methods=['GET'])
def get_policy_settings():
    """Get current policy settings"""
    try:
        config = StrictPolicies.get_config()
        return jsonify({
            'allowDeleteNonProd': config.get('allow_delete_nonprod', True),
            'allowDeleteProd': config.get('allow_delete_prod', False),
            'allowCreateNonProd': config.get('allow_create_nonprod', False),
            'allowCreateProd': config.get('allow_create_prod', False),
            'allowAdminNonProd': config.get('allow_admin_nonprod', False),
            'allowAdminProd': config.get('allow_admin_prod', False),
            'allowAdminSandbox': config.get('allow_admin_sandbox', True)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/contact-emails', methods=['POST'])
def update_contact_emails():
    """Update contact emails for different scenarios"""
    try:
        data = request.get_json()
        contact_emails = data.get('contactEmails', {})
        
        # Validate email format
        for key, email in contact_emails.items():
            if not email or '@' not in email:
                return jsonify({'error': f'Invalid email for {key}'}), 400
        
        config_update = {'contact_emails': contact_emails}
        StrictPolicies.update_config(config_update)
        
        print(f"✅ Contact emails updated: {contact_emails}")
        
        return jsonify({
            'status': 'success',
            'message': 'Contact emails updated successfully'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai/mode', methods=['GET'])
def get_ai_mode():
    """Get current AI conversation mode (bedrock or keyword)"""
    try:
        mode = ConversationManager.get_mode()
        return jsonify({
            'mode': mode,
            'description': 'AWS Bedrock AI' if mode == 'bedrock' else 'Keyword-based matching'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/help-assistant', methods=['POST'])
def help_assistant():
    """Global help assistant for users"""
    try:
        data = request.get_json()
        conversation_id = data.get('conversation_id')
        user_message = data.get('user_message')
        
        if not user_message:
            return jsonify({'error': 'Message is required'}), 400
        
        result = HelpAssistant.get_help_response(user_message, conversation_id)
        
        if 'error' in result:
            return jsonify(result), 400
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/scp/troubleshoot', methods=['POST'])
def scp_troubleshoot():
    """SCP troubleshooting assistant - READ ONLY investigation"""
    try:
        data = request.get_json()
        user_message = data.get('user_message')
        conversation_id = data.get('conversation_id')
        
        if not user_message:
            return jsonify({'error': 'Message is required'}), 400
        
        result = SCPTroubleshoot.investigate(user_message, conversation_id)
        
        if 'error' in result:
            return jsonify(result), 400
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/unified-assistant', methods=['POST'])
def unified_assistant():
    """Unified AI Assistant - Handles both help and policy building"""
    try:
        data = request.get_json()
        conversation_id = data.get('conversation_id')
        user_message = data.get('user_message')
        user_email = data.get('user_email', 'user@example.com')
        selected_option = data.get('selected_option')  # For interactive selections
        
        # Validate input - either user_message or selected_option must be provided
        if not user_message and not selected_option:
            return jsonify({'error': 'Message or selection is required'}), 400
        
        # Ensure user_message is a string (can be empty if selected_option is provided)
        if user_message is None:
            user_message = ''
        user_message = str(user_message).strip()
        
        # Get available accounts and regions
        available_accounts = []
        for acc_id, acc_data in CONFIG.get('accounts', {}).items():
            available_accounts.append({
                'id': acc_id,
                'name': acc_data.get('name', acc_id),
                'environment': acc_data.get('environment', 'nonprod')
            })
        
        available_regions = [
            {'id': 'us-east-1', 'name': 'US East (N. Virginia)'},
            {'id': 'us-west-2', 'name': 'US West (Oregon)'},
            {'id': 'eu-west-1', 'name': 'Europe (Ireland)'},
            {'id': 'ap-south-1', 'name': 'Asia Pacific (Mumbai)'},
            {'id': 'ap-southeast-1', 'name': 'Asia Pacific (Singapore)'},
            {'id': 'ap-northeast-1', 'name': 'Asia Pacific (Tokyo)'}
        ]
        
        # Get available services (will be filtered by Resource Manager API later)
        available_services = [
            {'id': 'ec2', 'name': 'EC2', 'description': 'Virtual servers'},
            {'id': 's3', 'name': 'S3', 'description': 'Object storage'},
            {'id': 'lambda', 'name': 'Lambda', 'description': 'Serverless functions'},
            {'id': 'rds', 'name': 'RDS', 'description': 'Managed databases'},
            {'id': 'dynamodb', 'name': 'DynamoDB', 'description': 'NoSQL database'},
            {'id': 'kms', 'name': 'KMS', 'description': 'Key management'},
            {'id': 'secretsmanager', 'name': 'Secrets Manager', 'description': 'Secrets storage'},
            {'id': 'iam', 'name': 'IAM', 'description': 'Identity & access'},
            {'id': 'cloudwatch', 'name': 'CloudWatch', 'description': 'Monitoring'},
            {'id': 'logs', 'name': 'CloudWatch Logs', 'description': 'Log management'},
            {'id': 'sns', 'name': 'SNS', 'description': 'Notifications'},
            {'id': 'sqs', 'name': 'SQS', 'description': 'Message queue'},
            {'id': 'vpc', 'name': 'VPC', 'description': 'Virtual network'},
            {'id': 'elasticloadbalancing', 'name': 'ELB', 'description': 'Load balancer'}
        ]
        
        # Handle selected option (user clicked a button)
        if selected_option:
            option_type = selected_option.get('type')
            option_value = selected_option.get('value')
            
            # Update conversation state
            if conversation_id:
                conv = ConversationManager.get_conversation(conversation_id)
                if conv:
                    if option_type == 'account':
                        conv['account_id'] = option_value
                        UnifiedAssistant.update_conversation_state(conversation_id, {'account_id': option_value})
                        user_message = user_message or f"I need access to account {option_value}"
                    elif option_type == 'region':
                        conv['region'] = option_value
                        UnifiedAssistant.update_conversation_state(conversation_id, {'region': option_value})
                        user_message = user_message or f"Region: {option_value}"
                    elif option_type == 'permission_set':
                        conv['permission_set'] = option_value
                        UnifiedAssistant.update_conversation_state(conversation_id, {'permission_set': option_value, 'use_custom_permissions': False})
                        user_message = user_message or f"Use permission set: {option_value}"
                    elif option_type == 'use_custom_permissions':
                        conv['use_custom_permissions'] = True
                        conv['permission_set'] = None
                        UnifiedAssistant.update_conversation_state(conversation_id, {'use_custom_permissions': True, 'permission_set': None})
                        user_message = user_message or "I want to create custom permissions"
                    elif option_type == 'service':
                        current_services = conv.get('services', [])
                        if option_value not in current_services:
                            current_services.append(option_value)
                        conv['services'] = current_services
                        UnifiedAssistant.update_conversation_state(conversation_id, {'services': current_services})
                        user_message = user_message or f"I need {option_value} access"
                    elif option_type == 'resource':
                        service = selected_option.get('service')
                        if service:
                            current_resources = conv.get('selected_resources', {})
                            if service not in current_resources:
                                current_resources[service] = []
                            if option_value not in current_resources[service]:
                                current_resources[service].append({
                                    'id': option_value,
                                    'name': selected_option.get('label', option_value)
                                })
                            conv['selected_resources'] = current_resources
                            UnifiedAssistant.update_conversation_state(conversation_id, {'selected_resources': current_resources})
                        user_message = user_message or f"Selected resource: {option_value}"
            
            # Ensure user_message is set if not provided
            if not user_message or not user_message.strip():
                user_message = f"Selected {option_type}: {option_value}"
        
        # Get regions for selected account if account is selected
        if conversation_id:
            conv = ConversationManager.get_conversation(conversation_id)
            if conv and conv.get('account_id'):
                # Get regions for this account (could be from account config)
                account_id = conv.get('account_id')
                # For now, use default regions, but could be account-specific
                pass
        
        # Get permission sets if account and region are selected
        permission_sets = []
        if conversation_id:
            conv = ConversationManager.get_conversation(conversation_id)
            if conv and conv.get('account_id') and conv.get('region'):
                # Get permission sets from CONFIG
                permission_sets = CONFIG.get('permission_sets', [])
        
        # Get resources for selected service if service is selected
        resources = []
        if conversation_id:
            conv = ConversationManager.get_conversation(conversation_id)
            if conv and conv.get('account_id') and conv.get('region') and selected_option and selected_option.get('type') == 'service':
                service = selected_option.get('value')
                # Get resources from AWS Resource Manager API
                resources = get_resources_for_service(conv.get('account_id'), conv.get('region'), service)
        
        # Ensure user_message is not empty before calling get_response
        if not user_message or not user_message.strip():
            # If no message but selected_option was provided, create a default message
            if selected_option:
                user_message = f"Selected {selected_option.get('type', 'option')}: {selected_option.get('value', '')}"
            else:
                return jsonify({'error': 'Message cannot be empty'}), 400
        
        result = UnifiedAssistant.get_response(
            user_message,
            conversation_id,
            available_accounts,
            available_regions,
            available_services,
            CONFIG.get('permission_sets', [])
        )
        
        if 'error' in result:
            return jsonify(result), 400
        
        # Add available options to response based on current step
        state = result.get('state', {})
        step = result.get('step', 'welcome')
        
        if step == 'account':
            result['options'] = {
                'type': 'accounts',
                'items': available_accounts
            }
        elif step == 'region':
            # Get regions for selected account
            if state.get('account_id'):
                result['options'] = {
                    'type': 'regions',
                    'items': available_regions
                }
        elif step == 'permission_set':
            # Show permission sets
            result['options'] = {
                'type': 'permission_sets',
                'items': [{'id': ps.get('arn', ''), 'name': ps.get('name', '')} for ps in permission_sets] if permission_sets else []
            }
        elif step == 'services':
            # Filter services based on Resource Manager API (for now show all)
            result['options'] = {
                'type': 'services',
                'items': available_services
            }
        elif step == 'resources':
            # Show resources for selected service
            if resources:
                result['options'] = {
                    'type': 'resources',
                    'items': resources,
                    'service': state.get('current_service')
                }
            else:
                # If no resources found, ask user to specify
                result['ai_response'] = result.get('ai_response', '') + '\n\nPlease specify the resource name or ID you need access to.'
        
        return jsonify(result)
        
    except Exception as e:
        print(f"❌ Unified Assistant error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/resources/<provider>/<region>/<service>', methods=['GET'])
def get_resources_by_provider(provider, region, service):
    """Get resources for a service using AWS Resource Manager API"""
    try:
        account_id = request.args.get('account_id', '')
        if not account_id:
            return jsonify({'error': 'Account ID required'}), 400
        
        resources = get_resources_for_service(account_id, region, service)
        
        return jsonify({
            'resources': resources,
            'service': service,
            'region': region,
            'provider': provider
        })
    except Exception as e:
        print(f"⚠️ Error getting resources: {e}")
        return jsonify({'error': str(e), 'resources': []}), 500

def get_resources_for_service(account_id, region, service):
    """Get resources for a service using AWS Resource Manager API"""
    resources = []
    
    try:
        # Try to use Resource Groups Tagging API or direct service APIs
        # For now, use direct service APIs as fallback
        
        if service == 's3':
            # List S3 buckets
            try:
                s3 = boto3.client('s3', region_name=region)
                response = s3.list_buckets()
                for bucket in response.get('Buckets', []):
                    resources.append({
                        'id': bucket['Name'],
                        'arn': f'arn:aws:s3:::{bucket["Name"]}',
                        'name': bucket['Name']
                    })
            except Exception as e:
                print(f"⚠️ Could not list S3 buckets: {e}")
        
        elif service == 'ec2':
            # List EC2 instances
            try:
                ec2 = boto3.client('ec2', region_name=region)
                response = ec2.describe_instances()
                for reservation in response.get('Reservations', []):
                    for instance in reservation.get('Instances', []):
                        instance_id = instance['InstanceId']
                        name = ''
                        for tag in instance.get('Tags', []):
                            if tag['Key'] == 'Name':
                                name = tag['Value']
                                break
                        resources.append({
                            'id': instance_id,
                            'arn': f'arn:aws:ec2:{region}:{account_id}:instance/{instance_id}',
                            'name': name or instance_id
                        })
            except Exception as e:
                print(f"⚠️ Could not list EC2 instances: {e}")
        
        elif service == 'lambda':
            # List Lambda functions
            try:
                lambda_client = boto3.client('lambda', region_name=region)
                response = lambda_client.list_functions()
                for func in response.get('Functions', []):
                    resources.append({
                        'id': func['FunctionName'],
                        'arn': func['FunctionArn'],
                        'name': func['FunctionName']
                    })
            except Exception as e:
                print(f"⚠️ Could not list Lambda functions: {e}")
        
        elif service == 'rds':
            # List RDS instances
            try:
                rds = boto3.client('rds', region_name=region)
                response = rds.describe_db_instances()
                for db in response.get('DBInstances', []):
                    resources.append({
                        'id': db['DBInstanceIdentifier'],
                        'arn': db['DBInstanceArn'],
                        'name': db['DBInstanceIdentifier']
                    })
            except Exception as e:
                print(f"⚠️ Could not list RDS instances: {e}")
        
        elif service == 'dynamodb':
            # List DynamoDB tables
            try:
                dynamodb = boto3.client('dynamodb', region_name=region)
                response = dynamodb.list_tables()
                for table_name in response.get('TableNames', []):
                    table_info = dynamodb.describe_table(TableName=table_name)
                    resources.append({
                        'id': table_name,
                        'arn': table_info['Table']['TableArn'],
                        'name': table_name
                    })
            except Exception as e:
                print(f"⚠️ Could not list DynamoDB tables: {e}")
        
        elif service == 'kms':
            # List KMS keys
            try:
                kms = boto3.client('kms', region_name=region)
                response = kms.list_keys()
                for key in response.get('Keys', []):
                    key_info = kms.describe_key(KeyId=key['KeyId'])
                    resources.append({
                        'id': key['KeyId'],
                        'arn': key_info['KeyMetadata']['Arn'],
                        'name': key_info['KeyMetadata'].get('Description', key['KeyId'])
                    })
            except Exception as e:
                print(f"⚠️ Could not list KMS keys: {e}")
        
        elif service == 'secretsmanager':
            # List Secrets Manager secrets
            try:
                secrets = boto3.client('secretsmanager', region_name=region)
                response = secrets.list_secrets()
                for secret in response.get('SecretList', []):
                    resources.append({
                        'id': secret['Name'],
                        'arn': secret['ARN'],
                        'name': secret['Name']
                    })
            except Exception as e:
                print(f"⚠️ Could not list secrets: {e}")
        
    except Exception as e:
        print(f"⚠️ Error getting resources: {e}")
    
    return resources

@app.route('/api/unified-assistant/generate', methods=['POST'])
def unified_assistant_generate():
    """Generate permissions from collected conversation data"""
    try:
        data = request.get_json()
        conversation_id = data.get('conversation_id')
        
        if not conversation_id:
            return jsonify({'error': 'Conversation ID required'}), 400
        
        # Get state from conversation
        state = UnifiedAssistant.get_conversation_state(conversation_id)
        
        if not state.get('use_case'):
            return jsonify({'error': 'Use case not collected yet'}), 400
        
        # Use existing generate_permissions logic
        # But with data from conversation state
        use_case = state.get('use_case')
        account_id = state.get('account_id')
        region = state.get('region', 'ap-south-1')
        selected_resources = state.get('resources', {})
        
        # Call the existing permission generation
        # We'll need to adapt this to work with conversation state
        # For now, return the state so frontend can submit it
        return jsonify({
            'ready': True,
            'conversation_id': conversation_id,
            'data': {
                'use_case': use_case,
                'account_id': account_id,
                'region': region,
                'selected_resources': selected_resources,
                'services': state.get('services', []),
                'justification': state.get('justification')
            }
        })
        
    except Exception as e:
        print(f"❌ Generate error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/generate-guardrails', methods=['POST'])
def generate_guardrails():
    """AI-powered conversational guardrails generator"""
    try:
        data = request.get_json()
        conversation_id = data.get('conversation_id')
        user_message = data.get('user_message')
        mfa_token = data.get('mfa_token')
        
        if not user_message:
            return jsonify({'error': 'Message is required'}), 400
        
        result = GuardrailsGenerator.generate_guardrails(
            user_message, 
            mfa_token, 
            conversation_id, 
            user_message
        )
        
        if 'error' in result:
            return jsonify(result), 400
        
        # Return full response from guardrails generator
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/access-rules', methods=['GET'])
def get_access_rules():
    """Get all access rules"""
    try:
        return jsonify(AccessRules.get_rules())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/access-rules/<rule_id>', methods=['GET'])
def get_access_rule(rule_id):
    """Get specific access rule"""
    try:
        rule = AccessRules.get_rule(rule_id)
        if rule:
            return jsonify(rule)
        return jsonify({'error': 'Rule not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/access-rules/<rule_id>', methods=['DELETE'])
def delete_access_rule(rule_id):
    """Delete access rule"""
    try:
        result = AccessRules.delete_rule(rule_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/groups', methods=['GET', 'POST'])
def manage_user_groups():
    """Get all user groups or create new group"""
    try:
        groups_path = os.path.join(os.path.dirname(__file__), 'user_groups.json')
        
        if request.method == 'GET':
            with open(groups_path, 'r') as f:
                return jsonify(json.load(f))
        
        elif request.method == 'POST':
            data = request.get_json()
            group_name = data.get('name')
            
            if not group_name:
                return jsonify({'error': 'Group name is required'}), 400
            
            # Load existing groups
            with open(groups_path, 'r') as f:
                groups_data = json.load(f)
            
            # Create group ID from name
            group_id = group_name.lower().replace(' ', '_')
            
            # Check if group already exists
            if any(g['id'] == group_id for g in groups_data['groups']):
                return jsonify({'error': 'Group already exists'}), 400
            
            # Add new group
            new_group = {
                'id': group_id,
                'name': group_name,
                'description': data.get('description', ''),
                'members': []
            }
            
            groups_data['groups'].append(new_group)
            
            # Save
            with open(groups_path, 'w') as f:
                json.dump(groups_data, f, indent=2)
            
            print(f"✅ Group created: {group_name} ({group_id})")
            
            return jsonify({
                'status': 'success',
                'message': f'Group {group_name} created successfully',
                'group': new_group
            })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/org-users', methods=['GET', 'POST'])
def manage_org_users():
    """Get all organization users or create new user"""
    try:
        users_path = os.path.join(os.path.dirname(__file__), 'org_users.json')
        
        # Create file if doesn't exist
        if not os.path.exists(users_path):
            with open(users_path, 'w') as f:
                json.dump({'users': []}, f)
        
        if request.method == 'GET':
            with open(users_path, 'r') as f:
                return jsonify(json.load(f))
        
        elif request.method == 'POST':
            data = request.get_json()
            
            required = ['email', 'name', 'group_id']
            for field in required:
                if not data.get(field):
                    return jsonify({'error': f'{field} is required'}), 400
            
            # Load existing users
            with open(users_path, 'r') as f:
                users_data = json.load(f)
            
            # Check if user already exists
            if any(u['email'] == data['email'] for u in users_data['users']):
                return jsonify({'error': 'User already exists'}), 400
            
            # Add new user
            new_user = {
                'email': data['email'],
                'name': data['name'],
                'group_id': data['group_id'],
                'created_at': datetime.now().isoformat()
            }
            
            users_data['users'].append(new_user)
            
            # Save
            with open(users_path, 'w') as f:
                json.dump(users_data, f, indent=2)
            
            # Add user to group members
            groups_path = os.path.join(os.path.dirname(__file__), 'user_groups.json')
            with open(groups_path, 'r') as f:
                groups_data = json.load(f)
            
            for group in groups_data['groups']:
                if group['id'] == data['group_id']:
                    if data['email'] not in group['members']:
                        group['members'].append(data['email'])
            
            with open(groups_path, 'w') as f:
                json.dump(groups_data, f, indent=2)
            
            user_name = data.get('name', '')
            print(f"✅ User created: {user_name} ({data.get('email')}) in group {data.get('group_id')}")
            
            return jsonify({
                'status': 'success',
                'message': f'User {user_name} created successfully',
                'user': new_user
            })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/save-guardrails', methods=['POST'])
def save_guardrails():
    """Save guardrails configuration"""
    try:
        data = request.get_json()
        
        # Store in file (in production, use database)
        guardrails_path = os.path.join(os.path.dirname(__file__), 'guardrails_config.json')
        with open(guardrails_path, 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"✅ Guardrails saved: {len(data.get('serviceRestrictions', []))} service, {len(data.get('deleteRestrictions', []))} delete, {len(data.get('createRestrictions', []))} create rules")
        
        return jsonify({
            'status': 'success',
            'message': 'Guardrails saved successfully'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/guardrails', methods=['GET'])
def get_guardrails():
    """Get current guardrails configuration"""
    try:
        guardrails_path = os.path.join(os.path.dirname(__file__), 'guardrails_config.json')
        if os.path.exists(guardrails_path):
            with open(guardrails_path, 'r') as f:
                return jsonify(json.load(f))
        return jsonify({
            'serviceRestrictions': [],
            'deleteRestrictions': [],
            'createRestrictions': [],
            'customGuardrails': []
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/scps', methods=['GET'])
def list_scps():
    """List all Service Control Policies"""
    try:
        result = SCPManager.list_policies()
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/scps/<policy_id>', methods=['GET'])
def get_scp(policy_id):
    """Get SCP details"""
    try:
        result = SCPManager.get_policy_content(policy_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/scps', methods=['POST'])
def create_scp():
    """Create new SCP"""
    try:
        data = request.get_json()
        result = SCPManager.create_policy(
            name=data['name'],
            description=data.get('description', ''),
            content=data['content']
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/scps/<policy_id>', methods=['PUT'])
def update_scp(policy_id):
    """Update SCP"""
    try:
        data = request.get_json()
        result = SCPManager.update_policy(
            policy_id=policy_id,
            name=data.get('name'),
            description=data.get('description'),
            content=data.get('content')
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/scps/<policy_id>', methods=['DELETE'])
def delete_scp(policy_id):
    """Delete SCP"""
    try:
        result = SCPManager.delete_policy(policy_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/scps/<policy_id>/attach', methods=['POST'])
def attach_scp(policy_id):
    """Attach SCP to account/OU"""
    try:
        data = request.get_json()
        result = SCPManager.attach_policy(policy_id, data['target_id'])
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/scps/<policy_id>/detach', methods=['POST'])
def detach_scp(policy_id):
    """Detach SCP from account/OU"""
    try:
        data = request.get_json()
        result = SCPManager.detach_policy(policy_id, data['target_id'])
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/accounts/<account_id>/scps', methods=['GET'])
def get_account_scps(account_id):
    """Get SCPs attached to account"""
    try:
        result = SCPManager.get_account_policies(account_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai/config', methods=['GET', 'POST'])
def manage_ai_config():
    """Get or update Bedrock AI configuration"""
    try:
        config_path = os.path.join(os.path.dirname(__file__), 'bedrock_config.json')
        
        if request.method == 'GET':
            with open(config_path, 'r') as f:
                config = json.load(f)
            # Hide credentials in response
            safe_config = config.copy()
            if safe_config.get('aws_access_key_id'):
                safe_config['aws_access_key_id'] = '***' + safe_config['aws_access_key_id'][-4:]
            if safe_config.get('aws_secret_access_key'):
                safe_config['aws_secret_access_key'] = '***'
            return jsonify(safe_config)
        
        elif request.method == 'POST':
            data = request.get_json()
            
            # Update config file
            with open(config_path, 'r') as f:
                config = json.load(f)
            
            # Update fields
            if 'enabled' in data:
                config['enabled'] = data['enabled']
            if 'aws_region' in data:
                config['aws_region'] = data['aws_region']
            if 'model_id' in data:
                config['model_id'] = data['model_id']
            if 'aws_access_key_id' in data and not data['aws_access_key_id'].startswith('***'):
                config['aws_access_key_id'] = data['aws_access_key_id']
            if 'aws_secret_access_key' in data and data['aws_secret_access_key'] != '***':
                config['aws_secret_access_key'] = data['aws_secret_access_key']
            if 'aws_session_token' in data:
                config['aws_session_token'] = data['aws_session_token']
            if 'max_tokens' in data:
                config['max_tokens'] = data['max_tokens']
            if 'temperature' in data:
                config['temperature'] = data['temperature']
            
            # Save config
            with open(config_path, 'w') as f:
                json.dump(config, f, indent=2)
            
            # Reload config in ConversationManager
            ConversationManager.bedrock_config = None
            ConversationManager.bedrock_client = None
            ConversationManager.load_bedrock_config()
            
            return jsonify({
                'status': 'success',
                'message': 'AI configuration updated. Restart Flask to apply changes.',
                'mode': ConversationManager.get_mode()
            })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Database endpoints
from database_manager import create_database_user, execute_query, revoke_database_access, generate_password
from vault_manager import VaultManager

# Database AI conversation storage
db_conversations = {}

@app.route('/api/databases/ai-chat', methods=['POST'])
def database_ai_chat():
    """AI chat for database access requests."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'JSON body required'}), 400
        message = str(data.get('message', '')).strip()
        conversation_id = data.get('conversation_id')
        chat_context = data.get('context') if isinstance(data.get('context'), dict) else {}
        context_databases = chat_context.get('databases') if isinstance(chat_context.get('databases'), list) else []
        context_databases = [d for d in context_databases if isinstance(d, dict)][:8]
        context_engine_label = str(chat_context.get('engine_label') or chat_context.get('engine') or '').strip()
        context_account = str(chat_context.get('account_id') or '').strip()
        context_db_names = [str(d.get('name')).strip() for d in context_databases if d.get('name')]
        context_hosts = [str(d.get('host')).strip() for d in context_databases if d.get('host')]
        selected_instance = chat_context.get('selected_instance') if isinstance(chat_context.get('selected_instance'), dict) else {}
        selected_instance_name = str(selected_instance.get('name') or selected_instance.get('id') or '').strip()
        
        if not message:
            return jsonify({'error': 'Message required'}), 400
        
        # Prompt injection guard - validate before sending to AI (skip if module missing)
        try:
            from prompt_injection_guard import validate_ai_input
            is_valid, error = validate_ai_input(message, check_sql=True)
            if not is_valid:
                return jsonify({'error': error}), 400
        except ImportError:
            pass  # No guard module - continue
        
        # Create or get conversation
        if not conversation_id:
            conversation_id = str(uuid.uuid4())
            db_conversations[conversation_id] = []
        elif conversation_id not in db_conversations:
            db_conversations[conversation_id] = []

        def redact_sensitive_content(text):
            redacted = str(text or '')
            patterns = [
                (r'(?i)\b(username|user)\s*(?:is|=|:)\s*([^\s,;]+)\s+(?:and\s+)?\b(password|passwd|pwd)\s*(?:is|=|:)\s*([^\s,;]+)', r'\1=[REDACTED] \3=[REDACTED]'),
                (r'(?i)\b(password|passwd|pwd)\s*(?:is|=|:)\s*([^\s,;]+)', r'\1=[REDACTED]'),
                (r'(?i)\b(api[_ -]?key|access[_ -]?key|secret[_ -]?key|token)\s*(?:is|=|:)\s*([^\s,;]+)', r'\1=[REDACTED]'),
                (r'([a-zA-Z][a-zA-Z0-9+.-]*://[^:\s/@]+:)([^@\s]+)(@)', r'\1[REDACTED]\3'),
            ]
            for pattern, repl in patterns:
                redacted = re.sub(pattern, repl, redacted)
            return redacted

        def is_out_of_scope_request(msg):
            msg_lower = (msg or '').lower()
            non_db_terms = ['movie', 'ticket', 'flight', 'hotel', 'food', 'restaurant', 'cab', 'weather']
            db_terms = ['db', 'database', 'rds', 'sql', 'table', 'schema', 'instance', 'mysql', 'postgres']
            return any(t in msg_lower for t in non_db_terms) and not any(t in msg_lower for t in db_terms)

        def is_destructive_execution_request(msg):
            msg_lower = (msg or '').lower()
            destructive_words = ['delete', 'drop', 'truncate', 'terminate', 'destroy', 'wipe', 'purge']
            db_targets = ['rds', 'instance', 'database', 'db', 'table', 'schema', 'cluster']
            execution_markers = ['can you', 'please', 'for me', 'go ahead', 'right now', 'make yourself admin']
            has_destructive = any(word in msg_lower for word in destructive_words)
            has_target = any(word in msg_lower for word in db_targets)
            has_execution = any(marker in msg_lower for marker in execution_markers)
            return has_destructive and has_target and has_execution

        def asks_for_sensitive_data(text):
            t = str(text or '')
            patterns = [
                r'(?i)\b(share|provide|send|give|tell)\b[^.?!]{0,60}\b(password|passwd|credential|secret|api key|token)\b',
                r'(?i)\b(master|db)\s+(username|password)\b',
                r'(?i)\bwhat\s+is\s+your\s+password\b',
            ]
            return any(re.search(p, t) for p in patterns)

        def claims_direct_execution(text):
            t = (text or '').lower()
            if any(x in t for x in ["i can't", "i cannot", "i can not", "unable to"]):
                return False
            has_commit = any(x in t for x in ['i can', "i'll", 'i will', 'we can', 'we will'])
            has_action = any(x in t for x in ['delete', 'drop', 'terminate', 'destroy', 'create', 'modify'])
            return has_commit and has_action

        def infer_permissions_and_role(text):
            text_upper = (text or '').upper()
            text_lower = (text or '').lower()
            known_permissions = [
                'SELECT', 'EXPLAIN', 'SHOW', 'DESCRIBE',
                'INSERT', 'UPDATE', 'DELETE',
                'CREATE', 'ALTER', 'DROP', 'TRUNCATE',
                'GRANT', 'REVOKE'
            ]
            suggested = []
            for perm in known_permissions:
                if re.search(rf'\b{perm}\b', text_upper):
                    suggested.append(perm)

            if 'ALL PRIVILEGES' in text_upper or re.search(r'\bALL\b', text_upper):
                if 'ALL' not in suggested:
                    suggested.insert(0, 'ALL')

            if not suggested:
                if re.search(r'\b(admin|dba|owner|full access|all access)\b', text_lower):
                    suggested.append('ALL')
                if re.search(r'\b(read|query|view|analytics|diagnostic|troubleshoot|debug|error|issue|investigate|check)\b', text_lower):
                    suggested.append('SELECT')
                if re.search(r'\b(write|modify|edit|correction|update data|insert data|fix|resolve)\b', text_lower):
                    for perm in ['INSERT', 'UPDATE', 'DELETE']:
                        if perm not in suggested:
                            suggested.append(perm)
                if re.search(r'\b(schema|migration|ddl|table change|structure change)\b', text_lower):
                    for perm in ['CREATE', 'ALTER', 'DROP']:
                        if perm not in suggested:
                            suggested.append(perm)

            role = None
            if 'ALL' in suggested or any(p in suggested for p in ['GRANT', 'REVOKE']):
                role = 'admin'
            elif any(p in suggested for p in ['CREATE', 'ALTER', 'DROP', 'TRUNCATE']):
                role = 'read_full_write'
            elif any(p in suggested for p in ['INSERT', 'UPDATE', 'DELETE']):
                role = 'read_limited_write'
            elif suggested:
                role = 'read_only'

            return suggested, role

        def normalize_db_ai_reply(text):
            """Keep assistant reply concise and user-facing."""
            cleaned = str(text or '').strip()
            if not cleaned:
                return ''
            cleaned = re.sub(r'[`*_#>-]+', '', cleaned)
            cleaned = re.sub(r'^(assistant|npamx)\s*:\s*', '', cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r'\s+', ' ', cleaned).strip()
            sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', cleaned) if s.strip()]
            if not sentences:
                return cleaned[:260].strip()
            concise = " ".join(sentences[:2]).strip()
            if len(concise) > 260:
                concise = concise[:257].rstrip() + "..."
            return concise

        def local_guardrailed_fallback(msg):
            msg_lower = (msg or '').lower().strip()
            target_hint = selected_instance_name or (context_db_names[0] if context_db_names else (context_hosts[0] if context_hosts else 'the selected database'))
            greeting = bool(re.match(r'^(hi|hii|hello|hey|good morning|good afternoon|good evening)[\s!.?]*$', msg_lower))
            if greeting:
                return f"Hey hi, I am here. How can I help with {target_hint}?"
            if 'are you there' in msg_lower or 'what happened' in msg_lower:
                return "I am here. Tell me the operations and duration, and I will prepare your request."
            if is_out_of_scope_request(msg_lower):
                return "I can help only with database access in NPAMX. Tell me your DB task and duration."
            if is_destructive_execution_request(msg_lower):
                return "I cannot execute destructive actions through chat. I can help you submit a controlled access request instead."
            has_ops = any(x in msg_lower for x in ['read', 'write', 'select', 'insert', 'update', 'delete', 'create', 'alter', 'drop', 'grant', 'revoke'])
            has_duration = bool(re.search(r'\b([1-9]|1[0-9]|2[0-4])\s*(h|hr|hrs|hour|hours)\b', msg_lower))
            if has_ops and has_duration:
                return "Perfect, I captured it. Please click Submit for Approval."
            if has_ops and not has_duration:
                return "Got it. How long do you need this access (for example 2h, 4h, or 8h)?"
            if not has_ops and has_duration:
                return "Understood. What operations do you need on the selected database?"
            return "Tell me the required operations and duration, and I will prepare the request."

        message_for_ai = redact_sensitive_content(message)
        shared_secret = message_for_ai != message

        # Add sanitized user message to history.
        db_conversations[conversation_id].append({'role': 'user', 'content': message_for_ai})

        if shared_secret:
            ai_response = "Please do not share usernames, passwords, tokens, or keys in chat. NPAMX does not need secrets here, so tell me only the operations and duration."
            db_conversations[conversation_id].append({'role': 'assistant', 'content': ai_response})
            return jsonify({
                'response': ai_response,
                'conversation_id': conversation_id,
                'permissions': None,
                'suggested_role': None
            })

        if is_destructive_execution_request(message_for_ai):
            ai_response = "I cannot execute destructive actions like deleting databases or RDS instances through chat. If needed, I can help you request the right temporary access."
            db_conversations[conversation_id].append({'role': 'assistant', 'content': ai_response})
            return jsonify({
                'response': ai_response,
                'conversation_id': conversation_id,
                'permissions': None,
                'suggested_role': None
            })

        context_lines = []
        if context_engine_label:
            context_lines.append(f"Engine: {context_engine_label}")
        if context_account:
            context_lines.append(f"Account: {context_account}")
        if selected_instance_name:
            context_lines.append(f"Selected instance: {selected_instance_name}")
        if context_db_names:
            context_lines.append(f"Selected database(s): {', '.join(context_db_names[:5])}")
        if context_hosts:
            context_lines.append(f"Selected endpoint(s): {', '.join(context_hosts[:3])}")
        if not context_lines:
            context_lines.append("No DB target is preselected in UI context.")
        context_block = "\n".join(context_lines)

        system_prompt = f"""You are NPAMX, the database JIT access assistant.

Current UI context:
{context_block}

Rules:
- Reply in 1-2 short, natural sentences (human tone, not robotic).
- Keep each sentence compact and easy to scan.
- Ask at most one clarifying question, and only if truly needed.
- Never repeat the same question if the answer is already in chat history or UI context.
- Before replying, check the previous assistant turn and avoid repeating the same wording or opener.
- If database or instance is already selected in UI context, do not ask for it again unless the user asks to change it.
- Infer intent from plain language (including troubleshooting narratives) and guide the user toward a usable DB access request.
- When the user asks a direct question, answer it first, then ask one follow-up only if needed.
- If user asks something outside database/JIT scope, gently redirect to database assistance in one short sentence.
- Never ask for usernames, passwords, API keys, tokens, or any secret.
- If a user shares a secret, tell them not to share secrets and continue without it.
- Never claim to directly execute infrastructure changes yourself.
- For delete/drop/terminate requests against infrastructure, refuse execution and redirect to the approved request workflow.
- Avoid bullet points, markdown, or template-like wording.
- Keep tone friendly, brief, and practical.

If details are missing, ask only the next most important missing detail:
1) operations needed
2) duration
3) environment/account (if not already known)

If enough details are available (operations and duration), confirm briefly and ask the user to submit for approval."""

        bedrock_cfg = ConversationManager.bedrock_config if isinstance(ConversationManager.bedrock_config, dict) else {}
        region = str(
            bedrock_cfg.get('aws_region')
            or os.getenv('AWS_REGION')
            or os.getenv('AWS_DEFAULT_REGION')
            or 'ap-south-1'
        )
        model_id = str(bedrock_cfg.get('model_id') or 'anthropic.claude-3-sonnet-20240229-v1:0')
        configured_max_tokens = int(bedrock_cfg.get('max_tokens') or 260)
        max_tokens = max(80, min(configured_max_tokens, 220))
        configured_temperature = float(bedrock_cfg.get('temperature') if bedrock_cfg.get('temperature') is not None else 0.4)
        temperature = max(0.2, min(configured_temperature, 0.6))

        bedrock_client = ConversationManager.bedrock_client
        if not bedrock_client:
            bedrock_client = boto3.client('bedrock-runtime', region_name=region, config=AWS_CONFIG)

        chat_messages = []
        for msg in db_conversations[conversation_id][-12:]:
            role = msg.get('role')
            if role not in ('user', 'assistant'):
                continue
            content = redact_sensitive_content(str(msg.get('content') or '').strip())
            if not content:
                continue
            chat_messages.append({'role': role, 'content': content})

        if not chat_messages or chat_messages[-1].get('role') != 'user':
            chat_messages.append({'role': 'user', 'content': message_for_ai})

        try:
            response = bedrock_client.invoke_model(
                modelId=model_id,
                body=json.dumps({
                    'anthropic_version': 'bedrock-2023-05-31',
                    'system': system_prompt,
                    'max_tokens': max_tokens,
                    'temperature': temperature,
                    'messages': chat_messages
                })
            )
            result = json.loads(response['body'].read())
            content_blocks = result.get('content') if isinstance(result, dict) else None
            if isinstance(content_blocks, list):
                parts = []
                for block in content_blocks:
                    if isinstance(block, dict):
                        text_part = str(block.get('text') or '').strip()
                        if text_part:
                            parts.append(text_part)
                ai_response = " ".join(parts).strip()
            else:
                ai_response = str(result.get('output_text') or '').strip()
        except Exception as bedrock_err:
            print(f"Bedrock chat failed: {bedrock_err}")
            ai_response = local_guardrailed_fallback(message_for_ai)

        ai_response = normalize_db_ai_reply(ai_response)
        if asks_for_sensitive_data(ai_response):
            ai_response = "I will never ask for usernames or passwords in chat. Tell me the operations and duration, and I will prepare your access request."
        elif claims_direct_execution(ai_response):
            ai_response = "I cannot directly execute infrastructure changes. I can help you prepare a controlled JIT access request."

        if not ai_response:
            ai_response = local_guardrailed_fallback(message_for_ai)

        # Store assistant response
        db_conversations[conversation_id].append({'role': 'assistant', 'content': ai_response})

        # Infer permissions from user intent only (assistant text should not bias this).
        recent_user_text = "\n".join(
            str(m.get('content') or '')
            for m in db_conversations[conversation_id][-10:]
            if m.get('role') == 'user'
        )
        suggested_perms, suggested_role = infer_permissions_and_role(recent_user_text)

        return jsonify({
            'response': ai_response,
            'conversation_id': conversation_id,
            'permissions': suggested_perms if suggested_perms else None,
            'suggested_role': suggested_role
        })
        
    except Exception as e:
        print(f"AI chat error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/gcp/projects', methods=['GET'])
def get_gcp_projects():
    """Mock GCP projects - integrate with GCP API when ready"""
    return jsonify({
        'projects': [
            {'id': 'proj-dev', 'name': 'Development'},
            {'id': 'proj-staging', 'name': 'Staging'},
            {'id': 'proj-prod', 'name': 'Production'}
        ]
    })

@app.route('/api/azure/subscriptions', methods=['GET'])
def get_azure_subscriptions():
    """Mock Azure subscriptions - integrate with Azure API when ready"""
    return jsonify({
        'subscriptions': [
            {'id': 'sub-dev', 'name': 'Dev Subscription'},
            {'id': 'sub-prod', 'name': 'Production Subscription'}
        ]
    })

@app.route('/api/oracle/compartments', methods=['GET'])
def get_oracle_compartments():
    """Mock Oracle compartments - integrate with OCI API when ready"""
    return jsonify({
        'compartments': [
            {'id': 'comp-root', 'name': 'Root'},
            {'id': 'comp-dev', 'name': 'Development'},
            {'id': 'comp-prod', 'name': 'Production'}
        ]
    })

@app.route('/api/mongodb-atlas/projects', methods=['GET'])
def get_mongodb_atlas_projects():
    """Mock MongoDB Atlas projects/clusters - integrate with Atlas API when ready"""
    return jsonify({
        'projects': [
            {'id': 'atlas-cluster-1', 'name': 'Cluster-Production'},
            {'id': 'atlas-cluster-2', 'name': 'Cluster-Staging'}
        ]
    })

@app.route('/api/databases', methods=['GET'])
def get_databases():
    """Get databases - from AWS RDS. Tries to fetch when account_id provided."""
    try:
        account_id = request.args.get('account_id')
        region = request.args.get('region', 'ap-south-1')

        # Always try to fetch RDS when account selected (uses instance role/creds)
        if account_id:
            try:
                rds = boto3.client('rds', region_name=region)
                response = rds.describe_db_instances()
                filter_engine = request.args.get('engine', '').lower()
                databases = []
                for db in response.get('DBInstances', []):
                    raw_engine = (db.get('Engine') or 'mysql').lower()
                    port = db.get('Endpoint', {}).get('Port', 3306)
                    host = db.get('Endpoint', {}).get('Address', '')
                    if not host:
                        continue
                    # Normalize engine for display
                    if 'mysql' in raw_engine and 'aurora' not in raw_engine:
                        norm_engine = 'mysql'
                    elif 'mariadb' in raw_engine:
                        norm_engine = 'maria'
                    elif 'postgres' in raw_engine:
                        norm_engine = 'postgres'
                    elif 'sqlserver' in raw_engine or 'mssql' in raw_engine:
                        norm_engine = 'mssql'
                    elif 'aurora' in raw_engine:
                        norm_engine = 'aurora'
                    else:
                        norm_engine = raw_engine
                    # Filter by selected engine tab - show only matching engines
                    if filter_engine and norm_engine != filter_engine:
                        continue
                    display_engine = 'MySQL' if norm_engine == 'mysql' else 'MariaDB' if norm_engine == 'maria' else 'PostgreSQL' if norm_engine == 'postgres' else 'MSSQL' if norm_engine == 'mssql' else 'Aurora'
                    databases.append({
                        'id': db['DBInstanceIdentifier'],
                        'name': db.get('DBName', db['DBInstanceIdentifier']),
                        'engine': display_engine,
                        'host': host,
                        'port': port,
                        'status': db.get('DBInstanceStatus', 'available' if db.get('DBInstanceStatus') == 'available' else 'unavailable')
                    })
                # Sort by engine, then id
                databases.sort(key=lambda x: (x['engine'], x['id']))
                return jsonify({'databases': databases})
            except Exception as e:
                print(f"RDS fetch failed: {e}")
                return jsonify({
                    'databases': [],
                    'error': str(e),
                    'error_type': 'rds_fetch_failed',
                    'instructions': [
                        'Ensure the app instance role has rds:DescribeDBInstances permission.',
                        'Verify RDS instances exist in the selected region (default: ap-south-1).',
                        'Check AWS credentials (instance role or env vars) are valid.'
                    ]
                })

        # No account selected
        return jsonify({
            'databases': [],
            'error': 'Please select an AWS account.',
            'error_type': 'account_invalid',
            'instructions': ['Select an account from the dropdown to list RDS instances.']
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/databases/request-access', methods=['POST'])
def request_database_access():
    try:
        data = request.get_json()
        databases = data.get('databases', [])
        user_email = data.get('user_email')
        user_full_name = data.get('user_full_name')
        db_username = data.get('db_username')
        permissions = data.get('permissions')
        query_types = data.get('query_types', [])
        duration_hours = data.get('duration_hours', 2)
        justification = data.get('justification')
        use_vault = data.get('use_vault', False)
        ai_generated = data.get('ai_generated', False)
        role = (data.get('role') or 'custom').strip().lower()  # custom or named role
        
        # Only DROP/TRUNCATE/DDL/ALL require approval; plain DELETE (data) allowed for Limited Write
        perms = (permissions or []) if isinstance(permissions, list) else [p.strip() for p in str(permissions or '').split(',') if p.strip()]
        perms_upper = [p.upper() for p in perms]
        known_roles = {'read_only', 'read_limited_write', 'read_full_write', 'admin'}
        if role not in known_roles:
            if 'ALL' in perms_upper or any(p in perms_upper for p in ['GRANT', 'REVOKE']):
                role = 'admin'
            elif any(p in perms_upper for p in ['CREATE', 'ALTER', 'DROP', 'TRUNCATE']):
                role = 'read_full_write'
            elif any(p in perms_upper for p in ['INSERT', 'UPDATE', 'DELETE']):
                role = 'read_limited_write'
            elif perms_upper:
                role = 'read_only'

        has_destructive = 'ALL' in perms_upper or 'DROP' in perms_upper or 'TRUNCATE' in perms_upper or 'DDL' in (query_types or [])
        
        request_id = str(uuid.uuid4())
        expires_at = datetime.now() + timedelta(hours=duration_hours)
        
        if has_destructive:
            status = 'pending'
            approval_required = ['ciso']
            approval_message = 'DDL/DELETE/Destructive queries require CISO approval'
        else:
            status = 'approved'
            approval_required = ['self']
            approval_message = 'Auto-approved for read/write queries'
        
        # Try Vault first, fallback to direct creation
        vault_lease_id = None
        create_error = None
        if status == 'approved':
            try:
                vault_creds = VaultManager.create_database_credentials(
                    db_host=databases[0]['host'],
                    db_name=databases[0]['name'],
                    username=db_username,
                    permissions=permissions,
                    duration_hours=duration_hours
                )
                if vault_creds:
                    db_username = vault_creds['username']
                    password = vault_creds['password']
                    vault_lease_id = vault_creds['lease_id']
                    print(f"✅ Vault credentials created: {db_username}")
                else:
                    password = generate_password()
                    print("⚠️ Vault returned None, using direct creation")
            except Exception as e:
                print(f"⚠️ Vault unavailable, using direct creation: {e}")
                password = generate_password()
        else:
            password = None
        
        db_request = {
            'id': request_id,
            'type': 'database_access',
            'databases': databases,
            'user_email': user_email,
            'user_full_name': user_full_name,
            'db_username': db_username,
            'db_password': password,
            'permissions': permissions,
            'query_types': query_types,
            'role': role,
            'duration_hours': duration_hours,
            'justification': justification,
            'use_vault': use_vault,
            'vault_lease_id': vault_lease_id,
            'ai_generated': ai_generated,
            'status': status,
            'approval_required': approval_required,
            'created_at': datetime.now().isoformat(),
            'expires_at': expires_at.isoformat()
        }
        
        if status == 'approved' and not vault_lease_id:
            admin_user = os.getenv('DB_ADMIN_USER', 'admin')
            admin_password = os.getenv('DB_ADMIN_PASSWORD', 'admin123')
            # Map role to MySQL GRANT permissions. For custom role, honor explicit permission list when provided.
            if role == 'admin':
                sql_perms = 'ALL PRIVILEGES'
            elif role == 'read_full_write':
                sql_perms = 'SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, TRUNCATE'
            elif role == 'read_limited_write':
                sql_perms = 'SELECT, INSERT, UPDATE, DELETE'
            elif role == 'read_only':
                sql_perms = 'SELECT'
            else:
                requested_perms = []
                for p in perms:
                    p_norm = p.strip().upper()
                    if p_norm and p_norm not in requested_perms:
                        requested_perms.append(p_norm)
                if 'ALL' in requested_perms:
                    sql_perms = 'ALL PRIVILEGES'
                elif requested_perms:
                    sql_perms = ', '.join(requested_perms)
                else:
                    sql_perms = 'SELECT'
            
            create_error = None
            for db in databases:
                result = create_database_user(
                    host=db['host'],
                    port=int(db['port']),
                    admin_user=admin_user,
                    admin_password=admin_password,
                    new_user=db_username,
                    new_password=password,
                    database=db['name'],
                    permissions=sql_perms
                )
                if result.get('error'):
                    create_error = result['error']
                    print(f"❌ create_database_user failed: {result['error']}")
        
        requests_db[request_id] = db_request
        _save_requests()
        # MVP 2: Never return password to client
        msg = approval_message
        if create_error and status == 'approved':
            msg += f"\n\n⚠️ DB user creation failed ({create_error}). Set DB_ADMIN_USER and DB_ADMIN_PASSWORD to your MySQL root on EC2, then request new access."
        return jsonify({
            'status': status,
            'request_id': request_id,
            'message': msg,
            'creation_error': create_error if status == 'approved' else None
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/databases/approved', methods=['GET'])
def get_approved_databases():
    try:
        user_email = request.args.get('user_email')
        approved_databases = []
        
        for req_id, req in requests_db.items():
            if (req.get('type') == 'database_access' and 
                req.get('user_email') == user_email and 
                req.get('status') == 'approved'):
                
                # Skip expired - only show databases you can actually use
                expires_at_str = req.get('expires_at', '')
                if expires_at_str:
                    try:
                        exp = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00').replace('+00:00', ''))
                        if datetime.now() >= exp:
                            continue  # Skip expired
                    except Exception:
                        pass
                
                for db in req.get('databases', []):
                    approved_databases.append({
                        'request_id': req_id,
                        'db_name': db['name'],
                        'engine': db['engine'],
                        'host': db['host'],
                        'port': db['port'],
                        'db_username': req['db_username'],
                        'role': req.get('role', 'custom'),
                        'expires_at': req['expires_at']
                    })
        
        return jsonify({'databases': approved_databases})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/databases/execute-query', methods=['POST'])
def execute_database_query():
    """Execute SQL query with time-based access enforcement. MVP 2: Backend fetches credentials."""
    try:
        from prompt_injection_guard import validate_sql_query
        
        data = request.get_json()
        request_id = data.get('request_id')
        user_email = data.get('user_email')
        query = data.get('query', '').strip()
        db_name = data.get('dbName')
        
        if not request_id or not user_email:
            return jsonify({'error': 'Request ID and user email required for audit'}), 400
        
        # Time-based enforcement: validate access is still valid
        if request_id not in requests_db:
            return jsonify({'error': 'Access request not found'}), 404
        
        db_request = requests_db[request_id]
        if db_request.get('type') != 'database_access':
            return jsonify({'error': 'Invalid request type'}), 400
        if db_request.get('user_email') != user_email:
            return jsonify({'error': 'Access denied: user mismatch'}), 403
        if db_request.get('status') != 'approved':
            return jsonify({'error': 'Access not approved'}), 403
        
        expires_at_str = db_request.get('expires_at', '')
        if expires_at_str:
            expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00').replace('+00:00', ''))
            if datetime.now() >= expires_at:
                return jsonify({'error': 'Access expired. Please request new database access.'}), 403
        
        # MVP 2: Resolve credentials from backend - never trust client
        databases = db_request.get('databases', [])
        if not databases:
            return jsonify({'error': 'No database in request'}), 400
        db_info = databases[0]
        host = db_info.get('host')
        port = int(db_info.get('port', 3306))
        database = db_name or db_info.get('name', '')
        username = db_request.get('db_username')
        password = db_request.get('db_password')
        
        if not all([host, username, password, database]):
            return jsonify({'error': 'Database credentials not available. Request may have expired.'}), 400
        
        # SQL validation (role-based)
        role = db_request.get('role', 'read_only')
        is_valid, sql_error = validate_sql_query(query, role=role)
        if not is_valid:
            try:
                from audit_log import log_db_query
                log_db_query(user_email, request_id, role, query, allowed=False, error=sql_error)
            except Exception:
                pass
            return jsonify({'error': sql_error}), 400
        
        # Forward to Database Access Proxy (enforcement point)
        proxy_url = os.getenv('DB_PROXY_URL', 'http://127.0.0.1:5002')
        use_proxy = os.getenv('USE_DB_PROXY', 'true').lower() == 'true'
        
        if use_proxy:
            try:
                import requests
                proxy_resp = requests.post(
                    f'{proxy_url}/execute',
                    json={
                        'host': host,
                        'port': port,
                        'username': username,
                        'password': password,
                        'database': database,
                        'query': query,
                        'user_email': user_email,
                        'request_id': request_id,
                        'role': role  # Proxy uses this for role-based SQL enforcement
                    },
                    timeout=30
                )
                result = proxy_resp.json()
                if proxy_resp.status_code != 200:
                    return jsonify(result), proxy_resp.status_code
            except Exception as e:
                # Fallback to direct if proxy unavailable (dev only)
                print(f"⚠️ Proxy unavailable ({e}), falling back to direct execution")
                result = execute_query(host=host, port=port, username=username, password=password, database=database, query=query)
        else:
            result = execute_query(host=host, port=port, username=username, password=password, database=database, query=query)
        
        # MVP 2: Audit log
        try:
            from audit_log import log_db_query
            rows = len(result.get('results', [])) if isinstance(result.get('results'), list) else result.get('affected_rows')
            err = result.get('error')
            log_db_query(user_email, request_id, role, query, allowed=(err is None), rows_returned=rows, error=err)
        except Exception:
            pass
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Initialize on startup
if __name__ == '__main__':
    # Don't block startup - AWS may have expired creds
    try:
        initialize_aws_config()
    except Exception as e:
        print(f"Startup AWS init skipped: {e}")
    
    # Load Bedrock config on startup
    ConversationManager.load_bedrock_config()
    
    # Start background cleanup thread
    cleanup_thread = threading.Thread(target=background_cleanup, daemon=True)
    cleanup_thread.start()
    print("✅ Background cleanup thread started")
    
    app.run(host='0.0.0.0', debug=False, port=5000)
