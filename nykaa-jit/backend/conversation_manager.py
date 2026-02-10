"""
Conversational AI Manager - Supports both AWS Bedrock AI and keyword-based fallback
"""

import json
import boto3
import re
import os
from datetime import datetime, timedelta
from botocore.exceptions import ClientError, NoCredentialsError

class ConversationManager:
    conversations = {}
    bedrock_config = None
    bedrock_client = None
    
    @staticmethod
    def load_bedrock_config():
        """Load Bedrock configuration from file"""
        try:
            config_path = os.path.join(os.path.dirname(__file__), 'bedrock_config.json')
            with open(config_path, 'r') as f:
                ConversationManager.bedrock_config = json.load(f)
                
            # Initialize Bedrock client if enabled
            if ConversationManager.bedrock_config.get('enabled'):
                # Use environment credentials (from terminal export)
                ConversationManager.bedrock_client = boto3.client(
                    'bedrock-runtime',
                    region_name=ConversationManager.bedrock_config.get('aws_region', 'ap-south-1')
                )
                print("✅ Bedrock AI enabled (using environment credentials)")
            else:
                print("⚠️ Bedrock AI disabled - using keyword-based fallback")
        except Exception as e:
            print(f"⚠️ Failed to load Bedrock config: {e}. Using keyword-based fallback.")
            ConversationManager.bedrock_config = {'enabled': False}
    
    @staticmethod
    def start_conversation(user_email, initial_message, account_env='nonprod', selected_resources=None, account_id=None, region=None):
        # Clear old conversations
        ConversationManager.conversations.clear()
        conversation_id = f"{user_email}_{datetime.now().timestamp()}"
        ConversationManager.conversations[conversation_id] = {
            'user_email': user_email,
            'account_env': account_env,
            'account_id': account_id,
            'region': region or 'ap-south-1',
            'messages': [{'role': 'user', 'content': initial_message}],
            'selected_resources': selected_resources or {},
            'started_at': datetime.now(),
            'expires_at': datetime.now() + timedelta(minutes=5)
        }
        return conversation_id
    
    @staticmethod
    def add_message(conversation_id, role, content):
        if conversation_id not in ConversationManager.conversations:
            return False
        ConversationManager.conversations[conversation_id]['messages'].append({'role': role, 'content': content})
        return True
    
    @staticmethod
    def get_conversation(conversation_id):
        return ConversationManager.conversations.get(conversation_id)
    
    @staticmethod
    def is_expired(conversation_id):
        conv = ConversationManager.get_conversation(conversation_id)
        if not conv:
            return True
        return datetime.now() > conv['expires_at']
    
    @staticmethod
    def _load_guardrails():
        """Load guardrails from config file"""
        try:
            import os
            guardrails_path = os.path.join(os.path.dirname(__file__), 'guardrails_config.json')
            if os.path.exists(guardrails_path):
                with open(guardrails_path, 'r') as f:
                    import json
                    return json.load(f)
        except:
            pass
        return {'serviceRestrictions': [], 'deleteRestrictions': [], 'createRestrictions': [], 'customGuardrails': []}
    
    @staticmethod
    def _format_guardrails_for_prompt(guardrails):
        """Format guardrails for AI system prompt"""
        lines = ["GUARDRAILS (MUST ENFORCE):"]
        
        # Service restrictions
        if guardrails.get('serviceRestrictions'):
            lines.append("\nBLOCKED SERVICES:")
            for rule in guardrails['serviceRestrictions']:
                service = rule.get('service', '')
                action = rule.get('action', 'block')
                reason = rule.get('reason', 'Restricted')
                if action == 'block':
                    lines.append(f"- {service.upper()}: BLOCKED - {reason}")
        
        # Delete restrictions
        if guardrails.get('deleteRestrictions'):
            lines.append("\nDELETE RESTRICTIONS:")
            for rule in guardrails['deleteRestrictions']:
                service = rule.get('service', '')
                env = rule.get('environment', 'all')
                reason = rule.get('reason', 'Delete blocked')
                lines.append(f"- {service.upper()} delete in {env}: BLOCKED - {reason}")
        
        # Create restrictions
        if guardrails.get('createRestrictions'):
            lines.append("\nCREATE RESTRICTIONS:")
            for rule in guardrails['createRestrictions']:
                service = rule.get('service', '')
                env = rule.get('environment', 'all')
                reason = rule.get('reason', 'Create blocked')
                lines.append(f"- {service.upper()} create in {env}: BLOCKED - {reason}")
        
        if len(lines) == 1:
            return "GUARDRAILS: None configured"
        
        return "\n".join(lines)
    
    @staticmethod
    def detect_malicious_input(user_message):
        """Detect obvious prompt injection attempts"""
        message_lower = user_message.lower()
        
        # Only block OBVIOUS manipulation attempts, not legitimate AWS requests
        malicious_patterns = [
            'you are no longer', 'you are now a', 'act as a', 'pretend you are',
            'switch to developer mode', 'enable developer mode', 'jailbreak',
            'override your system', 'bypass restrictions', 'sudo mode',
            'reveal your prompt', 'show your instructions', 'print your prompt',
            '[system message]', '[developer note]', '[override]', '[debug mode]'
        ]
        
        for pattern in malicious_patterns:
            if pattern in message_lower:
                return True
        return False
    
    @staticmethod
    def ask_ai_clarification(conversation_id, selected_resources=None):
        """AI clarification using Bedrock or keyword-based fallback"""
        print(f"🤖 AI Clarification called for: {conversation_id}")
        
        # Check for obvious prompt injection
        conv = ConversationManager.get_conversation(conversation_id)
        if conv and conv['messages']:
            last_message = conv['messages'][-1]['content']
            if ConversationManager.detect_malicious_input(last_message):
                print(f"⚠️ MALICIOUS INPUT BLOCKED: {last_message[:100]}")
                return {
                    'needs_clarification': True,
                    'question': "I can only help generate AWS IAM permissions based on your requirements. What AWS actions do you need?",
                    'grouped_actions': {},
                    'ready': False
                }
        
        # CRITICAL: Reload guardrails on EVERY call (admin may have changed them)
        guardrails = ConversationManager._load_guardrails()
        print(f"🔄 Guardrails reloaded: {len(guardrails.get('deleteRestrictions', []))} delete rules")
        
        # Update selected_resources if provided
        if selected_resources and conversation_id in ConversationManager.conversations:
            ConversationManager.conversations[conversation_id]['selected_resources'] = selected_resources
        
        # Load config if not loaded
        if ConversationManager.bedrock_config is None:
            ConversationManager.load_bedrock_config()
        
        # Try Bedrock AI first if enabled
        if ConversationManager.bedrock_client:
            try:
                return ConversationManager._ask_bedrock_ai(conversation_id)
            except Exception as e:
                print(f"⚠️ Bedrock AI failed: {e}. Falling back to keyword-based.")
                return ConversationManager._ask_keyword_based(conversation_id)
        else:
            return ConversationManager._ask_keyword_based(conversation_id)
    
    @staticmethod
    def _ask_bedrock_ai(conversation_id):
        """Use AWS Bedrock for intelligent conversation"""
        print(f"🧠 Using Bedrock AI for conversation: {conversation_id}")
        conv = ConversationManager.get_conversation(conversation_id)
        if not conv or ConversationManager.is_expired(conversation_id):
            return {'ready': True, 'timeout': True}
        
        # Check if Bedrock client is available
        if not ConversationManager.bedrock_client:
            print("⚠️ Bedrock client not initialized, using fallback")
            return ConversationManager._ask_keyword_based(conversation_id)
        
        # Get selected resources
        selected_resources = conv.get('selected_resources', {})
        selected_services = list(selected_resources.keys()) if selected_resources else []
        
        # Extract account ID and region from selected resources
        account_id = conv.get('account_id', 'UNKNOWN')
        region = 'ap-south-1'  # Default region
        
        # Try to extract from first resource ARN
        selected_resources = conv.get('selected_resources', {})
        for service, resources in selected_resources.items():
            if resources:
                first_arn = resources[0].get('id', '')
                if 'arn:aws:' in first_arn:
                    parts = first_arn.split(':')
                    if len(parts) >= 5:
                        region = parts[3]
                        account_id = parts[4]
                    break
        
        # Build conversation history for Bedrock
        messages = []
        for msg in conv['messages']:
            # Add selected_resources context to EVERY user message
            if msg['role'] == 'user' and selected_services:
                # Build resource ARN list
                resource_arns = []
                for service, resources in selected_resources.items():
                    arns = [r.get('id', '') for r in resources]
                    resource_arns.append(f"{service}: {', '.join(arns)}")
                
                content_text = f"[ACCOUNT_ID: {account_id}]\n[REGION: {region}]\n[SELECTED_SERVICES: {', '.join(selected_services)}]\n[SELECTED_RESOURCES: {' | '.join(resource_arns)}]\n{msg['content']}"
            else:
                content_text = msg['content']
            
            messages.append({
                "role": msg['role'],
                "content": [{"text": content_text}]
            })
        
        # System prompt for AWS permission understanding
        # Load guardrails
        guardrails = ConversationManager._load_guardrails()
        guardrails_text = ConversationManager._format_guardrails_for_prompt(guardrails)
        
        # Extract user name from email
        user_name = conv.get('user_email', 'User').split('@')[0].replace('.', ' ').title()
        
        system_prompt = f"""🚨 MANDATORY RULE #1 - TERMINAL ACCESS:

IF user message contains ANY of these keywords:
- "connect" (with ec2 context)
- "ssh"
- "login"
- "terminal"
- "shell"
- "access ec2" (in terminal context)

THEN you MUST respond with redirect_to_terminal=true.

EXAMPLES:
"need to connect ec2" → redirect_to_terminal: true
"connect to ec2" → redirect_to_terminal: true
"want to connect" → redirect_to_terminal: true
"ssh to instance" → redirect_to_terminal: true
"terminal access" → redirect_to_terminal: true

DO NOT generate any IAM permissions for terminal/SSH requests.

Response:
{{
  "redirect_to_terminal": true,
  "message": "For terminal/SSH access to EC2 instances, please use the Instances page under Workloads section."
}}

---

You are an AWS IAM expert helping {user_name} build a permission policy through conversation.

IMPORTANT: If user wants to CONNECT/SSH/LOGIN to EC2, redirect to terminal page. Do NOT generate IAM permissions for terminal access.

CONTEXT:
- Account ID: Check [ACCOUNT_ID: ...] tag - use this in ALL ARNs
- Region: Check [REGION: ...] tag - use this in ALL ARNs
- User selected services: Check [SELECTED_SERVICES: ...] tag
- User selected resources: Check [SELECTED_RESOURCES: ...] tag for specific ARNs

🚨 CRITICAL ARN RULE:
ALWAYS use the EXACT values from context:
- [ACCOUNT_ID: 867625663987] → Use 867625663987 in ARN, NOT * or YOUR-ACCOUNT-ID
- [REGION: ap-south-1] → Use ap-south-1 in ARN, NOT * or YOUR-REGION
- [SELECTED_RESOURCES: dynamodb: arn:aws:dynamodb:ap-south-1:867625663987:table/MyTable]
  → Use EXACT ARN: arn:aws:dynamodb:ap-south-1:867625663987:table/MyTable

NEVER use placeholders or wildcards when actual values are provided!

""" + guardrails_text + """

IMPORTANT - THIS IS A CONVERSATION:
User is ADDING permissions across multiple messages. When they say "also need to...", "and I need...", "yes I need to...", they want to ADD to previous permissions, NOT replace them.

Look at conversation history - if you already generated actions, KEEP THEM and ADD new ones.

Example conversation:
User: "connect to EC2" → You give: [ssm:StartSession, ec2:DescribeInstances]
User: "also take AMI" → You give: [ssm:StartSession, ec2:DescribeInstances, ec2:StopInstances, ec2:CreateImage, ec2:StartInstances]
User: "and delete it" → You give: [ssm:StartSession, ec2:DescribeInstances, ec2:StopInstances, ec2:CreateImage, ec2:StartInstances, ec2:TerminateInstances]

ALWAYS include ALL actions from the entire conversation in your response.

CRITICAL AWS IAM PRINCIPLE - VISIBILITY FIRST:
For ANY action on ANY resource, user MUST be able to see/list it first.
ALWAYS include read permissions (Describe*, List*, Get*) along with the action.

Why? You cannot delete/modify what you cannot see in AWS console.

Pattern:
- Write action → Include Describe/List + Write
- Delete action → Include Describe/List + Delete
- Modify action → Include Describe/List + Modify

Think: "What does user need to see in console to perform this action?"
Then add those Describe/List/Get permissions FIRST, then the action permission.

KEY PRINCIPLES:
- ACCUMULATE actions across conversation - never remove previous actions
- Think about dependencies and cross-service permissions
- Use specific ARNs from [SELECTED_RESOURCES], not wildcards
- If vague, ASK for clarification
- IMPORTANT: iam:PassRole needs "*" or role ARN as resource, NOT EC2 instance ARN

RESOURCE ARNs - CRITICAL RULES:

🚨 RULE #1: User selected specific resources = They want to work on THOSE resources
- NEVER use "*" for actions on selected resources
- ALWAYS use the EXACT ARN from [SELECTED_RESOURCES] including account ID and region
- Example: If selected resource is "arn:aws:dynamodb:ap-south-1:867625663987:table/MyTable"
  Then use: "arn:aws:dynamodb:ap-south-1:867625663987:table/MyTable"
  NOT: "arn:aws:dynamodb:*:*:table/MyTable"

🚨 RULE #2: When user mentions RELATED resources (security groups, target groups, volumes)
- ASK: "Do you want to modify the security group attached to this ALB, or a different security group?"
- If they say "this ALB's security group" → Use specific security group ARN if known, else ask for SG ID
- If they say "any security group" or "new security group" → Use "*"

🚨 RULE #3: "*" is ONLY for:
- Creating NEW resources (RunInstances, CreateImage, CreateSnapshot)
- Reading/Listing multiple resources (Describe*, List*, Get*)
- When user explicitly says "any" or "all"

Example conversations:
User: "modify security group inbound rules" + selected ALB
You: "Do you want to modify the security group attached to this ALB (arn:...:loadbalancer/...), or any security group?"
User: "this ALB's security group"
You: Use "arn:aws:ec2:*:*:security-group/*" (since we don't know exact SG ID)

User: "attach to target group" + selected ALB
You: "Do you want to work with the target group attached to this ALB, or a different target group?"
User: "this ALB's target group"
You: Use specific target group ARN if in [SELECTED_RESOURCES], else ask for target group name

User: "create AMI" + selected instance
You: Use "*" for AMI resource (creating NEW), but instance ARN for source

DO NOT assume "*" - ALWAYS prefer specific ARNs when user selected resources!

CONVERSATION FLOW - DYNAMIC POLICY BUILDER:
1. User describes what they want
2. If AMBIGUOUS (e.g., "modify security group" but unclear which SG):
   - ASK: "Do you want to modify the security group attached to [selected resource], or a different one?"
   - Wait for clarification before adding actions
3. Once clear, IMMEDIATELY return grouped_actions with current understanding
4. Ask naturally: "Got it! Need anything else?" or "Done! Anything else?" or "Added! What else?"
5. User adds more → Update grouped_actions with NEW + OLD actions
6. User says "no/done/finalize/review" → Return ready:true for final review
7. User confirms review → Policy generated

🚨 RESPONSE STYLE - BE NATURAL AND BRIEF:
- DON'T say: "To update tags on the DynamoDB table with the ARN..., I will include the following permissions:"
- DON'T say: "I will include the following permissions:"
- DON'T list actions or ARNs in your response
- DO say: "Got it! I've added tag update permissions. Need anything else?"
- DO say: "Done! Added those permissions. Anything else?"
- DO say: "Perfect! I've updated the policy. What else do you need?"
- The actions are shown in the preview panel automatically, so just confirm and ask what's next
- Keep it conversational and short

ALWAYS clarify ambiguity about WHICH resource before generating permissions!

KEY: ALWAYS return grouped_actions in EVERY response (even during clarification)
This creates the "magic pop-up" effect where actions appear/update in real-time

IMPORTANT - GROUP ACTIONS BY SERVICE:
Return actions grouped by service for separate policy statements:
{
  "needs_clarification": true,
  "question": "I've added permissions for AMI creation and snapshot. Need anything else?",
  "grouped_actions": {
    "ec2": {"actions": ["ec2:DescribeInstances", "ec2:CreateImage", "ec2:DescribeVolumes", "ec2:CreateSnapshot"], "resources": ["arn:..."]}
  }
}

When user says "no/done/finalize/review":
{
  "ready": true,
  "question": "Please review the policy below. Reply 'approve' to generate or request changes.",
  "grouped_actions": {
    "ec2": {"actions": [...], "resources": [...]},
    "s3": {"actions": [...], "resources": [...]}
  },
  "description": "Summary"
}

CHECK GUARDRAILS:
- If blocked, tell user why
- If service not selected, ask them to select it

RESPOND JSON:

ALWAYS include grouped_actions in EVERY response (creates real-time preview):

During conversation:
{
  "needs_clarification": true,
  "question": "I've added [actions in plain English]. Need anything else?",
  "grouped_actions": {"service": {"actions": [...], "resources": [...]}}
}

🚨 CRITICAL: question field = ONLY plain text for user to read. NEVER put JSON/objects in question field.
The grouped_actions field is separate and contains the JSON structure.

BAD: "question": "I've added: { \"needs_clarification\": true, ... }"
GOOD: "question": "I've added permissions for AMI and snapshot. Need anything else?"

When user says "no/done/finalize/review/that's it/create policy/generate":
{
  "ready": true,
  "question": "Policy ready! Click 'View Full Policy JSON' to see details or 'Submit Request' to proceed.",
  "grouped_actions": {
    "service_name": {"actions": [...], "resources": [...]}
  },
  "description": "Summary of what this policy allows"
}

REMEMBER: question = plain text only, grouped_actions = JSON structure

KEY PHRASES that mean user is done:
- "create policy", "generate policy", "make policy"
- "done", "that's it", "finalize"
- "no more", "nothing else"
- "submit", "ready"

ALL these should return ready: true

If user requests changes after review:
{
  "needs_clarification": true,
  "question": "What would you like to change?",
  "grouped_actions": {...}
}

If unclear:
{
  "needs_clarification": true,
  "question": "Your question",
  "grouped_actions": {}  // Empty if no actions yet
}"""
        
        # Call Bedrock
        try:
            response = ConversationManager.bedrock_client.converse(
                modelId=ConversationManager.bedrock_config.get('model_id', 'anthropic.claude-3-sonnet-20240229-v1:0'),
                messages=messages,
                system=[{"text": system_prompt}],
                inferenceConfig={
                    "maxTokens": ConversationManager.bedrock_config.get('max_tokens', 500),
                    "temperature": ConversationManager.bedrock_config.get('temperature', 0.7)
                }
            )
        except Exception as bedrock_error:
            print(f"❌ Bedrock API call failed: {bedrock_error}")
            raise bedrock_error
        
        # Extract AI response
        ai_response = response['output']['message']['content'][0]['text']
        print("🤖 Bedrock response:", ai_response)
        
        # Strip markdown code blocks
        ai_response = ai_response.replace('```json', '').replace('```', '').strip()
        
        # Try to parse JSON response
        try:
            if '{' in ai_response and '}' in ai_response:
                json_start = ai_response.index('{')
                json_end = ai_response.rindex('}') + 1
                json_str = ai_response[json_start:json_end]
                result = json.loads(json_str)
                
                # CRITICAL: Extract clean question text (remove any JSON)
                if result.get('question'):
                    question = result['question']
                    # Remove any JSON from question field
                    if '{' in question:
                        question = question[:question.index('{')].strip()
                    if not question:  # If question is empty after removing JSON, use a default
                        question = "I've updated the permissions. Need anything else?"
                    result['question'] = question
                
                # Check for terminal redirect
                if result.get('redirect_to_terminal'):
                    message = result.get('message', 'Please use Instances page for terminal access')
                    ConversationManager.add_message(conversation_id, 'assistant', message)
                    return {
                        'redirect_to_terminal': True,
                        'message': message,
                        'ready': False
                    }
                
                # If ready with actions, return them
                if result.get('ready'):
                    question_text = result.get('question', '')
                    # CRITICAL: Remove any JSON from question
                    if '{' in question_text:
                        question_text = question_text[:question_text.index('{')].strip()
                    if question_text:
                        result['question'] = question_text
                        ConversationManager.add_message(conversation_id, 'assistant', question_text)
                    return result
                
                # If needs clarification, extract the question from parsed JSON
                if result.get('needs_clarification'):
                    question_text = result.get('question', ai_response)
                    # CRITICAL: Remove any JSON from question
                    if '{' in question_text:
                        question_text = question_text[:question_text.index('{')].strip()
                    if not question_text:
                        question_text = "I've updated the permissions. Need anything else?"
                    ConversationManager.add_message(conversation_id, 'assistant', question_text)
                    response_data = {
                        'needs_clarification': True,
                        'question': question_text,
                        'grouped_actions': result.get('grouped_actions', {}),
                        'ready': False
                    }
                    print(f"📤 Returning to frontend: {response_data}")
                    return response_data
        except Exception as e:
            print(f"⚠️ Bedrock JSON parse error: {e}")
            print("📄 AI response:", ai_response[:500])
            pass
        
        # Fallback: AI response is plain text - clean any JSON
        clean_response = ai_response
        if '{' in clean_response:
            clean_response = clean_response[:clean_response.index('{')].strip()
        if not clean_response:
            clean_response = "I've updated the permissions. Need anything else?"
        ConversationManager.add_message(conversation_id, 'assistant', clean_response)
        return {
            'needs_clarification': True,
            'question': clean_response,
            'ready': False
        }
    
    @staticmethod
    def _ask_keyword_based(conversation_id):
        """Keyword-based fallback when Bedrock is unavailable"""
        print(f"🔤 Using keyword-based matching for: {conversation_id}")
        conv = ConversationManager.get_conversation(conversation_id)
        if not conv or ConversationManager.is_expired(conversation_id):
            return {'ready': True, 'timeout': True}
        
        # Get selected resources to detect services
        selected_resources = conv.get('selected_resources', {})
        selected_services_list = list(selected_resources.keys())
        print(f"📋 Selected services: {selected_services_list}")
        
        # Get last user message
        last_message = conv['messages'][-1]['content'].lower()
        
        # FORCE CHECK: Terminal access keywords
        terminal_keywords = ['connect to ec2', 'connect ec2', 'ssh', 'login to ec2', 'terminal', 'shell access', 'access ec2']
        if 'ec2' in selected_services_list and any(kw in last_message for kw in terminal_keywords):
            return {
                'redirect_to_terminal': True,
                'message': 'For terminal/SSH access to EC2 instances, please use the Instances page under Workloads section.',
                'ready': False
            }
        
        # Detect intent from keywords
        delete_keywords = ['delete', 'remove', 'cleanup', 'terminate', 'destroy', 'exclude', 'consuming bill', 'costing money', 'no longer need', 'not needed', 'get rid of', 'wipe out', 'wipe', 'no more required', "don't want", "dont want", 'dispose']
        create_keywords = ['create', 'provision', 'new', 'setup', 'build']
        write_keywords = ['modify', 'update', 'change', 'edit', 'add', 'attach', 'configure', 'set']
        read_keywords = ['read', 'view', 'list', 'describe', 'get', 'see', 'check', 'connect', 'access', 'login', 'ssh']
        
        # Detect services
        service_keywords = {
            's3': ['s3', 'bucket'],
            'ec2': ['ec2', 'instance', 'server'],
            'lambda': ['lambda', 'function'],
            'rds': ['rds', 'database'],
            'elb': ['load balancer', 'loadbalancer', 'elb', 'alb', 'elasticloadbalancing'],
            'dynamodb': ['dynamodb', 'dynamo'],
            'sns': ['sns', 'topic'],
            'sqs': ['sqs', 'queue']
        }
        
        detected_intent = None
        detected_services = []
        
        # Check intent
        if any(kw in last_message for kw in delete_keywords):
            detected_intent = 'delete'
        elif any(kw in last_message for kw in create_keywords):
            detected_intent = 'create'
        elif any(kw in last_message for kw in write_keywords):
            detected_intent = 'write'
        elif any(kw in last_message for kw in read_keywords):
            detected_intent = 'read'
        
        # Check services from message OR use selected services
        for service, keywords in service_keywords.items():
            if any(kw in last_message for kw in keywords):
                detected_services.append(service)
        
        # If no services detected from message, use selected services
        if not detected_services and selected_services_list:
            detected_services = selected_services_list
            print(f"✅ Using selected services: {detected_services}")
        
        # Decision logic
        if len(conv['messages']) == 1:
            # First message
            if not detected_intent:
                ConversationManager.add_message(conversation_id, 'assistant', 'What would you like to do? (read/view, delete/remove, or modify)')
                return {'needs_clarification': True, 'question': 'What would you like to do? (read/view, delete/remove, or modify)', 'ready': False}
            elif not detected_services:
                ConversationManager.add_message(conversation_id, 'assistant', 'Which AWS service? (S3, EC2, Lambda, RDS, Load Balancer, etc.)')
                return {'needs_clarification': True, 'question': 'Which AWS service? (S3, EC2, Lambda, RDS, Load Balancer, etc.)', 'ready': False}
        
        # If we have both intent and services, we're ready
        if detected_intent and detected_services:
            if detected_intent == 'create':
                return {'ready': True, 'intent': 'create'}
            
            return {
                'ready': True,
                'intent': detected_intent,
                'services': detected_services,
                'actions': []  # Will be generated by fallback
            }
        
        # Still need more info
        if not detected_intent:
            ConversationManager.add_message(conversation_id, 'assistant', 'What action do you want to perform?')
            return {'needs_clarification': True, 'question': 'What action do you want to perform?', 'ready': False}
        elif not detected_services:
            ConversationManager.add_message(conversation_id, 'assistant', 'Which AWS service?')
            return {'needs_clarification': True, 'question': 'Which AWS service?', 'ready': False}
        
        # Fallback
        return {'ready': True, 'intent': detected_intent or 'read', 'services': detected_services}
    
    @staticmethod
    def get_mode():
        """Return current AI mode (bedrock or keyword)"""
        if ConversationManager.bedrock_config is None:
            ConversationManager.load_bedrock_config()
        return 'bedrock' if ConversationManager.bedrock_client else 'keyword'
    
    @staticmethod
    def end_conversation(conversation_id):
        if conversation_id in ConversationManager.conversations:
            del ConversationManager.conversations[conversation_id]
        return True
