// Guardrails Management Functions

function addServiceRestriction() {
    const list = document.getElementById('serviceRestrictionsList');
    const item = document.createElement('div');
    item.className = 'restriction-item';
    item.style.cssText = 'display: flex; gap: 10px; align-items: center; padding: 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px;';
    item.innerHTML = `
        <select style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
            <option value="kms">KMS (Key Management Service)</option>
            <option value="secretsmanager">Secrets Manager</option>
            <option value="iam">IAM (Identity & Access Management)</option>
            <option value="organizations">AWS Organizations</option>
            <option value="billing">Billing & Cost Management</option>
        </select>
        <select style="flex: 0 0 150px; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
            <option value="block">Block All Access</option>
            <option value="read_only">Read-Only</option>
            <option value="approval">Require Approval</option>
        </select>
        <input type="text" placeholder="Reason" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
        <button class="btn-danger btn-sm" onclick="removeRestriction(this)"><i class="fas fa-trash"></i></button>
    `;
    list.appendChild(item);
}

function addDeleteRestriction() {
    const list = document.getElementById('deleteRestrictionsList');
    const item = document.createElement('div');
    item.className = 'restriction-item';
    item.style.cssText = 'display: flex; gap: 10px; align-items: center; padding: 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px;';
    item.innerHTML = `
        <select style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
            <option value="kms">KMS Keys</option>
            <option value="s3">S3 Buckets</option>
            <option value="rds">RDS Databases</option>
            <option value="dynamodb">DynamoDB Tables</option>
            <option value="ec2">EC2 Instances</option>
            <option value="lambda">Lambda Functions</option>
        </select>
        <select style="flex: 0 0 150px; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
            <option value="all">All Environments</option>
            <option value="prod">Production Only</option>
            <option value="nonprod">Non-Prod Only</option>
        </select>
        <input type="text" placeholder="Reason" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
        <button class="btn-danger btn-sm" onclick="removeRestriction(this)"><i class="fas fa-trash"></i></button>
    `;
    list.appendChild(item);
}

function addCreateRestriction() {
    const list = document.getElementById('createRestrictionsList');
    const item = document.createElement('div');
    item.className = 'restriction-item';
    item.style.cssText = 'display: flex; gap: 10px; align-items: center; padding: 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px;';
    item.innerHTML = `
        <select style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
            <option value="ec2">EC2 Instances</option>
            <option value="rds">RDS Databases</option>
            <option value="s3">S3 Buckets</option>
            <option value="vpc">VPC Resources</option>
            <option value="iam">IAM Users/Roles</option>
            <option value="kms">KMS Keys</option>
        </select>
        <select style="flex: 0 0 150px; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
            <option value="all">All Environments</option>
            <option value="prod">Production Only</option>
            <option value="nonprod">Non-Prod Only</option>
        </select>
        <input type="text" placeholder="Reason" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
        <button class="btn-danger btn-sm" onclick="removeRestriction(this)"><i class="fas fa-trash"></i></button>
    `;
    list.appendChild(item);
}

function addCustomGuardrail() {
    const list = document.getElementById('customGuardrailsList');
    const item = document.createElement('div');
    item.className = 'restriction-item';
    item.style.cssText = 'display: flex; gap: 10px; align-items: center; padding: 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px;';
    item.innerHTML = `
        <input type="text" placeholder="Rule Name" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
        <select style="flex: 0 0 120px; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
            <option value="tag">Tag-based</option>
            <option value="name">Name pattern</option>
            <option value="arn">ARN pattern</option>
        </select>
        <input type="text" placeholder="Condition" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
        <button class="btn-danger btn-sm" onclick="removeRestriction(this)"><i class="fas fa-trash"></i></button>
    `;
    list.appendChild(item);
}

function removeRestriction(button) {
    button.closest('.restriction-item').remove();
}

// Conversation state for AI guardrail chat
let guardrailConversationId = null;

