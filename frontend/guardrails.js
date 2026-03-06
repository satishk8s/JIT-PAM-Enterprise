// Guardrails Management Functions

let guardrailConversationId = null;
let dbWriteGuardrailRules = [];
let dbWriteSelectedUsers = [];
let dbWriteSelectedGroups = [];
let guardrailsInitialized = false;

function getGuardrailsApiBase() {
    if (typeof API_BASE !== 'undefined' && API_BASE) return API_BASE;
    if (window.API_BASE) return window.API_BASE;
    const port = (window.location.port || '').toString();
    if (port === '5000') {
        return window.location.protocol + '//' + window.location.hostname + ':5000/api';
    }
    return window.location.origin + '/api';
}

function escHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function normalizeGroupKey(group) {
    const gid = String((group && group.id) || (group && group.group_id) || '').trim().toLowerCase();
    const name = String((group && group.name) || (group && group.display_name) || '').trim().toLowerCase();
    return gid || name;
}

function createRestrictionItem(html) {
    const item = document.createElement('div');
    item.className = 'restriction-item';
    item.style.cssText = 'display: flex; gap: 10px; align-items: center; padding: 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px;';
    item.innerHTML = html;
    return item;
}

function addServiceRestriction(rule) {
    const list = document.getElementById('serviceRestrictionsList');
    if (!list) return;
    const r = rule || {};
    const item = createRestrictionItem(`
        <select style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
            <option value="kms">KMS (Key Management Service)</option>
            <option value="secretsmanager">Secrets Manager</option>
            <option value="iam">IAM (Identity & Access Management)</option>
            <option value="organizations">AWS Organizations</option>
            <option value="billing">Billing & Cost Management</option>
        </select>
        <select style="flex: 0 0 150px; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
            <option value="block">Block All Access</option>
            <option value="read_only">Read-Only</option>
            <option value="approval">Require Approval</option>
        </select>
        <input type="text" placeholder="Reason" value="${escHtml(r.reason || '')}" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
        <button class="btn-danger btn-sm" onclick="removeRestriction(this)"><i class="fas fa-trash"></i></button>
    `);
    const selects = item.querySelectorAll('select');
    if (r.service) selects[0].value = r.service;
    if (r.action) selects[1].value = r.action;
    list.appendChild(item);
}

function addDeleteRestriction(rule) {
    const list = document.getElementById('deleteRestrictionsList');
    if (!list) return;
    const r = rule || {};
    const item = createRestrictionItem(`
        <select style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
            <option value="kms">KMS Keys</option>
            <option value="s3">S3 Buckets</option>
            <option value="rds">RDS Databases</option>
            <option value="dynamodb">DynamoDB Tables</option>
            <option value="ec2">EC2 Instances</option>
            <option value="lambda">Lambda Functions</option>
        </select>
        <select style="flex: 0 0 150px; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
            <option value="all">All Environments</option>
            <option value="prod">Production Only</option>
            <option value="nonprod">Non-Prod Only</option>
        </select>
        <input type="text" placeholder="Reason" value="${escHtml(r.reason || '')}" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
        <button class="btn-danger btn-sm" onclick="removeRestriction(this)"><i class="fas fa-trash"></i></button>
    `);
    const selects = item.querySelectorAll('select');
    if (r.service) selects[0].value = r.service;
    if (r.environment) selects[1].value = r.environment;
    list.appendChild(item);
}

function addCreateRestriction(rule) {
    const list = document.getElementById('createRestrictionsList');
    if (!list) return;
    const r = rule || {};
    const item = createRestrictionItem(`
        <select style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
            <option value="ec2">EC2 Instances</option>
            <option value="rds">RDS Databases</option>
            <option value="s3">S3 Buckets</option>
            <option value="vpc">VPC Resources</option>
            <option value="iam">IAM Users/Roles</option>
            <option value="kms">KMS Keys</option>
        </select>
        <select style="flex: 0 0 150px; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
            <option value="all">All Environments</option>
            <option value="prod">Production Only</option>
            <option value="nonprod">Non-Prod Only</option>
        </select>
        <input type="text" placeholder="Reason" value="${escHtml(r.reason || '')}" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
        <button class="btn-danger btn-sm" onclick="removeRestriction(this)"><i class="fas fa-trash"></i></button>
    `);
    const selects = item.querySelectorAll('select');
    if (r.service) selects[0].value = r.service;
    if (r.environment) selects[1].value = r.environment;
    list.appendChild(item);
}

