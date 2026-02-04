# AWS Bedrock Setup for AI Responses

The Database AI Assistant (and other AI features) use **AWS Bedrock** for responses. You need to configure AWS credentials for it to work.

---

## Option 1: Environment Variables (Recommended)

Set these before starting the backend:

```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_DEFAULT_REGION=ap-south-1
```

Or add to a `.env` file (if using python-dotenv):

```
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_DEFAULT_REGION=ap-south-1
```

---

## Option 2: AWS CLI Profile

If you use `aws configure`:

```bash
aws configure
# Enter: Access Key, Secret Key, Region (ap-south-1)
```

The backend will use the default profile automatically.

---

## Option 3: IAM Role (EC2/ECS/Lambda)

If the app runs on AWS (EC2, ECS, Lambda), attach an IAM role with Bedrock permissions. No credentials needed in code.

---

## Required IAM Permission

The credentials must have:

```json
{
  "Effect": "Allow",
  "Action": "bedrock:InvokeModel",
  "Resource": "arn:aws:bedrock:ap-south-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0"
}
```

---

## Verify Setup

1. Start the backend: `python app.py`
2. Go to Databases → Request Access
3. In the AI Assistant box, type: "What roles are available?"
4. If configured correctly, you'll get an AI response explaining the 4 roles

---

## If AI Fails

- **"AI chat error"** or no response: Check credentials and IAM permissions
- **Region**: Database AI uses `ap-south-1`. Ensure Bedrock is available in that region
- **Fallback**: The app will show an error; users can still request access and select roles manually
