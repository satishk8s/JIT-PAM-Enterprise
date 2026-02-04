# JIT ACCESS SYSTEM - COMPLETE PROJECT DOCUMENTATION
# Last Updated: 2025-01-26
# Owner: Satish Korra

## TABLE OF CONTENTS
1. Project Overview
2. System Architecture
3. File Structure & Purpose
4. Technology Stack
5. How Each Component Works
6. AWS Bedrock & Guardrails
7. Current Implementation
8. Planned Improvements
9. Troubleshooting Guide
10. Development Guidelines
11. Deployment Guide
12. Change Log

---

## 1. PROJECT OVERVIEW

### What is JIT Access System?
A web-based tool that provides Just-In-Time (temporary) access to AWS cloud accounts with AI-powered permission generation.

### Key Features
- AI Co-pilot for natural language permission requests
- Temporary access (4 hours to 5 days)
- Approval workflows
- Admin controls and audit logs
- Multi-cloud support (AWS, GCP, Azure, Oracle)
- Integration with JIRA, Slack, ServiceNow

### Business Problem Solved
- Eliminates permanent AWS access
- Reduces security risks
- Provides audit trail
- Simplifies permission management
- Enables self-service access

---

## 2. SYSTEM ARCHITECTURE

### High-Level Architecture
```
User Browser (Frontend)
    ↓ HTTP Requests
Flask Backend (Python)
    ↓ AWS SDK
AWS Services (SSO, Bedrock, DynamoDB)
```

### Component Diagram
```
┌─────────────────────────────────────────┐
│         USER INTERFACE                   │
│  ┌────────────────────────────────┐     │
│  │  HTML: Structure               │     │
│  │  CSS: Styling                  │     │
│  │  JavaScript: Interactions      │     │
│  └────────────────────────────────┘     │
└─────────────────────────────────────────┘
              ↓ API Calls
┌─────────────────────────────────────────┐
│         BACKEND SERVER                   │
│  ┌────────────────────────────────┐     │
│  │  Flask App (app.py)            │     │
│  │  - API Endpoints               │     │
│  │  - Business Logic              │     │
│  │  - AWS Integration             │     │
│  └────────────────────────────────┘     │
└─────────────────────────────────────────┘
              ↓ AWS SDK
┌─────────────────────────────────────────┐
│         AWS SERVICES                     │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │ Bedrock  │ │ IAM/SSO  │ │DynamoDB │ │
│  │   (AI)   │ │(Permissions)│(Storage)│ │
│  └──────────┘ └──────────┘ └─────────┘ │
└─────────────────────────────────────────┘
```

---

## 3. FILE STRUCTURE & PURPOSE

### Current Project Structure
```
/Users/satish.korra/Desktop/sso/
├── frontend/
│   ├── index.html          (1500 lines) - UI structure
│   ├── styles.css          (1200 lines) - Visual styling
│   └── app.js              (2000 lines) - Frontend logic
├── backend/
│   └── app.py              (1800 lines) - Backend API
├── dynamodb_setup.py       - Database setup script
├── scheduler.py            - Auto-cleanup expired access
├── requirements.txt        - Python dependencies
├── README.md               - User guide
├── Dockerfile              - Container configuration
├── k8s-deployment.yaml     - Kubernetes manifests
├── ecs-task-definition.json - ECS configuration
└── deploy.sh               - Deployment script
```

### File Purposes

#### Frontend Files
**index.html** - The Structure
- Purpose: Defines page layout and HTML elements
- Contains: Login page, dashboard, sidebar, modals
- Lines 1-50: HTML setup
- Lines 51-100: Login page
- Lines 101-500: Sidebar navigation
- Lines 501-1000: Page content
- Lines 1001-end: Modal pop-ups

**styles.css** - The Appearance
- Purpose: Makes everything look professional
- Contains: Colors, layouts, animations
- Lines 1-50: Color variables
- Lines 51-200: Login styling
- Lines 201-400: Sidebar & navigation
- Lines 401-800: Cards, tables, forms
- Lines 801-end: Modals & responsive design

