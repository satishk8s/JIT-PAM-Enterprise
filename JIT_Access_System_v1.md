# JIT Access Management System - Architecture & Implementation Plan
## Version 1.0

---

## 1. Executive Summary

The Just-In-Time (JIT) Access Management System is a comprehensive privileged access management solution that provides temporary, audited access to AWS resources with AI-powered permission generation and strict policy enforcement.

### Key Capabilities
- **AI-Powered Permission Generation**: Natural language to IAM policy conversion
- **Strict Policy Enforcement**: Zero-tolerance security controls with configurable toggles
- **Multi-Cloud Ready**: AWS (implemented), Azure/GCP (planned)
- **Automated Workflows**: Request → Approval → Grant → Revoke lifecycle
- **Comprehensive Audit**: Full activity logging and SIEM integration

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                           │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────────┐  │
│  │Dashboard │Requests  │Instances │Terminal  │Admin Panel   │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend API Layer                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Flask REST API (Python)                                   │  │
│  │ - Request Management    - AI Permission Generator         │  │
│  │ - Approval Workflows    - Policy Enforcement Engine       │  │
│  │ - User Management       - Audit Logger                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Integration Layer                             │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────────┐  │
│  │AWS SSO   │Bedrock AI│Identity  │Resource  │Organizations │  │
│  │          │          │Store     │Groups    │              │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AWS Resources                               │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────────┐  │
│  │EC2       │S3        │Lambda    │RDS       │20+ Services  │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Details

#### Frontend (HTML/CSS/JavaScript)
- **Technology**: Vanilla JavaScript, no frameworks
- **Pages**: 
  - Dashboard (metrics, recent activity)
  - My Requests (request management)
  - Instances (EC2 access requests)
  - Terminal (approved instance connections)
  - Admin Panel (6 tabs: Dashboard, Users & Groups, Management, Features, Security, Integrations)
- **Theme**: Light/Dark mode support
- **Security**: No npm dependencies (security concern addressed)

#### Backend (Python Flask)
- **Framework**: Flask with CORS
- **Key Modules**:
  - `app.py`: Main API endpoints
  - `strict_policies.py`: Policy enforcement rules
  - `ai_validator.py`: AI output validation
  - `intent_classifier.py`: User intent detection
  - `enforcement_engine.py`: Organizational policy enforcement
  - `user_sync_engine.py`: Identity provider sync

#### AWS Integration
- **AWS SSO**: Permission set creation and assignment
- **Identity Store**: User/group management
- **Bedrock AI**: Claude 3 Sonnet for permission generation
- **Resource Groups API**: Dynamic service discovery
- **Organizations**: Account structure and tagging
- **Systems Manager**: EC2 instance access

---

## 3. Core Features

### 3.1 AI-Powered Permission Generation

**Workflow:**
1. User describes what they need in natural language
2. System validates input for prompt injection
3. AI (Bedrock Claude) or rule-based engine generates IAM actions
4. Strict validator checks output against policies
5. Permissions displayed for user review

**Example:**
```
Input: "I need to cleanup old lambda functions"
Output: 
- lambda:ListFunctions
- lambda:GetFunction
- lambda:DeleteFunction (if delete toggle enabled)
```

**Security Layers:**
1. Input validation (prompt injection detection)
2. Non-AWS request filtering
3. Intent classification (infrastructure vs access)
4. AI output validation
5. Policy toggle enforcement
6. Duration limits

### 3.2 Request Wizard (2-Step Flow)

**Step 1: Cloud Provider Selection**
- AWS (implemented)
- Azure, GCP, Oracle (UI ready, backend planned)

**Step 2: AWS Resource Selection**
- Account dropdown (with environment tags)
- Permission sets dropdown (existing or AI-generated)
- Service selection (EC2, S3, Lambda, RDS, etc.)
- Resource configuration (tags, bucket names, etc.)
- AI Copilot section (natural language input)

### 3.3 Policy Enforcement Engine

**Configurable Toggles (Admin Panel → Management Tab):**

