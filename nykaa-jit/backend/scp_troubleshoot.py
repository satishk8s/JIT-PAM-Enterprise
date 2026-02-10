import boto3
import json
import uuid
from datetime import datetime

class SCPTroubleshoot:
    """AI assistant for troubleshooting SCP-related access issues (READ-ONLY)"""
    
    conversations = {}
    
    @staticmethod
    def investigate(user_message, conversation_id=None):
        """Investigate SCP issues using AI - READ ONLY, no modifications allowed"""
        
        if not conversation_id:
            conversation_id = str(uuid.uuid4())
            SCPTroubleshoot.conversations[conversation_id] = {
                'messages': [],
                'account_id': None,
                'ou_id': None,
                'created_at': datetime.now().isoformat()
            }
        
        conversation = SCPTroubleshoot.conversations.get(conversation_id, {})
        conversation['messages'].append({'role': 'user', 'content': user_message})
        
        # Extract account/OU from message
        account_id = SCPTroubleshoot._extract_account_id(user_message)
        ou_id = SCPTroubleshoot._extract_ou_id(user_message)
        
        if account_id:
            conversation['account_id'] = account_id
        if ou_id:
            conversation['ou_id'] = ou_id
        
        # Build context for AI
        context = SCPTroubleshoot._build_context(conversation)
        
        # Call Bedrock AI
        try:
            bedrock = boto3.client('bedrock-runtime', region_name='ap-south-1')
            
            system_prompt = """You are an AWS SCP (Service Control Policy) troubleshooting assistant.

Your role is to:
1. Help users understand why their access is being blocked by SCPs
2. Analyze attached SCPs and identify which policy is blocking the action
3. Explain the reason for the block in simple terms
4. Suggest who to contact for access

CRITICAL RESTRICTIONS:
- You can ONLY READ and ANALYZE SCPs
- You CANNOT create, modify, or delete SCPs
- You CANNOT attach or detach SCPs
- You can only provide investigation and recommendations

When investigating:
1. Ask for account ID or OU if not provided
2. Ask for the error message or action being blocked
3. Fetch and analyze attached SCPs
4. Identify the blocking policy and statement
5. Explain why it's blocked
6. Recommend next steps (contact admin, request exception, etc.)

Be conversational and helpful."""

            prompt = f"""{system_prompt}

Conversation history:
{json.dumps(conversation['messages'], indent=2)}

Context:
{context}

Provide a helpful response to investigate the SCP issue. If you need more information, ask specific questions."""

            response = bedrock.invoke_model(
                modelId='anthropic.claude-3-sonnet-20240229-v1:0',
                body=json.dumps({
                    'anthropic_version': 'bedrock-2023-05-31',
                    'max_tokens': 1000,
                    'messages': [{'role': 'user', 'content': prompt}]
                })
            )
            
            result = json.loads(response['body'].read())
            ai_response = result['content'][0]['text']
            
            conversation['messages'].append({'role': 'assistant', 'content': ai_response})
            
            return {
                'ai_response': ai_response,
                'conversation_id': conversation_id
            }
            
        except Exception as e:
            print(f"Bedrock error: {e}")
            return {
                'error': 'AI investigation failed. Please provide account ID and error message manually.'
            }
    
    @staticmethod
    def _extract_account_id(text):
        """Extract AWS account ID from text"""
        import re
        match = re.search(r'\b\d{12}\b', text)
        return match.group(0) if match else None
    
    @staticmethod
    def _extract_ou_id(text):
        """Extract OU ID from text"""
        import re
        match = re.search(r'ou-[a-z0-9-]+', text, re.IGNORECASE)
        return match.group(0) if match else None
    
    @staticmethod
    def _build_context(conversation):
        """Build context by fetching SCPs for the account/OU"""
        account_id = conversation.get('account_id')
        ou_id = conversation.get('ou_id')
        
        context = ""
        
        if account_id:
            try:
                org_client = boto3.client('organizations')
                
                # Get policies attached to account
                response = org_client.list_policies_for_target(
                    TargetId=account_id,
                    Filter='SERVICE_CONTROL_POLICY'
                )
                
                policies = []
                for policy_summary in response.get('Policies', []):
                    policy_id = policy_summary['Id']
                    policy_detail = org_client.describe_policy(PolicyId=policy_id)
                    policies.append({
                        'name': policy_summary['Name'],
                        'id': policy_id,
                        'content': json.loads(policy_detail['Policy']['Content'])
                    })
                
                context += f"\n\nSCPs attached to account {account_id}:\n"
                context += json.dumps(policies, indent=2)
                
            except Exception as e:
                context += f"\n\nCould not fetch SCPs for account {account_id}: {str(e)}"
        
        if ou_id:
            try:
                org_client = boto3.client('organizations')
                
                response = org_client.list_policies_for_target(
                    TargetId=ou_id,
                    Filter='SERVICE_CONTROL_POLICY'
                )
                
                policies = []
                for policy_summary in response.get('Policies', []):
                    policy_id = policy_summary['Id']
                    policy_detail = org_client.describe_policy(PolicyId=policy_id)
                    policies.append({
                        'name': policy_summary['Name'],
                        'id': policy_id,
                        'content': json.loads(policy_detail['Policy']['Content'])
                    })
                
                context += f"\n\nSCPs attached to OU {ou_id}:\n"
                context += json.dumps(policies, indent=2)
                
            except Exception as e:
                context += f"\n\nCould not fetch SCPs for OU {ou_id}: {str(e)}"
        
        return context if context else "No account or OU specified yet."
    
    @staticmethod
    def check_default_scps(account_id, actions):
        """Check if default SCPs block any of the requested actions"""
        try:
            org_client = boto3.client('organizations')
            response = org_client.list_policies_for_target(
                TargetId=account_id,
                Filter='SERVICE_CONTROL_POLICY'
            )
            
            warnings = []
            for policy_summary in response.get('Policies', []):
                policy_id = policy_summary['Id']
                policy_detail = org_client.describe_policy(PolicyId=policy_id)
                policy_content = json.loads(policy_detail['Policy']['Content'])
                
                # Check for S3 public access blocks
                for statement in policy_content.get('Statement', []):
                    if statement.get('Effect') == 'Deny':
                        denied_actions = statement.get('Action', [])
                        if isinstance(denied_actions, str):
                            denied_actions = [denied_actions]
                        
                        # Check for S3 public bucket creation
                        s3_public_actions = ['s3:PutBucketPublicAccessBlock', 's3:PutBucketAcl', 's3:PutObjectAcl']
                        if any(action in denied_actions or action in actions for action in s3_public_actions):
                            if 's3:CreateBucket' in actions or any('s3:' in a for a in actions):
                                warnings.append({
                                    'type': 's3_public_block',
                                    'message': 'Your cloud admin has created an SCP that prevents public S3 buckets. You can still create private buckets.',
                                    'policy_name': policy_summary['Name']
                                })
            
            return warnings
        except Exception as e:
            print(f"Error checking SCPs: {e}")
            return []
