// Account Tagging Management
const ACCOUNT_TAGGING_API_BASE = (typeof API_BASE !== 'undefined' && API_BASE)
    ? API_BASE
    : (window.API_BASE || `${window.location.origin}/api`);

function escapeAccountTaggingHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function accountTaggingJsString(value) {
    return JSON.stringify(String(value == null ? '' : value));
}

async function loadAccountsForTagging() {
    const tbody = document.getElementById('accountsTaggingTable');
    if (!tbody) {
        console.error('accountsTaggingTable not found');
        return;
    }
    
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">Loading accounts...</td></tr>';
    
    try {
        const response = await fetch(`${ACCOUNT_TAGGING_API_BASE}/accounts`, { credentials: 'include' });
        const accounts = await response.json();
        console.log('Accounts loaded:', accounts);
        
        if (!accounts || Object.keys(accounts).length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">No accounts found</td></tr>';
            return;
        }
        
        const rows = Object.values(accounts).map(account => {
            const env = account.environment || 'nonprod';
            const badgeClass = env === 'prod' ? 'danger' : env === 'sandbox' ? 'warning' : 'success';
            return `<tr>
                <td><code>${escapeAccountTaggingHtml(account.id)}</code></td>
                <td>${escapeAccountTaggingHtml(account.name)}</td>
                <td>
                    <select id="env_${escapeAccountTaggingHtml(account.id)}" onchange="updateAccountEnvironment(${accountTaggingJsString(account.id)})" style="padding: 5px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-primary); color: var(--text-primary);">
                        <option value="nonprod" ${env === 'nonprod' ? 'selected' : ''}>Non-Production</option>
                        <option value="prod" ${env === 'prod' ? 'selected' : ''}>Production</option>
                        <option value="sandbox" ${env === 'sandbox' ? 'selected' : ''}>Sandbox</option>
                    </select>
                </td>
                <td><span class="badge badge-${badgeClass}">${escapeAccountTaggingHtml(env)}</span></td>
            </tr>`;
        }).join('');
        
        tbody.innerHTML = rows;
        console.log(`✅ Displayed ${Object.keys(accounts).length} accounts`);
        
    } catch (error) {
        console.error('Error:', error);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: red;">Error: ${escapeAccountTaggingHtml(error.message)}</td></tr>`;
    }
}

async function updateAccountEnvironment(accountId) {
    const select = document.getElementById(`env_${accountId}`);
    const environment = select.value;
    
    try {
        const response = await fetch(`${ACCOUNT_TAGGING_API_BASE}/admin/account/${encodeURIComponent(accountId)}/tag`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ environment })
        });
        
        const result = await response.json();
        console.log('Account tagged:', result);
        
        // Reload table to show updated badge
        loadAccountsForTagging();
        
    } catch (error) {
        console.error('Error tagging account:', error);
        alert('Failed to update account environment');
    }
}

async function syncAccountsFromOU() {
    if (!confirm('Sync accounts from AWS Organizations OU structure?\n\nThis will auto-tag accounts based on their OU names.')) {
        return;
    }
    
    try {
        const response = await fetch(`${ACCOUNT_TAGGING_API_BASE}/admin/sync-accounts-from-ou`, {
            method: 'POST',
            credentials: 'include'
        });
        
        const result = await response.json();
        alert(`✅ ${result.message}`);
        loadAccountsForTagging();
        
    } catch (error) {
        console.error('Error syncing accounts:', error);
        alert('Failed to sync accounts from OU');
    }
}
