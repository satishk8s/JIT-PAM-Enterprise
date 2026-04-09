let approvalWorkflowRecords = [];
let approvalWorkflowEditingId = '';
let approvalWorkflowIamRoles = [];
let approvalWorkflowRoleLoadPromise = null;
let approvalWorkflowDefaultApprovers = {
    secondary: '',
    db_owner: '',
    security_lead: ''
};
let approvalWorkflowManagerTab = 'workflows';

function getApprovalWorkflowApiBase() {
    const base = String(
        (typeof window !== 'undefined' && window.API_BASE)
            ? window.API_BASE
            : '/api'
    ).replace(/\/+$/, '');
    return base || '/api';
}

function approvalWorkflowJsonHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (typeof getCsrfToken === 'function') {
        const csrfToken = String(getCsrfToken() || '').trim();
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    }
    return headers;
}

function getApprovalWorkflowMount() {
    return document.getElementById('approvalWorkflowMount') || document.querySelector('#workflowPage .page-content');
}

function getApprovalWorkflowEditorMount() {
    return document.getElementById('approvalWorkflowEditModalMount');
}

function getApprovalWorkflowEditorSource() {
    return document.getElementById('approvalWorkflowBuilderCard');
}

function ensureApprovalWorkflowEditorPlaceholder() {
    const source = getApprovalWorkflowEditorSource();
    if (!source || source.dataset.placeholderId) return;
    const placeholder = document.createElement('div');
    placeholder.id = 'approvalWorkflowBuilderCardPlaceholder';
    source.parentNode.insertBefore(placeholder, source);
    source.dataset.placeholderId = placeholder.id;
}

function openApprovalWorkflowEditorModal() {
    const source = getApprovalWorkflowEditorSource();
    const mount = getApprovalWorkflowEditorMount();
    if (!source || !mount) return;
    ensureApprovalWorkflowEditorPlaceholder();
    source.style.display = '';
    mount.appendChild(source);
    window.__WORKFLOW_EDITOR_MODAL_STATE = { active: true };
    if (typeof showModal === 'function') showModal('approvalWorkflowEditModal');
}

function closeApprovalWorkflowEditorModal() {
    const source = getApprovalWorkflowEditorSource();
    const placeholderId = source ? source.dataset.placeholderId : '';
    const placeholder = placeholderId ? document.getElementById(placeholderId) : null;
    if (source && placeholder && placeholder.parentNode) {
        placeholder.parentNode.insertBefore(source, placeholder);
        placeholder.remove();
        delete source.dataset.placeholderId;
    }
    if (source) source.style.display = 'none';
    window.__WORKFLOW_EDITOR_MODAL_STATE = { active: false };
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.remove('show');
    document.querySelectorAll('.modal').forEach(function(modal) {
        modal.classList.remove('show');
    });
}

function emptyWorkflowStage() {
    return {
        id: 'stage_' + Math.random().toString(16).slice(2, 10),
        name: '',
        approver_type: 'primary',
        primary_email: '',
        fallback_email: '',
        fallback_reason: '',
        approval_mode: 'any_one'
    };
}

function approvalWorkflowApproverOptions(selected) {
    const raw = String(selected || 'primary').trim().toLowerCase() || 'primary';
    const aliases = {
        manager: 'primary',
        secops_lead: 'security_lead',
        db_owner: 'security_lead',
        ciso: 'security_lead',
        self_approval: 'self',
        requester: 'self',
        requestor: 'self'
    };
    const value = aliases[raw] || raw;
    const options = [
        ['self', 'Self approval'],
        ['primary', 'Primary approver'],
        ['secondary', 'Secondary approver'],
        ['db_owner', 'DB owner'],
        ['security_lead', 'Security lead'],
        ['approver', 'Specific approver email']
    ];
    return options.map(function(entry) {
        const optionValue = entry[0];
        const optionLabel = entry[1];
        return `<option value="${escapeHtml(optionValue)}" ${value === optionValue ? 'selected' : ''}>${escapeHtml(optionLabel)}</option>`;
    }).join('');
}

function emptyWorkflowRecord() {
    return {
        id: '',
        name: '',
        description: '',
        service_type: 'database',
        enabled: true,
        priority: 100,
        linked_role_ids: [],
        conditions: {
            account_ids: [],
            environments: [],
            data_classifications: [],
            access_levels: [],
            pii_only: false,
            non_pii_only: false
        },
        approver_contacts: {
            primary: '',
            secondary: '',
            security_lead: ''
        },
        stages: [emptyWorkflowStage()]
    };
}

function workflowRecordById(id) {
    const target = String(id || '').trim();
    return approvalWorkflowRecords.find(function(item) {
        return String(item.id || '').trim() === target;
    }) || null;
}

function approvalWorkflowConditionChips(record) {
    const conditions = record && record.conditions ? record.conditions : {};
    const chips = [];
    if ((conditions.environments || []).length) chips.push('Env: ' + conditions.environments.join(', '));
    if ((conditions.account_ids || []).length) chips.push('Accounts: ' + conditions.account_ids.length);
    if ((conditions.data_classifications || []).length) chips.push('Classification: ' + conditions.data_classifications.join(', '));
    if ((conditions.access_levels || []).length) chips.push('Access: ' + conditions.access_levels.join(', '));
    if ((record.linked_role_ids || []).length) chips.push('Roles: ' + approvalWorkflowRoleNames(record.linked_role_ids).join(', '));
    if (conditions.pii_only) chips.push('PII only');
    if (conditions.non_pii_only) chips.push('Non-PII only');
    if (record && record.pending_request_expiry_hours) chips.push('Expiry: ' + String(record.pending_request_expiry_hours) + 'h');
    return chips.length ? chips : ['Applies broadly'];
}

