// Requests Chat - Handles requests page chat interface
let requestsChatConversationId = null;

function sendRequestsChatMessage() {
    const input = document.getElementById('requestsChatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Add user message
    addRequestsChatMessage('user', message);
    input.value = '';
    input.style.height = 'auto';
    
    // Show loading
    const loadingId = addRequestsChatMessage('assistant', 'thinking', true);
    
    // Hide quick actions after first message
    const quickActions = document.getElementById('requestsQuickActions');
    if (quickActions) quickActions.style.display = 'none';
    
    // Check if this is a request to view requests
    const messageLower = message.toLowerCase();
    if (messageLower.includes('show') && messageLower.includes('request')) {
        // Show requests list
        setTimeout(() => {
            removeRequestsChatMessage(loadingId);
            loadRequestsList();
            addRequestsChatMessage('assistant', 'Here are your requests. You can filter by status using the chips above.');
        }, 500);
        return;
    }
    
    // Otherwise, use unified assistant
    fetch('http://127.0.0.1:5000/api/unified-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            conversation_id: requestsChatConversationId,
            user_message: message,
            user_email: localStorage.getItem('userEmail') || 'user@example.com'
        })
    })
    .then(response => response.json())
    .then(data => {
        removeRequestsChatMessage(loadingId);
        
        if (data.conversation_id) {
            requestsChatConversationId = data.conversation_id;
        }
        
        if (data.ai_response) {
            addRequestsChatMessage('assistant', data.ai_response, false, data.options);
        }
        
        if (data.ready_to_generate && data.collected_data) {
            showGenerateButtonInRequests(data.collected_data);
        }
    })
    .catch(error => {
        removeRequestsChatMessage(loadingId);
        console.error('Requests chat error:', error);
        addRequestsChatMessage('error', `❌ Error: ${error.message}`);
    });
}

function sendQuickRequestsMessage(message) {
    const input = document.getElementById('requestsChatInput');
    if (input) {
        input.value = message;
        sendRequestsChatMessage();
    }
}

function addRequestsChatMessage(role, content, isLoading = false, options = null) {
    const messagesDiv = document.getElementById('requestsChatMessages');
    const messageId = `req-msg-${Date.now()}-${Math.random()}`;
    
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
    
    return messageId;
}

function removeRequestsChatMessage(messageId) {
    const msg = document.getElementById(messageId);
    if (msg) msg.remove();
}

function loadRequestsList() {
    const listContainer = document.getElementById('requestsListContainer');
    const chatContainer = document.querySelector('.requests-chat-container');
    
    if (listContainer && chatContainer) {
        listContainer.style.display = 'block';
        chatContainer.style.display = 'none';
        
        // Load requests
        if (typeof loadRequestsPage === 'function') {
            loadRequestsPage();
        }
    }
}

function resetRequestsChat() {
    requestsChatConversationId = null;
    const messagesDiv = document.getElementById('requestsChatMessages');
    if (messagesDiv) {
        messagesDiv.innerHTML = `
            <div class="unified-assistant-message assistant welcome">
                <div class="message-avatar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" fill="#667eea"/>
                        <path d="M12 16v-4m0-4h.01" stroke="white" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
                <div class="message-content">
                    <p><strong>Welcome to Access Requests!</strong></p>
                    <p>I can help you:</p>
                    <ul>
                        <li>🔐 Request new AWS access</li>
                        <li>📋 View your existing requests</li>
                        <li>❓ Answer questions about access</li>
                    </ul>
                    <p><strong>What would you like to do?</strong></p>
                </div>
            </div>
        `;
    }
    
    const quickActions = document.getElementById('requestsQuickActions');
    if (quickActions) quickActions.style.display = 'flex';
    
    const listContainer = document.getElementById('requestsListContainer');
    const chatContainer = document.querySelector('.requests-chat-container');
    if (listContainer) listContainer.style.display = 'none';
    if (chatContainer) chatContainer.style.display = 'block';
}

function showGenerateButtonInRequests(collectedData) {
    const messagesDiv = document.getElementById('requestsChatMessages');
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'unified-generate-button-container';
    buttonDiv.innerHTML = `
        <div class="generate-button-content">
            <h4>✅ All Information Collected!</h4>
            <p>Ready to generate your access policy.</p>
            <button class="unified-generate-btn" onclick="generatePolicyFromRequestsChat()">
                <i class="fas fa-magic"></i> Generate Policy
            </button>
        </div>
    `;
    messagesDiv.appendChild(buttonDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function generatePolicyFromRequestsChat() {
    if (!requestsChatConversationId) {
        alert('No active conversation');
        return;
    }
    
    addRequestsChatMessage('assistant', 'Generating your access policy...', true);
    
    try {
        const response = await fetch('http://127.0.0.1:5000/api/unified-assistant/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversation_id: requestsChatConversationId
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate');
        }
        
        if (data.ready && data.data) {
            const permResponse = await fetch('http://127.0.0.1:5000/api/generate-permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    use_case: data.data.use_case,
                    account_id: data.data.account_id,
                    conversation_id: requestsChatConversationId,
                    user_email: localStorage.getItem('userEmail') || 'user@example.com',
                    selected_resources: data.data.selected_resources,
                    region: data.data.region
                })
            });
            
            const permData = await permResponse.json();
            
            const loadingMsgs = document.querySelectorAll('#requestsChatMessages .loading');
            loadingMsgs.forEach(msg => msg.remove());
            
            if (permData.error) {
                addRequestsChatMessage('error', `❌ ${permData.error}`);
            } else if (permData.grouped_actions || permData.actions) {
                window.currentAIPermissions = permData;
                addRequestsChatMessage('assistant', `✅ Policy generated successfully!\n\nYou can now submit your request.`);
                showSubmitButtonInRequests(data.data);
            }
        }
    } catch (error) {
        console.error('Generate error:', error);
        addRequestsChatMessage('error', `❌ Error: ${error.message}`);
    }
}

function showSubmitButtonInRequests(formData) {
    const messagesDiv = document.getElementById('requestsChatMessages');
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'unified-submit-button-container';
    buttonDiv.innerHTML = `
        <div class="submit-button-content">
            <button class="unified-submit-btn" onclick="submitRequestFromRequestsChat()">
                <i class="fas fa-paper-plane"></i> Submit Access Request
            </button>
        </div>
    `;
    messagesDiv.appendChild(buttonDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function submitRequestFromRequestsChat() {
    // Get collected data and submit
    if (!window.currentAIPermissions) {
        alert('No policy generated yet');
        return;
    }
    
    // Use existing request submission logic
    if (typeof handleNewRequest === 'function') {
        // Create a synthetic form submission
        const formData = {
            use_case: window.currentAIPermissions.description || 'AI-generated access request',
            ai_generated: true,
            is_jit: true,
            ai_permissions: window.currentAIPermissions
        };
        
        // Submit via existing endpoint
        try {
            const response = await fetch('http://127.0.0.1:5000/api/request-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (result.error) {
                addRequestsChatMessage('error', `❌ ${result.error}`);
            } else {
                addRequestsChatMessage('assistant', `✅ Request submitted successfully!\n\nRequest ID: ${result.request_id}\n\nYour request is now pending approval.`);
                resetRequestsChat();
            }
        } catch (error) {
            console.error('Submit error:', error);
            addRequestsChatMessage('error', `❌ Error: ${error.message}`);
        }
    }
}

// Auto-resize textarea
document.addEventListener('DOMContentLoaded', function() {
    const input = document.getElementById('requestsChatInput');
    if (input) {
        input.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
    }
});



