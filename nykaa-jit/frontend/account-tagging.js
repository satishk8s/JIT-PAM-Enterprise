// Account Tagging Management

async function loadAccountsForTagging() {
    const tbody = document.getElementById('accountsTaggingTable');
    if (!tbody) {
        console.error('accountsTaggingTable not found');
        return;
    }
    
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">Loading accounts...</td></tr>';
    
    try {
        const response = await fetch('http://127.0.0.1:5000/api/accounts');
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
                <td><code>${account.id}</code></td>
                <td>${account.name}</td>
                <td>
                    <select id="env_${account.id}" onchange="updateAccountEnvironment('${account.id}')" style="padding: 5px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-primary); color: var(--text-primary);">
                        <option value="nonprod" ${env === 'nonprod' ? 'selected' : ''}>Non-Production</option>
                        <option value="prod" ${env === 'prod' ? 'selected' : ''}>Production</option>
                        <option value="sandbox" ${env === 'sandbox' ? 'selected' : ''}>Sandbox</option>
                    </select>
                </td>
                <td><span class="badge badge-${badgeClass}">${env}</span></td>
            </tr>`;
        }).join('');
        
        tbody.innerHTML = rows;
        console.log(`✅ Displayed ${Object.keys(accounts).length} accounts`);
        
    } catch (error) {
        console.error('Error:', error);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: red;">Error: ${error.message}</td></tr>`;
    }
}

async function updateAccountEnvironment(accountId) {
    const select = document.getElementById(`env_${accountId}`);
    const environment = select.value;
    
    try {
        const response = await fetch(`http://127.0.0.1:5000/api/admin/account/${accountId}/tag`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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
        const response = await fetch('http://127.0.0.1:5000/api/admin/sync-accounts-from-ou', {
            method: 'POST'
        });
        
        const result = await response.json();
        alert(`✅ ${result.message}`);
        loadAccountsForTagging();
        
    } catch (error) {
        console.error('Error syncing accounts:', error);
        alert('Failed to sync accounts from OU');
    }
}
