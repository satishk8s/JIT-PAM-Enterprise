# Strict Policies - CANNOT be overridden by AI or user input

import json
import os

class StrictPolicies:
    """
    Hard-coded security policies that MUST be enforced
    These are organization-agreed principles that cannot be bypassed
    """
    
    # Configuration file path
    _config_file = 'policy_config.json'
    
    # Default configuration
    _default_config = {
        'allow_delete_nonprod': False,
        'allow_delete_prod': False,
        'allow_create_nonprod': False,
        'allow_create_prod': False,
        'allow_admin_nonprod': False,
        'allow_admin_prod': False,
        'allow_admin_sandbox': True,
        'contact_emails': {
            'create': 'devops@company.com',
            'delete': 'security@company.com',
            'terminate': 'manager@company.com',
            'iam': 'security-team@company.com',
            'emergency': 'ciso@company.com',
            'support': 'support@company.com'
        }
    }
    
    # Load configuration from file or use defaults
    _config = None
    
    @staticmethod
    def _load_config():
        """Load configuration from file"""
        if os.path.exists(StrictPolicies._config_file):
            try:
                with open(StrictPolicies._config_file, 'r') as f:
                    return json.load(f)
            except:
                pass
        return StrictPolicies._default_config.copy()
    
    @staticmethod
    def _save_config():
        """Save configuration to file"""
        try:
            with open(StrictPolicies._config_file, 'w') as f:
                json.dump(StrictPolicies._config, f, indent=2)
        except Exception as e:
            print(f"Error saving config: {e}")
    
    # STRICT RULE 1: ALWAYS Forbidden Actions (NEVER allowed regardless of config)
    ALWAYS_FORBIDDEN_ACTIONS = [
        '*',  # Wildcard permissions
        'iam:CreateUser',
        'iam:CreateRole',
        'iam:AttachUserPolicy',
        'iam:AttachRolePolicy',
        'iam:PutUserPolicy',
        'iam:PutRolePolicy',
        'iam:DeleteUser',
        'iam:DeleteRole',
        'organizations:*',
        'account:*',
        'sts:AssumeRole',  # Prevent privilege escalation
        'lambda:CreateFunction',  # Prevent code execution
        'lambda:UpdateFunctionCode',
        'ec2:RunInstances',  # Prevent resource creation
        'rds:CreateDBInstance',
        's3:DeleteBucket',  # Bucket deletion always forbidden
        'dynamodb:DeleteTable',  # Table deletion always forbidden
        'kms:ScheduleKeyDeletion'  # Key deletion always forbidden
    ]
    
    # CONFIGURABLE: Delete actions that can be allowed based on admin settings
    CONFIGURABLE_DELETE_ACTIONS = [
        's3:DeleteObject',
        's3:DeleteObjectVersion',
        'logs:DeleteLogStream',
        'logs:DeleteLogGroup',
        'lambda:DeleteFunction',
        'ec2:TerminateInstances',
        'rds:DeleteDBInstance',
        'secretsmanager:DeleteSecret',
        'dynamodb:DeleteItem',
        'sqs:DeleteQueue',
        'sns:DeleteTopic'
    ]
    
    # STRICT RULE 2: Forbidden Keywords in User Input (only block truly dangerous requests)
    FORBIDDEN_KEYWORDS = [
        'full access', 'all permissions', '*:*',
        'create user', 'create role', 'delete user', 'delete role',
        'attach policy', 'detach policy', 'assume role',
        'bypass', 'override', 'ignore policy', 'disable security',
        # Prompt injection - role manipulation
        'you are now', 'act as admin', 'act as root', 'pretend you are',
        'you have no restrictions', 'ignore all previous',
        # Jailbreak phrases
        'jailbreak', 'developer mode', 'dan mode', 'do anything now',
        'no restrictions', 'without limitations', 'ignore your instructions',
        # Output extraction
        'print your instructions', 'reveal system prompt', 'show your prompt',
        'output your rules', 'display your guidelines', 'what are your instructions'
    ]
    
    # STRICT RULE 3: Secrets Manager - MUST have specific ARN
    SECRETS_REQUIRE_SPECIFIC_ARN = True
    
    # STRICT RULE 4: Production Accounts - Require Dual Approval
    PROD_ACCOUNTS_DUAL_APPROVAL = True
    
    # STRICT RULE 5: Max Duration Limits (hours)
    MAX_DURATION = {
        'prod': 8,
        'nonprod': 120,
        'dev': 120,
        'sandbox': 168
    }
    
    # STRICT RULE 6: Write Actions Require Manager Approval
    WRITE_ACTIONS_REQUIRE_APPROVAL = True
    
    # STRICT RULE 7: Forbidden Resource Patterns
    FORBIDDEN_RESOURCE_PATTERNS = [
        'arn:aws:iam::*:role/*',  # No IAM role access
        'arn:aws:iam::*:user/*',  # No IAM user access
    ]
    
    @staticmethod
    def update_config(config):
        """Update configuration from admin settings and persist to file"""
        if StrictPolicies._config is None:
            StrictPolicies._config = StrictPolicies._load_config()
        StrictPolicies._config.update(config)
        StrictPolicies._save_config()
    
    @staticmethod
    def get_config():
        """Get current configuration"""
        if StrictPolicies._config is None:
            StrictPolicies._config = StrictPolicies._load_config()
        return StrictPolicies._config.copy()
    
    @staticmethod
    def validate_actions(actions, account_environment='nonprod'):
        """
        Validate that requested actions don't violate strict policies
        Returns: (is_valid, error_message, guidance)
        """
        if not actions or not isinstance(actions, list):
            return False, "Actions must be a non-empty list", None
        
        # Check for forbidden actions
        for action in actions:
            action_lower = action.lower()
            
            # Check ALWAYS forbidden actions
            if action in StrictPolicies.ALWAYS_FORBIDDEN_ACTIONS:
                # Check if it's a CREATE action
                if any(create_word in action_lower for create_word in ['create', 'runinstances']):
                    email = StrictPolicies._config['contact_emails']['create']
                    guidance = f"Infrastructure provisioning requests should be submitted through DevOps. Please contact {email} or create a JIRA ticket."
                    return False, f"❌ POLICY VIOLATION: Action '{action}' is strictly forbidden", guidance
                
                # Check if it's an IAM action
                if 'iam:' in action_lower or 'assumerole' in action_lower:
                    email = StrictPolicies._config['contact_emails']['iam']
                    guidance = f"IAM and security actions require special approval. Please contact {email}."
                    return False, f"❌ POLICY VIOLATION: Action '{action}' is strictly forbidden", guidance
                
                return False, f"❌ POLICY VIOLATION: Action '{action}' is strictly forbidden", None
            
            # Check CONFIGURABLE delete actions
            if action in StrictPolicies.CONFIGURABLE_DELETE_ACTIONS:
                is_prod = account_environment in ['prod', 'production']
                
                if is_prod and not StrictPolicies._config['allow_delete_prod']:
                    email = StrictPolicies._config['contact_emails']['delete']
                    guidance = f"Delete actions in production require special approval. Please contact {email} for L3-Delete permission set requests."
                    return False, f"❌ Delete actions disabled in production", guidance
                
                if not is_prod and not StrictPolicies._config['allow_delete_nonprod']:
                    email = StrictPolicies._config['contact_emails']['delete']
                    guidance = f"Delete actions are currently disabled. Please contact {email} for delete permission requests."
                    return False, f"❌ Delete actions disabled", guidance
                
                # If allowed, mark as requiring L3-Delete permission set
                # This will be handled by approval workflow
            
            # Check wildcard patterns - allow for read-only actions
            if '*' in action:
                read_prefixes = ['get', 'list', 'describe', 'read', 'view', 'fetch', 'query', 'scan']
                action_lower = action.lower()
                is_read_action = any(prefix in action_lower for prefix in read_prefixes)
                if not is_read_action:
                    return False, f"❌ POLICY VIOLATION: Wildcard action '{action}' is not allowed for write operations", None
            
            # Check for privilege escalation patterns
            if any(forbidden in action_lower for forbidden in ['createuser', 'createrole', 'attachpolicy']):
                return False, f"❌ POLICY VIOLATION: Action '{action}' can lead to privilege escalation", None
        
        return True, None, None
    
    @staticmethod
    def validate_user_input(user_input):
        """
        Validate user input for forbidden keywords
        This prevents prompt injection attacks
        """
        if not user_input:
            return True, None
        
        user_input_lower = user_input.lower()
        
        for keyword in StrictPolicies.FORBIDDEN_KEYWORDS:
            if keyword in user_input_lower:
                return False, f"❌ POLICY VIOLATION: Request contains forbidden keyword '{keyword}'"
        
        return True, None
    
    @staticmethod
    def validate_resources(resources, service):
        """
        Validate resource ARNs don't violate strict policies
        """
        if not resources:
            return False, "Resources must be specified"
        
        # Check for forbidden patterns
        for resource in resources:
            if resource in StrictPolicies.FORBIDDEN_RESOURCE_PATTERNS:
                return False, f"❌ POLICY VIOLATION: Resource pattern '{resource}' is forbidden"
            
            # Secrets Manager MUST have specific ARN (no wildcard)
            if service == 'secretsmanager' and resource == '*':
                return False, "❌ POLICY VIOLATION: Secrets Manager requires specific secret ARN, wildcard not allowed"
        
        # Wildcard is allowed for read-only services
        return True, None
    
    @staticmethod
    def validate_duration(duration_hours, account_environment):
        """
        Validate duration doesn't exceed max limits
        """
        max_allowed = StrictPolicies.MAX_DURATION.get(account_environment, 8)
        
        if duration_hours > max_allowed:
            return False, f"❌ POLICY VIOLATION: Max duration for {account_environment} is {max_allowed} hours"
        
        return True, None
    
    @staticmethod
    def requires_approval(actions, account_environment):
        """
        Determine if request requires manager approval
        Returns: (requires_approval, approval_type)
        """
        # Production always requires approval
        if account_environment == 'prod':
            return True, 'manager+security'
        
        # Check if any write actions
        write_actions = ['put', 'create', 'update', 'modify', 'upload', 'invoke']
        has_write = any(any(wa in action.lower() for wa in write_actions) for action in actions)
        
        if has_write and StrictPolicies.WRITE_ACTIONS_REQUIRE_APPROVAL:
            return True, 'manager'
        
        return False, 'self'
