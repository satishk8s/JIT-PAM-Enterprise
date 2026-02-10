// AWS Permissions Chat - Floating chat box for generating permissions
let awsPermConversationId = null;
let awsPermChatHistory = [];

function toggleAWSPermChat() {
    const popup = document.getElementById('awsPermChatPopup');
    const button = document.getElementById('awsPermChatButton');
    
    if (popup.style.display === 'none' || !popup.style.display) {
        popup.style.display = 'flex';
        button.style.display = 'none';
        
        // Show welcome message if chat is empty
        if (awsPermChatHistory.length === 0) {
            addAWSPermChatMessage('ai', 'Hi! I can help you generate AWS permissions. Tell me what you need to do with your selected resources.');
        }
    } else {
        popup.style.display = 'none';
        button.style.display = 'flex';
    }
}

function showAWSPermChatButton() {
    const button = document.getElementById('awsPermChatButton');
    if (button) button.style.display = 'flex';
}

function hideAWSPermChatButton() {
    const button = document.getElementById('awsPermChatButton');
    const popup = document.getElementById('awsPermChatPopup');
    if (button) button.style.display = 'none';
    if (popup) popup.style.display = 'none';
}

async function sendAWSPermMessage() {
    const input = document.getElementById('awsPermChatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Check if user wants to see policy
    if (message.toLowerCase() === 'show' || message.toLowerCase() === 'show policy') {
        if (window.currentAIPermissions) {
            addAWSPermChatMessage('user', message);
            input.value = '';
            showPolicyFloatingBox(window.currentAIPermissions);
            addAWSPermChatMessage('ai', '📋 Policy displayed on the right! You can copy it or continue adding more services.');
            return;
        } else {
            addAWSPermChatMessage('user', message);
            input.value = '';
            addAWSPermChatMessage('ai', '❌ No policy generated yet. Tell me what you need to do first.');
            return;
        }
    }
    
    const accountId = document.getElementById('requestAccount')?.value;
    if (!accountId) {
        alert('Please select an AWS account first');
        return;
    }
    
    // Add user message
    addAWSPermChatMessage('user', message);
    input.value = '';
    
    // Show loading
    const loadingId = addAWSPermChatMessage('ai', `
        <div class="periscope-inline">
            <div class="ocean-surface"></div>
            <div class="periscope">
                <div class="scan-beam"></div>
            </div>
            <div class="bubble"></div>
            <div class="bubble"></div>
            <div class="bubble"></div>
        </div> Analyzing your request...`);
    
    try {
        const response = await fetch('http://127.0.0.1:5000/api/generate-permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                use_case: message,
                account_id: accountId,
                region: selectedRegion || 'ap-south-1',
                conversation_id: awsPermConversationId,
                user_email: localStorage.getItem('currentUserEmail') || 'satish.korra@nykaa.com',
                selected_resources: selectedResources
            })
        });
        
        const data = await response.json();
        
        // ALWAYS remove loading message first
        removeAWSPermChatMessage(loadingId);
        
        if (data.error) {
            addAWSPermChatMessage('ai', `❌ ${data.error}`);
            awsPermConversationId = null; // Reset conversation on error
        } else if (data.needs_clarification) {
            awsPermConversationId = data.conversation_id;
            
            // Store permissions even during clarification (for "show" command)
            if (data.grouped_actions && Object.keys(data.grouped_actions).length > 0) {
                window.currentAIPermissions = data;
            }
            
            addAWSPermChatMessage('ai', data.question);
        } else if (data.grouped_actions) {
            awsPermConversationId = data.conversation_id;
            
            // Store permissions globally
            window.currentAIPermissions = data;
            
            // Ask user if they want to see policy or continue
            const serviceCount = Object.keys(data.grouped_actions).length;
            addAWSPermChatMessage('ai', `✅ Generated permissions for ${serviceCount} service${serviceCount > 1 ? 's' : ''}!\n\nWhat would you like to do?\n• Type "show" to view the policy\n• Or tell me about another service you need`);
            
            // Display SCP warnings if any
            if (data.scp_warnings && data.scp_warnings.length > 0) {
                data.scp_warnings.forEach(warning => {
                    addAWSPermChatMessage('ai', `⚠️ <strong>SCP Notice:</strong> ${warning.message}`);
                });
            }
        } else if (data.actions) {
            awsPermConversationId = data.conversation_id;
            
            // Store permissions
            window.currentAIPermissions = data;
            
            // Ask user if they want to see policy or continue
            addAWSPermChatMessage('ai', `✅ ${data.description}!\n\nWhat would you like to do?\n• Type "show" to view the policy\n• Or tell me about another service you need`);
            
            // Display SCP warnings if any
            if (data.scp_warnings && data.scp_warnings.length > 0) {
                data.scp_warnings.forEach(warning => {
                    addAWSPermChatMessage('ai', `⚠️ <strong>SCP Notice:</strong> ${warning.message}`);
                });
            }
        }
    } catch (error) {
        removeAWSPermChatMessage(loadingId);
        addAWSPermChatMessage('ai', '❌ Failed to generate permissions. Please try again.');
        console.error('Error:', error);
    }
}