1. **Delete & Destructive Actions**
   - NonProd: ON/OFF
   - Prod: ON/OFF
   - Controls: Delete, Terminate, Destroy actions

2. **Create Actions**
   - NonProd: ON/OFF
   - Prod: ON/OFF
   - Controls: Create, Launch, RunInstances actions

3. **Admin Actions**
   - NonProd: ON/OFF
   - Prod: ON/OFF
   - Sandbox: ON/OFF
   - Controls: Admin, Full Access, Wildcard permissions

**Enforcement Logic:**
```
IF user requests delete action
  AND account environment = prod
  AND allow_delete_prod = False
THEN block request with error message
```

### 3.4 Account Management

**Account Tagging:**
- Manual: Admin tags each account (prod/nonprod/sandbox)
- Automatic: Sync from AWS OU structure
- Environment determines which policy toggles apply

**Account Discovery:**
- Syncs from AWS Organizations
- Displays in Management tab
- Admin can set environment, JIT requirement, max duration

### 3.5 EC2 Instance Access

**Features:**
- Select multiple instances
- Request for self or others
- Sudo access option (requires security approval)
- Duration: 1-8 hours
- Connection methods:
  - AWS Session Manager (browser-based)
  - SSH Terminal (embedded with xterm.js)

**Backend:**
- Creates temporary users via SSM Run Command
- Auto-cleanup on expiration
- Background thread removes expired users

### 3.6 Approval Workflows

**Approval Types:**
- Self-approval (for read/limited write)
- Manager approval (for write operations)
- Security lead approval (for prod read-only)
- Manager + Security approval (for sudo access)

**Status Flow:**
```
Pending → Approved → Active → Expired/Revoked
```

---

## 4. Security Controls

### 4.1 Strict Policies (Always Enforced)

**ALWAYS_FORBIDDEN_ACTIONS:**
- Wildcard permissions (*)
- IAM user/role creation
- IAM policy attachment
- Organizations access
- Account management
- Privilege escalation (sts:AssumeRole)
- Infrastructure creation (RunInstances, CreateDBInstance)
- Critical deletions (DeleteBucket, DeleteTable, ScheduleKeyDeletion)

**FORBIDDEN_KEYWORDS:**
- "full access", "all permissions", "*:*"
- "create user", "create role", "delete user", "delete role"
- "attach policy", "assume role"
- "bypass", "override", "ignore policy", "disable security"

### 4.2 Configurable Policies (Toggle-Based)

**Delete Actions:**
- s3:DeleteObject, s3:DeleteObjectVersion
- lambda:DeleteFunction
- ec2:TerminateInstances
- logs:DeleteLogGroup
- elasticloadbalancing:DeleteLoadBalancer
- And more...

**Create Actions:**
- ec2:RunInstances
- rds:CreateDBInstance
- lambda:CreateFunction
- And more...

**Admin Actions:**
- Any action containing "Admin", "Full", "*"

### 4.3 Secrets Manager Protection

**Special Rule:**
- Wildcard (*) resources NOT allowed
- Must specify exact secret name/ARN
- Example: `arn:aws:secretsmanager:region:account:secret:MySecret-*`

### 4.4 Duration Limits

**Maximum Duration by Environment:**
- Production: 8 hours
- Non-production: 120 hours (5 days)
- Sandbox: 168 hours (7 days)

### 4.5 Audit & Monitoring

**Logged Events:**
- All access requests (who, what, when, why)
- AI permission generation (input, output, risk score)
- Approval actions
- Access grants/revocations
- Policy violations
- Anomalous activity

**Anomaly Detection:**
- Requests outside business hours
- High-risk permissions
- Production account access
- Multiple requests in short time
- Triggers admin alerts

---

## 5. Admin Panel Features

### 5.1 Dashboard Tab
- New users (last 30 days)
- Repeated users (>3 requests)
- Exceptional users (admin permissions)
- Pending approvals count
- Weekly activity chart
- Request types breakdown

### 5.2 Users & Groups Tab
- User management (create, edit, sync)
- Group management with permissions
- Manual onboarding
- Identity provider sync (AWS Identity Center, Active Directory)

