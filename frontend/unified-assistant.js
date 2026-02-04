// Unified AI Assistant - Combines Help + Policy Builder
// Professional UI with conversational flow

let unifiedConversationId = null;
let unifiedChatHistory = [];
let currentState = {
    account_id: null,
    region: null,
    use_case: null,
    services: [],
    resources: {},
    justification: null,
    step: 'welcome'
};

// Initialize unified assistant - ENABLED for requests page
function initUnifiedAssistant() {
    // Only show on requests page
    const currentPage = document.querySelector('.page.active');
    const isRequestsPage = currentPage && currentPage.id === 'requestsPage';
    
    if (!isRequestsPage) {
        // Remove if exists and not on requests page
        const button = document.getElementById('unifiedAssistantButton');
        const popup = document.getElementById('unifiedAssistantPopup');
        if (button) button.remove();
        if (popup) popup.remove();
        return;
    }
    
    // Create UI if on requests page and doesn't exist
    if (!document.getElementById('unifiedAssistantButton') && typeof createUnifiedAssistantUI === 'function') {
        createUnifiedAssistantUI();
    }
}

function createUnifiedAssistantUI() {
    // ALWAYS check if we're on requests page before creating
    const currentPage = document.querySelector('.page.active');
    const isRequestsPage = currentPage && currentPage.id === 'requestsPage';
    
    console.log('🔍 createUnifiedAssistantUI - Current page:', currentPage ? currentPage.id : 'none', 'isRequestsPage:', isRequestsPage);
    
    if (!isRequestsPage) {
        console.log('⚠️ NOT on requests page, ABORTING button creation');
        return;
    }
    
    // Double-check button doesn't already exist
    if (document.getElementById('unifiedAssistantButton')) {
        console.log('⚠️ Button already exists, skipping creation');
        return;
    }
    
    console.log('✅ Creating unified assistant button on requests page');
    
    // Create floating button
    const button = document.createElement('div');
    button.id = 'unifiedAssistantButton';
    button.className = 'unified-assistant-button';
    // Set display to flex with !important immediately
    button.style.setProperty('display', 'flex', 'important');
    button.innerHTML = `
        <div class="unified-assistant-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/>
            </svg>
        </div>
        <span class="unified-assistant-label">GovernAIX</span>
    `;
    button.onclick = toggleUnifiedAssistant;
    document.body.appendChild(button);
    
    // Create chat popup
    const popup = document.createElement('div');
    popup.id = 'unifiedAssistantPopup';
    popup.className = 'unified-assistant-popup';
    popup.innerHTML = `
        <div class="unified-assistant-header">
            <div class="unified-assistant-header-content">
                <div class="unified-assistant-avatar">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" fill="url(#gradient)"/>
                        <path d="M12 16v-4m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="white" stroke-width="2" stroke-linecap="round"/>
                        <defs>
                            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
                            </linearGradient>
                        </defs>
                    </svg>
                </div>
                <div class="unified-assistant-header-text">
                    <h4>GovernAIX</h4>
                    <p>Your guide & policy builder</p>
                </div>
            </div>
            <div class="unified-assistant-actions">
                <button class="unified-assistant-action-btn" onclick="resetUnifiedAssistant()" title="Reset">
                    <i class="fas fa-redo"></i>
                </button>
                <button class="unified-assistant-action-btn" onclick="toggleUnifiedAssistant()" title="Close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
        
        <div class="unified-assistant-progress" id="unifiedAssistantProgress" style="display: none;">
            <div class="progress-steps">
                <div class="progress-step" data-step="account">
                    <div class="progress-step-icon"><i class="fas fa-building"></i></div>
                    <div class="progress-step-label">Account</div>
                </div>
                <div class="progress-step" data-step="region">
                    <div class="progress-step-icon"><i class="fas fa-globe"></i></div>
                    <div class="progress-step-label">Region</div>
                </div>
                <div class="progress-step" data-step="use_case">
                    <div class="progress-step-icon"><i class="fas fa-lightbulb"></i></div>
                    <div class="progress-step-label">Use Case</div>
                </div>
                <div class="progress-step" data-step="services">
                    <div class="progress-step-icon"><i class="fas fa-cogs"></i></div>
                    <div class="progress-step-label">Services</div>
                </div>
                <div class="progress-step" data-step="justification">
                    <div class="progress-step-icon"><i class="fas fa-check-circle"></i></div>
                    <div class="progress-step-label">Justification</div>
                </div>
            </div>
        </div>
        
        <div class="unified-assistant-messages" id="unifiedAssistantMessages">
            <div class="unified-assistant-message assistant welcome">
                <div class="message-avatar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" fill="#667eea"/>
                        <path d="M12 16v-4m0-4h.01" stroke="white" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
                <div class="message-content">
                    <p>Hi! I'm GovernAIX. I can help you with:</p>
                    <ul>
                        <li>📚 Navigating the system</li>
                        <li>🔐 Building access policies</li>
                        <li>❓ Answering questions</li>
                    </ul>
                    <p><strong>What would you like to do?</strong></p>
                </div>
            </div>
        </div>
        
        <div class="unified-assistant-input-area">
            <div class="unified-assistant-input-wrapper">
                <textarea 
                    id="unifiedAssistantInput" 
                    class="unified-assistant-input"
                    placeholder="Ask me anything or start building a policy..."
                    rows="1"
                    onkeydown="handleUnifiedAssistantKeydown(event)"
                ></textarea>
                <button class="unified-assistant-send-btn" onclick="sendUnifiedAssistantMessage()">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
            <div class="unified-assistant-quick-actions" id="unifiedAssistantQuickActions">
                <button class="quick-action-btn" onclick="sendQuickMessage('How do I request access?')">
                    <i class="fas fa-question-circle"></i> How to request access?
                </button>
                <button class="quick-action-btn" onclick="sendQuickMessage('I need to build a policy')">
                    <i class="fas fa-shield-alt"></i> Build a policy
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);
    
    // Auto-resize textarea
    const input = document.getElementById('unifiedAssistantInput');
    if (input) {
        input.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
    }
}

function toggleUnifiedAssistant() {
    const popup = document.getElementById('unifiedAssistantPopup');
    const button = document.getElementById('unifiedAssistantButton');
    
    if (!popup || !button) return;
    
    const isHidden = popup.style.display === 'none' || !popup.style.display;
    
    if (isHidden) {
        popup.style.display = 'flex';
        button.style.display = 'none';
        // Focus input
        setTimeout(() => {
            const input = document.getElementById('unifiedAssistantInput');
            if (input) input.focus();
        }, 100);
    } else {
        popup.style.display = 'none';
        button.style.display = 'flex';
    }
}

function handleUnifiedAssistantKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendUnifiedAssistantMessage();
    }
}

function sendQuickMessage(message) {
    const input = document.getElementById('unifiedAssistantInput');
    if (input) {
        input.value = message;
        sendUnifiedAssistantMessage();
    }
}

async function sendUnifiedAssistantMessage() {
    const input = document.getElementById('unifiedAssistantInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Add user message to chat
    addUnifiedAssistantMessage('user', message);
    input.value = '';
    input.style.height = 'auto';
    
    // Show loading state
    const loadingId = addUnifiedAssistantMessage('assistant', 'thinking', true);
    
    try {
        const response = await fetch('http://127.0.0.1:5000/api/unified-assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversation_id: unifiedConversationId,
                user_message: message,
                user_email: localStorage.getItem('userEmail') || 'user@example.com'
            })
        });
        
        // Remove loading message
        removeUnifiedAssistantMessage(loadingId);
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to get response');
        }
        
        // Update conversation ID
        if (data.conversation_id) {
            unifiedConversationId = data.conversation_id;
        }
        
        // Update state
        if (data.state) {
            currentState = { ...currentState, ...data.state };
        }
        
        // Update progress indicator
        if (data.step && data.type === 'policy_building') {
            updateProgressIndicator(data.step);
            showProgressIndicator();
        } else {
            hideProgressIndicator();
        }
        
        // Add AI response
        if (data.ai_response) {
            addUnifiedAssistantMessage('assistant', data.ai_response, false, data.options);
        }
        
        // If ready to generate, show action button
        if (data.ready_to_generate && data.collected_data) {
            showGenerateButton(data.collected_data);
        } else {
            hideGenerateButton();
        }
        
        // Hide quick actions after first message
        const quickActions = document.getElementById('unifiedAssistantQuickActions');
        if (quickActions && unifiedChatHistory.length > 1) {
            quickActions.style.display = 'none';
        }
        
    } catch (error) {
        removeUnifiedAssistantMessage(loadingId);
        console.error('Unified Assistant Error:', error);
        addUnifiedAssistantMessage('error', `❌ Error: ${error.message}\n\nPlease check if the backend server is running.`);
    }
}

function addUnifiedAssistantMessage(role, content, isLoading = false, options = null) {
    const messagesDiv = document.getElementById('unifiedAssistantMessages');
    const messageId = `msg-${Date.now()}-${Math.random()}`;
    
    const messageDiv = document.createElement('div');
    messageDiv.id = messageId;
    messageDiv.className = `unified-assistant-message ${role} ${isLoading ? 'loading' : ''}`;
    
    if (role === 'user') {
        messageDiv.innerHTML = `
            <div class="message-content user">
                <p>${escapeHtml(content).replace(/\n/g, '<br>')}</p>
            </div>
            <div class="message-avatar user">
                <i class="fas fa-user"></i>
            </div>
        `;
    } else if (role === 'assistant') {
        if (isLoading) {
            messageDiv.innerHTML = `
                <div class="message-avatar">
                    <div class="typing-indicator">
                        <span></span><span></span><span></span>
                    </div>
                </div>
                <div class="message-content">
                    <p>Thinking...</p>
                </div>
            `;
        } else {
            let optionsHtml = '';
            if (options && options.items && options.items.length > 0) {
                optionsHtml = renderInteractiveOptions(options, messageId);
            }
            
            messageDiv.innerHTML = `
                <div class="message-avatar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" fill="#667eea"/>
                        <path d="M12 16v-4m0-4h.01" stroke="white" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
                <div class="message-content">
                    <p>${formatMessage(content)}</p>
                    ${optionsHtml}
                </div>
            `;
        }
    } else if (role === 'error') {
        messageDiv.innerHTML = `
            <div class="message-content error">
                <p>${escapeHtml(content).replace(/\n/g, '<br>')}</p>
            </div>
        `;
    }
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    unifiedChatHistory.push({ role, content, id: messageId });
    
    return messageId;
}

function renderInteractiveOptions(options, messageId) {
    const optionType = options.type;
    const items = options.items || [];
    
    if (items.length === 0) return '';
    
    let html = '<div class="interactive-options">';
    
    if (optionType === 'accounts') {
        html += '<div class="options-grid accounts-grid">';
        items.forEach(item => {
            const envBadge = item.environment === 'prod' ? '<span class="env-badge prod">PROD</span>' : 
                           item.environment === 'nonprod' ? '<span class="env-badge nonprod">NON-PROD</span>' : '';
            html += `
                <button class="option-card account-card" onclick="selectOption('account', '${item.id}', '${item.name}')">
                    <div class="option-card-header">
                        <i class="fas fa-building"></i>
                        <strong>${escapeHtml(item.name)}</strong>
                    </div>
                    <div class="option-card-body">
                        <small>${item.id}</small>
                        ${envBadge}
                    </div>
                </button>
            `;
        });
        html += '</div>';
    } else if (optionType === 'regions') {
        html += '<div class="options-grid regions-grid">';
        items.forEach(item => {
            html += `
                <button class="option-card region-card" onclick="selectOption('region', '${item.id}', '${item.name}')">
                    <div class="option-card-header">
                        <i class="fas fa-globe"></i>
                        <strong>${escapeHtml(item.name)}</strong>
                    </div>
                    <div class="option-card-body">
                        <small>${item.id}</small>
                    </div>
                </button>
            `;
        });
        html += '</div>';
    } else if (optionType === 'permission_sets') {
        html += '<div class="options-grid permission-sets-grid">';
        html += `<button class="option-card permission-set-card custom" onclick="selectOption('use_custom', 'custom', 'Create Custom Permissions')">
            <div class="option-card-header">
                <i class="fas fa-magic"></i>
                <strong>Create Custom Permissions</strong>
            </div>
            <div class="option-card-body">
                <small>Build custom policy with AI</small>
            </div>
        </button>`;
        items.forEach(item => {
            html += `
                <button class="option-card permission-set-card" onclick="selectOption('permission_set', '${item.id}', '${item.name}')">
                    <div class="option-card-header">
                        <i class="fas fa-shield-alt"></i>
                        <strong>${escapeHtml(item.name)}</strong>
                    </div>
                </button>
            `;
        });
        html += '</div>';
    } else if (optionType === 'services') {
        html += '<div class="options-grid services-grid">';
        items.forEach(item => {
            html += `
                <button class="option-card service-card" onclick="selectOption('service', '${item.id}', '${item.name}')">
                    <div class="option-card-header">
                        <i class="fab fa-aws"></i>
                        <strong>${escapeHtml(item.name)}</strong>
                    </div>
                    <div class="option-card-body">
                        <small>${item.description || ''}</small>
                    </div>
                </button>
            `;
        });
        html += '</div>';
    } else if (optionType === 'resources') {
        html += '<div class="options-grid resources-grid">';
        if (items.length === 0) {
            html += '<p style="color: var(--text-secondary); padding: 12px;">No resources found. Please specify the resource name or ID.</p>';
        } else {
            items.forEach(item => {
                html += `
                    <button class="option-card resource-card" onclick="selectOption('resource', '${item.id || item.arn}', '${item.name || item.id}', '${options.service || ''}')">
                        <div class="option-card-header">
                            <i class="fas fa-cube"></i>
                            <strong>${escapeHtml(item.name || item.id)}</strong>
                        </div>
                        <div class="option-card-body">
                            <small>${item.id || item.arn}</small>
                        </div>
                    </button>
                `;
            });
        }
        html += '</div>';
    }
    
    html += '</div>';
    return html;
}

// Make selectOption globally available
window.selectOption = async function(type, value, label, service = null) {
    // Add user message showing selection
    addUnifiedAssistantMessage('user', `Selected: ${label}`);
    
    // Show loading
    const loadingId = addUnifiedAssistantMessage('assistant', 'thinking', true);
    
    try {
        const requestBody = {
            conversation_id: unifiedConversationId,
            selected_option: {
                type: type,
                value: value,
                label: label
            },
            user_email: localStorage.getItem('userEmail') || 'user@example.com'
        };
        
        // Add service for resource selection
        if (type === 'resource' && service) {
            requestBody.selected_option.service = service;
        }
        
        // Special handling for "use_custom"
        if (type === 'use_custom') {
            requestBody.selected_option.type = 'use_custom_permissions';
            requestBody.user_message = 'I want to create custom permissions';
        }
        
        // If selecting a service, fetch resources
        if (type === 'service') {
            requestBody.selected_option.fetch_resources = true;
        }
        
        const response = await fetch('http://127.0.0.1:5000/api/unified-assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        removeUnifiedAssistantMessage(loadingId);
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed');
        }
        
        if (data.conversation_id) {
            unifiedConversationId = data.conversation_id;
        }
        
        if (data.state) {
            currentState = { ...currentState, ...data.state };
        }
        
        if (data.step && data.type === 'policy_building') {
            updateProgressIndicator(data.step);
            showProgressIndicator();
        }
        
        if (data.ai_response) {
            addUnifiedAssistantMessage('assistant', data.ai_response, false, data.options);
        }
        
        // If resources are being fetched, show loading message
        if (type === 'service' && data.options && data.options.type === 'resources') {
            addUnifiedAssistantMessage('assistant', 'Fetching available resources...', true);
            // Resources will be shown in next response
        }
        
        if (data.ready_to_generate && data.collected_data) {
            showGenerateButton(data.collected_data);
        }
        
    } catch (error) {
        removeUnifiedAssistantMessage(loadingId);
        console.error('Select option error:', error);
        addUnifiedAssistantMessage('error', `❌ Error: ${error.message}`);
    }
}

function removeUnifiedAssistantMessage(messageId) {
    const msg = document.getElementById(messageId);
    if (msg) msg.remove();
}

function formatMessage(content) {
    // Format markdown-like syntax
    let formatted = escapeHtml(content);
    
    // Bold **text**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Code `text`
    formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>');
    
    // Lists
    formatted = formatted.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateProgressIndicator(currentStep) {
    const steps = document.querySelectorAll('.progress-step');
    steps.forEach(step => {
        const stepName = step.getAttribute('data-step');
        step.classList.remove('active', 'completed');
        
        if (stepName === currentStep) {
            step.classList.add('active');
        } else {
            // Mark previous steps as completed
            const stepOrder = ['account', 'region', 'use_case', 'services', 'justification'];
            const currentIndex = stepOrder.indexOf(currentStep);
            const stepIndex = stepOrder.indexOf(stepName);
            
            if (stepIndex < currentIndex) {
                step.classList.add('completed');
            }
        }
    });
}

function showProgressIndicator() {
    const progress = document.getElementById('unifiedAssistantProgress');
    if (progress) progress.style.display = 'block';
}

function hideProgressIndicator() {
    const progress = document.getElementById('unifiedAssistantProgress');
    if (progress) progress.style.display = 'none';
}

function showGenerateButton(collectedData) {
    // Remove existing button if any
    const existing = document.getElementById('unifiedGenerateButton');
    if (existing) existing.remove();
    
    const messagesDiv = document.getElementById('unifiedAssistantMessages');
    const buttonDiv = document.createElement('div');
    buttonDiv.id = 'unifiedGenerateButton';
    buttonDiv.className = 'unified-generate-button-container';
    buttonDiv.innerHTML = `
        <div class="generate-button-content">
            <h4>✅ All Information Collected!</h4>
            <p>Ready to generate your access policy.</p>
            <button class="unified-generate-btn" onclick="generatePolicyFromConversation()">
                <i class="fas fa-magic"></i> Generate Policy
            </button>
        </div>
    `;
    messagesDiv.appendChild(buttonDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function hideGenerateButton() {
    const button = document.getElementById('unifiedGenerateButton');
    if (button) button.remove();
}

async function generatePolicyFromConversation() {
    if (!unifiedConversationId) {
        alert('No active conversation');
        return;
    }
    
    // Show loading
    addUnifiedAssistantMessage('assistant', 'Generating your access policy...', true);
    
    try {
        // First, get the collected data
        const response = await fetch('http://127.0.0.1:5000/api/unified-assistant/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversation_id: unifiedConversationId
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate');
        }
        
        if (data.ready && data.data) {
            // Now call the existing generate-permissions endpoint with collected data
            const permResponse = await fetch('http://127.0.0.1:5000/api/generate-permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    use_case: data.data.use_case,
                    account_id: data.data.account_id,
                    conversation_id: unifiedConversationId,
                    user_email: localStorage.getItem('userEmail') || 'user@example.com',
                    selected_resources: data.data.selected_resources,
                    region: data.data.region
                })
            });
            
            const permData = await permResponse.json();
            
            // Remove loading
            const messages = document.getElementById('unifiedAssistantMessages');
            const loadingMsg = messages.querySelector('.loading');
            if (loadingMsg) loadingMsg.remove();
            
            if (permData.error) {
                addUnifiedAssistantMessage('error', `❌ ${permData.error}`);
            } else if (permData.grouped_actions || permData.actions) {
                // Store permissions globally for form submission
                window.currentAIPermissions = permData;
                
                addUnifiedAssistantMessage('assistant', `✅ Policy generated successfully!\n\nI've created your access policy. You can now submit your request.`);
                
                // Show submit button
                showSubmitRequestButton(data.data);
            }
        }
        
    } catch (error) {
        console.error('Generate error:', error);
        addUnifiedAssistantMessage('error', `❌ Error: ${error.message}`);
    }
}