function addCustomGuardrail(rule) {
    const list = document.getElementById('customGuardrailsList');
    if (!list) return;
    const r = rule || {};
    const item = createRestrictionItem(`
        <input type="text" placeholder="Rule Name" value="${escHtml(r.name || '')}" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
        <select style="flex: 0 0 120px; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
            <option value="tag">Tag-based</option>
            <option value="name">Name pattern</option>
            <option value="arn">ARN pattern</option>
        </select>
        <input type="text" placeholder="Condition" value="${escHtml(r.condition || '')}" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
        <button class="btn-danger btn-sm" onclick="removeRestriction(this)"><i class="fas fa-trash"></i></button>
    `);
    const select = item.querySelector('select');
    if (r.type) select.value = r.type;
    list.appendChild(item);
}

function removeRestriction(button) {
    const row = button && button.closest ? button.closest('.restriction-item') : null;
    if (row) row.remove();
}

function clearRestrictionList(listId) {
    const list = document.getElementById(listId);
    if (list) list.innerHTML = '';
}

function applyGeneratedGuardrails(guardrails) {
    if (!guardrails || typeof guardrails !== 'object') return;

    clearRestrictionList('serviceRestrictionsList');
    clearRestrictionList('deleteRestrictionsList');
    clearRestrictionList('createRestrictionsList');
    clearRestrictionList('customGuardrailsList');

    (guardrails.serviceRestrictions || []).forEach(addServiceRestriction);
    (guardrails.deleteRestrictions || []).forEach(addDeleteRestriction);
    (guardrails.createRestrictions || []).forEach(addCreateRestriction);
    (guardrails.customGuardrails || []).forEach(addCustomGuardrail);

    if (!(guardrails.serviceRestrictions || []).length) addServiceRestriction({ reason: 'Sensitive encryption keys' });
    if (!(guardrails.deleteRestrictions || []).length) addDeleteRestriction({ reason: 'Prevent accidental deletion' });
    if (!(guardrails.createRestrictions || []).length) addCreateRestriction({ reason: 'Route to DevOps team' });
    if (!(guardrails.customGuardrails || []).length) addCustomGuardrail({ name: 'Block prod-* tagged resources', condition: 'Environment=production' });
}

function getServiceDisplayName(service) {
    const map = {
        kms: 'KMS (Key Management Service)',
        secretsmanager: 'Secrets Manager',
        iam: 'IAM (Identity & Access Management)',
        organizations: 'AWS Organizations',
        identitystore: 'Identity Store',
        sso: 'AWS SSO',
        s3: 'S3 Buckets',
        rds: 'RDS Databases',
        ec2: 'EC2 Instances',
        lambda: 'Lambda Functions',
        dynamodb: 'DynamoDB Tables'
    };
    return map[service] || String(service || '').toUpperCase();
}

function getActionDisplayName(action) {
    const map = {
        block: 'Block All Access',
        read_only: 'Read-Only',
        approval: 'Require Approval'
    };
    return map[action] || action;
}

function getEnvDisplayName(env) {
    const map = {
        all: 'All Environments',
        prod: 'Production Only',
        nonprod: 'Non-Prod Only'
    };
    return map[env] || env;
}

