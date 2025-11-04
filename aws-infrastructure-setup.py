#!/usr/bin/env python3
"""
AWS Infrastructure Setup for JIT Access System - Non-Prod Demo
Creates DynamoDB tables, Lambda functions, API Gateway, and other AWS services
"""
import boto3
import json
import zipfile
import os
from botocore.exceptions import ClientError
import time

# Configuration
REGION = 'ap-south-1'
PROJECT_NAME = 'jit-access-system'
ENVIRONMENT = 'nonprod'

def create_iam_roles():
    """Create IAM roles for Lambda functions"""
    iam = boto3.client('iam', region_name=REGION)
    
    # Lambda execution role
    lambda_role_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Service": "lambda.amazonaws.com"
                },
                "Action": "sts:AssumeRole"
            }
        ]
    }
    
    lambda_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                ],
                "Resource": "arn:aws:logs:*:*:*"
            },
            {
                "Effect": "Allow",
                "Action": [
                    "dynamodb:GetItem",
                    "dynamodb:PutItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:DeleteItem",
                    "dynamodb:Query",
                    "dynamodb:Scan"
                ],
                "Resource": [
                    f"arn:aws:dynamodb:{REGION}:*:table/JITAccessRequests*",
                    f"arn:aws:dynamodb:{REGION}:*:table/JITAccessApprovals*",
                    f"arn:aws:dynamodb:{REGION}:*:table/JITAccessUsers*"
                ]
            },
            {
                "Effect": "Allow",
                "Action": [
                    "secretsmanager:GetSecretValue",
                    "secretsmanager:DescribeSecret"
                ],
                "Resource": f"arn:aws:secretsmanager:{REGION}:*:secret:jit-access-config*"
            },
            {
                "Effect": "Allow",
                "Action": [
                    "sso-admin:*",
                    "identitystore:*"
                ],
                "Resource": "*"
            },
            {
                "Effect": "Allow",
                "Action": [
                    "bedrock:InvokeModel"
                ],
                "Resource": "*"
            }
        ]
    }
    
    try:
        # Create Lambda execution role
        role_name = f'{PROJECT_NAME}-lambda-role'
        iam.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=json.dumps(lambda_role_policy),
            Description='Lambda execution role for JIT Access System'
        )
        
        # Attach policy
        iam.put_role_policy(
            RoleName=role_name,
            PolicyName=f'{PROJECT_NAME}-lambda-policy',
            PolicyDocument=json.dumps(lambda_policy)
        )
        
        print(f"✅ Created IAM role: {role_name}")
        
        # Wait for role to be available
        time.sleep(10)
        
        return f"arn:aws:iam::{boto3.client('sts').get_caller_identity()['Account']}:role/{role_name}"
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'EntityAlreadyExists':
            print(f"⚠️ IAM role already exists: {role_name}")
            return f"arn:aws:iam::{boto3.client('sts').get_caller_identity()['Account']}:role/{role_name}"
        else:
            print(f"❌ Error creating IAM role: {e}")
            raise