async function generateAIGuardrail() {
    const input = document.getElementById('aiGuardrailInput').value.trim();
    if (!input) return;
    
    const popup = document.getElementById('aiChatPopup');
    if (popup.style.display === 'none' || !popup.style.display) {
        toggleAIChat();
    }
    
    addGuardrailChatMessage('user', input);
    document.getElementById('aiGuardrailInput').value = '';
    
    const chatArea = document.getElementById('aiGuardrailChat');
    const thinkingMsg = document.createElement('div');
    thinkingMsg.className = 'chat-message assistant';
    thinkingMsg.id = 'thinkingMessage';
    thinkingMsg.innerHTML = '<strong>NPAMX</strong> 🤔 Analyzing your request...';
    chatArea.appendChild(thinkingMsg);
    chatArea.scrollTop = chatArea.scrollHeight;
    
    try {
        const response = await fetch('http://127.0.0.1:5000/api/admin/generate-guardrails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                conversation_id: guardrailConversationId,
                user_message: input
            })
        });
        
        // Remove thinking message
        const thinking = document.getElementById('thinkingMessage');
        if (thinking) thinking.remove();
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed');
        }
        
        if (data.conversation_id) {
            guardrailConversationId = data.conversation_id;
        }
        
        // Extract AI response from different possible fields
        let aiMessage = data.ai_response || data.question || data.understanding || 'No response';
        addGuardrailChatMessage('assistant', aiMessage);
        
        const needsConfirm = data.ai_response && (data.ai_response.toLowerCase().includes('to confirm') || data.ai_response.toLowerCase().includes('is this correct') || data.ai_response.toLowerCase().includes('do you want'));
        
        if (needsConfirm || data.status === 'needs_confirmation') {
            showGuardrailApprovalButton();
        } else if (data.status === 'ready') {
            addGuardrailChatMessage('assistant', '✅ Guardrail created successfully!');
            alert('✅ Guardrail created!');
            setTimeout(() => {
                resetGuardrailChat();
                if (typeof loadAccessRules === 'function') loadAccessRules();
            }, 1000);
        }
        
    } catch (error) {
        const thinking = document.getElementById('thinkingMessage');
        if (thinking) thinking.remove();
        
        console.error('AI Guardrail Error:', error);
        let errorMsg = '❌ Error: ' + error.message;
        if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
            errorMsg = '❌ Cannot connect to backend server!\n\nPlease check if Flask is running on port 5000';
        }
        addGuardrailChatMessage('error', errorMsg);
    }
}

