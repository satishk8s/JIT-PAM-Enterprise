// Conversation state
let conversationId = null;
let conversationHistory = [];
let currentActions = {};

// Action explanations for user-friendly display
const actionExplanations = {
    'DescribeInstances': 'View EC2 instance details and status',
    'DescribeInstanceStatus': 'Check instance health and status',
    'StartInstances': 'Start stopped EC2 instances',
    'StopInstances': 'Stop running EC2 instances',
    'RebootInstances': 'Reboot EC2 instances',
    'TerminateInstances': 'Permanently delete EC2 instances',
    'CreateImage': 'Create AMI (Amazon Machine Image) from instance',
    'DescribeImages': 'View AMI details',
    'DeregisterImage': 'Delete AMI',
    'DescribeVolumes': 'View EBS volume details and attachments',
    'CreateSnapshot': 'Create snapshot backup from EBS volume',
    'DescribeSnapshots': 'View snapshot details and status',
    'DeleteSnapshot': 'Permanently delete snapshot',
    'CreateVolume': 'Create new EBS volume from snapshot or blank',
    'AttachVolume': 'Attach EBS volume to instance',
    'DetachVolume': 'Detach EBS volume from instance',
    'DeleteVolume': 'Permanently delete EBS volume',
    'RunInstances': 'Launch new EC2 instances',
    'ModifyInstanceAttribute': 'Modify instance settings',
    'CreateTags': 'Add tags to AWS resources',
    'DescribeTags': 'View resource tags',
    'ListBucket': 'List objects in S3 bucket',
    'GetObject': 'Download objects from S3 bucket',
    'PutObject': 'Upload objects to S3 bucket',
    'DeleteObject': 'Delete objects from S3 bucket',
    'GetBucketLocation': 'Get S3 bucket region',
    'ListAllMyBuckets': 'List all S3 buckets',
    'InvokeFunction': 'Execute Lambda function',
    'GetFunction': 'View Lambda function details',
    'ListFunctions': 'List all Lambda functions',
    'DescribeDBInstances': 'View RDS database details',
    'StartDBInstance': 'Start stopped RDS database',
    'StopDBInstance': 'Stop running RDS database',
    'RebootDBInstance': 'Reboot RDS database'
};

// Start conversation with AI
async function startConversation(userMessage) {
    try {
        const response = await fetch(`${API_BASE}/generate-permissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                use_case: userMessage,
                selected_resources: getSelectedResources()
            })
        });
        
        const data = await response.json();
        
        if (data.conversation_id) {
            conversationId = data.conversation_id;
            conversationHistory = [{ role: 'user', content: userMessage }];
        }
        
        return data;
    } catch (error) {
        console.error('Error starting conversation:', error);
        throw error;
    }
}

// Continue conversation
async function continueConversation(userMessage) {
    if (!conversationId) {
        return startConversation(userMessage);
    }
    
    try {
        const response = await fetch(`${API_BASE}/generate-permissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversation_id: conversationId,
                user_message: userMessage,
                selected_resources: getSelectedResources()
            })
        });
        
        const data = await response.json();
        conversationHistory.push({ role: 'user', content: userMessage });
        
        return data;
    } catch (error) {
        console.error('Error continuing conversation:', error);
        throw error;
    }
}

// Get selected resources from wizard
function getSelectedResources() {
    if (typeof selectedResources !== 'undefined' && selectedResources.length > 0) {
        const resources = {};
        if (typeof selectedService !== 'undefined' && selectedService) {
            resources[selectedService] = selectedResources;
        }
        return resources;
    }
    return {};
}