function addAWSPermChatMessage(role, content) {
    const messagesDiv = document.getElementById('awsPermChatMessages');
    const messageId = `msg-${Date.now()}`;
    
    const messageDiv = document.createElement('div');
    messageDiv.id = messageId;
    messageDiv.style.cssText = `margin-bottom: 12px; display: flex; justify-content: ${role === 'user' ? 'flex-end' : 'flex-start'};`;
    
    const bubble = document.createElement('div');
    bubble.style.cssText = `max-width: 70%; padding: 10px 14px; border-radius: 12px; font-size: 13px; ${
        role === 'user' 
            ? 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px 12px 4px 12px;'
            : 'background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 12px 12px 12px 4px;'
    }`;
    bubble.innerHTML = content;
    
    messageDiv.appendChild(bubble);
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    awsPermChatHistory.push({ role, content });
    
    return messageId;
}

function removeAWSPermChatMessage(messageId) {
    const msg = document.getElementById(messageId);
    if (msg) msg.remove();
}

function resetAWSPermChat() {
    awsPermConversationId = null;
    awsPermChatHistory = [];
    const messagesDiv = document.getElementById('awsPermChatMessages');
    if (messagesDiv) messagesDiv.innerHTML = '';
    
    // Hide policy box
    const policyBox = document.getElementById('policyFloatingBox');
    if (policyBox) policyBox.style.display = 'none';
}