function showSubmitRequestButton(formData) {
    const messagesDiv = document.getElementById('unifiedAssistantMessages');
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'unified-submit-button-container';
    buttonDiv.innerHTML = `
        <div class="submit-button-content">
            <button class="unified-submit-btn" onclick="submitRequestFromConversation()">
                <i class="fas fa-paper-plane"></i> Submit Access Request
            </button>
        </div>
    `;
    messagesDiv.appendChild(buttonDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function submitRequestFromConversation() {
    // This will be integrated with the existing request submission
    // For now, redirect to requests page
    alert('✅ Policy ready! Redirecting to submit your request...');
    showPage('requests');
    toggleUnifiedAssistant();
}

function resetUnifiedAssistant() {
    if (confirm('Reset conversation? This will clear all collected information.')) {
        unifiedConversationId = null;
        unifiedChatHistory = [];
        currentState = {
            account_id: null,
            region: null,
            use_case: null,
            services: [],
            resources: {},
            justification: null,
            step: 'welcome'
        };
        
        const messagesDiv = document.getElementById('unifiedAssistantMessages');
        messagesDiv.innerHTML = `
            <div class="unified-assistant-message assistant welcome">
                <div class="message-avatar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" fill="#667eea"/>
                        <path d="M12 16v-4m0-4h.01" stroke="white" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
                <div class="message-content">
                    <p>Hi! I'm GovernAIX. I can help you with:</p>
                    <ul>
                        <li>📚 Navigating the system</li>
                        <li>🔐 Building access policies</li>
                        <li>❓ Answering questions</li>
                    </ul>
                    <p><strong>What would you like to do?</strong></p>
                </div>
            </div>
        `;
        
        hideProgressIndicator();
        hideGenerateButton();
        
        const quickActions = document.getElementById('unifiedAssistantQuickActions');
        if (quickActions) quickActions.style.display = 'flex';
    }
}

// AI Assistant initialization disabled - removed from all pages