**app.js** - The Brain
- Purpose: Makes website interactive
- Contains: User actions, API calls, data management
- Key functions:
  - handleLogin(): User authentication
  - loadAccounts(): Fetch AWS accounts
  - generateAIPermissions(): Call AI
  - handleNewRequest(): Submit access request
  - showPage(): Navigate between pages

#### Backend Files
**app.py** - The Server
- Purpose: Processes requests, talks to AWS
- Contains: API endpoints, AWS integration, business logic
- Key endpoints:
  - /api/accounts: List AWS accounts
  - /api/request-access: Create access request
  - /api/generate-permissions: Call Bedrock AI
  - /api/approve/{id}: Approve request
  - /api/request/{id}/revoke: Revoke access

---

## 4. TECHNOLOGY STACK

### Frontend
- HTML5: Structure
- CSS3: Styling (Blue/Grey theme)
- JavaScript (Vanilla): No frameworks
- Font Awesome: Icons

### Backend
- Python 3.9+
- Flask: Web framework
- Boto3: AWS SDK
- Flask-CORS: Cross-origin requests

### AWS Services
- SSO: User access management
- IAM: Permission sets
- Bedrock: AI (Claude 3 Sonnet)
- DynamoDB: Data storage
- Secrets Manager: Credentials

### Development Tools
- VS Code: Code editor
- Amazon Q Developer: AI coding assistant
- Git: Version control
- Chrome DevTools: Debugging

---

## 5. HOW EACH COMPONENT WORKS

### User Request Flow
```
1. User fills form in browser
   ↓
2. app.js sends POST to /api/request-access
   ↓
3. app.py validates input
   ↓
4. If AI mode: Calls Bedrock
   ↓
5. Creates IAM permission set
   ↓
6. Stores in DynamoDB
   ↓
7. Returns success to frontend
   ↓
8. User sees confirmation
```

### AI Permission Generation Flow
```
1. User input: "I need S3 access"
   ↓
2. app.py validates (AWS keywords check)
   ↓
3. Calls Bedrock with prompt
   ↓
4. Bedrock returns: ["s3:GetObject", "s3:PutObject"]
   ↓
5. app.py creates IAM policy JSON
   ↓
6. Returns to frontend for review
```

---

## 6. AWS BEDROCK & GUARDRAILS

### What is AWS Bedrock?
- AI service from AWS (like ChatGPT)
- Uses Claude 3 Sonnet model
- Converts natural language to AWS permissions

### How Bedrock Works in Our System
```
User: "I need to upload logs to S3"
    ↓
Bedrock AI: Understands intent
    ↓
Output: ["s3:PutObject", "s3:ListBucket"]
    ↓
Backend: Creates IAM policy
```

### Current Bedrock Configuration
- Model: anthropic.claude-3-sonnet-20240229-v1:0
- Region: us-east-1
- Cross-account role: arn:aws:iam::867625663987:role/BedrockCrossAccountRole
- Temperature: 0.1 (deterministic)

### Guardrails Explained

**What are Guardrails?**
Safety rules that prevent AI misuse

**Two Types:**

1. **Bedrock Guardrails** (AWS Service)
   - Set in AWS Console
   - Block specific words
   - Filter sensitive content
   - Limit response length

2. **Code-Level Guardrails** (app.py)
   - Check AWS keywords
   - Block non-AWS requests
   - Validate AI output
   - Reject manipulation attempts

### Current Guardrails Implementation
```python
# Location: app.py, line ~470
def validate_ai_input(use_case):
    # Check 1: Must have AWS keywords
    aws_keywords = ['aws', 's3', 'ec2', 'lambda', ...]
    if not any(keyword in use_case.lower() for keyword in aws_keywords):
        return {"error": "AI only generates AWS permissions"}
    
    # Check 2: Block non-AWS services
    non_aws = ['azure', 'gcp', 'kubernetes', ...]
    for keyword in non_aws:
        if keyword in use_case.lower():
            return {"error": "AI only for AWS"}
    
    return {"valid": True}
```