function showPolicyFloatingBox(data) {
    let policyBox = document.getElementById('policyFloatingBox');
    
    if (!policyBox) {
        // Create policy floating box
        policyBox = document.createElement('div');
        policyBox.id = 'policyFloatingBox';
        policyBox.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 450px;
            width: 400px;
            max-height: 600px;
            background: var(--bg-primary);
            border: 2px solid #667eea;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            display: flex;
            flex-direction: column;
            z-index: 9999;
        `;
        
        policyBox.innerHTML = `
            <div style="padding: 15px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px 10px 0 0;">
                <h4 style="margin: 0; font-size: 14px; font-weight: 600; color: white;">
                    <i class="fas fa-file-code"></i> Generated Policy
                </h4>
                <button onclick="document.getElementById('policyFloatingBox').style.display='none'" style="background: none; border: none; color: white; font-size: 18px; cursor: pointer; padding: 0; width: 24px; height: 24px;">✕</button>
            </div>
            <div id="policyContent" style="flex: 1; overflow-y: auto; padding: 15px; font-size: 12px; line-height: 1.6;"></div>
            <div style="padding: 12px; border-top: 1px solid var(--border-color); display: flex; gap: 8px;">
                <button onclick="copyPolicyToClipboard()" class="btn-secondary" style="flex: 1; padding: 8px; font-size: 12px; border-radius: 6px;">
                    <i class="fas fa-copy"></i> Copy
                </button>
                <button onclick="showFullPolicyModal()" class="btn-primary" style="flex: 1; padding: 8px; font-size: 12px; border-radius: 6px;">
                    <i class="fas fa-expand"></i> View Full
                </button>
            </div>
        `;
        
        document.body.appendChild(policyBox);
    }
    
    // Update policy content
    const policyContent = document.getElementById('policyContent');
    let html = '';
    
    if (data.grouped_actions) {
        // Multi-service policy
        for (const [service, serviceData] of Object.entries(data.grouped_actions)) {
            const actions = serviceData.actions || [];
            const resources = serviceData.resources || [];
            
            html += `
                <div style="margin-bottom: 15px; padding: 12px; background: var(--bg-secondary); border-radius: 8px; border-left: 3px solid #667eea;">
                    <div style="font-weight: 600; color: #667eea; margin-bottom: 8px; text-transform: uppercase; font-size: 11px;">
                        ${service} (${actions.length} actions)
                    </div>
                    ${actions.map(action => `
                        <div style="padding: 4px 0; color: var(--text-primary); font-family: 'Courier New', monospace; font-size: 11px;">
                            • ${action}
                        </div>
                    `).join('')}
                    ${resources.length > 0 ? `
                        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); font-size: 10px; color: var(--text-secondary);">
                            <strong>Resources:</strong><br>
                            ${resources.slice(0, 3).map(r => `<div style="padding: 2px 0;">• ${r.length > 50 ? r.substring(0, 50) + '...' : r}</div>`).join('')}
                            ${resources.length > 3 ? `<div style="padding: 2px 0;">... and ${resources.length - 3} more</div>` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        }
    } else if (data.actions) {
        // Single statement policy
        html = `
            <div style="padding: 12px; background: var(--bg-secondary); border-radius: 8px; border-left: 3px solid #667eea;">
                <div style="font-weight: 600; color: #667eea; margin-bottom: 8px; font-size: 11px;">
                    ACTIONS (${data.actions.length})
                </div>
                ${data.actions.map(action => `
                    <div style="padding: 4px 0; color: var(--text-primary); font-family: 'Courier New', monospace; font-size: 11px;">
                        • ${action}
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    policyContent.innerHTML = html;
    policyBox.style.display = 'flex';
}

function showFullPolicyModal() {
    if (!window.currentAIPermissions) {
        alert('No policy generated yet');
        return;
    }
    
    const data = window.currentAIPermissions;
    let policy;
    
    if (data.grouped_actions) {
        // Multi-service policy
        const statements = [];
        for (const [service, serviceData] of Object.entries(data.grouped_actions)) {
            statements.push({
                Sid: service.toUpperCase().replace(/-/g, ''),
                Effect: 'Allow',
                Action: serviceData.actions,
                Resource: serviceData.resources
            });
        }
        policy = {
            Version: '2012-10-17',
            Statement: statements
        };
    } else {
        // Single statement policy
        policy = {
            Version: '2012-10-17',
            Statement: [{
                Effect: 'Allow',
                Action: data.actions,
                Resource: data.resources || ['*']
            }]
        };
    }
    
    // Store for copying
    window.currentGeneratedPolicy = policy;
    
    // Show modal
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 0; max-width: 700px; width: 90%; max-height: 85vh; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
            <div style="padding: 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                <h3 style="margin: 0; color: white; font-size: 16px; font-weight: 600;"><i class="fas fa-file-code"></i> IAM Policy JSON</h3>
                <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: white;">&times;</button>
            </div>
            <div style="padding: 20px; overflow: auto; max-height: calc(85vh - 140px);">
                <pre style="background: var(--bg-secondary); padding: 20px; border-radius: 8px; overflow: auto; color: var(--text-primary); font-size: 13px; line-height: 1.6; margin: 0; border: 1px solid var(--border-color);">${JSON.stringify(policy, null, 2)}</pre>
            </div>
            <div style="padding: 20px; border-top: 1px solid var(--border-color); display: flex; gap: 10px;">
                <button onclick="copyPolicyToClipboard()" class="btn-secondary" style="flex: 1; padding: 10px; border-radius: 8px;"><i class="fas fa-copy"></i> Copy</button>
                <button onclick="this.closest('div[style*=fixed]').remove()" class="btn-primary" style="flex: 1; padding: 10px; border-radius: 8px;">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function copyPolicyToClipboard() {
    if (!window.currentGeneratedPolicy && !window.currentAIPermissions) {
        alert('No policy to copy');
        return;
    }
    
    let policy;
    if (window.currentGeneratedPolicy) {
        policy = window.currentGeneratedPolicy;
    } else {
        const data = window.currentAIPermissions;
        if (data.grouped_actions) {
            const statements = [];
            for (const [service, serviceData] of Object.entries(data.grouped_actions)) {
                statements.push({
                    Sid: service.toUpperCase().replace(/-/g, ''),
                    Effect: 'Allow',
                    Action: serviceData.actions,
                    Resource: serviceData.resources
                });
            }
            policy = {
                Version: '2012-10-17',
                Statement: statements
            };
        } else {
            policy = {
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Action: data.actions,
                    Resource: data.resources || ['*']
                }]
            };
        }
    }
    
    navigator.clipboard.writeText(JSON.stringify(policy, null, 2));
    alert('✅ Policy copied to clipboard!');
}
