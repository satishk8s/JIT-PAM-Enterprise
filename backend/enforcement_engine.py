"""
Strict Enforcement Engine - Core PAM Principle
Enforces agreed organizational policies with zero tolerance
"""

class EnforcementEngine:
    
    @staticmethod
    def enforce_policy(request_data, org_policies):
        """
        Strict enforcement of organizational policies
        Returns: (allowed: bool, violations: list, enforcement_action: str)
        """
        violations = []
        
        # 1. STRICT: Account-level policies
        account_id = request_data.get('account_id')
        account_policy = org_policies.get('accounts', {}).get(account_id, {})
        
        if account_policy.get('jit_required') and not request_data.get('is_jit'):
            violations.append({
                'rule': 'JIT_REQUIRED',
                'message': f'Account {account_id} requires JIT access only',
                'severity': 'BLOCK'
            })
        
        max_duration = account_policy.get('max_duration_hours', 120)
        if request_data.get('duration_hours', 0) > max_duration:
            violations.append({
                'rule': 'MAX_DURATION_EXCEEDED',
                'message': f'Max duration for this account is {max_duration}h',
                'severity': 'BLOCK'
            })
        
        # 2. STRICT: Environment-based policies
        env = account_policy.get('environment', 'nonprod')
        env_policy = org_policies.get('environments', {}).get(env, {})
        
        actions = request_data.get('ai_permissions', {}).get('actions', [])
        
        # Block destructive actions in prod if policy says so
        if env == 'prod' and not env_policy.get('allow_delete', False):
            destructive = [a for a in actions if any(x in a.lower() for x in ['delete', 'terminate', 'remove'])]
            if destructive:
                violations.append({
                    'rule': 'PROD_DELETE_BLOCKED',
                    'message': f'Delete operations blocked in production: {destructive}',
                    'severity': 'BLOCK',
                    'contact': org_policies.get('contacts', {}).get('delete_operations')
                })
        
        # 3. STRICT: Role-based policies
        user_role = request_data.get('user_role', 'user')
        role_policy = org_policies.get('roles', {}).get(user_role, {})
        
        forbidden_actions = role_policy.get('forbidden_actions', [])
        blocked = [a for a in actions if any(f in a.lower() for f in forbidden_actions)]
        if blocked:
            violations.append({
                'rule': 'ROLE_FORBIDDEN_ACTION',
                'message': f'Your role cannot request: {blocked}',
                'severity': 'BLOCK'
            })
        
        # 4. STRICT: Time-based policies
        time_policy = org_policies.get('time_restrictions', {})
        if time_policy.get('business_hours_only'):
            from datetime import datetime
            hour = datetime.now().hour
            if hour < 9 or hour > 17:
                violations.append({
                    'rule': 'BUSINESS_HOURS_ONLY',
                    'message': 'Requests only allowed during business hours (9 AM - 5 PM)',
                    'severity': 'BLOCK'
                })
        
        # 5. STRICT: Approval requirements
        approval_policy = org_policies.get('approvals', {})
        required_approvers = []
        
        if env == 'prod':
            required_approvers.extend(approval_policy.get('prod_approvers', ['manager', 'security_lead']))
        
        if any('admin' in a.lower() for a in actions):
            required_approvers.extend(approval_policy.get('admin_approvers', ['manager', 'security_lead', 'ciso']))
        
        # Determine enforcement action
        blocking_violations = [v for v in violations if v['severity'] == 'BLOCK']
        
        if blocking_violations:
            return False, violations, 'DENY'
        elif violations:
            return True, violations, 'WARN'
        else:
            return True, [], 'ALLOW'
    
    @staticmethod
    def get_recommendation(request_data, org_policies):
        """
        Flexible recommendations when strict policy blocks request
        """
        recommendations = []
        
        # Recommend alternative approaches
        if request_data.get('blocked_reason') == 'PROD_DELETE_BLOCKED':
            recommendations.append({
                'type': 'ALTERNATIVE',
                'message': 'Request read-only access first to review data',
                'action': 'switch_to_readonly'
            })
            recommendations.append({
                'type': 'ESCALATION',
                'message': 'For delete operations, create JIRA ticket with manager approval',
                'action': 'create_jira_ticket',
                'contact': org_policies.get('contacts', {}).get('delete_operations')
            })
        
        if request_data.get('blocked_reason') == 'MAX_DURATION_EXCEEDED':
            max_allowed = org_policies.get('accounts', {}).get(request_data['account_id'], {}).get('max_duration_hours', 120)
            recommendations.append({
                'type': 'ADJUST',
                'message': f'Reduce duration to {max_allowed}h or less',
                'action': 'adjust_duration',
                'max_duration': max_allowed
            })
        
        return recommendations
