import boto3
import json
import openai
from datetime import datetime

class AIPermissionGenerator:
    def __init__(self):
        self.bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')
        # Alternative: self.openai_client = openai.OpenAI(api_key="your-key")
        
    def generate_permissions_from_description(self, user_description, account_type='non-prod'):
        """Convert natural language to AWS permissions"""
        
        prompt = f"""
        You are an AWS security expert. Convert this user request into minimal AWS IAM permissions.
        
        User Request: "{user_description}"
        Account Type: {account_type}
        
        Common mappings:
        - "connect to EC2" → ec2:DescribeInstances, ssm:StartSession
        - "download S3 files" → s3:GetObject, s3:ListBucket
        - "upload S3 files" → s3:PutObject, s3:ListBucket
        - "check CloudWatch logs" → logs:DescribeLogGroups, logs:FilterLogEvents
        - "view RDS databases" → rds:DescribeDBInstances
        - "restart services" → ec2:RebootInstances, ecs:UpdateService
        
        Return ONLY a JSON object with this structure:
        {{
            "permissions": [
                {{
                    "service": "ec2",
                    "actions": ["DescribeInstances", "StartInstances"],
                    "resources": ["*"]
                }},
                {{
                    "service": "s3", 
                    "actions": ["GetObject"],
                    "resources": ["arn:aws:s3:::my-bucket/*"]
                }}
            ],
            "suggested_name": "EC2-S3-Access-{datetime.now().strftime('%Y%m%d')}",
            "risk_level": "low|medium|high"
        }}
        """
        
        try:
            # Using AWS Bedrock (Claude)
            response = self.bedrock.invoke_model(
                modelId='anthropic.claude-3-sonnet-20240229-v1:0',
                body=json.dumps({
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 1000,
                    "messages": [{"role": "user", "content": prompt}]
                })
            )
            
            result = json.loads(response['body'].read())
            ai_response = result['content'][0]['text']
            
            # Parse JSON from AI response
            permissions_data = json.loads(ai_response)
            return permissions_data
            
        except Exception as e:
            print(f"AI generation failed: {e}")
            return self._fallback_permissions(user_description)
    
    def _fallback_permissions(self, description):
        """Fallback mapping when AI fails"""
        description_lower = description.lower()
        
        if 'ec2' in description_lower or 'instance' in description_lower:
            return {
                "permissions": [{"service": "ec2", "actions": ["DescribeInstances"], "resources": ["*"]}],
                "suggested_name": "EC2-ReadOnly",
                "risk_level": "low"
            }
        elif 's3' in description_lower:
            return {
                "permissions": [{"service": "s3", "actions": ["GetObject", "ListBucket"], "resources": ["*"]}],
                "suggested_name": "S3-ReadOnly", 
                "risk_level": "low"
            }
        else:
            return {
                "permissions": [{"service": "*", "actions": ["List*", "Describe*", "Get*"], "resources": ["*"]}],
                "suggested_name": "ReadOnly-Access",
                "risk_level": "low"
            }
    
    def create_iam_policy_document(self, permissions_data):
        """Convert AI output to IAM policy"""
        statements = []
        
        for perm in permissions_data['permissions']:
            statement = {
                "Effect": "Allow",
                "Action": [f"{perm['service']}:{action}" for action in perm['actions']],
                "Resource": perm['resources']
            }
            statements.append(statement)
        
        policy_document = {
            "Version": "2012-10-17",
            "Statement": statements
        }
        
        return json.dumps(policy_document, indent=2)
    
    def create_dynamic_permission_set(self, sso_instance_arn, permissions_data):
        """Create new permission set with AI-generated permissions"""
        sso_admin = boto3.client('sso-admin')
        
        try:
            # Create permission set
            response = sso_admin.create_permission_set(
                InstanceArn=sso_instance_arn,
                Name=permissions_data['suggested_name'],
                Description=f"AI-generated permissions - Risk: {permissions_data['risk_level']}",
                SessionDuration='PT8H'  # 8 hours
            )
            
            permission_set_arn = response['PermissionSet']['PermissionSetArn']
            
            # Attach inline policy
            policy_document = self.create_iam_policy_document(permissions_data)
            
            sso_admin.put_inline_policy_to_permission_set(
                InstanceArn=sso_instance_arn,
                PermissionSetArn=permission_set_arn,
                InlinePolicy=policy_document
            )
            
            return {
                'success': True,
                'permission_set_arn': permission_set_arn,
                'name': permissions_data['suggested_name'],
                'risk_level': permissions_data['risk_level']
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}

# Usage Example
def process_ai_request(user_description, user_email, account_id, duration_hours):
    """Main function to process AI-powered access request"""
    
    ai_generator = AIPermissionGenerator()
    
    # Step 1: Generate permissions from description
    permissions_data = ai_generator.generate_permissions_from_description(user_description)
    
    # Step 2: Create dynamic permission set
    sso_instance_arn = 'arn:aws:sso:::instance/ssoins-65955f0870d9f06f'
    result = ai_generator.create_dynamic_permission_set(sso_instance_arn, permissions_data)
    
    if result['success']:
        # Step 3: Create access request with new permission set
        access_request = {
            'user_email': user_email,
            'account_id': account_id,
            'permission_set': result['permission_set_arn'],
            'permission_set_name': result['name'],
            'duration_hours': duration_hours,
            'ai_generated': True,
            'risk_level': result['risk_level'],
            'original_description': user_description
        }
        
        return access_request
    else:
        return {'error': result['error']}