function addGuardrailChatMessage(role, message) {
    const chatArea = document.getElementById('aiGuardrailChat');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}`;
    
    if (role === 'user') {
        messageDiv.innerHTML = `<strong>You</strong>${message.replace(/\n/g, '<br>')}`;
    } else if (role === 'assistant') {
        messageDiv.innerHTML = `<strong>NPAMX</strong> ${message.replace(/\n/g, '<br>')}`;
    } else if (role === 'error') {
        messageDiv.style.background = '#ff5252';
        messageDiv.style.color = 'white';
        messageDiv.innerHTML = message.replace(/\n/g, '<br>');
    }
    
    chatArea.appendChild(messageDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function showGuardrailApprovalButton() {
    // Remove any existing approval buttons first
    const existing = document.getElementById('guardrailApprovalButtons');
    if (existing) existing.remove();
    
    const chatArea = document.getElementById('aiGuardrailChat');
    const approveDiv = document.createElement('div');
    approveDiv.id = 'guardrailApprovalButtons';
    approveDiv.style.cssText = 'margin-top: 15px; display: flex; gap: 10px; justify-content: center;';
    approveDiv.innerHTML = `
        <button onclick="approveGuardrail()" style="padding: 12px 24px; background: white; color: #667eea; border: none; border-radius: 12px; font-weight: 600; cursor: pointer; font-size: 14px; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
            ✅ Approve & Create
        </button>
        <button onclick="resetGuardrailChat()" style="padding: 12px 24px; background: rgba(255,255,255,0.2); color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer; font-size: 14px;">
            ❌ Cancel
        </button>
    `;
    chatArea.appendChild(approveDiv);
}

async function approveGuardrail() {
    const mfaToken = prompt('🔐 MFA Verification Required\n\nEnter your 6-digit MFA code to create this guardrail:');
    if (!mfaToken || mfaToken.length !== 6) {
        alert('❌ Invalid MFA token');
        return;
    }
    
    // Remove approval buttons immediately
    const approvalDiv = document.getElementById('guardrailApprovalButtons');
    if (approvalDiv) approvalDiv.remove();
    
    // Show creating message
    addGuardrailChatMessage('assistant', '⏳ Creating guardrail...');
    
    try {
        const response = await fetch('http://127.0.0.1:5000/api/admin/generate-guardrails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                conversation_id: guardrailConversationId,
                user_message: 'yes, create it',
                mfa_token: mfaToken
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Failed');
        
        if (data.status === 'ready') {
            addGuardrailChatMessage('assistant', '✅ Guardrail created successfully!');
            alert('✅ Guardrail created!');
            setTimeout(() => {
                resetGuardrailChat();
                if (typeof loadAccessRules === 'function') loadAccessRules();
            }, 1000);
        } else {
            addGuardrailChatMessage('assistant', data.ai_response);
            // If still needs confirmation, show buttons again
            if (data.status === 'needs_confirmation') {
                showGuardrailApprovalButton();
            }
        }
    } catch (error) {
        console.error('Approval error:', error);
        let errorMsg = '❌ Error: ' + error.message;
        if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
            errorMsg = '❌ Backend server is not running!\n\nPlease start Flask:\ncd /Users/satish.korra/Desktop/sso/backend\npython app.py';
        }
        addGuardrailChatMessage('error', errorMsg);
    }
}

function resetGuardrailChat() {
    guardrailConversationId = null;
    document.getElementById('aiGuardrailChat').innerHTML = '';
    document.getElementById('aiGuardrailInput').value = '';
}

function applyGeneratedGuardrails(guardrails) {
    // Clear existing items (keep first example)
    const clearList = (listId) => {
        const list = document.getElementById(listId);
        while (list.children.length > 1) {
            list.removeChild(list.lastChild);
        }
    };
    
    // Apply service restrictions
    if (guardrails.serviceRestrictions && guardrails.serviceRestrictions.length > 0) {
        clearList('serviceRestrictionsList');
        guardrails.serviceRestrictions.forEach(rule => {
            const list = document.getElementById('serviceRestrictionsList');
            const item = document.createElement('div');
            item.className = 'restriction-item';
            item.style.cssText = 'display: flex; gap: 10px; align-items: center; padding: 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px;';
            item.innerHTML = `
                <select style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
                    <option value="${rule.service}" selected>${getServiceDisplayName(rule.service)}</option>
                </select>
                <select style="flex: 0 0 150px; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
                    <option value="${rule.action}" selected>${getActionDisplayName(rule.action)}</option>
                </select>
                <input type="text" placeholder="Reason" value="${rule.reason}" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
                <button class="btn-danger btn-sm" onclick="removeRestriction(this)"><i class="fas fa-trash"></i></button>
            `;
            list.appendChild(item);
        });
    }
    
    // Apply delete restrictions
    if (guardrails.deleteRestrictions && guardrails.deleteRestrictions.length > 0) {
        clearList('deleteRestrictionsList');
        guardrails.deleteRestrictions.forEach(rule => {
            const list = document.getElementById('deleteRestrictionsList');
            const item = document.createElement('div');
            item.className = 'restriction-item';
            item.style.cssText = 'display: flex; gap: 10px; align-items: center; padding: 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px;';
            item.innerHTML = `
                <select style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
                    <option value="${rule.service}" selected>${getServiceDisplayName(rule.service)}</option>
                </select>
                <select style="flex: 0 0 150px; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
                    <option value="${rule.environment}" selected>${getEnvDisplayName(rule.environment)}</option>
                </select>
                <input type="text" placeholder="Reason" value="${rule.reason}" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
                <button class="btn-danger btn-sm" onclick="removeRestriction(this)"><i class="fas fa-trash"></i></button>
            `;
            list.appendChild(item);
        });
    }
    
    // Apply create restrictions
    if (guardrails.createRestrictions && guardrails.createRestrictions.length > 0) {
        clearList('createRestrictionsList');
        guardrails.createRestrictions.forEach(rule => {
            const list = document.getElementById('createRestrictionsList');
            const item = document.createElement('div');
            item.className = 'restriction-item';
            item.style.cssText = 'display: flex; gap: 10px; align-items: center; padding: 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px;';
            item.innerHTML = `
                <select style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
                    <option value="${rule.service}" selected>${getServiceDisplayName(rule.service)}</option>
                </select>
                <select style="flex: 0 0 150px; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
                    <option value="${rule.environment}" selected>${getEnvDisplayName(rule.environment)}</option>
                </select>
                <input type="text" placeholder="Reason" value="${rule.reason}" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
                <button class="btn-danger btn-sm" onclick="removeRestriction(this)"><i class="fas fa-trash"></i></button>
            `;
            list.appendChild(item);
        });
    }
}

function getServiceDisplayName(service) {
    const map = {
        'kms': 'KMS (Key Management Service)',
        'secretsmanager': 'Secrets Manager',
        'iam': 'IAM (Identity & Access Management)',
        'organizations': 'AWS Organizations',
        'identitystore': 'Identity Store',
        'sso': 'AWS SSO',
        's3': 'S3 Buckets',
        'rds': 'RDS Databases',
        'ec2': 'EC2 Instances',
        'lambda': 'Lambda Functions',
        'dynamodb': 'DynamoDB Tables'
    };
    return map[service] || service.toUpperCase();
}

function getActionDisplayName(action) {
    const map = {
        'block': 'Block All Access',
        'read_only': 'Read-Only',
        'approval': 'Require Approval'
    };
    return map[action] || action;
}

function getEnvDisplayName(env) {
    const map = {
        'all': 'All Environments',
        'prod': 'Production Only',
        'nonprod': 'Non-Prod Only'
    };
    return map[env] || env;
}

function previewGuardrails() {
    const guardrails = collectGuardrails();
    
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 20px; max-width: 600px; width: 90%; max-height: 80vh; overflow: auto;">
            <h3 style="margin: 0 0 15px 0; color: var(--text-primary);"><i class="fas fa-eye"></i> Guardrails Impact Preview</h3>
            <div style="background: var(--bg-secondary); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <p style="margin: 0 0 10px 0; color: var(--text-primary);"><strong>Service Restrictions:</strong> ${guardrails.serviceRestrictions.length} rules</p>
                <p style="margin: 0 0 10px 0; color: var(--text-primary);"><strong>Delete Restrictions:</strong> ${guardrails.deleteRestrictions.length} rules</p>
                <p style="margin: 0 0 10px 0; color: var(--text-primary);"><strong>Create Restrictions:</strong> ${guardrails.createRestrictions.length} rules</p>
                <p style="margin: 0; color: var(--text-primary);"><strong>Custom Guardrails:</strong> ${guardrails.customGuardrails.length} rules</p>
            </div>
            <div style="background: #e3f2fd; border: 1px solid #2196F3; border-radius: 8px; padding: 12px; font-size: 13px;">
                <strong>📊 Estimated Impact:</strong> These guardrails will affect all future access requests. Users will see appropriate error messages when requesting blocked services or operations.
            </div>
            <button onclick="this.closest('div[style*=fixed]').remove()" class="btn-primary" style="margin-top: 15px; width: 100%; padding: 10px;">Close</button>
        </div>
    `;
    document.body.appendChild(modal);
}

