// Redesigned Guardrails Management - My Guardrails, Default Guardrails, Create Guardrails

let currentGuardrailView = 'my'; // 'my', 'default', 'create'
let guardrailAIConversationId = null;

// Switch between guardrail views
function showGuardrailView(view) {
    currentGuardrailView = view;
    
    // Hide all views
    document.getElementById('myGuardrailsView').style.display = 'none';
    document.getElementById('defaultGuardrailsView').style.display = 'none';
    document.getElementById('createGuardrailsView').style.display = 'none';
    
    // Hide AI chat button and popup
    const aiButton = document.getElementById('guardrailAIChatButton');
    const aiPopup = document.getElementById('guardrailAIChatPopup');
    if (aiButton) aiButton.style.display = 'none';
    if (aiPopup) aiPopup.style.display = 'none';
    
    // Remove active class from all tabs
    document.querySelectorAll('.guardrail-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected view and activate tab
    if (view === 'my') {
        document.getElementById('myGuardrailsView').style.display = 'block';
        document.querySelector('[onclick="showGuardrailView(\'my\')"]').classList.add('active');
        loadMyGuardrails();
    } else if (view === 'default') {
        document.getElementById('defaultGuardrailsView').style.display = 'block';
        document.querySelector('[onclick="showGuardrailView(\'default\')"]').classList.add('active');
        loadDefaultGuardrails();
    } else if (view === 'create') {
        document.getElementById('createGuardrailsView').style.display = 'block';
        document.querySelector('[onclick="showGuardrailView(\'create\')"]').classList.add('active');
        // Show AI chat button on Create tab
        if (aiButton) aiButton.style.display = 'flex';
    }
}

// Show create method selection
function showCreateMethod(method) {
    if (method === 'manual') {
        document.getElementById('manualCreateSection').style.display = 'block';
    } else if (method === 'ai') {
        toggleGuardrailAIChat();
    }
}

// Toggle Guardrail AI Chat
function toggleGuardrailAIChat() {
    const popup = document.getElementById('guardrailAIChatPopup');
    const button = document.getElementById('guardrailAIChatButton');
    
    if (popup.style.display === 'none' || !popup.style.display) {
        popup.style.display = 'flex';
        button.style.display = 'none';
        
        // Always start fresh when opening chat
        guardrailAIConversationId = null;
        document.getElementById('guardrailAIChatMessages').innerHTML = '';
        addGuardrailAIChatMessage('ai', '👋 Hi! I can help you create security guardrails. Tell me what you want to restrict or control.');
    } else {
        popup.style.display = 'none';
        button.style.display = 'flex';
    }
}

// Load My Guardrails
async function loadMyGuardrails() {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/admin/my-guardrails');
        const data = await response.json();
        
        const container = document.getElementById('myGuardrailsList');
        container.innerHTML = '';
        
        if (!data.guardrails || data.guardrails.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: var(--text-secondary);">
                    <i class="fas fa-shield-alt" style="font-size: 48px; opacity: 0.3; margin-bottom: 15px;"></i>
                    <p style="font-size: 16px; margin: 0;">No guardrails created yet</p>
                    <p style="font-size: 13px; margin: 10px 0 20px 0;">Create your first guardrail to start protecting your AWS resources</p>
                    <button onclick="showGuardrailView('create')" class="btn-primary">
                        <i class="fas fa-plus"></i> Create Guardrail
                    </button>
                </div>
            `;
            return;
        }
        
        data.guardrails.forEach(guardrail => {
            const card = createGuardrailCard(guardrail);
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Failed to load my guardrails:', error);
    }
}

// Load Default Guardrails
async function loadDefaultGuardrails() {
    const container = document.getElementById('defaultGuardrailsList');
    container.innerHTML = '';
    
    // Default guardrails with toggle and group management
    const defaults = [
        {
            id: 'default-1',
            name: 'No Wildcard Permissions',
            description: 'Prevents requesting full access permissions like ec2:*, s3:*, etc. Ensures granular permission control.',
            importance: 'Critical for least privilege principle. Wildcard permissions grant excessive access and violate security best practices.',
            icon: 'fa-asterisk',
            iconColor: '#f44336',
            severity: 'critical',
            enabled: true,
            allowedGroups: [],
            deniedGroups: ['All Users']
        },
        {
            id: 'default-2',
            name: 'Resource ARN Required',
            description: 'Enforces specific resource ARNs in permission requests. Only DevOps group can request "*" resource permissions.',
            importance: 'Prevents broad resource access. Specific ARNs ensure users only access intended resources, reducing blast radius.',
            icon: 'fa-link',
            iconColor: '#ff9800',
            severity: 'critical',
            enabled: true,
            allowedGroups: ['DevOps'],
            deniedGroups: []
        },
        {
            id: 'default-3',
            name: 'Network Resources - Networking Team Only',
            description: 'Restricts security groups, VPC, subnets, route tables, load balancers, transit gateways, peerings, and VPN access to Networking group only.',
            importance: 'Network changes impact entire infrastructure. Centralized control prevents misconfigurations, outages, and security holes.',
            icon: 'fa-network-wired',
            iconColor: '#2196f3',
            severity: 'high',
            enabled: true,
            allowedGroups: ['Networking'],
            deniedGroups: ['*']
        },
        {
            id: 'default-4',
            name: 'IAM & Identity - Identity Team Only',
            description: 'Restricts IAM roles, groups, policies, users, access keys, identity providers, access analyzer, and resource-based policies (S3, DynamoDB, SNS, SES, SQS) to Identity team only.',
            importance: 'IAM controls access to everything. Unauthorized changes can grant attackers full access or lock out legitimate users.',
            icon: 'fa-user-shield',
            iconColor: '#9c27b0',
            severity: 'critical',
            enabled: true,
            allowedGroups: ['Identity'],
            deniedGroups: ['*']
        },
        {
            id: 'default-5',
            name: 'Secrets & Encryption - Vault Team Only',
            description: 'Restricts KMS and Secrets Manager operations (create/rotate secrets, create/delete KMS keys, update KMS policies) to Vault team only.',
            importance: 'Encryption keys and secrets protect sensitive data. Unauthorized access can expose credentials, decrypt data, or cause data loss.',
            icon: 'fa-key',
            iconColor: '#ff5722',
            severity: 'critical',
            enabled: true,
            allowedGroups: ['Vault'],
            deniedGroups: ['*']
        },
        {
            id: 'default-6',
            name: 'Management Account - Security Team Only',
            description: 'Restricts Identity Center, Organizations, SCPs, Control Tower, WAF, GuardDuty, and Incident Manager to Security team only.',
            importance: 'Management account controls all AWS accounts. Unauthorized changes can disable security controls, modify org structure, or compromise entire organization.',
            icon: 'fa-shield-alt',
            iconColor: '#4caf50',
            severity: 'critical',
            enabled: true,
            allowedGroups: ['Security'],
            deniedGroups: ['*']
        }
    ];
    
    defaults.forEach(guardrail => {
        const card = createDefaultGuardrailCard(guardrail);
        container.appendChild(card);
    });
}

// Create guardrail card for My Guardrails
function createGuardrailCard(guardrail) {
    const card = document.createElement('div');
    card.className = 'guardrail-card-item';
    card.style.cssText = 'background: var(--bg-secondary); border: 1.5px solid var(--border-color); border-radius: 12px; padding: 20px; margin-bottom: 15px;';
    
    const typeIcon = guardrail.createdBy === 'ai' ? '🤖' : '✍️';
    const typeLabel = guardrail.createdBy === 'ai' ? 'AI Generated' : 'Manual';
    const severityColor = {
        'critical': '#f44336',
        'high': '#ff9800',
        'medium': '#ffc107',
        'low': '#4caf50'
    }[guardrail.severity || 'medium'];
    
    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start;">
            <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                    <h4 style="margin: 0; color: var(--text-primary); font-size: 15px;">${guardrail.name}</h4>
                    <span style="background: ${severityColor}20; color: ${severityColor}; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">${guardrail.severity?.toUpperCase() || 'MEDIUM'}</span>
                    <span style="background: var(--bg-primary); padding: 3px 8px; border-radius: 4px; font-size: 11px;">${typeIcon} ${typeLabel}</span>
                </div>
                <p style="margin: 0 0 10px 0; color: var(--text-secondary); font-size: 13px;">${guardrail.description}</p>
                <div style="display: flex; gap: 15px; font-size: 12px; color: var(--text-secondary);">
                    <span><i class="fas fa-server"></i> ${guardrail.service?.toUpperCase() || 'N/A'}</span>
                    <span><i class="fas fa-calendar"></i> ${guardrail.createdAt || 'Recently'}</span>
                    <span><i class="fas fa-user"></i> ${guardrail.createdByUser || 'Admin'}</span>
                </div>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <button onclick="editGuardrail('${guardrail.id}')" class="btn-secondary btn-sm" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteGuardrail('${guardrail.id}')" class="btn-danger btn-sm" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
    
    return card;
}

// Create default guardrail card with toggle and group management
function createDefaultGuardrailCard(guardrail) {
    const card = document.createElement('div');
    card.className = 'default-guardrail-tile';
    
    const severityColor = {
        'critical': '#f44336',
        'high': '#ff9800',
        'medium': '#ffc107',
        'low': '#4caf50'
    }[guardrail.severity];
    
    card.innerHTML = `
        <div class="guardrail-tile-header">
            <div class="guardrail-icon" style="background: linear-gradient(135deg, ${guardrail.iconColor}20, ${guardrail.iconColor}40); color: ${guardrail.iconColor};">
                <i class="fas ${guardrail.icon}"></i>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" ${guardrail.enabled ? 'checked' : ''} onchange="toggleDefaultGuardrail('${guardrail.id}', this.checked)">
                <span class="toggle-slider"></span>
            </label>
        </div>
        
        <div class="guardrail-tile-content">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <h4 class="guardrail-tile-title">${guardrail.name}</h4>
                <span class="severity-badge" style="background: ${severityColor}20; color: ${severityColor};">${guardrail.severity.toUpperCase()}</span>
            </div>
            <p class="guardrail-tile-description">${guardrail.description}</p>
            <div class="guardrail-importance">
                <i class="fas fa-info-circle" style="color: #2196f3;"></i>
                <span>${guardrail.importance}</span>
            </div>
        </div>
        
        <div id="groups-${guardrail.id}" class="guardrail-groups-section" style="display: ${guardrail.enabled ? 'block' : 'none'};">
            <div class="groups-header">
                <span style="font-size: 13px; color: var(--text-primary); font-weight: 600;">Group Access Control</span>
            </div>
            
            <div class="group-control-row">
                <div class="group-label">
                    <i class="fas fa-check-circle" style="color: #4caf50;"></i>
                    <span>Allowed Groups:</span>
                </div>
                <div class="group-tags" id="allowed-${guardrail.id}">
                    ${guardrail.allowedGroups.length > 0 ? guardrail.allowedGroups.map(g => `<span class="group-tag allowed">${g}</span>`).join('') : '<span class="group-tag-empty">None</span>'}
                </div>
                <button onclick="editAllowedGroups('${guardrail.id}')" class="btn-icon" title="Edit Allowed Groups">
                    <i class="fas fa-edit"></i>
                </button>
            </div>
            
            <div class="group-control-row">
                <div class="group-label">
                    <i class="fas fa-times-circle" style="color: #f44336;"></i>
                    <span>Denied Groups:</span>
                </div>
                <div class="group-tags" id="denied-${guardrail.id}">
                    ${guardrail.deniedGroups.length > 0 ? guardrail.deniedGroups.map(g => `<span class="group-tag denied">${g === '*' ? 'All Others' : g}</span>`).join('') : '<span class="group-tag-empty">None</span>'}
                </div>
                <button onclick="editDeniedGroups('${guardrail.id}')" class="btn-icon" title="Edit Denied Groups">
                    <i class="fas fa-edit"></i>
                </button>
            </div>
        </div>
    `;
    
    return card;
}

// Toggle default guardrail
function toggleDefaultGuardrail(guardrailId, enabled) {
    const groupsDiv = document.getElementById(`groups-${guardrailId}`);
    groupsDiv.style.display = enabled ? 'block' : 'none';
    
    // TODO: Save to backend
    console.log(`Guardrail ${guardrailId} ${enabled ? 'enabled' : 'disabled'}`);
}

// Edit allowed groups
function editAllowedGroups(guardrailId) {
    showGroupEditModal(guardrailId, 'allowed');
}

// Edit denied groups
function editDeniedGroups(guardrailId) {
    showGroupEditModal(guardrailId, 'denied');
}

// Show group edit modal
function showGroupEditModal(guardrailId, type) {
    const container = document.getElementById(`${type}-${guardrailId}`);
    const currentGroups = Array.from(container.querySelectorAll('.group-tag')).map(el => {
        const text = el.textContent;
        return text === 'All Others' ? '*' : text;
    }).filter(g => g);
    
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    
    modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 24px; width: 500px; max-width: 90%;">
            <h4 style="margin: 0 0 15px 0; color: var(--text-primary);">Edit ${type === 'allowed' ? 'Allowed' : 'Denied'} Groups</h4>
            <div id="groupTagsContainer" style="display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); margin-bottom: 15px; min-height: 50px;">
                ${currentGroups.map(g => `<span class="group-tag-edit ${type}" data-group="${g}">${g === '*' ? 'All Others' : g} <button onclick="removeGroupTag(this)" style="margin-left: 6px; background: none; border: none; color: inherit; cursor: pointer; font-weight: bold;">×</button></span>`).join('')}
            </div>
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <input type="text" id="newGroupInput" placeholder="Enter group name" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);" onkeydown="if(event.key==='Enter'){addGroupTag('${type}');event.preventDefault();}">
                <button onclick="addGroupTag('${type}')" class="btn-primary btn-sm">Add</button>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="closeGroupEditModal()" class="btn-secondary">Cancel</button>
                <button onclick="saveGroupChanges('${guardrailId}', '${type}')" class="btn-primary">Save</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) closeGroupEditModal(); };
}

function addGroupTag(type) {
    const input = document.getElementById('newGroupInput');
    const value = input.value.trim();
    if (!value) return;
    
    const container = document.getElementById('groupTagsContainer');
    const tag = document.createElement('span');
    tag.className = `group-tag-edit ${type}`;
    tag.dataset.group = value;
    tag.innerHTML = `${value === '*' ? 'All Others' : value} <button onclick="removeGroupTag(this)" style="margin-left: 6px; background: none; border: none; color: inherit; cursor: pointer; font-weight: bold;">×</button>`;
    container.appendChild(tag);
    input.value = '';
}

function removeGroupTag(btn) {
    btn.parentElement.remove();
}

function closeGroupEditModal() {
    const modals = document.querySelectorAll('body > div[style*="position: fixed"]');
    modals.forEach(m => m.remove());
}

function saveGroupChanges(guardrailId, type) {
    const tags = Array.from(document.querySelectorAll('#groupTagsContainer .group-tag-edit')).map(el => el.dataset.group);
    const container = document.getElementById(`${type}-${guardrailId}`);
    container.innerHTML = tags.length > 0 ? tags.map(g => `<span class="group-tag ${type}">${g === '*' ? 'All Others' : g}</span>`).join('') : '<span class="group-tag-empty">None</span>';
    console.log(`Updated ${type} groups for ${guardrailId}:`, tags);
    closeGroupEditModal();
    // TODO: Save to backend
}



// Send Guardrail AI Message
async function sendGuardrailAIMessage() {
    const input = document.getElementById('guardrailAIInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    addGuardrailAIChatMessage('user', message);
    input.value = '';
    
    const loadingId = addGuardrailAIChatMessage('ai', `
        <div class="periscope-inline">
            <div class="ocean-surface"></div>
            <div class="periscope">
                <div class="scan-beam"></div>
            </div>
            <div class="bubble"></div>
            <div class="bubble"></div>
            <div class="bubble"></div>
        </div> Understanding your requirement...`);
    
    try {
        const response = await fetch('http://127.0.0.1:5000/api/admin/generate-guardrails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversation_id: guardrailAIConversationId,
                user_message: message
            })
        });
        
        const data = await response.json();
        removeGuardrailAIChatMessage(loadingId);
        
        // Handle conversation reset
        if (data.reset_conversation || data.conversation_id === null) {
            console.log('🔄 Conversation reset by backend');
            guardrailAIConversationId = null;
        } else if (data.conversation_id) {
            guardrailAIConversationId = data.conversation_id;
        }
        
        if (data.error) {
            addGuardrailAIChatMessage('ai', `❌ ${data.error}`);
            // If MFA error, clear conversation state
            if (data.error.includes('MFA token')) {
                guardrailAIConversationId = null;
            }
        } else if (data.needs_confirmation || data.understanding) {
            console.log('🔘 Showing confirmation buttons for:', data);
            addGuardrailAIChatMessage('ai', data.understanding || data.question || data.ai_response);
            // Always show confirmation buttons when needs_confirmation is true
            showGuardrailConfirmButtons(data.preview || {});
        } else if (data.ready || data.status === 'ready') {
            addGuardrailAIChatMessage('ai', '✅ Guardrail created successfully!');
            // Reset conversation after success
            guardrailAIConversationId = null;
            setTimeout(() => {
                showGuardrailView('my');
            }, 1500);
        } else if (data.ai_response || data.question) {
            addGuardrailAIChatMessage('ai', data.ai_response || data.question);
        } else {
            addGuardrailAIChatMessage('ai', 'I need more information to help you create a guardrail.');
        }
    } catch (error) {
        removeGuardrailAIChatMessage(loadingId);
        addGuardrailAIChatMessage('ai', '❌ Error connecting to AI. Please try again.');
        console.error('AI Error:', error);
        // Reset conversation on connection error
        guardrailAIConversationId = null;
    }
}

function addGuardrailAIChatMessage(role, content) {
    const messagesDiv = document.getElementById('guardrailAIChatMessages');
    const messageId = `msg-${Date.now()}`;
    
    const messageDiv = document.createElement('div');
    messageDiv.id = messageId;
    messageDiv.style.cssText = `margin-bottom: 12px; display: flex; flex-direction: column; align-items: ${role === 'user' ? 'flex-end' : 'flex-start'};`;
    
    const bubble = document.createElement('div');
    bubble.style.cssText = `max-width: 70%; padding: 10px 14px; border-radius: 12px; font-size: 13px; ${
        role === 'user' 
            ? 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;'
            : 'background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color);'
    }`;
    bubble.innerHTML = content;
    
    messageDiv.appendChild(bubble);
    
    // Add feedback buttons for AI messages
    if (role === 'ai' && !content.includes('periscope-inline')) {
        const feedbackDiv = document.createElement('div');
        feedbackDiv.style.cssText = 'display: flex; gap: 8px; margin-top: 6px;';
        feedbackDiv.innerHTML = `
            <button onclick="submitFeedback('${messageId}', 'up')" class="feedback-btn" title="Helpful">
                <i class="fas fa-thumbs-up"></i>
            </button>
            <button onclick="submitFeedback('${messageId}', 'down')" class="feedback-btn" title="Not helpful">
                <i class="fas fa-thumbs-down"></i>
            </button>
        `;
        messageDiv.appendChild(feedbackDiv);
    }
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    return messageId;
}

function removeGuardrailAIChatMessage(messageId) {
    const msg = document.getElementById(messageId);
    if (msg) msg.remove();
}

function submitFeedback(messageId, type) {
    const messageDiv = document.getElementById(messageId);
    const feedbackDiv = messageDiv.querySelector('div[style*="gap: 8px"]');
    
    if (type === 'up') {
        feedbackDiv.innerHTML = '<span style="color: #4caf50; font-size: 12px;"><i class="fas fa-check"></i> Thanks for your feedback!</span>';
        console.log(`Positive feedback for message ${messageId}`);
        // TODO: Send to backend
    } else {
        feedbackDiv.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                <textarea id="feedback-text-${messageId}" placeholder="What went wrong?" rows="2" style="padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); font-size: 12px; resize: vertical;"></textarea>
                <button onclick="submitNegativeFeedback('${messageId}')" class="btn-primary btn-sm" style="align-self: flex-end; padding: 4px 12px; font-size: 11px;">Submit</button>
            </div>
        `;
    }
}

function submitNegativeFeedback(messageId) {
    const textarea = document.getElementById(`feedback-text-${messageId}`);
    const feedback = textarea.value.trim();
    
    const messageDiv = document.getElementById(messageId);
    const feedbackDiv = messageDiv.querySelector('div[style*="flex-direction: column"]').parentElement;
    feedbackDiv.innerHTML = '<span style="color: #f44336; font-size: 12px;"><i class="fas fa-check"></i> Feedback submitted. We\'ll improve!</span>';
    
    console.log(`Negative feedback for message ${messageId}:`, feedback);
    // TODO: Send to backend
}

function showGuardrailConfirmButtons(guardrail) {
    const messagesDiv = document.getElementById('guardrailAIChatMessages');
    const buttonsDiv = document.createElement('div');
    buttonsDiv.style.cssText = 'display: flex; gap: 10px; justify-content: center; margin: 15px 0;';
    buttonsDiv.innerHTML = `
        <button onclick="promptMFAAndCreate()" class="btn-primary">
            ✅ Create Guardrail
        </button>
        <button onclick="cancelGuardrailCreation()" class="btn-secondary">
            ❌ Cancel
        </button>
    `;
    messagesDiv.appendChild(buttonsDiv);
}

function promptMFAAndCreate() {
    const mfaToken = prompt('Enter your 6-digit MFA token to create the guardrail:');
    if (mfaToken && mfaToken.length === 6 && /^\d{6}$/.test(mfaToken)) {
        confirmGuardrailCreation(mfaToken);
    } else if (mfaToken !== null) {
        alert('Invalid MFA token. Please enter a 6-digit number.');
    }
}

async function confirmGuardrailCreation(mfaToken) {
    const loadingId = addGuardrailAIChatMessage('ai', `
        <div class="periscope-inline">
            <div class="ocean-surface"></div>
            <div class="periscope">
                <div class="scan-beam"></div>
            </div>
            <div class="bubble"></div>
            <div class="bubble"></div>
            <div class="bubble"></div>
        </div> Creating guardrail...`);
    
    try {
        const response = await fetch('http://127.0.0.1:5000/api/admin/generate-guardrails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversation_id: guardrailAIConversationId,
                user_message: 'yes',
                mfa_token: mfaToken
            })
        });
        
        const data = await response.json();
        removeGuardrailAIChatMessage(loadingId);
        
        // Handle conversation reset
        if (data.reset_conversation || data.conversation_id === null) {
            console.log('🔄 Conversation reset after creation attempt');
            guardrailAIConversationId = null;
        }
        
        if (data.error) {
            addGuardrailAIChatMessage('ai', `❌ ${data.error}`);
            // Reset conversation on MFA error
            if (data.error.includes('MFA token')) {
                guardrailAIConversationId = null;
            }
        } else if (data.status === 'ready') {
            addGuardrailAIChatMessage('ai', '✅ Guardrail created successfully!');
            guardrailAIConversationId = null;  // Reset conversation
            setTimeout(() => {
                showGuardrailView('my');
            }, 1500);
        } else {
            addGuardrailAIChatMessage('ai', data.ai_response || 'Guardrail creation completed.');
        }
    } catch (error) {
        removeGuardrailAIChatMessage(loadingId);
        addGuardrailAIChatMessage('ai', '❌ Error creating guardrail. Please try again.');
        console.error('Creation Error:', error);
        // Reset conversation on error
        guardrailAIConversationId = null;
    }
}

function cancelGuardrailCreation() {
    // Clear conversation state
    guardrailAIConversationId = null;
    
    // Clear chat messages
    document.getElementById('guardrailAIChatMessages').innerHTML = '';
    
    // Start fresh
    addGuardrailAIChatMessage('ai', '👋 Hi! I can help you create security guardrails. Tell me what you want to restrict or control.');
}

// Edit and Delete functions
function editGuardrail(id) {
    alert(`Edit guardrail: ${id}`);
    // TODO: Implement edit functionality
}

function deleteGuardrail(id) {
    if (confirm('Are you sure you want to delete this guardrail?')) {
        // TODO: Call API to delete
        alert(`Deleted guardrail: ${id}`);
        loadMyGuardrails();
    }
}
