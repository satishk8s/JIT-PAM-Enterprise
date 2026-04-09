"""
GovernAIX Help Assistant
Guides users through the application using conversational AI
"""

import json
import boto3
from conversation_manager import ConversationManager

class HelpAssistant:
    FAQ_CONTACT_LINE = (
        "If you still need help, please connect with NPAMX admins at "
        "satish.korra@nykaa.com or Manoj.c@nykaa.com. "
        "NPAMX is coming soon with more guided support. Sorry for the inconvenience."
    )

    @staticmethod
    def _normalized_text(value):
        return ' '.join(str(value or '').strip().lower().split())

    @staticmethod
    def _contains_all(text, parts):
        txt = HelpAssistant._normalized_text(text)
        return all(HelpAssistant._normalized_text(part) in txt for part in (parts or []))

    @staticmethod
    def _contains_any(text, parts):
        txt = HelpAssistant._normalized_text(text)
        return any(HelpAssistant._normalized_text(part) in txt for part in (parts or []))

    @staticmethod
    def _general_response():
        return (
            "I'm sorry I could not help with that answer right now. "
            "For better help, please reach out to the NPAMX admins at "
            "satish.korra@nykaa.com or Manoj.c@nykaa.com. "
            "NPAMX is coming soon with more guided support. Sorry for the inconvenience."
        )

    @staticmethod
    def _faq_response(user_message):
        text = HelpAssistant._normalized_text(user_message)
        if not text:
            return None

        if (
            HelpAssistant._contains_any(text, [
                'how to place access request',
                'how do i place access request',
                'how to place database request',
                'how do i place database request',
                'how to raise access request',
                'how to raise db request',
                'place db request',
                'database request steps',
                'how can i request database access',
            ]) or (
                HelpAssistant._contains_any(text, ['place', 'raise', 'submit', 'create']) and
                HelpAssistant._contains_any(text, ['request']) and
                HelpAssistant._contains_any(text, ['database', 'db', 'access'])
            )
        ):
            return (
                "To place a database access request in NPAMX, go to My Requests > Databases, "
                "select the AWS account and database target, choose the database, schema, and table, "
                "pick the access type (read-only by default or limited write where allowed), add your business justification, "
                "and submit for approval. If the screen blocks the request with a data classification or IAM authentication message, "
                "that usually needs DevOps action before the request can proceed. "
                + HelpAssistant.FAQ_CONTACT_LINE
            )

        if (
            HelpAssistant._contains_any(text, ['data classification', 'data_classification']) or
            (HelpAssistant._contains_any(text, ['tag']) and HelpAssistant._contains_any(text, ['classification'])) or
            HelpAssistant._contains_all(text, ['database request', 'tag'])
        ):
            return (
                "If NPAMX asks for a data classification tag while placing a database request, "
                "please reach out to the DevOps team to add or correct the required database tags. "
                "Once tagging is completed, retry the request. "
                + HelpAssistant.FAQ_CONTACT_LINE
            )

        if (
            HelpAssistant._contains_any(text, ['iam auth', 'iam authentication', 'iam-based authentication']) or
            (HelpAssistant._contains_any(text, ['iam']) and HelpAssistant._contains_any(text, ['database request', 'db request', 'authentication']))
        ):
            return (
                "If NPAMX says IAM-based authentication is not enabled for the database, "
                "please contact the DevOps team to enable IAM authentication for that database or database path. "
                "After DevOps enables it, retry placing the request. "
                + HelpAssistant.FAQ_CONTACT_LINE
            )

        if (
            HelpAssistant._contains_any(text, ['not able to view rds', 'cannot see rds', 'rds instances']) or
            (HelpAssistant._contains_any(text, ['rds']) and HelpAssistant._contains_any(text, ['not able to view', 'cannot see', 'not visible']))
        ):
            return (
                "If you cannot see RDS instances in the selected account, "
                "please reach out to the DevOps team to verify that the PAM IAM role has the required read permissions in that account. "
                + HelpAssistant.FAQ_CONTACT_LINE
            )

        if (
            HelpAssistant._contains_any(text, ['identity center url', 'aws identity center', 'netskope']) or
            (HelpAssistant._contains_any(text, ['not able to access url', 'cannot access url']) and HelpAssistant._contains_any(text, ['identity center', 'aws']))
        ):
            return (
                "If you are not able to access the NPAMX URL through AWS Identity Center, "
                "please contact the SecOps team, specifically Sahil Thakur, to check for Netskope or access-path issues. "
                + HelpAssistant.FAQ_CONTACT_LINE
            )

        if (
            HelpAssistant._contains_any(text, ['my applications', 'my apps']) and
            HelpAssistant._contains_any(text, ['not able to see', 'cannot see', 'not visible', 'application'])
        ):
            return (
                "If you cannot see the NPAMX application under My Applications in AWS, "
                "please reach out to the SecOps team, specifically Nikita Prasad or Tejas Jual. "
                + HelpAssistant.FAQ_CONTACT_LINE
            )

        if (
            HelpAssistant._contains_any(text, ['not able to log in to aws url', 'cannot login to aws url', 'aws url login']) or
            (HelpAssistant._contains_any(text, ['aws url']) and HelpAssistant._contains_any(text, ['login', 'log in', 'sign in']))
        ):
            return (
                "If you are not able to log in to the AWS URL, "
                "please contact the IT team to verify your access status, especially if you have already raised an ITSM request. "
                + HelpAssistant.FAQ_CONTACT_LINE
            )

        if (
            HelpAssistant._contains_any(text, ['pii']) and
            HelpAssistant._contains_any(text, ['write access', 'write']) and
            HelpAssistant._contains_any(text, ['blocked', 'restricted'])
        ):
            return (
                "Write access to PII databases is restricted by default. "
                "You will need approvals from the Database Owner, DevOps team, and SecOps team. "
                "After those approvals, an NPAMX admin must grant the exception needed to allow the request. "
                + HelpAssistant.FAQ_CONTACT_LINE
            )

        if (
            HelpAssistant._contains_any(text, ['vendor']) and
            HelpAssistant._contains_any(text, ['on behalf', 'on-behalf'])
        ):
            return (
                "No. Placing requests on behalf of vendor users is currently restricted to internal users only. "
                + HelpAssistant.FAQ_CONTACT_LINE
            )

        if (
            HelpAssistant._contains_any(text, ['colleague', 'coworker', 'team member']) and
            HelpAssistant._contains_any(text, ['on behalf', 'on-behalf'])
        ):
            return (
                "Yes, you can place a request on behalf of a colleague. "
                "The request will still follow the configured workflow and may require the colleague's reporting manager approval. "
                + HelpAssistant.FAQ_CONTACT_LINE
            )

        if (
            HelpAssistant._contains_any(text, [
                'whom to reach',
                'who to contact',
                'whom should i contact',
                'contact admins',
                'contact support',
                'who can help',
                'need help',
                'issues with npamx',
                'problem in npamx',
            ])
        ):
            return HelpAssistant.FAQ_CONTACT_LINE

        return None
    
    @staticmethod
    def detect_prompt_injection(user_message):
        """
        Detect common prompt injection patterns
        """
        message_lower = user_message.lower()
        
        # Prompt injection patterns
        injection_patterns = [
            'ignore previous', 'ignore all previous', 'disregard previous',
            'forget previous', 'forget all', 'ignore above', 'disregard above',
            'ignore instructions', 'new instructions', 'system prompt',
            'act as', 'pretend to be', 'you are now', 'roleplay',
            'jailbreak', 'dan mode', 'developer mode',
            'reveal your prompt', 'show your instructions', 'what are your instructions',
            'bypass restrictions', 'override', 'sudo mode',
            'simulate', 'hypothetically', 'in an alternate reality',
            '</system>', '<|im_end|>', '<|endoftext|>',
            'print your prompt', 'output your system', 'repeat your instructions'
        ]
        
        for pattern in injection_patterns:
            if pattern in message_lower:
                return True
        
        # Check for excessive special characters (obfuscation attempts)
        special_char_count = sum(1 for c in user_message if c in '{}[]<>|\\`~')
        if special_char_count > 10:
            return True
        
        return False
    
    @staticmethod
    def get_help_response(user_message, conversation_id=None):
        """
        Provide contextual help to users navigating GovernAIX
        """
        
        # Detect prompt injection attempts
        if HelpAssistant.detect_prompt_injection(user_message):
            print(f"⚠️ PROMPT INJECTION BLOCKED: {user_message[:100]}")
            return {
                'ai_response': "I'm the GovernAIX Help Assistant. I can only help with navigating this access management system. What feature would you like help with?",
                'conversation_id': conversation_id,
                'blocked': True
            }

        faq_response = HelpAssistant._faq_response(user_message)
        if faq_response:
            return {
                'ai_response': faq_response,
                'conversation_id': conversation_id,
                'source': 'faq'
            }

        return {
            'ai_response': HelpAssistant._general_response(),
            'conversation_id': conversation_id,
            'source': 'hardcoded'
        }