---

## 7. CURRENT IMPLEMENTATION

### Features Implemented
✅ Login/Logout with session management
✅ Dashboard with statistics
✅ AWS account listing
✅ AI-powered permission generation
✅ Existing permission set selection
✅ Request approval workflow
✅ Admin panel with user management
✅ Access revocation
✅ Audit logging
✅ Dark/Light theme toggle
✅ Responsive mobile design
✅ Multi-email request support
✅ Cloud provider buttons (AWS/GCP/Azure/Oracle)
✅ Integrations page (JIRA, Slack, ServiceNow, SIEM)
✅ Container Access menu item

### Current Limitations
❌ AI sometimes misses intent (e.g., "cleanup" = delete)
❌ No user confirmation before permission generation
❌ Permissions not fully deterministic
❌ Uses resource wildcards (*)
❌ Tag-based EC2 access (too permissive)
❌ No layered intent processing

---

## 8. PLANNED IMPROVEMENTS

### Phase 1: Intent Processing (Week 1 - Priority)
**Problem:** AI misses user intent with different phrasing
- "cleanup logs" should detect DELETE action
- "housekeep logs" should detect DELETE action
- Currently only detects exact keyword "delete"

**Solution: 3-Layer Architecture**

**Layer 1: Intent Processor**
- Separate AI call to understand intent
- Output: Services + Action categories (READ/WRITE/DELETE/LIST/CREATE)
- Uses synonym detection
- Example output:
```json
{
  "services": [{
    "service": "s3",
    "actions": ["WRITE", "DELETE"],
    "reasoning": "User wants to store (WRITE) and cleanup (DELETE) logs"
  }]
}
```

**Layer 2: User Confirmation**
- Show detected actions with checkboxes
- User confirms or modifies
- Block CREATE actions → Redirect to DevOps ticket
- Example UI:
```
S3 Access Detected:
☑ Write/Upload
☑ Delete/Cleanup
☑ List/View
☐ Create (Blocked - Requires DevOps ticket)
```

**Layer 3: Permission Generator**
- Hardcoded permission mappings (NO AI)
- 100% deterministic
- Example mapping:
```python
"s3": {
    "WRITE": ["s3:PutObject"],
    "DELETE": ["s3:DeleteObject"],
    "LIST": ["s3:ListBucket"]
}
```

### Phase 2: Resource Specification (Week 1)
**Problem:** Using resource wildcards (*)

**Solution:**
- Always ask for specific ARNs
- S3: Bucket name required
- EC2: Instance ID or specific tags
- Lambda: Function name required
- Secrets Manager: Secret name required
- Wildcard (*) only as last fallback

### Phase 3: Additional Services (Week 2)
- Database access (MySQL, PostgreSQL, MongoDB)
- Container access (Kubernetes pods, Docker containers)
- CLI access via web terminal
- S3 Explorer integration

### Phase 4: Integrations (Week 3)
- JIRA ticket creation
- Slack notifications
- ServiceNow incidents
- SIEM webhook for audit logs

---

## 9. TROUBLESHOOTING GUIDE

### Quick Diagnosis Steps
```
1. Identify problem area:
   - Frontend? Check browser console (F12)
   - Backend? Check terminal logs
   - AWS? Check credentials and permissions

2. Check basics:
   - Is backend running? curl http://localhost:5000/api/accounts
   - Are AWS credentials valid? aws sts get-caller-identity
   - Is DynamoDB accessible? aws dynamodb list-tables
```

### Common Issues

**Issue 1: AI Not Generating Permissions**
Symptoms: Error message after clicking "Generate AWS Permissions"

