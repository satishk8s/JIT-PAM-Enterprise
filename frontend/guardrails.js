// Guardrails Management Functions

let guardrailConversationId = null;
let dbWriteGuardrailRules = [];
let dbQueryGuardrailRules = [];
let dbWriteSelectedUsers = [];
let dbWriteSelectedGroups = [];
let dbQuerySelectedUsers = [];
let dbQuerySelectedGroups = [];
let dbWriteEditingRuleIndex = -1;
let guardrailScopeOptions = [];
let guardrailsInitialized = false;
const DB_WRITE_EXCEPTION_ACTIONS = [
    'INSERT', 'UPDATE', 'DELETE', 'MERGE',
    'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME',
    'CREATE INDEX', 'DROP INDEX', 'ANALYZE'
];

function getGuardrailsApiBase() {
    if (typeof API_BASE !== 'undefined' && API_BASE) return API_BASE;
    if (window.API_BASE) return window.API_BASE;
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
    item.className = 'restriction-item guardrail-rule-row guardrail-rule-row-3';
    item.innerHTML = html;
    return item;
}

function pluralizeRule(count) {
    return count === 1 ? '1 rule' : `${count} rules`;
}

function setGuardrailCountBadge(id, count, emptyLabel) {
    const badge = document.getElementById(id);
    if (!badge) return;
    badge.textContent = count > 0 ? pluralizeRule(count) : (emptyLabel || 'No rules');
}

function updateGuardrailOverviewCounts() {
    setGuardrailCountBadge('serviceRestrictionsCountBadge', document.querySelectorAll('#serviceRestrictionsList .restriction-item').length, 'No rules');
    setGuardrailCountBadge('deleteRestrictionsCountBadge', document.querySelectorAll('#deleteRestrictionsList .restriction-item').length, 'No rules');
    setGuardrailCountBadge('createRestrictionsCountBadge', document.querySelectorAll('#createRestrictionsList .restriction-item').length, 'No rules');
    setGuardrailCountBadge('customGuardrailsCountBadge', document.querySelectorAll('#customGuardrailsList .restriction-item').length, 'No rules');
    setGuardrailCountBadge('dbWriteGuardrailsCountBadge', dbWriteGuardrailRules.length, 'No rules');
    setGuardrailCountBadge('dbQueryGuardrailsCountBadge', dbQueryGuardrailRules.length, 'No rules');
}

function ensureGuardrailModalStyles() {
    if (document.getElementById('guardrailModalStyles')) return;
    const style = document.createElement('style');
    style.id = 'guardrailModalStyles';
    style.textContent = `
        .guardrail-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.6);
            z-index: 9998;
        }
        .guardrail-panel.is-active {
            position: fixed !important;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: min(1100px, calc(100vw - 32px));
            max-height: calc(100vh - 48px);
            overflow: auto;
            z-index: 9999;
            box-shadow: 0 20px 60px rgba(15, 23, 42, 0.3);
            background: var(--bg-primary);
        }
        .guardrail-modal-close {
            position: sticky;
            top: 12px;
            float: right;
            z-index: 1;
        }
    `;
    document.head.appendChild(style);
}

function ensureGuardrailModalClose(panel) {
    if (!panel || panel.querySelector('.guardrail-modal-close')) return;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn-secondary btn-pam btn-sm guardrail-modal-close';
    close.innerHTML = '<i class="fas fa-times"></i> Close';
    close.onclick = closeGuardrailPanel;
    panel.prepend(close);
}

function closeGuardrailPanel() {
    document.querySelectorAll('.guardrail-panel').forEach(function(panel) {
        panel.classList.remove('is-active');
    });
    document.querySelectorAll('.guardrail-overview-tile[data-guardrail-panel]').forEach(function(tile) {
        tile.classList.remove('is-active');
    });
    const backdrop = document.getElementById('guardrailModalBackdrop');
    if (backdrop) backdrop.remove();
}

function openGuardrailPanel(targetId, options) {
    const panelId = String(targetId || '').trim();
    const opts = options || {};
    const activeTileId = String(opts.activeTileId || panelId).trim();
    ensureGuardrailModalStyles();
    closeGuardrailPanel();
    document.querySelectorAll('.guardrail-panel').forEach((panel) => {
        panel.classList.toggle('is-active', panel.id === panelId);
        if (panel.id === panelId) ensureGuardrailModalClose(panel);
    });
    document.querySelectorAll('.guardrail-overview-tile[data-guardrail-panel]').forEach((tile) => {
        tile.classList.toggle('is-active', tile.getAttribute('data-guardrail-panel') === activeTileId);
    });
    const backdrop = document.createElement('div');
    backdrop.id = 'guardrailModalBackdrop';
    backdrop.className = 'guardrail-modal-backdrop';
    backdrop.onclick = closeGuardrailPanel;
    document.body.appendChild(backdrop);

    const scrollTarget = document.getElementById(opts.focusId || panelId);
    if (scrollTarget) {
        if (opts.focusId && typeof scrollTarget.focus === 'function') {
            window.setTimeout(() => {
                try { scrollTarget.focus({ preventScroll: true }); } catch (_) {}
            }, 220);
        }
    }
}

function addServiceRestriction(rule) {
    const list = document.getElementById('serviceRestrictionsList');
    if (!list) return;
    const r = rule || {};
    const item = createRestrictionItem(`
        <select class="guardrail-input">
            <option value="kms">KMS (Key Management Service)</option>
            <option value="secretsmanager">Secrets Manager</option>
            <option value="iam">IAM (Identity & Access Management)</option>
            <option value="organizations">AWS Organizations</option>
            <option value="billing">Billing & Cost Management</option>
        </select>
        <select class="guardrail-input guardrail-input-compact">
            <option value="block">Block All Access</option>
            <option value="read_only">Read-Only</option>
            <option value="approval">Require Approval</option>
        </select>
        <input type="text" placeholder="Reason" value="${escHtml(r.reason || '')}" class="guardrail-input">
        <button class="btn-danger btn-sm" onclick="removeRestriction(this)"><i class="fas fa-trash"></i></button>
    `);
    const selects = item.querySelectorAll('select');
    if (r.service) selects[0].value = r.service;
    if (r.action) selects[1].value = r.action;
    list.appendChild(item);
    updateGuardrailOverviewCounts();
}

