# Bedrock Setup Guide for POC Account

## Step 1: Enable Bedrock Service

1. **Login to your POC AWS Account**
2. **Go to Amazon Bedrock Console**
   - Navigate to: https://console.aws.amazon.com/bedrock/
   - Select region: **ap-south-1** (Mumbai) - same as your SSO region

3. **Test Model Access (Auto-enabled)**
   - Go to "Playgrounds" → "Chat"
   - Select **Anthropic Claude 3 Sonnet** model
   - Type a test message like "Hello"
   - If it works, you're ready! If not, you may need to submit use case details for Anthropic models

## Step 2: Create Cross-Account IAM Role

1. **In your POC account, go to IAM Console**
2. **Create a new role:**
   - Click "Roles" → "Create role"
   - Select "AWS account" as trusted entity
   - Enter your **Management Account ID**: `767398039045`
   - Check "Require external ID" and enter: `JITAccessBedrock`
   - Click "Next"

3. **Create custom policy:**
   - Click "Create policy"
   - Select JSON tab and paste:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "bedrock:InvokeModel"
         ],
         "Resource": [
           "arn:aws:bedrock:ap-south-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0"
         ]
       }
     ]
   }
   ```
   - Name it: `BedrockInvokePolicy`
   - Click "Create policy"

4. **Attach policy to role:**
   - Go back to role creation
   - Search and select `BedrockInvokePolicy`
   - Click "Next"
   - Role name: `BedrockCrossAccountRole`
   - Description: `Cross-account role for JIT access system to use Bedrock`
   - Click "Create role"

5. **Copy the Role ARN** - you'll need this for the next step

## Step 3: Update Backend Code

Replace `BEDROCK_ACCOUNT_ID` in your backend with your POC account ID.

## Step 4: Test Bedrock Access

Run this test script in your POC account to verify Bedrock works:

```python
import boto3
import json

bedrock = boto3.client('bedrock-runtime', region_name='ap-south-1')

response = bedrock.invoke_model(
    modelId='anthropic.claude-3-sonnet-20240229-v1:0',
    body=json.dumps({
        'anthropic_version': 'bedrock-2023-05-31',
        'max_tokens': 100,
        'messages': [{'role': 'user', 'content': 'Hello, can you help me?'}]
    })
)

result = json.loads(response['body'].read())
print(result['content'][0]['text'])
```

## Troubleshooting

- **Model access denied**: Wait longer for approval or check model access page
- **Region issues**: Make sure you're using ap-south-1 (Mumbai)
- **Cross-account issues**: Verify the trust policy has correct account ID and external ID