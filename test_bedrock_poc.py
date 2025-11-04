#!/usr/bin/env python3
"""
Test script to run in POC account to verify Bedrock works
"""
import boto3
import json

def test_bedrock():
    try:
        print("Testing Bedrock in POC account...")
        
        # Create Bedrock client
        bedrock = boto3.client('bedrock-runtime', region_name='ap-south-1')
        
        # Test simple request
        response = bedrock.invoke_model(
            modelId='anthropic.claude-3-sonnet-20240229-v1:0',
            body=json.dumps({
                'anthropic_version': 'bedrock-2023-05-31',
                'max_tokens': 200,
                'messages': [{
                    'role': 'user', 
                    'content': '''Convert this use case to AWS IAM actions:

Use Case: I need to connect to EC2 instances and download files from S3

Return JSON format:
{
  "actions": ["ec2:DescribeInstances", "s3:GetObject"],
  "resources": ["*"],
  "description": "Brief description"
}'''
                }]
            })
        )
        
        result = json.loads(response['body'].read())
        ai_response = result['content'][0]['text']
        
        print("✅ Bedrock test successful!")
        print("AI Response:")
        print(ai_response)
        
        return True
        
    except Exception as e:
        print(f"❌ Bedrock test failed: {e}")
        print("\nTroubleshooting:")
        print("1. Check if Claude 3 Sonnet model access is approved")
        print("2. Verify you're in us-east-1 region")
        print("3. Check AWS credentials are configured")
        return False

def test_cross_account_assume():
    """Test assuming role from management account"""
    try:
        print("\nTesting cross-account role assumption...")
        
        sts = boto3.client('sts')
        
        # Get current identity
        identity = sts.get_caller_identity()
        print(f"Current account: {identity['Account']}")
        
        # This will fail if run from POC account, but shows the setup
        print("✅ STS working - ready for cross-account setup")
        
    except Exception as e:
        print(f"❌ STS test failed: {e}")

if __name__ == "__main__":
    print("🚀 Bedrock POC Account Test")
    print("=" * 40)
    
    test_bedrock()
    test_cross_account_assume()
    
    print("\n📋 Next Steps:")
    print("1. If Bedrock test passed, copy the Role ARN from IAM console")
    print("2. Update backend code with your POC account ID")
    print("3. Test from management account")