from flask import Flask, request, jsonify
from flask_cors import CORS
import boto3
import json
from datetime import datetime, timedelta
import uuid
import os
from decimal import Decimal
from boto3.dynamodb.conditions import Key

app = Flask(__name__)
CORS(app)

# DynamoDB setup
dynamodb = boto3.resource('dynamodb', region_name='ap-south-1')
requests_table = dynamodb.Table('JITAccessRequests')
approvals_table = dynamodb.Table('JITAccessApprovals')

# Load config from Secrets Manager
def load_config():
    secrets_client = boto3.client('secretsmanager', region_name='ap-south-1')
    try:
        response = secrets_client.get_secret_value(SecretId='jit-access-config')
        return json.loads(response['SecretString'])
    except Exception as e:
        print(f"Error loading config: {e}")
        # Fallback config
        return {
            'sso_instance_arn': 'arn:aws:sso:::instance/ssoins-65955f0870d9f06f',
            'identity_store_id': 'd-9f677136b2',
            'sso_start_url': 'https://nykaa.awsapps.com/start'
        }

CONFIG = load_config()

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

@app.route('/api/requests', methods=['GET'])
def get_requests():
    try:
        response = requests_table.scan()
        items = response['Items']
        
        # Convert Decimal to float for JSON serialization
        for item in items:
            for key, value in item.items():
                if isinstance(value, Decimal):
                    item[key] = float(value)
        
        return json.dumps(items, cls=DecimalEncoder)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/request-access', methods=['POST'])
def request_access():
    data = request.json
    request_id = str(uuid.uuid4())
    
    # Validate duration (max 5 days)
    if data['duration_hours'] > 120:
        return jsonify({'error': 'Maximum duration is 5 days (120 hours)'}), 400
    
    # Handle custom dates
    if 'custom_start_date' in data and 'custom_end_date' in data:
        start_date = datetime.fromisoformat(data['custom_start_date'].replace('Z', '+00:00'))
        end_date = datetime.fromisoformat(data['custom_end_date'].replace('Z', '+00:00'))
        
        if (end_date - start_date) > timedelta(days=5):
            return jsonify({'error': 'Maximum duration is 5 days'}), 400
        
        if start_date <= datetime.now():
            return jsonify({'error': 'Start date must be in the future'}), 400
        
        expires_at = end_date.isoformat()
        created_at = start_date.isoformat()
    else:
        created_at = datetime.now().isoformat()
        expires_at = (datetime.now() + timedelta(hours=data['duration_hours'])).isoformat()
    
    # Create request item
    access_request = {
        'request_id': request_id,
        'user_email': data['user_email'],
        'account_id': data['account_id'],
        'duration_hours': Decimal(str(data['duration_hours'])),
        'justification': data['justification'],
        'status': 'pending',
        'created_at': created_at,
        'expires_at': expires_at,
        'approval_required': ['self']  # Simplified for demo
    }
    
    # Handle AI-generated permissions
    if 'use_case' in data:
        from app import generate_ai_permissions, enhance_permissions_with_resources
        
        permissions = generate_ai_permissions(data['use_case'])
        if 'error' in permissions:
            return jsonify({'error': f"AI generation failed: {permissions['error']}"}), 400
        
        # Enhance with resource constraints
        ec2_tags = data.get('ec2_tags')
        s3_bucket = data.get('s3_bucket')
        secret_name = data.get('secret_name')
        
        if ec2_tags or s3_bucket or secret_name:
            permissions = enhance_permissions_with_resources(permissions, ec2_tags, s3_bucket, secret_name)
        
        access_request.update({
            'ai_generated': True,
            'use_case': data['use_case'],
            'ai_permissions': permissions,
            'permission_set': 'AI_GENERATED'
        })
        
        if ec2_tags: access_request['ec2_tags'] = ec2_tags
        if s3_bucket: access_request['s3_bucket'] = s3_bucket
        if secret_name: access_request['secret_name'] = secret_name
    else:
        access_request.update({
            'permission_set': data['permission_set'],
            'ai_generated': False
        })
    
    # Store in DynamoDB
    try:
        requests_table.put_item(Item=access_request)
        return jsonify({'request_id': request_id, 'status': 'submitted'})
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@app.route('/api/request/<request_id>/delete', methods=['DELETE'])
def delete_request(request_id):
    try:
        # Delete from requests table
        requests_table.delete_item(Key={'request_id': request_id})
        
        # Delete associated approvals
        approvals_response = approvals_table.query(
            KeyConditionExpression=Key('request_id').eq(request_id)
        )
        
        for approval in approvals_response['Items']:
            approvals_table.delete_item(
                Key={
                    'request_id': request_id,
                    'approver_role': approval['approver_role']
                }
            )
        
        return jsonify({
            'status': 'deleted',
            'message': f'✅ Request {request_id[:8]}... deleted successfully'
        })
        
    except Exception as e:
        return jsonify({'error': f'Delete failed: {str(e)}'}), 500

@app.route('/api/cleanup/expired', methods=['POST'])
def cleanup_expired():
    """Endpoint for scheduler to clean up expired access"""
    try:
        now = datetime.now().isoformat()
        
        # Scan for expired approved requests
        response = requests_table.scan(
            FilterExpression='#status = :status AND expires_at < :now',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={':status': 'approved', ':now': now}
        )
        
        revoked_count = 0
        for item in response['Items']:
            # Update status to revoked
            requests_table.update_item(
                Key={'request_id': item['request_id']},
                UpdateExpression='SET #status = :status, revoked_at = :revoked_at, revoke_reason = :reason',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': 'revoked',
                    ':revoked_at': now,
                    ':reason': 'Automatic expiration - JIT access expired'
                }
            )
            revoked_count += 1
        
        return jsonify({
            'revoked_count': revoked_count,
            'message': f'Revoked {revoked_count} expired access grants'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cleanup/old-requests', methods=['POST'])
def cleanup_old_requests():
    """Clean up requests older than 3 days with inactive status"""
    try:
        cutoff_date = (datetime.now() - timedelta(days=3)).isoformat()
        
        # Scan for old pending/denied requests
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
            # Delete old request
            requests_table.delete_item(Key={'request_id': item['request_id']})
            cleaned_count += 1
        
        return jsonify({
            'cleaned_count': cleaned_count,
            'message': f'Cleaned up {cleaned_count} old inactive requests'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)  # Different port for production