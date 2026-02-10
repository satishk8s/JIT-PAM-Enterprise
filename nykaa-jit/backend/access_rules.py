"""
Access Rules Engine
Manages group-based access restrictions
"""

import json
import os
from datetime import datetime

class AccessRules:
    
    @staticmethod
    def get_rules():
        """Get all access rules"""
        try:
            rules_path = os.path.join(os.path.dirname(__file__), 'access_rules.json')
            if os.path.exists(rules_path):
                with open(rules_path, 'r') as f:
                    return json.load(f)
            return {'rules': []}
        except:
            return {'rules': []}
    
    @staticmethod
    def save_rule(rule, created_by='System', method='AI'):
        """Save new access rule"""
        try:
            rules_path = os.path.join(os.path.dirname(__file__), 'access_rules.json')
            data = AccessRules.get_rules()
            
            rule['id'] = f"rule_{len(data['rules']) + 1}_{int(datetime.now().timestamp())}"
            rule['created_at'] = datetime.now().isoformat()
            rule['created_by'] = created_by
            rule['method'] = method
            
            data['rules'].append(rule)
            
            with open(rules_path, 'w') as f:
                json.dump(data, f, indent=2)
            
            return {'status': 'success', 'rule_id': rule['id']}
        except Exception as e:
            return {'error': str(e)}
    
    @staticmethod
    def get_rule(rule_id):
        """Get specific rule"""
        data = AccessRules.get_rules()
        for rule in data['rules']:
            if rule['id'] == rule_id:
                return rule
        return None
    
    @staticmethod
    def delete_rule(rule_id):
        """Delete rule"""
        try:
            rules_path = os.path.join(os.path.dirname(__file__), 'access_rules.json')
            data = AccessRules.get_rules()
            
            data['rules'] = [r for r in data['rules'] if r['id'] != rule_id]
            
            with open(rules_path, 'w') as f:
                json.dump(data, f, indent=2)
            
            return {'status': 'success'}
        except Exception as e:
            return {'error': str(e)}
    
    @staticmethod
    def check_access(user_groups, service):
        """Check if user's groups have access to service"""
        data = AccessRules.get_rules()
        
        for rule in data['rules']:
            if not rule.get('enabled', True):
                continue
            
            # Check if any user group matches rule groups
            rule_groups = rule.get('groups', [])
            if any(group in rule_groups for group in user_groups):
                # User is in restricted group
                allowed_services = rule.get('allowed_services', [])
                denied_services = rule.get('denied_services', [])
                
                if denied_services and service in denied_services:
                    return {'allowed': False, 'reason': rule.get('description', 'Access denied by rule')}
                
                if allowed_services and service not in allowed_services:
                    return {'allowed': False, 'reason': rule.get('description', 'Service not in allowed list')}
        
        return {'allowed': True}
