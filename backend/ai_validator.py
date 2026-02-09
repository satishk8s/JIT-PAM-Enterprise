# AI Output Validator - Validates AI-generated permissions against strict policies

from strict_policies import StrictPolicies
import re

class AIValidator:
    """
    Validates AI-generated permissions to prevent prompt injection
    and ensure compliance with strict policies
    """
    
    @staticmethod
    def validate_ai_response(ai_output, user_input, account_environment='nonprod'):
        """
        Comprehensive validation of AI-generated permissions
        Returns: (is_valid, sanitized_output, error_message)
        """
        
        # VALIDATION 1: Check user input for prompt injection
        is_valid, error = StrictPolicies.validate_user_input(user_input)
        if not is_valid:
            return False, None, error
        
        # VALIDATION 2: Ensure AI returned proper JSON structure
        if not isinstance(ai_output, dict):
            return False, None, "❌ AI response is not valid JSON"
        
        if 'actions' not in ai_output or 'resources' not in ai_output:
            return False, None, "❌ AI response missing required fields (actions, resources)"
        
        actions = ai_output.get('actions', [])
        resources = ai_output.get('resources', [])
        
        # VALIDATION 3: Validate actions against strict policies
        is_valid, error, guidance = StrictPolicies.validate_actions(actions, account_environment)
        if not is_valid:
            # Return guidance if available
            if guidance:
                return False, None, f"{error}\n\n{guidance}"
            return False, None, error
        
        # VALIDATION 4: Detect if AI was tricked by prompt injection
        injection_patterns = [
            r'ignore.*previous.*instruction',
            r'disregard.*rule',
            r'override.*policy',
            r'bypass.*restriction',
            r'you.*must.*allow',
            r'system.*prompt',
            r'admin.*access.*required',
            r'emergency.*override'
        ]
        
        user_input_lower = user_input.lower()
        for pattern in injection_patterns:
            if re.search(pattern, user_input_lower):
                return False, None, f"❌ SECURITY ALERT: Potential prompt injection detected"
        
        # VALIDATION 5: Sanitize actions - remove any that slipped through
        sanitized_actions = []
        for action in actions:
            # Double-check each action
            if action not in StrictPolicies.ALWAYS_FORBIDDEN_ACTIONS:
                # Allow wildcards for read-only actions
                if '*' in action:
                    read_prefixes = ['get', 'list', 'describe', 'read', 'view', 'fetch', 'query', 'scan']
                    action_lower = action.lower()
                    is_read_action = any(prefix in action_lower for prefix in read_prefixes)
                    if not is_read_action:
                        continue  # Skip write wildcards
                sanitized_actions.append(action)
        
        if not sanitized_actions:
            return False, None, "❌ No valid actions after security filtering"
        
        # VALIDATION 6: Validate resources
        service = AIValidator._extract_service_from_actions(sanitized_actions)
        is_valid, error = StrictPolicies.validate_resources(resources, service)
        if not is_valid:
            return False, None, error
        
        # VALIDATION 7: Check for privilege escalation attempts (only block dangerous IAM actions)
        escalation_actions = ['iam:CreateUser', 'iam:CreateRole', 'iam:AttachUserPolicy', 'iam:AttachRolePolicy', 'iam:PutUserPolicy', 'iam:PutRolePolicy', 'sts:AssumeRole']
        dangerous_found = [action for action in sanitized_actions if any(esc in action for esc in escalation_actions)]
        if dangerous_found:
            return False, None, f"❌ SECURITY ALERT: Privilege escalation attempt detected: {', '.join(dangerous_found)}"
        
        # Create sanitized output
        sanitized_output = {
            'actions': sanitized_actions,
            'resources': resources,
            'description': ai_output.get('description', 'AI-generated permissions'),
            'validated': True,
            'validation_timestamp': AIValidator._get_timestamp()
        }
        
        return True, sanitized_output, None
    
    @staticmethod
    def _extract_service_from_actions(actions):
        """Extract AWS service from action list"""
        if not actions:
            return None
        
        # Get service from first action (e.g., 's3:GetObject' -> 's3')
        first_action = actions[0]
        if ':' in first_action:
            return first_action.split(':')[0]
        return None
    
    @staticmethod
    def _get_timestamp():
        """Get current timestamp"""
        from datetime import datetime
        return datetime.now().isoformat()
    
    @staticmethod
    def detect_non_aws_request(user_input):
        """
        Detect if user is requesting non-AWS access
        Returns: (is_non_aws, detected_services)
        """
        non_aws_keywords = {
            'azure': 'Azure',
            'gcp': 'Google Cloud Platform',
            'google cloud': 'Google Cloud Platform',
            'oracle': 'Oracle Cloud',
            'kubernetes': 'Kubernetes',
            'k8s': 'Kubernetes',
            'mysql': 'MySQL Database',
            'postgres': 'PostgreSQL Database',
            'mongodb': 'MongoDB',
            'jenkins': 'Jenkins',
            'grafana': 'Grafana',
            'splunk': 'Splunk',
            'jira': 'JIRA',
            'okta': 'Okta',
            'onelogin': 'OneLogin',
            'auth0': 'Auth0'
        }
        
        user_input_lower = user_input.lower()
        detected = []
        
        for keyword, service_name in non_aws_keywords.items():
            if keyword in user_input_lower:
                detected.append(service_name)
        
        return len(detected) > 0, detected