function collectGuardrails() {
    const serviceRestrictions = [];
    document.querySelectorAll('#serviceRestrictionsList .restriction-item').forEach(item => {
        const selects = item.querySelectorAll('select');
        const input = item.querySelector('input');
        serviceRestrictions.push({
            service: selects[0].value,
            action: selects[1].value,
            reason: input.value
        });
    });
    
    const deleteRestrictions = [];
    document.querySelectorAll('#deleteRestrictionsList .restriction-item').forEach(item => {
        const selects = item.querySelectorAll('select');
        const input = item.querySelector('input');
        deleteRestrictions.push({
            service: selects[0].value,
            environment: selects[1].value,
            reason: input.value
        });
    });
    
    const createRestrictions = [];
    document.querySelectorAll('#createRestrictionsList .restriction-item').forEach(item => {
        const selects = item.querySelectorAll('select');
        const input = item.querySelector('input');
        createRestrictions.push({
            service: selects[0].value,
            environment: selects[1].value,
            reason: input.value
        });
    });
    
    const customGuardrails = [];
    document.querySelectorAll('#customGuardrailsList .restriction-item').forEach(item => {
        const inputs = item.querySelectorAll('input');
        const select = item.querySelector('select');
        customGuardrails.push({
            name: inputs[0].value,
            type: select.value,
            condition: inputs[1].value
        });
    });
    
    return { serviceRestrictions, deleteRestrictions, createRestrictions, customGuardrails };
}

async function saveGuardrails() {
    const guardrails = collectGuardrails();
    
    if (confirm('💾 Save Guardrails?\n\nThese rules will be applied to all future access requests. Continue?')) {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/admin/save-guardrails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(guardrails)
            });
            
            const data = await response.json();
            
            if (response.ok) {
                alert('✅ Guardrails saved successfully!\n\nAI will now enforce these rules when generating permissions.');
            } else {
                alert('❌ Failed to save guardrails: ' + data.error);
            }
        } catch (error) {
            alert('❌ Error saving guardrails: ' + error.message);
        }
    }
}

async function loadGuardrails() {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/admin/guardrails');
        const data = await response.json();
        
        // Populate UI with loaded guardrails
        if (data.serviceRestrictions && data.serviceRestrictions.length > 0) {
            // Clear existing and add loaded ones
            const list = document.getElementById('serviceRestrictionsList');
            list.innerHTML = '';
            data.serviceRestrictions.forEach(rule => {
                // Add each rule to UI (simplified - just reload page for now)
            });
        }
        
        console.log('Guardrails loaded:', data);
    } catch (error) {
        console.error('Failed to load guardrails:', error);
    }
}

// Toggle AI Chat Popup
function toggleAIChat() {
    const popup = document.getElementById('aiChatPopup');
    const button = document.getElementById('aiChatButton');
    
    const isHidden = popup.style.display === 'none' || !popup.style.display || popup.style.display === '';
    
    if (isHidden) {
        popup.style.display = 'flex';
        button.style.display = 'none';
    } else {
        popup.style.display = 'none';
        button.style.display = 'flex';
    }
}

// Show chat button when in guardrails section
function showAIChatButton() {
    const button = document.getElementById('aiChatButton');
    if (button) button.style.display = 'flex';
}

// Hide chat button when leaving guardrails section
function hideAIChatButton() {
    const popup = document.getElementById('aiChatPopup');
    const button = document.getElementById('aiChatButton');
    if (popup) popup.style.display = 'none';
    if (button) button.style.display = 'none';
}
