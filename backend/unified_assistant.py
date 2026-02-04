"""
Unified AI Assistant - Combines Help + Policy Builder
Handles tool guidance AND policy generation through conversational flow
"""

import json
import boto3
import os
from conversation_manager import ConversationManager
from access_rules import AccessRules
from strict_policies import StrictPolicies

class UnifiedAssistant:
    """Unified assistant for both guidance and policy building"""
    
    # Conversation state keys
    STATE_KEYS = {
        'ACCOUNT': 'account_id',
        'REGION': 'region',
        'USE_CASE': 'use_case',
        'SERVICES': 'services',
        'RESOURCES': 'resources',
        'PERMISSION_SET': 'permission_set',
        'DURATION': 'duration_hours',
        'JUSTIFICATION': 'justification'
    }
    
    @staticmethod
    def detect_prompt_injection(user_message):
        """Detect prompt injection attempts"""
        message_lower = user_message.lower()
        
        injection_patterns = [
            'ignore previous', 'ignore all previous', 'disregard previous',
            'forget previous', 'forget all', 'ignore above', 'disregard above',
            'ignore instructions', 'new instructions', 'system prompt',
            'act as', 'pretend to be', 'you are now', 'roleplay',
            'jailbreak', 'dan mode', 'developer mode',
            'reveal your prompt', 'show your instructions', 'what are your instructions',
            'bypass restrictions', 'override', 'sudo mode',
            '</system>', '<|im_end|>', '<|endoftext|>',
            'print your prompt', 'output your system', 'repeat your instructions'
        ]
        
        for pattern in injection_patterns:
            if pattern in message_lower:
                return True
        
        special_char_count = sum(1 for c in user_message if c in '{}[]<>|\\`~')
        if special_char_count > 10:
            return True
        
        return False
    
    @staticmethod
    def get_conversation_state(conversation_id):
        """Get current conversation state"""
        conv = ConversationManager.get_conversation(conversation_id)
        if not conv:
            return {}
        
        return {
            'account_id': conv.get('account_id'),
            'region': conv.get('region'),
            'use_case': conv.get('use_case'),
            'services': conv.get('services', []),
            'resources': conv.get('selected_resources', {}),
            'permission_set': conv.get('permission_set'),
            'use_custom_permissions': conv.get('use_custom_permissions', False),
            'duration_hours': conv.get('duration_hours'),
            'justification': conv.get('justification'),
            'step': conv.get('step', 'welcome')
        }
    
    @staticmethod
    def update_conversation_state(conversation_id, updates):
        """Update conversation state"""
        conv = ConversationManager.get_conversation(conversation_id)
        if not conv:
            return False
        
        for key, value in updates.items():
            conv[key] = value
        
        return True
    
    @staticmethod
    def determine_next_step(conversation_id, user_message):
        """Determine what information is missing and what to ask next"""
        state = UnifiedAssistant.get_conversation_state(conversation_id)
        
        # Check if this is a help question (not policy building)
        help_keywords = ['how', 'what', 'where', 'why', 'help', 'guide', 'explain', 'show me', 'tell me']
        is_help_question = any(keyword in user_message.lower() for keyword in help_keywords)
        
        if is_help_question and not state.get('use_case'):
            # This is a help question, not policy building
            return {
                'type': 'help',
                'step': 'help'
            }
        
        # Policy building flow - structured flow
        # Account → Regions → Permission Sets → Services → Resources (MUST) → Actions → Policy
        
        if not state.get('account_id'):
            return {
                'type': 'policy_building',
                'step': 'account',
                'missing': ['account']
            }
        
        # Check if user wants to use existing permission set or create new
        # Ask this BEFORE region (region only needed for custom permissions to fetch resources)
        if not state.get('permission_set') and not state.get('use_custom_permissions'):
            return {
                'type': 'policy_building',
                'step': 'permission_set',
                'missing': ['permission_set']
            }
        
        # If user wants custom permissions, ask for region first (needed for resource fetching)
        if state.get('use_custom_permissions') or not state.get('permission_set'):
            # For custom permissions, we need region to fetch resources
            if not state.get('region'):
                return {
                    'type': 'policy_building',
                    'step': 'region',
                    'missing': ['region']
                }
            
            if not state.get('services') or len(state.get('services', [])) == 0:
                return {
                    'type': 'policy_building',
                    'step': 'services',
                    'missing': ['services']
                }
            
            # Check if all services have resources selected (COMPULSORY)
            selected_resources = state.get('selected_resources', {})
            services = state.get('services', [])
            
            for service in services:
                if service not in selected_resources or len(selected_resources.get(service, [])) == 0:
                    return {
                        'type': 'policy_building',
                        'step': 'resources',
                        'missing': ['resources'],
                        'current_service': service
                    }
            
            # Check if actions are specified
            if not state.get('actions') or len(state.get('actions', [])) == 0:
                return {
                    'type': 'policy_building',
                    'step': 'actions',
                    'missing': ['actions']
                }
        
        # Check justification
        if not state.get('justification'):
            return {
                'type': 'policy_building',
                'step': 'justification',
                'missing': ['justification']
            }
        
        # All information collected, ready to generate
        return {
            'type': 'policy_building',
            'step': 'ready',
            'missing': []
        }
    
    @staticmethod
    def extract_info_from_message(user_message, step):
        """Extract relevant information from user message based on current step"""
        message_lower = user_message.lower()
        extracted = {}
        
        if step == 'account':
            # Try to extract account ID or name
            # Look for patterns like "account 123456789012" or "nykaa-fashion"
            import re
            account_pattern = r'account[:\s]+([a-z0-9-]+)'
            match = re.search(account_pattern, message_lower)
            if match:
                extracted['account_id'] = match.group(1)
        
        elif step == 'region':
            # Extract region
            regions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-south-1', 'ap-southeast-1']
            for region in regions:
                if region in message_lower:
                    extracted['region'] = region
                    break
        
        elif step == 'use_case':
            # Use case is the message itself
            extracted['use_case'] = user_message
        
        elif step == 'services':
            # Extract AWS services
            services_map = {
                's3': 's3',
                'ec2': 'ec2',
                'lambda': 'lambda',
                'rds': 'rds',
                'dynamodb': 'dynamodb',
                'kms': 'kms',
                'secrets': 'secretsmanager',
                'secrets manager': 'secretsmanager',
                'iam': 'iam',
                'cloudwatch': 'cloudwatch',
                'logs': 'logs',
                'sns': 'sns',
                'sqs': 'sqs',
                'vpc': 'vpc',
                'elb': 'elasticloadbalancing',
                'load balancer': 'elasticloadbalancing'
            }
            
            found_services = []
            for keyword, service in services_map.items():
                if keyword in message_lower:
                    if service not in found_services:
                        found_services.append(service)
            
            if found_services:
                extracted['services'] = found_services
        
        elif step == 'justification':
            extracted['justification'] = user_message
        
        return extracted
    
    @staticmethod
    def get_response(user_message, conversation_id=None, available_accounts=None, available_regions=None, available_services=None, permission_sets=None):
        """
        Main entry point for unified assistant
        Handles both help questions and policy building
        """
        # Ensure user_message is a non-empty string
        if not user_message or not isinstance(user_message, str) or not user_message.strip():
            return {
                'error': 'Message is required and cannot be empty',
                'ai_response': 'Please provide a message or question.',
                'conversation_id': conversation_id
            }
        
        # Detect prompt injection
        if UnifiedAssistant.detect_prompt_injection(user_message):
            return {
                'ai_response': "I'm the GovernAIX Assistant. I can help you navigate the system or build access policies. What would you like to do?",
                'conversation_id': conversation_id,
                'blocked': True
            }
        
        # Load Bedrock config
        if ConversationManager.bedrock_config is None:
            ConversationManager.load_bedrock_config()
        
        if not ConversationManager.bedrock_client:
            return {'error': 'AI not available'}
        
        # Start or continue conversation
        if not conversation_id or not ConversationManager.get_conversation(conversation_id):
            # Extract account/region from initial message if present
            account_id = None
            region = 'ap-south-1'
            
            # Try to extract account from message
            if available_accounts:
                message_lower = user_message.lower()
                for acc in available_accounts:
                    if acc.get('name', '').lower() in message_lower or acc.get('id', '') in message_lower:
                        account_id = acc.get('id')
                        break
            
            conversation_id = ConversationManager.start_conversation(
                user_email='user',
                initial_message=user_message.strip() if user_message else 'Hello',
                account_env='nonprod',
                account_id=account_id,
                region=region
            )
            # Initialize state
            UnifiedAssistant.update_conversation_state(conversation_id, {
                'step': 'welcome',
                'services': [],
                'selected_resources': {},
                'account_id': account_id,
                'region': region
            })
        else:
            # Only add message if it's not empty
            if user_message and user_message.strip():
                ConversationManager.add_message(conversation_id, 'user', user_message.strip())
        
        # Get current state
        state = UnifiedAssistant.get_conversation_state(conversation_id)
        current_step = state.get('step', 'welcome')
        
        # Determine next step
        next_step_info = UnifiedAssistant.determine_next_step(conversation_id, user_message)
        step_type = next_step_info['type']
        next_step = next_step_info['step']
        
        # Extract information from message if applicable
        if step_type == 'policy_building' and next_step != 'ready':
            extracted = UnifiedAssistant.extract_info_from_message(user_message, next_step)
            if extracted:
                UnifiedAssistant.update_conversation_state(conversation_id, extracted)
                # Re-check state after extraction
                state = UnifiedAssistant.get_conversation_state(conversation_id)
                next_step_info = UnifiedAssistant.determine_next_step(conversation_id, user_message)
                next_step = next_step_info['step']
        
        # Build system prompt based on context
        system_prompt = UnifiedAssistant._build_system_prompt(
            step_type, 
            next_step, 
            state,
            available_accounts,
            available_regions
        )
        
        # Get conversation messages
        conv = ConversationManager.get_conversation(conversation_id)
        messages = []
        for msg in conv.get('messages', []):
            # Skip empty messages to avoid ValidationException
            content = msg.get('content', '')
            if isinstance(content, str):
                content = content.strip()
            else:
                content = str(content).strip()
            
            if not content:
                continue
                
            messages.append({
                "role": msg.get('role', 'user'),
                "content": [{"text": content}]
            })
        
        # Ensure we have at least one user message
        if not messages or not any(m.get('role') == 'user' for m in messages):
            # If no messages, add the current user message
            if user_message and user_message.strip():
                messages.insert(0, {
                    "role": "user",
                    "content": [{"text": user_message.strip()}]
                })
            else:
                # If still no message, return error
                return {
                    'error': 'No valid message content provided',
                    'ai_response': 'Please provide a message or question.',
                    'step_type': step_type,
                    'next_step': next_step,
                    'state': state
                }
        
        # Final validation - ensure no empty text fields
        messages = [m for m in messages if m.get('content') and len(m.get('content', [])) > 0 and m['content'][0].get('text', '').strip()]
        
        if not messages:
            return {
                'error': 'No valid message content provided',
                'ai_response': 'Please provide a message or question.',
                'step_type': step_type,
                'next_step': next_step,
                'state': state
            }
        
        # Call Bedrock
        try:
            response = ConversationManager.bedrock_client.converse(
                modelId=ConversationManager.bedrock_config.get('model_id', 'anthropic.claude-3-sonnet-20240229-v1:0'),
                messages=messages,
                system=[{"text": system_prompt}],
                inferenceConfig={
                    "maxTokens": 1000,
                    "temperature": 0.7
                }
            )
            
            ai_response = response['output']['message']['content'][0]['text']
            ConversationManager.add_message(conversation_id, 'assistant', ai_response)
            
            # Update step in state
            if step_type == 'policy_building':
                UnifiedAssistant.update_conversation_state(conversation_id, {'step': next_step})
            
            # Re-get state after updates
            state = UnifiedAssistant.get_conversation_state(conversation_id)
            
            # Prepare response
            result = {
                'ai_response': ai_response,
                'conversation_id': conversation_id,
                'type': step_type,
                'step': next_step,
                'state': {
                    'account_id': state.get('account_id'),
                    'region': state.get('region', 'ap-south-1'),
                    'use_case': state.get('use_case'),
                    'services': state.get('services', []),
                    'resources': state.get('resources', {}),
                    'justification': state.get('justification'),
                    'step': state.get('step', 'welcome')
                }
            }
            
            # If ready to generate, include that flag
            if next_step == 'ready':
                result['ready_to_generate'] = True
                result['collected_data'] = {
                    'account_id': state.get('account_id'),
                    'region': state.get('region', 'ap-south-1'),
                    'use_case': state.get('use_case'),
                    'services': state.get('services', []),
                    'resources': state.get('resources', {}),
                    'justification': state.get('justification')
                }
            
            return result
            
        except Exception as e:
            print(f"❌ Unified Assistant failed: {e}")
            import traceback
            traceback.print_exc()
            return {'error': str(e)}
    
    @staticmethod
    def _build_system_prompt(step_type, step, state, available_accounts=None, available_regions=None):
        """Build system prompt based on current context"""
        
        if step_type == 'help':
            return """You are the GovernAIX Help Assistant. Your purpose is helping users navigate the JIT access management system.

VALID TOPICS:
- GovernAIX features and navigation
- How to request access (AWS, EC2, databases, S3)
- Approval workflows and processes
- Troubleshooting access requests
- Understanding policies and guardrails
- Admin panel features (for admins)

RESPONSE GUIDELINES:
- Answer questions about GovernAIX features
- Guide users step-by-step through workflows
- Explain approval processes
- Help troubleshoot access issues
- Be concise and helpful

IF USER ASKS ABOUT CREATING ACCESS/POLICIES: Guide them to use the conversational policy builder by saying "I can help you build an access policy! Just tell me what you need to do, and I'll guide you through the process step by step."
"""
        
        # Policy building prompts
        base_policy_prompt = """You are the GovernAIX Policy Builder Assistant. Your job is to help users build AWS access policies through a conversational flow.

You will collect information step by step:
1. AWS Account
2. Region
3. What they need to do (use case)
4. AWS Services needed
5. Specific Resources (if any)
6. Business Justification

Be friendly, conversational, and ask one question at a time. Don't overwhelm the user.

"""
        
        if step == 'welcome':
            return base_policy_prompt + """
The user just started. Welcome them and ask: "Hi! I can help you build an AWS access policy. Let's start - which AWS account do you need access to?"
"""
        
        elif step == 'account':
            accounts_text = ""
            if available_accounts:
                accounts_text = "\n\nAvailable accounts:\n" + "\n".join([f"- {acc.get('name', acc.get('id'))} ({acc.get('id')})" for acc in available_accounts])
            
            return base_policy_prompt + f"""
The user needs to select an AWS account. Ask them which account they need access to.
{accounts_text}

If they mention an account name or ID, acknowledge it and move to the next step.
"""
        
        elif step == 'region':
            regions_text = ""
            if available_regions:
                regions_text = "\n\nCommon regions:\n" + "\n".join([f"- {r}" for r in available_regions])
            
            return base_policy_prompt + f"""
Account selected: {state.get('account_id')}

Now ask about the region. Default is ap-south-1 if not specified.
{regions_text}
"""
        
        elif step == 'use_case':
            return base_policy_prompt + f"""
Account: {state.get('account_id')}
Region: {state.get('region', 'ap-south-1')}

Now ask: "What do you need to do? Describe your task or use case."
"""
        
        elif step == 'services':
            return base_policy_prompt + f"""
Account: {state.get('account_id')}
Region: {state.get('region', 'ap-south-1')}
Use Case: {state.get('use_case')}

Based on the use case, ask about which AWS services they need. You can suggest services based on their use case.
Common services: EC2, S3, Lambda, RDS, DynamoDB, KMS, Secrets Manager, IAM, CloudWatch, etc.

Ask: "Which AWS services do you need access to? (e.g., S3, EC2, Lambda)"
"""
        
        elif step == 'resources':
            services_list = ", ".join(state.get('services', []))
            return base_policy_prompt + f"""
Account: {state.get('account_id')}
Region: {state.get('region', 'ap-south-1')}
Use Case: {state.get('use_case')}
Services: {services_list}

Now ask about specific resources if needed. For example:
- S3: bucket names
- EC2: instance IDs or tags
- Lambda: function names
- RDS: database identifiers

Ask: "Do you need access to specific resources, or can I use wildcards (*)? If specific, please provide the resource names/IDs."
"""
        
        elif step == 'justification':
            return base_policy_prompt + f"""
Account: {state.get('account_id')}
Region: {state.get('region', 'ap-south-1')}
Use Case: {state.get('use_case')}
Services: {', '.join(state.get('services', []))}

Almost done! Ask for business justification: "What's the business reason for this access? (Required for approval)"
"""
        
        elif step == 'ready':
            return base_policy_prompt + f"""
All information collected:
- Account: {state.get('account_id')}
- Region: {state.get('region', 'ap-south-1')}
- Use Case: {state.get('use_case')}
- Services: {', '.join(state.get('services', []))}
- Justification: {state.get('justification')}

Confirm with the user: "Perfect! I have all the information. Ready to generate your access policy. Should I proceed?"
"""
        
        return base_policy_prompt

