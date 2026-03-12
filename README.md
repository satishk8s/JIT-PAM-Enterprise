# Nykaa PAM – JIT Access System

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
cd backend && pip install -r requirements.txt && python app.py

# Frontend
Open frontend/index.html in browser (or serve via nginx; see scripts/configure-nginx-git.sh)
```

## Production Deployment
- Set env from `scripts/npamx.env.example` (e.g. `/etc/npamx/npamx.env`)
- Use `scripts/setup-auto-deploy.sh` on EC2; nginx via `scripts/configure-nginx-git.sh`
- Use `scripts/setup-auto-deploy.sh` on EC2; nginx via `scripts/configure-nginx-git.sh`

## Configuration
Update these in your environment:
- SSO Instance ARN, Identity Store ID
- Vault (VAULT_ADDR, VAULT_ROLE_ID, VAULT_SECRET_ID)
- APP_BASE_URL, CORS_ORIGINS, FLASK_SECRET_KEY for production