def create_dynamodb_tables():
    """Create DynamoDB tables for the JIT access system"""
    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    
    tables_config = [
        {
            'TableName': f'JITAccessRequests-{ENVIRONMENT}',
            'KeySchema': [
                {'AttributeName': 'request_id', 'KeyType': 'HASH'}
            ],
            'AttributeDefinitions': [
                {'AttributeName': 'request_id', 'AttributeType': 'S'},
                {'AttributeName': 'user_email', 'AttributeType': 'S'},
                {'AttributeName': 'status', 'AttributeType': 'S'},
                {'AttributeName': 'created_at', 'AttributeType': 'S'}
            ],
            'GlobalSecondaryIndexes': [
                {
                    'IndexName': 'UserEmailIndex',
                    'KeySchema': [{'AttributeName': 'user_email', 'KeyType': 'HASH'}],
                    'Projection': {'ProjectionType': 'ALL'},
                    'BillingMode': 'PAY_PER_REQUEST'
                },
                {
                    'IndexName': 'StatusIndex',
                    'KeySchema': [{'AttributeName': 'status', 'KeyType': 'HASH'}],
                    'Projection': {'ProjectionType': 'ALL'},
                    'BillingMode': 'PAY_PER_REQUEST'
                }
            ],
            'BillingMode': 'PAY_PER_REQUEST',
            'SSESpecification': {'Enabled': True},
            'Tags': [
                {'Key': 'Project', 'Value': PROJECT_NAME},
                {'Key': 'Environment', 'Value': ENVIRONMENT}
            ]
        },
        {
            'TableName': f'JITAccessApprovals-{ENVIRONMENT}',
            'KeySchema': [
                {'AttributeName': 'request_id', 'KeyType': 'HASH'},
                {'AttributeName': 'approver_role', 'KeyType': 'RANGE'}
            ],
            'AttributeDefinitions': [
                {'AttributeName': 'request_id', 'AttributeType': 'S'},
                {'AttributeName': 'approver_role', 'AttributeType': 'S'}
            ],
            'BillingMode': 'PAY_PER_REQUEST',
            'SSESpecification': {'Enabled': True},
            'Tags': [
                {'Key': 'Project', 'Value': PROJECT_NAME},
                {'Key': 'Environment', 'Value': ENVIRONMENT}
            ]
        },
        {
            'TableName': f'JITAccessUsers-{ENVIRONMENT}',
            'KeySchema': [
                {'AttributeName': 'user_email', 'KeyType': 'HASH'}
            ],
            'AttributeDefinitions': [
                {'AttributeName': 'user_email', 'AttributeType': 'S'},
                {'AttributeName': 'source', 'AttributeType': 'S'}
            ],
            'GlobalSecondaryIndexes': [
                {
                    'IndexName': 'SourceIndex',
                    'KeySchema': [{'AttributeName': 'source', 'KeyType': 'HASH'}],
                    'Projection': {'ProjectionType': 'ALL'},
                    'BillingMode': 'PAY_PER_REQUEST'
                }
            ],
            'BillingMode': 'PAY_PER_REQUEST',
            'SSESpecification': {'Enabled': True},
            'Tags': [
                {'Key': 'Project', 'Value': PROJECT_NAME},
                {'Key': 'Environment', 'Value': ENVIRONMENT}
            ]
        }
    ]
    
    created_tables = []
    
    for table_config in tables_config:
        try:
            table = dynamodb.create_table(**table_config)
            print(f"✅ Creating table: {table_config['TableName']}")
            table.wait_until_exists()
            print(f"✅ Table {table_config['TableName']} created successfully")
            created_tables.append(table_config['TableName'])
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'ResourceInUseException':
                print(f"⚠️ Table {table_config['TableName']} already exists")
                created_tables.append(table_config['TableName'])
            else:
                print(f"❌ Error creating {table_config['TableName']}: {e}")
    
    return created_tables

def create_secrets():
    """Create AWS Secrets Manager secrets"""
    secrets_client = boto3.client('secretsmanager', region_name=REGION)
    
    secret_value = {
        "sso_instance_arn": "arn:aws:sso:::instance/ssoins-65955f0870d9f06f",
        "identity_store_id": "d-9f677136b2",
        "sso_start_url": "https://nykaa.awsapps.com/start",
        "bedrock_role_arn": "arn:aws:iam::867625663987:role/BedrockCrossAccountRole",
        "admin_users": [
            "satish.korra@nykaa.com",
            "admin@nykaa.com",
            "security@nykaa.com"
        ],
        "integrations": {
            "google_workspace": {
                "enabled": True,
                "client_id": "your-google-client-id",
                "client_secret": "your-google-client-secret"
            },
            "azure_ad": {
                "enabled": True,
                "tenant_id": "your-azure-tenant-id",
                "client_id": "your-azure-client-id"
            },
            "okta": {
                "enabled": False,
                "domain": "your-okta-domain",
                "api_token": "your-okta-api-token"
            },
            "siem": {
                "enabled": True,
                "endpoint": "https://your-siem-endpoint.com/api/events",
                "api_key": "your-siem-api-key"
            }
        }
    }
    
    try:
        secret_name = f'jit-access-config-{ENVIRONMENT}'
        response = secrets_client.create_secret(
            Name=secret_name,
            Description=f'JIT Access System Configuration - {ENVIRONMENT}',
            SecretString=json.dumps(secret_value),
            Tags=[
                {'Key': 'Project', 'Value': PROJECT_NAME},
                {'Key': 'Environment', 'Value': ENVIRONMENT}
            ]
        )
        print(f"✅ Created secret: {secret_name}")
        return response['ARN']
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceExistsException':
            print(f"⚠️ Secret already exists, updating...")
            secrets_client.update_secret(
                SecretId=secret_name,
                SecretString=json.dumps(secret_value)
            )
            print("✅ Secret updated")
            return f"arn:aws:secretsmanager:{REGION}:*:secret:{secret_name}*"
        else:
            print(f"❌ Error creating secret: {e}")
            raise

