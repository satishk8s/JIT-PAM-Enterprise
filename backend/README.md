# Backend - Flask REST API Server

## Purpose
Flask-based REST API server handling all business logic, AWS integrations, AI processing, and database operations.

## Core Files

### Main Application
- **app.py** - Main Flask application with all API endpoints (authentication, permissions, resources, admin)

### AI & Conversation
- **conversation_manager.py** - AI conversation handler using AWS Bedrock Claude 3 Sonnet for natural language permission generation
- **help_assistant.py** - AI-powered help assistant for user guidance

### Database
- **database_manager.py** - SQLite database operations (users, requests, policies, approvals, audit logs)
- **sso.db** - Main SQLite database file

### Policy & Security
- **scp_manager.py** - Service Control Policy (SCP) management and validation
- **guardrails_generator.py** - Dynamic guardrails generation for AWS permissions
- **enforcement_engine.py** - Policy enforcement and validation logic
- **access_rules.py** - Access control rules engine

### Infrastructure
- **terminal_server.py** - WebSocket server for EC2 terminal access via AWS SSM
- **vault_manager.py** - Secrets management integration
- **user_sync_engine.py** - User synchronization from AD/Identity Center/Okta

## Configuration Files

- **bedrock_config.json** - AWS Bedrock AI configuration (model, region, parameters)
- **guardrails_config.json** - Permission guardrails and restrictions
- **policy_config.json** - Policy templates and configurations
- **access_rules.json** - Access control rules
- **org_policies.json** - Organization-level policies
- **org_users.json** - Organization users data
- **user_groups.json** - User groups configuration
- **.env** - Environment variables (AWS credentials, secrets) - NEVER COMMIT

## Dependencies

Install via: `pip install -r requirements.txt`

Key packages:
- Flask - Web framework
- Flask-CORS - Cross-origin resource sharing
- Flask-SocketIO - WebSocket support
- boto3 - AWS SDK
- sqlite3 - Database

## Running the Server

```bash
cd backend
python app.py
```

Server runs on: `http://127.0.0.1:5000`
Terminal WebSocket: `ws://127.0.0.1:5001`

## API Endpoints

### Authentication
- `POST /api/login` - User login
- `POST /api/logout` - User logout
- `POST /api/register` - User registration

### Permissions
- `POST /api/generate-permissions` - AI permission generation
- `POST /api/submit-request` - Submit access request
- `GET /api/requests` - Get user requests
- `POST /api/approve-request` - Approve request

### Resources
- `GET /api/ec2-instances` - List EC2 instances
- `GET /api/rds-instances` - List RDS instances
- `GET /api/s3-buckets` - List S3 buckets
- `GET /api/dynamodb-tables` - List DynamoDB tables

### Admin
- `GET /api/admin/users` - List all users
- `POST /api/admin/create-user` - Create user
- `GET /api/admin/guardrails` - Get guardrails
- `POST /api/admin/guardrails` - Update guardrails

### SCP
- `GET /api/scp/policies` - List SCP policies
- `POST /api/scp/validate` - Validate against SCP

## Environment Variables (.env)

```
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_DEFAULT_REGION=ap-south-1
FLASK_SECRET_KEY=your_secret_key
```

## Database Schema

**Tables:**
- users - User accounts
- access_requests - Permission requests
- policies - IAM policies
- approvals - Approval workflow
- audit_logs - Audit trail
- groups - User groups
- sessions - User sessions

## Logs

- **app.log** - Application logs
- **backend.log** - Backend operations
- **flask.log** - Flask server logs

## Security Notes

- Never commit .env file
- Database contains sensitive user data
- AWS credentials must be properly secured
- All API endpoints should validate user permissions

## Status

✅ Production Ready - Code Locked