### 5.3 Management Tab
- **Accounts Section**: Tag accounts, set JIT requirements, max duration
- **Restricted Actions Control**: 
  - Delete & Destructive Actions toggles
  - Create Actions toggles
  - Admin Actions toggles
- **Sync from OU**: Auto-tag accounts from AWS Organizations structure

### 5.4 Features Tab
- Enable/disable features per organization
- Request new features
- License management

### 5.5 Security Tab
- Audit logs with filtering
- Export audit logs (JSON)
- Cleanup old requests
- Revoke expired access
- SIEM integration

### 5.6 Integrations Tab
- Cloud providers (AWS, Azure, GCP)
- Identity providers (Google Workspace, Azure AD, Okta)
- Ticketing systems (JIRA, ServiceNow)
- Monitoring (Splunk, Grafana)

---

## 6. Implementation Status

### 6.1 Completed Features ✅

**Core Functionality:**
- ✅ AI permission generation (Bedrock + fallback)
- ✅ Request wizard (2-step flow)
- ✅ Approval workflows
- ✅ AWS SSO integration
- ✅ Permission set creation
- ✅ Account assignment
- ✅ Access revocation

**Security:**
- ✅ Strict policy enforcement
- ✅ Policy toggles (Delete/Create/Admin)
- ✅ AI output validation
- ✅ Intent classification
- ✅ Prompt injection detection
- ✅ Duration limits
- ✅ Secrets Manager protection

**AWS Services:**
- ✅ EC2 (with tag-based access)
- ✅ S3 (bucket + prefix)
- ✅ Lambda
- ✅ RDS
- ✅ CloudWatch Logs
- ✅ Secrets Manager
- ✅ Load Balancers (ALB/NLB)
- ✅ DynamoDB, SNS, SQS, EKS, ECS, KMS

**EC2 Instance Access:**
- ✅ Instance selection
- ✅ Sudo access option
- ✅ SSM user creation
- ✅ Session Manager connection
- ✅ SSH terminal (xterm.js)
- ✅ Auto-cleanup on expiration

**Admin Features:**
- ✅ 6-tab admin panel
- ✅ Account tagging (manual + OU sync)
- ✅ Policy toggles
- ✅ User management
- ✅ Audit logs
- ✅ Analytics dashboard

**UI/UX:**
- ✅ Dark/Light theme
- ✅ Modern SaaS design
- ✅ Responsive layout
- ✅ No npm dependencies

### 6.2 Planned Features 🔄

**Multi-Cloud:**
- 🔄 Azure integration
- 🔄 GCP integration
- 🔄 Oracle Cloud integration

**Advanced Features:**
- 🔄 Scheduled access (future date/time)
- 🔄 Recurring access patterns
- 🔄 Break-glass emergency access
- 🔄 MFA enforcement
- 🔄 IP whitelisting
- 🔄 Geolocation restrictions

**Integrations:**
- 🔄 JIRA ticket integration
- 🔄 Slack/Teams notifications
- 🔄 PagerDuty integration
- 🔄 Splunk SIEM forwarding
- 🔄 ServiceNow integration

**Reporting:**
- 🔄 Compliance reports
- 🔄 Access analytics
- 🔄 Cost tracking
- 🔄 Risk scoring

---

## 7. Deployment Architecture

### 7.1 Current Setup (POC)

```
Frontend: Static files (HTML/CSS/JS)
Backend: Flask (localhost:5000)
Database: In-memory (requests_db, approvals_db)
AWS: Single POC account (867625663987)
```

### 7.2 Production Deployment Plan

```
┌─────────────────────────────────────────────────────────┐
│                    Load Balancer (ALB)                   │
└─────────────────────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Frontend    │ │  Frontend    │ │  Frontend    │
│  (S3+CF)     │ │  (S3+CF)     │ │  (S3+CF)     │
└──────────────┘ └──────────────┘ └──────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              API Gateway / ALB                           │
└─────────────────────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Backend     │ │  Backend     │ │  Backend     │
│  (ECS/EKS)   │ │  (ECS/EKS)   │ │  (ECS/EKS)   │
└──────────────┘ └──────────────┘ └──────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  RDS         │ │  ElastiCache │ │  S3 (Audit)  │
│  (Postgres)  │ │  (Redis)     │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
```