def create_lambda_functions(lambda_role_arn):
    """Create Lambda functions for the JIT access system"""
    lambda_client = boto3.client('lambda', region_name=REGION)
    
    # Lambda function code for request processing
    lambda_code = '''
import json
import boto3
import uuid
from datetime import datetime, timedelta
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
requests_table = dynamodb.Table('JITAccessRequests-nonprod')

def lambda_handler(event, context):
    """
    Lambda function to handle JIT access requests
    """
    try:
        http_method = event.get('httpMethod', '')
        path = event.get('path', '')
        
        if http_method == 'POST' and path == '/api/request-access':
            return handle_access_request(event)
        elif http_method == 'GET' and path == '/api/requests':
            return get_requests(event)
        elif http_method == 'POST' and path.startswith('/api/approve/'):
            return approve_request(event)
        else:
            return {
                'statusCode': 404,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Not found'})
            }
            
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e)})
        }

def handle_access_request(event):
    """Handle new access request"""
    try:
        body = json.loads(event['body'])
        
        request_id = str(uuid.uuid4())
        
        request_item = {
            'request_id': request_id,
            'user_email': body['user_email'],
            'account_id': body['account_id'],
            'duration_hours': body['duration_hours'],
            'justification': body['justification'],
            'status': 'pending',
            'created_at': datetime.now().isoformat(),
            'expires_at': (datetime.now() + timedelta(hours=body['duration_hours'])).isoformat()
        }
        
        if 'use_case' in body:
            request_item['ai_generated'] = True
            request_item['use_case'] = body['use_case']
        else:
            request_item['permission_set'] = body['permission_set']
            request_item['ai_generated'] = False
        
        requests_table.put_item(Item=request_item)
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'request_id': request_id,
                'status': 'submitted'
            })
        }
        
    except Exception as e:
        logger.error(f"Error handling access request: {str(e)}")
        raise

def get_requests(event):
    """Get all requests"""
    try:
        response = requests_table.scan()
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(response['Items'])
        }
        
    except Exception as e:
        logger.error(f"Error getting requests: {str(e)}")
        raise

def approve_request(event):
    """Approve a request"""
    try:
        path_parts = event['path'].split('/')
        request_id = path_parts[-1]
        
        # Update request status
        requests_table.update_item(
            Key={'request_id': request_id},
            UpdateExpression='SET #status = :status, granted_at = :granted_at',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': 'approved',
                ':granted_at': datetime.now().isoformat()
            }
        )
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'status': 'approved',
                'message': 'Request approved successfully'
            })
        }
        
    except Exception as e:
        logger.error(f"Error approving request: {str(e)}")
        raise
'''
    
    # Create deployment package
    with zipfile.ZipFile('/tmp/lambda_function.zip', 'w') as zip_file:
        zip_file.writestr('lambda_function.py', lambda_code)
    
    with open('/tmp/lambda_function.zip', 'rb') as zip_file:
        zip_content = zip_file.read()
    
    functions = [
        {
            'FunctionName': f'{PROJECT_NAME}-api-handler-{ENVIRONMENT}',
            'Runtime': 'python3.9',
            'Role': lambda_role_arn,
            'Handler': 'lambda_function.lambda_handler',
            'Code': {'ZipFile': zip_content},
            'Description': 'JIT Access System API Handler',
            'Timeout': 30,
            'Environment': {
                'Variables': {
                    'ENVIRONMENT': ENVIRONMENT,
                    'REGION': REGION
                }
            },
            'Tags': {
                'Project': PROJECT_NAME,
                'Environment': ENVIRONMENT
            }
        }
    ]
    
    created_functions = []
    
    for func_config in functions:
        try:
            response = lambda_client.create_function(**func_config)
            print(f"✅ Created Lambda function: {func_config['FunctionName']}")
            created_functions.append({
                'name': func_config['FunctionName'],
                'arn': response['FunctionArn']
            })
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'ResourceConflictException':
                print(f"⚠️ Lambda function already exists: {func_config['FunctionName']}")
                # Update existing function
                lambda_client.update_function_code(
                    FunctionName=func_config['FunctionName'],
                    ZipFile=zip_content
                )
                print(f"✅ Updated Lambda function: {func_config['FunctionName']}")
                
                # Get function ARN
                response = lambda_client.get_function(FunctionName=func_config['FunctionName'])
                created_functions.append({
                    'name': func_config['FunctionName'],
                    'arn': response['Configuration']['FunctionArn']
                })
            else:
                print(f"❌ Error creating Lambda function: {e}")
    
    return created_functions

