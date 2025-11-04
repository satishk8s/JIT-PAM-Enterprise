#!/usr/bin/env python3
"""
Run this script in your Bedrock account to create the cross-account role
"""
import boto3
import json

# Replace with your management account ID
MANAGEMENT_ACCOUNT_ID = "767398039045"

def create_bedrock_role():
    iam = boto3.client('iam')
    
    # Trust policy - allows management account to assume this role
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "AWS": f"arn:aws:iam::{MANAGEMENT_ACCOUNT_ID}:root"
                },
                "Action": "sts:AssumeRole",
                "Condition": {
                    "StringEquals": {
                        "sts:ExternalId": "JITAccessBedrock"
                    }
                }
            }
        ]
    }
    
    # Permission policy - minimal Bedrock access
    bedrock_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "bedrock:InvokeModel"
                ],
                "Resource": [
                    "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0"
                ]
            }
        ]
    }
    
    try:
        # Create role
        role_response = iam.create_role(
            RoleName='BedrockCrossAccountRole',
            AssumeRolePolicyDocument=json.dumps(trust_policy),
            Description='Cross-account role for JIT access system to use Bedrock'
        )
        
        print(f"✅ Created role: {role_response['Role']['Arn']}")
        
        # Create and attach policy
        policy_response = iam.create_policy(
            PolicyName='BedrockInvokePolicy',
            PolicyDocument=json.dumps(bedrock_policy),
            Description='Minimal Bedrock access for JIT system'
        )
        
        iam.attach_role_policy(
            RoleName='BedrockCrossAccountRole',
            PolicyArn=policy_response['Policy']['Arn']
        )
        
        print(f"✅ Created and attached policy: {policy_response['Policy']['Arn']}")
        print(f"\n🔧 Update your backend code with this role ARN:")
        print(f"RoleArn='{role_response['Role']['Arn']}'")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    print("Setting up Bedrock cross-account role...")
    create_bedrock_role()