**Components:**
- **Frontend**: S3 + CloudFront (static hosting)
- **Backend**: ECS Fargate or EKS (containerized)
- **Database**: RDS PostgreSQL (requests, approvals, audit)
- **Cache**: ElastiCache Redis (session, config)
- **Storage**: S3 (audit logs, exports)
- **Monitoring**: CloudWatch + X-Ray
- **Secrets**: Secrets Manager (API keys, credentials)

### 7.3 High Availability

- Multi-AZ deployment
- Auto-scaling (2-10 instances)
- Health checks
- Automated failover
- Backup and disaster recovery

---

## 8. Security Best Practices

### 8.1 Authentication & Authorization
- AWS SSO integration
- MFA enforcement
- Role-based access control (RBAC)
- Session timeout (8 hours)

### 8.2 Data Protection
- Encryption at rest (RDS, S3)
- Encryption in transit (TLS 1.3)
- Secrets in AWS Secrets Manager
- No credentials in code

### 8.3 Network Security
- VPC with private subnets
- Security groups (least privilege)
- NACLs
- WAF on ALB/CloudFront
- DDoS protection (Shield)

### 8.4 Audit & Compliance
- CloudTrail logging
- VPC Flow Logs
- Application logs to CloudWatch
- SIEM integration
- Compliance reports (SOC2, ISO27001)

---

## 9. API Endpoints

### 9.1 Core APIs

**Accounts & Permissions:**
- `GET /api/accounts` - List AWS accounts
- `GET /api/permission-sets` - List permission sets
- `POST /api/generate-permissions` - AI permission generation
- `GET /api/discover-services` - Discover AWS services
- `GET /api/resources/<service>` - Get service resources

**Request Management:**
- `POST /api/request-access` - Submit access request
- `GET /api/requests` - List all requests
- `GET /api/request/<id>` - Get request details
- `POST /api/request/<id>/modify` - Modify request
- `DELETE /api/request/<id>/delete` - Delete request
- `POST /api/request/<id>/revoke` - Revoke access
- `POST /api/approve/<id>` - Approve request

**Instance Access:**
- `GET /api/instances` - List EC2 instances
- `POST /api/instances/request-access` - Request instance access
- `GET /api/instances/approved` - Get approved instances
- `POST /api/instances/start-session` - Start SSM session

**Admin:**
- `GET /api/admin/users` - List users
- `POST /api/admin/create-user` - Create user
- `POST /api/admin/create-group` - Create group
- `GET /api/admin/audit-logs` - Get audit logs
- `GET /api/admin/analytics` - Get analytics
- `POST /api/admin/sync-users` - Sync from identity provider
- `PUT /api/admin/account/<id>/tag` - Tag account
- `POST /api/admin/sync-accounts-from-ou` - Sync from OU

**Policy Management:**
- `GET /api/admin/policy-settings` - Get policy settings
- `POST /api/admin/delete-permissions-policy` - Update delete policy
- `POST /api/admin/create-permissions-policy` - Update create policy
- `POST /api/admin/admin-permissions-policy` - Update admin policy

---

## 10. Configuration Files

### 10.1 Backend Configuration

**strict_policies.py:**
- ALWAYS_FORBIDDEN_ACTIONS
- CONFIGURABLE_DELETE_ACTIONS
- FORBIDDEN_KEYWORDS
- MAX_DURATION limits
- Policy configuration storage

**org_policies.json:**
- Organizational policies per account/environment/role
- Custom approval workflows
- Resource restrictions

### 10.2 Frontend Configuration

**styles.css:**
- Modern card-based layouts
- Gradient badges
- Light/dark theme variables

**dark-theme-fix.css:**
- Comprehensive dark mode fixes
- CSS variables with !important flags

---

## 11. Testing Strategy

