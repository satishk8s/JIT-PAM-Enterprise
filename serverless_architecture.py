#!/usr/bin/env python3
"""
Serverless JIT Architecture - Uses Lambda + EventBridge instead of cron
"""
import boto3
import json
from datetime import datetime, timedelta

def create_eventbridge_rules():
    """Create EventBridge rules for automated JIT cleanup"""
    events_client = boto3.client('events', region_name='ap-south-1')
    
    rules = [
        {
            'Name': 'jit-access-cleanup-expired',
            'Description': 'Cleanup expired JIT access every 15 minutes',
            'ScheduleExpression': 'rate(15 minutes)',
            'State': 'ENABLED',
            'Targets': [{
                'Id': '1',
                'Arn': 'arn:aws:lambda:ap-south-1:ACCOUNT_ID:function:jit-cleanup-expired',
                'Input': json.dumps({'action': 'cleanup_expired'})
            }]
        },
        {
            'Name': 'jit-access-cleanup-old-requests',
            'Description': 'Cleanup old requests daily at 2 AM',
            'ScheduleExpression': 'cron(0 2 * * ? *)',
            'State': 'ENABLED',
            'Targets': [{
                'Id': '1', 
                'Arn': 'arn:aws:lambda:ap-south-1:ACCOUNT_ID:function:jit-cleanup-old-requests',
                'Input': json.dumps({'action': 'cleanup_old_requests'})
            }]
        }
    ]
    
    for rule in rules:
        try:
            events_client.put_rule(
                Name=rule['Name'],
                Description=rule['Description'],
                ScheduleExpression=rule['ScheduleExpression'],
                State=rule['State']
            )
            
            events_client.put_targets(
                Rule=rule['Name'],
                Targets=rule['Targets']
            )
            
            print(f"✅ Created EventBridge rule: {rule['Name']}")
            
        except Exception as e:
            print(f"❌ Error creating rule {rule['Name']}: {e}")

def create_lambda_functions():
    """Create Lambda functions for JIT automation"""
    lambda_client = boto3.client('lambda', region_name='ap-south-1')
    
    # Lambda function code for cleanup
    cleanup_code = '''
import boto3
import json
from datetime import datetime, timedelta
from boto3.dynamodb.conditions import Key

def lambda_handler(event, context):
    dynamodb = boto3.resource('dynamodb', region_name='ap-south-1')
    requests_table = dynamodb.Table('JITAccessRequests')
    
    action = event.get('action', 'cleanup_expired')
    
    if action == 'cleanup_expired':
        return cleanup_expired_access(requests_table)
    elif action == 'cleanup_old_requests':
        return cleanup_old_requests(requests_table)
    
def cleanup_expired_access(requests_table):
    now = datetime.now().isoformat()
    
    # Scan for expired approved requests
    response = requests_table.scan(
        FilterExpression='#status = :status AND expires_at < :now',
        ExpressionAttributeNames={'#status': 'status'},
        ExpressionAttributeValues={':status': 'approved', ':now': now}
    )
    
    revoked_count = 0
    for item in response['Items']:
        # Call SSO revoke API here
        revoke_sso_access(item)
        
        # Update status
        requests_table.update_item(
            Key={'request_id': item['request_id']},
            UpdateExpression='SET #status = :status, revoked_at = :revoked_at',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': 'revoked',
                ':revoked_at': now
            }
        )
        revoked_count += 1
    
    return {'statusCode': 200, 'body': f'Revoked {revoked_count} expired access'}

def cleanup_old_requests(requests_table):
    cutoff_date = (datetime.now() - timedelta(days=3)).isoformat()
    
    response = requests_table.scan(
        FilterExpression='(#status = :pending OR #status = :denied) AND created_at < :cutoff',
        ExpressionAttributeNames={'#status': 'status'},
        ExpressionAttributeValues={
            ':pending': 'pending',
            ':denied': 'denied',
            ':cutoff': cutoff_date
        }
    )
    
    cleaned_count = 0
    for item in response['Items']:
        requests_table.delete_item(Key={'request_id': item['request_id']})
        cleaned_count += 1
    
    return {'statusCode': 200, 'body': f'Cleaned {cleaned_count} old requests'}

def revoke_sso_access(request_item):
    # Implementation for SSO revocation
    pass
'''
    
    functions = [
        {
            'FunctionName': 'jit-cleanup-expired',
            'Runtime': 'python3.9',
            'Role': 'arn:aws:iam::ACCOUNT_ID:role/JITLambdaExecutionRole',
            'Handler': 'index.lambda_handler',
            'Code': {'ZipFile': cleanup_code.encode()},
            'Description': 'Cleanup expired JIT access',
            'Timeout': 300,
            'Environment': {
                'Variables': {
                    'DYNAMODB_TABLE': 'JITAccessRequests'
                }
            }
        }
    ]
    
    for func in functions:
        try:
            response = lambda_client.create_function(**func)
            print(f"✅ Created Lambda function: {func['FunctionName']}")
            
        except lambda_client.exceptions.ResourceConflictException:
            print(f"⚠️ Function {func['FunctionName']} already exists")
        except Exception as e:
            print(f"❌ Error creating function {func['FunctionName']}: {e}")

if __name__ == "__main__":
    print("🚀 Setting up serverless JIT architecture...")
    print("📝 Note: Update ACCOUNT_ID in the ARNs before running")
    
    # Uncomment when ready to deploy
    # create_lambda_functions()
    # create_eventbridge_rules()
    
    print("✅ Serverless architecture template ready")