Diagnosis:
```bash
# Check AWS credentials
aws sts get-caller-identity

# Check Bedrock access
aws bedrock list-foundation-models --region us-east-1

# Check cross-account role
aws sts assume-role --role-arn arn:aws:iam::867625663987:role/BedrockCrossAccountRole --role-session-name test
```

Solutions:
- Update AWS credentials: `aws configure`
- Verify Bedrock role in app.py line ~450
- Check guardrails not too strict (app.py line ~470)

**Issue 2: User Not Getting Access**
Symptoms: Request approved but user can't access AWS

Diagnosis:
```bash
# Check permission set created
aws sso-admin list-permission-sets --instance-arn arn:aws:sso:::instance/ssoins-65955f0870d9f06f

# Check user assignment
aws sso-admin list-account-assignments --instance-arn arn:aws:sso:::instance/ssoins-65955f0870d9f06f --account-id 332463837037
```

Solutions:
- Wait 5-10 minutes for SSO sync
- Check user email format (try both @nykaa.com and @Nykaa.local)
- Manually create permission set in AWS Console if needed

**Issue 3: Frontend Not Loading**
Symptoms: Blank page in browser

Diagnosis:
- Check browser console (F12) for errors
- Verify backend running: `curl http://localhost:5000/api/accounts`
- Check CORS enabled in app.py

Solutions:
- Start backend: `python3 app.py`
- Add CORS: `from flask_cors import CORS; CORS(app)`
- Check for JavaScript syntax errors in app.js

**Issue 4: DynamoDB Connection Failed**
Symptoms: Can't save or load requests

Diagnosis:
```bash
# Check table exists
aws dynamodb list-tables

# Test write access
aws dynamodb put-item --table-name jit_requests --item '{"id": {"S": "test"}}'
```

Solutions:
- Create tables: `python3 dynamodb_setup.py`
- Check AWS credentials have DynamoDB permissions
- Verify region is correct (ap-south-1)

---

## 10. DEVELOPMENT GUIDELINES

### Code Principles
1. **Simplicity First**: Keep functions small (max 50 lines)
2. **Clear Naming**: Function names describe what they do
3. **Comments for Complex Logic**: Explain WHY, not WHAT
4. **Error Handling**: Always handle errors gracefully

### File Organization
- Keep all HTML in index.html
- Keep all CSS in styles.css
- Keep all JS in app.js
- Reason: Easier to search for non-developers

### Design System
**Colors (Light Mode):**
- Primary: #4A90E2 (Blue)
- Background: #f5f7fa (Light Grey)
- Text: #2c3e50 (Dark Grey)

**Colors (Dark Mode):**
- Primary: #5DADE2 (Light Blue)
- Background: #1a1a1a (Black)
- Text: #ffffff (White)

**Spacing:**
- Small: 0.5rem (8px)
- Medium: 1rem (16px)
- Large: 1.5rem (24px)

### Using AI for Code Changes

**Good Prompt:**
```
Add a 'Revoke Access' button in the requests table,
last column, only for approved requests,
calls revokeAccess(requestId) function,
use red color (#dc3545) for danger action
```

**Bad Prompt:**
```
Add a button
```

### Testing Checklist
- [ ] Login with valid/invalid credentials
- [ ] Request access with AI
- [ ] Request access with existing permissions
- [ ] Approve/deny requests
- [ ] Revoke active access
- [ ] Test mobile view
- [ ] Test dark mode

---

## 11. DEPLOYMENT GUIDE

### Local Development
```bash
# Backend
cd /Users/satish.korra/Desktop/sso
python3 app.py
# Runs on http://localhost:5000

# Frontend (separate terminal)
cd frontend
python3 -m http.server 8000
# Access at http://localhost:8000
```

### Production Deployment Options

**Option 1: ECS Fargate (Recommended)**
- Cost: ~$15-30/month
- Complexity: Low
- Scalability: Auto-scaling
- Setup: Use ecs-task-definition.json