def create_api_gateway(lambda_functions):
    """Create API Gateway for the JIT access system"""
    apigateway = boto3.client('apigateway', region_name=REGION)
    lambda_client = boto3.client('lambda', region_name=REGION)
    
    try:
        # Create REST API
        api_response = apigateway.create_rest_api(
            name=f'{PROJECT_NAME}-api-{ENVIRONMENT}',
            description='JIT Access System API',
            tags={
                'Project': PROJECT_NAME,
                'Environment': ENVIRONMENT
            }
        )
        
        api_id = api_response['id']
        print(f"✅ Created API Gateway: {api_id}")
        
        # Get root resource
        resources = apigateway.get_resources(restApiId=api_id)
        root_resource_id = resources['items'][0]['id']
        
        # Create /api resource
        api_resource = apigateway.create_resource(
            restApiId=api_id,
            parentId=root_resource_id,
            pathPart='api'
        )
        api_resource_id = api_resource['id']
        
        # Create proxy resource
        proxy_resource = apigateway.create_resource(
            restApiId=api_id,
            parentId=api_resource_id,
            pathPart='{proxy+}'
        )
        proxy_resource_id = proxy_resource['id']
        
        # Create ANY method
        apigateway.put_method(
            restApiId=api_id,
            resourceId=proxy_resource_id,
            httpMethod='ANY',
            authorizationType='NONE'
        )
        
        # Set up Lambda integration
        lambda_function_arn = lambda_functions[0]['arn']
        
        apigateway.put_integration(
            restApiId=api_id,
            resourceId=proxy_resource_id,
            httpMethod='ANY',
            type='AWS_PROXY',
            integrationHttpMethod='POST',
            uri=f'arn:aws:apigateway:{REGION}:lambda:path/2015-03-31/functions/{lambda_function_arn}/invocations'
        )
        
        # Add Lambda permission for API Gateway
        lambda_client.add_permission(
            FunctionName=lambda_functions[0]['name'],
            StatementId='api-gateway-invoke',
            Action='lambda:InvokeFunction',
            Principal='apigateway.amazonaws.com',
            SourceArn=f'arn:aws:execute-api:{REGION}:*:{api_id}/*/*'
        )
        
        # Deploy API
        deployment = apigateway.create_deployment(
            restApiId=api_id,
            stageName=ENVIRONMENT
        )
        
        api_url = f'https://{api_id}.execute-api.{REGION}.amazonaws.com/{ENVIRONMENT}'
        print(f"✅ API Gateway deployed: {api_url}")
        
        return {
            'api_id': api_id,
            'api_url': api_url
        }
        
    except ClientError as e:
        print(f"❌ Error creating API Gateway: {e}")
        raise

