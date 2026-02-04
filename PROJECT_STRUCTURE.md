# SSO Project Structure

**Version:** 1.0 (Locked)  
**Last Updated:** December 2024  
**Status:** Production Ready

---

## 📁 Root Directory

```
/Users/satish.korra/Desktop/sso/
```

---

## 🗂️ Main Folders

### 1. `/backend/` - Backend Server & Business Logic
**Purpose:** Flask-based REST API server handling all business logic, AWS integrations, and AI processing

**Key Files:**
- `app.py` - Main Flask application with all API endpoints
- `conversation_manager.py` - AI conversation handler using AWS Bedrock Claude 3 Sonnet
- `database_manager.py` - SQLite database operations for users, requests, policies
- `scp_manager.py` - Service Control Policy (SCP) management and validation
- `guardrails_generator.py` - Dynamic guardrails generation for AWS permissions
- `enforcement_engine.py` - Policy enforcement and validation logic
- `terminal_server.py` - WebSocket server for EC2 terminal access via SSM
- `help_assistant.py` - AI-powered help assistant using Bedrock
- `vault_manager.py` - Secrets management integration
- `user_sync_engine.py` - User synchronization from AD/Identity Center/Okta

**Configuration Files:**
- `bedrock_config.json` - AWS Bedrock AI configuration
- `guardrails_config.json` - Permission guardrails and restrictions
- `policy_config.json` - Policy templates and configurations
- `access_rules.json` - Access control rules
- `org_policies.json` - Organization-level policies
- `org_users.json` - Organization users data
- `user_groups.json` - User groups configuration
- `.env` - Environment variables (AWS credentials, secrets)

**Database:**
- `sso.db` - Main SQLite database (users, requests, policies, approvals)

**Dependencies:**
- `requirements.txt` - Python package dependencies

---

### 2. `/frontend/` - User Interface
**Purpose:** HTML/CSS/JavaScript frontend for user interactions

**Main File:**
- `index.html` - Single-page application with all UI sections

**JavaScript Modules:**
- `aws-permissions-chat.js` - AI chat interface for permission generation
- `policy-builder.js` - Visual policy builder interface
- `instances.js` - EC2 instances management and terminal access
- `databases.js` - RDS/DynamoDB database management
- `s3-explorer.js` - S3 bucket explorer with file operations
- `guardrails.js` - Guardrails configuration UI
- `scp-manager.js` - SCP management interface
- `scp-troubleshoot.js` - SCP troubleshooting tool
- `admin-functions.js` - Admin panel functionality
- `org-management.js` - Organization and user management
- `security-management.js` - Security settings and configurations
- `help-assistant.js` - Help assistant chat interface
- `calendar.js` - Request calendar and scheduling
- `drafts-manager.js` - Request drafts management
- `wizard.js` - Step-by-step request wizard
- `policy-modal.js` - Policy preview and editing modal
- `delete-permissions.js` - Permission deletion handling
- `access-rules.js` - Access rules management
- `account-tagging.js` - AWS account tagging
- `ai-config.js` - AI configuration interface
- `feature-management.js` - Feature toggles management

**Styling:**
- `styles.css` - Main application styles
- `dark-theme-fix.css` - Dark theme adjustments
- `instances.css` - EC2 instances page styles
- `s3-explorer.css` - S3 explorer styles
- `calendar.css` - Calendar component styles
- `toggle-switch.css` - Toggle switch component styles

**Assets:**
- `/assets/logos/` - Company and service logos

---

## 🔧 Configuration Files (Root)

- `.env` - Root environment configuration
- `.gitignore` - Git ignore rules
- `requirements.txt` - Root Python dependencies

---

## 📚 Documentation Files

### Architecture & Design
- `ARCHITECTURE_PRINCIPLES.md` - System architecture and design principles
- `PROJECT_DOCUMENTATION.md` - Complete project documentation
- `JIT_Access_System_v1.md` - JIT Access System specifications
- `minimal_services_comparison.md` - Service comparison analysis

### Features & Guides
- `DEMO_READY.md` - Demo preparation guide
- `TESTING_GUIDE.md` - Testing procedures and scenarios
- `QUICK_TEST.md` - Quick testing checklist
- `bedrock_setup_guide.md` - AWS Bedrock setup instructions
- `SCP_FEATURE.md` - Service Control Policy feature documentation
- `GUARDRAILS_AND_POLICIES.txt` - Guardrails implementation details
- `STRICT_RULES.md` - Strict policy enforcement rules

### Development & Fixes
- `FIXES_APPLIED.md` - Applied fixes and patches
- `GUARDRAILS_FIX.md` - Guardrails-specific fixes
- `AI_COMPARISON.md` - AI implementation comparison
- `future-enhancements.md` - Planned enhancements
- `test-flow.md` - Testing flow documentation

### Project Management
- `PROJECT_CHECKLIST.md` - Project completion checklist
- `README.md` - Project overview and setup instructions

---

## 🚀 Deployment Files

- `deploy.sh` - Deployment script
- `setup.sh` - Initial setup script
- `start-frontend.sh` - Frontend startup script
- `setup_cron.sh` - Cron job setup
- `Dockerfile` - Docker container configuration
- `docker-compose.yml` - Docker Compose configuration (if exists)
- `k8s-deployment.yaml` - Kubernetes deployment configuration
- `ecs-task-definition.json` - AWS ECS task definition