// Update actions preview with animation
function updateActionsPreview(groupedActions, isReviewStep = false) {
    const previewDiv = document.getElementById('aiPermissionsPreview');
    if (!previewDiv) return;
    
    // Store current actions
    currentActions = groupedActions || {};
    
    if (!groupedActions || Object.keys(groupedActions).length === 0) {
        previewDiv.style.display = 'none';
        return;
    }
    
    let html = `<h4 style="margin-top: 0; color: #00a1c9;">${isReviewStep ? '📋 Policy Review' : '⚡ Building Policy...'}</h4>`;
    
    if (isReviewStep) {
        html += `<div style="background: rgba(255,193,7,0.1); border-left: 3px solid #ffc107; padding: 8px 10px; margin-bottom: 15px; border-radius: 3px; font-size: 12px; color: #ffc107;">
            Review the actions below. Reply 'approve' to generate policy or request changes.
        </div>`;
    }
    
    let totalActions = 0;
    for (const [service, data] of Object.entries(groupedActions)) {
        const actions = data.actions || [];
        totalActions += actions.length;
        
        html += `<div style="margin-bottom: 15px; animation: slideIn 0.3s ease-out;">`;
        html += `<div style="color: #888; font-size: 12px; margin-bottom: 5px; font-weight: 600;">${service.toUpperCase()} (${actions.length})</div>`;
        
        actions.forEach((action, idx) => {
            const actionName = action.split(':')[1];
            const explanation = actionExplanations[actionName] || 'AWS action';
            const isDestructive = ['Delete', 'Terminate', 'Deregister'].some(word => actionName.includes(word));
            const isCreate = ['Create', 'Run'].some(word => actionName.includes(word));
            const borderColor = isDestructive ? '#ff5252' : isCreate ? '#4caf50' : '#00a1c9';
            
            html += `<div style="padding: 8px 12px; background: rgba(0,161,201,0.05); border-left: 3px solid ${borderColor}; margin-bottom: 6px; border-radius: 3px; animation: fadeIn 0.4s ease-out ${idx * 0.05}s backwards;">`;
            html += `<div style="display: flex; align-items: center; justify-content: space-between;">`;
            html += `<div style="flex: 1;">`;
            html += `<div style="color: #fff; font-size: 13px; font-weight: 500;">${action}</div>`;
            html += `<div style="color: #aaa; font-size: 11px; margin-top: 3px;">${explanation}</div>`;
            html += `</div>`;
            if (isDestructive) {
                html += `<span style="font-size: 18px; margin-left: 8px;">⚠️</span>`;
            } else if (isCreate) {
                html += `<span style="font-size: 18px; margin-left: 8px;">✨</span>`;
            }
            html += `</div></div>`;
        });
        
        html += `</div>`;
    }
    
    html += `<div style="margin-top: 15px; padding: 10px; background: rgba(0,161,201,0.1); border-radius: 5px; text-align: center; font-size: 12px; color: #00a1c9;">
        Total: ${totalActions} actions
    </div>`;
    
    previewDiv.innerHTML = html;
    previewDiv.style.display = 'block';
    
    // Add CSS animations if not already added
    if (!document.getElementById('conversationAnimations')) {
        const style = document.createElement('style');
        style.id = 'conversationAnimations';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(-10px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
}

// Add message to chat
function addChatMessage(role, content) {
    const chatMessages = document.getElementById('aiChatMessages');
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}-message`;
    messageDiv.style.cssText = `
        margin-bottom: 12px;
        padding: 10px 14px;
        border-radius: 8px;
        max-width: 80%;
        ${role === 'user' ? 'margin-left: auto; background: #00a1c9; color: white; text-align: right;' : 'background: rgba(255,255,255,0.05); color: #e0e0e0;'}
        animation: fadeIn 0.3s ease-out;
    `;
    messageDiv.textContent = content;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Handle conversation response
function handleConversationResponse(data) {
    // Update actions preview if available
    if (data.grouped_actions) {
        const isReviewStep = data.ready && data.question && 
            (data.question.toLowerCase().includes('review') || data.question.toLowerCase().includes('approve'));
        updateActionsPreview(data.grouped_actions, isReviewStep);
    }
    
    // Add AI message to chat
    if (data.question) {
        addChatMessage('assistant', data.question);
    }
    
    // Store permissions if ready
    if (data.ready && data.grouped_actions) {
        window.currentAIPermissions = {
            grouped_actions: data.grouped_actions,
            description: data.description || 'AI-generated permissions',
            actions: []
        };
        
        // Flatten actions for backward compatibility
        for (const [service, serviceData] of Object.entries(data.grouped_actions)) {
            window.currentAIPermissions.actions.push(...serviceData.actions);
        }
    }
    
    return data;
}

// Reset conversation
function resetConversation() {
    conversationId = null;
    conversationHistory = [];
    currentActions = {};
    
    const chatMessages = document.getElementById('aiChatMessages');
    if (chatMessages) {
        chatMessages.innerHTML = '';
    }
    
    const previewDiv = document.getElementById('aiPermissionsPreview');
    if (previewDiv) {
        previewDiv.style.display = 'none';
    }
}

// Export functions
if (typeof window !== 'undefined') {
    window.startConversation = startConversation;
    window.continueConversation = continueConversation;
    window.handleConversationResponse = handleConversationResponse;
    window.resetConversation = resetConversation;
    window.updateActionsPreview = updateActionsPreview;
}