function collectGuardrails() {
    const serviceRestrictions = [];
    document.querySelectorAll('#serviceRestrictionsList .restriction-item').forEach((item) => {
        const selects = item.querySelectorAll('select');
        const input = item.querySelector('input');
        if (!selects.length || !input) return;
        serviceRestrictions.push({
            service: selects[0].value,
            action: selects[1] ? selects[1].value : 'block',
            reason: input.value || ''
        });
    });

    const deleteRestrictions = [];
    document.querySelectorAll('#deleteRestrictionsList .restriction-item').forEach((item) => {
        const selects = item.querySelectorAll('select');
        const input = item.querySelector('input');
        if (!selects.length || !input) return;
        deleteRestrictions.push({
            service: selects[0].value,
            environment: selects[1] ? selects[1].value : 'all',
            reason: input.value || ''
        });
    });

    const createRestrictions = [];
    document.querySelectorAll('#createRestrictionsList .restriction-item').forEach((item) => {
        const selects = item.querySelectorAll('select');
        const input = item.querySelector('input');
        if (!selects.length || !input) return;
        createRestrictions.push({
            service: selects[0].value,
            environment: selects[1] ? selects[1].value : 'all',
            reason: input.value || ''
        });
    });

    const customGuardrails = [];
    document.querySelectorAll('#customGuardrailsList .restriction-item').forEach((item) => {
        const inputs = item.querySelectorAll('input');
        const select = item.querySelector('select');
        if (inputs.length < 2 || !select) return;
        customGuardrails.push({
            name: inputs[0].value || '',
            type: select.value,
            condition: inputs[1].value || ''
        });
    });

    const databaseWriteControls = (dbWriteGuardrailRules || []).map((rule) => ({
        enabled: !!rule.enabled,
        block_write_actions: !!rule.block_write_actions,
        account_id: String(rule.account_id || '').trim(),
        db_instance_id: String(rule.db_instance_id || '').trim(),
        reason: String(rule.reason || '').trim(),
        allowed_users: (rule.allowed_users || []).map((u) => ({
            email: normalizeEmail(u.email || u.value || '')
        })).filter((u) => u.email),
        allowed_groups: (rule.allowed_groups || []).map((g) => ({
            id: String(g.id || g.group_id || '').trim(),
            name: String(g.name || g.display_name || '').trim(),
            source: String(g.source || 'identity_center').trim() || 'identity_center'
        })).filter((g) => g.id || g.name)
    }));

    return {
        serviceRestrictions,
        deleteRestrictions,
        createRestrictions,
        customGuardrails,
        databaseWriteControls
    };
}

