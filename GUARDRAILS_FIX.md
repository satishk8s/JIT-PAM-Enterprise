# Guardrails Generator Fix

## Issue
Bedrock credentials expired, causing guardrails generator to fail silently.

## Solution
Enhanced keyword-based fallback parser to handle team-based restrictions.

---

## Test Guardrails Generator

### Example 1: Networking Team Restriction
**Input:**
```
Deny networking team from placing requests for any actions except network-related actions
```

**Expected Output:**
- Custom Guardrail: "Networking Team can only access network-related services"
- Service Restrictions: Block S3, RDS, Lambda, DynamoDB, KMS, Secrets Manager, IAM
- Allow: EC2, VPC, Load Balancers

### Example 2: Production KMS Deletion
**Input:**
```
Block all delete operations on production KMS keys
```

**Expected Output:**
- Delete Restriction: KMS in prod environment

### Example 3: Secrets Manager Access
**Input:**
```
Block access to Secrets Manager for all teams
```

**Expected Output:**
- Service Restriction: secretsmanager blocked

---

## How to Test

1. Refresh browser
2. Go to Admin → Security → Guardrails
3. Click "Generate with AI"
4. Enter requirement: "deny networking team from placing requests except network related"
5. Enter MFA: 123456
6. Click "Generate"
7. Check generated guardrails

---

## Keyword Patterns Supported

### Team Detection:
- "networking team"
- "security team"
- "devops team"

### Action Detection:
- "deny", "block", "restrict" → Block access
- "delete", "deletion" → Delete restriction
- "create", "creation" → Create restriction

### Exception Patterns:
- "except network related" → Allow only network services
- "only for" → Restrict to specific services

### Service Mapping:
- "network", "networking", "vpc" → EC2, VPC, Load Balancers
- "kms", "encryption keys" → KMS
- "secrets manager", "secrets" → Secrets Manager
- "s3", "buckets" → S3
- "rds", "databases" → RDS

### Environment:
- "production", "prod" → prod
- "non-prod", "nonprod", "dev" → nonprod
- Not specified → all

---

## Generated Guardrails Structure

```json
{
  "serviceRestrictions": [
    {
      "service": "s3",
      "action": "block",
      "reason": "Networking Team restricted to network services only"
    }
  ],
  "deleteRestrictions": [
    {
      "service": "kms",
      "environment": "prod",
      "reason": "Delete operations on kms blocked"
    }
  ],
  "createRestrictions": [],
  "customGuardrails": [
    {
      "rule": "Networking Team can only access network-related services",
      "description": "Restrict Networking Team to VPC, EC2 networking, and Load Balancers only",
      "enforcement": "Block all non-network service requests"
    }
  ]
}
```

---

## Bedrock Credentials Update (Optional)

If you want to use Bedrock AI instead of keyword fallback:

1. Get new SSO temp credentials:
```bash
aws sso login --profile your-profile
aws configure export-credentials --profile your-profile
```

2. Update `backend/bedrock_config.json`:
```json
{
  "enabled": true,
  "aws_region": "ap-south-1",
  "model_id": "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "aws_access_key_id": "NEW_ACCESS_KEY",
  "aws_secret_access_key": "NEW_SECRET_KEY",
  "aws_session_token": "NEW_SESSION_TOKEN",
  "max_tokens": 1000,
  "temperature": 0.3
}
```

3. Restart backend:
```bash
lsof -ti:5000 | xargs kill -9
cd /Users/satish.korra/Desktop/sso/backend
python3 app.py
```

---

## Files Modified

1. `/Users/satish.korra/Desktop/sso/backend/guardrails_generator.py`
   - Enhanced `_parse_keywords()` method
   - Added team-based restriction detection
   - Added network service filtering
   - Added custom guardrails generation

---

## Verification

After testing, you should see in backend logs:
```
✅ Generated guardrails: 7 service, 0 delete, 0 create, 1 custom
```

And in the UI, the guardrails should populate with:
- 7 service restrictions (S3, RDS, Lambda, DynamoDB, KMS, Secrets Manager, IAM)
- 1 custom guardrail (Networking Team restriction)
