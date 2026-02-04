// Global Help Assistant - Available on all pages
let helpConversationId = null;

function toggleHelpChat() {
    const popup = document.getElementById('helpChatPopup');
    const button = document.getElementById('helpChatButton');
    
    const isHidden = popup.style.display === 'none' || !popup.style.display || popup.style.display === '';
    
    if (isHidden) {
        popup.style.display = 'flex';
        button.style.display = 'none';
    } else {
        popup.style.display = 'none';
        button.style.display = 'flex';
    }
}

async function sendHelpMessage() {
    const input = document.getElementById('helpChatInput').value.trim();
    if (!input) return;
    
    addHelpChatMessage('user', input);
    document.getElementById('helpChatInput').value = '';
    
    const chatArea = document.getElementById('helpChatMessages');
    const thinkingMsg = document.createElement('div');
    thinkingMsg.className = 'chat-message assistant';
    thinkingMsg.id = 'helpThinkingMessage';
    thinkingMsg.innerHTML = `<strong>GovernAIX Assistant</strong>
        <div class="periscope-inline">
            <div class="ocean-surface"></div>
            <div class="periscope">
                <div class="scan-beam"></div>
            </div>
            <div class="bubble"></div>
            <div class="bubble"></div>
            <div class="bubble"></div>
        </div> Searching for answers...`;
    chatArea.appendChild(thinkingMsg);
    chatArea.scrollTop = chatArea.scrollHeight;
    
    try {
        const response = await fetch('http://127.0.0.1:5000/api/help-assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                conversation_id: helpConversationId,
                user_message: input
            })
        });
        
        const thinking = document.getElementById('helpThinkingMessage');
        if (thinking) thinking.remove();
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed');
        }
        
        if (data.conversation_id) {
            helpConversationId = data.conversation_id;
        }
        
        const aiMessage = data.ai_response || data.response || 'I can help you navigate GovernAIX!';
        addHelpChatMessage('assistant', aiMessage);
        
    } catch (error) {
        const thinking = document.getElementById('helpThinkingMessage');
        if (thinking) thinking.remove();
        
        console.error('Help Assistant Error:', error);
        addHelpChatMessage('error', '❌ Error connecting to help assistant. Please try again.');
    }
}

function addHelpChatMessage(role, message) {
    const chatArea = document.getElementById('helpChatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}`;
    
    if (role === 'user') {
        messageDiv.innerHTML = `<strong>You</strong>${message.replace(/\n/g, '<br>')}`;
    } else if (role === 'assistant') {
        messageDiv.innerHTML = `<strong>GovernAIX Assistant</strong>${message.replace(/\n/g, '<br>')}`;
    } else if (role === 'error') {
        messageDiv.style.background = '#ff5252';
        messageDiv.style.color = 'white';
        messageDiv.innerHTML = message.replace(/\n/g, '<br>');
    }
    
    chatArea.appendChild(messageDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function resetHelpChat() {
    helpConversationId = null;
    document.getElementById('helpChatMessages').innerHTML = '';
    document.getElementById('helpChatInput').value = '';
}