function previewGuardrails() {
    const guardrails = collectGuardrails();
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 20px; max-width: 640px; width: 92%; max-height: 80vh; overflow: auto;">
            <h3 style="margin: 0 0 15px 0; color: var(--text-primary);"><i class="fas fa-eye"></i> Guardrails Impact Preview</h3>
            <div style="background: var(--bg-secondary); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <p style="margin: 0 0 10px 0; color: var(--text-primary);"><strong>Service Restrictions:</strong> ${guardrails.serviceRestrictions.length} rules</p>
                <p style="margin: 0 0 10px 0; color: var(--text-primary);"><strong>Delete Restrictions:</strong> ${guardrails.deleteRestrictions.length} rules</p>
                <p style="margin: 0 0 10px 0; color: var(--text-primary);"><strong>Create Restrictions:</strong> ${guardrails.createRestrictions.length} rules</p>
                <p style="margin: 0 0 10px 0; color: var(--text-primary);"><strong>Custom Guardrails:</strong> ${guardrails.customGuardrails.length} rules</p>
                <p style="margin: 0; color: var(--text-primary);"><strong>DB Write Controls:</strong> ${guardrails.databaseWriteControls.length} rules</p>
            </div>
            <div style="background: #e3f2fd; border: 1px solid #2196F3; border-radius: 8px; padding: 12px; font-size: 13px; color: #0f172a;">
                <strong>Estimated Impact:</strong> These guardrails will affect all future access requests.
            </div>
            <button onclick="this.closest('div[style*=fixed]').remove()" class="btn-primary" style="margin-top: 15px; width: 100%; padding: 10px;">Close</button>
        </div>
    `;
    document.body.appendChild(modal);
}

async function saveGuardrails() {
    const guardrails = collectGuardrails();
    if (!confirm('Save Guardrails?\n\nThese rules will be applied to all future access requests. Continue?')) return;

    try {
        const response = await fetch(getGuardrailsApiBase() + '/admin/save-guardrails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(guardrails)
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error((data && data.error) || 'Failed to save guardrails');
        }
        alert('Guardrails saved successfully.');
        await loadGuardrails();
    } catch (error) {
        alert('Failed to save guardrails: ' + (error.message || error));
    }
}

async function loadGuardrails() {
    try {
        const response = await fetch(getGuardrailsApiBase() + '/admin/guardrails', {
            credentials: 'include'
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error((data && data.error) || 'Failed to load guardrails');
        }

        applyGeneratedGuardrails(data || {});
        hydrateDatabaseWriteRules(data.databaseWriteControls || []);
    } catch (error) {
        console.error('Failed to load guardrails:', error);
    }
}

async function generateAIGuardrail() {
    const inputEl = document.getElementById('aiGuardrailInput');
    const input = inputEl ? inputEl.value.trim() : '';
    if (!input) return;

    const popup = document.getElementById('aiChatPopup');
    if (popup && (popup.style.display === 'none' || !popup.style.display)) {
        toggleAIChat();
    }

    addGuardrailChatMessage('user', input);
    if (inputEl) inputEl.value = '';

    const chatArea = document.getElementById('aiGuardrailChat');
    if (!chatArea) return;

    const thinkingMsg = document.createElement('div');
    thinkingMsg.className = 'chat-message assistant';
    thinkingMsg.id = 'thinkingMessage';
    thinkingMsg.innerHTML = '<strong>NPAMX</strong> Analyzing your request...';
    chatArea.appendChild(thinkingMsg);
    chatArea.scrollTop = chatArea.scrollHeight;

    try {
        const response = await fetch(getGuardrailsApiBase() + '/admin/generate-guardrails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                conversation_id: guardrailConversationId,
                user_message: input
            })
        });

        const thinking = document.getElementById('thinkingMessage');
        if (thinking) thinking.remove();

        const data = await response.json();
        if (!response.ok) throw new Error((data && data.error) || 'Failed');

        if (data.conversation_id) {
            guardrailConversationId = data.conversation_id;
        }

        const aiMessage = data.ai_response || data.question || data.understanding || 'No response';
        addGuardrailChatMessage('assistant', aiMessage);

        const needsConfirm = data.ai_response && (
            data.ai_response.toLowerCase().includes('to confirm') ||
            data.ai_response.toLowerCase().includes('is this correct') ||
            data.ai_response.toLowerCase().includes('do you want')
        );

        if (needsConfirm || data.status === 'needs_confirmation') {
            showGuardrailApprovalButton();
        } else if (data.status === 'ready') {
            addGuardrailChatMessage('assistant', 'Guardrail created successfully.');
            await loadGuardrails();
            setTimeout(() => resetGuardrailChat(), 1000);
        }
    } catch (error) {
        const thinking = document.getElementById('thinkingMessage');
        if (thinking) thinking.remove();
        addGuardrailChatMessage('error', 'Error: ' + (error.message || error));
    }
}

function addGuardrailChatMessage(role, message) {
    const chatArea = document.getElementById('aiGuardrailChat');
    if (!chatArea) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message ' + role;

    if (role === 'user') {
        messageDiv.innerHTML = '<strong>You</strong> ' + escHtml(String(message || '')).replace(/\n/g, '<br>');
    } else if (role === 'assistant') {
        messageDiv.innerHTML = '<strong>NPAMX</strong> ' + escHtml(String(message || '')).replace(/\n/g, '<br>');
    } else {
        messageDiv.style.background = '#ff5252';
        messageDiv.style.color = 'white';
        messageDiv.innerHTML = escHtml(String(message || '')).replace(/\n/g, '<br>');
    }

    chatArea.appendChild(messageDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function showGuardrailApprovalButton() {
    const existing = document.getElementById('guardrailApprovalButtons');
    if (existing) existing.remove();

    const chatArea = document.getElementById('aiGuardrailChat');
    if (!chatArea) return;

    const approveDiv = document.createElement('div');
    approveDiv.id = 'guardrailApprovalButtons';
    approveDiv.style.cssText = 'margin-top: 15px; display: flex; gap: 10px; justify-content: center;';
    approveDiv.innerHTML = `
        <button onclick="approveGuardrail()" class="btn-primary btn-pam" style="padding: 10px 16px;">Approve & Create</button>
        <button onclick="resetGuardrailChat()" class="btn-secondary btn-pam" style="padding: 10px 16px;">Cancel</button>
    `;
    chatArea.appendChild(approveDiv);
}

async function approveGuardrail() {
    const mfaToken = prompt('MFA verification required. Enter your 6-digit MFA code:');
    if (!mfaToken || mfaToken.length !== 6) {
        alert('Invalid MFA token');
        return;
    }

    const approvalDiv = document.getElementById('guardrailApprovalButtons');
    if (approvalDiv) approvalDiv.remove();

    addGuardrailChatMessage('assistant', 'Creating guardrail...');

    try {
        const response = await fetch(getGuardrailsApiBase() + '/admin/generate-guardrails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                conversation_id: guardrailConversationId,
                user_message: 'yes, create it',
                mfa_token: mfaToken
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error((data && data.error) || 'Failed');

        if (data.status === 'ready') {
            addGuardrailChatMessage('assistant', 'Guardrail created successfully.');
            await loadGuardrails();
            setTimeout(() => resetGuardrailChat(), 1000);
        } else {
            addGuardrailChatMessage('assistant', data.ai_response || 'Awaiting confirmation');
            if (data.status === 'needs_confirmation') {
                showGuardrailApprovalButton();
            }
        }
    } catch (error) {
        addGuardrailChatMessage('error', 'Error: ' + (error.message || error));
    }
}

function resetGuardrailChat() {
    guardrailConversationId = null;
    const chat = document.getElementById('aiGuardrailChat');
    if (chat) chat.innerHTML = '';
    const input = document.getElementById('aiGuardrailInput');
    if (input) input.value = '';
}

// Database write guardrail UI
function hydrateDatabaseWriteRules(rules) {
    dbWriteGuardrailRules = Array.isArray(rules)
        ? rules.map((rule) => ({
            enabled: !!rule.enabled,
            block_write_actions: !!(rule.block_write_actions ?? rule.blockWriteActions),
            account_id: String(rule.account_id || rule.accountId || '').trim(),
            db_instance_id: String(rule.db_instance_id || rule.dbInstanceId || '').trim(),
            reason: String(rule.reason || '').trim(),
            allowed_users: Array.isArray(rule.allowed_users || rule.allowedUsers)
                ? (rule.allowed_users || rule.allowedUsers).map((u) => ({
                    email: normalizeEmail((u && (u.email || u.value)) || u)
                })).filter((u) => u.email)
                : [],
            allowed_groups: Array.isArray(rule.allowed_groups || rule.allowedGroups)
                ? (rule.allowed_groups || rule.allowedGroups).map((g) => ({
                    id: String((g && (g.id || g.group_id)) || g || '').trim(),
                    name: String((g && (g.name || g.display_name)) || '').trim(),
                    source: String((g && g.source) || 'identity_center').trim() || 'identity_center'
                })).filter((g) => g.id || g.name)
                : []
        }))
        : [];

    renderDatabaseWriteGuardrailRules();
    dbWriteSelectedUsers = [];
    dbWriteSelectedGroups = [];
    renderDbWriteSelectedUsers();
    renderDbWriteSelectedGroups();
}

function renderDatabaseWriteGuardrailRules() {
    const list = document.getElementById('dbWriteGuardrailRulesList');
    const emptyEl = document.getElementById('dbWriteGuardrailRulesEmpty');
    if (!list || !emptyEl) return;

    if (!dbWriteGuardrailRules.length) {
        list.innerHTML = '';
        emptyEl.style.display = 'block';
        return;
    }

    emptyEl.style.display = 'none';
    list.innerHTML = dbWriteGuardrailRules.map((rule, idx) => {
        const users = (rule.allowed_users || []).map((u) => u.email).filter(Boolean);
        const groups = (rule.allowed_groups || []).map((g) => g.name || g.id).filter(Boolean);
        return `
            <div class="guardrail-db-rule">
                <div>
                    <div class="guardrail-db-rule-title">${escHtml(rule.account_id || 'Any Account')} / ${escHtml(rule.db_instance_id || 'Any DB')}</div>
                    <div class="guardrail-db-rule-meta">${rule.enabled ? 'Enabled' : 'Disabled'} · ${rule.block_write_actions ? 'Write blocked' : 'Write allowed'}</div>
                    <div class="guardrail-db-rule-meta">Allowed users: ${users.length ? escHtml(users.join(', ')) : 'None'}</div>
                    <div class="guardrail-db-rule-meta">Allowed groups: ${groups.length ? escHtml(groups.join(', ')) : 'None'}</div>
                    ${rule.reason ? `<div class="guardrail-db-rule-meta">Reason: ${escHtml(rule.reason)}</div>` : ''}
                </div>
                <button class="btn-danger btn-sm" onclick="removeDatabaseWriteGuardrailRule(${idx})"><i class="fas fa-trash"></i></button>
            </div>
        `;
    }).join('');
}

function removeDatabaseWriteGuardrailRule(index) {
    if (index < 0 || index >= dbWriteGuardrailRules.length) return;
    dbWriteGuardrailRules.splice(index, 1);
    renderDatabaseWriteGuardrailRules();
}

function renderDbWriteSelectedUsers() {
    const container = document.getElementById('dbWriteAllowedUsers');
    if (!container) return;
    container.innerHTML = dbWriteSelectedUsers.map((u, idx) => `
        <span class="guardrail-chip">
            ${escHtml(u.email)}
            <button type="button" onclick="removeDbWriteSelectedUser(${idx})">&times;</button>
        </span>
    `).join('');
}

function renderDbWriteSelectedGroups() {
    const container = document.getElementById('dbWriteAllowedGroups');
    if (!container) return;
    container.innerHTML = dbWriteSelectedGroups.map((g, idx) => `
        <span class="guardrail-chip">
            ${escHtml(g.name || g.id)}
            <button type="button" onclick="removeDbWriteSelectedGroup(${idx})">&times;</button>
        </span>
    `).join('');
}

function removeDbWriteSelectedUser(index) {
    if (index < 0 || index >= dbWriteSelectedUsers.length) return;
    dbWriteSelectedUsers.splice(index, 1);
    renderDbWriteSelectedUsers();
}

function removeDbWriteSelectedGroup(index) {
    if (index < 0 || index >= dbWriteSelectedGroups.length) return;
    dbWriteSelectedGroups.splice(index, 1);
    renderDbWriteSelectedGroups();
}

function addDbWriteSelectedUser(user) {
    const email = normalizeEmail((user && user.email) || '');
    if (!email) return;
    if (dbWriteSelectedUsers.some((u) => normalizeEmail(u.email) === email)) return;
    dbWriteSelectedUsers.push({ email: email });
    renderDbWriteSelectedUsers();
}

function addDbWriteSelectedGroup(group) {
    const candidate = {
        id: String((group && (group.id || group.group_id)) || '').trim(),
        name: String((group && (group.name || group.display_name)) || '').trim(),
        source: String((group && group.source) || 'identity_center').trim() || 'identity_center'
    };
    const key = normalizeGroupKey(candidate);
    if (!key) return;
    if (dbWriteSelectedGroups.some((g) => normalizeGroupKey(g) === key)) return;
    dbWriteSelectedGroups.push(candidate);
    renderDbWriteSelectedGroups();
}

function renderDbWriteSearchResults(type, items) {
    const container = document.getElementById(type === 'user' ? 'dbWriteUserSearchResults' : 'dbWriteGroupSearchResults');
    if (!container) return;

    if (!items.length) {
        container.innerHTML = '<div class="guardrail-search-item"><span>No matches found.</span></div>';
        return;
    }

    container.innerHTML = items.map((item, idx) => {
        if (type === 'user') {
            const label = item.display_name ? (item.display_name + ' (' + item.email + ')') : item.email;
            return `
                <div class="guardrail-search-item">
                    <span title="${escHtml(label)}">${escHtml(label)}</span>
                    <button class="btn-secondary btn-pam btn-sm" onclick="addDbWriteUserFromResult(${idx})">Add</button>
                </div>
            `;
        }
        const name = item.display_name || item.name || item.id;
        return `
            <div class="guardrail-search-item">
                <span title="${escHtml(name)}">${escHtml(name)}</span>
                <button class="btn-secondary btn-pam btn-sm" onclick="addDbWriteGroupFromResult(${idx})">Add</button>
            </div>
        `;
    }).join('');

    if (type === 'user') {
        window.__dbWriteUserSearchCache = items;
    } else {
        window.__dbWriteGroupSearchCache = items;
    }
}

function addDbWriteUserFromResult(index) {
    const cache = window.__dbWriteUserSearchCache || [];
    if (!cache[index]) return;
    addDbWriteSelectedUser(cache[index]);
}

function addDbWriteGroupFromResult(index) {
    const cache = window.__dbWriteGroupSearchCache || [];
    if (!cache[index]) return;
    addDbWriteSelectedGroup(cache[index]);
}

async function searchDbWriteExceptions(type) {
    const input = document.getElementById(type === 'user' ? 'dbWriteUserSearchInput' : 'dbWriteGroupSearchInput');
    const q = String((input && input.value) || '').trim();
    if (!q) {
        renderDbWriteSearchResults(type, []);
        return;
    }

    const base = getGuardrailsApiBase();
    try {
        if (type === 'user') {
            const results = [];
            const seen = new Set();

            try {
                const r = await fetch(base + '/admin/identity-center/users/search?q=' + encodeURIComponent(q), { credentials: 'include' });
                const data = await r.json();
                if (r.ok && Array.isArray(data.users)) {
                    data.users.forEach((u) => {
                        const email = normalizeEmail(u.email || u.username || '');
                        if (!email || seen.has(email)) return;
                        seen.add(email);
                        results.push({
                            email,
                            display_name: String(u.display_name || u.first_name || u.username || '').trim()
                        });
                    });
                }
            } catch (e) {
                // Fallback below
            }

            try {
                const r = await fetch(base + '/admin/org-users', { credentials: 'include' });
                const data = await r.json();
                if (r.ok && Array.isArray(data.users)) {
                    data.users.forEach((u) => {
                        const email = normalizeEmail(u.email || '');
                        if (!email || seen.has(email)) return;
                        const name = String(u.name || '').trim();
                        if (email.includes(q.toLowerCase()) || name.toLowerCase().includes(q.toLowerCase())) {
                            seen.add(email);
                            results.push({ email, display_name: name });
                        }
                    });
                }
            } catch (e) {
                // Keep current results.
            }

            renderDbWriteSearchResults('user', results);
        } else {
            const results = [];
            const seen = new Set();

            try {
                const r = await fetch(base + '/admin/identity-center/groups/search?q=' + encodeURIComponent(q), { credentials: 'include' });
                const data = await r.json();
                if (r.ok && Array.isArray(data.groups)) {
                    data.groups.forEach((g) => {
                        const id = String(g.group_id || g.id || '').trim();
                        if (!id || seen.has(id.toLowerCase())) return;
                        seen.add(id.toLowerCase());
                        results.push({
                            id,
                            display_name: String(g.display_name || g.name || id).trim(),
                            source: 'identity_center'
                        });
                    });
                }
            } catch (e) {
                // Fallback below
            }

            try {
                const r = await fetch(base + '/admin/groups', { credentials: 'include' });
                const data = await r.json();
                const groups = Array.isArray(data.groups) ? data.groups : [];
                groups.forEach((g) => {
                    const id = String(g.id || '').trim();
                    const name = String(g.name || id).trim();
                    if (!id || seen.has(id.toLowerCase())) return;
                    if (id.toLowerCase().includes(q.toLowerCase()) || name.toLowerCase().includes(q.toLowerCase())) {
                        seen.add(id.toLowerCase());
                        results.push({ id, display_name: name, source: 'local' });
                    }
                });
            } catch (e) {
                // Keep current results.
            }

            renderDbWriteSearchResults('group', results);
        }
    } catch (error) {
        console.error('Search failed:', error);
        renderDbWriteSearchResults(type, []);
    }
}

async function loadAccountsForDbWriteGuardrails() {
    const select = document.getElementById('dbWriteGuardrailAccount');
    if (!select) return;

    const current = select.value;
    select.innerHTML = '<option value="">Select AWS account</option>';

    try {
        const r = await fetch(getGuardrailsApiBase() + '/accounts', { credentials: 'include' });
        const data = await r.json();
        const accounts = (data && typeof data === 'object' && !Array.isArray(data)) ? Object.values(data) : [];
        accounts
            .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)))
            .forEach((a) => {
                const id = String(a.id || '').trim();
                if (!id) return;
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = (a.name ? (a.name + ' (' + id + ')') : id);
                select.appendChild(opt);
            });

        if (current && Array.from(select.options).some((o) => o.value === current)) {
            select.value = current;
        }
    } catch (error) {
        console.error('Failed to load accounts for DB guardrails:', error);
    }
}

async function onDbWriteGuardrailAccountChange() {
    const accountId = String((document.getElementById('dbWriteGuardrailAccount') || {}).value || '').trim();
    const instanceSelect = document.getElementById('dbWriteGuardrailInstance');
    if (!instanceSelect) return;

    instanceSelect.innerHTML = '<option value="">Select DB instance</option>';
    if (!accountId) return;

    try {
        const url = getGuardrailsApiBase() + '/databases?account_id=' + encodeURIComponent(accountId);
        const r = await fetch(url, { credentials: 'include' });
        const data = await r.json();
        const dbs = Array.isArray(data.databases) ? data.databases : [];
        dbs.forEach((db) => {
            const id = String(db.id || '').trim();
            if (!id) return;
            const label = String(db.name || id) + (db.engine ? ' (' + db.engine + ')' : '');
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = label;
            instanceSelect.appendChild(opt);
        });
    } catch (error) {
        console.error('Failed to load DB instances for guardrails:', error);
    }
}

function addDatabaseWriteGuardrailRule() {
    const enabled = !!(document.getElementById('dbWriteGuardrailEnabled') || {}).checked;
    const accountId = String((document.getElementById('dbWriteGuardrailAccount') || {}).value || '').trim();
    const dbInstanceId = String((document.getElementById('dbWriteGuardrailInstance') || {}).value || '').trim();
    const reason = String((document.getElementById('dbWriteGuardrailReason') || {}).value || '').trim();

    if (!accountId) {
        alert('Select an AWS account.');
        return;
    }
    if (!dbInstanceId) {
        alert('Select a database instance.');
        return;
    }

    dbWriteGuardrailRules.push({
        enabled,
        block_write_actions: true,
        account_id: accountId,
        db_instance_id: dbInstanceId,
        reason,
        allowed_users: dbWriteSelectedUsers.slice(),
        allowed_groups: dbWriteSelectedGroups.slice()
    });

    dbWriteSelectedUsers = [];
    dbWriteSelectedGroups = [];
    renderDbWriteSelectedUsers();
    renderDbWriteSelectedGroups();

    const reasonInput = document.getElementById('dbWriteGuardrailReason');
    if (reasonInput) reasonInput.value = '';
    const userInput = document.getElementById('dbWriteUserSearchInput');
    if (userInput) userInput.value = '';
    const groupInput = document.getElementById('dbWriteGroupSearchInput');
    if (groupInput) groupInput.value = '';
    renderDbWriteSearchResults('user', []);
    renderDbWriteSearchResults('group', []);

    renderDatabaseWriteGuardrailRules();
}

function toggleAIChat() {
    const popup = document.getElementById('aiChatPopup');
    const button = document.getElementById('aiChatButton');
    if (!popup || !button) return;

    const isHidden = popup.style.display === 'none' || !popup.style.display || popup.style.display === '';
    if (isHidden) {
        popup.style.display = 'flex';
        button.style.display = 'none';
    } else {
        popup.style.display = 'none';
        button.style.display = 'flex';
    }
}

function showAIChatButton() {
    const button = document.getElementById('aiChatButton');
    if (button) button.style.display = 'flex';
}

function hideAIChatButton() {
    const popup = document.getElementById('aiChatPopup');
    const button = document.getElementById('aiChatButton');
    if (popup) popup.style.display = 'none';
    if (button) button.style.display = 'none';
}

async function initGuardrailsSection() {
    if (guardrailsInitialized) return;
    guardrailsInitialized = true;

    await loadAccountsForDbWriteGuardrails();
    await onDbWriteGuardrailAccountChange();
    await loadGuardrails();
}

function refreshGuardrailsSection() {
    loadAccountsForDbWriteGuardrails().then(() => {
        onDbWriteGuardrailAccountChange();
    });
    loadGuardrails();
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initGuardrailsSection();
    }, 120);

    const guardrailsSubTab = document.getElementById('guardrailsSubTab');
    if (guardrailsSubTab) {
        guardrailsSubTab.addEventListener('click', () => {
            setTimeout(() => {
                refreshGuardrailsSection();
            }, 80);
        });
    }
});
