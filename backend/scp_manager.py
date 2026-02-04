"""
Service Control Policy (SCP) Manager
Manage AWS SCPs without accessing AWS Console
"""

import boto3
import json
from botocore.exceptions import ClientError

class SCPManager:
    
    @staticmethod
    def list_policies():
        """List all SCPs in organization"""
        try:
            org = boto3.client('organizations')
            policies = []
            paginator = org.get_paginator('list_policies')
            
            for page in paginator.paginate(Filter='SERVICE_CONTROL_POLICY'):
                for policy in page['Policies']:
                    policies.append({
                        'id': policy['Id'],
                        'name': policy['Name'],
                        'description': policy.get('Description', ''),
                        'aws_managed': policy['AwsManaged']
                    })
            
            return {'policies': policies}
        except Exception as e:
            return {'error': str(e)}
    
    @staticmethod
    def get_policy_content(policy_id):
        """Get SCP content"""
        try:
            org = boto3.client('organizations')
            response = org.describe_policy(PolicyId=policy_id)
            
            policy = response['Policy']
            content = json.loads(policy['Content'])
            
            return {
                'id': policy['PolicySummary']['Id'],
                'name': policy['PolicySummary']['Name'],
                'description': policy['PolicySummary'].get('Description', ''),
                'content': content,
                'targets': SCPManager._get_policy_targets(policy_id)
            }
        except Exception as e:
            return {'error': str(e)}
    
    @staticmethod
    def _get_policy_targets(policy_id):
        """Get accounts/OUs where policy is attached"""
        try:
            org = boto3.client('organizations')
            targets = []
            paginator = org.get_paginator('list_targets_for_policy')
            
            for page in paginator.paginate(PolicyId=policy_id):
                for target in page['Targets']:
                    targets.append({
                        'id': target['TargetId'],
                        'name': target['Name'],
                        'type': target['Type']
                    })
            
            return targets
        except:
            return []
    
    @staticmethod
    def create_policy(name, description, content):
        """Create new SCP"""
        try:
            org = boto3.client('organizations')
            
            response = org.create_policy(
                Content=json.dumps(content),
                Description=description,
                Name=name,
                Type='SERVICE_CONTROL_POLICY'
            )
            
            return {
                'status': 'success',
                'policy_id': response['Policy']['PolicySummary']['Id'],
                'message': f'SCP "{name}" created successfully'
            }
        except Exception as e:
            return {'error': str(e)}
    
    @staticmethod
    def update_policy(policy_id, name=None, description=None, content=None):
        """Update existing SCP"""
        try:
            org = boto3.client('organizations')
            
            if name or description:
                org.update_policy(
                    PolicyId=policy_id,
                    Name=name,
                    Description=description
                )
            
            if content:
                org.update_policy(
                    PolicyId=policy_id,
                    Content=json.dumps(content)
                )
            
            return {
                'status': 'success',
                'message': 'SCP updated successfully'
            }
        except Exception as e:
            return {'error': str(e)}
    
    @staticmethod
    def delete_policy(policy_id):
        """Delete SCP"""
        try:
            org = boto3.client('organizations')
            org.delete_policy(PolicyId=policy_id)
            
            return {
                'status': 'success',
                'message': 'SCP deleted successfully'
            }
        except Exception as e:
            return {'error': str(e)}
    
    @staticmethod
    def attach_policy(policy_id, target_id):
        """Attach SCP to account or OU"""
        try:
            org = boto3.client('organizations')
            org.attach_policy(PolicyId=policy_id, TargetId=target_id)
            
            return {
                'status': 'success',
                'message': 'SCP attached successfully'
            }
        except Exception as e:
            return {'error': str(e)}
    
    @staticmethod
    def detach_policy(policy_id, target_id):
        """Detach SCP from account or OU"""
        try:
            org = boto3.client('organizations')
            org.detach_policy(PolicyId=policy_id, TargetId=target_id)
            
            return {
                'status': 'success',
                'message': 'SCP detached successfully'
            }
        except Exception as e:
            return {'error': str(e)}
    
    @staticmethod
    def get_account_policies(account_id):
        """Get all SCPs attached to an account"""
        try:
            org = boto3.client('organizations')
            policies = []
            paginator = org.get_paginator('list_policies_for_target')
            
            for page in paginator.paginate(TargetId=account_id, Filter='SERVICE_CONTROL_POLICY'):
                for policy in page['Policies']:
                    policies.append({
                        'id': policy['Id'],
                        'name': policy['Name'],
                        'type': policy['Type']
                    })
            
            return {'policies': policies}
        except Exception as e:
            return {'error': str(e)}