function addDeleteRestriction(rule) {
    const list = document.getElementById('deleteRestrictionsList');
    if (!list) return;
    const r = rule || {};
    const item = createRestrictionItem(`
        <select class="guardrail-input">
            <option value="kms">KMS Keys</option>
            <option value="s3">S3 Buckets</option>
            <option value="rds">RDS Databases</option>
            <option value="dynamodb">DynamoDB Tables</option>
            <option value="ec2">EC2 Instances</option>
            <option value="lambda">Lambda Functions</option>
        </select>
        <select class="guardrail-input guardrail-input-compact">
            <option value="all">All Environments</option>
            <option value="prod">Production Only</option>
            <option value="nonprod">Non-Prod Only</option>
        </select>
        <input type="text" placeholder="Reason" value="${escHtml(r.reason || '')}" class="guardrail-input">
        <button class="btn-danger btn-sm" onclick="removeRestriction(this)"><i class="fas fa-trash"></i></button>
    `);
    const selects = item.querySelectorAll('select');
    if (r.service) selects[0].value = r.service;
    if (r.environment) selects[1].value = r.environment;
    list.appendChild(item);
    updateGuardrailOverviewCounts();
}

function addCreateRestriction(rule) {
    const list = document.getElementById('createRestrictionsList');
    if (!list) return;
    const r = rule || {};
    const item = createRestrictionItem(`
        <select class="guardrail-input">
            <option value="ec2">EC2 Instances</option>
            <option value="rds">RDS Databases</option>
            <option value="s3">S3 Buckets</option>
            <option value="vpc">VPC Resources</option>
            <option value="iam">IAM Users/Roles</option>
            <option value="kms">KMS Keys</option>
        </select>
        <select class="guardrail-input guardrail-input-compact">
            <option value="all">All Environments</option>
            <option value="prod">Production Only</option>
            <option value="nonprod">Non-Prod Only</option>
        </select>
        <input type="text" placeholder="Reason" value="${escHtml(r.reason || '')}" class="guardrail-input">
        <button class="btn-danger btn-sm" onclick="removeRestriction(this)"><i class="fas fa-trash"></i></button>
    `);
    const selects = item.querySelectorAll('select');
    if (r.service) selects[0].value = r.service;
    if (r.environment) selects[1].value = r.environment;
    list.appendChild(item);
    updateGuardrailOverviewCounts();
}

function addCustomGuardrail(rule) {
    const list = document.getElementById('customGuardrailsList');
    if (!list) return;
    const r = rule || {};
    const item = createRestrictionItem(`
        <input type="text" placeholder="Rule Name" value="${escHtml(r.name || '')}" class="guardrail-input">
        <select class="guardrail-input guardrail-input-compact">
            <option value="tag">Tag-based</option>
            <option value="name">Name pattern</option>
            <option value="arn">ARN pattern</option>
        </select>
        <input type="text" placeholder="Condition" value="${escHtml(r.condition || '')}" class="guardrail-input">
        <button class="btn-danger btn-sm" onclick="removeRestriction(this)"><i class="fas fa-trash"></i></button>
    `);
    const select = item.querySelector('select');
    if (r.type) select.value = r.type;
    list.appendChild(item);
    updateGuardrailOverviewCounts();
}

function removeRestriction(button) {
    const row = button && button.closest ? button.closest('.restriction-item') : null;
    if (row) row.remove();
    updateGuardrailOverviewCounts();
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
    updateGuardrailOverviewCounts();
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
        ou_id: String(rule.ou_id || '').trim(),
        db_instance_id: String(rule.db_instance_id || '').trim(),
        reason: String(rule.reason || '').trim(),
        allowed_actions: Array.isArray(rule.allowed_actions) ? rule.allowed_actions.map((a) => String(a || '').trim().toUpperCase()).filter(Boolean) : [],
        allowed_users: (rule.allowed_users || []).map((u) => ({
            email: normalizeEmail(u.email || u.value || ''),
            expires_at: String(u.expires_at || '').trim()
        })).filter((u) => u.email),
        allowed_groups: (rule.allowed_groups || []).map((g) => ({
            id: String(g.id || g.group_id || '').trim(),
            name: String(g.name || g.display_name || '').trim(),
            source: String(g.source || 'identity_center').trim() || 'identity_center',
            expires_at: String(g.expires_at || '').trim()
        })).filter((g) => g.id || g.name)
    }));

    const databaseQueryControls = (dbQueryGuardrailRules || []).map((rule) => ({
        enabled: !!rule.enabled,
        account_id: String(rule.account_id || '').trim(),
        ou_id: String(rule.ou_id || '').trim(),
        db_instance_id: String(rule.db_instance_id || '').trim(),
        reason: String(rule.reason || '').trim(),
        blocked_patterns: Array.isArray(rule.blocked_patterns) ? rule.blocked_patterns.slice() : [],
        allowed_users: (rule.allowed_users || []).map((u) => ({
            email: normalizeEmail(u.email || u.value || ''),
            expires_at: String(u.expires_at || '').trim()
        })).filter((u) => u.email),
        allowed_groups: (rule.allowed_groups || []).map((g) => ({
            id: String(g.id || g.group_id || '').trim(),
            name: String(g.name || g.display_name || '').trim(),
            source: String(g.source || 'identity_center').trim() || 'identity_center',
            expires_at: String(g.expires_at || '').trim()
        })).filter((g) => g.id || g.name)
    }));

    return {
        serviceRestrictions,
        deleteRestrictions,
        createRestrictions,
        customGuardrails,
        databaseWriteControls,
        databaseQueryControls
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

function escapeGuardrailHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function closeGuardrailDialog(result) {
    const overlay = document.getElementById('guardrailDialogOverlay');
    if (!overlay) return;
    if (overlay.__onKeyDown) {
        document.removeEventListener('keydown', overlay.__onKeyDown);
        overlay.__onKeyDown = null;
    }
    const resolver = overlay.__resolver;
    overlay.__resolver = null;
    overlay.classList.remove('show');
    window.setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 120);
    if (typeof resolver === 'function') resolver(!!result);
}

