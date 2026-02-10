# Frontend - User Interface

## Purpose
HTML/CSS/JavaScript single-page application providing user interface for JIT access management, AI-powered permission generation, and AWS resource management.

## Main File

- **index.html** - Single-page application with all UI sections (Dashboard, Workloads, Admin Panel, etc.)

## JavaScript Modules

### AI & Permissions
- **aws-permissions-chat.js** - AI chat interface for natural language permission generation
- **policy-builder.js** - Visual policy builder interface
- **policy-modal.js** - Policy preview and editing modal
- **conversation.js** - Conversation management utilities

### Resource Management
- **instances.js** - EC2 instances management and terminal access
- **databases.js** - RDS/DynamoDB database management
- **s3-explorer.js** - S3 bucket explorer with file operations

### Security & Compliance
- **guardrails.js** - Guardrails configuration UI
- **scp-manager.js** - Service Control Policy management interface
- **scp-troubleshoot.js** - SCP troubleshooting tool
- **security-management.js** - Security settings and configurations
- **access-rules.js** - Access rules management

### Admin & Organization
- **admin-functions.js** - Admin panel functionality
- **org-management.js** - Organization and user management
- **account-tagging.js** - AWS account tagging

### Request Management
- **calendar.js** - Request calendar and scheduling
- **drafts-manager.js** - Request drafts management
- **request-drafts.js** - Draft request handling
- **wizard.js** - Step-by-step request wizard
- **delete-permissions.js** - Permission deletion handling

### Configuration
- **ai-config.js** - AI configuration interface
- **policy-config.js** - Policy configuration management
- **policy-toggles.js** - Policy feature toggles
- **feature-management.js** - Feature toggles management

### Help & Support
- **help-assistant.js** - AI-powered help assistant chat interface

## Styling

### Main Styles
- **styles.css** - Main application styles (layout, components, themes)
- **dark-theme-fix.css** - Dark theme adjustments and fixes

### Component Styles
- **instances.css** - EC2 instances page specific styles
- **s3-explorer.css** - S3 explorer specific styles
- **calendar.css** - Calendar component styles
- **toggle-switch.css** - Toggle switch component styles

## Assets

- **/assets/logos/** - Company and service logos

## Key Features

### 1. AI Permission Chat
**Files:** `aws-permissions-chat.js`, `index.html`
- Natural language permission generation
- Real-time policy preview
- Multi-service support
- Conversation history

### 2. EC2 Terminal Access
**Files:** `instances.js`, `instances.css`
- WebSocket-based terminal
- AWS SSM Session Manager integration
- Instance management

### 3. S3 File Explorer
**Files:** `s3-explorer.js`, `s3-explorer.css`
- Browse S3 buckets and objects
- Upload/download files
- File operations (delete, copy)

### 4. Policy Builder
**Files:** `policy-builder.js`, `policy-modal.js`
- Visual policy creation
- JSON preview
- Template support

### 5. Admin Panel
**Files:** `admin-functions.js`, `org-management.js`
- User management (CRUD)
- Group management (tiles view)
- Organization settings
- Sync from AD/Identity Center/Okta

### 6. Guardrails Management
**Files:** `guardrails.js`
- Service restrictions
- Delete/Create restrictions
- Custom guardrails

### 7. SCP Management
**Files:** `scp-manager.js`, `scp-troubleshoot.js`
- View organization SCPs
- Troubleshoot permission denials
- SCP impact analysis

## UI Sections (index.html)

1. **Dashboard** - Overview and quick actions
2. **My Requests** - User's access requests
3. **Workloads** - AWS resources (EC2, RDS, S3, DynamoDB)
4. **Admin Panel** - Administration (Users, Policies, Security, Management)
5. **Help** - AI-powered help assistant

## Navigation Structure

### Admin Panel Tabs
- **Users & Groups** - User and group management
- **Policies** - Policy templates and builder
- **Security** - Guardrails and access rules
- **Management** - Organization settings and sync

### Management Sub-Tabs
- **Users & Groups** - Groups (tiles) + Users (table)
- **Sync** - AD/Identity Center/Okta integration
- **Policies** - Policy builder

## Theme Support

- Light theme (default)
- Dark theme with fixes (`dark-theme-fix.css`)
- Theme toggle in UI

## Browser Compatibility

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Development Notes

- Vanilla JavaScript (no frameworks)
- Modular architecture
- Event-driven design
- WebSocket for real-time features

## API Integration

All modules connect to backend API at: `http://127.0.0.1:5000`

## Hard Refresh Required

After code changes: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)

## Status

✅ Production Ready - Code Locked
