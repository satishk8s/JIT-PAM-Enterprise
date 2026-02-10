"""
Intent Classifier for JIT Access Requests
Detects user intent and routes to appropriate team/workflow
"""

from strict_policies import StrictPolicies

class IntentClassifier:
    
    # Synonyms for different intents (comprehensive human phrases)
    INTENT_SYNONYMS = {
        'CREATE': [
            'create', 'new', 'provision', 'setup', 'build', 'make', 'need a', 'want a', 'require a', 'separate',
            'spin up', 'set up', 'fresh', 'another', 'add', 'give me a', 'can you create', 'please create',
            'i need another', 'i want another', 'need a new', 'want a new', 'make a new', 'set up a new'
        ],
        'DELETE': [
            'delete', 'remove', 'cleanup', 'clean up', 'housekeep', 'house keep', 'purge', 'clear',
            'drop', 'decommission', 'destroy', 'get rid of', 'take out', 'shut down and delete',
            'no longer need', 'obsolete', 'clear out', 'permanently remove'
        ],
        'MODIFY': ['modify', 'update', 'change', 'edit', 'alter', 'configure', 'fix', 'adjust'],
        'READ': ['read', 'view', 'see', 'check', 'list', 'describe', 'get', 'download', 'access', 'look at'],
        'WRITE': ['write', 'upload', 'put', 'store', 'save', 'add']
    }
    
    # Resources that require infrastructure provisioning
    INFRASTRUCTURE_RESOURCES = [
        's3 bucket', 'bucket', 'ec2 instance', 'instance', 'rds database', 
        'database', 'lambda function', 'vpc', 'subnet', 'security group',
        'load balancer', 'cloudfront distribution'
    ]
    
    @staticmethod
    def detect_intent(user_request):
        """
        Detect user intent from natural language request
        Returns: {
            'intents': ['CREATE', 'WRITE', 'DELETE'],
            'resources': ['s3 bucket'],
            'requires_infrastructure': True,
            'route_to': 'devops_team',
            'suggested_action': 'Create JIRA ticket for DevOps'
        }
        """
        request_lower = user_request.lower()
        
        # Detect intents
        detected_intents = []
        for intent, synonyms in IntentClassifier.INTENT_SYNONYMS.items():
            if any(synonym in request_lower for synonym in synonyms):
                detected_intents.append(intent)
        
        # Detect resources
        detected_resources = []
        for resource in IntentClassifier.INFRASTRUCTURE_RESOURCES:
            if resource in request_lower:
                detected_resources.append(resource)
        
        # Check if infrastructure provisioning is needed
        # Skip if DELETE intent is also detected (user is talking about existing resources)
        requires_infrastructure = (
            'CREATE' in detected_intents and 
            len(detected_resources) > 0 and
            'DELETE' not in detected_intents
        )
        
        # Determine routing
        if requires_infrastructure:
            return {
                'intents': detected_intents,
                'resources': detected_resources,
                'requires_infrastructure': True,
                'route_to': 'devops_team',
                'suggested_action': 'create_jira_ticket',
                'message': 'Infrastructure provisioning request detected'
            }
        
        # Delete operations will be validated later based on account environment and toggle settings
        # Don't block here - let the main flow handle it
        
        # Valid JIT access request
        return {
            'intents': detected_intents,
            'resources': detected_resources,
            'requires_infrastructure': False,
            'route_to': 'jit_access',
            'suggested_action': 'proceed',
            'message': 'Valid JIT access request - proceed with permission generation'
        }