function guardrailDialogIcon(variant) {
    if (variant === 'success') return 'fa-circle-check';
    if (variant === 'error') return 'fa-circle-xmark';
    if (variant === 'info') return 'fa-circle-info';
    return 'fa-triangle-exclamation';
}

function showGuardrailDialog(message, options) {
    const text = String(message || '').trim();
    if (!text) return Promise.resolve(true);
    const opts = options && typeof options === 'object' ? options : {};
    const title = String(opts.title || 'Notice').trim();
    const confirmLabel = String(opts.confirmLabel || 'OK').trim();
    const cancelLabel = String(opts.cancelLabel || 'Cancel').trim();
    const variant = String(opts.variant || 'info').trim().toLowerCase();
    const acknowledgeOnly = !!opts.acknowledgeOnly;

    const existing = document.getElementById('guardrailDialogOverlay');
    if (existing && typeof existing.__resolver === 'function') {
        existing.__resolver(false);
        existing.remove();
    }

    return new Promise(function(resolve) {
        const overlay = document.createElement('div');
        overlay.id = 'guardrailDialogOverlay';
        overlay.className = 'modal-overlay show app-confirm-overlay';
        overlay.innerHTML = `
            <div class="modal app-confirm-modal show app-confirm-${escapeGuardrailHtml(variant)}" role="dialog" aria-modal="true" aria-labelledby="guardrailDialogTitle">
                <div class="modal-header app-confirm-header">
                    <h3 id="guardrailDialogTitle"><i class="fas ${guardrailDialogIcon(variant)}"></i> ${escapeGuardrailHtml(title)}</h3>
                    <button type="button" class="modal-close" aria-label="Close dialog"><i class="fas fa-xmark"></i></button>
                </div>
                <div class="modal-body app-confirm-body">
                    <p>${escapeGuardrailHtml(text).replace(/\n/g, '<br>')}</p>
                </div>
                <div class="app-confirm-actions">
                    ${acknowledgeOnly ? '' : `<button type="button" class="btn-secondary guardrail-dialog-cancel">${escapeGuardrailHtml(cancelLabel)}</button>`}
                    <button type="button" class="${acknowledgeOnly ? 'btn-primary' : 'btn-danger'} guardrail-dialog-confirm">${escapeGuardrailHtml(confirmLabel)}</button>
                </div>
            </div>
        `;
        overlay.__resolver = resolve;
        document.body.appendChild(overlay);

        const closeBtn = overlay.querySelector('.modal-close');
        const cancelBtn = overlay.querySelector('.guardrail-dialog-cancel');
        const confirmBtn = overlay.querySelector('.guardrail-dialog-confirm');

        if (closeBtn) closeBtn.addEventListener('click', function() { closeGuardrailDialog(false); });
        if (cancelBtn) cancelBtn.addEventListener('click', function() { closeGuardrailDialog(false); });
        if (confirmBtn) confirmBtn.addEventListener('click', function() { closeGuardrailDialog(true); });

        overlay.addEventListener('click', function(evt) {
            if (evt.target === overlay) closeGuardrailDialog(false);
        });

        const onKeyDown = function(evt) {
            if (evt.key === 'Escape') {
                closeGuardrailDialog(false);
            }
        };
        overlay.__onKeyDown = onKeyDown;
        document.addEventListener('keydown', onKeyDown);

        window.setTimeout(function() {
            if (confirmBtn) confirmBtn.focus();
        }, 10);
    });
}

async function saveGuardrails() {
    const guardrails = collectGuardrails();
    const confirmed = await showGuardrailDialog(
        'Save Guardrails?\n\nThese rules will be applied to all future access requests. Continue?',
        {
            title: 'Save guardrails',
            variant: 'warning',
            confirmLabel: 'Save',
            cancelLabel: 'Cancel'
        }
    );
    if (!confirmed) return;

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (typeof getCsrfToken === 'function') {
            const csrfToken = getCsrfToken();
            if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
        }
        const response = await fetch(getGuardrailsApiBase() + '/admin/save-guardrails', {
            method: 'POST',
            headers: headers,
            credentials: 'include',
            body: JSON.stringify(guardrails)
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error((data && data.error) || 'Failed to save guardrails');
        }
        await showGuardrailDialog('Guardrails saved successfully.', {
            title: 'Guardrails saved',
            variant: 'success',
            acknowledgeOnly: true,
            confirmLabel: 'OK'
        });
        try {
            const saved = (data && data.guardrails) || guardrails;
            applyGeneratedGuardrails(saved || {});
            hydrateDatabaseWriteRules((saved && saved.databaseWriteControls) || []);
            hydrateDatabaseQueryRules((saved && saved.databaseQueryControls) || []);
            await loadGuardrailScopes();
        } catch (refreshError) {
            console.error('Guardrails saved but UI refresh failed:', refreshError);
        }
    } catch (error) {
        await showGuardrailDialog('Failed to save guardrails: ' + (error.message || error), {
            title: 'Save failed',
            variant: 'error',
            acknowledgeOnly: true,
            confirmLabel: 'OK'
        });
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
        hydrateDatabaseQueryRules(data.databaseQueryControls || []);
        await loadGuardrailScopes();
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
        await showGuardrailDialog('Invalid MFA token', {
            title: 'Verification required',
            variant: 'error',
            acknowledgeOnly: true,
            confirmLabel: 'OK'
        });
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
            ou_id: String(rule.ou_id || rule.ouId || '').trim(),
            db_instance_id: String(rule.db_instance_id || rule.dbInstanceId || '').trim(),
            reason: String(rule.reason || '').trim(),
            allowed_actions: Array.isArray(rule.allowed_actions || rule.allowedActions)
                ? (rule.allowed_actions || rule.allowedActions).map((a) => String(a || '').trim().toUpperCase()).filter((a) => DB_WRITE_EXCEPTION_ACTIONS.includes(a))
                : [],
            allowed_users: Array.isArray(rule.allowed_users || rule.allowedUsers)
                ? (rule.allowed_users || rule.allowedUsers).map((u) => ({
                    email: normalizeEmail((u && (u.email || u.value)) || u),
                    expires_at: String((u && (u.expires_at || u.expiresAt)) || '').trim()
                })).filter((u) => u.email)
                : [],
            allowed_groups: Array.isArray(rule.allowed_groups || rule.allowedGroups)
                ? (rule.allowed_groups || rule.allowedGroups).map((g) => ({
                    id: String((g && (g.id || g.group_id)) || g || '').trim(),
                    name: String((g && (g.name || g.display_name)) || '').trim(),
                    source: String((g && g.source) || 'identity_center').trim() || 'identity_center',
                    expires_at: String((g && (g.expires_at || g.expiresAt)) || '').trim()
                })).filter((g) => g.id || g.name)
                : []
        }))
        : [];

    renderDatabaseWriteGuardrailRules();
    dbWriteSelectedUsers = [];
    dbWriteSelectedGroups = [];
    renderDbWriteSelectedUsers();
    renderDbWriteSelectedGroups();
    updateGuardrailOverviewCounts();
}

