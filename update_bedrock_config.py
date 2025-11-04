#!/usr/bin/env python3
"""
Update backend with Bedrock cross-account configuration
Run this after setting up Bedrock in POC account
"""

def update_backend_config():
    print("🔧 Bedrock Configuration Update")
    print("=" * 40)
    
    poc_account_id = input("Enter your POC Account ID: ").strip()
    role_arn = input("Enter the full Role ARN from POC account: ").strip()
    
    if not poc_account_id or not role_arn:
        print("❌ Both Account ID and Role ARN are required")
        return
    
    # Read current backend
    with open('/Users/satish.korra/Desktop/sso/backend/app.py', 'r') as f:
        content = f.read()
    
    # Update the role ARN
    updated_content = content.replace(
        "RoleArn='arn:aws:iam::BEDROCK_ACCOUNT_ID:role/BedrockCrossAccountRole'",
        f"RoleArn='{role_arn}'"
    )
    
    # Also add external ID for security
    updated_content = updated_content.replace(
        "RoleSessionName='JITAccessBedrock'",
        "RoleSessionName='JITAccessBedrock',\n            ExternalId='JITAccessBedrock'"
    )
    
    # Write updated backend
    with open('/Users/satish.korra/Desktop/sso/backend/app.py', 'w') as f:
        f.write(updated_content)
    
    print(f"✅ Updated backend with POC Account: {poc_account_id}")
    print(f"✅ Updated Role ARN: {role_arn}")
    print("\n🚀 Ready to test AI permissions!")
    print("Restart your backend: python backend/app.py")

if __name__ == "__main__":
    update_backend_config()