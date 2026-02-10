/**
 * AI Configuration Management
 * Manage AWS Bedrock credentials and settings
 */

async function loadAIConfig() {
    try {
        const response = await fetch('http://localhost:5000/api/ai/config');
        const config = await response.json();
        
        document.getElementById('aiEnabled').checked = config.enabled;
        document.getElementById('awsRegion').value = config.aws_region || 'us-east-1';
        document.getElementById('modelId').value = config.model_id || 'anthropic.claude-3-sonnet-20240229-v1:0';
        document.getElementById('awsAccessKey').value = config.aws_access_key_id || '';
        document.getElementById('awsSecretKey').value = config.aws_secret_access_key || '';
        document.getElementById('maxTokens').value = config.max_tokens || 500;
        document.getElementById('temperature').value = config.temperature || 0.7;
        
        // Show current mode
        const modeResponse = await fetch('http://localhost:5000/api/ai/mode');
        const modeData = await modeResponse.json();
        document.getElementById('currentAIMode').textContent = modeData.description;
        document.getElementById('currentAIMode').className = modeData.mode === 'bedrock' ? 'badge badge-success' : 'badge badge-warning';
        
    } catch (error) {
        console.error('Error loading AI config:', error);
        alert('Failed to load AI configuration');
    }
}

async function saveAIConfig() {
    try {
        const config = {
            enabled: document.getElementById('aiEnabled').checked,
            aws_region: document.getElementById('awsRegion').value,
            model_id: document.getElementById('modelId').value,
            aws_access_key_id: document.getElementById('awsAccessKey').value,
            aws_secret_access_key: document.getElementById('awsSecretKey').value,
            max_tokens: parseInt(document.getElementById('maxTokens').value),
            temperature: parseFloat(document.getElementById('temperature').value)
        };
        
        const response = await fetch('http://localhost:5000/api/ai/config', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(config)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            alert('✅ AI configuration saved! Please restart Flask server to apply changes.');
            loadAIConfig(); // Reload to show updated mode
        } else {
            alert('❌ Failed to save configuration: ' + (result.error || 'Unknown error'));
        }
        
    } catch (error) {
        console.error('Error saving AI config:', error);
        alert('Failed to save AI configuration');
    }
}

function testBedrockConnection() {
    alert('🧪 Testing Bedrock connection...\n\nThis will be implemented to test AWS credentials and Bedrock access.');
}

// Load config when AI Config tab is shown
document.addEventListener('DOMContentLoaded', () => {
    // Add event listener for AI Config tab if it exists
    const aiConfigTab = document.getElementById('aiConfigTab');
    if (aiConfigTab) {
        aiConfigTab.addEventListener('click', loadAIConfig);
    }
});