function hydrateDatabaseQueryRules(rules) {
    dbQueryGuardrailRules = Array.isArray(rules)
        ? rules.map(function(rule) {
            return {
                enabled: !!rule.enabled,
                account_id: String(rule.account_id || rule.accountId || '').trim(),
                ou_id: String(rule.ou_id || rule.ouId || '').trim(),
                db_instance_id: String(rule.db_instance_id || rule.dbInstanceId || '').trim(),
                reason: String(rule.reason || '').trim(),
                blocked_patterns: Array.isArray(rule.blocked_patterns || rule.blockedPatterns)
                    ? (rule.blocked_patterns || rule.blockedPatterns).map(function(item) { return String(item || '').trim(); }).filter(Boolean)
                    : [],
                allowed_users: Array.isArray(rule.allowed_users || rule.allowedUsers)
                    ? (rule.allowed_users || rule.allowedUsers).map(function(u) {
                        return {
                            email: normalizeEmail((u && (u.email || u.value)) || u),
                            expires_at: String((u && (u.expires_at || u.expiresAt)) || '').trim()
                        };
                    }).filter(function(u) { return u.email; })
                    : [],
                allowed_groups: Array.isArray(rule.allowed_groups || rule.allowedGroups)
                    ? (rule.allowed_groups || rule.allowedGroups).map(function(g) {
                        return {
                            id: String((g && (g.id || g.group_id)) || g || '').trim(),
                            name: String((g && (g.name || g.display_name)) || '').trim(),
                            source: String((g && g.source) || 'identity_center').trim() || 'identity_center',
                            expires_at: String((g && (g.expires_at || g.expiresAt)) || '').trim()
                        };
                    }).filter(function(g) { return g.id || g.name; })
                    : []
            };
        })
        : [];
    dbQuerySelectedUsers = [];
    dbQuerySelectedGroups = [];
    renderDbQuerySelectedUsers();
    renderDbQuerySelectedGroups();
    renderDatabaseQueryGuardrailRules();
    updateGuardrailOverviewCounts();
}

function guardrailScopeLabel(rule) {
    if (rule.ou_id) {
        const item = guardrailScopeOptions.find(function(opt) { return opt.type === 'ou' && opt.id === rule.ou_id; });
        return item ? item.label : ('OU ' + rule.ou_id);
    }
    if (rule.account_id) {
        const item = guardrailScopeOptions.find(function(opt) { return opt.type === 'account' && opt.id === rule.account_id; });
        return item ? item.label : rule.account_id;
    }
    return 'Any scope';
}

function formatExceptionSummary(items, field) {
    const values = (items || []).map(function(item) {
        const label = item[field] || item.name || item.id || '';
        const expiry = String(item.expires_at || '').trim();
        return expiry ? `${label} (until ${expiry})` : label;
    }).filter(Boolean);
    return values.length ? values.join(', ') : 'None';
}

