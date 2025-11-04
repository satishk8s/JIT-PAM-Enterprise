#!/usr/bin/env python3
"""
Setup DynamoDB tables for production JIT access system
"""
import boto3
from botocore.exceptions import ClientError

def create_dynamodb_tables():
    """Create DynamoDB tables for production storage"""
    dynamodb = boto3.resource('dynamodb', region_name='ap-south-1')
    
    tables_to_create = [
        {
            'TableName': 'JITAccessRequests',
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
            'SSESpecification': {'Enabled': True}  # Encryption at rest
        },
        {
            'TableName': 'JITAccessApprovals',
            'KeySchema': [
                {'AttributeName': 'request_id', 'KeyType': 'HASH'},
                {'AttributeName': 'approver_role', 'KeyType': 'RANGE'}
            ],
            'AttributeDefinitions': [
                {'AttributeName': 'request_id', 'AttributeType': 'S'},
                {'AttributeName': 'approver_role', 'AttributeType': 'S'}
            ],
            'BillingMode': 'PAY_PER_REQUEST',
            'SSESpecification': {'Enabled': True}
        }
    ]
    
    for table_config in tables_to_create:
        try:
            table = dynamodb.create_table(**table_config)
            print(f"✅ Creating table: {table_config['TableName']}")
            table.wait_until_exists()
            print(f"✅ Table {table_config['TableName']} created successfully")
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'ResourceInUseException':
                print(f"⚠️ Table {table_config['TableName']} already exists")
            else:
                print(f"❌ Error creating {table_config['TableName']}: {e}")

def create_secrets_manager_config():
    """Store sensitive configuration in AWS Secrets Manager"""
    secrets_client = boto3.client('secretsmanager', region_name='ap-south-1')
    
    secret_value = {
        "sso_instance_arn": "arn:aws:sso:::instance/ssoins-65955f0870d9f06f",
        "identity_store_id": "d-9f677136b2",
        "sso_start_url": "https://nykaa.awsapps.com/start",
        "bedrock_role_arn": "arn:aws:iam::867625663987:role/BedrockCrossAccountRole"
    }
    
    try:
        response = secrets_client.create_secret(
            Name='jit-access-config',
            Description='JIT Access System Configuration',
            SecretString=json.dumps(secret_value)
        )
        print(f"✅ Created secret: {response['ARN']}")
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceExistsException':
            print("⚠️ Secret already exists, updating...")
            secrets_client.update_secret(
                SecretId='jit-access-config',
                SecretString=json.dumps(secret_value)
            )
            print("✅ Secret updated")
        else:
            print(f"❌ Error creating secret: {e}")

if __name__ == "__main__":
    print("🚀 Setting up production DynamoDB tables...")
    create_dynamodb_tables()
    
    print("\n🔐 Setting up Secrets Manager configuration...")
    import json
    create_secrets_manager_config()
    
    print("\n✅ Production setup complete!")