**Option 2: EC2 Instance**
- Cost: ~$10-20/month
- Complexity: Medium
- Scalability: Manual
- Setup: Install Python, run app.py

**Option 3: EKS (Advanced)**
- Cost: ~$75/month
- Complexity: High
- Scalability: Kubernetes
- Setup: Use k8s-deployment.yaml

### Deployment Steps (ECS)
```bash
1. Build Docker image
   docker build -t jit-access .

2. Push to ECR
   aws ecr create-repository --repository-name jit-access
   docker tag jit-access:latest <ecr-url>/jit-access:latest
   docker push <ecr-url>/jit-access:latest

3. Create ECS cluster
   aws ecs create-cluster --cluster-name jit-cluster

4. Register task definition
   aws ecs register-task-definition --cli-input-json file://ecs-task-definition.json

5. Create service
   aws ecs create-service --cluster jit-cluster --service-name jit-service --task-definition jit-access --desired-count 1
```

---

## 12. CHANGE LOG

### 2025-01-26
- Added Container Access menu item
- Updated cloud provider buttons with brand colors
- Changed account listing to table format
- Updated Integrations page with 5 items
- Created comprehensive documentation

### 2025-01-25
- Replaced horizontal navigation with sidebar
- Added 11 menu items with icons
- Implemented professional blue/grey color scheme
- Added coming soon placeholders

### 2025-01-24
- Added Request for Others modal with multi-email support
- Implemented AI disclaimer box
- Fixed modal overlay z-index issues

### 2025-01-23
- Added admin dashboard with charts
- Implemented user analytics
- Added manual onboarding feature

### 2025-01-22
- Integrated AWS Bedrock for AI permissions
- Added service-specific configuration
- Implemented tag-based EC2 access

### 2025-01-21
- Initial project setup
- Created frontend structure
- Implemented backend API
- Integrated AWS SSO

---

## APPENDIX A: AWS CONFIGURATION

### SSO Configuration
- Instance ARN: arn:aws:sso:::instance/ssoins-65955f0870d9f06f
- Identity Store ID: d-9f677136b2
- Region: ap-south-1

### Bedrock Configuration
- Model: anthropic.claude-3-sonnet-20240229-v1:0
- Region: us-east-1
- Cross-account role: arn:aws:iam::867625663987:role/BedrockCrossAccountRole

### DynamoDB Tables
- jit_requests: Stores access requests
- jit_audit_logs: Stores audit trail

### Admin Users
- satish.korra@nykaa.com
- admin@nykaa.com
- security@nykaa.com

---

## APPENDIX B: API ENDPOINTS

### Public Endpoints
- GET /api/accounts - List AWS accounts
- GET /api/permission-sets - List permission sets
- POST /api/request-access - Create access request
- POST /api/generate-permissions - Generate AI permissions

### Protected Endpoints (Requires Auth)
- GET /api/requests - List user requests
- GET /api/request/{id} - Get request details
- POST /api/approve/{id} - Approve request
- POST /api/request/{id}/revoke - Revoke access
- DELETE /api/request/{id}/delete - Delete request (Admin only)

### Admin Endpoints
- POST /api/cleanup/old-requests - Cleanup old requests
- POST /api/cleanup/expired - Revoke expired access
- GET /api/admin/users - List all users
- POST /api/admin/onboard - Manual user onboarding

---

## APPENDIX C: SECURITY BEST PRACTICES

### Input Validation
- Always validate user input on backend
- Sanitize SQL queries
- Escape HTML output
- Validate file uploads

### AWS Credentials
- Never commit credentials to Git
- Use IAM roles instead of access keys
- Rotate credentials regularly
- Use least privilege principle

### Session Management
- 30-minute inactivity timeout
- Secure session cookies
- HTTPS only in production
- CSRF protection enabled

### Audit Logging
- Log all access requests
- Log all approvals/denials
- Log all revocations
- Log all errors

---

END OF DOCUMENTATION
