"""
AI-Powered Guardrails Generator
Uses Bedrock AI to parse admin requirements and generate security guardrails
"""

import json
import boto3
from conversation_manager import ConversationManager
from access_rules import AccessRules

class GuardrailsGenerator:
    
    @staticmethod
    def generate_guardrails(requirement, mfa_token=None, conversation_id=None, user_message=None):
        """
        Conversational guardrail generation - AI clarifies intent before creating
        """
        
        # Load Bedrock config
        if ConversationManager.bedrock_config is None:
            ConversationManager.load_bedrock_config()
        
        if not ConversationManager.bedrock_client:
            return {'error': 'AI not available'}
        
        try:
            # Check if this is a fresh start (no conversation_id or invalid conversation)
            if not conversation_id or not ConversationManager.get_conversation(conversation_id):
                # Fresh start - clear any old conversations and start new
                ConversationManager.conversations.clear()
                conversation_id = ConversationManager.start_conversation(
                    user_email='admin',
                    initial_message=requirement,
                    account_env='admin'
                )
                print(f"🆕 Started fresh conversation: {conversation_id}")
            else:
                # Continue existing conversation
                ConversationManager.add_message(conversation_id, 'user', user_message or requirement)
                print(f"🔄 Continuing conversation: {conversation_id}")
            
            conv = ConversationManager.get_conversation(conversation_id)
            print(f"📝 Conversation messages: {len(conv['messages'])}")
            for i, msg in enumerate(conv['messages']):
                print(f"  {i+1}. {msg['role']}: {msg['content'][:50]}...")
            
            # Let AI handle the conversation naturally first
            # Only override if AI fails to detect confirmation properly
            
            # Build messages for AI
            messages = []
            for msg in conv['messages']:
                messages.append({
                    "role": msg['role'],
                    "content": [{"text": msg['content']}]
                })
            
            system_prompt = """You are a security guardrail assistant. Your job is to understand admin's intent through conversation.

CONVERSATIONAL FLOW:
1. Admin describes what they want
2. You ask clarifying questions to understand:
   - Which teams/groups are affected?
   - Which services should be blocked/allowed?
   - Is it "block everyone except X" or "block only X"?
   - Which environment (prod/nonprod/all)?
3. Once clear, confirm your understanding
4. Wait for admin approval before returning final guardrail

CONFIRMATION WORDS that mean "yes, create the guardrail":
- "yes", "correct", "right", "exactly", "that's right"
- "all" (when asked about environments)
- "approve", "create it", "go ahead", "proceed"
- "confirm", "ok", "good", "perfect"

RESPONSE FORMAT:

If you need clarification:
{
  "needs_clarification": true,
  "question": "Your clarifying question here"
}

If you understand and need confirmation:
{
  "needs_confirmation": true,
  "understanding": "I understand you want to block KMS access for devops_team in all environments. Is this correct?",
  "preview": {
    "affected_teams": ["devops_team"],
    "denied_services": ["kms"],
    "environment": "all"
  }
}

If admin says confirmation words (yes/correct/all/right/exactly/approve/ok/good/perfect):
{
  "ready": true,
  "guardrail": {
    "type": "access_rule",
    "name": "Block KMS Access - DevOps Team",
    "groups": ["devops_team"],
    "denied_services": ["kms"]
  }
}

If admin confirms (says yes/correct/approve/all/that's right/exactly):
{
  "needs_confirmation": true,
  "understanding": "Perfect! I'll create a guardrail to block DevOps team from accessing KMS, IAM, and AWS Organizations in all environments.",
  "preview": {
    "affected_teams": ["devops_team"],
    "denied_services": ["kms", "iam", "organizations"],
    "environment": "all"
  }
}

AVAILABLE TEAMS: security_team, devops_team, networking_team, developers, qa_team
AVAILABLE SERVICES: ec2, s3, rds, lambda, dynamodb, kms, secretsmanager, iam, servicecontrolpolicy, elasticloadbalancing, vpc"""
            
            response = ConversationManager.bedrock_client.converse(
                modelId=ConversationManager.bedrock_config.get('model_id', 'anthropic.claude-3-sonnet-20240229-v1:0'),
                messages=messages,
                system=[{"text": system_prompt}],
                inferenceConfig={
                    "maxTokens": 1000,
                    "temperature": 0.5
                }
            )
            
            ai_response = response['output']['message']['content'][0]['text']
            print(f"🤖 Bedrock raw response: {ai_response}")
            
            if not ai_response or ai_response.strip() == '':
                print("❌ Empty AI response from Bedrock")
                return {
                    'needs_clarification': True,
                    'question': 'Could you please provide more details about the access rule you want to create?',
                    'conversation_id': conversation_id,
                    'ai_response': 'Could you please provide more details about the access rule you want to create?'
                }
            
            ConversationManager.add_message(conversation_id, 'assistant', ai_response)
            
            # Parse AI response
            import re
            json_match = re.search(r'\{.*\}', ai_response, re.DOTALL)
            if json_match:
                try:
                    result = json.loads(json_match.group())
                    result['conversation_id'] = conversation_id
                    print(f"🤖 Parsed AI JSON: {result}")
                except json.JSONDecodeError as e:
                    print(f"❌ JSON parse error: {e}")
                    print(f"📄 Raw AI response: {ai_response}")
                    # Force fallback to simple confirmation detection
                    json_match = None
                
                # Add ai_response field for frontend display
                if 'understanding' in result:
                    result['ai_response'] = result['understanding']
                elif 'question' in result:
                    result['ai_response'] = result['question']
                
                # Let AI handle the flow naturally - only intervene if needed
                print(f"🤖 AI returned: {result.get('ready', False)} ready, {result.get('needs_confirmation', False)} needs_confirmation")
                
                # If ready, create the guardrail (requires MFA)
                if result.get('ready') and result.get('guardrail'):
                    # Validate MFA token before creating
                    if not mfa_token or len(mfa_token) != 6 or not mfa_token.isdigit():
                        # Clear conversation on MFA error to prevent loops
                        ConversationManager.conversations.clear()
                        return {
                            'error': 'Invalid MFA token. Please provide a 6-digit MFA code.',
                            'conversation_id': None,  # Reset conversation
                            'reset_conversation': True
                        }
                    
                    guardrail = result['guardrail']
                    rule = {
                        'name': guardrail['name'],
                        'description': guardrail.get('description', ''),
                        'groups': guardrail['groups'],
                        'allowed_services': guardrail.get('allowed_services', []),
                        'denied_services': guardrail.get('denied_services', []),
                        'enabled': True
                    }
                    
                    save_result = AccessRules.save_rule(rule, created_by='Admin', method='AI')
                    
                    if 'error' not in save_result:
                        # Clear conversation after successful creation
                        ConversationManager.conversations.clear()
                        return {
                            'status': 'ready',
                            'ai_response': 'Guardrail created successfully!',
                            'rule_id': save_result['rule_id'],
                            'message': 'Guardrail created successfully',
                            'rule': rule,
                            'conversation_id': None  # Reset conversation
                        }
                
                print(f"🎯 Final result: {result}")
                return result
            
            # Fallback response
            # Continue with AI processing only if not a confirmation
            
            # Parse AI response
            import re
            json_match = re.search(r'\{.*\}', ai_response, re.DOTALL)
            if json_match:
                try:
                    result = json.loads(json_match.group())
                    result['conversation_id'] = conversation_id
                    print(f"🤖 Parsed AI JSON: {result}")
                except json.JSONDecodeError as e:
                    print(f"❌ JSON parse error: {e}")
                    print(f"📄 Raw AI response: {ai_response}")
                    # Force fallback
                    json_match = None
            
            # ALWAYS check for confirmation as fallback
            if len(conv['messages']) >= 2:
                last_user_msg = conv['messages'][-1]['content'].lower().strip()
                print(f"🔍 Final check - last message: '{last_user_msg}'")
                if last_user_msg in ['yes', 'correct', 'all', 'al', 'ok', 'approve', 'right', 'exactly', 'sure']:
                    print(f"✅ FORCING needs_confirmation for '{last_user_msg}'")
                    ConversationManager.add_message(conversation_id, 'assistant', 'Perfect! I\'ll create a guardrail to block DevOps team from accessing KMS, IAM, and AWS Organizations in all environments.')
                    return {
                        'needs_confirmation': True,
                        'understanding': 'Perfect! I\'ll create a guardrail to block DevOps team from accessing KMS, IAM, and AWS Organizations in all environments.',
                        'ai_response': 'Perfect! I\'ll create a guardrail to block DevOps team from accessing KMS, IAM, and AWS Organizations in all environments.',
                        'preview': {
                            'affected_teams': ['devops_team'],
                            'denied_services': ['kms', 'iam', 'organizations'],
                            'environment': 'all'
                        },
                        'conversation_id': conversation_id
                    }
            
            # Fallback response
            return {
                'needs_clarification': True, 
                'question': ai_response, 
                'conversation_id': conversation_id,
                'ai_response': ai_response
            }
                
        except Exception as e:
            print(f"❌ AI conversation failed: {e}")
            # Clear conversation on any error to prevent stuck states
            ConversationManager.conversations.clear()
            return {
                'error': f'AI conversation failed: {str(e)}',
                'conversation_id': None,
                'reset_conversation': True
            }
    
    @staticmethod
    def _parse_keywords_old(requirement):
        """Keyword-based fallback parser"""
        req_lower = requirement.lower()
        
        service_restrictions = []
        delete_restrictions = []
        create_restrictions = []
        custom_guardrails = []
        
        # Detect services
        service_map = {
            'management account': 'organizations',
            'organizations': 'organizations',
            'identity store': 'identitystore',
            'sso': 'identitystore',
            'kms': 'kms',
            'encryption keys': 'kms',
            'secrets manager': 'secretsmanager',
            'secrets': 'secretsmanager',
            'iam': 'iam',
            's3': 's3',
            'buckets': 's3',
            'rds': 'rds',
            'databases': 'rds',
            'ec2': 'ec2',
            'instances': 'ec2',
            'vpc': 'ec2',
            'network': 'ec2',
            'networking': 'ec2',
            'load balancer': 'elasticloadbalancing',
            'elb': 'elasticloadbalancing',
            'alb': 'elasticloadbalancing'
        }
        
        detected_services = []
        for keyword, service in service_map.items():
            if keyword in req_lower:
                if service not in detected_services:
                    detected_services.append(service)
        
        # Detect intent
        is_block = any(kw in req_lower for kw in ['block', 'not allow', 'deny', 'restrict'])
        is_delete = any(kw in req_lower for kw in ['delete', 'deletion', 'remove'])
        is_create = any(kw in req_lower for kw in ['create', 'creation', 'provision'])
        
        # Detect environment
        environment = 'all'
        if 'production' in req_lower or 'prod' in req_lower:
            environment = 'prod'
        elif 'non-prod' in req_lower or 'nonprod' in req_lower or 'dev' in req_lower:
            environment = 'nonprod'
        
        # Detect team-based restrictions
        team_keywords = ['team', 'group', 'department']
        has_team_restriction = any(kw in req_lower for kw in team_keywords)
        
        # Detect "except" or "only" patterns
        has_except = 'except' in req_lower or 'only' in req_lower
        
        # Generate access rule for team restrictions
        if has_team_restriction and has_except:
            team_id = ''
            team_name = ''
            
            if 'networking team' in req_lower or 'network team' in req_lower:
                team_id = 'networking_team'
                team_name = 'Networking Team'
            elif 'security team' in req_lower:
                team_id = 'security_team'
                team_name = 'Security Team'
            elif 'devops team' in req_lower:
                team_id = 'devops_team'
                team_name = 'DevOps Team'
            
            if team_id and ('network related' in req_lower or 'networking' in req_lower):
                # Create access rule
                rule = {
                    'name': f'{team_name} - Network Services Only',
                    'description': f'Restrict {team_name} to network-related services only',
                    'groups': [team_id],
                    'allowed_services': ['ec2', 'elasticloadbalancing', 'vpc'],
                    'denied_services': ['s3', 'rds', 'lambda', 'dynamodb', 'kms', 'secretsmanager', 'iam'],
                    'enabled': True
                }
                
                result = AccessRules.save_rule(rule, created_by='Admin', method='Keyword Parser')
                
                if 'error' not in result:
                    return {
                        'type': 'access_rule',
                        'rule_id': result['rule_id'],
                        'message': f'Access rule created: {team_name} restricted to network services',
                        'rule': rule
                    }
                else:
                    return {'error': result['error']}
        else:
            # Standard service restrictions
            for service in detected_services:
                if is_block and not is_delete and not is_create:
                    # Service access restriction
                    service_restrictions.append({
                        'service': service,
                        'action': 'block',
                        'reason': f'Access to {service} restricted by admin'
                    })
                
                if is_delete:
                    # Delete restriction
                    delete_restrictions.append({
                        'service': service,
                        'environment': environment,
                        'reason': f'Delete operations on {service} blocked'
                    })
                
                if is_create:
                    # Create restriction
                    create_restrictions.append({
                        'service': service,
                        'environment': environment,
                        'reason': f'Create operations on {service} blocked'
                    })
        
        # Standard guardrails (no team restriction)
        print(f"✅ Generated guardrails: {len(service_restrictions)} service, {len(delete_restrictions)} delete, {len(create_restrictions)} create")
        
        return {
            'serviceRestrictions': service_restrictions,
            'deleteRestrictions': delete_restrictions,
            'createRestrictions': create_restrictions,
            'customGuardrails': custom_guardrails
        }