---

## 🧪 Testing & Setup Scripts

- `test_sso.py` - SSO system tests
- `test_bedrock_poc.py` - Bedrock AI proof of concept tests
- `dynamodb_setup.py` - DynamoDB table setup
- `aws-infrastructure-setup.py` - AWS infrastructure provisioning
- `create_bedrock_role_mumbai.py` - Bedrock IAM role creation (Mumbai region)
- `setup_bedrock_role.py` - Bedrock role setup
- `update_bedrock_config.py` - Bedrock configuration updater
- `scheduler.py` - Background job scheduler

---

## 🖼️ Assets & Images

- `aws-logo.png` - AWS logo
- `Amazon-Simple-Storage-Service-S3_Bucket-with-Objects_dark-bg.png` - S3 icon
- `aws-rds-logo-png-transparent.png` - RDS logo
- `s3-icon-20.jpg` - S3 icon
- `docker.png` - Docker logo
- `Kubernetes-Logo.wine.png` - Kubernetes logo
- `GCP.png` - Google Cloud Platform logo
- `microsoft_azure-logo_brandlogos.net_mlyt6-512x512.png` - Azure logo
- `slack.png` - Slack logo
- `Jira-Logo-Transparent.png` - Jira logo
- Various other service logos

---

## 🔒 Security & Sensitive Files

**⚠️ NEVER COMMIT TO GIT:**
- `.env` - Contains AWS credentials and secrets
- `backend/.env` - Backend environment variables
- `*.db` - Database files with user data
- `*.log` - Log files with sensitive information

---

## 🎯 Key Features by File

### AI-Powered Permission Generation
- **Frontend:** `aws-permissions-chat.js`
- **Backend:** `conversation_manager.py`
- **Config:** `bedrock_config.json`

### Policy Management
- **Frontend:** `policy-builder.js`, `policy-modal.js`
- **Backend:** `database_manager.py`, `enforcement_engine.py`
- **Config:** `policy_config.json`

### EC2 Terminal Access
- **Frontend:** `instances.js`
- **Backend:** `terminal_server.py`

### S3 File Explorer
- **Frontend:** `s3-explorer.js`, `s3-explorer.css`
- **Backend:** `app.py` (S3 endpoints)

### Guardrails & SCP
- **Frontend:** `guardrails.js`, `scp-manager.js`, `scp-troubleshoot.js`
- **Backend:** `guardrails_generator.py`, `scp_manager.py`
- **Config:** `guardrails_config.json`

### Admin Panel
- **Frontend:** `admin-functions.js`, `org-management.js`, `security-management.js`
- **Backend:** `app.py` (admin endpoints)

### Help Assistant
- **Frontend:** `help-assistant.js`
- **Backend:** `help_assistant.py`

---

## 📊 Database Schema (sso.db)

**Tables:**
- `users` - User accounts and profiles
- `access_requests` - Permission requests
- `policies` - IAM policies
- `approvals` - Request approval workflow
- `audit_logs` - System audit trail
- `groups` - User groups
- `sessions` - User sessions

---

## 🌐 API Endpoints (Backend)

**Base URL:** `http://127.0.0.1:5000`

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

### Terminal
- WebSocket: `ws://127.0.0.1:5001` - EC2 terminal connection

---

## 🔄 Data Flow

1. **User Request Flow:**
   ```
   User (Frontend) → AI Chat → Bedrock API → Backend → Database → Approval Workflow
   ```

2. **Permission Generation:**
   ```
   User Input → conversation_manager.py → AWS Bedrock → Guardrails Check → Policy JSON
   ```

3. **Terminal Access:**
   ```
   Frontend → WebSocket → terminal_server.py → AWS SSM → EC2 Instance
   ```

---

## 🛠️ Technology Stack

**Frontend:**
- HTML5, CSS3, JavaScript (Vanilla)
- Font Awesome icons
- WebSocket for terminal

**Backend:**
- Python 3.x
- Flask (REST API)
- Flask-SocketIO (WebSocket)
- Boto3 (AWS SDK)
- SQLite (Database)

**AWS Services:**
- Bedrock (AI - Claude 3 Sonnet)
- IAM (Identity & Access Management)
- SSM (Systems Manager - Terminal)
- S3, EC2, RDS, DynamoDB
- Organizations (SCP)

---

## 📝 Important Notes

1. **Backup Created:** `sso_backup_YYYYMMDD_HHMMSS.tar.gz` in Desktop folder
2. **Code Status:** LOCKED - No modifications without explicit approval
3. **Environment:** Development/Testing on localhost
4. **Database:** SQLite (consider PostgreSQL for production)
5. **AI Model:** AWS Bedrock Claude 3 Sonnet (ap-south-1 region)

---

## 🚨 Critical Files - DO NOT MODIFY

- `backend/app.py` - Core API logic
- `backend/conversation_manager.py` - AI conversation engine
- `frontend/index.html` - Main UI structure
- `frontend/aws-permissions-chat.js` - AI chat interface
- `backend/sso.db` - Production database

---

## 📞 Support & Maintenance

For any changes or issues, refer to this document first.
All modifications must be documented and backed up.

---

**END OF STRUCTURE DOCUMENT**
