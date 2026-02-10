# JIT Access System (NPAMX)

AI-powered Just-In-Time access management for AWS SSO with approval workflows.

## Quick Start (clone and run)

```bash
git clone <repo-url>
cd JIT-PAM-Enterprise
./run.sh
```

That's it. The script will:
- Create a Python virtual environment (if needed)
- Install dependencies
- Start backend (port 5000) and frontend (port 3000)
- Open http://localhost:3000 in your browser

Press **Ctrl+C** to stop.

## Features

- AI-generated AWS IAM permissions using Bedrock
- AWS SSO integration
- Approval workflows
- Admin panel with analytics
- Service-specific configurations

## Production Deployment

- Use `aws-infrastructure-setup.py` for AWS resources
- Use `dynamodb_setup.py` for DynamoDB tables
- Configure Secrets Manager with your SSO details

## Configuration

Update these in your environment:
- SSO Instance ARN
- Identity Store ID
- Bedrock Cross-Account Role ARN
