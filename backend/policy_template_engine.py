# Policy Template Engine - Organization-specific privilege configurations

import json
from datetime import datetime

class PolicyTemplateEngine:
    """
    Manages organization-specific policy templates
    Each org can define their own privilege levels and rules
    """
    
    # In-memory storage (replace with database in production)
    TEMPLATES = {}
    
    @staticmethod
    def create_template(org_id, template_config):
        """
        Create a new policy template for an organization
        
        template_config structure:
        {
            "name": "DevOps L2 Access",
            "levels": {
                "L1": {
                    "name": "Read-Only",
                    "allowed_actions": ["Describe*", "List*", "Get*"],
                    "denied_actions": ["*"],
                    "allowed_services": ["ec2", "s3", "rds", "lambda"],
                    "max_duration_hours": 8,
                    "requires_approval": False,
                    "approval_chain": ["self"]
                },
                "L2": {
                    "name": "Limited Write",
                    "allowed_actions": ["ec2:StartInstances", "ec2:StopInstances", "s3:PutObject", "logs:GetLogEvents"],
                    "denied_actions": ["*Delete*", "*Create*", "iam:*"],
                    "allowed_services": ["ec2", "s3", "logs"],
                    "max_duration_hours": 4,
                    "requires_approval": True,
                    "approval_chain": ["manager"]
                },
                "L3": {
                    "name": "Admin (DevOps Only)",
                    "allowed_actions": ["*"],
                    "denied_actions": ["iam:*", "organizations:*"],
                    "allowed_services": ["*"],
                    "max_duration_hours": 2,
                    "requires_approval": True,
                    "approval_chain": ["manager", "security_lead"]
                }
            },
            "permanent_access_teams": ["devops", "security"],
            "jit_only_teams": ["developers", "qa"],
            "global_guardrails": {
                "always_deny": ["iam:CreateUser", "iam:DeleteUser", "organizations:*"],
                "require_mfa": True,
                "require_justification": True,
                "max_concurrent_sessions": 3
            },
            "cloud_platforms": ["aws", "gcp"],
            "account_classifications": {
                "prod": {
                    "max_duration_hours": 4,
                    "requires_dual_approval": True
                },
                "nonprod": {
                    "max_duration_hours": 120,
                    "requires_dual_approval": False
                }
            }
        }
        """
        
        # Validate template structure
        if not PolicyTemplateEngine._validate_template(template_config):
            return {"error": "Invalid template structure"}
        
        template_id = f"{org_id}_{template_config['name'].replace(' ', '_')}_{int(datetime.now().timestamp())}"
        
        PolicyTemplateEngine.TEMPLATES[template_id] = {
            "id": template_id,
            "org_id": org_id,
            "config": template_config,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "active": True
        }
        
        return {"template_id": template_id, "status": "created"}
    
    @staticmethod
    def get_template(org_id, template_name=None):
        """Get template for organization"""
        for template_id, template in PolicyTemplateEngine.TEMPLATES.items():
            if template['org_id'] == org_id and template['active']:
                if template_name is None or template['config']['name'] == template_name:
                    return template
        return None
    
    @staticmethod
    def map_user_to_level(org_id, user_role, user_team):
        """
        Map user role and team to appropriate privilege level
        Returns: level_config or None
        """
        template = PolicyTemplateEngine.get_template(org_id)
        if not template:
            return None
        
        config = template['config']
        
        # Check if team has permanent access
        if user_team in config.get('permanent_access_teams', []):
            return {
                "access_type": "permanent",
                "level": "L3",
                "config": config['levels'].get('L3')
            }
        
        # Check if team is JIT-only
        if user_team in config.get('jit_only_teams', []):
            # Default to L1 for JIT users
            return {
                "access_type": "jit",
                "level": "L1",
                "config": config['levels'].get('L1')
            }
        
        # Default mapping based on role
        role_to_level = {
            "admin": "L3",
            "manager": "L2",
            "engineer": "L1",
            "developer": "L1",
            "qa": "L1"
        }
        
        level = role_to_level.get(user_role.lower(), "L1")
        
        return {
            "access_type": "jit",
            "level": level,
            "config": config['levels'].get(level)
        }
    
    @staticmethod
    def validate_request_against_template(org_id, user_role, user_team, requested_actions, account_env):
        """
        Validate if requested actions are allowed per org template
        Returns: (is_valid, allowed_actions, denied_actions, approval_required)
        """
        template = PolicyTemplateEngine.get_template(org_id)
        if not template:
            return False, [], [], True
        
        config = template['config']
        user_level = PolicyTemplateEngine.map_user_to_level(org_id, user_role, user_team)
        
        if not user_level:
            return False, [], [], True
        
        level_config = user_level['config']
        
        # Check global guardrails first
        global_deny = config.get('global_guardrails', {}).get('always_deny', [])
        
        allowed = []
        denied = []
        
        for action in requested_actions:
            # Check global deny list
            if any(PolicyTemplateEngine._matches_pattern(action, deny_pattern) for deny_pattern in global_deny):
                denied.append(action)
                continue
            
            # Check level-specific deny list
            level_deny = level_config.get('denied_actions', [])
            if any(PolicyTemplateEngine._matches_pattern(action, deny_pattern) for deny_pattern in level_deny):
                denied.append(action)
                continue
            
            # Check level-specific allow list
            level_allow = level_config.get('allowed_actions', [])
            if any(PolicyTemplateEngine._matches_pattern(action, allow_pattern) for allow_pattern in level_allow):
                allowed.append(action)
            else:
                denied.append(action)
        
        # Check if approval required
        approval_required = level_config.get('requires_approval', False)
        
        # Check account-specific rules
        if account_env in config.get('account_classifications', {}):
            account_rules = config['account_classifications'][account_env]
            if account_rules.get('requires_dual_approval'):
                approval_required = True
        
        return len(allowed) > 0, allowed, denied, approval_required
    
    @staticmethod
    def _matches_pattern(action, pattern):
        """Check if action matches pattern (supports wildcards)"""
        import re
        regex_pattern = pattern.replace('*', '.*')
        return re.match(f"^{regex_pattern}$", action) is not None
    
    @staticmethod
    def _validate_template(template_config):
        """Validate template structure"""
        required_fields = ['name', 'levels']
        return all(field in template_config for field in required_fields)
    
    @staticmethod
    def get_all_templates(org_id):
        """Get all templates for an organization"""
        return [
            template for template in PolicyTemplateEngine.TEMPLATES.values()
            if template['org_id'] == org_id and template['active']
        ]
    
    @staticmethod
    def update_template(template_id, updates):
        """Update existing template"""
        if template_id not in PolicyTemplateEngine.TEMPLATES:
            return {"error": "Template not found"}
        
        PolicyTemplateEngine.TEMPLATES[template_id]['config'].update(updates)
        PolicyTemplateEngine.TEMPLATES[template_id]['updated_at'] = datetime.now().isoformat()
        
        return {"status": "updated"}
    
    @staticmethod
    def delete_template(template_id):
        """Soft delete template"""
        if template_id not in PolicyTemplateEngine.TEMPLATES:
            return {"error": "Template not found"}
        
        PolicyTemplateEngine.TEMPLATES[template_id]['active'] = False
        return {"status": "deleted"}


