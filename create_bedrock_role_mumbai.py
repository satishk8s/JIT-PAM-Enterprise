#!/usr/bin/env python3
"""
Run this in your POC account to create the cross-account role for Mumbai
"""
import boto3
import json

MANAGEMENT_ACCOUNT_ID = "767398039045"

def create_role():
    iam = boto3.client('iam')
    
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"AWS": f"arn:aws:iam::{MANAGEMENT_ACCOUNT_ID}:root"},
            "Action": "sts:AssumeRole",
            "Condition": {"StringEquals": {"sts:ExternalId": "JITAccessBedrock"}}
        }]
    }
    
    bedrock_policy = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": ["bedrock:InvokeModel"],
            "Resource": ["arn:aws:bedrock:ap-south-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0"]
        }]
    }
    
    try:
        # Create role
        role = iam.create_role(
            RoleName='BedrockCrossAccountRole',
            AssumeRolePolicyDocument=json.dumps(trust_policy),
            Description='Cross-account Bedrock access for JIT system'
        )
        
        # Create and attach policy
        policy = iam.create_policy(
            PolicyName='BedrockInvokePolicy',
            PolicyDocument=json.dumps(bedrock_policy)
        )
        
        iam.attach_role_policy(
            RoleName='BedrockCrossAccountRole',
            PolicyArn=policy['Policy']['Arn']
        )
        
        print(f"✅ Role created: {role['Role']['Arn']}")
        print(f"✅ Policy attached: {policy['Policy']['Arn']}")
        print(f"\n🔧 Copy this Role ARN for your backend:")
        print(f"{role['Role']['Arn']}")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    create_role()