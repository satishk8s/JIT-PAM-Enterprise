<<<<<<< HEAD
# JIT-For-everything
=======
# JIT Access System

AI-powered Just-In-Time access management for AWS SSO with approval workflows.

## Features
- AI-generated AWS IAM permissions using Bedrock
- AWS SSO integration
- Approval workflows
- Admin panel with analytics
- Service-specific configurations

## Quick Start
```bash
# Backend
pip install -r requirements.txt
python app.py

# Frontend
Open frontend/index.html in browser
```

## Production Deployment
- Use `aws-infrastructure-setup.py` for AWS resources
- Use `dynamodb_setup.py` for DynamoDB tables
- Configure Secrets Manager with your SSO details

## Configuration
Update these in your environment:
- SSO Instance ARN
- Identity Store ID
- Bedrock Cross-Account Role ARN
>>>>>>> f98743f (Initial commit: JIT Access System with AI-powered AWS permissions)