# Initialize default template for demo
def initialize_default_templates():
    """Create default templates for testing"""
    
    # Default template for Nykaa
    default_template = {
        "name": "Nykaa Default Policy",
        "levels": {
            "L1": {
                "name": "Read-Only",
                "allowed_actions": ["Describe*", "List*", "Get*"],
                "denied_actions": ["*Delete*", "*Create*", "iam:*"],
                "allowed_services": ["ec2", "s3", "rds", "lambda", "logs"],
                "max_duration_hours": 8,
                "requires_approval": False,
                "approval_chain": ["self"]
            },
            "L2": {
                "name": "Limited Write",
                "allowed_actions": [
                    "ec2:StartInstances", "ec2:StopInstances", "ec2:RebootInstances",
                    "s3:PutObject", "s3:GetObject", "s3:DeleteObject",
                    "logs:GetLogEvents", "logs:FilterLogEvents",
                    "lambda:InvokeFunction",
                    "ssm:StartSession"
                ],
                "denied_actions": ["*Delete*", "*Create*", "iam:*", "organizations:*"],
                "allowed_services": ["ec2", "s3", "logs", "lambda", "ssm"],
                "max_duration_hours": 4,
                "requires_approval": True,
                "approval_chain": ["manager"]
            },
            "L3": {
                "name": "Admin (DevOps Only)",
                "allowed_actions": ["*"],
                "denied_actions": ["iam:*", "organizations:*", "account:*"],
                "allowed_services": ["*"],
                "max_duration_hours": 2,
                "requires_approval": True,
                "approval_chain": ["manager", "security_lead"]
            }
        },
        "permanent_access_teams": ["devops", "security"],
        "jit_only_teams": ["developers", "qa", "finance"],
        "global_guardrails": {
            "always_deny": [
                "iam:CreateUser", "iam:DeleteUser", "iam:CreateRole", 
                "iam:DeleteRole", "iam:AttachUserPolicy", "organizations:*",
                "account:*", "sts:AssumeRole"
            ],
            "require_mfa": True,
            "require_justification": True,
            "max_concurrent_sessions": 3
        },
        "cloud_platforms": ["aws"],
        "account_classifications": {
            "prod": {
                "max_duration_hours": 4,
                "requires_dual_approval": True
            },
            "nonprod": {
                "max_duration_hours": 120,
                "requires_dual_approval": False
            }
        }
    }
    
    PolicyTemplateEngine.create_template("nykaa", default_template)
    print("✅ Default policy template initialized")

# Initialize on module load
initialize_default_templates()