### 11.1 Unit Tests
- Policy enforcement logic
- AI validator
- Intent classifier
- Permission generator

### 11.2 Integration Tests
- AWS SSO integration
- Bedrock AI calls
- Identity Store sync
- Resource discovery

### 11.3 Security Tests
- Prompt injection attempts
- Policy bypass attempts
- Privilege escalation tests
- Input validation

### 11.4 User Acceptance Tests
- Request workflows
- Approval flows
- Admin operations
- UI/UX validation

---

## 12. Monitoring & Alerting

### 12.1 Metrics
- Request volume
- Approval latency
- AI generation success rate
- Policy violation count
- Active access sessions

### 12.2 Alerts
- Failed access grants
- Policy violations
- Anomalous activity
- System errors
- High request volume

### 12.3 Dashboards
- Real-time request status
- User activity heatmap
- Service usage breakdown
- Security incidents

---

## 13. Disaster Recovery

### 13.1 Backup Strategy
- Database: Daily automated backups (7-day retention)
- Audit logs: S3 with versioning and lifecycle
- Configuration: Version controlled in Git

### 13.2 Recovery Procedures
- RTO (Recovery Time Objective): 1 hour
- RPO (Recovery Point Objective): 15 minutes
- Automated failover to standby region
- Runbook for manual recovery

---

## 14. Cost Optimization

### 14.1 AWS Services Cost
- Bedrock AI: Pay per token (~$0.003/1K tokens)
- SSO: Free (included with AWS Organizations)
- ECS Fargate: ~$50-200/month (2-4 tasks)
- RDS: ~$100-300/month (db.t3.medium)
- S3: ~$10-50/month (audit logs)
- CloudWatch: ~$20-50/month (logs, metrics)

**Estimated Monthly Cost: $200-600**

### 14.2 Optimization Strategies
- Use Bedrock fallback to rule-based generator
- Cache permission sets in Redis
- Compress audit logs
- Use S3 Intelligent-Tiering
- Right-size RDS instances

---

## 15. Roadmap

### Phase 1 (Current - v1.0) ✅
- AWS SSO integration
- AI permission generation
- Policy enforcement
- EC2 instance access
- Admin panel

### Phase 2 (Q2 2025) 🔄
- Multi-cloud support (Azure, GCP)
- Advanced approval workflows
- JIRA integration
- Slack notifications
- Compliance reports

### Phase 3 (Q3 2025) 🔄
- Break-glass access
- Risk-based authentication
- ML-based anomaly detection
- Cost tracking
- Self-service portal enhancements

### Phase 4 (Q4 2025) 🔄
- Kubernetes RBAC integration
- Database access management
- Application access (Jenkins, Grafana, etc.)
- Mobile app
- API marketplace

---

## 16. Support & Maintenance

### 16.1 Support Tiers
- **L1**: User queries, password resets
- **L2**: Access issues, approval workflows
- **L3**: System errors, AWS integration issues
- **L4**: Architecture changes, security incidents

### 16.2 Maintenance Windows
- Weekly: Sunday 2-4 AM (minor updates)
- Monthly: First Sunday 2-6 AM (major updates)
- Emergency: As needed with 1-hour notice

---

## 17. Compliance & Governance

### 17.1 Compliance Standards
- SOC 2 Type II
- ISO 27001
- GDPR (data privacy)
- HIPAA (if handling PHI)
- PCI DSS (if handling payment data)

### 17.2 Governance
- Quarterly security reviews
- Annual penetration testing
- Monthly policy updates
- Continuous audit logging

---

## 18. Contact & Escalation

### 18.1 Team Contacts
- **DevOps Team**: devops@company.com
- **Security Team**: security@company.com
- **CISO**: ciso@company.com
- **Support**: support@company.com

### 18.2 Escalation Matrix
1. User → Manager (approval required)
2. Manager → Security Lead (prod access)
3. Security Lead → CISO (policy violations)
4. CISO → Executive Team (security incidents)

---

## Document Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-01 | System | Initial architecture document |

---

**End of Document**