function approvalWorkflowAvailableAccounts() {
    const rows = (typeof accounts !== 'undefined' && accounts && typeof accounts === 'object')
        ? Object.values(accounts)
        : [];
    return rows
        .filter(function(item) {
            return item && String(item.id || '').trim();
        })
        .sort(function(a, b) {
            const nameA = String(a.name || a.id || '').toLowerCase();
            const nameB = String(b.name || b.id || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
}

function approvalWorkflowAvailableIamRoles() {
    const roles = Array.isArray(window.IAM_ROLE_TEMPLATES) && window.IAM_ROLE_TEMPLATES.length
        ? window.IAM_ROLE_TEMPLATES
        : approvalWorkflowIamRoles;
    return (roles || []).slice().sort(function(a, b) {
        const systemA = a && a.system_default ? 0 : 1;
        const systemB = b && b.system_default ? 0 : 1;
        if (systemA !== systemB) return systemA - systemB;
        return String(a?.name || a?.id || '').localeCompare(String(b?.name || b?.id || ''));
    });
}

function approvalWorkflowRoleNames(roleIds) {
    const byId = new Map(approvalWorkflowAvailableIamRoles().map(function(role) {
        return [String(role.id || '').trim(), String(role.name || role.id || '').trim()];
    }));
    return (roleIds || []).map(function(roleId) {
        const id = String(roleId || '').trim();
        return byId.get(id) || id;
    }).filter(Boolean);
}

async function loadApprovalWorkflowIamRoles(force) {
    if (!force && approvalWorkflowRoleLoadPromise) return approvalWorkflowRoleLoadPromise;
    if (!force && approvalWorkflowIamRoles.length) return approvalWorkflowIamRoles;
    approvalWorkflowRoleLoadPromise = fetch(getApprovalWorkflowApiBase() + '/admin/iam-roles', {
        credentials: 'include',
        headers: approvalWorkflowJsonHeaders()
    }).then(function(response) {
        return response.json().catch(function() { return {}; }).then(function(data) {
            if (!response.ok) throw new Error(data.error || 'Failed to load IAM roles.');
            const roles = Array.isArray(data.roles) ? data.roles : (Array.isArray(data.data?.roles) ? data.data.roles : []);
            approvalWorkflowIamRoles = roles;
            renderApprovalWorkflowLinkedRoleSelector(selectedApprovalWorkflowLinkedRoleIds());
            renderApprovalWorkflowList();
            return roles;
        });
    }).catch(function() {
        approvalWorkflowIamRoles = [];
        renderApprovalWorkflowLinkedRoleSelector(selectedApprovalWorkflowLinkedRoleIds());
        renderApprovalWorkflowList();
        return [];
    }).finally(function() {
        approvalWorkflowRoleLoadPromise = null;
    });
    return approvalWorkflowRoleLoadPromise;
}

function renderApprovalWorkflowAccountSelector(selectedIds) {
    const mount = document.getElementById('approvalWorkflowAccountsSelector');
    if (!mount) return;
    const selected = new Set((selectedIds || []).map(function(item) { return String(item || '').trim(); }).filter(Boolean));
    const accountRows = approvalWorkflowAvailableAccounts();
    if (!accountRows.length) {
        mount.innerHTML = `
            <div style="padding: 12px; border: 1px dashed var(--border-color); border-radius: 12px; color: var(--text-secondary);">
                No synced accounts available yet. Sync AWS accounts first, then come back to map workflows by account.
            </div>
        `;
        return;
    }
    mount.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:10px;">
            <div style="color: var(--text-secondary); font-size: 12px;">Optional. Leave all unchecked to match every integrated account.</div>
            <button class="btn-secondary btn-sm" type="button" onclick="clearApprovalWorkflowAccountSelection()">Clear</button>
        </div>
        <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px;">
            ${accountRows.map(function(account) {
                const accountId = String(account.id || '').trim();
                const accountName = String(account.name || accountId).trim();
                return `
                    <label style="display:flex; gap:10px; align-items:flex-start; border:1px solid var(--border-color); border-radius:12px; padding:10px 12px; background:var(--bg-primary);">
                        <input type="checkbox" data-workflow-account-id="${escapeHtml(accountId)}" ${selected.has(accountId) ? 'checked' : ''}>
                        <span style="display:flex; flex-direction:column;">
                            <strong>${escapeHtml(accountName)}</strong>
                            <small style="color:var(--text-secondary);">${escapeHtml(accountId)}</small>
                        </span>
                    </label>
                `;
            }).join('')}
        </div>
    `;
}

function renderApprovalWorkflowLinkedRoleSelector(selectedIds) {
    const mount = document.getElementById('approvalWorkflowLinkedRolesSelector');
    const section = document.getElementById('approvalWorkflowLinkedRolesSection');
    const serviceType = String(document.getElementById('approvalWorkflowServiceType')?.value || 'database').trim().toLowerCase();
    if (section) section.style.display = serviceType === 'database' ? '' : 'none';
    if (!mount || serviceType !== 'database') return;
    const selected = new Set((selectedIds || []).map(function(item) { return String(item || '').trim(); }).filter(Boolean));
    const roles = approvalWorkflowAvailableIamRoles();
    if (!roles.length) {
        mount.innerHTML = '<div style="padding: 12px; border: 1px dashed var(--border-color); border-radius: 12px; color: var(--text-secondary);">No IAM access roles found yet. Create IAM roles first, then link workflows to them here.</div>';
        return;
    }
    mount.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px;">
            ${roles.map(function(role) {
                const roleId = String(role.id || '').trim();
                const roleType = String(role.request_role || '').trim().toLowerCase();
                const typeLabel = ({
                    read_only: 'Read Only',
                    read_limited_write: 'Limited Write',
                    admin: 'Full Admin'
                })[roleType] || 'Custom';
                return `
                    <label style="display:flex; gap:10px; align-items:flex-start; border:1px solid var(--border-color); border-radius:12px; padding:10px 12px; background:var(--bg-primary);">
                        <input type="checkbox" data-workflow-role-id="${escapeHtml(roleId)}" ${selected.has(roleId) ? 'checked' : ''}>
                        <span style="display:flex; flex-direction:column;">
                            <strong>${escapeHtml(role.name || roleId)}</strong>
                            <small style="color:var(--text-secondary);">${escapeHtml(typeLabel)}${role.system_default ? ' · System default' : ''}</small>
                        </span>
                    </label>
                `;
            }).join('')}
        </div>
    `;
}

function selectedApprovalWorkflowAccountIds() {
    return Array.from(document.querySelectorAll('#approvalWorkflowAccountsSelector input[data-workflow-account-id]:checked'))
        .map(function(el) { return String(el.getAttribute('data-workflow-account-id') || '').trim(); })
        .filter(Boolean);
}

function selectedApprovalWorkflowLinkedRoleIds() {
    return Array.from(document.querySelectorAll('#approvalWorkflowLinkedRolesSelector input[data-workflow-role-id]:checked'))
        .map(function(el) { return String(el.getAttribute('data-workflow-role-id') || '').trim(); })
        .filter(Boolean);
}

function clearApprovalWorkflowAccountSelection() {
    document.querySelectorAll('#approvalWorkflowAccountsSelector input[data-workflow-account-id]').forEach(function(el) {
        el.checked = false;
    });
}

function setApprovalWorkflowStatus(message, variant) {
    const el = document.getElementById('approvalWorkflowStatus');
    if (!el) return;
    const text = String(message || '').trim();
    if (!text) {
        el.style.display = 'none';
        el.textContent = '';
        return;
    }
    el.style.display = 'block';
    el.textContent = text;
    if (variant === 'error') {
        el.style.background = 'rgba(220, 38, 38, 0.12)';
        el.style.color = '#b91c1c';
        el.style.border = '1px solid rgba(220, 38, 38, 0.25)';
    } else {
        el.style.background = 'rgba(16, 185, 129, 0.12)';
        el.style.color = '#047857';
        el.style.border = '1px solid rgba(16, 185, 129, 0.25)';
    }
}

function approvalWorkflowEditorTemplate() {
    return `
        <div id="approvalWorkflowBuilderCard" style="display:none; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 16px; padding: 18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                <div>
                    <h3 id="approvalWorkflowEditorTitle" style="margin:0; font-size: 18px;">Create Workflow</h3>
                    <div style="margin-top:4px; font-size:12px; color: var(--text-secondary);">Create or edit workflows without cluttering the main page.</div>
                </div>
                <span style="font-size: 12px; color: var(--text-secondary);">Self approval can only be used for read-only database workflows.</span>
            </div>
            <div id="approvalWorkflowStatus" style="display:none; margin-bottom: 12px; padding: 10px 12px; border-radius: 12px;"></div>
            <form id="approvalWorkflowForm" style="display:grid; gap: 16px;">
                <div style="display:grid; grid-template-columns: 1.2fr 0.8fr 0.6fr; gap: 12px;">
                    <div>
                        <label style="display:block; margin-bottom: 6px;">Workflow Name</label>
                        <input id="approvalWorkflowName" type="text" class="form-input" placeholder="Database Security Approval">
                    </div>
                    <div>
                        <label style="display:block; margin-bottom: 6px;">Service Type</label>
                        <select id="approvalWorkflowServiceType" class="form-input">
                            <option value="database">Database</option>
                            <option value="cloud">Cloud</option>
                            <option value="s3">S3</option>
                            <option value="instances">Instances</option>
                            <option value="storage">Storage</option>
                            <option value="workloads">Workloads</option>
                        </select>
                    </div>
                    <div>
                        <label style="display:block; margin-bottom: 6px;">Priority</label>
                        <input id="approvalWorkflowPriority" type="number" class="form-input" min="1" max="9999" value="100">
                    </div>
                </div>
                <div>
                    <label style="display:block; margin-bottom: 6px;">Description</label>
                    <textarea id="approvalWorkflowDescription" class="form-input" rows="2" placeholder="Used for database access requests that require security approval."></textarea>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                    <div>
                        <label style="display:block; margin-bottom: 6px;">Primary Approver Email</label>
                        <input id="approvalWorkflowPrimaryEmail" type="email" class="form-input" placeholder="manager@company.com" oninput="refreshAllApprovalWorkflowStageCards()">
                        <div style="margin-top:6px; color: var(--text-secondary); font-size: 12px;">For database workflows, leave blank if the requester RM should be supplied at request time.</div>
                    </div>
                    <div>
                        <label style="display:block; margin-bottom: 6px;">Secondary Approver Override</label>
                        <input id="approvalWorkflowSecondaryEmail" type="email" class="form-input" placeholder="secondary@company.com" oninput="refreshAllApprovalWorkflowStageCards()">
                        <div style="margin-top:6px; color: var(--text-secondary); font-size: 12px;">Optional. Leave blank to use the Default Approvers tab for DevOps lead.</div>
                    </div>
                    <div>
                        <label style="display:block; margin-bottom: 6px;">Security Lead Override</label>
                        <input id="approvalWorkflowSecurityLeadEmail" type="email" class="form-input" placeholder="securitylead@company.com" oninput="refreshAllApprovalWorkflowStageCards()">
                        <div style="margin-top:6px; color: var(--text-secondary); font-size: 12px;">Optional. Leave blank to use the Default Approvers tab for SecOps lead.</div>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div style="display:flex; gap: 12px; align-items:center; flex-wrap: wrap;">
                        <label style="display:flex; align-items:center; gap:8px;">
                            <input id="approvalWorkflowEnabled" type="checkbox" checked>
                            <span>Workflow Active</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px;">
                            <input id="approvalWorkflowPiiOnly" type="checkbox">
                            <span>PII only</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px;">
                            <input id="approvalWorkflowNonPiiOnly" type="checkbox">
                            <span>Non-PII only</span>
                        </label>
                    </div>
                    <div>
                        <label style="display:block; margin-bottom: 6px;">Pending Request Expiry (hours)</label>
                        <input id="approvalWorkflowPendingExpiryHours" type="number" class="form-input" min="1" max="168" value="12">
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label style="display:block; margin-bottom: 6px;">Accounts</label>
                        <div id="approvalWorkflowAccountsSelector"></div>
                    </div>
                    <div>
                        <label style="display:block; margin-bottom: 6px;">Data Classifications</label>
                        <textarea id="approvalWorkflowClassifications" class="form-input" rows="2" placeholder="Comma-separated, e.g. pii, confidential"></textarea>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label style="display:block; margin-bottom: 8px;">Environments</label>
                        <div style="display:flex; gap: 12px; flex-wrap: wrap;">
                            <label><input type="checkbox" name="approvalWorkflowEnv" value="prod"> Prod</label>
                            <label><input type="checkbox" name="approvalWorkflowEnv" value="nonprod"> NonProd</label>
                            <label><input type="checkbox" name="approvalWorkflowEnv" value="sandbox"> Sandbox</label>
                        </div>
                    </div>
                    <div>
                        <label style="display:block; margin-bottom: 8px;">Access Levels</label>
                        <div style="display:flex; gap: 12px; flex-wrap: wrap;">
                            <label><input type="checkbox" name="approvalWorkflowAccessLevel" value="read_only"> Read Only</label>
                            <label><input type="checkbox" name="approvalWorkflowAccessLevel" value="read_limited_write"> Limited Write</label>
                            <label><input type="checkbox" name="approvalWorkflowAccessLevel" value="read_full_write"> Full Write</label>
                            <label><input type="checkbox" name="approvalWorkflowAccessLevel" value="admin"> Admin</label>
                        </div>
                        <div style="margin-top:6px; color: var(--text-secondary); font-size: 12px;">These access levels are what the request engine uses during preview and request submission.</div>
                    </div>
                </div>
                <div id="approvalWorkflowLinkedRolesSection">
                    <label style="display:block; margin-bottom: 8px;">Linked IAM Roles</label>
                    <div id="approvalWorkflowLinkedRolesSelector"></div>
                    <div style="margin-top:6px; color: var(--text-secondary); font-size: 12px;">Optional but recommended. Linking the workflow to IAM roles keeps the role picker, workflow preview, and request creation aligned.</div>
                </div>
                <div style="border-top: 1px solid var(--border-color); padding-top: 14px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
                        <h4 style="margin:0;">Approval Stages</h4>
                        <button class="btn-secondary btn-sm" type="button" onclick="addApprovalWorkflowStage()">
                            <i class="fas fa-plus"></i> Add Stage
                        </button>
                    </div>
                    <div id="approvalWorkflowStages" style="display:grid; gap: 12px;"></div>
                </div>
                <div style="display:flex; gap: 12px; justify-content:flex-end; border-top: 1px solid var(--border-color); padding-top: 14px;">
                    <button class="btn-secondary" type="button" onclick="resetApprovalWorkflowForm()">Reset</button>
                    <button class="btn-primary" type="submit">Save Workflow</button>
                </div>
            </form>
        </div>
    `;
}

function approvalWorkflowDefaultApproversTemplate() {
    return `
        <section id="approvalWorkflowDefaultApproversSection" style="display:none; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 16px; padding: 18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom: 12px;">
                <div>
                    <h3 style="margin:0; font-size: 18px;">Default Approvers</h3>
                    <p style="margin:6px 0 0 0; color: var(--text-secondary); font-size: 13px;">These emails are reused automatically when a workflow stage is set to DevOps Lead, DB Owner, or Security Lead.</p>
                </div>
                <button class="btn-secondary" type="button" onclick="loadApprovalWorkflowDefaultApprovers(true)">
                    <i class="fas fa-rotate"></i> Refresh
                </button>
            </div>
            <div id="approvalWorkflowDefaultApproversStatus" class="profile-status" hidden></div>
            <form id="approvalWorkflowDefaultApproversForm" style="display:grid; gap:16px;">
                <div style="display:grid; grid-template-columns:repeat(3, minmax(220px, 1fr)); gap:12px;">
                    <div class="integration-card" style="padding:16px; text-align:left;">
                        <h4 style="margin:0 0 8px 0;">DevOps Lead</h4>
                        <p style="margin:0 0 10px 0; color:var(--text-secondary); font-size:12px;">Used by non-production write/admin workflows and any custom workflow stage marked Secondary Approver.</p>
                        <input id="approvalWorkflowDefaultSecondaryEmail" type="email" class="form-input" placeholder="devops.lead@nykaa.com">
                    </div>
                    <div class="integration-card" style="padding:16px; text-align:left;">
                        <h4 style="margin:0 0 8px 0;">DB Owner</h4>
                        <p style="margin:0 0 10px 0; color:var(--text-secondary); font-size:12px;">Used by workflow stages that explicitly require DB owner approval.</p>
                        <input id="approvalWorkflowDefaultDbOwnerEmail" type="email" class="form-input" placeholder="db.owner@nykaa.com">
                    </div>
                    <div class="integration-card" style="padding:16px; text-align:left;">
                        <h4 style="margin:0 0 8px 0;">SecOps Lead</h4>
                        <p style="margin:0 0 10px 0; color:var(--text-secondary); font-size:12px;">Used by production sensitive and limited-write workflows that require security approval.</p>
                        <input id="approvalWorkflowDefaultSecurityLeadEmail" type="email" class="form-input" placeholder="secops.lead@nykaa.com">
                    </div>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:12px;">
                    <button class="btn-secondary" type="button" onclick="loadApprovalWorkflowDefaultApprovers(true)">Reset</button>
                    <button class="btn-primary" type="submit">Save Default Approvers</button>
                </div>
            </form>
        </section>
    `;
}

function renderApprovalWorkflowManager() {
    const mount = getApprovalWorkflowMount();
    if (!mount) return;
    mount.innerHTML = `
        <div class="page-header" style="margin-bottom: 20px;">
            <h2><i class="fas fa-project-diagram"></i> Approval Workflows</h2>
            <div class="page-header-actions">
                <button class="btn-secondary" type="button" onclick="refreshApprovalWorkflowManager()">
                    <i class="fas fa-rotate"></i> Refresh
                </button>
                <button class="btn-primary" id="approvalWorkflowCreateBtn" type="button" onclick="startNewApprovalWorkflow()">
                    <i class="fas fa-plus"></i> Create Workflow
                </button>
            </div>
        </div>
        <div class="admin-subtabs" style="margin-bottom: 16px;">
            <button type="button" class="btn-secondary btn-pam admin-subtab active" id="approvalWorkflowManagerTabWorkflows" onclick="showApprovalWorkflowManagerTab('workflows')">
                <i class="fas fa-list-check"></i> Workflows
            </button>
            <button type="button" class="btn-secondary btn-pam admin-subtab" id="approvalWorkflowManagerTabDefaults" onclick="showApprovalWorkflowManagerTab('defaultApprovers')">
                <i class="fas fa-user-gear"></i> Default Approvers
            </button>
        </div>
        <section id="approvalWorkflowListSection" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 16px; padding: 18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                <div>
                    <h3 style="margin:0; font-size: 18px;">Configured Workflows</h3>
                    <p style="margin:6px 0 0 0; color: var(--text-secondary); font-size: 13px;">Approval routing is evaluated server-side during workflow preview and final request submission.</p>
                </div>
                <span id="approvalWorkflowCount" style="color: var(--text-secondary); font-size: 13px;"></span>
            </div>
            <div id="approvalWorkflowList" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap: 12px;"></div>
        </section>
        ${approvalWorkflowDefaultApproversTemplate()}
        ${approvalWorkflowEditorTemplate()}
    `;

    const form = document.getElementById('approvalWorkflowForm');
    if (form && !form.__approvalWorkflowBound) {
        form.addEventListener('submit', function(evt) {
            evt.preventDefault();
            saveApprovalWorkflowFromForm();
        });
        form.__approvalWorkflowBound = true;
    }
    const serviceType = document.getElementById('approvalWorkflowServiceType');
    if (serviceType && !serviceType.__approvalWorkflowBound) {
        serviceType.addEventListener('change', onApprovalWorkflowServiceTypeChange);
        serviceType.__approvalWorkflowBound = true;
    }
    const defaultApproverForm = document.getElementById('approvalWorkflowDefaultApproversForm');
    if (defaultApproverForm && !defaultApproverForm.__approvalWorkflowDefaultsBound) {
        defaultApproverForm.addEventListener('submit', function(evt) {
            evt.preventDefault();
            saveApprovalWorkflowDefaultApprovers();
        });
        defaultApproverForm.__approvalWorkflowDefaultsBound = true;
    }
    renderApprovalWorkflowStages([emptyWorkflowStage()]);
    renderApprovalWorkflowAccountSelector([]);
    renderApprovalWorkflowLinkedRoleSelector([]);
    applyApprovalWorkflowDefaultApproverForm();
    showApprovalWorkflowManagerTab(approvalWorkflowManagerTab || 'workflows');
}

function showApprovalWorkflowManagerTab(tab) {
    approvalWorkflowManagerTab = String(tab || 'workflows').trim() === 'defaultApprovers' ? 'defaultApprovers' : 'workflows';
    const workflowsBtn = document.getElementById('approvalWorkflowManagerTabWorkflows');
    const defaultsBtn = document.getElementById('approvalWorkflowManagerTabDefaults');
    const workflowListSection = document.getElementById('approvalWorkflowListSection');
    const defaultApproversSection = document.getElementById('approvalWorkflowDefaultApproversSection');
    const createBtn = document.getElementById('approvalWorkflowCreateBtn');
    if (workflowsBtn) workflowsBtn.classList.toggle('active', approvalWorkflowManagerTab === 'workflows');
    if (defaultsBtn) defaultsBtn.classList.toggle('active', approvalWorkflowManagerTab === 'defaultApprovers');
    if (workflowListSection) workflowListSection.style.display = approvalWorkflowManagerTab === 'workflows' ? '' : 'none';
    if (defaultApproversSection) defaultApproversSection.style.display = approvalWorkflowManagerTab === 'defaultApprovers' ? '' : 'none';
    if (createBtn) createBtn.style.display = approvalWorkflowManagerTab === 'workflows' ? '' : 'none';
}

function applyApprovalWorkflowDefaultApproverForm() {
    const contacts = approvalWorkflowDefaultApprovers || {};
    const setValue = function(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    };
    setValue('approvalWorkflowDefaultSecondaryEmail', contacts.secondary || '');
    setValue('approvalWorkflowDefaultDbOwnerEmail', contacts.db_owner || '');
    setValue('approvalWorkflowDefaultSecurityLeadEmail', contacts.security_lead || '');
}

function setApprovalWorkflowDefaultApproversStatus(message, variant) {
    if (typeof setInlineStatus === 'function') {
        setInlineStatus('approvalWorkflowDefaultApproversStatus', message, variant || 'info');
    }
}

async function loadApprovalWorkflowDefaultApprovers(force) {
    try {
        const response = await fetch(getApprovalWorkflowApiBase() + '/admin/approval-workflow-default-approvers', {
            method: 'GET',
            headers: approvalWorkflowJsonHeaders(),
            credentials: 'include'
        });
        const data = await response.json().catch(function() { return {}; });
        if (!response.ok) throw new Error(data.error || 'Failed to load default approvers.');
        approvalWorkflowDefaultApprovers = Object.assign({ secondary: '', db_owner: '', security_lead: '' }, data.approver_contacts || {});
        applyApprovalWorkflowDefaultApproverForm();
        refreshAllApprovalWorkflowStageCards();
        if (force) setApprovalWorkflowDefaultApproversStatus('Default approvers refreshed.', 'success');
    } catch (error) {
        if (force) setApprovalWorkflowDefaultApproversStatus(error.message || 'Failed to load default approvers.', 'error');
    }
}

async function saveApprovalWorkflowDefaultApprovers() {
    const payload = {
        secondary: String(document.getElementById('approvalWorkflowDefaultSecondaryEmail')?.value || '').trim(),
        db_owner: String(document.getElementById('approvalWorkflowDefaultDbOwnerEmail')?.value || '').trim(),
        security_lead: String(document.getElementById('approvalWorkflowDefaultSecurityLeadEmail')?.value || '').trim()
    };
    try {
        const response = await fetch(getApprovalWorkflowApiBase() + '/admin/approval-workflow-default-approvers', {
            method: 'POST',
            headers: approvalWorkflowJsonHeaders(),
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(function() { return {}; });
        if (!response.ok) throw new Error(data.error || 'Failed to save default approvers.');
        approvalWorkflowDefaultApprovers = Object.assign({ secondary: '', db_owner: '', security_lead: '' }, data.approver_contacts || {});
        applyApprovalWorkflowDefaultApproverForm();
        refreshAllApprovalWorkflowStageCards();
        setApprovalWorkflowDefaultApproversStatus('Default approvers saved successfully.', 'success');
        await loadApprovalWorkflows();
        if (typeof notifyApp === 'function') notifyApp('Default approvers saved successfully.', 'success');
    } catch (error) {
        setApprovalWorkflowDefaultApproversStatus(error.message || 'Failed to save default approvers.', 'error');
    }
}

function renderApprovalWorkflowList() {
    const count = document.getElementById('approvalWorkflowCount');
    const list = document.getElementById('approvalWorkflowList');
    if (!list) return;
    if (count) count.textContent = `${approvalWorkflowRecords.length} workflow${approvalWorkflowRecords.length === 1 ? '' : 's'}`;
    if (!approvalWorkflowRecords.length) {
        list.innerHTML = '<div style="padding: 18px; border: 1px dashed var(--border-color); border-radius: 14px; color: var(--text-secondary);">No approval workflows saved yet. Create one to enforce request approvals.</div>';
        return;
    }
    list.innerHTML = approvalWorkflowRecords.map(function(record) {
        const chips = approvalWorkflowConditionChips(record).map(function(label) {
            return `<span style="display:inline-flex; padding:4px 8px; border-radius:999px; background:var(--bg-tertiary); color:var(--text-secondary); font-size:12px;">${escapeHtml(label)}</span>`;
        }).join('');
        const stageCount = Array.isArray(record.stages) ? record.stages.length : 0;
        const systemDefault = String(record.id || '').indexOf('sys_') === 0;
        return `
            <div style="border: 1px solid var(--border-color); border-radius: 14px; padding: 14px; background: ${record.enabled ? 'var(--bg-primary)' : 'var(--bg-tertiary)'};">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: 12px;">
                    <div style="min-width:0;">
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                            <strong>${escapeHtml(record.name || 'Unnamed Workflow')}</strong>
                            <span style="display:inline-flex; padding:4px 8px; border-radius:999px; background:${record.enabled ? 'rgba(16, 185, 129, 0.12)' : 'rgba(107, 114, 128, 0.16)'}; color:${record.enabled ? '#047857' : 'var(--text-secondary)'}; font-size:12px;">${record.enabled ? 'Active' : 'Inactive'}</span>
                            <span style="display:inline-flex; padding:4px 8px; border-radius:999px; background:rgba(99, 102, 241, 0.12); color:#4338ca; font-size:12px;">${escapeHtml(record.service_type || '')}</span>
                            ${systemDefault ? '<span style="display:inline-flex; padding:4px 8px; border-radius:999px; background:rgba(245, 158, 11, 0.14); color:#b45309; font-size:12px;">System default</span>' : ''}
                        </div>
                        <div style="margin-top: 8px; color: var(--text-secondary); font-size: 13px;">${escapeHtml(record.description || 'No description')}</div>
                        <div style="margin-top: 10px; display:flex; flex-wrap:wrap; gap:8px;">${chips}</div>
                        <div style="margin-top: 10px; color: var(--text-secondary); font-size: 12px;">Stages: ${stageCount} | Priority: ${record.priority || 100}</div>
                    </div>
                    <div style="display:flex; gap:8px; flex-shrink:0;">
                        <button class="btn-secondary btn-sm" type="button" onclick="editApprovalWorkflow('${escapeHtml(record.id || '')}')">
                            <i class="fas fa-pen"></i> Edit
                        </button>
                        <button class="btn-secondary btn-sm" type="button" onclick="deleteApprovalWorkflowRecord('${escapeHtml(record.id || '')}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderApprovalWorkflowStages(stages) {
    const mount = document.getElementById('approvalWorkflowStages');
    if (!mount) return;
    const rows = Array.isArray(stages) && stages.length ? stages : [emptyWorkflowStage()];
    mount.innerHTML = rows.map(function(stage, index) {
        const stageId = String(stage.id || '');
        return `
            <div class="approval-stage-card" data-stage-index="${index}" data-stage-id="${escapeHtml(stageId)}" style="border:1px solid var(--border-color); border-radius:14px; padding:14px; background:var(--bg-primary); display:grid; gap:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong>Stage ${index + 1}</strong>
                    <button class="btn-secondary btn-sm" type="button" onclick="removeApprovalWorkflowStage('${escapeHtml(stageId)}')" ${rows.length <= 1 ? 'disabled' : ''}>
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 0.8fr 0.6fr; gap:12px;">
                    <div>
                        <label style="display:block; margin-bottom:6px;">Stage Name</label>
                        <input type="text" class="form-input" data-stage-field="name" value="${escapeHtml(stage.name || '')}" placeholder="Security Approval">
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:6px;">Approver Type</label>
                        <select class="form-input" data-stage-field="approver_type" onchange="refreshApprovalWorkflowStageCard(this.closest('.approval-stage-card'))">
                            ${approvalWorkflowApproverOptions(stage.approver_type || 'primary')}
                        </select>
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:6px;">Mode</label>
                        <select class="form-input" data-stage-field="approval_mode">
                            <option value="any_one" ${String(stage.approval_mode || 'any_one') === 'any_one' ? 'selected' : ''}>Any one</option>
                        </select>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                    <div>
                        <label style="display:block; margin-bottom:6px;" data-stage-primary-label>Primary Approver Email</label>
                        <input type="text" class="form-input" data-stage-field="primary_email" value="${escapeHtml(stage.primary_email || '')}" placeholder="primary@company.com">
                        <div data-stage-primary-help style="margin-top:6px; color: var(--text-secondary); font-size: 12px;"></div>
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:6px;">Fallback Approver Email</label>
                        <input type="email" class="form-input" data-stage-field="fallback_email" value="${escapeHtml(stage.fallback_email || '')}" placeholder="optional@company.com">
                    </div>
                </div>
                <div>
                    <label style="display:block; margin-bottom:6px;">Fallback Reason</label>
                    <textarea class="form-input" rows="2" data-stage-field="fallback_reason" placeholder="Why fallback approver exists or why primary cannot be the only approver.">${escapeHtml(stage.fallback_reason || '')}</textarea>
                </div>
                <input type="hidden" data-stage-field="id" value="${escapeHtml(stageId)}">
            </div>
        `;
    }).join('');
    mount.querySelectorAll('.approval-stage-card').forEach(function(card) {
        refreshApprovalWorkflowStageCard(card);
    });
}

function refreshApprovalWorkflowStageCard(card) {
    if (!card) return;
    const approverType = String(card.querySelector('[data-stage-field="approver_type"]')?.value || '').trim().toLowerCase();
    const primaryInput = card.querySelector('[data-stage-field="primary_email"]');
    const primaryLabel = card.querySelector('[data-stage-primary-label]');
    const primaryHelp = card.querySelector('[data-stage-primary-help]');
    const isSelfApproval = approverType === 'self' || approverType === 'self_approval' || approverType === 'requester' || approverType === 'requestor';
    const isPrimaryAlias = approverType === 'primary' || approverType === 'manager';
    const isSecondaryAlias = approverType === 'secondary';
    const isDbOwnerAlias = approverType === 'db_owner';
    const isSecurityAlias = approverType === 'security_lead' || approverType === 'secops_lead' || approverType === 'ciso';
    const serviceType = String(document.getElementById('approvalWorkflowServiceType')?.value || '').trim().toLowerCase();
    const requesterSuppliedPrimary = serviceType === 'database' && isPrimaryAlias && !String(document.getElementById('approvalWorkflowPrimaryEmail')?.value || '').trim();
    if (primaryInput) {
        if (isSelfApproval) {
            primaryInput.value = 'self';
            primaryInput.readOnly = true;
            primaryInput.placeholder = 'self';
        } else if (isPrimaryAlias || isSecondaryAlias || isDbOwnerAlias || isSecurityAlias) {
            const resolvedEmail = isPrimaryAlias
                ? String(document.getElementById('approvalWorkflowPrimaryEmail')?.value || '').trim()
                : isSecondaryAlias
                    ? (String(document.getElementById('approvalWorkflowSecondaryEmail')?.value || '').trim()
                        || String((approvalWorkflowDefaultApprovers && approvalWorkflowDefaultApprovers.secondary) || '').trim())
                    : isDbOwnerAlias
                        ? String((approvalWorkflowDefaultApprovers && approvalWorkflowDefaultApprovers.db_owner) || '').trim()
                    : (String(document.getElementById('approvalWorkflowSecurityLeadEmail')?.value || '').trim()
                        || String((approvalWorkflowDefaultApprovers && approvalWorkflowDefaultApprovers.security_lead) || '').trim());
            primaryInput.value = requesterSuppliedPrimary ? '' : resolvedEmail;
            primaryInput.readOnly = true;
            primaryInput.placeholder = requesterSuppliedPrimary
                ? 'Requester enters approver email at request time'
                : isPrimaryAlias
                    ? 'Uses workflow primary approver email'
                    : isSecondaryAlias
                        ? 'Uses workflow override or default DevOps lead'
                        : isDbOwnerAlias
                            ? 'Uses default DB owner email'
                            : 'Uses workflow override or default security lead';
        } else {
            if (String(primaryInput.value || '').trim().toLowerCase() === 'self') primaryInput.value = '';
            primaryInput.readOnly = false;
            primaryInput.placeholder = 'primary@company.com';
        }
    }
    if (primaryLabel) {
        primaryLabel.textContent = (isSelfApproval || isPrimaryAlias || isSecondaryAlias || isSecurityAlias)
            ? 'Resolved Approver'
            : 'Primary Approver Email';
    }
    if (primaryHelp) {
        primaryHelp.textContent = isSelfApproval
            ? 'Requester will approve this stage. No separate approver email is required.'
            : isPrimaryAlias
                ? (requesterSuppliedPrimary
                    ? 'Requester enters the approver email during request submission. No permanent workflow email is required for this stage.'
                    : 'This stage uses the workflow-level Primary approver email.')
                : isSecondaryAlias
                    ? 'This stage uses the workflow-level Secondary approver override or the Default Approvers tab.'
                    : isDbOwnerAlias
                        ? 'This stage uses the DB owner email from the Default Approvers tab.'
                    : isSecurityAlias
                        ? 'This stage uses the workflow-level Security Lead override or the Default Approvers tab.'
                        : 'Use a real approver email for this stage.';
    }
}

function refreshAllApprovalWorkflowStageCards() {
    document.querySelectorAll('.approval-stage-card').forEach(function(card) {
        refreshApprovalWorkflowStageCard(card);
    });
}

function onApprovalWorkflowServiceTypeChange() {
    renderApprovalWorkflowLinkedRoleSelector(selectedApprovalWorkflowLinkedRoleIds());
    refreshAllApprovalWorkflowStageCards();
}

function readApprovalWorkflowForm() {
    const serviceType = String(document.getElementById('approvalWorkflowServiceType')?.value || '').trim();
    const record = {
        id: approvalWorkflowEditingId || '',
        name: String(document.getElementById('approvalWorkflowName')?.value || '').trim(),
        description: String(document.getElementById('approvalWorkflowDescription')?.value || '').trim(),
        service_type: serviceType,
        enabled: !!document.getElementById('approvalWorkflowEnabled')?.checked,
        priority: Number(document.getElementById('approvalWorkflowPriority')?.value || 100) || 100,
        pending_request_expiry_hours: Number(document.getElementById('approvalWorkflowPendingExpiryHours')?.value || 12) || 12,
        linked_role_ids: serviceType === 'database' ? selectedApprovalWorkflowLinkedRoleIds() : [],
        conditions: {
            account_ids: selectedApprovalWorkflowAccountIds(),
            environments: Array.from(document.querySelectorAll('input[name="approvalWorkflowEnv"]:checked')).map(function(item) { return item.value; }),
            data_classifications: String(document.getElementById('approvalWorkflowClassifications')?.value || '').split(',').map(function(item) { return item.trim(); }).filter(Boolean),
            access_levels: Array.from(document.querySelectorAll('input[name="approvalWorkflowAccessLevel"]:checked')).map(function(item) { return item.value; }),
            pii_only: !!document.getElementById('approvalWorkflowPiiOnly')?.checked,
            non_pii_only: !!document.getElementById('approvalWorkflowNonPiiOnly')?.checked
        },
        approver_contacts: {
            primary: String(document.getElementById('approvalWorkflowPrimaryEmail')?.value || '').trim(),
            secondary: String(document.getElementById('approvalWorkflowSecondaryEmail')?.value || '').trim(),
            security_lead: String(document.getElementById('approvalWorkflowSecurityLeadEmail')?.value || '').trim()
        },
        stages: []
    };

    document.querySelectorAll('.approval-stage-card').forEach(function(card) {
        const stage = emptyWorkflowStage();
        card.querySelectorAll('[data-stage-field]').forEach(function(field) {
            stage[field.getAttribute('data-stage-field')] = String(field.value || '').trim();
        });
        if (String(stage.approver_type || '').trim().toLowerCase() === 'self' && !stage.primary_email) {
            stage.primary_email = 'self';
        }
        record.stages.push(stage);
    });
    return record;
}

function populateApprovalWorkflowForm(record) {
    const item = Object.assign({}, emptyWorkflowRecord(), record || {});
    approvalWorkflowEditingId = String(item.id || '').trim();
    const title = document.getElementById('approvalWorkflowEditorTitle');
    if (title) title.textContent = approvalWorkflowEditingId ? 'Edit Workflow' : 'Create Workflow';
    const modalTitle = document.getElementById('approvalWorkflowModalTitle');
    if (modalTitle) modalTitle.innerHTML = `<i class="fas fa-project-diagram"></i> ${approvalWorkflowEditingId ? 'Edit Approval Workflow' : 'Create Approval Workflow'}`;
    const setValue = function(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    };
    setValue('approvalWorkflowName', item.name || '');
    setValue('approvalWorkflowDescription', item.description || '');
    setValue('approvalWorkflowServiceType', item.service_type || 'database');
    setValue('approvalWorkflowPriority', item.priority || 100);
    setValue('approvalWorkflowPendingExpiryHours', item.pending_request_expiry_hours || 12);
    setValue('approvalWorkflowClassifications', ((item.conditions && item.conditions.data_classifications) || []).join(', '));
    setValue('approvalWorkflowPrimaryEmail', (item.approver_contacts && item.approver_contacts.primary) || item.primary_email || '');
    setValue('approvalWorkflowSecondaryEmail', (item.approver_contacts && item.approver_contacts.secondary) || item.secondary_email || '');
    setValue('approvalWorkflowSecurityLeadEmail', (item.approver_contacts && item.approver_contacts.security_lead) || item.security_lead_email || '');
    const enabled = document.getElementById('approvalWorkflowEnabled');
    if (enabled) enabled.checked = item.enabled !== false;
    const piiOnly = document.getElementById('approvalWorkflowPiiOnly');
    if (piiOnly) piiOnly.checked = !!(item.conditions && item.conditions.pii_only);
    const nonPiiOnly = document.getElementById('approvalWorkflowNonPiiOnly');
    if (nonPiiOnly) nonPiiOnly.checked = !!(item.conditions && item.conditions.non_pii_only);

    document.querySelectorAll('input[name="approvalWorkflowEnv"]').forEach(function(el) {
        el.checked = !!((item.conditions && item.conditions.environments) || []).includes(el.value);
    });
    document.querySelectorAll('input[name="approvalWorkflowAccessLevel"]').forEach(function(el) {
        el.checked = !!((item.conditions && item.conditions.access_levels) || []).includes(el.value);
    });

    renderApprovalWorkflowStages(item.stages || [emptyWorkflowStage()]);
    renderApprovalWorkflowAccountSelector((item.conditions && item.conditions.account_ids) || []);
    renderApprovalWorkflowLinkedRoleSelector(item.linked_role_ids || []);
    setApprovalWorkflowStatus('', 'info');
    onApprovalWorkflowServiceTypeChange();
}

async function loadApprovalWorkflows() {
    const list = document.getElementById('approvalWorkflowList');
    if (list) list.innerHTML = '<div style="padding: 18px; color: var(--text-secondary);">Loading workflows...</div>';
    try {
        const response = await fetch(getApprovalWorkflowApiBase() + '/admin/approval-workflows', {
            credentials: 'include'
        });
        const data = await response.json().catch(function() { return {}; });
        if (!response.ok) throw new Error(data.error || 'Failed to load approval workflows.');
        approvalWorkflowRecords = Array.isArray(data.workflows) ? data.workflows : [];
        renderApprovalWorkflowList();
    } catch (error) {
        approvalWorkflowRecords = [];
        renderApprovalWorkflowList();
        setApprovalWorkflowStatus(error.message || 'Failed to load workflows.', 'error');
    }
}

async function saveApprovalWorkflowFromForm() {
    const payload = readApprovalWorkflowForm();
    const wasEditing = !!payload.id;
    setApprovalWorkflowStatus('', 'info');
    try {
        const response = await fetch(getApprovalWorkflowApiBase() + '/admin/approval-workflows', {
            method: 'POST',
            headers: approvalWorkflowJsonHeaders(),
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(function() { return {}; });
        if (!response.ok) throw new Error(data.error || 'Failed to save workflow.');
        const saved = data.workflow || payload;
        const existingIndex = approvalWorkflowRecords.findIndex(function(item) {
            return String(item.id || '') === String(saved.id || '');
        });
        if (existingIndex >= 0) approvalWorkflowRecords[existingIndex] = saved;
        else approvalWorkflowRecords.unshift(saved);
        renderApprovalWorkflowList();
        populateApprovalWorkflowForm(saved);
        closeApprovalWorkflowEditorModal();
        if (typeof notifyApp === 'function') {
            notifyApp(
                wasEditing ? 'Workflow saved' : 'Workflow created',
                wasEditing ? 'Your workflow changes were saved successfully.' : 'Approval workflow created successfully.',
                'success'
            );
        }
    } catch (error) {
        setApprovalWorkflowStatus(error.message || 'Failed to save workflow.', 'error');
    }
}

async function deleteApprovalWorkflowRecord(id) {
    const workflowId = String(id || '').trim();
    if (!workflowId) return;
    const workflow = workflowRecordById(workflowId);
    if (typeof confirmAppAction === 'function') {
        const confirmed = await confirmAppAction(`Delete workflow "${(workflow && workflow.name) || workflowId}"?`, {
            title: 'Delete workflow',
            confirmLabel: 'Delete',
            variant: 'warning'
        });
        if (!confirmed) return;
    } else if (!confirm(`Delete workflow "${(workflow && workflow.name) || workflowId}"?`)) {
        return;
    }
    try {
        const response = await fetch(getApprovalWorkflowApiBase() + '/admin/approval-workflows/' + encodeURIComponent(workflowId), {
            method: 'DELETE',
            headers: approvalWorkflowJsonHeaders(),
            credentials: 'include'
        });
        const data = await response.json().catch(function() { return {}; });
        if (!response.ok) throw new Error(data.error || 'Failed to delete workflow.');
        approvalWorkflowRecords = approvalWorkflowRecords.filter(function(item) {
            return String(item.id || '') !== workflowId;
        });
        renderApprovalWorkflowList();
        if (approvalWorkflowEditingId === workflowId) {
            approvalWorkflowEditingId = '';
            closeApprovalWorkflowEditorModal();
            populateApprovalWorkflowForm(emptyWorkflowRecord());
        }
        if (typeof notifyApp === 'function') {
            notifyApp('Workflow deleted', 'Approval workflow deleted successfully.', 'success');
        }
    } catch (error) {
        setApprovalWorkflowStatus(error.message || 'Failed to delete workflow.', 'error');
    }
}

function addApprovalWorkflowStage() {
    const current = readApprovalWorkflowForm();
    current.stages.push(emptyWorkflowStage());
    renderApprovalWorkflowStages(current.stages);
    setApprovalWorkflowStatus('Stage added.', 'success');
}

function removeApprovalWorkflowStage(stageId) {
    const current = readApprovalWorkflowForm();
    if (current.stages.length <= 1) {
        setApprovalWorkflowStatus('A workflow must keep at least one approval stage.', 'error');
        return;
    }
    const targetId = String(stageId || '').trim();
    const nextStages = current.stages.filter(function(stage) {
        return String(stage.id || '').trim() !== targetId;
    });
    if (nextStages.length === current.stages.length) {
        setApprovalWorkflowStatus('Unable to remove this stage. Please retry.', 'error');
        return;
    }
    current.stages = nextStages;
    renderApprovalWorkflowStages(current.stages);
    setApprovalWorkflowStatus('Stage removed.', 'success');
}

function startNewApprovalWorkflow() {
    approvalWorkflowEditingId = '';
    populateApprovalWorkflowForm(emptyWorkflowRecord());
    openApprovalWorkflowEditorModal();
}

function resetApprovalWorkflowForm() {
    if (approvalWorkflowEditingId) {
        const record = workflowRecordById(approvalWorkflowEditingId);
        populateApprovalWorkflowForm(record || emptyWorkflowRecord());
    } else {
        populateApprovalWorkflowForm(emptyWorkflowRecord());
    }
}

function editApprovalWorkflow(id) {
    const record = workflowRecordById(id);
    if (!record) return;
    populateApprovalWorkflowForm(record);
    openApprovalWorkflowEditorModal();
}

async function refreshApprovalWorkflowManager() {
    await Promise.all([
        loadApprovalWorkflowIamRoles(true),
        loadApprovalWorkflows(),
        loadApprovalWorkflowDefaultApprovers(true)
    ]);
}

function initWorkflowDesigner() {
    renderApprovalWorkflowManager();
    populateApprovalWorkflowForm(emptyWorkflowRecord());
    Promise.all([
        loadApprovalWorkflowIamRoles(false),
        loadApprovalWorkflows(),
        loadApprovalWorkflowDefaultApprovers(false)
    ]);
}

function clearWorkflow() {
    startNewApprovalWorkflow();
}

function validateWorkflow() {
    try {
        const payload = readApprovalWorkflowForm();
        if (!payload.name) throw new Error('Workflow name is required.');
        if (!payload.stages.length) throw new Error('At least one stage is required.');
        payload.stages.forEach(function(stage, index) {
            const approverType = String(stage.approver_type || '').trim().toLowerCase();
            const isSelfApproval = approverType === 'self' || approverType === 'self_approval' || approverType === 'requester' || approverType === 'requestor';
            if (!isSelfApproval && !stage.primary_email && approverType !== 'primary' && approverType !== 'secondary' && approverType !== 'security_lead' && approverType !== 'db_owner') {
                throw new Error(`Stage ${index + 1} requires a primary approver email.`);
            }
            if (stage.fallback_email && !stage.fallback_reason) throw new Error(`Stage ${index + 1} requires a fallback reason.`);
        });
        setApprovalWorkflowStatus('Workflow validation passed.', 'success');
    } catch (error) {
        setApprovalWorkflowStatus(error.message || 'Validation failed.', 'error');
    }
}

function saveWorkflow() {
    saveApprovalWorkflowFromForm();
}

window.initWorkflowDesigner = initWorkflowDesigner;
window.clearWorkflow = clearWorkflow;
window.validateWorkflow = validateWorkflow;
window.saveWorkflow = saveWorkflow;
window.refreshApprovalWorkflowManager = refreshApprovalWorkflowManager;
window.startNewApprovalWorkflow = startNewApprovalWorkflow;
window.resetApprovalWorkflowForm = resetApprovalWorkflowForm;
window.editApprovalWorkflow = editApprovalWorkflow;
window.deleteApprovalWorkflowRecord = deleteApprovalWorkflowRecord;
window.addApprovalWorkflowStage = addApprovalWorkflowStage;
window.removeApprovalWorkflowStage = removeApprovalWorkflowStage;
window.refreshApprovalWorkflowStageCard = refreshApprovalWorkflowStageCard;
window.refreshAllApprovalWorkflowStageCards = refreshAllApprovalWorkflowStageCards;
window.clearApprovalWorkflowAccountSelection = clearApprovalWorkflowAccountSelection;
window.closeApprovalWorkflowEditorModal = closeApprovalWorkflowEditorModal;
window.showApprovalWorkflowManagerTab = showApprovalWorkflowManagerTab;
window.loadApprovalWorkflowDefaultApprovers = loadApprovalWorkflowDefaultApprovers;
window.saveApprovalWorkflowDefaultApprovers = saveApprovalWorkflowDefaultApprovers;