def create_cloudwatch_dashboard():
    """Create CloudWatch dashboard for monitoring"""
    cloudwatch = boto3.client('cloudwatch', region_name=REGION)
    
    dashboard_body = {
        "widgets": [
            {
                "type": "metric",
                "x": 0,
                "y": 0,
                "width": 12,
                "height": 6,
                "properties": {
                    "metrics": [
                        ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", f"JITAccessRequests-{ENVIRONMENT}"],
                        [".", "ConsumedWriteCapacityUnits", ".", "."]
                    ],
                    "period": 300,
                    "stat": "Sum",
                    "region": REGION,
                    "title": "DynamoDB Usage"
                }
            },
            {
                "type": "metric",
                "x": 12,
                "y": 0,
                "width": 12,
                "height": 6,
                "properties": {
                    "metrics": [
                        ["AWS/Lambda", "Invocations", "FunctionName", f"{PROJECT_NAME}-api-handler-{ENVIRONMENT}"],
                        [".", "Errors", ".", "."],
                        [".", "Duration", ".", "."]
                    ],
                    "period": 300,
                    "stat": "Sum",
                    "region": REGION,
                    "title": "Lambda Metrics"
                }
            }
        ]
    }
    
    try:
        cloudwatch.put_dashboard(
            DashboardName=f'{PROJECT_NAME}-{ENVIRONMENT}',
            DashboardBody=json.dumps(dashboard_body)
        )
        print(f"✅ Created CloudWatch dashboard: {PROJECT_NAME}-{ENVIRONMENT}")
        
    except ClientError as e:
        print(f"❌ Error creating CloudWatch dashboard: {e}")

def main():
    """Main function to set up AWS infrastructure"""
    print(f"🚀 Setting up AWS infrastructure for {PROJECT_NAME} in {ENVIRONMENT} environment...")
    
    try:
        # Create IAM roles
        print("\n📋 Creating IAM roles...")
        lambda_role_arn = create_iam_roles()
        
        # Create DynamoDB tables
        print("\n🗄️ Creating DynamoDB tables...")
        tables = create_dynamodb_tables()
        
        # Create secrets
        print("\n🔐 Creating secrets...")
        secret_arn = create_secrets()
        
        # Create Lambda functions
        print("\n⚡ Creating Lambda functions...")
        lambda_functions = create_lambda_functions(lambda_role_arn)
        
        # Create API Gateway
        print("\n🌐 Creating API Gateway...")
        api_info = create_api_gateway(lambda_functions)
        
        # Create CloudWatch dashboard
        print("\n📊 Creating CloudWatch dashboard...")
        create_cloudwatch_dashboard()
        
        print("\n✅ Infrastructure setup completed successfully!")
        print("\n📋 Summary:")
        print(f"   • DynamoDB Tables: {len(tables)}")
        print(f"   • Lambda Functions: {len(lambda_functions)}")
        print(f"   • API Gateway URL: {api_info['api_url']}")
        print(f"   • Secret ARN: {secret_arn}")
        print(f"   • CloudWatch Dashboard: {PROJECT_NAME}-{ENVIRONMENT}")
        
        print("\n🔗 Next Steps:")
        print("   1. Update frontend API_BASE URL to use API Gateway endpoint")
        print("   2. Configure identity provider integrations in Secrets Manager")
        print("   3. Set up monitoring alerts in CloudWatch")
        print("   4. Test the system end-to-end")
        
        return {
            'tables': tables,
            'lambda_functions': lambda_functions,
            'api_gateway': api_info,
            'secret_arn': secret_arn
        }
        
    except Exception as e:
        print(f"❌ Infrastructure setup failed: {e}")
        raise

if __name__ == "__main__":
    main()