function renderDatabaseWriteGuardrailRules() {
    const list = document.getElementById('dbWriteGuardrailRulesList');
    const emptyEl = document.getElementById('dbWriteGuardrailRulesEmpty');
    if (!list || !emptyEl) return;

    if (!dbWriteGuardrailRules.length) {
        list.innerHTML = '';
        emptyEl.style.display = 'block';
        updateGuardrailOverviewCounts();
        return;
    }

    emptyEl.style.display = 'none';
    list.innerHTML = dbWriteGuardrailRules.map((rule, idx) => {
        const users = (rule.allowed_users || []).map((u) => u.email).filter(Boolean);
        const groups = (rule.allowed_groups || []).map((g) => g.name || g.id).filter(Boolean);
        return `
            <div class="guardrail-db-rule">
                <div>
                    <div class="guardrail-db-rule-title">${escHtml(guardrailScopeLabel(rule))} / ${escHtml(rule.db_instance_id || 'Any DB')}</div>
                    <div class="guardrail-db-rule-meta">${rule.enabled ? 'Enabled' : 'Disabled'} · ${rule.block_write_actions ? 'Write blocked' : 'Write allowed'}</div>
                    <div class="guardrail-db-rule-meta">Exception write actions: ${escHtml((rule.allowed_actions || []).join(', ') || 'Read-only only')}</div>
                    <div class="guardrail-db-rule-meta">Allowed users: ${users.length ? escHtml(formatExceptionSummary(rule.allowed_users || [], 'email')) : 'None'}</div>
                    <div class="guardrail-db-rule-meta">Allowed groups: ${groups.length ? escHtml(formatExceptionSummary(rule.allowed_groups || [], 'name')) : 'None'}</div>
                    ${rule.reason ? `<div class="guardrail-db-rule-meta">Reason: ${escHtml(rule.reason)}</div>` : ''}
                </div>
                <div class="group-card-actions">
                    <button class="btn-secondary btn-sm" onclick="editDatabaseWriteGuardrailRule(${idx})"><i class="fas fa-edit"></i></button>
                    <button class="btn-danger btn-sm" onclick="removeDatabaseWriteGuardrailRule(${idx})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    }).join('');
    updateGuardrailOverviewCounts();
}

function removeDatabaseWriteGuardrailRule(index) {
    if (index < 0 || index >= dbWriteGuardrailRules.length) return;
    dbWriteGuardrailRules.splice(index, 1);
    if (dbWriteEditingRuleIndex === index) dbWriteEditingRuleIndex = -1;
    renderDatabaseWriteGuardrailRules();
}

function resetDatabaseWriteGuardrailEditor() {
    dbWriteEditingRuleIndex = -1;
    dbWriteSelectedUsers = [];
    dbWriteSelectedGroups = [];
    const enabledInput = document.getElementById('dbWriteGuardrailEnabled');
    const scopeInput = document.getElementById('dbWriteGuardrailScope');
    const instanceInput = document.getElementById('dbWriteGuardrailInstance');
    const reasonInput = document.getElementById('dbWriteGuardrailReason');
    const expiryInput = document.getElementById('dbWriteExceptionExpiry');
    const userInput = document.getElementById('dbWriteUserSearchInput');
    const groupInput = document.getElementById('dbWriteGroupSearchInput');
    if (enabledInput) enabledInput.checked = true;
    if (scopeInput) scopeInput.value = '';
    if (instanceInput) instanceInput.innerHTML = '<option value="">Any DB instance in scope</option>';
    if (reasonInput) reasonInput.value = '';
    if (expiryInput) expiryInput.value = '';
    if (userInput) userInput.value = '';
    if (groupInput) groupInput.value = '';
    document.querySelectorAll('#dbWriteAllowedActions input').forEach(function(input) {
        input.checked = false;
    });
    renderDbWriteSelectedUsers();
    renderDbWriteSelectedGroups();
    renderDbWriteSearchResults('user', []);
    renderDbWriteSearchResults('group', []);
}

async function editDatabaseWriteGuardrailRule(index) {
    if (index < 0 || index >= dbWriteGuardrailRules.length) return;
    const rule = dbWriteGuardrailRules[index];
    dbWriteGuardrailRules.splice(index, 1);
    dbWriteEditingRuleIndex = -1;
    renderDatabaseWriteGuardrailRules();

    const enabledInput = document.getElementById('dbWriteGuardrailEnabled');
    const scopeInput = document.getElementById('dbWriteGuardrailScope');
    const reasonInput = document.getElementById('dbWriteGuardrailReason');
    const expiryInput = document.getElementById('dbWriteExceptionExpiry');
    if (enabledInput) enabledInput.checked = !!rule.enabled;
    if (scopeInput) {
        scopeInput.value = rule.ou_id ? ('ou:' + rule.ou_id) : ('account:' + rule.account_id);
        await onDbWriteGuardrailScopeChange();
    }
    const instanceInput = document.getElementById('dbWriteGuardrailInstance');
    if (instanceInput) instanceInput.value = String(rule.db_instance_id || '').trim();
    if (reasonInput) reasonInput.value = String(rule.reason || '').trim();
    if (expiryInput) expiryInput.value = '';
    document.querySelectorAll('#dbWriteAllowedActions input').forEach(function(input) {
        input.checked = Array.isArray(rule.allowed_actions) && rule.allowed_actions.indexOf(String(input.value || '').trim().toUpperCase()) >= 0;
    });
    dbWriteSelectedUsers = Array.isArray(rule.allowed_users) ? rule.allowed_users.map(function(item) {
        return { email: normalizeEmail(item.email || item.value || ''), expires_at: String(item.expires_at || '').trim() };
    }).filter(function(item) { return item.email; }) : [];
    dbWriteSelectedGroups = Array.isArray(rule.allowed_groups) ? rule.allowed_groups.map(function(item) {
        return {
            id: String(item.id || item.group_id || '').trim(),
            name: String(item.name || item.display_name || '').trim(),
            source: String(item.source || 'identity_center').trim() || 'identity_center',
            expires_at: String(item.expires_at || '').trim()
        };
    }).filter(function(item) { return item.id || item.name; }) : [];
    dbWriteEditingRuleIndex = index;
    renderDbWriteSelectedUsers();
    renderDbWriteSelectedGroups();
}

function mergeGuardrailUsers(existing, incoming) {
    const merged = [];
    const seen = new Set();
    (existing || []).concat(incoming || []).forEach(function(user) {
        const email = normalizeEmail((user && (user.email || user.value)) || '');
        if (!email) return;
        if (seen.has(email)) {
            const current = merged.find(function(item) { return normalizeEmail(item.email) === email; });
            if (current && user && user.expires_at) current.expires_at = String(user.expires_at || '').trim();
            return;
        }
        seen.add(email);
        merged.push({
            email: email,
            expires_at: String((user && user.expires_at) || '').trim()
        });
    });
    return merged;
}

function mergeGuardrailGroups(existing, incoming) {
    const merged = [];
    const seen = new Set();
    (existing || []).concat(incoming || []).forEach(function(group) {
        const candidate = {
            id: String((group && (group.id || group.group_id)) || '').trim(),
            name: String((group && (group.name || group.display_name)) || '').trim(),
            source: String((group && group.source) || 'identity_center').trim() || 'identity_center',
            expires_at: String((group && group.expires_at) || '').trim()
        };
        const key = normalizeGroupKey(candidate);
        if (!key) return;
        if (seen.has(key)) {
            const current = merged.find(function(item) { return normalizeGroupKey(item) === key; });
            if (current && candidate.expires_at) current.expires_at = candidate.expires_at;
            if (current && candidate.name && !current.name) current.name = candidate.name;
            if (current && candidate.id && !current.id) current.id = candidate.id;
            return;
        }
        seen.add(key);
        merged.push(candidate);
    });
    return merged;
}

function renderDbWriteSelectedUsers() {
    const container = document.getElementById('dbWriteAllowedUsers');
    if (!container) return;
    container.innerHTML = dbWriteSelectedUsers.map((u, idx) => `
        <span class="guardrail-chip">
            ${escHtml(u.expires_at ? `${u.email} (until ${u.expires_at})` : u.email)}
            <button type="button" onclick="removeDbWriteSelectedUser(${idx})">&times;</button>
        </span>
    `).join('');
}

function renderDbWriteSelectedGroups() {
    const container = document.getElementById('dbWriteAllowedGroups');
    if (!container) return;
    container.innerHTML = dbWriteSelectedGroups.map((g, idx) => `
        <span class="guardrail-chip">
            ${escHtml(g.expires_at ? `${g.name || g.id} (until ${g.expires_at})` : (g.name || g.id))}
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
    dbWriteSelectedUsers.push({ email: email, expires_at: String(document.getElementById('dbWriteExceptionExpiry')?.value || '').trim() });
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
    candidate.expires_at = String(document.getElementById('dbWriteExceptionExpiry')?.value || '').trim();
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
    return loadGuardrailScopes();
}

async function loadGuardrailScopes() {
    const writeSelect = document.getElementById('dbWriteGuardrailScope');
    const querySelect = document.getElementById('dbQueryGuardrailScope');
    const existingWrite = writeSelect ? writeSelect.value : '';
    const existingQuery = querySelect ? querySelect.value : '';
    guardrailScopeOptions = [];
    try {
        const accountsResponse = await fetch(getGuardrailsApiBase() + '/accounts', { credentials: 'include' });
        const accountPayload = await accountsResponse.json();
        const accountRows = (accountPayload && typeof accountPayload === 'object' && !Array.isArray(accountPayload)) ? Object.values(accountPayload) : [];
        accountRows.forEach(function(a) {
            const id = String(a.id || '').trim();
            if (!id) return;
            guardrailScopeOptions.push({
                type: 'account',
                id: id,
                label: a.name ? `${a.name} (${id})` : id
            });
        });
    } catch (error) {
        console.error('Failed to load accounts for guardrails:', error);
    }
    try {
        const hierarchyResponse = await fetch(getGuardrailsApiBase() + '/admin/identity-center/org-hierarchy', { credentials: 'include' });
        const hierarchy = await hierarchyResponse.json();
        const ous = [];
        function walk(node) {
            if (!node || typeof node !== 'object') return;
            const ouId = String(node.id || '').trim();
            const nodeType = String(node.type || '').trim().toLowerCase();
            const label = String(node.name || ouId).trim();
            if (nodeType === 'ou' && ouId) {
                ous.push({ type: 'ou', id: ouId, label: `${label} (${ouId})` });
            }
            (node.children || []).forEach(walk);
        }
        (hierarchy.roots || []).forEach(walk);
        guardrailScopeOptions = guardrailScopeOptions.concat(ous);
    } catch (error) {
        console.error('Failed to load OU scopes for guardrails:', error);
    }
    [writeSelect, querySelect].forEach(function(select, idx) {
        if (!select) return;
        const existing = idx === 0 ? existingWrite : existingQuery;
        select.innerHTML = '<option value="">Select account or OU</option>' + guardrailScopeOptions.map(function(opt) {
            return `<option value="${escHtml(opt.type + ':' + opt.id)}">${escHtml((opt.type === 'ou' ? 'OU' : 'Account') + ' — ' + opt.label)}</option>`;
        }).join('');
        if (existing && Array.from(select.options).some(function(item) { return item.value === existing; })) {
            select.value = existing;
        }
    });
}

function parseGuardrailScope(value) {
    const raw = String(value || '').trim();
    if (!raw.includes(':')) return { account_id: raw, ou_id: '' };
    const parts = raw.split(':');
    return parts[0] === 'ou'
        ? { account_id: '', ou_id: parts.slice(1).join(':') }
        : { account_id: parts.slice(1).join(':'), ou_id: '' };
}

async function populateGuardrailInstanceOptions(scopeValue, selectId) {
    const instanceSelect = document.getElementById(selectId);
    if (!instanceSelect) return;
    instanceSelect.innerHTML = '<option value="">Any DB instance in scope</option>';
    const parsed = parseGuardrailScope(scopeValue);
    if (!parsed.account_id) return;

    try {
        const url = getGuardrailsApiBase() + '/databases?account_id=' + encodeURIComponent(parsed.account_id);
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

async function onDbWriteGuardrailScopeChange() {
    await populateGuardrailInstanceOptions(document.getElementById('dbWriteGuardrailScope')?.value, 'dbWriteGuardrailInstance');
}

async function onDbQueryGuardrailScopeChange() {
    await populateGuardrailInstanceOptions(document.getElementById('dbQueryGuardrailScope')?.value, 'dbQueryGuardrailInstance');
}

function addDatabaseWriteGuardrailRule() {
    const enabled = !!(document.getElementById('dbWriteGuardrailEnabled') || {}).checked;
    const scope = parseGuardrailScope(String((document.getElementById('dbWriteGuardrailScope') || {}).value || '').trim());
    const dbInstanceId = String((document.getElementById('dbWriteGuardrailInstance') || {}).value || '').trim();
    const reason = String((document.getElementById('dbWriteGuardrailReason') || {}).value || '').trim();
    const allowedActions = Array.from(document.querySelectorAll('#dbWriteAllowedActions input:checked')).map(function(input) {
        return String(input.value || '').trim().toUpperCase();
    }).filter(function(action) { return DB_WRITE_EXCEPTION_ACTIONS.includes(action); });

    if (!scope.account_id && !scope.ou_id) {
        showGuardrailDialog('Select an account or OU scope.', {
            title: 'Missing scope',
            variant: 'warning',
            acknowledgeOnly: true,
            confirmLabel: 'OK'
        });
        return;
    }
    if ((dbWriteSelectedUsers.length || dbWriteSelectedGroups.length) && !allowedActions.length) {
        showGuardrailDialog('Select at least one write action that the exception should allow.', {
            title: 'Missing exception actions',
            variant: 'warning',
            acknowledgeOnly: true,
            confirmLabel: 'OK'
        });
        return;
    }

    const newRule = {
        enabled,
        block_write_actions: true,
        account_id: scope.account_id,
        ou_id: scope.ou_id,
        db_instance_id: dbInstanceId,
        reason,
        allowed_actions: allowedActions,
        allowed_users: dbWriteSelectedUsers.slice(),
        allowed_groups: dbWriteSelectedGroups.slice()
    };
    const existingIndex = dbWriteGuardrailRules.findIndex(function(rule) {
        return String(rule.account_id || '') === newRule.account_id &&
            String(rule.ou_id || '') === newRule.ou_id &&
            String(rule.db_instance_id || '') === newRule.db_instance_id;
    });
    if (existingIndex >= 0) {
        const current = dbWriteGuardrailRules[existingIndex] || {};
        dbWriteGuardrailRules[existingIndex] = {
            enabled: newRule.enabled,
            block_write_actions: true,
            account_id: newRule.account_id,
            ou_id: newRule.ou_id,
            db_instance_id: newRule.db_instance_id,
            reason: newRule.reason || current.reason || '',
            allowed_actions: Array.from(new Set([].concat(current.allowed_actions || [], newRule.allowed_actions || []))),
            allowed_users: mergeGuardrailUsers(current.allowed_users, newRule.allowed_users),
            allowed_groups: mergeGuardrailGroups(current.allowed_groups, newRule.allowed_groups)
        };
    } else {
        dbWriteGuardrailRules.push(newRule);
    }
    resetDatabaseWriteGuardrailEditor();
    renderDatabaseWriteGuardrailRules();
}

function renderDbQuerySelectedUsers() {
    const container = document.getElementById('dbQueryAllowedUsers');
    if (!container) return;
    container.innerHTML = dbQuerySelectedUsers.map(function(u, idx) {
        const label = u.expires_at ? `${u.email} (until ${u.expires_at})` : u.email;
        return `<span class="guardrail-chip">${escHtml(label)}<button type="button" onclick="removeDbQuerySelectedUser(${idx})">&times;</button></span>`;
    }).join('');
}

function renderDbQuerySelectedGroups() {
    const container = document.getElementById('dbQueryAllowedGroups');
    if (!container) return;
    container.innerHTML = dbQuerySelectedGroups.map(function(g, idx) {
        const base = g.name || g.id;
        const label = g.expires_at ? `${base} (until ${g.expires_at})` : base;
        return `<span class="guardrail-chip">${escHtml(label)}<button type="button" onclick="removeDbQuerySelectedGroup(${idx})">&times;</button></span>`;
    }).join('');
}

function removeDbQuerySelectedUser(index) {
    if (index < 0 || index >= dbQuerySelectedUsers.length) return;
    dbQuerySelectedUsers.splice(index, 1);
    renderDbQuerySelectedUsers();
}

function removeDbQuerySelectedGroup(index) {
    if (index < 0 || index >= dbQuerySelectedGroups.length) return;
    dbQuerySelectedGroups.splice(index, 1);
    renderDbQuerySelectedGroups();
}

function addDbQuerySelectedUser(user) {
    const email = normalizeEmail((user && user.email) || '');
    if (!email) return;
    if (dbQuerySelectedUsers.some(function(item) { return normalizeEmail(item.email) === email; })) return;
    dbQuerySelectedUsers.push({ email: email, expires_at: String(document.getElementById('dbQueryExceptionExpiry')?.value || '').trim() });
    renderDbQuerySelectedUsers();
}

function addDbQuerySelectedGroup(group) {
    const candidate = {
        id: String((group && (group.id || group.group_id)) || '').trim(),
        name: String((group && (group.name || group.display_name)) || '').trim(),
        source: String((group && group.source) || 'identity_center').trim() || 'identity_center',
        expires_at: String(document.getElementById('dbQueryExceptionExpiry')?.value || '').trim()
    };
    const key = normalizeGroupKey(candidate);
    if (!key) return;
    if (dbQuerySelectedGroups.some(function(item) { return normalizeGroupKey(item) === key; })) return;
    dbQuerySelectedGroups.push(candidate);
    renderDbQuerySelectedGroups();
}

function renderDbQuerySearchResults(type, items) {
    const container = document.getElementById(type === 'user' ? 'dbQueryUserSearchResults' : 'dbQueryGroupSearchResults');
    if (!container) return;
    if (!items.length) {
        container.innerHTML = '<div class="guardrail-search-item"><span>No matches found.</span></div>';
        return;
    }
    container.innerHTML = items.map(function(item, idx) {
        if (type === 'user') {
            const label = item.display_name ? (item.display_name + ' (' + item.email + ')') : item.email;
            return `<div class="guardrail-search-item"><span title="${escHtml(label)}">${escHtml(label)}</span><button class="btn-secondary btn-pam btn-sm" onclick="addDbQueryUserFromResult(${idx})">Add</button></div>`;
        }
        const name = item.display_name || item.name || item.id;
        return `<div class="guardrail-search-item"><span title="${escHtml(name)}">${escHtml(name)}</span><button class="btn-secondary btn-pam btn-sm" onclick="addDbQueryGroupFromResult(${idx})">Add</button></div>`;
    }).join('');
    if (type === 'user') window.__dbQueryUserSearchCache = items;
    else window.__dbQueryGroupSearchCache = items;
}

function addDbQueryUserFromResult(index) {
    const cache = window.__dbQueryUserSearchCache || [];
    if (!cache[index]) return;
    addDbQuerySelectedUser(cache[index]);
}

function addDbQueryGroupFromResult(index) {
    const cache = window.__dbQueryGroupSearchCache || [];
    if (!cache[index]) return;
    addDbQuerySelectedGroup(cache[index]);
}

async function searchDbQueryExceptions(type) {
    const input = document.getElementById(type === 'user' ? 'dbQueryUserSearchInput' : 'dbQueryGroupSearchInput');
    const q = String((input && input.value) || '').trim();
    if (!q) {
        renderDbQuerySearchResults(type, []);
        return;
    }
    if (type === 'user') {
        await searchDbWriteExceptions('user');
        renderDbQuerySearchResults('user', window.__dbWriteUserSearchCache || []);
    } else {
        await searchDbWriteExceptions('group');
        renderDbQuerySearchResults('group', window.__dbWriteGroupSearchCache || []);
    }
}

function renderDatabaseQueryGuardrailRules() {
    const list = document.getElementById('dbQueryGuardrailRulesList');
    const emptyEl = document.getElementById('dbQueryGuardrailRulesEmpty');
    if (!list || !emptyEl) return;
    if (!dbQueryGuardrailRules.length) {
        list.innerHTML = '';
        emptyEl.style.display = 'block';
        updateGuardrailOverviewCounts();
        return;
    }
    emptyEl.style.display = 'none';
    list.innerHTML = dbQueryGuardrailRules.map(function(rule, idx) {
        return `
            <div class="guardrail-db-rule">
                <div>
                    <div class="guardrail-db-rule-title">${escHtml(guardrailScopeLabel(rule))} / ${escHtml(rule.db_instance_id || 'Any DB')}</div>
                    <div class="guardrail-db-rule-meta">Blocked patterns: ${escHtml((rule.blocked_patterns || []).join(', ') || 'None')}</div>
                    <div class="guardrail-db-rule-meta">Allowed users: ${escHtml(formatExceptionSummary(rule.allowed_users || [], 'email'))}</div>
                    <div class="guardrail-db-rule-meta">Allowed groups: ${escHtml(formatExceptionSummary(rule.allowed_groups || [], 'name'))}</div>
                    ${rule.reason ? `<div class="guardrail-db-rule-meta">Reason: ${escHtml(rule.reason)}</div>` : ''}
                </div>
                <button class="btn-danger btn-sm" onclick="removeDatabaseQueryGuardrailRule(${idx})"><i class="fas fa-trash"></i></button>
            </div>
        `;
    }).join('');
    updateGuardrailOverviewCounts();
}

function removeDatabaseQueryGuardrailRule(index) {
    if (index < 0 || index >= dbQueryGuardrailRules.length) return;
    dbQueryGuardrailRules.splice(index, 1);
    renderDatabaseQueryGuardrailRules();
}

function addDatabaseQueryGuardrailRule() {
    const enabled = !!(document.getElementById('dbQueryGuardrailEnabled') || {}).checked;
    const scope = parseGuardrailScope(String((document.getElementById('dbQueryGuardrailScope') || {}).value || '').trim());
    const dbInstanceId = String((document.getElementById('dbQueryGuardrailInstance') || {}).value || '').trim();
    const reason = String((document.getElementById('dbQueryGuardrailReason') || {}).value || '').trim();
    const blockedPatterns = Array.from(document.querySelectorAll('#dbQueryGuardrailPatterns input:checked')).map(function(input) {
        return String(input.value || '').trim();
    }).filter(Boolean);
    if (!scope.account_id && !scope.ou_id) {
        showGuardrailDialog('Select an account or OU scope.', {
            title: 'Missing scope',
            variant: 'warning',
            acknowledgeOnly: true,
            confirmLabel: 'OK'
        });
        return;
    }
    if (!blockedPatterns.length) {
        showGuardrailDialog('Select at least one blocked query pattern.', {
            title: 'Missing query pattern',
            variant: 'warning',
            acknowledgeOnly: true,
            confirmLabel: 'OK'
        });
        return;
    }
    const newRule = {
        enabled: enabled,
        account_id: scope.account_id,
        ou_id: scope.ou_id,
        db_instance_id: dbInstanceId,
        reason: reason,
        blocked_patterns: blockedPatterns,
        allowed_users: dbQuerySelectedUsers.slice(),
        allowed_groups: dbQuerySelectedGroups.slice()
    };
    const existingIndex = dbQueryGuardrailRules.findIndex(function(rule) {
        return String(rule.account_id || '') === newRule.account_id &&
            String(rule.ou_id || '') === newRule.ou_id &&
            String(rule.db_instance_id || '') === newRule.db_instance_id;
    });
    if (existingIndex >= 0) {
        const current = dbQueryGuardrailRules[existingIndex] || {};
        dbQueryGuardrailRules[existingIndex] = {
            enabled: newRule.enabled,
            account_id: newRule.account_id,
            ou_id: newRule.ou_id,
            db_instance_id: newRule.db_instance_id,
            reason: newRule.reason || current.reason || '',
            blocked_patterns: Array.from(new Set([].concat(current.blocked_patterns || [], newRule.blocked_patterns || []))),
            allowed_users: mergeGuardrailUsers(current.allowed_users, newRule.allowed_users),
            allowed_groups: mergeGuardrailGroups(current.allowed_groups, newRule.allowed_groups)
        };
    } else {
        dbQueryGuardrailRules.push(newRule);
    }
    dbQuerySelectedUsers = [];
    dbQuerySelectedGroups = [];
    renderDbQuerySelectedUsers();
    renderDbQuerySelectedGroups();
    const reasonInput = document.getElementById('dbQueryGuardrailReason');
    if (reasonInput) reasonInput.value = '';
    const expiryInput = document.getElementById('dbQueryExceptionExpiry');
    if (expiryInput) expiryInput.value = '';
    document.querySelectorAll('#dbQueryGuardrailPatterns input:checked').forEach(function(input) { input.checked = false; });
    renderDbQuerySearchResults('user', []);
    renderDbQuerySearchResults('group', []);
    renderDatabaseQueryGuardrailRules();
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
    await onDbWriteGuardrailScopeChange();
    await onDbQueryGuardrailScopeChange();
    await loadGuardrails();
}

function refreshGuardrailsSection() {
    loadAccountsForDbWriteGuardrails().then(() => {
        onDbWriteGuardrailScopeChange();
        onDbQueryGuardrailScopeChange();
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
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') closeGuardrailPanel();
    });
});
