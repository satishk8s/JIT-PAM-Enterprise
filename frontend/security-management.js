// Security Management Functions

function toggleIPWhitelist() {
    const enabled = document.getElementById('enableIPWhitelist').checked;
    const allowedIPsList = document.getElementById('allowedIPsList');
    allowedIPsList.style.display = enabled ? 'flex' : 'none';
}

function addBlockedIP() {
    const ip = prompt('Enter IP address or range to block:\nExamples: 192.168.1.100 or 10.0.0.0/8');
    if (!ip) return;
    
    const reason = prompt('Reason for blocking this IP:');
    if (!reason) return;
    
    const blockedIPsList = document.getElementById('blockedIPsList');
    const ipItem = document.createElement('div');
    ipItem.className = 'ip-item';
    ipItem.innerHTML = `
        <input type="text" value="${ip}" readonly style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
        <input type="text" value="${reason}" readonly style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
        <button class="btn-danger btn-sm" onclick="removeBlockedIP(this)"><i class="fas fa-trash"></i></button>
    `;
    blockedIPsList.appendChild(ipItem);
}

function removeBlockedIP(button) {
    if (confirm('Remove this blocked IP?')) {
        button.parentElement.remove();
    }
}

function addAllowedIP() {
    const ip = prompt('Enter IP address or range to allow:\nExamples: 10.0.0.0/8 or 172.16.0.0/12');
    if (!ip) return;
    
    const description = prompt('Description (e.g., Internal network, VPN):');
    if (!description) return;
    
    const allowedIPsList = document.getElementById('allowedIPsList');
    const ipItem = document.createElement('div');
    ipItem.className = 'ip-item';
    ipItem.innerHTML = `
        <input type="text" value="${ip}" readonly style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
        <input type="text" value="${description}" readonly style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
        <button class="btn-danger btn-sm" onclick="removeAllowedIP(this)"><i class="fas fa-trash"></i></button>
    `;
    allowedIPsList.appendChild(ipItem);
}

function removeAllowedIP(button) {
    if (confirm('Remove this allowed IP?')) {
        button.parentElement.remove();
    }
}

async function saveSecurityConfig() {
    const blockedIPs = [];
    document.querySelectorAll('#blockedIPsList .ip-item').forEach(item => {
        const inputs = item.querySelectorAll('input');
        blockedIPs.push({
            ip: inputs[0].value,
            reason: inputs[1].value
        });
    });
    
    const allowedIPs = [];
    const whitelistEnabled = document.getElementById('enableIPWhitelist').checked;
    
    if (whitelistEnabled) {
        document.querySelectorAll('#allowedIPsList .ip-item').forEach(item => {
            const inputs = item.querySelectorAll('input');
            allowedIPs.push({
                ip: inputs[0].value,
                description: inputs[1].value
            });
        });
    }
    
    try {
        const response = await fetch('/api/admin/security-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                blocked_ips: blockedIPs,
                whitelist_enabled: whitelistEnabled,
                allowed_ips: allowedIPs
            })
        });
        
        const data = await response.json();
        if (data.success) {
            alert('✅ Security configuration saved successfully!');
        } else {
            alert('❌ Failed to save security configuration');
        }
    } catch (error) {
        console.error('Error saving security config:', error);
        alert('❌ Error saving security configuration');
    }
}
