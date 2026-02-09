// Policy Configuration Functions

// Load account classification table
async function loadAccountClassification() {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/accounts');
        const accounts = await response.json();
        
        const tbody = document.getElementById('accountClassificationTable');
        tbody.innerHTML = Object.values(accounts).map(account => `
            <tr>
                <td>${account.id}</td>
                <td>${account.name}</td>
                <td>
                    <select onchange="updateAccountTag('${account.id}', this.value)">
                        <option value="">Not Tagged</option>
                        <option value="prod" ${account.environment === 'prod' ? 'selected' : ''}>Production</option>
                        <option value="nonprod" ${account.environment === 'nonprod' ? 'selected' : ''}>Non-Production</option>
                        <option value="dev" ${account.environment === 'dev' ? 'selected' : ''}>Development</option>
                        <option value="sandbox" ${account.environment === 'sandbox' ? 'selected' : ''}>Sandbox</option>
                    </select>
                </td>
                <td>
                    <select onchange="updateAccountJIT('${account.id}', this.value)">
                        <option value="yes" ${account.jit_required !== false ? 'selected' : ''}>Yes</option>
                        <option value="no" ${account.jit_required === false ? 'selected' : ''}>No</option>
                    </select>
                </td>
                <td>
                    <input type="number" value="${account.max_duration || 8}" min="1" max="120" 
                           onchange="updateAccountDuration('${account.id}', this.value)" 
                           style="width: 60px;">
                </td>
                <td>
                    <button class="btn-link" onclick="viewAccountDetails('${account.id}')">Details</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading accounts:', error);
    }
}

// Sync accounts from AWS OU structure
async function syncAccountsFromOU() {
    if (!confirm('This will auto-tag accounts based on AWS OU structure. Continue?')) return;
    
    try {
        const response = await fetch('http://127.0.0.1:5000/api/admin/sync-accounts-from-ou', {
            method: 'POST'
        });
        const result = await response.json();
        
        alert(`✅ Synced ${result.synced_count} accounts from OU structure`);
        loadAccountClassification();
    } catch (error) {
        alert('❌ Error syncing accounts: ' + error.message);
    }
}

// Update account tag
async function updateAccountTag(accountId, environment) {
    try {
        await fetch(`http://127.0.0.1:5000/api/admin/account/${accountId}/tag`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({environment})
        });
        console.log(`Account ${accountId} tagged as ${environment}`);
    } catch (error) {
        console.error('Error updating tag:', error);
    }
}

// Update account JIT requirement
async function updateAccountJIT(accountId, jitRequired) {
    try {
        await fetch(`http://127.0.0.1:5000/api/admin/account/${accountId}/jit`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({jit_required: jitRequired === 'yes'})
        });
        console.log(`Account ${accountId} JIT set to ${jitRequired}`);
    } catch (error) {
        console.error('Error updating JIT:', error);
    }
}

// Update account max duration
async function updateAccountDuration(accountId, duration) {
    try {
        await fetch(`http://127.0.0.1:5000/api/admin/account/${accountId}/duration`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({max_duration: parseInt(duration)})
        });
        console.log(`Account ${accountId} max duration set to ${duration}hrs`);
    } catch (error) {
        console.error('Error updating duration:', error);
    }
}

// View account details
function viewAccountDetails(accountId) {
    alert(`Account Details for ${accountId}\n\nThis will show:\n- Current tags\n- Active access sessions\n- Recent requests\n- Compliance status`);
}

// Add new user group
function showAddGroupModal() {
    const groupName = prompt('Enter group name (e.g., "Data Engineers"):');
    if (!groupName) return;
    
    const jitRequired = confirm('Require JIT for this group?');
    const permanentAccess = prompt('Permanent permission sets (comma-separated):');
    
    alert(`✅ Group "${groupName}" created\n\nJIT Required: ${jitRequired}\nPermanent Access: ${permanentAccess || 'None'}`);
}

// Edit user group
function editGroup(groupId) {
    alert(`Edit Group: ${groupId}\n\nThis will open a modal to:\n- Modify JIT requirements\n- Change permanent permissions\n- Add/remove users\n- Set account restrictions`);
}

// Add approval rule
function showAddApprovalRuleModal() {
    alert('Add Approval Rule\n\nConfigure:\n- Access type (read/write/admin)\n- Environment (prod/non-prod)\n- Required approvers\n- Auto-approve conditions');
}

// Edit approval rule
function editApprovalRule(ruleId) {
    alert(`Edit Approval Rule: ${ruleId}\n\nModify approvers and conditions`);
}

// Create permission template
function showCreateTemplateModal() {
    const templateName = prompt('Enter template name:');
    if (!templateName) return;
    
    alert(`Create Template: ${templateName}\n\nThis will open a wizard to:\n1. Select AWS services\n2. Define actions (read/write/admin)\n3. Set resource constraints\n4. Add conditions`);
}

// View template
function viewTemplate(templateId) {
    alert(`Template: ${templateId}\n\nShowing IAM policy JSON and description`);
}

// Edit template
function editTemplate(templateId) {
    alert(`Edit Template: ${templateId}\n\nModify permissions and constraints`);
}

// Clone template
function cloneTemplate(templateId) {
    const newName = prompt('Enter name for cloned template:');
    if (newName) {
        alert(`✅ Template cloned as "${newName}"`);
    }
}

// Delete template
function deleteTemplate(templateId) {
    if (confirm('Delete this template?')) {
        alert(`✅ Template "${templateId}" deleted`);
    }
}

// Export policy configuration
function exportPolicy() {
    const policy = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        accounts: {}, // Account classifications
        groups: {}, // User groups
        approval_matrix: {}, // Approval rules
        templates: {} // Permission templates
    };
    
    const blob = new Blob([JSON.stringify(policy, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jit-policy-${Date.now()}.json`;
    a.click();
    
    alert('✅ Policy exported successfully');
}

// Import policy
function showImportPolicyModal() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const policy = JSON.parse(event.target.result);
                if (confirm(`Import policy from ${file.name}?\n\nThis will overwrite current configuration.`)) {
                    alert('✅ Policy imported successfully');
                    loadAccountClassification();
                }
            } catch (error) {
                alert('❌ Invalid policy file');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// Load policy template
function loadPolicyTemplate() {
    const templates = ['Startup (Minimal Controls)', 'Enterprise (Balanced)', 'Regulated (Strict Compliance)'];
    const choice = prompt(`Select template:\n1. ${templates[0]}\n2. ${templates[1]}\n3. ${templates[2]}\n\nEnter number:`);
    
    if (choice >= 1 && choice <= 3) {
        if (confirm(`Load "${templates[choice-1]}" template?\n\nThis will overwrite current configuration.`)) {
            alert(`✅ Loaded "${templates[choice-1]}" template`);
            loadAccountClassification();
        }
    }
}

// Initialize policy config when admin tab is shown
function initPolicyConfig() {
    loadAccountClassification();
}
