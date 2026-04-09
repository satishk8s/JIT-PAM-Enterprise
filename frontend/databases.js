// Database Management - Tree + AI + JIT Access

const DB_API_BASE = (function() {
    const configured = String(
        (typeof window !== 'undefined' && window.API_BASE)
            ? window.API_BASE
            : ((typeof API_BASE !== 'undefined') ? API_BASE : '')
    ).replace(/\/+$/, '');
    if (configured) {
        return configured.endsWith('/api') ? configured.slice(0, -4) : configured;
    }
    return window.location.origin;
})();
let selectedDatabases = [];
let currentDbAccount = '';
let dbConversationId = null;
let selectedEngine = null;
let dbRequestDraft = null;
let dbStatusFilter = 'pending';
let dbStepState = null; // { step: 1|2|3|4, provider: 'aws'|'managed'|'gcp'|'azure'|'oracle'|'atlas' }
let dbAccessMode = 'ai'; // 'ai' | 'structured'
let dbStructuredPermissions = [];
const dbCredCache = {}; // requestId -> { data, fetchedAt }
let dbRequestsPage = 1;
let dbRequestsPageSize = 20;
let dbRequestsSearch = '';
let dbBulkDeleteSelection = new Set();
let dbVisibleBulkDeleteIds = [];
let databaseRequestsCache = [];
let dbRequestsLoadSeq = 0;
let dbRequestsRefreshPollId = null;
let dbInstancePolicy = {
    account_env: '',
    data_classification: '',
    is_sensitive_classification: false,
    enforce_read_only: false,
    tags_present: true,
    request_allowed: true,
    request_block_reason: ''
};
let dbWorkflowPreview = null;
let dbWorkflowPreviewKey = '';
let dbWorkflowPreviewPending = false;
let dbWorkflowPreviewSeq = 0;
let dbLastPolicyPopupKey = '';
let dbLastGuardrailPopupKey = '';
let dbRequestRecipients = [];
let dbVisiblePermissionOps = ['SELECT', 'SHOW', 'EXPLAIN', 'DESCRIBE', 'ANALYZE', 'FIND', 'AGGREGATE'];
let dbEffectiveIamRoles = [];
let dbSelectedIamRoleId = '';
let dbProfileLoadPromise = null;
let dbApproverEmailManuallyEdited = false;
let dbOwnerEmailManuallyEdited = false;
let dbSelectedOwner = null;
const DEFAULT_DB_POLICY_BLOCK_REASON = 'Required classification tags are missing on the selected database target. Please contact your PAM administrator.';
const DB_WRITE_APPROVAL_GUIDANCE = 'You are not allowed to request write actions here. Please connect with DevOps and SecOps team for approvals to perform any kind of write actions. Once you have approval, connect with NPAMx admin to allow you to place the request.';
const DB_REQUEST_DISCLAIMER = 'Access will be granted exactly as requested. Incorrect details may result in failed or unusable access.';
const DB_DISPLAY_TIMEZONE = 'Asia/Kolkata';

function parseDbDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    let normalized = raw;
    const looksIso = /^\d{4}-\d{2}-\d{2}t/i.test(normalized);
    const hasTz = /(?:z|[+-]\d{2}:\d{2})$/i.test(normalized);
    // Backend often stores ISO timestamps without TZ; treat them as UTC.
    if (looksIso && !hasTz) normalized += 'Z';
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function formatDbDateTime(value) {
    const parsed = parseDbDate(value);
    if (!parsed) return '—';
    try {
        const formatted = new Intl.DateTimeFormat('en-IN', {
            timeZone: DB_DISPLAY_TIMEZONE,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).format(parsed);
        return `${formatted} IST`;
    } catch (_) {
        return parsed.toLocaleString('en-IN', { timeZone: DB_DISPLAY_TIMEZONE });
    }
}

function getDbEndpointLabel(mode) {
    return String(mode || '').trim().toLowerCase() === 'direct' ? 'Direct Endpoint' : 'Proxy Endpoint';
}

async function confirmDbRequestSubmission() {
    if (typeof confirmAppAction !== 'function') return true;
    return await confirmAppAction(DB_REQUEST_DISCLAIMER, {
        title: 'Confirm database request',
        confirmLabel: 'Submit request',
        cancelLabel: 'Cancel',
        variant: 'warning'
    });
}

function setDbSubmitStatus(elementId, message, variant) {
    if (typeof setInlineStatus === 'function') {
        setInlineStatus(elementId, message, variant || 'info');
        return;
    }
    const el = document.getElementById(elementId);
    if (!el) return;
    const text = String(message || '').trim();
    if (!text) {
        el.hidden = true;
        el.textContent = '';
        el.removeAttribute('data-variant');
        return;
    }
    el.hidden = false;
    el.textContent = text;
    el.setAttribute('data-variant', String(variant || 'info'));
}

function setDbSubmitBusy(buttonId, busy, busyLabel) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    if (!btn.dataset.defaultHtml) {
        btn.dataset.defaultHtml = btn.innerHTML;
    }
    btn.disabled = !!busy;
    if (busy) {
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${busyLabel || 'Submitting...'}`;
    } else {
        btn.innerHTML = btn.dataset.defaultHtml || btn.innerHTML;
    }
}

function setDbRequestsLoadingState(message) {
    const list = document.getElementById('dbRequestsList');
    if (list) {
        list.innerHTML = `<div class="db-requests-empty"><i class="fas fa-spinner fa-spin"></i> ${escapeHtml(String(message || 'Loading database requests...'))}</div>`;
    }
    const pager = document.getElementById('dbRequestsPager');
    if (pager) {
        pager.innerHTML = '';
    }
}

function clearDbRequestsRefreshPoll() {
    if (dbRequestsRefreshPollId) {
        window.clearTimeout(dbRequestsRefreshPollId);
        dbRequestsRefreshPollId = null;
    }
}

function isDbRetryableActivation(req) {
    if (!req || typeof req !== 'object') return false;
    if (req.activation_retryable === true) return true;
    const code = String(req.activation_error_code || '').trim().toUpperCase();
    if (['ACTIVATION_IN_PROGRESS', 'IDC_ASSIGNMENT_FAILED', 'VAULT_UNREACHABLE'].includes(code)) return true;
    const activationMessage = String(req.activation_progress?.message || '').toLowerCase();
    const activationError = String(req.activation_error || '').toLowerCase();
    return (
        activationMessage.includes('preparing access') ||
        activationMessage.includes('activation is pending') ||
        activationMessage.includes('permission assignment is pending') ||
        activationError.includes('retry in a few minutes') ||
        activationError.includes('still being prepared')
    );
}

function isDbApprovedStaleRequest(req) {
    if (!req || typeof req !== 'object') return false;
    const lifecycle = String(req.lifecycle_status || req.status || '').trim().toLowerCase();
    if (lifecycle !== 'approved') return false;
    if (String(req.db_username || '').trim()) return false;
    return true;
}

function scheduleDbRequestsRefreshWhileProvisioning(requests) {
    clearDbRequestsRefreshPoll();
    const rows = Array.isArray(requests) ? requests : [];
    const hasProvisioning = rows.some(req => String(req?.status || '').toLowerCase() === 'approved' && isDbRetryableActivation(req));
    if (!hasProvisioning) return;
    dbRequestsRefreshPollId = window.setTimeout(() => {
        loadDbRequests();
        refreshApprovedDatabases();
    }, 4000);
}

function getDbRequestHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (typeof getCsrfToken === 'function') {
        const csrfToken = getCsrfToken();
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    }
    return headers;
}

function getActiveRequestUserEmail() {
    return String(localStorage.getItem('userEmail') || '').trim().toLowerCase();
}

function getDbProfileSnapshot() {
    return (typeof window !== 'undefined' && window.NPAM_USER_PROFILE && typeof window.NPAM_USER_PROFILE === 'object')
        ? window.NPAM_USER_PROFILE
        : {};
}

async function ensureDbProfileLoaded(force) {
    if (getDbRequestMode() === 'others') return getDbProfileSnapshot();
    const profile = getDbProfileSnapshot();
    const hasAnyProfile = Object.keys(profile).length > 0;
    const hasApproverProfile = !!String(profile.manager_email || profile.manager_manager_email || '').trim();
    if (!force && hasAnyProfile && hasApproverProfile) return profile;
    if (dbProfileLoadPromise) return dbProfileLoadPromise;
    if (typeof window === 'undefined' || typeof window.loadProfileData !== 'function') return profile;
    dbProfileLoadPromise = Promise.resolve(window.loadProfileData())
        .then(function(data) {
            applyDbProfileDefaults(true);
            syncDbApprovalUiState();
            return data;
        })
        .catch(function() {
            return getDbProfileSnapshot();
        })
        .finally(function() {
            dbProfileLoadPromise = null;
        });
    return dbProfileLoadPromise;
}

function getDbProfileApproverEmail() {
    if (getDbRequestMode() === 'others') {
        if (dbRequestRecipients.length === 1) {
            return getDbRecipientAutoApprover(dbRequestRecipients[0]) || '';
        }
        return '';
    }
    const profile = (typeof window !== 'undefined' && window.NPAM_USER_PROFILE && typeof window.NPAM_USER_PROFILE === 'object')
        ? window.NPAM_USER_PROFILE
        : {};
    const managerEmail = String(profile.manager_email || '').trim().toLowerCase();
    const managerManagerEmail = String(profile.manager_manager_email || '').trim().toLowerCase();
    return managerEmail || managerManagerEmail;
}

function canRequestDbForOthers() {
    if (typeof canAccessAdminConsole === 'function') return canAccessAdminConsole();
    if (typeof currentPamRole === 'function') {
        const role = currentPamRole();
        return role === 'Engineer' || role === 'Admin' || role === 'SuperAdmin';
    }
    return String(localStorage.getItem('isAdmin') || '').toLowerCase() === 'true';
}

function canDbOverrideApproverEmail() {
    if (typeof canAccessAdminConsole === 'function') return canAccessAdminConsole();
    return false;
}

function getDbRequestMode() {
    const raw = String(dbRequestDraft?.request_for_mode || 'self').trim().toLowerCase();
    if (raw === 'others' && canRequestDbForOthers()) return 'others';
    return 'self';
}

function normalizeDbRequestRecipient(item) {
    const source = item || {};
    const email = String(source.email || '').trim().toLowerCase();
    if (!email) return null;
    return {
        email,
        display_name: String(source.display_name || source.name || email).trim() || email,
        manager_email: String(source.manager_email || '').trim().toLowerCase(),
        manager_manager_email: String(source.manager_manager_email || '').trim().toLowerCase(),
    };
}

function getDbRecipientAutoApprover(recipient) {
    const item = recipient || {};
    return String(item.manager_email || item.manager_manager_email || '').trim().toLowerCase();
}

function getCurrentDbRequesterRecord() {
    const email = getActiveRequestUserEmail();
    if (!email) return null;
    const business = (typeof window !== 'undefined' && window.NPAM_USER_PROFILE && typeof window.NPAM_USER_PROFILE === 'object')
        ? window.NPAM_USER_PROFILE
        : {};
    return {
        email,
        display_name: String((currentProfileData && currentProfileData.display_name) || (currentUser && currentUser.name) || localStorage.getItem('userName') || email).trim(),
        manager_email: String(business.manager_email || '').trim().toLowerCase(),
        manager_manager_email: String(business.manager_manager_email || '').trim().toLowerCase(),
    };
}

function getDbRequestRecipientsForSubmission() {
    if (getDbRequestMode() === 'others') {
        return dbRequestRecipients.slice();
    }
    const self = getCurrentDbRequesterRecord();
    return self ? [self] : [];
}

function getDbRequestTargetSummaryLabel() {
    const recipients = getDbRequestRecipientsForSubmission();
    if (!recipients.length) return '—';
    if (getDbRequestMode() !== 'others') {
        const self = recipients[0];
        return (self.display_name || self.email) + ' (' + self.email + ')';
    }
    if (recipients.length === 1) {
        const target = recipients[0];
        return (target.display_name || target.email) + ' (' + target.email + ')';
    }
    return recipients.length + ' users selected';
}

function getDbRecipientFullName(recipient) {
    const item = recipient || {};
    return String(item.display_name || item.name || item.email || '').trim();
}

function buildDbRecipientSubmissionTargets(approverRequired, manualApproverEmail) {
    const recipients = getDbRequestRecipientsForSubmission();
    if (!recipients.length) {
        throw new Error(getDbRequestMode() === 'others'
            ? 'Please select one or more users for this request.'
            : 'Your session is missing the authenticated user email. Sign in again and retry.');
    }
    return recipients.map(function(recipient) {
        const email = String(recipient.email || '').trim().toLowerCase();
        const autoApprover = getDbRecipientAutoApprover(recipient);
        const approverEmail = getDbRequestMode() === 'others'
            ? autoApprover
            : String(manualApproverEmail || '').trim().toLowerCase();
        if (approverRequired && !approverEmail) {
            throw new Error(
                getDbRequestMode() === 'others'
                    ? `RM email is missing for ${email}. Ask the user to complete their workforce profile before raising the request.`
                    : 'Please enter the approver email address.'
            );
        }
        return {
            email,
            fullName: getDbRecipientFullName(recipient) || email.split('@')[0].replace(/\./g, ' '),
            requestApproverEmail: approverEmail,
            dbUsername: email.split('@')[0],
        };
    });
}

function renderDbRequestRecipientResults(panel, results) {
    const wrap = document.getElementById(panel === 'ai' ? 'dbAiRequestUserResults' : 'dbStructuredRequestUserResults');
    if (!wrap) return;
    if (!results || !results.length) {
        wrap.innerHTML = '<div class="guardrail-search-item"><span>No matching users found.</span></div>';
        return;
    }
    wrap.innerHTML = results.map(function(item, index) {
        const email = String(item.email || '').trim().toLowerCase();
        const already = dbRequestRecipients.some(function(rec) { return rec.email === email; });
        return `<div class="guardrail-search-item">
            <span><strong>${escapeHtml(item.display_name || email)}</strong><br><small>${escapeHtml(email)}</small></span>
            <button type="button" class="btn-secondary btn-sm" onclick="addDbRequestRecipient('${panel}', ${index})" ${already ? 'disabled' : ''}>${already ? 'Added' : 'Add'}</button>
        </div>`;
    }).join('');
}

function renderDbRequestRecipientUi(panel) {
    const mode = getDbRequestMode();
    const allowOthers = canRequestDbForOthers();
    const selfRadio = document.getElementById(panel === 'ai' ? 'dbAiRequestTargetSelf' : 'dbStructuredRequestTargetSelf');
    const othersRadio = document.getElementById(panel === 'ai' ? 'dbAiRequestTargetOthers' : 'dbStructuredRequestTargetOthers');
    const searchWrap = document.getElementById(panel === 'ai' ? 'dbAiRequestUserSearchWrap' : 'dbStructuredRequestUserSearchWrap');
    const selectedWrap = document.getElementById(panel === 'ai' ? 'dbAiRequestUserSelected' : 'dbStructuredRequestUserSelected');
    const hintEl = document.getElementById(panel === 'ai' ? 'dbAiRequestTargetHint' : 'dbStructuredRequestTargetHint');
    if (selfRadio) selfRadio.checked = mode === 'self';
    if (othersRadio) {
        othersRadio.checked = mode === 'others';
        othersRadio.disabled = !allowOthers;
        const label = othersRadio.closest('.db-radio-label');
        if (label) label.style.display = allowOthers ? '' : 'none';
    }
    if (searchWrap) searchWrap.style.display = mode === 'others' && allowOthers ? '' : 'none';
    if (selectedWrap) {
        if (mode !== 'others' || !allowOthers) {
            selectedWrap.innerHTML = '';
            selectedWrap.style.display = 'none';
        } else {
            selectedWrap.style.display = '';
            selectedWrap.innerHTML = dbRequestRecipients.length
                ? `<div class="guardrail-chip-list">` + dbRequestRecipients.map(function(item) {
                    const approver = getDbRecipientAutoApprover(item);
                    return `<span class="guardrail-chip">
                        ${escapeHtml(item.display_name || item.email)}
                        <small style="opacity:0.8;">${escapeHtml(item.email)}</small>
                        ${approver ? `<small style="opacity:0.8;">RM: ${escapeHtml(approver)}</small>` : '<small style="opacity:0.8;">RM missing</small>'}
                        <button type="button" onclick="removeDbRequestRecipient('${String(item.email || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">&times;</button>
                    </span>`;
                }).join('') + `</div>`
                : '<div class="guardrail-search-item"><span>Select one or more users to raise this request on their behalf.</span></div>';
        }
    }
    if (hintEl) {
        hintEl.textContent = mode === 'others' && allowOthers
            ? 'NPAMx will create one request per selected user and use each user’s RM automatically for approval routing.'
            : 'This request will be raised for your own account and use your saved RM details for approval routing.';
    }
}

function refreshDbRequestRecipientUi() {
    renderDbRequestRecipientUi('structured');
    renderDbRequestRecipientUi('ai');
    if (!document.getElementById('dbStructuredPanel')?.classList.contains('db-structured-panel-hidden') && dbRequestDraft?._selectedInstance?.id) {
        refreshDbStructuredAccessCatalog(selectedEngine?.engine || dbRequestDraft?._selectedInstance?.engine || '');
    }
    if (typeof hydrateStructuredSummary === 'function') hydrateStructuredSummary();
    if (typeof showDbRequestSummaryIfReady === 'function') showDbRequestSummaryIfReady();
    syncDbApprovalUiState();
}

function setDbRequestMode(mode) {
    dbRequestDraft = dbRequestDraft || {};
    dbRequestDraft.request_for_mode = (String(mode || '').trim().toLowerCase() === 'others' && canRequestDbForOthers()) ? 'others' : 'self';
    if (dbRequestDraft.request_for_mode !== 'others') {
        dbRequestRecipients = [];
        dbApproverEmailManuallyEdited = false;
    }
    applyDbProfileDefaults(true);
    refreshDbRequestRecipientUi();
}

async function searchDbRequestUsers(panel) {
    const input = document.getElementById(panel === 'ai' ? 'dbAiRequestUserSearch' : 'dbStructuredRequestUserSearch');
    const query = String((input && input.value) || '').trim();
    const wrap = document.getElementById(panel === 'ai' ? 'dbAiRequestUserResults' : 'dbStructuredRequestUserResults');
    if (!wrap) return;
    if (!query) {
        wrap.innerHTML = '<div class="guardrail-search-item"><span>Enter a name or email to search.</span></div>';
        return;
    }
    wrap.innerHTML = '<div class="guardrail-search-item"><span>Searching…</span></div>';
    try {
        const data = await apiJson('/profile/directory-search?q=' + encodeURIComponent(query));
        window.__dbRequestUserSearch = window.__dbRequestUserSearch || { structured: [], ai: [] };
        window.__dbRequestUserSearch[panel] = Array.isArray(data.users) ? data.users : [];
        renderDbRequestRecipientResults(panel, window.__dbRequestUserSearch[panel]);
    } catch (err) {
        wrap.innerHTML = '<div class="guardrail-search-item"><span>' + escapeHtml(err.message || 'Search failed.') + '</span></div>';
    }
}

function addDbRequestRecipient(panel, index) {
    const results = (window.__dbRequestUserSearch && window.__dbRequestUserSearch[panel]) || [];
    const item = normalizeDbRequestRecipient(results[index]);
    if (!item) return;
    if (!dbRequestRecipients.some(function(existing) { return existing.email === item.email; })) {
        dbRequestRecipients.push(item);
    }
    renderDbRequestRecipientResults(panel, results);
    refreshDbRequestRecipientUi();
}

function removeDbRequestRecipient(email) {
    const target = String(email || '').trim().toLowerCase();
    dbRequestRecipients = dbRequestRecipients.filter(function(item) { return item.email !== target; });
    refreshDbRequestRecipientUi();
}

function getDbApproverEmail() {
    const structured = String(document.getElementById('dbStructuredApproverEmail')?.value || '').trim().toLowerCase();
    const ai = String(document.getElementById('dbAiApproverEmail')?.value || '').trim().toLowerCase();
    return structured || ai || getDbProfileApproverEmail();
}

function syncDbApproverEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    const structured = document.getElementById('dbStructuredApproverEmail');
    const ai = document.getElementById('dbAiApproverEmail');
    if (structured && structured.value.trim().toLowerCase() !== email) structured.value = email;
    if (ai && ai.value.trim().toLowerCase() !== email) ai.value = email;
    dbRequestDraft = dbRequestDraft || {};
    dbRequestDraft.request_approver_email = email;
}

function handleDbApproverEmailInput(value) {
    if (!canDbOverrideApproverEmail()) {
        applyDbProfileDefaults(true);
        return;
    }
    dbApproverEmailManuallyEdited = true;
    syncDbApproverEmail(value);
    refreshDbWorkflowPreview();
}
window.handleDbApproverEmailInput = handleDbApproverEmailInput;

function getDbOwnerEmail() {
    const structured = String(document.getElementById('dbStructuredDbOwnerEmail')?.value || '').trim().toLowerCase();
    const ai = String(document.getElementById('dbAiDbOwnerEmail')?.value || '').trim().toLowerCase();
    return structured || ai || '';
}

function renderDbOwnerSelection(panel) {
    const wrap = document.getElementById(panel === 'ai' ? 'dbAiDbOwnerSelected' : 'dbStructuredDbOwnerSelected');
    if (!wrap) return;
    if (!dbSelectedOwner || !dbSelectedOwner.email) {
        wrap.innerHTML = '';
        return;
    }
    const label = dbSelectedOwner.display_name || dbSelectedOwner.email;
    wrap.innerHTML = `<div class="guardrail-chip-list"><span class="guardrail-chip">
        ${escapeHtml(label)}
        <small style="opacity:0.8;">${escapeHtml(dbSelectedOwner.email)}</small>
        <button type="button" onclick="clearDbOwnerSelection()">&times;</button>
    </span></div>`;
}

function syncDbOwnerEmail(value, displayName) {
    const email = String(value || '').trim().toLowerCase();
    const label = String(displayName || '').trim();
    const structured = document.getElementById('dbStructuredDbOwnerEmail');
    const ai = document.getElementById('dbAiDbOwnerEmail');
    if (structured && structured.value.trim().toLowerCase() !== email) structured.value = email;
    if (ai && ai.value.trim().toLowerCase() !== email) ai.value = email;
    dbRequestDraft = dbRequestDraft || {};
    dbRequestDraft.db_owner_email = email;
    if (email) {
        dbSelectedOwner = {
            email,
            display_name: label || (dbSelectedOwner?.email === email ? dbSelectedOwner?.display_name : '') || email
        };
    } else {
        dbSelectedOwner = null;
    }
    renderDbOwnerSelection('structured');
    renderDbOwnerSelection('ai');
}

function handleDbOwnerEmailInput(value) {
    dbOwnerEmailManuallyEdited = true;
    syncDbOwnerEmail(value);
    refreshDbWorkflowPreview();
}
window.handleDbOwnerEmailInput = handleDbOwnerEmailInput;

function clearDbOwnerSelection() {
    dbOwnerEmailManuallyEdited = false;
    syncDbOwnerEmail('', '');
    refreshDbWorkflowPreview();
}
window.clearDbOwnerSelection = clearDbOwnerSelection;

function renderDbOwnerSearchResults(panel, results) {
    const wrap = document.getElementById(panel === 'ai' ? 'dbAiDbOwnerResults' : 'dbStructuredDbOwnerResults');
    if (!wrap) return;
    if (!Array.isArray(results) || !results.length) {
        wrap.innerHTML = '<div class="guardrail-search-item"><span>No users found.</span></div>';
        return;
    }
    wrap.innerHTML = results.map(function(item, index) {
        const email = String(item.email || '').trim().toLowerCase();
        const already = email && email === String(getDbOwnerEmail() || '').trim().toLowerCase();
        return `<div class="guardrail-search-item">
            <span><strong>${escapeHtml(item.display_name || email)}</strong><br><small>${escapeHtml(email)}</small></span>
            <button type="button" class="btn-secondary btn-sm" onclick="selectDbOwnerSearchResult('${panel}', ${index})" ${already ? 'disabled' : ''}>${already ? 'Added' : 'Add'}</button>
        </div>`;
    }).join('');
}

async function searchDbOwnerUsers(panel) {
    const input = document.getElementById(panel === 'ai' ? 'dbAiDbOwnerSearch' : 'dbStructuredDbOwnerSearch');
    const query = String((input && input.value) || '').trim();
    const wrap = document.getElementById(panel === 'ai' ? 'dbAiDbOwnerResults' : 'dbStructuredDbOwnerResults');
    if (!wrap) return;
    if (!query) {
        wrap.innerHTML = '<div class="guardrail-search-item"><span>Enter a name or email to search.</span></div>';
        return;
    }
    wrap.innerHTML = '<div class="guardrail-search-item"><span>Searching…</span></div>';
    try {
        const data = await apiJson('/profile/directory-search?q=' + encodeURIComponent(query));
        window.__dbOwnerSearch = window.__dbOwnerSearch || { structured: [], ai: [] };
        window.__dbOwnerSearch[panel] = Array.isArray(data.users) ? data.users : [];
        renderDbOwnerSearchResults(panel, window.__dbOwnerSearch[panel]);
    } catch (err) {
        wrap.innerHTML = '<div class="guardrail-search-item"><span>' + escapeHtml(err.message || 'Search failed.') + '</span></div>';
    }
}
window.searchDbOwnerUsers = searchDbOwnerUsers;

function selectDbOwnerSearchResult(panel, index) {
    const results = (window.__dbOwnerSearch && window.__dbOwnerSearch[panel]) || [];
    const item = normalizeDbRequestRecipient(results[index]);
    if (!item) return;
    dbOwnerEmailManuallyEdited = true;
    syncDbOwnerEmail(item.email, item.display_name || item.email);
    renderDbOwnerSearchResults(panel, results);
    refreshDbWorkflowPreview();
}
window.selectDbOwnerSearchResult = selectDbOwnerSearchResult;

function applyDbProfileDefaults(force) {
    const defaultEmail = getDbProfileApproverEmail();
    if (!defaultEmail) {
        if (force) {
            ensureDbProfileLoaded(true).catch(function() {});
        }
        return;
    }
    const structured = document.getElementById('dbStructuredApproverEmail');
    const ai = document.getElementById('dbAiApproverEmail');
    const shouldApply = getDbRequestMode() !== 'others'
        && (force || !dbApproverEmailManuallyEdited || !String(dbRequestDraft?.request_approver_email || '').trim());
    if (!shouldApply) return;
    if (structured && (force || !String(structured.value || '').trim() || !dbApproverEmailManuallyEdited)) structured.value = defaultEmail;
    if (ai && (force || !String(ai.value || '').trim() || !dbApproverEmailManuallyEdited)) ai.value = defaultEmail;
    if ((force || !String(dbRequestDraft?.request_approver_email || '').trim() || !dbApproverEmailManuallyEdited) && defaultEmail) {
        dbRequestDraft = dbRequestDraft || {};
        dbRequestDraft.request_approver_email = defaultEmail;
    }
}
window.applyDbProfileDefaults = applyDbProfileDefaults;

function getDbEffectiveIamRoleById(roleId) {
    const rid = String(roleId || '').trim();
    return (dbEffectiveIamRoles || []).find(function(role) {
        return String(role.id || '').trim() === rid;
    }) || null;
}

function getDbSelectedIamRole() {
    return dbSelectedIamRoleId ? getDbEffectiveIamRoleById(dbSelectedIamRoleId) : null;
}

function getDbSelectedIamRoleType() {
    const role = getDbSelectedIamRole();
    return String((role && role.request_role) || '').trim().toLowerCase();
}

function getDbRoleActionList(role) {
    const roleType = String(role?.request_role || '').trim().toLowerCase();
    if (roleType === 'read_only') {
        const engine = String((dbRequestDraft?._selectedInstance || {}).engine || selectedEngine?.engine || '').trim();
        return getDbDefaultReadBaseOps(engine).map(function(item) {
            return String(item || '').trim().toUpperCase();
        }).filter(Boolean);
    }
    return Array.isArray(role?.actions)
        ? role.actions.map(function(item) { return String(item || '').trim().toUpperCase(); }).filter(Boolean)
        : [];
}

function getDbReadRoleExtraActions(selectedRole) {
    const baseActions = new Set(getDbRoleActionList(selectedRole));
    return (dbStructuredPermissions || []).map(function(item) {
        return String(item || '').trim().toUpperCase();
    }).filter(Boolean).filter(function(item) {
        return !baseActions.has(item);
    });
}

function renderDbEffectiveIamRoles() {
    const select = document.getElementById('dbStructuredIamRoleSelect');
    const hint = document.getElementById('dbStructuredIamRoleHint');
    if (!select) return;
    const hasTarget = !!(String(dbRequestDraft?.account_id || '').trim() && String((dbRequestDraft?._selectedInstance || {}).id || '').trim());
    const roles = Array.isArray(dbEffectiveIamRoles) ? dbEffectiveIamRoles : [];
    const currentValue = dbSelectedIamRoleId && getDbEffectiveIamRoleById(dbSelectedIamRoleId) ? dbSelectedIamRoleId : '';
    select.innerHTML = ['<option value="">Select access role</option>'].concat(roles.map(function(role) {
        return '<option value="' + escapeAttr(role.id || '') + '">' + escapeHtml(role.name || role.id || 'Saved role') + '</option>';
    })).join('');
    select.value = currentValue;
    select.disabled = !hasTarget || !roles.length;
    if (hint) {
        if (!hasTarget) {
            hint.textContent = 'Select account and instance first to load the access roles available for this request.';
        } else if (!roles.length) {
            hint.textContent = 'No access roles are available for the selected request target(s) on this database.';
        } else if (currentValue) {
            const role = getDbEffectiveIamRoleById(currentValue);
            if (!role) {
                hint.textContent = 'Pick an access role to continue.';
            } else {
                const roleType = String(role.request_role || '').trim().toLowerCase();
                const baseActions = getDbRoleActionList(role);
                if (roleType === 'read_only') {
                    const extraActions = getDbReadRoleExtraActions(role);
                    hint.textContent = 'Read Only includes: ' + (baseActions.join(', ') || 'SELECT') + '. You can add more read-only actions below if needed' + (extraActions.length ? ' (' + extraActions.join(', ') + ' selected).' : '.');
                } else {
                    hint.textContent = (role.name || 'Selected role') + ' includes: ' + (baseActions.join(', ') || '—') + '. Additional permission customization is disabled for this role.';
                }
            }
        } else {
            hint.textContent = 'Pick an access role to see what it includes. Read Only can be extended with extra read-only actions if needed.';
        }
    }
    updateDbStructuredPermissionVisibility();
}

function syncDbSelectedIamRoleWithPermissions() {
    if (!dbSelectedIamRoleId) {
        return;
    }
    const role = getDbEffectiveIamRoleById(dbSelectedIamRoleId);
    if (!role) {
        dbSelectedIamRoleId = '';
        if (dbRequestDraft) {
            delete dbRequestDraft.iam_role_template_id;
            delete dbRequestDraft.iam_role_template_name;
        }
        renderDbEffectiveIamRoles();
        return;
    }
    const expected = (role.actions || []).map(function(item) { return String(item || '').trim().toUpperCase(); }).filter(Boolean).sort();
    const selected = (dbStructuredPermissions || []).map(function(item) { return String(item || '').trim().toUpperCase(); }).filter(Boolean).sort();
    const roleType = String(role.request_role || '').trim().toLowerCase();
    if (roleType === 'read_only') {
        const expectedReadOnly = getDbRoleActionList(role).sort();
        const selectedSet = new Set(selected);
        const hasAllBaseActions = expectedReadOnly.every(function(item) { return selectedSet.has(item); });
        const hasOnlyReadActions = selected.every(function(item) { return DB_READ_ONLY_OPS.has(item); });
        if (hasAllBaseActions && hasOnlyReadActions) {
            renderDbEffectiveIamRoles();
            return;
        }
    }
    if (expected.length !== selected.length || expected.some(function(item, index) { return item !== selected[index]; })) {
        dbSelectedIamRoleId = '';
        if (dbRequestDraft) {
            delete dbRequestDraft.iam_role_template_id;
            delete dbRequestDraft.iam_role_template_name;
        }
        renderDbEffectiveIamRoles();
    }
}

function applyDbEffectiveIamRole(roleId) {
    const rid = String(roleId || '').trim();
    dbSelectedIamRoleId = rid;
    dbRequestDraft = dbRequestDraft || {};
    if (!rid) {
        delete dbRequestDraft.iam_role_template_id;
        delete dbRequestDraft.iam_role_template_name;
        delete dbRequestDraft.role;
        renderDbEffectiveIamRoles();
        hydrateStructuredSummary();
        return;
    }
    const role = getDbEffectiveIamRoleById(rid);
    if (!role) {
        dbSelectedIamRoleId = '';
        delete dbRequestDraft.iam_role_template_id;
        delete dbRequestDraft.iam_role_template_name;
        delete dbRequestDraft.role;
        renderDbEffectiveIamRoles();
        return;
    }
    dbRequestDraft.iam_role_template_id = role.id;
    dbRequestDraft.iam_role_template_name = role.name || role.id;
    dbRequestDraft.role = String(role.request_role || '').trim().toLowerCase() || deriveStructuredRole(role.actions || []);
    dbStructuredPermissions = getDbRoleActionList(role);
    renderDbEffectiveIamRoles();
    renderStructuredPermissionGroups(selectedEngine?.engine || dbRequestDraft?._selectedInstance?.engine || '');
    syncStructuredPermissionUI();
    hydrateStructuredSummary();
    Promise.resolve(ensureDbProfileLoaded(false)).then(function() {
        applyDbProfileDefaults(true);
        refreshDbWorkflowPreview();
    }).catch(function() {});
}
window.applyDbEffectiveIamRole = applyDbEffectiveIamRole;

async function refreshDbEffectiveIamRoles() {
    const selectedInstance = dbRequestDraft?._selectedInstance || {};
    const accountId = String(dbRequestDraft?.account_id || '').trim();
    if (!accountId || !selectedInstance.id) {
        dbEffectiveIamRoles = [];
        dbSelectedIamRoleId = '';
        if (dbRequestDraft) {
            delete dbRequestDraft.iam_role_template_id;
            delete dbRequestDraft.iam_role_template_name;
        }
        renderDbEffectiveIamRoles();
        return;
    }
    try {
        const targetEmails = getDbRequestRecipientsForSubmission().map(function(item) {
            return String(item.email || '').trim().toLowerCase();
        }).filter(Boolean);
        const res = await fetch(`${DB_API_BASE}/api/iam-roles/effective`, {
            method: 'POST',
            headers: getDbRequestHeaders(),
            credentials: 'include',
            body: JSON.stringify({
                account_id: accountId,
                db_instance_id: String(selectedInstance.id || '').trim(),
                engine: normalizeEngineForStructured(selectedInstance.engine || selectedEngine?.engine || ''),
                user_emails: targetEmails
            })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Failed to load IAM roles.');
        dbEffectiveIamRoles = Array.isArray(data.roles) ? data.roles : [];
    } catch (_) {
        dbEffectiveIamRoles = [];
    }
    const selectedRole = dbSelectedIamRoleId ? getDbEffectiveIamRoleById(dbSelectedIamRoleId) : null;
    if (!selectedRole) {
        dbSelectedIamRoleId = '';
        if (dbRequestDraft) {
            delete dbRequestDraft.iam_role_template_id;
            delete dbRequestDraft.iam_role_template_name;
            delete dbRequestDraft.role;
        }
    } else {
        dbStructuredPermissions = getDbRoleActionList(selectedRole);
        dbRequestDraft.role = String(selectedRole.request_role || '').trim().toLowerCase() || deriveStructuredRole(selectedRole.actions || []);
    }
    renderDbEffectiveIamRoles();
    if (!dbSelectedIamRoleId && dbEffectiveIamRoles.length) {
        const preferred = dbEffectiveIamRoles.find(function(role) {
            return String(role.request_role || '').trim().toLowerCase() === 'read_only';
        }) || dbEffectiveIamRoles[0];
        if (preferred && preferred.id) applyDbEffectiveIamRole(preferred.id);
    } else {
        updateDbStructuredPermissionVisibility();
    }
}

function updateDbStructuredPermissionVisibility() {
    const groupsSection = document.getElementById('dbStructuredPermissionGroupsSection');
    const selectedSection = document.getElementById('dbStructuredSelectedSection');
    const groupsTitle = groupsSection ? groupsSection.querySelector('h4') : null;
    const selectedTitle = selectedSection ? selectedSection.querySelector('h4') : null;
    const selectedRoleType = getDbSelectedIamRoleType();
    const showCustom = selectedRoleType === 'read_only';
    if (groupsSection) groupsSection.style.display = showCustom ? '' : 'none';
    if (selectedSection) selectedSection.style.display = showCustom ? '' : 'none';
    if (groupsTitle) groupsTitle.textContent = 'Add Additional Read Actions';
    if (selectedTitle) selectedTitle.textContent = 'Selected Read Actions';
}

async function refreshDbStructuredAccessCatalog(engine) {
    await refreshDbRequestableActions();
    await refreshDbEffectiveIamRoles();
    renderStructuredPermissionGroups(engine || selectedEngine?.engine || dbRequestDraft?._selectedInstance?.engine || '');
    syncStructuredPermissionUI();
}

function renderDbWorkflowPreview(message, variant) {
    const targets = [
        document.getElementById('dbStructuredWorkflowPreview'),
        document.getElementById('dbAiWorkflowPreview')
    ].filter(Boolean);
    targets.forEach(function(el) {
        const text = String(message || '').trim();
        if (!text) {
            el.style.display = 'none';
            el.textContent = '';
            el.removeAttribute('data-variant');
            return;
        }
        el.style.display = 'block';
        el.textContent = text;
        el.setAttribute('data-variant', String(variant || 'info'));
    });
}

function dbWorkflowRequiresApprover() {
    return !!(dbWorkflowPreview && dbWorkflowPreview.requires_request_approver);
}

function dbWorkflowHasSelfApproval() {
    return !!(dbWorkflowPreview && dbWorkflowPreview.self_approval_allowed);
}

function getDbInstanceBlockedReason() {
    if (dbInstancePolicy?.request_allowed === false) {
        return dbInstancePolicy.request_block_reason || DEFAULT_DB_POLICY_BLOCK_REASON;
    }
    const selectedInstance = dbRequestDraft?._selectedInstance || {};
    if (selectedInstance.request_allowed === false || selectedInstance.iam_auth_enabled === false) {
        return String(selectedInstance.request_block_reason || DEFAULT_DB_POLICY_BLOCK_REASON).trim();
    }
    return '';
}

function dbWorkflowBlockedReason() {
    const instanceBlockedReason = getDbInstanceBlockedReason();
    if (instanceBlockedReason) return instanceBlockedReason;
    if (dbWorkflowPreview && dbWorkflowPreview.blocked_by_guardrail) {
        return String(dbWorkflowPreview.message || '').trim();
    }
    return '';
}

function maybeShowDbGuardrailPopup() {
    if (!(dbWorkflowPreview && dbWorkflowPreview.blocked_by_guardrail)) return;
    const reason = String(dbWorkflowPreview.message || '').trim();
    if (!reason) return;
    const key = JSON.stringify({
        reason: reason,
        instance_id: String((dbRequestDraft?._selectedInstance || {}).id || '').trim().toLowerCase(),
        permissions: (Array.isArray(dbStructuredPermissions) ? dbStructuredPermissions : []).map(function(item) {
            return String(item || '').trim().toUpperCase();
        }).join(',')
    });
    if (key === dbLastGuardrailPopupKey) return;
    dbLastGuardrailPopupKey = key;
    showDbErrorPopup(reason, [
        'This action is currently blocked by the configured database guardrails.',
        'Remove the blocked write actions or contact the NPAMx admin if an approved exception is required.'
    ], 'Guardrail Blocked');
}

function getDbApproverDisplay() {
    if (getDbRequestMode() === 'others') {
        if (!dbRequestRecipients.length) return 'Select user(s)';
        if (dbRequestRecipients.length === 1) {
            return getDbRecipientAutoApprover(dbRequestRecipients[0]) || 'RM missing on target user profile';
        }
        return 'Auto per selected user';
    }
    const approverEmail = getDbApproverEmail();
    if (dbWorkflowRequiresApprover()) return approverEmail || '—';
    if (dbWorkflowHasSelfApproval()) return 'Self approval';
    if (dbWorkflowPreview && !dbWorkflowRequiresApprover()) return 'Not required';
    return approverEmail || '—';
}

function syncDbApprovalUiState() {
    const blockedReason = dbWorkflowBlockedReason();
    const requiresApprover = dbWorkflowRequiresApprover();
    const workflowKnown = !!(dbWorkflowPreview && (dbWorkflowPreview.workflow_id || dbWorkflowPreview.blocked_by_guardrail || dbWorkflowPreview.error));
    const autoPerRecipient = getDbRequestMode() === 'others';
    const hideApproverField = autoPerRecipient || dbWorkflowPreviewPending || !!blockedReason || (workflowKnown && !requiresApprover);

    const structuredInput = document.getElementById('dbStructuredApproverEmail');
    const aiInput = document.getElementById('dbAiApproverEmail');
    const structuredField = structuredInput?.closest('.db-structured-field');
    const aiField = aiInput?.closest('.db-structured-field');
    if (structuredField) structuredField.style.display = hideApproverField ? 'none' : '';
    if (aiField) aiField.style.display = hideApproverField ? 'none' : '';
    const adminCanOverride = canDbOverrideApproverEmail();
    [structuredInput, aiInput].forEach(function(input) {
        if (!input) return;
        input.readOnly = !adminCanOverride;
        input.setAttribute('aria-readonly', adminCanOverride ? 'false' : 'true');
        input.title = adminCanOverride
            ? 'Admins can override the approver email when needed.'
            : 'This approver email is locked to your saved reporting manager. Contact NPAMX admins if a fallback approver is required.';
    });
    [structuredField, aiField].forEach(function(field) {
        const hint = field ? field.querySelector('.db-step-hint') : null;
        if (!hint) return;
        hint.textContent = adminCanOverride
            ? 'Auto-filled from the requester profile. Admins can override this when manager fallback or testing is required.'
            : 'Auto-filled from your saved reporting manager profile. If your manager is unavailable, contact NPAMX admins to reroute approval from Pending Approvals.';
    });

    if (workflowKnown && !requiresApprover) {
        syncDbApproverEmail('');
    }
    if (!adminCanOverride && requiresApprover && getDbRequestMode() !== 'others') {
        const lockedDefault = getDbProfileApproverEmail();
        if (lockedDefault && String(getDbApproverEmail() || '').trim().toLowerCase() !== lockedDefault) {
            dbApproverEmailManuallyEdited = false;
            syncDbApproverEmail(lockedDefault);
        }
    }
    if (requiresApprover && getDbRequestMode() !== 'others' && !String(getDbApproverEmail() || '').trim()) {
        ensureDbProfileLoaded(true).then(function() {
            const nextEmail = getDbProfileApproverEmail();
            if (nextEmail) syncDbApproverEmail(nextEmail);
        }).catch(function() {});
    }

    const structuredBtn = document.getElementById('dbStructuredSubmitBtn');
    const aiBtn = document.getElementById('dbAiSubmitBtn');
    if (structuredBtn) structuredBtn.disabled = !!blockedReason || dbWorkflowPreviewPending;
    if (aiBtn) aiBtn.disabled = !!blockedReason || dbWorkflowPreviewPending;
}

function maybeShowDbInstancePolicyPopup(policy) {
    const p = policy || dbInstancePolicy || {};
    if (!p || p.request_allowed !== false) return;
    const reason = String(p.request_block_reason || DEFAULT_DB_POLICY_BLOCK_REASON).trim();
    if (!reason) return;
    const key = JSON.stringify({
        reason: reason,
        account_env: String(p.account_env || '').trim().toLowerCase(),
        data_classification: String(p.data_classification || '').trim().toLowerCase()
    });
    if (key === dbLastPolicyPopupKey) return;
    dbLastPolicyPopupKey = key;
    showDbErrorPopup(reason, [
        'Contact the DevOps team to enable IAM authentication or complete the required RDS/Redshift metadata configuration.',
        'Once IAM authentication is enabled, return here and continue with the access request.'
    ], 'Database Request Blocked');
}

async function refreshDbWorkflowPreview() {
    await ensureDbProfileLoaded(false);
    applyDbProfileDefaults(false);
    updateDbDurationUi();
    const accountId = String(dbRequestDraft?.account_id || '').trim();
    if (!accountId) {
        dbWorkflowPreview = null;
        dbWorkflowPreviewKey = '';
        dbWorkflowPreviewPending = false;
        renderDbWorkflowPreview('', 'info');
        applyDbInstancePolicyNotice(dbInstancePolicy || {});
        syncDbApprovalUiState();
        return;
    }
    const permissions = Array.isArray(dbStructuredPermissions) && dbStructuredPermissions.length
        ? dbStructuredPermissions.slice()
        : (String(dbRequestDraft?.permissions || '').split(',').map(function(item) { return item.trim().toUpperCase(); }).filter(Boolean));
    const selectedInstance = dbRequestDraft?._selectedInstance || {};
    if (dbInstancePolicy?.request_allowed === false || selectedInstance.request_allowed === false || selectedInstance.iam_auth_enabled === false) {
        dbWorkflowPreviewPending = false;
        dbWorkflowPreviewKey = '';
        dbWorkflowPreview = null;
        renderDbWorkflowPreview('', 'info');
        applyDbInstancePolicyNotice(dbInstancePolicy || selectedInstance);
        maybeShowDbInstancePolicyPopup(dbInstancePolicy || selectedInstance);
        syncDbApprovalUiState();
        return;
    }
    if (!permissions.length) {
        dbWorkflowPreview = null;
        dbWorkflowPreviewKey = '';
        dbWorkflowPreviewPending = false;
        renderDbWorkflowPreview('', 'info');
        applyDbInstancePolicyNotice(dbInstancePolicy || selectedInstance);
        syncDbApprovalUiState();
        return;
    }
    const role = deriveStructuredRole(Array.isArray(dbStructuredPermissions) ? dbStructuredPermissions : []);
    const selectedRole = getDbEffectiveIamRoleById(dbSelectedIamRoleId);
    const requestRole = String((selectedRole && selectedRole.request_role) || dbRequestDraft?.role || role || '').trim().toLowerCase() || role;
    const key = JSON.stringify({
        accountId,
        role: requestRole,
        permissions: permissions.slice().sort().join(','),
        instanceId: String(selectedInstance.id || '').trim(),
        region: String(selectedInstance.region || '').trim(),
        accountEnv: String(selectedInstance.account_env || dbInstancePolicy?.account_env || '').trim().toLowerCase(),
        dataClassification: String(selectedInstance.data_classification || dbInstancePolicy?.data_classification || '').trim().toLowerCase(),
        isPii: !!(selectedInstance.is_sensitive_classification || dbInstancePolicy?.is_sensitive_classification),
        dbOwnerEmail: getDbOwnerEmail(),
    });
    if (dbWorkflowPreviewKey === key && dbWorkflowPreview && !dbWorkflowPreview.error && !dbWorkflowPreview.blocked_by_guardrail) {
        const cached = dbWorkflowPreview;
        renderDbWorkflowPreview(
            `Workflow: ${cached.workflow_name || '—'} | ${cached.self_approval_allowed ? 'Self approval' : ('SecOps lead: ' + (cached.security_lead_email || '—'))} | Pending expiry: ${cached.pending_request_expiry_hours || 12}h`,
            'info'
        );
        syncDbApprovalUiState();
        return;
    }
    const previewSeq = ++dbWorkflowPreviewSeq;
    dbWorkflowPreviewPending = true;
    renderDbWorkflowPreview('Checking applicable guardrails and approval workflow...', 'info');
    syncDbApprovalUiState();
    try {
        const res = await fetch(`${DB_API_BASE}/api/databases/workflow-preview`, {
            method: 'POST',
            headers: getDbRequestHeaders(),
            credentials: 'include',
            body: JSON.stringify({
                account_id: accountId,
                db_instance_id: String(selectedInstance.id || '').trim(),
                region: String(selectedInstance.region || '').trim(),
                engine: String(selectedInstance.engine || selectedEngine?.engine || '').trim().toLowerCase(),
                resource_kind: String(selectedInstance.resource_kind || '').trim().toLowerCase(),
                user_emails: getDbRequestRecipientsForSubmission().map(function(item) {
                    return String(item.email || '').trim().toLowerCase();
                }).filter(Boolean),
                permissions,
                role: requestRole,
                iam_role_template_id: String(dbRequestDraft?.iam_role_template_id || '').trim(),
                iam_role_template_name: String(dbRequestDraft?.iam_role_template_name || '').trim(),
                data_classification: String(selectedInstance.data_classification || dbInstancePolicy?.data_classification || '').trim().toLowerCase(),
                is_pii: !!(selectedInstance.is_sensitive_classification || dbInstancePolicy?.is_sensitive_classification),
                db_owner_email: getDbOwnerEmail(),
            })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'No matching approval workflow found.');
        if (previewSeq !== dbWorkflowPreviewSeq) return;
        dbWorkflowPreviewPending = false;
        dbWorkflowPreview = data;
        dbWorkflowPreviewKey = key;
        updateDbDurationUi();
        renderDbWorkflowPreview(
            `Workflow: ${data.workflow_name || '—'} | ${data.self_approval_allowed ? 'Self approval' : ('SecOps lead: ' + (data.security_lead_email || '—'))} | Pending expiry: ${data.pending_request_expiry_hours || 12}h`,
            'info'
        );
        applyDbInstancePolicyNotice(dbInstancePolicy || selectedInstance);
        syncDbApprovalUiState();
    } catch (error) {
        if (previewSeq !== dbWorkflowPreviewSeq) return;
        dbWorkflowPreviewPending = false;
        dbWorkflowPreview = null;
        dbWorkflowPreviewKey = '';
        const message = safeUserFacingErrorMessage(error);
        if (
            message === DB_WRITE_APPROVAL_GUIDANCE
            || message.indexOf('You are not allowed to request write actions') >= 0
            || message.indexOf('cannot use a self-approval workflow') >= 0
        ) {
            dbWorkflowPreview = {
                blocked_by_guardrail: true,
                message: DB_WRITE_APPROVAL_GUIDANCE,
                requires_request_approver: false,
                self_approval_allowed: false
            };
            renderDbWorkflowPreview('', 'info');
            applyDbInstancePolicyNotice(dbInstancePolicy);
            maybeShowDbGuardrailPopup();
            syncDbApprovalUiState();
            return;
        }
        dbWorkflowPreview = {
            error: true,
            message: message,
            requires_request_approver: false,
            self_approval_allowed: false
        };
        renderDbWorkflowPreview(message, 'error');
        applyDbInstancePolicyNotice(dbInstancePolicy || selectedInstance);
        syncDbApprovalUiState();
    }
}

function isDbFeatureEnabled(key, fallback) {
    const defaultValue = (typeof fallback === 'boolean') ? fallback : true;
    if (typeof window.isFeatureEnabled === 'function') {
        try {
            return window.isFeatureEnabled(key);
        } catch (_) {
            return defaultValue;
        }
    }
    return defaultValue;
}

function applyDatabaseFeatureFlags(flags) {
    const f = (flags && typeof flags === 'object')
        ? flags
        : ((typeof window.getCurrentFeatures === 'function') ? window.getCurrentFeatures() : null);
    const aiEnabled = f ? f.database_ai_assistant !== false : isDbFeatureEnabled('database_ai_assistant', true);
    const structuredEnabled = f ? f.databases_structured_access !== false : isDbFeatureEnabled('databases_structured_access', true);
    const calendarEnabled = f ? f.request_calendar !== false : isDbFeatureEnabled('request_calendar', true);

    const aiBtn = document.getElementById('dbModeAiBtn');
    const structuredBtn = document.getElementById('dbModeStructuredBtn');
    if (aiBtn) aiBtn.style.display = aiEnabled ? '' : 'none';
    if (structuredBtn) structuredBtn.style.display = structuredEnabled ? '' : 'none';

    const aiPanel = document.getElementById('dbAiPanel');
    const structuredPanel = document.getElementById('dbStructuredPanel');
    if (!aiEnabled && aiPanel) aiPanel.classList.add('db-ai-panel-hidden');
    if (!structuredEnabled && structuredPanel) structuredPanel.classList.add('db-structured-panel-hidden');

    if (dbAccessMode === 'ai' && !aiEnabled && structuredEnabled) {
        try { setDbAccessMode('structured'); } catch (_) {}
    } else if (dbAccessMode === 'structured' && !structuredEnabled && aiEnabled) {
        try { setDbAccessMode('ai'); } catch (_) {}
    } else if (!aiEnabled && !structuredEnabled) {
        // Keep a deterministic fallback state if both toggles are turned off.
        dbAccessMode = 'structured';
    }

    const dateModeLabel = document.getElementById('dbDurationModeDaterangeLabel');
    const dateModeRadio = document.getElementById('dbDurationModeDaterange');
    const hoursModeRadio = document.getElementById('dbDurationModeHours');
    const dateRangeBlock = document.getElementById('dbDurationDaterangeBlock');
    const hoursBlock = document.getElementById('dbDurationHoursBlock');

    if (dateModeLabel) dateModeLabel.style.display = calendarEnabled ? '' : 'none';
    if (dateModeRadio) {
        dateModeRadio.disabled = !calendarEnabled;
        if (!calendarEnabled && dateModeRadio.checked && hoursModeRadio) {
            hoursModeRadio.checked = true;
        }
    }
    if (!calendarEnabled) {
        if (dateRangeBlock) dateRangeBlock.style.display = 'none';
        if (hoursBlock) hoursBlock.style.display = '';
    }
}

window.applyDatabaseFeatureFlags = applyDatabaseFeatureFlags;

const DB_READ_ONLY_OPS = new Set(['SELECT', 'SHOW', 'EXPLAIN', 'DESCRIBE', 'ANALYZE', 'FIND', 'AGGREGATE']);

function getDbDefaultReadBaseOps(engine) {
    const e = normalizeEngineForStructured(engine);
    if (['documentdb', 'mongodb', 'docdb'].includes(e)) return ['FIND'];
    return ['SELECT'];
}

// Structured permission catalog (engine-specific filtering applied at render time)
const DB_STRUCTURED_PERMISSIONS = [
    {
        id: 'retrieval',
        title: 'Data Retrieval',
        ops: ['SELECT', 'SHOW', 'EXPLAIN', 'DESCRIBE']
    },
    {
        id: 'modification',
        title: 'Data Modification',
        ops: ['INSERT', 'UPDATE', 'DELETE', 'MERGE']
    },
    {
        id: 'schema',
        title: 'Schema Modification',
        ops: ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME']
    },
    {
        id: 'index',
        title: 'Index & Performance',
        ops: ['CREATE INDEX', 'DROP INDEX', 'ANALYZE']
    }
];

// AWS engines that use Account -> Instance -> DB name -> Chat flow (RDS, Redshift, DocumentDB)
const AWS_CHAT_FLOW_ENGINES = ['mysql', 'postgres', 'aurora', 'maria', 'mssql', 'documentdb', 'redshift'];

// Tree structure: category -> engines
const DB_TREE = [
    {
        id: 'rds',
        label: 'Amazon RDS',
        icon: 'fas fa-database',
        children: [
            { id: 'rds-mysql', label: 'MySQL', engine: 'mysql', provider: 'aws' },
            { id: 'rds-mssql', label: 'MSSQL', engine: 'mssql', provider: 'aws' },
            { id: 'rds-postgres', label: 'PostgreSQL', engine: 'postgres', provider: 'aws' },
            { id: 'rds-aurora', label: 'Aurora', engine: 'aurora', provider: 'aws' },
            { id: 'rds-maria', label: 'MariaDB', engine: 'maria', provider: 'aws' },
        ]
    },
    {
        id: 'managed',
        label: 'Managed Database',
        icon: 'fas fa-server',
        children: [
            { id: 'mdb-mysql', label: 'MySQL', engine: 'mysql', provider: 'managed' },
            { id: 'mdb-postgres', label: 'PostgreSQL', engine: 'postgres', provider: 'managed' },
            { id: 'mdb-mongodb', label: 'MongoDB', engine: 'mongodb', provider: 'managed' },
            { id: 'mdb-mssql', label: 'MSSQL', engine: 'mssql', provider: 'managed' },
        ]
    },
    {
        id: 'docdb',
        label: 'Document DB',
        icon: 'fas fa-file-alt',
        children: [
            { id: 'docdb-aws', label: 'Amazon DocumentDB', engine: 'documentdb', provider: 'aws' },
        ]
    },
    {
        id: 'redshift',
        label: 'Redshift',
        icon: 'fas fa-chart-line',
        children: [
            { id: 'redshift-aws', label: 'Amazon Redshift', engine: 'redshift', provider: 'aws' },
        ]
    },
    {
        id: 'mongodb-atlas',
        label: 'MongoDB Atlas',
        icon: 'fas fa-leaf',
        children: [
            { id: 'atlas-mongodb', label: 'MongoDB Atlas', engine: 'mongodb', provider: 'atlas' },
        ]
    },
    {
        id: 'gcp',
        label: 'Google Cloud',
        icon: 'fas fa-cloud',
        children: [
            { id: 'gcp-sql', label: 'Cloud SQL', engine: 'cloudsql', provider: 'gcp' },
            { id: 'gcp-bigquery', label: 'BigQuery', engine: 'bigquery', provider: 'gcp' },
        ]
    },
    // Azure & Oracle: Governix only (removed for nykaa-jit)
];

function renderDbTree() {
    const container = document.getElementById('dbTreeContainer');
    if (!container) return;
    let html = '';
    DB_TREE.forEach((cat, i) => {
        const catId = `db-cat-${cat.id}`;
        const openClass = '';  // All collapsed by default - user clicks to expand
        const chevronOpen = '';
        html += `<div class="db-tree-category">
            <div class="db-tree-node db-tree-parent" onclick="toggleDbTreeCategory('${catId}')">
                <i class="fas fa-chevron-right db-tree-chevron${chevronOpen}"></i>
                <i class="${cat.icon} db-tree-icon"></i>
                <span>${cat.label}</span>
            </div>
            <div id="${catId}" class="db-tree-children${openClass}">`;
        (cat.children || []).forEach(child => {
            const engId = child.id;
            html += `<div class="db-tree-node db-tree-leaf" onclick="selectDbEngine('${engId}', '${child.label}', '${child.engine}')">
                <i class="fas fa-database db-tree-icon"></i>
                <span>${child.label}</span>
            </div>`;
        });
        html += `</div></div>`;
    });
    container.innerHTML = html;
}

function toggleDbTreeCategory(catId) {
    const el = document.getElementById(catId);
    const parent = el?.closest('.db-tree-category');
    const chevron = parent?.querySelector('.db-tree-chevron');
    if (el) {
        el.classList.toggle('db-tree-open');
        if (chevron) chevron.classList.toggle('db-tree-chevron-open');
    }
}

function selectDbEngine(engId, label, engine) {
    selectedEngine = { id: engId, label, engine };
    const child = DB_TREE.flatMap(c => c.children || []).find(ch => ch.id === engId);
    const provider = child?.provider || engId.split('-')[0];
    document.querySelectorAll('.db-tree-leaf').forEach(n => n.classList.remove('db-tree-leaf-active'));
    const leaf = document.querySelector(`.db-tree-leaf[onclick*="'${engId}'"]`);
    if (leaf) leaf.classList.add('db-tree-leaf-active');
    // Show step panel, hide AI panel
    const aiPanel = document.getElementById('dbAiPanel');
    if (aiPanel) aiPanel.classList.add('db-ai-panel-hidden');
    const structuredPanel = document.getElementById('dbStructuredPanel');
    if (structuredPanel) structuredPanel.classList.add('db-structured-panel-hidden');
    dbRequestDraft = { engine, provider, databases: [] };
    dbStepState = { step: 1, provider };
    selectedDatabases = [];
    dbStructuredPermissions = [];
    resetDbInstancePolicy();
    applyDbInstancePolicyNotice(null);
    showDbStepPanel();
    renderDbStepContent();
}

function showDbStepPanel() {
    const panel = document.getElementById('dbStepPanel');
    if (panel) {
        panel.classList.remove('db-step-hidden');
        document.getElementById('dbStepTitle').textContent = selectedEngine ? `${selectedEngine.label} — Configure` : 'Configure';
    }
}

function closeDbStepPanel() {
    const panel = document.getElementById('dbStepPanel');
    if (panel) panel.classList.add('db-step-hidden');
    selectedEngine = null;
    dbStepState = null;
    dbConversationId = null;
    dbStructuredPermissions = [];
    dbRequestRecipients = [];
    dbRequestDraft = null;
    resetDbInstancePolicy();
    applyDbInstancePolicyNotice(null);
}

function closeDbAiPanel() {
    const aiPanel = document.getElementById('dbAiPanel');
    if (aiPanel) aiPanel.classList.add('db-ai-panel-hidden');
    const stepPanel = document.getElementById('dbStepPanel');
    if (stepPanel) stepPanel.classList.add('db-step-hidden');
    const structuredPanel = document.getElementById('dbStructuredPanel');
    if (structuredPanel) structuredPanel.classList.add('db-structured-panel-hidden');
    selectedEngine = null;
    dbStepState = null;
    dbConversationId = null;
    dbStructuredPermissions = [];
    dbRequestRecipients = [];
    dbRequestDraft = null;
    resetDbInstancePolicy();
    applyDbInstancePolicyNotice(null);
}

function closeDbStructuredPanel() {
    const structuredPanel = document.getElementById('dbStructuredPanel');
    if (structuredPanel) structuredPanel.classList.add('db-structured-panel-hidden');
    const stepPanel = document.getElementById('dbStepPanel');
    if (stepPanel) stepPanel.classList.add('db-step-hidden');
    const aiPanel = document.getElementById('dbAiPanel');
    if (aiPanel) aiPanel.classList.add('db-ai-panel-hidden');
    selectedEngine = null;
    dbStepState = null;
    dbConversationId = null;
    dbStructuredPermissions = [];
    dbRequestRecipients = [];
    dbRequestDraft = null;
    resetDbInstancePolicy();
    applyDbInstancePolicyNotice(null);
}

function openStructuredDatabaseAccess() {
    try {
        if (isDbFeatureEnabled('databases_structured_access', true)) {
            setDbAccessMode('structured');
        } else {
            setDbAccessMode('ai');
        }
    } catch (_) {}
    if (typeof showPage === 'function') showPage('databases');
    Promise.resolve(ensureDbProfileLoaded(false)).then(function() {
        applyDbProfileDefaults(true);
        if (dbRequestDraft?.account_id) refreshDbWorkflowPreview();
    }).catch(function() {});
}

function setDbAccessMode(mode) {
    const aiEnabled = isDbFeatureEnabled('database_ai_assistant', true);
    const structuredEnabled = isDbFeatureEnabled('databases_structured_access', true);
    let m = (mode || '').toLowerCase() === 'structured' ? 'structured' : 'ai';
    if (m === 'ai' && !aiEnabled && structuredEnabled) {
        m = 'structured';
    } else if (m === 'structured' && !structuredEnabled && aiEnabled) {
        m = 'ai';
    } else if (!aiEnabled && !structuredEnabled) {
        m = 'structured';
    }
    dbAccessMode = m;
    const aiBtn = document.getElementById('dbModeAiBtn');
    const stBtn = document.getElementById('dbModeStructuredBtn');
    if (aiBtn) {
        const active = m === 'ai';
        aiBtn.classList.toggle('is-active', active);
        aiBtn.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if (stBtn) {
        const active = m === 'structured';
        stBtn.classList.toggle('is-active', active);
        stBtn.setAttribute('aria-selected', active ? 'true' : 'false');
    }

    // If a panel is already visible, switch without losing selection.
    const aiPanel = document.getElementById('dbAiPanel');
    const structuredPanel = document.getElementById('dbStructuredPanel');
    const stepPanel = document.getElementById('dbStepPanel');
    const selectionComplete = !!(selectedEngine && Array.isArray(selectedDatabases) && selectedDatabases.length);
    const stepHidden = !!(stepPanel && stepPanel.classList.contains('db-step-hidden'));

    if (m === 'structured') {
        if (aiPanel) aiPanel.classList.add('db-ai-panel-hidden');
        if (selectionComplete && stepHidden) {
            transitionToDbStructuredUI();
        } else if (structuredPanel && !structuredPanel.classList.contains('db-structured-panel-hidden')) {
            hydrateStructuredSummary();
        }
    } else {
        if (structuredPanel) structuredPanel.classList.add('db-structured-panel-hidden');
        if (selectionComplete && stepHidden) {
            transitionToDbChatUI();
        }
    }

    // If the wizard is open, update the CTA label to match the selected mode.
    try { updateDbStepNextButton(); } catch (_) {}
}

async function renderDbStepContent() {
    const content = document.getElementById('dbStepContent');
    if (!content || !dbStepState || !selectedEngine) return;
    const { step, provider } = dbStepState;

    if (provider === 'aws') {
        const useChatFlow = AWS_CHAT_FLOW_ENGINES.includes((selectedEngine.engine || '').toLowerCase());
        if (step === 1) {
            const accounts = await fetchAccounts();
            content.innerHTML = `
                <div class="db-step-field">
                    <label>Select AWS Account</label>
                    <select id="dbStepAccount" class="db-step-select" onchange="onDbStepAccountChange()">
                        <option value="">-- Select Account --</option>
                        ${accounts.map(a => `<option value="${a.id}">${a.name || a.id}</option>`).join('')}
                    </select>
                </div>
            `;
        } else if (step === 2 && useChatFlow) {
            const accountId = document.getElementById('dbStepAccount')?.value || dbRequestDraft?.account_id;
            const targetMeta = getDbTargetUiMeta(selectedEngine?.engine);
            content.innerHTML = `<div class="db-step-loading"><i class="fas fa-spinner fa-spin"></i> Fetching ${escapeHtml(targetMeta.plural.toLowerCase())}…</div>`;
            const result = await fetchDatabasesForAccount(accountId, selectedEngine?.engine);
            const dbs = result.databases || [];
            if (result.error) {
                showDbErrorPopup(result.error, result.instructions, 'Unable to List ' + targetMeta.plural);
            } else if (accountId && !dbs.length) {
                showDbErrorPopup(
                    'No ' + targetMeta.plural.toLowerCase() + ' found for the selected account in this region.',
                    [
                        'Verify the selected account has ' + targetMeta.plural.toLowerCase() + ' in the selected region.',
                        'If DevOps exposes replica-only databases, confirm those replicas exist and are visible to the PAM role.',
                        'Check the backend IAM role has read permissions for the selected service.'
                    ],
                    'No ' + targetMeta.plural + ' Found'
                );
            } else {
                dbLastFetchError = null;
            }
            content.innerHTML = `
                <div class="db-step-field">
                    <label>Select ${escapeHtml(targetMeta.singular)} <span style="color:#c62828;">*</span></label>
                    ${(result.error || (accountId && !dbs.length)) ? `<div class="db-step-error-bar"><span class="db-error-reopen" onclick="reopenDbErrorPopup()" title="View details">&#128577; ${escapeHtml(result.error ? ('Unable to list ' + targetMeta.plural) : ('No ' + targetMeta.plural.toLowerCase() + ' found'))} — Click to see details</span> <button class="btn-secondary btn-sm" onclick="retryDbFetch()" style="margin-left:8px">Retry</button></div>` : ''}
                    <select id="dbStepInstanceSelect" class="db-step-select">
                        <option value="">-- Select ${escapeHtml(targetMeta.singular)} --</option>
                        ${dbs.map(db => {
                            const selected = String(dbRequestDraft?._selectedInstance?.id || '') === String(db.id || '') ? ' selected' : '';
                            const roleHint = db.topology_role === 'replica'
                                ? ` [Replica${db.source_instance_id ? ' of ' + db.source_instance_id : ''}]`
                                : (db.topology_role === 'cluster' ? ' [Cluster]' : '');
                            return `<option value="${escapeAttr(db.id)}"
                                data-name="${escapeAttr(db.name || db.id)}"
                                data-region="${escapeAttr(db.region || '')}"
                                data-engine="${escapeAttr((db.engine || selectedEngine.engine || '').toLowerCase())}"
                                data-auth-mode="${escapeAttr(db.auth_mode || '')}"
                                data-resource-kind="${escapeAttr(db.resource_kind || '')}"
                                data-iam-auth-enabled="${escapeAttr(String(!!db.iam_auth_enabled))}"
                                data-password-auth-enabled="${escapeAttr(String(db.password_auth_enabled !== false))}"
                                data-db-resource-id="${escapeAttr(db.db_resource_id || '')}"
                                data-account-env="${escapeAttr(db.account_env || '')}"
                                data-data-classification="${escapeAttr(db.data_classification || '')}"
                                data-is-sensitive-classification="${escapeAttr(String(!!db.is_sensitive_classification))}"
                                data-enforce-read-only="${escapeAttr(String(!!db.enforce_read_only))}"
                                data-tags-present="${escapeAttr(String(db.tags_present !== false))}"
                                data-request-allowed="${escapeAttr(String(db.request_allowed !== false))}"
                                data-request-block-reason="${escapeAttr(db.request_block_reason || '')}"${selected}>${escapeHtml(db.id + roleHint)}</option>`;
                        }).join('')}
                    </select>
                    <small class="db-step-hint">Select the target ${escapeHtml(targetMeta.singular.toLowerCase())}, then continue with the request details.</small>
                </div>
            `;
        } else if (step === 3 && useChatFlow) {
            const scopeMeta = getDbRequestScopeMeta(selectedEngine?.engine);
            content.innerHTML = `
                <div class="db-step-field">
                    <label>${escapeHtml(scopeMeta.databaseLabel)} Name <span style="color:#c62828;">*</span></label>
                    <div class="db-step-dbname-shell">
                        <i class="fas fa-table"></i>
                        <input type="text" id="dbStepDbName" placeholder="e.g. mydb" class="db-step-input" value="${escapeAttr(dbRequestDraft?.requested_database_name || dbRequestDraft?.db_name || '')}">
                    </div>
                </div>
            `;
        } else if (step === 4 && useChatFlow) {
            const scopeMeta = getDbRequestScopeMeta(selectedEngine?.engine);
            const schemaField = scopeMeta.schemaVisible ? `
                <div class="db-step-field">
                    <label>${escapeHtml(scopeMeta.schemaLabel)} Name ${scopeMeta.schemaRequired ? '<span style="color:#c62828;">*</span>' : '<span style="color:#5f6b7a;">(Optional)</span>'}</label>
                    <div class="db-step-dbname-shell">
                        <i class="fas fa-sitemap"></i>
                        <input type="text" id="dbStepSchemaName" placeholder="${escapeAttr(scopeMeta.schemaPlaceholder)}" class="db-step-input" value="${escapeAttr(dbRequestDraft?.requested_schema_name || '')}">
                    </div>
                </div>
            ` : '';
            content.innerHTML = `
                ${schemaField}
                <div class="db-step-field">
                    <label>${escapeHtml(scopeMeta.objectLabel)} Name ${scopeMeta.objectRequired ? '<span style="color:#c62828;">*</span>' : '<span style="color:#5f6b7a;">(Optional)</span>'}</label>
                    <div class="db-step-dbname-shell">
                        <i class="fas fa-layer-group"></i>
                        <input type="text" id="dbStepTableName" placeholder="${escapeAttr(scopeMeta.objectPlaceholder)}" class="db-step-input" value="${escapeAttr(dbRequestDraft?.requested_table_name || '')}">
                    </div>
                    <small class="db-step-hint">A specific ${escapeHtml(scopeMeta.objectLabel.toLowerCase())} is required so NPAMX can avoid broad database-wide access.</small>
                </div>
                <div class="db-step-field">
                    <label>${escapeHtml(scopeMeta.detailLabel)} ${scopeMeta.detailRequired ? '<span style="color:#c62828;">*</span>' : '<span style="color:#5f6b7a;">(Optional)</span>'}</label>
                    <div class="db-step-dbname-shell">
                        <i class="fas fa-list"></i>
                        <input type="text" id="dbStepDetailName" placeholder="${escapeAttr(scopeMeta.detailPlaceholder)}" class="db-step-input" value="${escapeAttr(dbRequestDraft?.requested_column_name || '')}">
                    </div>
                    <small class="db-step-hint">A specific ${escapeHtml(scopeMeta.detailLabel.toLowerCase())} is required so access remains scoped away from PII-heavy objects.</small>
                </div>
            `;
        } else if (step === 2 && !useChatFlow) {
            const accountId = document.getElementById('dbStepAccount')?.value || dbRequestDraft?.account_id;
            const targetMeta = getDbTargetUiMeta(selectedEngine?.engine);
            content.innerHTML = `<div class="db-step-loading"><i class="fas fa-spinner fa-spin"></i> Fetching databases…</div>`;
            const result = await fetchDatabasesForAccount(accountId, selectedEngine?.engine);
            const dbs = result.databases || [];
            if (result.error) {
                showDbErrorPopup(result.error, result.instructions, 'Unable to List ' + targetMeta.plural);
            } else if (accountId && !dbs.length) {
                showDbErrorPopup(
                    'No ' + targetMeta.plural.toLowerCase() + ' found for the selected account in this region.',
                    [
                        'Verify the selected account has ' + targetMeta.plural.toLowerCase() + ' in the selected region.',
                        'If DevOps exposes replica-only databases, confirm those replicas exist and are visible to the PAM role.',
                        'Check the backend IAM role has read permissions for the selected service.'
                    ],
                    'No ' + targetMeta.plural + ' Found'
                );
            } else {
                dbLastFetchError = null;
            }
            const emptyMsg = result.error
                ? 'Could not list databases. Check permissions or enter an identifier manually.'
                : 'No databases found in this account.';
            content.innerHTML = `
                ${result.error ? `<div class="db-step-error-bar"><span class="db-error-reopen" onclick="reopenDbErrorPopup()" title="View error details">&#128577; Unable to list databases — Click to see instructions</span> <button class="btn-secondary btn-sm" onclick="retryDbFetch()" style="margin-left:8px">Retry</button></div>` : ''}
                ${dbs.length ? `
                <div class="db-step-toolbar">
                    <div class="db-step-toolbar-left">
                        <span class="db-step-count"><i class="fas fa-database"></i> <span id="dbStepDbCount">${dbs.length}</span> Databases</span>
                        <span class="db-step-toolbar-subtle">Select one or more databases.</span>
                    </div>
                    <div class="db-step-search">
                        <i class="fas fa-search"></i>
                        <input type="text" id="dbStepDbSearch" placeholder="Search database name or engine..." oninput="filterDbStepDatabases()">
                    </div>
                </div>` : ''}
                <div class="db-step-field">
                    <label>Select Database(s)</label>
                    <div id="dbStepDbList" class="db-step-db-list">
	                        ${dbs.length ? dbs.map(db => {
	                            const eng = (db.engine || selectedEngine.engine || 'mysql').toString().toLowerCase();
	                            const searchText = escapeAttr(`${db.name} ${db.engine}`.toLowerCase());
	                            return `<label class="db-discover-item">
	                                <input type="checkbox"
                                        value="${escapeAttr(db.id)}"
                                        data-name="${escapeAttr(db.name)}"
                                        data-engine="${escapeAttr(eng)}"
                                        data-auth-mode="${escapeAttr(db.auth_mode || '')}"
                                        data-resource-kind="${escapeAttr(db.resource_kind || '')}"
                                        data-iam-auth-enabled="${escapeAttr(String(!!db.iam_auth_enabled))}"
                                        data-password-auth-enabled="${escapeAttr(String(db.password_auth_enabled !== false))}"
                                        data-db-resource-id="${escapeAttr(db.db_resource_id || '')}"
                                        data-region="${escapeAttr(db.region || '')}"
                                        data-account-env="${escapeAttr(db.account_env || '')}"
                                        data-data-classification="${escapeAttr(db.data_classification || '')}"
                                        data-is-sensitive-classification="${escapeAttr(String(!!db.is_sensitive_classification))}"
                                        data-enforce-read-only="${escapeAttr(String(!!db.enforce_read_only))}"
                                        data-tags-present="${escapeAttr(String(db.tags_present !== false))}"
                                        data-request-allowed="${escapeAttr(String(db.request_allowed !== false))}"
                                        data-request-block-reason="${escapeAttr(db.request_block_reason || '')}"
                                        onchange="toggleDbStepSelection()">
	                                <span data-search="${searchText}">
	                                    <strong>${escapeHtml(db.name)}</strong>
	                                    <small>${escapeHtml(db.engine)}</small>
	                                </span>
	                            </label>`;
	                        }).join('') : `<p class="db-step-empty">${emptyMsg}</p>
	                        <div class="db-step-manual-toggle">
	                            <button type="button" class="btn-secondary btn-sm" onclick="toggleDbManualEntry()">Or enter an identifier manually</button>
	                        </div>
	                        <div id="dbManualEntry" class="db-manual-entry" style="display:none">
	                            <div class="db-step-field"><label>Database Identifier</label><input type="text" id="dbStepInstanceId" placeholder="e.g. database-1" class="db-step-input"></div>
	                            <div class="db-step-field"><label>Database Name</label><input type="text" id="dbStepDbName" placeholder="e.g. mydb" class="db-step-input"></div>
	                        </div>`}
	                    </div>
	                    <p id="dbStepDbEmptyFiltered" class="db-step-empty db-step-empty-filter" style="display:none;">No databases match your search.</p>
                </div>
            `;
        }
    } else if (provider === 'managed') {
        if (step === 1) {
            const accounts = await fetchAccounts();
            content.innerHTML = `
                <div class="db-step-field">
                    <label>Select Account</label>
                    <select id="dbStepAccount" class="db-step-select">
                        <option value="">-- Select Account --</option>
                        ${accounts.map(a => `<option value="${a.id}">${a.name || a.id}</option>`).join('')}
                    </select>
                </div>
                <div class="db-step-field">
                    <label>Server IP Address</label>
                    <input type="text" id="dbStepServerIp" placeholder="e.g. 10.0.1.50 or db.internal.company.com" class="db-step-input">
                </div>
            `;
        }
    } else if (provider === 'gcp') {
        const projects = await fetchGcpProjects();
        content.innerHTML = `
            <div class="db-step-field">
                <label>Select GCP Project</label>
                <select id="dbStepProject" class="db-step-select">
                    <option value="">-- Select Project --</option>
                    ${projects.map(p => `<option value="${p.id}">${p.name || p.id}</option>`).join('')}
                </select>
            </div>
        `;
    } else if (provider === 'azure') {
        const subs = await fetchAzureSubscriptions();
        content.innerHTML = `
            <div class="db-step-field">
                <label>Select Azure Subscription</label>
                <select id="dbStepSubscription" class="db-step-select">
                    <option value="">-- Select Subscription --</option>
                    ${subs.map(s => `<option value="${s.id}">${s.name || s.id}</option>`).join('')}
                </select>
            </div>
        `;
    } else if (provider === 'oracle') {
        const compartments = await fetchOracleCompartments();
        content.innerHTML = `
            <div class="db-step-field">
                <label>Select Oracle Compartment</label>
                <select id="dbStepCompartment" class="db-step-select">
                    <option value="">-- Select Compartment --</option>
                    ${compartments.map(c => `<option value="${c.id}">${c.name || c.id}</option>`).join('')}
                </select>
            </div>
        `;
    } else if (provider === 'atlas') {
        const projects = await fetchMongoAtlasProjects();
        content.innerHTML = `
            <div class="db-step-field">
                <label>Select MongoDB Atlas Project / Cluster</label>
                <select id="dbStepAtlasProject" class="db-step-select">
                    <option value="">-- Select Project / Cluster --</option>
                    ${projects.map(p => `<option value="${p.id}">${p.name || p.id}</option>`).join('')}
                </select>
            </div>
        `;
    }
    updateDbStepNextButton();
}

async function fetchAccounts() {
    window.__npamReadCache = window.__npamReadCache || {};
    const cache = window.__npamReadCache.db_accounts || (window.__npamReadCache.db_accounts = { data: null, ts: 0, promise: null });
    const now = Date.now();
    if (cache.promise) return cache.promise;
    if (Array.isArray(cache.data) && (now - cache.ts) < 15000) {
        return cache.data;
    }
    try {
        cache.promise = fetch(`${DB_API_BASE}/api/accounts?scope=requester`, { credentials: 'include' })
            .then(async function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                const data = await r.json();
                const normalized = typeof data === 'object' && !Array.isArray(data) ? Object.values(data) : (data || []);
                const filtered = normalized.filter(function(account) {
                    return account && account.visible_to_requesters !== false;
                });
                cache.data = filtered;
                cache.ts = Date.now();
                return filtered;
            })
            .finally(function() {
                cache.promise = null;
            });
        return await cache.promise;
    } catch (e) {
        return [];
    }
}

async function fetchDatabasesForAccount(accountId, engine) {
    if (!accountId) return { databases: [], error: null, instructions: [] };
    const apiBase = (typeof API_BASE !== 'undefined' ? API_BASE : (window.API_BASE || (window.location.origin + '/api')));
    const url = `${apiBase}/databases?account_id=${encodeURIComponent(accountId)}${engine ? '&engine=' + encodeURIComponent(engine) : ''}`;
    try {
        const r = await fetch(url, { credentials: 'include' });
        const contentType = (r.headers.get('Content-Type') || '').toLowerCase();
        if (!contentType.includes('application/json')) {
            return {
                databases: [],
                error: r.ok ? 'Server returned non-JSON. Check API URL.' : `Server returned ${r.status} (not JSON). Backend may be down or URL wrong.`,
                instructions: [
                    'Check that the backend server is running and reachable.',
                    'If frontend and backend are on different origins, ensure CORS is configured and the API base URL points to the backend (for example, https://your-host/api).'
                ]
            };
        }
        const data = await r.json();
        if (!r.ok) {
            return {
                databases: [],
                error: data.error || `Request failed (${r.status})`,
                instructions: data.instructions || ['Check that the backend server is running and reachable.']
            };
        }
        return {
            databases: data.databases || [],
            error: data.error || null,
            instructions: data.instructions || []
        };
    } catch (e) {
        const msg = (e && e.message) || 'Failed to fetch RDS instances';
        const isJsonError = /invalid json|unexpected token|is not valid JSON/i.test(msg);
        return {
            databases: [],
            error: isJsonError ? 'Backend returned HTML instead of JSON. Is the API URL correct and backend running?' : msg,
            instructions: [
                'Check that the backend server is running and reachable.',
                'Ensure the API base URL points to your backend (for example, https://your-host/api), not the frontend.',
                'Ensure CORS is configured if frontend and backend are on different origins.'
            ]
        };
    }
}

let dbLastFetchError = null;

function getDbTargetUiMeta(engine) {
    const normalized = normalizeEngineForStructured(engine);
    if (normalized === 'athena') {
        return { singular: 'Workgroup', plural: 'Workgroups' };
    }
    if (normalized === 'redshift') {
        return { singular: 'Redshift Cluster', plural: 'Redshift Clusters' };
    }
    if (normalized === 'mongodb') {
        return { singular: 'MongoDB Cluster', plural: 'MongoDB Clusters' };
    }
    if (normalized === 'documentdb') {
        return { singular: 'DocumentDB Cluster', plural: 'DocumentDB Clusters' };
    }
    return { singular: 'RDS Instance', plural: 'RDS Instances' };
}

function getDbTargetLabel(engine, resourceKind) {
    const kind = String(resourceKind || '').trim().toLowerCase();
    if (kind === 'redshift_cluster') return 'Redshift Cluster';
    return getDbTargetUiMeta(engine).singular;
}

function showDbErrorPopup(error, instructions, title) {
    dbLastFetchError = { error, instructions, title };
    const popup = document.getElementById('dbErrorPopup');
    if (!popup) return;
    const titleEl = popup.querySelector('.db-error-title');
    if (titleEl) titleEl.textContent = title || 'Unable to List RDS Instances';
    popup.querySelector('.db-error-msg').textContent = error || 'Unable to list RDS instances';
    const list = popup.querySelector('.db-error-instructions');
    list.innerHTML = (instructions || []).map(i => `<li>${escapeHtml(i)}</li>`).join('');
    popup.classList.add('db-error-popup-show');
}

function hideDbErrorPopup() {
    const popup = document.getElementById('dbErrorPopup');
    if (popup) popup.classList.remove('db-error-popup-show');
}

function reopenDbErrorPopup() {
    if (dbLastFetchError) {
        showDbErrorPopup(dbLastFetchError.error, dbLastFetchError.instructions, dbLastFetchError.title);
    }
}

async function retryDbFetch() {
    if (!dbStepState || !selectedEngine) return;
    await renderDbStepContent();
}

function toggleDbManualEntry() {
    const el = document.getElementById('dbManualEntry');
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function fetchGcpProjects() {
    try {
        const r = await fetch(`${DB_API_BASE}/api/gcp/projects`, { credentials: 'include' });
        const data = await r.json();
        return data.projects || data || [];
    } catch (e) {
        return [];
    }
}

async function fetchAzureSubscriptions() {
    try {
        const r = await fetch(`${DB_API_BASE}/api/azure/subscriptions`, { credentials: 'include' });
        const data = await r.json();
        return data.subscriptions || data || [];
    } catch (e) {
        return [];
    }
}

async function fetchOracleCompartments() {
    try {
        const r = await fetch(`${DB_API_BASE}/api/oracle/compartments`, { credentials: 'include' });
        const data = await r.json();
        return data.compartments || data || [];
    } catch (e) {
        return [];
    }
}

async function fetchMongoAtlasProjects() {
    try {
        const r = await fetch(`${DB_API_BASE}/api/mongodb-atlas/projects`, { credentials: 'include' });
        const data = await r.json();
        return data.projects || data || [];
    } catch (e) {
        return [];
    }
}

function onDbStepAccountChange() {
    dbRequestDraft = dbRequestDraft || {};
    dbRequestDraft.account_id = document.getElementById('dbStepAccount')?.value || '';
    dbWorkflowPreview = null;
    dbWorkflowPreviewKey = '';
    applyDbProfileDefaults(false);
    refreshDbWorkflowPreview();
}

function resetDbInstancePolicy() {
    dbInstancePolicy = {
        account_env: '',
        data_classification: '',
        is_sensitive_classification: false,
        enforce_read_only: false,
        tags_present: true,
        request_allowed: true,
        request_block_reason: ''
    };
}

function extractDbPolicyFromSourceEl(sourceEl) {
    if (!sourceEl) return null;
    return {
        account_env: (sourceEl.getAttribute('data-account-env') || '').toLowerCase(),
        data_classification: sourceEl.getAttribute('data-data-classification') || '',
        is_sensitive_classification: String(sourceEl.getAttribute('data-is-sensitive-classification') || '').toLowerCase() === 'true',
        enforce_read_only: String(sourceEl.getAttribute('data-enforce-read-only') || '').toLowerCase() === 'true',
        tags_present: String(sourceEl.getAttribute('data-tags-present') || '').toLowerCase() === 'true',
        request_allowed: String(sourceEl.getAttribute('data-request-allowed') || '').toLowerCase() !== 'false',
        request_block_reason: sourceEl.getAttribute('data-request-block-reason') || ''
    };
}

function isReadOnlyDbOperation(op) {
    const v = String(op || '').trim().toUpperCase();
    return DB_READ_ONLY_OPS.has(v);
}

function enforceStructuredPermissionPolicy() {
    const selectedRole = getDbSelectedIamRole();
    const selectedRoleType = String((selectedRole && selectedRole.request_role) || '').trim().toLowerCase();
    if (selectedRoleType === 'read_only') {
        const baseActions = getDbRoleActionList(selectedRole);
        const selectedSet = new Set((dbStructuredPermissions || []).map(function(item) {
            return String(item || '').trim().toUpperCase();
        }).filter(Boolean));
        baseActions.forEach(function(action) { selectedSet.add(action); });
        dbStructuredPermissions = Array.from(selectedSet).filter(function(action) {
            return DB_READ_ONLY_OPS.has(action);
        });
    }
    applyDbInstancePolicyNotice(dbInstancePolicy);
}

function applyDbInstancePolicyNotice(policy) {
    const noticeEl = document.getElementById('dbInstancePolicyNotice');
    if (!noticeEl) return;
    const p = policy || dbInstancePolicy || {};
    const blockedReason = dbWorkflowBlockedReason();
    const selectedInstance = dbRequestDraft?._selectedInstance || {};
    const instanceMetadataBlocked = !!getDbInstanceBlockedReason() || (!!p && p.request_allowed === false) || selectedInstance.request_allowed === false || selectedInstance.iam_auth_enabled === false;
    if (dbWorkflowPreviewPending) {
        noticeEl.style.display = 'block';
        noticeEl.className = 'db-policy-notice db-policy-notice-warning';
        noticeEl.textContent = 'Checking applicable guardrails and approval workflow...';
        return;
    }
    if (instanceMetadataBlocked) {
        noticeEl.style.display = 'block';
        noticeEl.className = 'db-policy-notice db-policy-notice-error';
        noticeEl.textContent = getDbInstanceBlockedReason() || blockedReason || DEFAULT_DB_POLICY_BLOCK_REASON;
        return;
    }
    if (blockedReason) {
        if (dbWorkflowPreview && dbWorkflowPreview.blocked_by_guardrail) {
            noticeEl.style.display = 'none';
            noticeEl.className = 'db-policy-notice';
            noticeEl.textContent = '';
        } else {
            noticeEl.style.display = 'block';
            noticeEl.className = 'db-policy-notice db-policy-notice-error';
            noticeEl.textContent = blockedReason;
        }
        return;
    }
    if (!p || p.request_allowed !== false) {
        noticeEl.style.display = 'none';
        noticeEl.className = 'db-policy-notice';
        noticeEl.textContent = '';
        return;
    }
    noticeEl.style.display = 'none';
}

function onDbStepInstanceSelect(radio) {
    if (!radio) return;
    dbRequestDraft = dbRequestDraft || {};
    const policy = extractDbPolicyFromSourceEl(radio);
    dbInstancePolicy = policy || dbInstancePolicy;
    dbLastPolicyPopupKey = '';
    dbRequestDraft._selectedInstance = {
        id: radio.value,
        name: radio.getAttribute('data-name'),
        engine: radio.getAttribute('data-engine'),
        resource_kind: radio.getAttribute('data-resource-kind') || '',
        auth_mode: radio.getAttribute('data-auth-mode') || '',
        iam_auth_enabled: String(radio.getAttribute('data-iam-auth-enabled') || '').toLowerCase() === 'true',
        password_auth_enabled: String(radio.getAttribute('data-password-auth-enabled') || '').toLowerCase() !== 'false',
        db_resource_id: radio.getAttribute('data-db-resource-id') || '',
        region: radio.getAttribute('data-region') || '',
        account_env: policy?.account_env || '',
        data_classification: policy?.data_classification || '',
        is_sensitive_classification: !!policy?.is_sensitive_classification,
        enforce_read_only: !!policy?.enforce_read_only,
        tags_present: policy?.tags_present !== false,
        request_allowed: policy?.request_allowed !== false,
        request_block_reason: policy?.request_block_reason || ''
    };
    applyDbInstancePolicyNotice(dbInstancePolicy);
    applyDbProfileDefaults(true);
    maybeShowDbInstancePolicyPopup(dbInstancePolicy);
    refreshDbWorkflowPreview();
    if (!document.getElementById('dbStructuredPanel')?.classList.contains('db-structured-panel-hidden')) {
        refreshDbStructuredAccessCatalog(selectedEngine?.engine || radio.getAttribute('data-engine') || '');
    }
}

function renderDbStepSelectedInstanceMeta(sourceEl) {
    const meta = document.getElementById('dbStepSelectedInstanceMeta');
    if (!meta) return;
    if (!sourceEl || !sourceEl.value) {
        meta.style.display = 'none';
        meta.innerHTML = '';
        return;
    }

    const engine = (sourceEl.getAttribute('data-engine') || selectedEngine?.engine || 'mysql').toUpperCase();
    const defaultDb = sourceEl.getAttribute('data-name') || 'default';
    meta.innerHTML = `
        <i class="fas fa-circle-check"></i>
        <span><strong>${escapeHtml(sourceEl.value)}</strong> | ${escapeHtml(engine)} | default DB <strong>${escapeHtml(defaultDb)}</strong></span>
    `;
    meta.style.display = 'flex';
}

function onDbStepInstanceDropdownChange(selectEl) {
    if (!selectEl) return;
    const selected = selectEl.options[selectEl.selectedIndex];
    if (!selected || !selected.value) {
        dbRequestDraft = dbRequestDraft || {};
        dbRequestDraft._selectedInstance = null;
        resetDbInstancePolicy();
        dbEffectiveIamRoles = [];
        dbSelectedIamRoleId = '';
        renderDbEffectiveIamRoles();
        renderDbStepSelectedInstanceMeta(null);
        applyDbInstancePolicyNotice(null);
        return;
    }
    onDbStepInstanceSelect(selected);
    renderDbStepSelectedInstanceMeta(selected);
}

function toggleDbStepSelection() {
    const checkboxes = document.querySelectorAll('#dbStepDbList input:checked');
    selectedDatabases = Array.from(checkboxes).map(cb => ({
        id: cb.value,
        name: cb.getAttribute('data-name'),
        engine: cb.getAttribute('data-engine')
    }));
    const firstSelected = checkboxes[0] || null;
    dbRequestDraft = dbRequestDraft || {};
    if (!firstSelected) {
        dbRequestDraft._selectedInstance = null;
        resetDbInstancePolicy();
        dbEffectiveIamRoles = [];
        dbSelectedIamRoleId = '';
        renderDbEffectiveIamRoles();
        applyDbInstancePolicyNotice(null);
        dbWorkflowPreview = null;
        dbWorkflowPreviewKey = '';
        renderDbWorkflowPreview('', 'info');
        syncDbApprovalUiState();
        return;
    }
    const policy = extractDbPolicyFromSourceEl(firstSelected);
    dbInstancePolicy = policy || dbInstancePolicy;
    dbRequestDraft._selectedInstance = {
        id: firstSelected.value,
        name: firstSelected.getAttribute('data-name'),
        engine: firstSelected.getAttribute('data-engine'),
        resource_kind: firstSelected.getAttribute('data-resource-kind') || '',
        auth_mode: firstSelected.getAttribute('data-auth-mode') || '',
        iam_auth_enabled: String(firstSelected.getAttribute('data-iam-auth-enabled') || '').toLowerCase() === 'true',
        password_auth_enabled: String(firstSelected.getAttribute('data-password-auth-enabled') || '').toLowerCase() !== 'false',
        db_resource_id: firstSelected.getAttribute('data-db-resource-id') || '',
        region: firstSelected.getAttribute('data-region') || '',
        account_env: policy?.account_env || '',
        data_classification: policy?.data_classification || '',
        is_sensitive_classification: !!policy?.is_sensitive_classification,
        enforce_read_only: !!policy?.enforce_read_only,
        tags_present: policy?.tags_present !== false,
        request_allowed: policy?.request_allowed !== false,
        request_block_reason: policy?.request_block_reason || ''
    };
    applyDbInstancePolicyNotice(dbInstancePolicy);
    maybeShowDbInstancePolicyPopup(dbInstancePolicy);
    refreshDbWorkflowPreview();
    if (!document.getElementById('dbStructuredPanel')?.classList.contains('db-structured-panel-hidden')) {
        refreshDbStructuredAccessCatalog(selectedEngine?.engine || firstSelected.getAttribute('data-engine') || '');
    }
}

function filterDbStepInstances() {
    const query = (document.getElementById('dbStepInstanceSearch')?.value || '').trim().toLowerCase();
    const emptyState = document.getElementById('dbStepInstanceEmptyFiltered');
    const countEl = document.getElementById('dbStepInstanceCount');
    const select = document.getElementById('dbStepInstanceSelect');

    if (select) {
        const options = Array.from(select.options).filter(opt => !!opt.value);
        let visible = 0;
        let hiddenSelected = false;

        options.forEach(opt => {
            const searchText = (opt.getAttribute('data-search') || opt.textContent || '').toLowerCase();
            const isVisible = !query || searchText.includes(query);
            opt.hidden = !isVisible;
            if (isVisible) visible += 1;
            if (opt.selected && !isVisible) hiddenSelected = true;
        });

        if (hiddenSelected) {
            select.value = '';
            dbRequestDraft = dbRequestDraft || {};
            dbRequestDraft._selectedInstance = null;
            resetDbInstancePolicy();
            renderDbStepSelectedInstanceMeta(null);
            applyDbInstancePolicyNotice(null);
        }

        if (countEl) countEl.textContent = String(visible);
        if (emptyState) emptyState.style.display = visible === 0 && options.length > 0 ? 'block' : 'none';
        return;
    }

    const cards = Array.from(document.querySelectorAll('#dbStepInstanceList .db-instance-card'));
    let visible = 0;
    cards.forEach(card => {
        const searchText = (card.textContent || '').toLowerCase();
        const isVisible = !query || searchText.includes(query);
        card.style.display = isVisible ? '' : 'none';
        if (isVisible) visible += 1;
    });
    if (countEl) countEl.textContent = String(visible);
    if (emptyState) emptyState.style.display = visible === 0 && cards.length > 0 ? 'block' : 'none';
}

function filterDbStepDatabases() {
    const query = (document.getElementById('dbStepDbSearch')?.value || '').trim().toLowerCase();
    const rows = Array.from(document.querySelectorAll('#dbStepDbList .db-discover-item'));
    const emptyState = document.getElementById('dbStepDbEmptyFiltered');
    const countEl = document.getElementById('dbStepDbCount');
    let visible = 0;

    rows.forEach(row => {
        const searchText = (row.textContent || '').toLowerCase();
        const isVisible = !query || searchText.includes(query);
        row.style.display = isVisible ? '' : 'none';
        if (isVisible) visible += 1;
    });

    if (countEl) countEl.textContent = String(visible);
    if (emptyState) emptyState.style.display = visible === 0 && rows.length > 0 ? 'block' : 'none';
}

function applyDbNameSuggestion(name) {
    const input = document.getElementById('dbStepDbName');
    if (!input || !name) return;
    const existing = (input.value || '').trim();
    if (!existing) {
        input.value = name;
    } else {
        const values = existing.split(',').map(s => s.trim()).filter(Boolean);
        if (!values.includes(name)) {
            values.push(name);
            input.value = values.join(', ');
        }
    }
    input.focus();
}

function applyDbTableSuggestion(name) {
    const input = document.getElementById('dbStepTableName');
    if (!input || !name) return;
    const existing = (input.value || '').trim();
    if (!existing) {
        input.value = name;
    } else {
        const values = existing.split(',').map(s => s.trim()).filter(Boolean);
        if (!values.includes(name)) {
            values.push(name);
            input.value = values.join(', ');
        }
    }
    input.focus();
}

function updateDbStepNextButton() {
    const btn = document.getElementById('dbStepNextBtn');
    if (!btn || !dbStepState || !selectedEngine) return;
    const { step, provider } = dbStepState;
    const useChatFlow = provider === 'aws' && AWS_CHAT_FLOW_ENGINES.includes((selectedEngine.engine || '').toLowerCase());
    const finalLabel = dbAccessMode === 'structured' ? 'Continue to Permissions' : 'Continue to NPAMx';
    let label = 'Continue';

    if (provider === 'aws' && useChatFlow) {
        if (step === 1) label = `Next: ${getDbTargetUiMeta(selectedEngine?.engine).singular}`;
        else if (step === 2) label = 'Next: Database Name';
        else if (step === 3) label = 'Next: Schema & Table';
        else label = finalLabel;
    } else if (provider === 'aws' && !useChatFlow) {
        label = step === 1 ? 'Next: Databases' : finalLabel;
    } else {
        label = finalLabel;
    }

    btn.innerHTML = `<i class="fas fa-arrow-right"></i> ${label}`;
}

async function dbStepNext() {
    if (!dbStepState || !selectedEngine) return;
    const { step, provider } = dbStepState;
    dbRequestDraft = dbRequestDraft || {};
    const useChatFlow = provider === 'aws' && AWS_CHAT_FLOW_ENGINES.includes((selectedEngine.engine || '').toLowerCase());

    if (provider === 'aws') {
        if (step === 1) {
            const accountId = document.getElementById('dbStepAccount')?.value;
            if (!accountId) {
                alert('Please select an AWS account.');
                return;
            }
            dbRequestDraft.account_id = accountId;
            resetDbInstancePolicy();
            applyDbInstancePolicyNotice(null);
            dbStepState.step = 2;
            renderDbStepContent();
            return;
        }
        if (step === 2 && useChatFlow) {
            const instanceSelect = document.getElementById('dbStepInstanceSelect');
            const selectedOption = instanceSelect && instanceSelect.options ? instanceSelect.options[instanceSelect.selectedIndex] : null;
            const selectedInstanceId = instanceSelect?.value?.trim() || '';
            if (!selectedInstanceId) {
                alert(`Please select the ${getDbTargetUiMeta(selectedEngine?.engine).singular}.`);
                return;
            }
            onDbStepInstanceSelect(selectedOption);
            if (dbInstancePolicy?.request_allowed === false) {
                alert(dbInstancePolicy.request_block_reason || DEFAULT_DB_POLICY_BLOCK_REASON);
                return;
            }
            dbRequestDraft.requested_instance_input = selectedInstanceId;
            dbStepState.step = 3;
            renderDbStepContent();
            return;
        }
        if (step === 3 && useChatFlow) {
            const inst = dbRequestDraft._selectedInstance || {};
            const dbNameInput = document.getElementById('dbStepDbName')?.value?.trim() || '';
            if (!dbNameInput) {
                alert('Please enter the Database Name.');
                return;
            }
            selectedDatabases = [{
                id: inst.id || 'manual',
                name: dbNameInput,
                engine: inst.engine || selectedEngine.engine
            }];
            dbRequestDraft.db_name = dbNameInput;
            dbRequestDraft.requested_database_name = dbNameInput;
            dbStepState.step = 4;
            renderDbStepContent();
            return;
        }
        if (step === 4 && useChatFlow) {
            const scopeMeta = getDbRequestScopeMeta(selectedEngine?.engine);
            const schemaInput = document.getElementById('dbStepSchemaName')?.value?.trim() || '';
            const tableInput = document.getElementById('dbStepTableName')?.value?.trim() || '';
            const detailInput = document.getElementById('dbStepDetailName')?.value?.trim() || '';
            if (scopeMeta.schemaRequired && !schemaInput) {
                alert(`Please enter the ${scopeMeta.schemaLabel} Name.`);
                return;
            }
            if (scopeMeta.objectRequired && !tableInput) {
                alert(`Please enter the ${scopeMeta.objectLabel} Name.`);
                return;
            }
            const tables = tableInput.split(',').map(s => s.trim()).filter(Boolean);
            dbRequestDraft.requested_schema_name = schemaInput;
            dbRequestDraft.requested_table_name = tableInput;
            dbRequestDraft.requested_tables = tables;
            dbRequestDraft.requested_column_name = detailInput;
            transitionToDbFinalPanel();
            return;
        }
        if (step === 2 && !useChatFlow) {
            const result = await fetchDatabasesForAccount(dbRequestDraft.account_id, selectedEngine?.engine);
            const dbs = result.databases || [];
            const manualInstanceId = document.getElementById('dbStepInstanceId')?.value?.trim();
            const manualDbName = document.getElementById('dbStepDbName')?.value?.trim() || 'default';
            if (dbs.length && selectedDatabases.length === 0 && !manualInstanceId) {
                alert('Please select at least one database or enter an identifier manually.');
                return;
            }
            if (!dbs.length || manualInstanceId) {
                if (!manualInstanceId) {
                    alert('Please enter the database identifier.');
                    return;
                }
                selectedDatabases = [{ id: manualInstanceId, name: manualDbName, engine: selectedEngine.engine }];
            }
        }
    } else if (provider === 'managed') {
        const accountId = document.getElementById('dbStepAccount')?.value;
        const serverIp = document.getElementById('dbStepServerIp')?.value?.trim();
        if (!accountId || !serverIp) {
            alert('Please select an account and enter the server IP address.');
            return;
        }
        dbRequestDraft.account_id = accountId;
        dbRequestDraft.host = serverIp;
        selectedDatabases = [{ id: 'managed', name: 'default', host: serverIp, port: 3306, engine: selectedEngine.engine }];
    } else if (provider === 'gcp') {
        const projectId = document.getElementById('dbStepProject')?.value;
        if (!projectId) {
            alert('Please select a GCP project.');
            return;
        }
        dbRequestDraft.project_id = projectId;
        selectedDatabases = [{ id: projectId, name: 'default', host: `${projectId}.gcp.sql`, port: 3306, engine: selectedEngine.engine }];
    } else if (provider === 'azure') {
        const subId = document.getElementById('dbStepSubscription')?.value;
        if (!subId) {
            alert('Please select an Azure subscription.');
            return;
        }
        dbRequestDraft.subscription_id = subId;
        selectedDatabases = [{ id: subId, name: 'default', host: `${subId}.azure.sql`, port: 1433, engine: selectedEngine.engine }];
    } else if (provider === 'oracle') {
        const compId = document.getElementById('dbStepCompartment')?.value;
        if (!compId) {
            alert('Please select an Oracle compartment.');
            return;
        }
        dbRequestDraft.compartment_id = compId;
        selectedDatabases = [{ id: compId, name: 'default', host: `${compId}.oracle.adb`, port: 1522, engine: selectedEngine.engine }];
    } else if (provider === 'atlas') {
        const projectId = document.getElementById('dbStepAtlasProject')?.value;
        if (!projectId) {
            alert('Please select a MongoDB Atlas project/cluster.');
            return;
        }
        dbRequestDraft.atlas_project_id = projectId;
        selectedDatabases = [{ id: projectId, name: 'default', host: `${projectId}.mongodb.net`, port: 27017, engine: 'mongodb' }];
    }

    // All steps complete — hide step panel, show the selected access mode panel
    document.getElementById('dbStepPanel').classList.add('db-step-hidden');
    if (dbAccessMode === 'structured') {
        transitionToDbStructuredUI();
    } else {
        document.getElementById('dbAiEngineLabel').textContent = selectedEngine.label;
        document.getElementById('dbAiPanel').classList.remove('db-ai-panel-hidden');
        initDbAiChat(selectedEngine.label, selectedEngine.engine);
    }
}

function transitionToDbChatUI() {
    const stepPanel = document.getElementById('dbStepPanel');
    const aiPanel = document.getElementById('dbAiPanel');
    if (stepPanel) stepPanel.classList.add('db-step-hidden');
    if (aiPanel) aiPanel.classList.remove('db-ai-panel-hidden');
    applyDbInstancePolicyNotice(dbInstancePolicy);
    refreshDbRequestRecipientUi();
    document.getElementById('dbAiEngineLabel').textContent = selectedEngine?.label || 'Database';
    dbApproverEmailManuallyEdited = false;
    applyDbProfileDefaults(true);
    syncDbApprovalUiState();
    refreshDbWorkflowPreview();
    initDbChatWithPrompts(selectedEngine?.label || 'Database', selectedEngine?.engine || 'mysql');
}

async function transitionToDbStructuredUI() {
    const stepPanel = document.getElementById('dbStepPanel');
    const structuredPanel = document.getElementById('dbStructuredPanel');
    const aiPanel = document.getElementById('dbAiPanel');
    if (stepPanel) stepPanel.classList.add('db-step-hidden');
    if (aiPanel) aiPanel.classList.add('db-ai-panel-hidden');
    if (structuredPanel) structuredPanel.classList.remove('db-structured-panel-hidden');
    const label = selectedEngine?.label || 'Database';
    const engine = (selectedEngine?.engine || '').toLowerCase();
    const engineLabel = document.getElementById('dbStructuredEngineLabel');
    if (engineLabel) engineLabel.textContent = label;
    applyDbInstancePolicyNotice(dbInstancePolicy);
    refreshDbRequestRecipientUi();
    dbApproverEmailManuallyEdited = false;
    applyDbProfileDefaults(true);
    await refreshDbStructuredAccessCatalog(engine);
    enforceStructuredPermissionPolicy();
    if (typeof initDbDurationMode === 'function' && !document.getElementById('dbDurationModeHours')?.dataset.dbDurationInited) {
        initDbDurationMode();
        const el = document.getElementById('dbDurationModeHours');
        if (el) el.dataset.dbDurationInited = 'true';
    }
    hydrateStructuredSummary();
    syncDbApprovalUiState();
    refreshDbWorkflowPreview();
}

function transitionToDbFinalPanel() {
    if (dbAccessMode === 'structured') transitionToDbStructuredUI();
    else transitionToDbChatUI();
}

function dbAssistantAvatar(variant = 'avatar') {
    return `<div class="db-ai-msg-avatar db-ai-msg-avatar-assistant">${dbMermaidSvg({ variant })}</div>`;
}

function dbMermaidSvg(opts = {}) {
    const variant = opts.variant || 'avatar'; // 'avatar' | 'loader'
    const extraClass = opts.className ? ` ${opts.className}` : '';
    const aria = variant === 'loader' ? 'aria-label="NPAMx thinking"' : 'aria-label="NPAMx"';
    // Custom lightweight vector mermaid (no external assets).
    // Generate unique ids per SVG instance to avoid <defs> id collisions.
    const uid = `npamx-${variant}-${Math.random().toString(16).slice(2, 10)}`;
    const ids = {
        bg: `${uid}-bg`,
        glow: `${uid}-glow`,
        water: `${uid}-water`,
        hair: `${uid}-hair`,
        skin: `${uid}-skin`,
        clip: `${uid}-clip`
    };
    return `
<svg class="npamx-mermaid-svg npamx-mermaid-${escapeAttr(variant)}${escapeAttr(extraClass)}" viewBox="0 0 64 64" width="40" height="40" role="img" ${aria} focusable="false">
  <defs>
    <linearGradient id="${escapeAttr(ids.bg)}" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0b1220"/>
      <stop offset="0.55" stop-color="#0f1d33"/>
      <stop offset="1" stop-color="#0a1424"/>
    </linearGradient>
    <linearGradient id="${escapeAttr(ids.glow)}" x1="10" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="rgba(56,189,248,0.55)"/>
      <stop offset="1" stop-color="rgba(20,184,166,0.22)"/>
    </linearGradient>
    <linearGradient id="${escapeAttr(ids.water)}" x1="6" y1="38" x2="60" y2="62" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="rgba(56,189,248,0.22)"/>
      <stop offset="0.55" stop-color="rgba(20,184,166,0.16)"/>
      <stop offset="1" stop-color="rgba(14,165,233,0.08)"/>
    </linearGradient>
    <linearGradient id="${escapeAttr(ids.hair)}" x1="18" y1="16" x2="46" y2="40" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#38bdf8"/>
      <stop offset="0.6" stop-color="#14b8a6"/>
      <stop offset="1" stop-color="#0ea5e9"/>
    </linearGradient>
    <linearGradient id="${escapeAttr(ids.skin)}" x1="24" y1="18" x2="40" y2="34" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="rgba(255,255,255,0.92)"/>
      <stop offset="1" stop-color="rgba(226,232,240,0.78)"/>
    </linearGradient>
    <clipPath id="${escapeAttr(ids.clip)}">
      <circle cx="32" cy="32" r="29"/>
    </clipPath>
  </defs>
  <g clip-path="url(#${escapeAttr(ids.clip)})">
    <circle cx="32" cy="32" r="30" fill="url(#${escapeAttr(ids.bg)})"/>
    <circle class="npamx-ring" cx="32" cy="32" r="29" fill="none" stroke="url(#${escapeAttr(ids.glow)})" stroke-width="2"/>

    <g class="npamx-mermaid-body">
      <path class="npamx-hair" d="M22 30C18 22 20 14 28 12C35 10 41 12 45 17C48 21 48 28 44 33C41 36 37 36 35 33C34 31 33 29 32 27C31 29 30 31 29 33C27 36 23 36 22 33C21 32 21 31 22 30Z" fill="url(#${escapeAttr(ids.hair)})"/>
      <circle class="npamx-face" cx="32" cy="26" r="10" fill="url(#${escapeAttr(ids.skin)})"/>
      <path class="npamx-fin" d="M36 34C39 34 42 36 44 39C41 40 38 40 36 38C35 37 35 35 36 34Z" fill="rgba(56,189,248,0.35)"/>
      <path class="npamx-tail" d="M28 36C26 40 27 44 30 46C33 48 35 50 36 54C33 53 30 52 28 50C24 47 23 41 26 36Z" fill="rgba(20,184,166,0.28)"/>
      <path class="npamx-eye" d="M28.6 26.6C29.6 25.6 30.8 25.6 31.8 26.6" stroke="rgba(15,23,42,0.55)" stroke-width="1.6" stroke-linecap="round" fill="none"/>
      <path class="npamx-eye" d="M32.2 26.6C33.2 25.6 34.4 25.6 35.4 26.6" stroke="rgba(15,23,42,0.55)" stroke-width="1.6" stroke-linecap="round" fill="none"/>
    </g>

    <g class="npamx-water">
      <path class="npamx-water-fill" d="M6 40C14 36 18 44 26 40C34 36 38 44 46 40C54 36 58 44 60 40L60 64L6 64Z" fill="url(#${escapeAttr(ids.water)})"/>
      <path class="npamx-water-line" d="M6 40C14 36 18 44 26 40C34 36 38 44 46 40C54 36 58 44 60 40" stroke="rgba(226,232,240,0.35)" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path class="npamx-ripple" d="M12 47C20 43 24 51 32 47C40 43 44 51 52 47" stroke="rgba(56,189,248,0.35)" stroke-width="1.6" stroke-linecap="round" fill="none"/>
      <g class="npamx-typing-dots" opacity="0.9">
        <circle class="npamx-dot npamx-dot1" cx="24" cy="52" r="1.6" fill="rgba(226,232,240,0.72)"/>
        <circle class="npamx-dot npamx-dot2" cx="32" cy="52" r="1.6" fill="rgba(226,232,240,0.72)"/>
        <circle class="npamx-dot npamx-dot3" cx="40" cy="52" r="1.6" fill="rgba(226,232,240,0.72)"/>
      </g>
    </g>
  </g>
</svg>`;
}

function initDbAiChat(label, engine) {
    const chat = document.getElementById('dbAiChat');
    if (chat) chat.innerHTML = '';
    const msg = `Hey hi. What do you need to do on ${label} (debug errors, check schema, or fix data)?`;
    appendDbChatMessage({ role: 'assistant', rawText: msg, htmlContent: renderDbRichText(msg), cssClass: 'db-ai-welcome' });
    const quickPrompts = document.getElementById('dbAiQuickPrompts');
    if (quickPrompts) {
        quickPrompts.style.display = 'none';
        quickPrompts.innerHTML = '';
    }
    const thinkingEl = document.getElementById('dbAiThinking');
    if (thinkingEl) thinkingEl.style.display = 'none';
    document.getElementById('dbAiRequestSummary').style.display = 'none';
    document.getElementById('dbAiActions').style.display = 'none';
}

function initDbChatWithPrompts(label, engine) {
    dbRequestDraft = dbRequestDraft || {};
    dbRequestDraft.duration_hours = dbRequestDraft.duration_hours || 2;
    const chat = document.getElementById('dbAiChat');
    const quickPrompts = document.getElementById('dbAiQuickPrompts');
    const dbNames = selectedDatabases?.map(d => d.name).join(', ') || 'database';
    const tableNames = Array.isArray(dbRequestDraft.requested_tables) && dbRequestDraft.requested_tables.length
        ? dbRequestDraft.requested_tables.join(', ')
        : '';
    if (chat) chat.innerHTML = '';
    const msg = tableNames
        ? `Great, ${dbNames} and table(s) ${tableNames} are selected. What do you need to do (debug errors, check schema, or fix data)?`
        : `Great, ${dbNames} is selected. What do you need to do (debug errors, check schema, or fix data)?`;
    appendDbChatMessage({ role: 'assistant', rawText: msg, htmlContent: renderDbRichText(msg), cssClass: 'db-ai-welcome' });
    if (quickPrompts) {
        quickPrompts.style.display = 'none';
        quickPrompts.innerHTML = '';
    }
    const thinkingEl = document.getElementById('dbAiThinking');
    if (thinkingEl) thinkingEl.style.display = 'none';
    document.getElementById('dbAiRequestSummary').style.display = 'none';
    document.getElementById('dbAiActions').style.display = 'none';
}

function sendDbAiPrompt(message) {
    document.getElementById('dbAiInput').value = message;
    sendDbAiMessage();
}

function normalizeEngineForStructured(engine) {
    const e = String(engine || '').toLowerCase();
    if (!e) return '';
    if (e.includes('athena')) return 'athena';
    if (e.includes('documentdb') || e === 'docdb') return 'documentdb';
    if (e.includes('mongodb') || e.includes('mongo')) return 'mongodb';
    if (e.includes('redshift')) return 'redshift';
    if (e.includes('postgres')) return 'postgres';
    if (e.includes('aurora')) return e.includes('mysql') ? 'mysql' : 'aurora';
    if (e.includes('maria')) return 'maria';
    if (e.includes('sqlserver') || e.includes('sql_server') || e.includes('mssql')) return 'mssql';
    if (e.includes('mysql')) return 'mysql';
    return e;
}

function getDbRequestScopeMeta(engine) {
    const e = normalizeEngineForStructured(engine);
    if (['mysql', 'maria', 'aurora'].includes(e)) {
        return {
            databaseLabel: 'Database',
            schemaVisible: false,
            schemaRequired: false,
            schemaLabel: 'Schema',
            schemaPlaceholder: 'e.g. public',
            objectLabel: 'Table',
            objectPluralLabel: 'Tables',
            objectRequired: true,
            objectPlaceholder: 'e.g. customers',
            detailLabel: 'Column',
            detailRequired: true,
            detailPlaceholder: 'e.g. customer_id'
        };
    }
    if (['postgres', 'redshift'].includes(e)) {
        return {
            databaseLabel: 'Database',
            schemaVisible: true,
            schemaRequired: true,
            schemaLabel: 'Schema',
            schemaPlaceholder: 'e.g. public',
            objectLabel: 'Table',
            objectPluralLabel: 'Tables',
            objectRequired: true,
            objectPlaceholder: 'e.g. customers',
            detailLabel: 'Column',
            detailRequired: true,
            detailPlaceholder: 'e.g. customer_id'
        };
    }
    if (e === 'athena') {
        return {
            databaseLabel: 'Database',
            schemaVisible: false,
            schemaRequired: false,
            schemaLabel: 'Schema',
            schemaPlaceholder: '',
            objectLabel: 'Table',
            objectPluralLabel: 'Tables',
            objectRequired: true,
            objectPlaceholder: 'e.g. orders',
            detailLabel: 'Column',
            detailRequired: true,
            detailPlaceholder: 'e.g. order_id'
        };
    }
    if (['documentdb', 'mongodb', 'docdb'].includes(e)) {
        return {
            databaseLabel: 'Database',
            schemaVisible: false,
            schemaRequired: false,
            schemaLabel: 'Schema',
            schemaPlaceholder: '',
            objectLabel: 'Collection',
            objectPluralLabel: 'Collections',
            objectRequired: true,
            objectPlaceholder: 'e.g. orders',
            detailLabel: 'Document Scope',
            detailRequired: true,
            detailPlaceholder: 'e.g. orderId=12345'
        };
    }
    return {
        databaseLabel: 'Database',
        schemaVisible: true,
        schemaRequired: true,
        schemaLabel: 'Schema',
        schemaPlaceholder: 'e.g. public',
        objectLabel: 'Table',
        objectPluralLabel: 'Tables',
        objectRequired: true,
        objectPlaceholder: 'e.g. customers',
        detailLabel: 'Column',
        detailRequired: true,
        detailPlaceholder: 'e.g. customer_id'
    };
}

function getStructuredPermissionGroupsForEngine(engine) {
    const e = normalizeEngineForStructured(engine);
    const isMysql = ['mysql', 'maria', 'aurora'].includes(e);
    const isPostgres = ['postgres', 'postgresql'].includes(e);
    const isMssql = ['mssql', 'sqlserver', 'sql_server'].includes(e);
    const isRedshift = ['redshift'].includes(e);
    const isAthena = ['athena'].includes(e);
    const isDoc = ['documentdb', 'mongodb', 'docdb'].includes(e);

    // Default: SQL-like set.
    let groups = DB_STRUCTURED_PERMISSIONS.map(g => ({ ...g, ops: [...g.ops] }));

    if (isMysql) {
        return [
            { id: 'mysql_read', title: 'Data Retrieval', ops: ['SELECT'] },
            { id: 'mysql_read_extra', title: 'Additional Read Access', ops: ['SHOW', 'EXPLAIN', 'DESCRIBE', 'ANALYZE'] },
            { id: 'mysql_write', title: 'Data Modification', ops: ['INSERT', 'UPDATE', 'DELETE'] }
        ];
    } else if (isPostgres) {
        return [
            { id: 'postgres_read', title: 'Data Retrieval', ops: ['SELECT'] },
            { id: 'postgres_read_extra', title: 'Additional Read Access', ops: ['SHOW', 'EXPLAIN', 'DESCRIBE'] },
            { id: 'postgres_write', title: 'Data Modification', ops: ['INSERT', 'UPDATE', 'DELETE'] },
            { id: 'postgres_schema', title: 'Schema Access', ops: ['USAGE'] }
        ];
    } else if (isRedshift) {
        return [
            { id: 'redshift_read', title: 'Data Retrieval', ops: ['SELECT'] },
            { id: 'redshift_read_extra', title: 'Additional Read Access', ops: ['SHOW', 'EXPLAIN', 'DESCRIBE'] },
            { id: 'redshift_write', title: 'Data Modification', ops: ['INSERT', 'UPDATE', 'DELETE'] },
            { id: 'redshift_schema', title: 'Schema Access', ops: ['USAGE'] }
        ];
    } else if (isAthena) {
        return [
            { id: 'athena_read', title: 'Query Access', ops: ['SELECT'] }
        ];
    } else if (isDoc) {
        // No SQL permissions for DocumentDB/Mongo.
        return [
            { id: 'doc_read', title: 'Data Retrieval', ops: ['FIND', 'AGGREGATE'] },
            { id: 'doc_write', title: 'Data Modification', ops: ['INSERT', 'UPDATE', 'DELETE'] },
            { id: 'doc_index', title: 'Index', ops: ['CREATE INDEX', 'DROP INDEX'] }
        ];
    } else if (isMssql) {
        // MSSQL supports MERGE.
    }

    // Remove empty groups.
    groups = groups.filter(g => (g.ops || []).length);
    return groups;
}

async function refreshDbRequestableActions() {
    const selectedInstance = dbRequestDraft?._selectedInstance || {};
    const accountId = String(dbRequestDraft?.account_id || '').trim();
    const fallback = ['SELECT', 'SHOW', 'EXPLAIN', 'DESCRIBE', 'ANALYZE', 'FIND', 'AGGREGATE'];
    if (!accountId || !selectedInstance.id) {
        dbVisiblePermissionOps = fallback.slice();
        dbStructuredPermissions = (dbStructuredPermissions || []).filter(function(op) {
            return dbVisiblePermissionOps.indexOf(String(op || '').trim().toUpperCase()) >= 0;
        });
        return;
    }
    try {
        const targetEmails = getDbRequestRecipientsForSubmission().map(function(item) {
            return String(item.email || '').trim().toLowerCase();
        }).filter(Boolean);
        const res = await fetch(`${DB_API_BASE}/api/databases/requestable-actions`, {
            method: 'POST',
            headers: getDbRequestHeaders(),
            credentials: 'include',
            body: JSON.stringify({
                account_id: accountId,
                db_instance_id: String(selectedInstance.id || '').trim(),
                user_emails: targetEmails
            })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Failed to load allowed actions.');
        const visible = Array.isArray(data.visible_actions) ? data.visible_actions.map(function(op) {
            return String(op || '').trim().toUpperCase();
        }).filter(Boolean) : fallback.slice();
        dbVisiblePermissionOps = visible.length ? visible : fallback.slice();
    } catch (_) {
        dbVisiblePermissionOps = fallback.slice();
    }
    dbStructuredPermissions = (dbStructuredPermissions || []).filter(function(op) {
        return dbVisiblePermissionOps.indexOf(String(op || '').trim().toUpperCase()) >= 0;
    });
}

function renderStructuredPermissionGroups(engine) {
    const container = document.getElementById('dbStructuredPermGroups');
    const selectedContainer = document.getElementById('dbStructuredSelected');
    if (!container || !selectedContainer) return;

    const visibleOps = new Set((dbVisiblePermissionOps || []).map(function(op) {
        return String(op || '').trim().toUpperCase();
    }));
    const selectedRoleType = getDbSelectedIamRoleType();
    if (selectedRoleType === 'read_only') {
        Array.from(visibleOps).forEach(function(op) {
            if (!DB_READ_ONLY_OPS.has(op)) visibleOps.delete(op);
        });
    }
    const groups = getStructuredPermissionGroupsForEngine(engine).map(function(group) {
        return {
            ...group,
            ops: (group.ops || []).filter(function(op) {
                return visibleOps.has(String(op || '').trim().toUpperCase());
            })
        };
    }).filter(function(group) { return (group.ops || []).length; });
    container.innerHTML = groups.map(g => `
        <div class="db-perm-group" data-group="${escapeAttr(g.id)}">
            <div class="db-perm-group-title">${escapeHtml(g.title)}</div>
            <div class="db-perm-btns">
                ${(g.ops || []).map(op => `
                    <button
                        type="button"
                        class="db-perm-btn"
                        data-op="${escapeAttr(op)}"
                    >${escapeHtml(op)}</button>
                `).join('')}
            </div>
        </div>
    `).join('');

    // Event delegation (only bind once)
    if (container.dataset.bound !== 'true') {
        container.dataset.bound = 'true';
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.db-perm-btn');
            if (!btn) return;
            e.preventDefault();
            toggleStructuredPermission(btn.getAttribute('data-op') || '');
        });
    }

    if (selectedContainer.dataset.bound !== 'true') {
        selectedContainer.dataset.bound = 'true';
        selectedContainer.addEventListener('click', (e) => {
            const rm = e.target.closest('[data-remove-op]');
            if (!rm) return;
            e.preventDefault();
            const op = rm.getAttribute('data-remove-op') || '';
            removeStructuredPermission(op);
        });
    }

    // Sync UI state
    enforceStructuredPermissionPolicy();
    syncStructuredPermissionUI();
}

function toggleStructuredPermission(op) {
    const perm = String(op || '').trim();
    if (!perm) return;
    const selectedRole = getDbSelectedIamRole();
    const selectedRoleType = String((selectedRole && selectedRole.request_role) || '').trim().toLowerCase();
    if (selectedRoleType === 'read_only' && !DB_READ_ONLY_OPS.has(perm.toUpperCase())) {
        return;
    }
    if (selectedRoleType === 'read_only') {
        const baseActions = new Set(getDbRoleActionList(selectedRole));
        if (baseActions.has(perm.toUpperCase())) {
            if (typeof window.notifyApp === 'function') {
                window.notifyApp('Included in role', 'This action is already part of the selected Read Only role.', 'info');
            }
            return;
        }
    }
    const idx = dbStructuredPermissions.indexOf(perm);
    if (idx >= 0) dbStructuredPermissions.splice(idx, 1);
    else dbStructuredPermissions.push(perm);
    syncStructuredPermissionUI();
    hydrateStructuredSummary();
}

function removeStructuredPermission(op) {
    const perm = String(op || '').trim();
    if (!perm) return;
    const selectedRole = getDbSelectedIamRole();
    const selectedRoleType = String((selectedRole && selectedRole.request_role) || '').trim().toLowerCase();
    if (selectedRoleType === 'read_only') {
        const baseActions = new Set(getDbRoleActionList(selectedRole));
        if (baseActions.has(perm.toUpperCase())) {
            return;
        }
    }
    dbStructuredPermissions = dbStructuredPermissions.filter(p => p !== perm);
    syncStructuredPermissionUI();
    hydrateStructuredSummary();
}

function syncStructuredPermissionUI() {
    const container = document.getElementById('dbStructuredPermGroups');
    const selectedContainer = document.getElementById('dbStructuredSelected');
    if (!container || !selectedContainer) return;
    syncDbSelectedIamRoleWithPermissions();

    const selected = new Set(dbStructuredPermissions);
    container.querySelectorAll('.db-perm-btn').forEach(btn => {
        const op = btn.getAttribute('data-op') || '';
        btn.classList.toggle('is-selected', selected.has(op));
    });

    if (!dbStructuredPermissions.length) {
        selectedContainer.innerHTML = `<div class="db-perm-selected-empty">${getDbSelectedIamRoleType() === 'read_only' ? 'No extra read actions selected.' : 'Select one or more permissions above.'}</div>`;
        applyDbInstancePolicyNotice(dbInstancePolicy);
        refreshDbWorkflowPreview();
        return;
    }
    selectedContainer.innerHTML = `
        <div class="db-perm-chip-row">
            ${dbStructuredPermissions.map(op => `
                <span class="db-perm-chip">
                    <span class="db-perm-chip-text">${escapeHtml(op)}</span>
                    <button type="button" class="db-perm-chip-x" data-remove-op="${escapeAttr(op)}" aria-label="Remove ${escapeAttr(op)}">
                        <i class="fas fa-times"></i>
                    </button>
                </span>
            `).join('')}
        </div>
    `;
    applyDbInstancePolicyNotice(dbInstancePolicy);
    refreshDbWorkflowPreview();
}

function deriveStructuredRole(ops) {
    const perms = Array.isArray(ops) ? ops : [];
    const up = perms.map(p => String(p || '').toUpperCase());
    const hasSchema = up.some(p => ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME', 'CREATE INDEX', 'DROP INDEX'].includes(p));
    if (hasSchema) return 'read_full_write';
    const hasWrite = up.some(p => ['INSERT', 'UPDATE', 'DELETE', 'MERGE'].includes(p));
    if (hasWrite) return 'read_limited_write';
    return 'read_only';
}

function deriveStructuredQueryTypes(ops) {
    const perms = Array.isArray(ops) ? ops : [];
    const up = perms.map(p => String(p || '').toUpperCase());
    const queryTypes = [];
    const isDdl = up.some(p => ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME', 'CREATE INDEX', 'DROP INDEX'].includes(p));
    if (isDdl) queryTypes.push('DDL');
    return queryTypes;
}

function getDbDurationPolicy() {
    const env = String(
        dbWorkflowPreview?.environment
        || dbRequestDraft?._selectedInstance?.account_env
        || dbInstancePolicy?.account_env
        || ''
    ).trim().toLowerCase();
    const previewHours = parseInt(dbWorkflowPreview?.max_duration_hours || '', 10);
    const previewDays = parseInt(dbWorkflowPreview?.max_duration_days || '', 10);
    if (Number.isFinite(previewHours) && previewHours > 0) {
        return {
            environment: env || 'nonprod',
            maxDays: Number.isFinite(previewDays) && previewDays > 0 ? previewDays : Math.max(1, Math.ceil(previewHours / 24)),
            maxHours: previewHours,
        };
    }
    const roleType = String(
        getDbSelectedIamRoleType()
        || dbRequestDraft?.role
        || deriveStructuredRole(dbStructuredPermissions)
        || ''
    ).trim().toLowerCase();
    if (env === 'prod') {
        return { environment: 'prod', maxDays: 3, maxHours: 72 };
    }
    if (roleType === 'read_only') {
        return { environment: env || 'nonprod', maxDays: 30, maxHours: 720 };
    }
    return { environment: env || 'nonprod', maxDays: 5, maxHours: 120 };
}

function getDbMaxDurationDays() {
    return getDbDurationPolicy().maxDays;
}

function getDbMaxDurationHours() {
    return getDbDurationPolicy().maxHours;
}

function updateDbDurationUi() {
    const policy = getDbDurationPolicy();
    const hoursInput = document.getElementById('dbStructuredDuration');
    const dateRangeText = document.getElementById('dbDurationModeDaterangeText');
    const dateHint = document.getElementById('dbDaterangeHint');
    const fiveDayChip = document.getElementById('dbDurationFiveDayChip');
    const thirtyDayChip = document.getElementById('dbDurationThirtyDayChip');
    const startEl = document.getElementById('dbStartDate');
    const endEl = document.getElementById('dbEndDate');
    if (hoursInput) {
        hoursInput.max = String(policy.maxHours);
        hoursInput.title = `1-${policy.maxHours} hours`;
        const current = parseInt(hoursInput.value || '2', 10);
        if (Number.isFinite(current) && current > policy.maxHours) {
            hoursInput.value = String(policy.maxHours);
        }
    }
    if (dateRangeText) {
        dateRangeText.textContent = `Date range (max ${policy.maxDays} days)`;
    }
    if (dateHint) {
        dateHint.textContent = `Select up to ${policy.maxDays} consecutive days. End date is limited automatically.`;
    }
    if (fiveDayChip) {
        fiveDayChip.style.display = policy.maxHours >= 120 ? '' : 'none';
    }
    if (thirtyDayChip) {
        thirtyDayChip.style.display = policy.maxHours >= 720 ? '' : 'none';
    }
    if (startEl && endEl && startEl.value) {
        const start = new Date(startEl.value);
        const maxEnd = new Date(start);
        maxEnd.setDate(maxEnd.getDate() + Math.max(0, policy.maxDays - 1));
        endEl.max = maxEnd.toISOString().slice(0, 10);
        if (endEl.value) {
            const end = new Date(endEl.value);
            if (end > maxEnd) {
                endEl.value = endEl.max;
            }
        }
    }
}

function setStructuredDuration(hours) {
    const el = document.getElementById('dbStructuredDuration');
    if (!el) return;
    const h = parseInt(hours, 10);
    if (!Number.isFinite(h) || h < 1 || h > getDbMaxDurationHours()) return;
    el.value = String(h);
    hydrateStructuredSummary();
}

function initDbDurationMode() {
    const modeHours = document.getElementById('dbDurationModeHours');
    const modeDaterange = document.getElementById('dbDurationModeDaterange');
    const hoursBlock = document.getElementById('dbDurationHoursBlock');
    const daterangeBlock = document.getElementById('dbDurationDaterangeBlock');
    if (!modeHours || !modeDaterange || !hoursBlock || !daterangeBlock) return;
    const calendarEnabled = isDbFeatureEnabled('request_calendar', true);

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const startEl = document.getElementById('dbStartDate');
    const endEl = document.getElementById('dbEndDate');
    if (startEl) startEl.min = todayStr;
    if (endEl) endEl.min = todayStr;

    function setEndDateMax() {
        if (!startEl || !endEl || !startEl.value) return;
        const start = new Date(startEl.value);
        const maxEnd = new Date(start);
        maxEnd.setDate(maxEnd.getDate() + Math.max(0, getDbMaxDurationDays() - 1));
        endEl.max = maxEnd.toISOString().slice(0, 10);
        const end = new Date(endEl.value);
        if (endEl.value && end > maxEnd) {
            endEl.value = maxEnd.toISOString().slice(0, 10);
        }
        hydrateStructuredSummary();
    }

    function setEndMinFromStart() {
        if (startEl && endEl && startEl.value) {
            endEl.min = startEl.value;
            setEndDateMax();
        }
    }

    modeHours.addEventListener('change', function() {
        hoursBlock.style.display = '';
        daterangeBlock.style.display = 'none';
        hydrateStructuredSummary();
    });
    modeDaterange.addEventListener('change', function() {
        if (!isDbFeatureEnabled('request_calendar', true)) {
            modeHours.checked = true;
            hoursBlock.style.display = '';
            daterangeBlock.style.display = 'none';
            return;
        }
        hoursBlock.style.display = 'none';
        daterangeBlock.style.display = 'block';
        if (startEl && !startEl.value) startEl.value = todayStr;
        setEndMinFromStart();
        if (endEl && !endEl.value) endEl.value = todayStr;
        hydrateStructuredSummary();
    });

    if (startEl) startEl.addEventListener('change', setEndMinFromStart);
    if (endEl) {
        endEl.addEventListener('change', function() {
            if (!startEl || !startEl.value) return;
            const start = new Date(startEl.value);
            const maxEnd = new Date(start);
            maxEnd.setDate(maxEnd.getDate() + Math.max(0, getDbMaxDurationDays() - 1));
            const end = new Date(endEl.value);
            if (end > maxEnd) {
                endEl.value = maxEnd.toISOString().slice(0, 10);
            }
            hydrateStructuredSummary();
        });
    }

    if (!calendarEnabled) {
        modeDaterange.checked = false;
        modeDaterange.disabled = true;
        modeHours.checked = true;
        hoursBlock.style.display = '';
        daterangeBlock.style.display = 'none';
    }
    updateDbDurationUi();
}

function resetStructuredDbRequest() {
    dbStructuredPermissions = [];
    dbEffectiveIamRoles = [];
    dbSelectedIamRoleId = '';
    dbRequestDraft = dbRequestDraft || {};
    dbRequestDraft.requested_tables = [];
    dbRequestDraft.request_for_mode = 'self';
    delete dbRequestDraft.request_approver_email;
    delete dbRequestDraft.iam_role_template_id;
    delete dbRequestDraft.iam_role_template_name;
    delete dbRequestDraft.role;
    dbRequestRecipients = [];
    dbApproverEmailManuallyEdited = false;
    dbOwnerEmailManuallyEdited = false;
    dbSelectedOwner = null;
    const dur = document.getElementById('dbStructuredDuration');
    const just = document.getElementById('dbStructuredJustification');
    const approver = document.getElementById('dbStructuredApproverEmail');
    const approverAi = document.getElementById('dbAiApproverEmail');
    const dbOwner = document.getElementById('dbStructuredDbOwnerEmail');
    const dbOwnerAi = document.getElementById('dbAiDbOwnerEmail');
    const modeHours = document.getElementById('dbDurationModeHours');
    const startEl = document.getElementById('dbStartDate');
    const endEl = document.getElementById('dbEndDate');
    if (dur) dur.value = '2';
    if (just) just.value = '';
    if (approver) approver.value = '';
    if (approverAi) approverAi.value = '';
    if (dbOwner) dbOwner.value = '';
    if (dbOwnerAi) dbOwnerAi.value = '';
    renderDbOwnerSelection('structured');
    renderDbOwnerSelection('ai');
    if (modeHours) modeHours.checked = true;
    const hoursBlock = document.getElementById('dbDurationHoursBlock');
    const daterangeBlock = document.getElementById('dbDurationDaterangeBlock');
    if (hoursBlock) hoursBlock.style.display = '';
    if (daterangeBlock) daterangeBlock.style.display = 'none';
    const modeDaterange = document.getElementById('dbDurationModeDaterange');
    if (modeDaterange) {
        const calendarEnabled = isDbFeatureEnabled('request_calendar', true);
        modeDaterange.disabled = !calendarEnabled;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (startEl) startEl.value = '';
    if (endEl) endEl.value = '';
    dbWorkflowPreview = null;
    dbWorkflowPreviewKey = '';
    dbWorkflowPreviewPending = false;
    renderDbEffectiveIamRoles();
    renderDbWorkflowPreview('', 'info');
    syncDbApprovalUiState();
    refreshDbRequestRecipientUi();
    syncStructuredPermissionUI();
    updateDbStructuredPermissionVisibility();
    updateDbDurationUi();
    hydrateStructuredSummary();
}

function getDbStructuredDurationHours() {
    const maxHours = getDbMaxDurationHours();
    const modeDaterange = document.getElementById('dbDurationModeDaterange');
    if (modeDaterange && modeDaterange.checked) {
        const startEl = document.getElementById('dbStartDate');
        const endEl = document.getElementById('dbEndDate');
        if (!startEl?.value || !endEl?.value) return null;
        const start = new Date(startEl.value);
        const end = new Date(endEl.value);
        if (end < start) return null;
        const hours = Math.round((end - start) / (1000 * 60 * 60));
        if (hours < 1) return 1;
        if (hours > maxHours) return maxHours;
        return hours;
    }
    const v = parseInt(document.getElementById('dbStructuredDuration')?.value || '2', 10);
    if (!Number.isFinite(v) || v < 1) return 2;
    return Math.min(v, maxHours);
}

function getDbStructuredDurationDisplay() {
    const modeDaterange = document.getElementById('dbDurationModeDaterange');
    if (modeDaterange && modeDaterange.checked) {
        const startEl = document.getElementById('dbStartDate');
        const endEl = document.getElementById('dbEndDate');
        if (startEl?.value && endEl?.value) {
            const h = getDbStructuredDurationHours();
            return `${startEl.value} to ${endEl.value} (${h}h)`;
        }
        return '—';
    }
    const h = getDbStructuredDurationHours();
    return h != null ? `${h}h` : '—';
}

function hydrateStructuredSummary() {
    const summary = document.getElementById('dbStructuredSummary');
    if (!summary) return;
    updateDbDurationUi();
    const scopeMeta = getDbRequestScopeMeta(selectedEngine?.engine || dbRequestDraft?._selectedInstance?.engine || '');
    const dbs = selectedDatabases?.map(d => d.name).filter(Boolean) || [];
    const dbNames = dbs.length ? dbs.join(', ') : (dbRequestDraft?.db_name || 'default');
    const instanceText = String((dbRequestDraft?._selectedInstance || {}).id || dbRequestDraft?.requested_instance_input || '').trim() || '—';
    const schemaName = String(dbRequestDraft?.requested_schema_name || '').trim() || '—';
    const tableNames = Array.isArray(dbRequestDraft?.requested_tables) && dbRequestDraft.requested_tables.length
        ? dbRequestDraft.requested_tables.join(', ')
        : (String(dbRequestDraft?.requested_table_name || '').trim() || '—');
    const detailName = String(dbRequestDraft?.requested_column_name || '').trim() || '—';
    const durationDisplay = getDbStructuredDurationDisplay();
    const justification = String(document.getElementById('dbStructuredJustification')?.value || '').trim();
    const approverDisplay = getDbApproverDisplay();
    const dbOwnerEmail = getDbOwnerEmail();
    const requestTarget = getDbRequestTargetSummaryLabel();
    const selectedRole = getDbEffectiveIamRoleById(dbSelectedIamRoleId);
    const role = String((selectedRole && selectedRole.request_role) || dbRequestDraft?.role || deriveStructuredRole(dbStructuredPermissions)).trim().toLowerCase() || deriveStructuredRole(dbStructuredPermissions);
    const savedRole = String(dbRequestDraft?.iam_role_template_name || '').trim();
    const manualAccessType = String(dbRequestDraft?.requested_access_type || '').trim();
    const ops = dbStructuredPermissions.length ? dbStructuredPermissions.join(', ') : (manualAccessType || '—');

    summary.innerHTML = `
        <div class="db-structured-summary-grid">
            <span><strong>Engine:</strong> ${escapeHtml(selectedEngine?.label || 'Database')}</span>
            <span><strong>${escapeHtml(getDbTargetLabel(selectedEngine?.engine, dbRequestDraft?._selectedInstance?.resource_kind))}:</strong> ${escapeHtml(instanceText)}</span>
            <span><strong>Request For:</strong> ${escapeHtml(requestTarget)}</span>
            <span><strong>Database(s):</strong> ${escapeHtml(dbNames)}</span>
            ${scopeMeta.schemaVisible ? `<span><strong>${escapeHtml(scopeMeta.schemaLabel)}:</strong> ${escapeHtml(schemaName)}</span>` : ''}
            <span><strong>${escapeHtml(scopeMeta.objectPluralLabel)}:</strong> ${escapeHtml(tableNames)}</span>
            <span><strong>${escapeHtml(scopeMeta.detailLabel)}:</strong> ${escapeHtml(detailName)}</span>
            <span><strong>Selected Queries:</strong> ${escapeHtml(ops)}</span>
            <span><strong>Role:</strong> ${escapeHtml(getDbRoleLabel(role))}</span>
            <span><strong>Access Role:</strong> ${escapeHtml(savedRole || '—')}</span>
            <span><strong>Duration:</strong> ${escapeHtml(durationDisplay)}</span>
            <span><strong>Approver:</strong> ${escapeHtml(approverDisplay)}</span>
            <span><strong>DB Owner:</strong> ${escapeHtml(dbOwnerEmail || 'Not added')}</span>
            <span><strong>Reason:</strong> ${escapeHtml(justification || '—')}</span>
        </div>
    `;
    summary.style.display = 'block';
    refreshDbWorkflowPreview();
}

async function submitStructuredDbRequest() {
    setDbSubmitStatus('dbStructuredSubmitStatus', '', 'info');
    if (!selectedEngine || !dbRequestDraft || !selectedDatabases?.length) {
        alert('Please select account, instance, and database first.');
        return;
    }
    if (dbInstancePolicy?.request_allowed === false) {
        alert(dbInstancePolicy.request_block_reason || DEFAULT_DB_POLICY_BLOCK_REASON);
        return;
    }
    if (!dbStructuredPermissions.length) {
        const manualAccessType = String(dbRequestDraft?.requested_access_type || '').trim();
        if (manualAccessType) {
            dbStructuredPermissions = manualAccessType.split(',').map(op => op.trim().toUpperCase()).filter(Boolean);
        }
        if (!dbStructuredPermissions.length) {
            alert('Please enter the Access Type.');
            return;
        }
    }
    const duration = getDbStructuredDurationHours();
    const maxDurationHours = getDbMaxDurationHours();
    const maxDurationDays = getDbMaxDurationDays();
    if (duration == null || duration < 1) {
        const modeDaterange = document.getElementById('dbDurationModeDaterange');
        if (modeDaterange && modeDaterange.checked) {
            alert(`Please select a valid date range (from and to, max ${maxDurationDays} days).`);
        } else {
            alert('Duration must be between 1 and ' + maxDurationHours + ' hours.');
        }
        return;
    }
    if (duration > maxDurationHours) {
        alert('Maximum duration is ' + maxDurationDays + ' days (' + maxDurationHours + ' hours).');
        return;
    }
    const justification = String(document.getElementById('dbStructuredJustification')?.value || '').trim();
    if (!justification || justification.length < 3) {
        alert('Please enter a short business justification.');
        return;
    }
    await refreshDbWorkflowPreview();
    if (dbWorkflowBlockedReason()) {
        const blockedMessage = dbWorkflowBlockedReason();
        setDbSubmitStatus('dbStructuredSubmitStatus', blockedMessage, 'error');
        alert(blockedMessage);
        return;
    }
    if (dbWorkflowPreview && dbWorkflowPreview.error) {
        setDbSubmitStatus('dbStructuredSubmitStatus', dbWorkflowPreview.message || 'No matching approval workflow found.', 'error');
        alert(dbWorkflowPreview.message || 'No matching approval workflow found.');
        return;
    }
    const approverEmail = getDbApproverEmail();
    const dbOwnerEmail = getDbOwnerEmail();
    const approverRequired = dbWorkflowRequiresApprover();
    if (getDbRequestMode() !== 'others' && approverRequired && !approverEmail) {
        alert('Please enter the approver email address.');
        return;
    }
    if (getDbRequestMode() !== 'others' && approverEmail && !/@nykaa\.com$/i.test(approverEmail)) {
        alert('Approver email must end with @nykaa.com.');
        return;
    }
    const confirmed = await confirmDbRequestSubmission();
    if (!confirmed) {
        setDbSubmitStatus('dbStructuredSubmitStatus', 'Database request submission cancelled.', 'info');
        return;
    }
    let accountId = dbRequestDraft.account_id || dbRequestDraft.project_id || dbRequestDraft.subscription_id || dbRequestDraft.compartment_id || dbRequestDraft.atlas_project_id || '';
    if (!accountId) {
        alert('Please select the target account before submitting the database request.');
        return;
    }
    const inst = dbRequestDraft?._selectedInstance || {};
    const scopeMeta = getDbRequestScopeMeta(inst.engine || selectedEngine?.engine || '');
    if (!inst.id) {
        alert('Please select the target database instance before submitting the request.');
        return;
    }
    const databaseName = String(dbRequestDraft?.requested_database_name || dbRequestDraft?.db_name || selectedDatabases?.[0]?.name || '').trim();
    const schemaName = String(dbRequestDraft?.requested_schema_name || '').trim();
    const tableName = String(dbRequestDraft?.requested_table_name || '').trim();
    const detailName = String(dbRequestDraft?.requested_column_name || '').trim();
    const accessType = String(dbRequestDraft?.requested_access_type || '').trim() || dbStructuredPermissions.join(', ');
    if (!databaseName) {
        alert('Please enter the Database Name.');
        return;
    }
    if (scopeMeta.schemaRequired && !schemaName) {
        alert(`Please enter the ${scopeMeta.schemaLabel} Name.`);
        return;
    }
    if (scopeMeta.objectRequired && !tableName) {
        alert(`Please enter the ${scopeMeta.objectLabel} Name.`);
        return;
    }
    const role = deriveStructuredRole(dbStructuredPermissions);
    const query_types = deriveStructuredQueryTypes(dbStructuredPermissions);
    let targets = [];
    try {
        targets = buildDbRecipientSubmissionTargets(approverRequired, approverEmail);
        const invalidTarget = targets.find(function(item) {
            return item.requestApproverEmail && !/@nykaa\.com$/i.test(item.requestApproverEmail);
        });
        if (invalidTarget) {
            throw new Error(`Approver email for ${invalidTarget.email} must end with @nykaa.com.`);
        }
    } catch (err) {
        alert(err.message || 'Please select valid target users before submitting.');
        return;
    }

    const payload = {
        databases: selectedDatabases,
        account_id: accountId,
        region: inst.region || '',
        db_instance_id: inst.id || '',
        rds_instance: inst.id || '',
        database_name: databaseName,
        schema_name: schemaName,
        table_name: tableName,
        column_name: detailName,
        access_type: accessType,
        permissions: dbStructuredPermissions,
        query_types,
        requested_tables: Array.isArray(dbRequestDraft.requested_tables) ? dbRequestDraft.requested_tables : [],
        role,
        iam_role_template_id: String(dbRequestDraft?.iam_role_template_id || '').trim(),
        iam_role_template_name: String(dbRequestDraft?.iam_role_template_name || '').trim(),
        engine: normalizeEngineForStructured(inst.engine || selectedEngine?.engine || ''),
        resource_kind: String(inst.resource_kind || '').trim().toLowerCase(),
        data_classification: String(inst.data_classification || dbInstancePolicy?.data_classification || '').trim().toLowerCase(),
        is_pii: !!(inst.is_sensitive_classification || dbInstancePolicy?.is_sensitive_classification),
        duration_hours: duration,
        justification,
        preferred_auth: dbRequestDraft.preferred_auth || ''
    };
    if (dbOwnerEmail) payload.db_owner_email = dbOwnerEmail;
    const modeDaterange = document.getElementById('dbDurationModeDaterange');
    if (modeDaterange && modeDaterange.checked) {
        const startEl = document.getElementById('dbStartDate');
        const endEl = document.getElementById('dbEndDate');
        if (startEl?.value) payload.start_date = startEl.value;
        if (endEl?.value) payload.end_date = endEl.value;
    }

    try {
        setDbSubmitBusy('dbStructuredSubmitBtn', true, 'Submitting...');
        setDbSubmitStatus('dbStructuredSubmitStatus', `Submitting ${targets.length} database request${targets.length > 1 ? 's' : ''} for approval...`, 'info');
        let lastData = null;
        for (const target of targets) {
            const res = await fetch(`${DB_API_BASE}/api/databases/request-access`, {
                method: 'POST',
                headers: getDbRequestHeaders(),
                credentials: 'include',
                body: JSON.stringify({
                    ...payload,
                    user_email: target.email,
                    user_full_name: target.fullName,
                    db_username: target.dbUsername,
                    request_approver_email: approverRequired ? target.requestApproverEmail : (target.requestApproverEmail || ''),
                })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            lastData = data;
        }
        setDbSubmitStatus('dbStructuredSubmitStatus', `Database request${targets.length > 1 ? 's' : ''} submitted successfully. Redirecting to My Requests...`, 'info');
        showDbRequestsAfterSubmit(
            lastData?.status,
            `Database request${targets.length > 1 ? 's' : ''} submitted successfully. Status: ${lastData?.status || 'pending'}. ${lastData?.message || 'Track it under My Requests > Databases.'}`
        );
        alert(`Request${targets.length > 1 ? 's' : ''} submitted successfully!\n\nCount: ${targets.length}\nStatus: ${lastData?.status || 'pending'}\n${lastData?.message || 'Track it under My Requests > Databases.'}`);
        // Keep user in structured panel but clear for next request.
        resetStructuredDbRequest();
    } catch (e) {
        setDbSubmitStatus('dbStructuredSubmitStatus', safeUserFacingErrorMessage(e), 'error');
        alert('Failed: ' + safeUserFacingErrorMessage(e));
    } finally {
        setDbSubmitBusy('dbStructuredSubmitBtn', false);
    }
}

function renderDbRichText(rawText) {
    const raw = String(rawText || '');
    const trimmed = raw.trim();

    // Auto-render standalone JSON as code for readability.
    const looksLikeJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
    if (looksLikeJson && trimmed.length >= 2) {
        return `<pre class="db-ai-code" data-lang="json"><code>${escapeHtml(raw)}</code></pre>`;
    }

    const chunks = raw.split('```');
    let html = '';
    for (let i = 0; i < chunks.length; i++) {
        const part = chunks[i];
        const isCode = i % 2 === 1;
        if (!part) continue;
        if (isCode) {
            let lang = '';
            let code = part;
            const m = part.match(/^\s*([a-zA-Z0-9_-]{1,18})\s*\n/);
            if (m) {
                lang = m[1];
                code = part.slice(m[0].length);
            }
            html += `<pre class="db-ai-code" data-lang="${escapeAttr(lang)}"><code>${escapeHtml(code)}</code></pre>`;
        } else {
            html += `<div class="db-ai-text">${escapeHtml(part)}</div>`;
        }
    }
    return html || `<div class="db-ai-text">${escapeHtml(raw)}</div>`;
}

function attachDbChatLongToggle(messageEl, rawText) {
    const raw = String(rawText || '');
    const lineCount = raw.split(/\r?\n/).length;
    const isLong = lineCount > 5 || raw.length > 400;
    if (!isLong) return;

    const body = messageEl.querySelector('.db-ai-bubble-body');
    const toggle = messageEl.querySelector('.db-ai-expand-btn');
    if (!body || !toggle) return;

    // Ensure we measure expanded height before constraining it.
    body.style.maxHeight = 'none';
    const expanded = body.scrollHeight;

    const style = window.getComputedStyle(body);
    let lineHeight = parseFloat(style.lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) lineHeight = 20;
    const collapsed = Math.min(expanded, Math.ceil(lineHeight * 5.1));

    if (expanded <= collapsed + 4) return;

    body.classList.add('db-ai-bubble-collapsible', 'is-collapsed');
    body.style.maxHeight = `${collapsed}px`;
    body.dataset.expandedMax = String(expanded);
    body.dataset.collapsedMax = String(collapsed);

    toggle.style.display = 'inline-flex';
    toggle.dataset.expanded = 'false';
    toggle.innerHTML = 'Show more <span aria-hidden="true">↓</span>';
}

function toggleDbChatLongMessage(btn) {
    const content = btn.closest('.db-ai-msg-content');
    if (!content) return;
    const body = content.querySelector('.db-ai-bubble-body');
    if (!body) return;

    const collapsedMax = parseInt(body.dataset.collapsedMax || '0', 10);
    const isExpanded = btn.dataset.expanded === 'true';

    if (isExpanded) {
        body.classList.add('is-collapsed');
        body.style.maxHeight = `${collapsedMax || 120}px`;
        btn.dataset.expanded = 'false';
        btn.innerHTML = 'Show more <span aria-hidden="true">↓</span>';
    } else {
        body.classList.remove('is-collapsed');
        const expanded = body.scrollHeight;
        body.dataset.expandedMax = String(expanded);
        body.style.maxHeight = `${expanded || 600}px`;
        btn.dataset.expanded = 'true';
        btn.innerHTML = 'Show less <span aria-hidden="true">↑</span>';
    }
}

function ensureDbChatDelegates() {
    const chat = document.getElementById('dbAiChat');
    if (!chat || chat.dataset.delegatesReady === 'true') return;
    chat.dataset.delegatesReady = 'true';
    chat.addEventListener('click', (e) => {
        const btn = e.target.closest('.db-ai-expand-btn');
        if (btn) {
            e.preventDefault();
            toggleDbChatLongMessage(btn);
        }
    });
}

function appendDbChatMessage({ role, rawText, htmlContent, cssClass = '', isTyping = false, avatarHtml = null }) {
    const chat = document.getElementById('dbAiChat');
    if (!chat) return null;
    ensureDbChatDelegates();

    const baseClass = role === 'user' ? 'db-ai-user' : role === 'error' ? 'db-ai-error' : 'db-ai-bot';
    const extra = cssClass ? ` ${cssClass}` : '';
    const typingClass = isTyping ? ' db-ai-typing' : '';
    const avatar = avatarHtml || (role === 'user'
        ? '<div class="db-ai-msg-avatar"><i class="fas fa-user"></i></div>'
        : dbAssistantAvatar());

    chat.insertAdjacentHTML('beforeend', `
      <div class="db-ai-msg ${baseClass}${typingClass}${extra}">
        ${avatar}
        <div class="db-ai-msg-content">
          <div class="db-ai-bubble-body">${htmlContent || ''}</div>
          <button class="db-ai-expand-btn" type="button" style="display:none"></button>
        </div>
      </div>
    `);

    const el = chat.lastElementChild;
    if (role !== 'user' && role !== 'error') {
        attachDbChatLongToggle(el, rawText || '');
    }
    chat.scrollTop = chat.scrollHeight;
    return el;
}

function showDbTypingIndicator() {
    return appendDbChatMessage({
        role: 'assistant',
        rawText: 'Thinking...',
        isTyping: true,
        cssClass: 'db-ai-typing',
        avatarHtml: dbAssistantAvatar('loader'),
        htmlContent: `
          <div class="db-ai-typing-row">
            <div class="db-ai-typing-text">Thinking...</div>
          </div>
        `
    });
}

function hideDbTypingIndicator(typingEl) {
    if (!typingEl) return;
    typingEl.classList.add('db-ai-typing-exit');
    window.setTimeout(() => {
        try { typingEl.remove(); } catch (_) {}
    }, 320);
}

function finalizeDbTypingIndicator(typingEl, assistantText) {
    const raw = String(assistantText || '').trim();
    const safeText = raw.length ? raw : '...';

    // If typing bubble is missing, fall back to a normal assistant message.
    if (!typingEl) {
        appendDbChatMessage({ role: 'assistant', rawText: safeText, htmlContent: renderDbRichText(safeText) });
        return;
    }

    const body = typingEl.querySelector('.db-ai-bubble-body');
    const toggle = typingEl.querySelector('.db-ai-expand-btn');
    const avatar = typingEl.querySelector('.db-ai-msg-avatar');

    if (body) body.innerHTML = renderDbRichText(safeText);
    if (toggle) {
        toggle.style.display = 'none';
        toggle.dataset.expanded = 'false';
        toggle.innerHTML = '';
    }

    // Sink the mermaid back into the water, then swap to the static avatar state.
    typingEl.classList.add('db-ai-typing-to-message');
    window.setTimeout(() => {
        if (avatar) avatar.innerHTML = dbMermaidSvg({ variant: 'avatar' });
        typingEl.classList.remove('db-ai-typing', 'db-ai-typing-to-message');
        attachDbChatLongToggle(typingEl, safeText);
        const chat = document.getElementById('dbAiChat');
        if (chat) chat.scrollTop = chat.scrollHeight;
    }, 360);
}

function hideDbQuickPrompts() {
    const el = document.getElementById('dbAiQuickPrompts');
    if (el) el.style.display = 'none';
}

function redactSensitiveChatInput(text) {
    let redacted = String(text || '');
    const patterns = [
        [/\b(username|user)\s*(?:is|=|:)\s*([^\s,;]+)\s+(?:and\s+)?\b(password|passwd|pwd)\s*(?:is|=|:)\s*([^\s,;]+)/gi, '$1=[REDACTED] $3=[REDACTED]'],
        [/\b(password|passwd|pwd)\s*(?:is|=|:)\s*([^\s,;]+)/gi, '$1=[REDACTED]'],
        [/\b(api[_ -]?key|access[_ -]?key|secret[_ -]?key|token)\s*(?:is|=|:)\s*([^\s,;]+)/gi, '$1=[REDACTED]'],
        [/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:\s/@]+:)([^@\s]+)(@)/g, '$1[REDACTED]$3']
    ];
    patterns.forEach(([pattern, replacement]) => {
        redacted = redacted.replace(pattern, replacement);
    });
    return redacted;
}

function buildDbAiContext() {
    const selectedInstance = dbRequestDraft?._selectedInstance || null;
    const databases = (selectedDatabases || []).map(db => ({
        name: db?.name || '',
        host: db?.host || '',
        port: db?.port || '',
        engine: db?.engine || selectedEngine?.engine || ''
    })).slice(0, 6);

    return {
        engine: selectedEngine?.engine || '',
        engine_label: selectedEngine?.label || '',
        account_id: dbRequestDraft?.account_id || '',
        selected_instance: selectedInstance ? {
            id: selectedInstance.id || '',
            name: selectedInstance.name || '',
            host: selectedInstance.host || '',
            port: selectedInstance.port || '',
            engine: selectedInstance.engine || selectedEngine?.engine || '',
            auth_mode: selectedInstance.auth_mode || '',
            iam_auth_enabled: !!selectedInstance.iam_auth_enabled,
            password_auth_enabled: selectedInstance.password_auth_enabled !== false,
            db_resource_id: selectedInstance.db_resource_id || '',
            region: selectedInstance.region || '',
            account_env: selectedInstance.account_env || '',
            data_classification: selectedInstance.data_classification || '',
            enforce_read_only: !!selectedInstance.enforce_read_only,
            tags_present: selectedInstance.tags_present !== false,
            request_allowed: selectedInstance.request_allowed !== false,
            request_block_reason: selectedInstance.request_block_reason || ''
        } : null,
        region: selectedInstance?.region || '',
        databases
    };
}

function getDbRoleLabel(role) {
    return ({
        read_only: 'Read-only',
        read_limited_write: 'Limited Write',
        read_full_write: 'Full Write',
        admin: 'Admin'
    })[role] || 'Custom (NPAMx)';
}

function shouldShowDbRequestSummary() {
    if (!dbRequestDraft || !selectedEngine || !selectedDatabases?.length) return false;
    // Only show summary when NPAMx is at the confirmation stage (strict workflow).
    if (!dbRequestDraft._needsConfirmation && !dbRequestDraft._readyToSubmit) return false;
    const permissionsText = String(dbRequestDraft.permissions || '').trim();
    const role = String(dbRequestDraft.role || '').trim();
    const knownRoles = ['read_only', 'read_limited_write', 'read_full_write', 'admin'];
    const hasOps = permissionsText.length > 0 || knownRoles.includes(role);
    const hasReason = String(dbRequestDraft.justification || '').trim().length > 0;
    const hasDuration = !!(dbRequestDraft.duration_hours || 0);
    return hasOps && hasReason && hasDuration;
}

async function sendDbAiMessage() {
    const input = document.getElementById('dbAiInput');
    const rawMessage = (input?.value || '').trim();
    if (!rawMessage) return;
    const message = redactSensitiveChatInput(rawMessage);
    const wasRedacted = message !== rawMessage;
    hideDbQuickPrompts();
    appendDbChatMessage({ role: 'user', rawText: message, htmlContent: renderDbRichText(message) });
    if (wasRedacted) {
        const notice = "For security reasons, credentials must never be shared in chat. Access will be issued automatically after approval.";
        appendDbChatMessage({ role: 'assistant', rawText: notice, htmlContent: renderDbRichText(notice), cssClass: 'db-ai-system' });
    }
    if (input) input.value = '';

    const startedAt = Date.now();
    const typingEl = showDbTypingIndicator();

    try {
        const response = await fetch(`${DB_API_BASE}/api/databases/ai-chat`, {
            method: 'POST',
            headers: getDbRequestHeaders(),
            credentials: 'include',
            body: JSON.stringify({
                message,
                conversation_id: dbConversationId,
                context: buildDbAiContext()
            })
        });
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (parseErr) {
            hideDbTypingIndicator(typingEl);
            if (!response.ok || text.trim().startsWith('<')) {
                const apiUrl = (typeof DB_API_BASE !== 'undefined' ? DB_API_BASE : '?') + '/api/databases/ai-chat';
                const msg = `Server returned an error (${response.status}). Ensure the backend is running and reachable.\nAPI: ${apiUrl}`;
                appendDbChatMessage({ role: 'error', rawText: msg, htmlContent: renderDbRichText(msg), avatarHtml: '<div class="db-ai-msg-avatar"><i class="fas fa-triangle-exclamation"></i></div>' });
                return;
            }
            throw parseErr;
        }

        // Avoid a flash if the response is extremely fast.
        const minThinkMs = 450;
        const elapsed = Date.now() - startedAt;
        if (elapsed < minThinkMs) {
            await new Promise(r => window.setTimeout(r, minThinkMs - elapsed));
        }

        if (data.conversation_id) dbConversationId = data.conversation_id;
        if (data.error) {
            hideDbTypingIndicator(typingEl);
            appendDbChatMessage({ role: 'error', rawText: data.error, htmlContent: renderDbRichText(data.error), avatarHtml: '<div class="db-ai-msg-avatar"><i class="fas fa-triangle-exclamation"></i></div>' });
        } else {
            finalizeDbTypingIndicator(typingEl, data.response || '');
            if (data.draft && typeof data.draft === 'object') {
                dbRequestDraft = dbRequestDraft || {};
                if (data.draft.db_name) dbRequestDraft.db_name = data.draft.db_name;
                if (data.draft.duration_hours) dbRequestDraft.duration_hours = parseInt(data.draft.duration_hours, 10) || dbRequestDraft.duration_hours;
                if (data.draft.justification) dbRequestDraft.justification = String(data.draft.justification || '').trim();
                if (Array.isArray(data.draft.query_types)) dbRequestDraft.query_types = data.draft.query_types;
            }
            if (typeof data.needs_confirmation === 'boolean') {
                dbRequestDraft = dbRequestDraft || {};
                dbRequestDraft._needsConfirmation = data.needs_confirmation;
            }
            if (typeof data.ready_to_submit === 'boolean') {
                dbRequestDraft = dbRequestDraft || {};
                dbRequestDraft._readyToSubmit = data.ready_to_submit;
                if (data.ready_to_submit) dbRequestDraft.confirmed_by_user = true;
            }
            if (data.permissions || data.suggested_role) {
                dbRequestDraft = dbRequestDraft || {};
                if (data.permissions && data.permissions.length) {
                    dbRequestDraft.permissions = Array.isArray(data.permissions) ? data.permissions.join(',') : data.permissions;
                }
                if (data.suggested_role) {
                    dbRequestDraft.role = data.suggested_role;
                }
            }
            if (data.recommended_auth) {
                dbRequestDraft = dbRequestDraft || {};
                dbRequestDraft.preferred_auth = data.recommended_auth;
            }
            if (data.auth_mode) {
                dbRequestDraft = dbRequestDraft || {};
                dbRequestDraft.auth_mode = data.auth_mode;
            }
            // Strict workflow: only submit after user confirms in chat.
            if (data.ready_to_submit && !(dbRequestDraft && dbRequestDraft._autoSubmitted)) {
                dbRequestDraft = dbRequestDraft || {};
                dbRequestDraft._autoSubmitted = true;
                await submitDbRequestViaAi({ skipPrompt: true, fromChat: true });
            }
        }
        showDbRequestSummaryIfReady();
    } catch (err) {
        hideDbTypingIndicator(typingEl);
        const apiUrl = (typeof DB_API_BASE !== 'undefined' ? DB_API_BASE : '?') + '/api/databases/ai-chat';
        const msg = `Error: ${err.message}\nAPI: ${apiUrl}`;
        appendDbChatMessage({ role: 'error', rawText: msg, htmlContent: renderDbRichText(msg), avatarHtml: '<div class="db-ai-msg-avatar"><i class="fas fa-triangle-exclamation"></i></div>' });
    }
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function escapeAttr(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function safeUserFacingErrorMessage(err) {
    const msg = String((err && err.message) ? err.message : (err || '')).trim();
    if (!msg) return 'Something went wrong. Please retry.';
    const low = msg.toLowerCase();
    const internalMarkers = [
        'vault', 'approle', 'secret_id', 'role_id', 'vault_addr',
        'internal_api_token', 'traceback', 'keyerror', 'boto3',
        'permission denied', 'no such file', 'systemd', 'journalctl'
    ];
    if (internalMarkers.some(m => low.includes(m))) {
        return 'Something went wrong while processing this request. Please retry or contact an administrator.';
    }
    return msg;
}

function domIdFromRequestId(requestId) {
    return String(requestId || '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'req';
}

function formatDbActivationUpdatedAt(value) {
    const formatted = formatDbDateTime(value);
    return formatted === '—' ? '' : formatted;
}

function renderDbActivationProgress(req) {
    const progress = req && typeof req.activation_progress === 'object' ? req.activation_progress : null;
    if (!progress) return '';
    const steps = Array.isArray(progress.steps) ? progress.steps : [];
    const hasSteps = steps.length > 0;
    const currentStep = String(progress.current_step || '').trim();
    const activationError = String(req.activation_error || '').trim();
    const activationMessage = String(progress.message || '').trim();
    const updatedAt = formatDbActivationUpdatedAt(progress.updated_at);
    const panelClass = activationError
        ? 'db-activation-panel-error'
        : (currentStep ? 'db-activation-panel-progress' : 'db-activation-panel-info');
    const items = hasSteps ? steps.map(step => {
        const status = String(step?.status || 'pending').trim().toLowerCase();
        const label = String(step?.label || step?.key || 'Step').trim();
        const chipLabel = status === 'done'
            ? 'Done'
            : status === 'in_progress'
                ? 'In progress'
                : status === 'error'
                    ? 'Error'
                    : 'Pending';
        return `<li class="db-activation-step db-activation-step-${escapeAttr(status)}">
            <span class="db-activation-step-label">${escapeHtml(label)}</span>
            <span class="db-activation-step-chip">${escapeHtml(chipLabel)}</span>
        </li>`;
    }).join('') : '';
    return `<div class="db-activation-panel ${panelClass}">
        <div class="db-activation-panel-title">${escapeHtml(activationError ? 'Activation issue' : 'Activation status')}</div>
        ${activationMessage ? `<div class="db-activation-panel-message">${escapeHtml(activationMessage)}</div>` : ''}
        ${activationError ? `<div class="db-activation-panel-error-text">${escapeHtml(activationError)}</div>` : ''}
        ${items ? `<ul class="db-activation-steps">${items}</ul>` : ''}
        ${updatedAt ? `<div class="db-activation-panel-meta">Last updated: ${escapeHtml(updatedAt)}</div>` : ''}
    </div>`;
}

function showDbRequestSummaryIfReady() {
    const summary = document.getElementById('dbAiRequestSummary');
    const actions = document.getElementById('dbAiActions');
    if (!summary || !actions) return;

    if (!shouldShowDbRequestSummary()) {
        summary.style.display = 'none';
        actions.style.display = 'none';
        return;
    }

    const role = getDbRoleLabel(dbRequestDraft.role || '');
    const permissionsText = String(dbRequestDraft.permissions || '').trim();
    const duration = dbRequestDraft.duration_hours || 2;
    const reason = String(dbRequestDraft.justification || '').trim();
    const dbOwnerEmail = getDbOwnerEmail();
    const databases = selectedDatabases?.map(d => d.name).join(', ') || (dbRequestDraft.requested_database_name || dbRequestDraft.db_name || 'default');
    const scopeMeta = getDbRequestScopeMeta(selectedEngine?.engine || dbRequestDraft?._selectedInstance?.engine || '');
    const schemaName = String(dbRequestDraft.requested_schema_name || '').trim() || '—';
    const tables = String(dbRequestDraft.requested_table_name || '').trim()
        || (Array.isArray(dbRequestDraft.requested_tables) && dbRequestDraft.requested_tables.length
            ? dbRequestDraft.requested_tables.join(', ')
            : '—');
    const detailName = String(dbRequestDraft.requested_column_name || '').trim() || '—';
    const instanceText = String((dbRequestDraft._selectedInstance || {}).id || dbRequestDraft.requested_instance_input || '').trim() || '—';
    const manualAccessType = String(dbRequestDraft.requested_access_type || '').trim();
    const operations = permissionsText || (dbRequestDraft.role === 'read_only'
        ? 'SELECT'
        : dbRequestDraft.role === 'read_limited_write'
            ? 'SELECT, INSERT, UPDATE, DELETE'
            : dbRequestDraft.role === 'read_full_write'
                ? 'SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, TRUNCATE'
                : dbRequestDraft.role === 'admin'
                    ? 'ALL PRIVILEGES'
                    : (manualAccessType || 'Custom (NPAMx)'));
    const title = dbRequestDraft._readyToSubmit ? 'Confirmed request' : 'Please confirm this request';
    const requestTarget = getDbRequestTargetSummaryLabel();
    summary.innerHTML = `
        <p><strong>${escapeHtml(title)}</strong></p>
        <div class="db-ai-summary-grid">
            <span><strong>Engine:</strong> ${escapeHtml(selectedEngine.label)}</span>
            <span><strong>${escapeHtml(getDbTargetLabel(selectedEngine?.engine, dbRequestDraft?._selectedInstance?.resource_kind))}:</strong> ${escapeHtml(instanceText)}</span>
            <span><strong>Request For:</strong> ${escapeHtml(requestTarget)}</span>
            <span><strong>Databases:</strong> ${escapeHtml(databases)}</span>
            ${scopeMeta.schemaVisible ? `<span><strong>${escapeHtml(scopeMeta.schemaLabel)}:</strong> ${escapeHtml(schemaName)}</span>` : ''}
            <span><strong>${escapeHtml(scopeMeta.objectPluralLabel)}:</strong> ${escapeHtml(tables)}</span>
            <span><strong>${escapeHtml(scopeMeta.detailLabel)}:</strong> ${escapeHtml(detailName)}</span>
            <span><strong>Operations:</strong> ${escapeHtml(operations)}</span>
            <span><strong>Role:</strong> ${escapeHtml(role)}</span>
            <span><strong>Reason:</strong> ${escapeHtml(reason)}</span>
            <span><strong>Duration:</strong> ${escapeHtml(String(duration))} hour(s)</span>
            <span><strong>DB Owner:</strong> ${escapeHtml(dbOwnerEmail || 'Not added')}</span>
        </div>`;
    summary.style.display = 'block';
    actions.style.display = 'flex';
}

function editDbRequestDuration() {
    const maxDurationHours = getDbMaxDurationHours();
    const hrs = prompt(`Duration (hours, 1-${maxDurationHours}):`, dbRequestDraft?.duration_hours || 2);
    if (hrs) {
        const h = parseInt(hrs, 10);
        if (h >= 1 && h <= maxDurationHours) {
            dbRequestDraft = dbRequestDraft || {};
            dbRequestDraft.duration_hours = h;
            showDbRequestSummaryIfReady();
        }
    }
}

async function submitDbRequestViaAi(opts = {}) {
    setDbSubmitStatus('dbAiSubmitStatus', '', 'info');
    if (!selectedEngine || !dbRequestDraft) {
        alert('Please complete the NPAMx conversation first. Select account and database.');
        return;
    }
    const skipPrompt = !!opts.skipPrompt;
    if (!dbRequestDraft._readyToSubmit && !dbRequestDraft.confirmed_by_user) {
        alert('Please finish the NPAMx chat and confirm the summary by replying Yes before submitting.');
        return;
    }
    await refreshDbWorkflowPreview();
    if (dbWorkflowBlockedReason()) {
        const blockedMessage = dbWorkflowBlockedReason();
        setDbSubmitStatus('dbAiSubmitStatus', blockedMessage, 'error');
        alert(blockedMessage);
        return;
    }
    if (dbWorkflowPreview && dbWorkflowPreview.error) {
        setDbSubmitStatus('dbAiSubmitStatus', dbWorkflowPreview.message || 'No matching approval workflow found.', 'error');
        alert(dbWorkflowPreview.message || 'No matching approval workflow found.');
        return;
    }
    const approverEmail = getDbApproverEmail();
    const dbOwnerEmail = getDbOwnerEmail();
    const approverRequired = dbWorkflowRequiresApprover();
    if (getDbRequestMode() !== 'others' && approverRequired && !approverEmail) {
        alert('Please enter the approver email address.');
        return;
    }
    if (getDbRequestMode() !== 'others' && approverEmail && !/@nykaa\.com$/i.test(approverEmail)) {
        alert('Approver email must end with @nykaa.com.');
        return;
    }
    const confirmed = await confirmDbRequestSubmission();
    if (!confirmed) {
        setDbSubmitStatus('dbAiSubmitStatus', 'Database request submission cancelled.', 'info');
        return;
    }
    let justification = String(dbRequestDraft.justification || '').trim();
    if (!justification && !skipPrompt) {
        justification = prompt('Justification (why you need access):', '') || '';
        justification = String(justification).trim();
        if (justification) dbRequestDraft.justification = justification;
    }
    if (!justification) {
        alert('Please provide a short reason in chat (business reason) before submitting.');
        return;
    }
    let accountId = dbRequestDraft.account_id || dbRequestDraft.project_id || dbRequestDraft.subscription_id || dbRequestDraft.compartment_id || dbRequestDraft.atlas_project_id || '';
    if (!accountId) {
        alert('Please select the target account before submitting the database request.');
        return;
    }
    const databases = selectedDatabases.length ? selectedDatabases : [];
    if (!databases.length) {
        alert('Please select an instance and database name first.');
        return;
    }
    if (dbInstancePolicy?.request_allowed === false) {
        alert(dbInstancePolicy.request_block_reason || DEFAULT_DB_POLICY_BLOCK_REASON);
        return;
    }
    let targets = [];
    try {
        targets = buildDbRecipientSubmissionTargets(approverRequired, approverEmail);
        const invalidTarget = targets.find(function(item) {
            return item.requestApproverEmail && !/@nykaa\.com$/i.test(item.requestApproverEmail);
        });
        if (invalidTarget) {
            throw new Error(`Approver email for ${invalidTarget.email} must end with @nykaa.com.`);
        }
    } catch (err) {
        alert(err.message || 'Please select valid target users before submitting.');
        return;
    }
    try {
        setDbSubmitBusy('dbAiSubmitBtn', true, 'Submitting...');
        setDbSubmitStatus('dbAiSubmitStatus', `Submitting ${targets.length} database request${targets.length > 1 ? 's' : ''} for approval...`, 'info');
        const inst = dbRequestDraft?._selectedInstance || {};
        if (!inst.id) {
            alert('Please select the target database instance before submitting the request.');
            return;
        }
        const scopeMeta = getDbRequestScopeMeta(inst.engine || selectedEngine?.engine || '');
        const databaseName = String(dbRequestDraft?.requested_database_name || dbRequestDraft?.db_name || databases?.[0]?.name || '').trim();
        const schemaName = String(dbRequestDraft?.requested_schema_name || '').trim();
        const tableName = String(dbRequestDraft?.requested_table_name || '').trim();
        const detailName = String(dbRequestDraft?.requested_column_name || '').trim();
        const accessType = String(dbRequestDraft?.requested_access_type || '').trim()
            || (Array.isArray(dbRequestDraft?.query_types) ? dbRequestDraft.query_types.join(', ') : '')
            || String(dbRequestDraft?.permissions || '').trim();
        if (!databaseName) {
            alert('Please enter the Database Name.');
            return;
        }
        if (scopeMeta.schemaRequired && !schemaName) {
            alert(`Please enter the ${scopeMeta.schemaLabel} Name.`);
            return;
        }
        if (scopeMeta.objectRequired && !tableName) {
            alert(`Please enter the ${scopeMeta.objectLabel} Name.`);
            return;
        }
        let lastData = null;
        for (const target of targets) {
            const res = await fetch(`${DB_API_BASE}/api/databases/request-access`, {
                method: 'POST',
                headers: getDbRequestHeaders(),
                credentials: 'include',
                body: JSON.stringify({
                    databases,
                    account_id: accountId,
                    region: inst.region || '',
                    db_instance_id: inst.id || '',
                    rds_instance: inst.id || '',
                    engine: String(inst.engine || selectedEngine?.engine || '').trim().toLowerCase(),
                    resource_kind: String(inst.resource_kind || '').trim().toLowerCase(),
                    database_name: databaseName,
                    schema_name: schemaName,
                    table_name: tableName,
                    column_name: detailName,
                    access_type: accessType,
                    user_email: target.email,
                    user_full_name: target.fullName,
                    db_username: target.dbUsername,
                    permissions: dbRequestDraft.permissions || '',
                    query_types: Array.isArray(dbRequestDraft.query_types) ? dbRequestDraft.query_types : [],
                    requested_tables: Array.isArray(dbRequestDraft.requested_tables) ? dbRequestDraft.requested_tables : [],
                    role: dbRequestDraft.role || 'custom',
                    iam_role_template_id: String(dbRequestDraft?.iam_role_template_id || '').trim(),
                    iam_role_template_name: String(dbRequestDraft?.iam_role_template_name || '').trim(),
                    data_classification: String(inst.data_classification || dbInstancePolicy?.data_classification || '').trim().toLowerCase(),
                    is_pii: !!(inst.is_sensitive_classification || dbInstancePolicy?.is_sensitive_classification),
                    duration_hours: dbRequestDraft.duration_hours || 2,
                    justification,
                    request_approver_email: approverRequired ? target.requestApproverEmail : (target.requestApproverEmail || ''),
                    db_owner_email: dbOwnerEmail,
                    preferred_auth: dbRequestDraft.preferred_auth || '',
                    ai_generated: true,
                    confirmed_by_user: !!dbRequestDraft.confirmed_by_user,
                    conversation_id: dbConversationId
                })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            lastData = data;
        }
        setDbSubmitStatus('dbAiSubmitStatus', `Database request${targets.length > 1 ? 's' : ''} submitted successfully. Redirecting to My Requests...`, 'info');
        closeDbAiPanel();
        showDbRequestsAfterSubmit(
            lastData?.status,
            `Database request${targets.length > 1 ? 's' : ''} submitted successfully. Status: ${lastData?.status || 'pending'}. ${lastData?.message || 'Please check My Requests > Databases.'}`
        );
        var msg = `Request${targets.length > 1 ? 's' : ''} submitted successfully!\n\nCount: ${targets.length}\nStatus: ${lastData?.status || 'pending'}\n${lastData?.message || 'Please check the approval status under My Requests tab in Databases.'}`;
        if (lastData?.creation_error) msg += '\n\n' + lastData.creation_error;
        alert(msg);
    } catch (e) {
        setDbSubmitStatus('dbAiSubmitStatus', safeUserFacingErrorMessage(e), 'error');
        alert('Failed: ' + safeUserFacingErrorMessage(e));
    } finally {
        setDbSubmitBusy('dbAiSubmitBtn', false);
    }
}

function filterDbRequests(status) {
    dbStatusFilter = (status || 'pending');
    if (typeof currentRequestsCategory !== 'undefined') currentRequestsCategory = 'databases';
    if (typeof currentRequestsStatus !== 'undefined') currentRequestsStatus = dbStatusFilter;
    if (typeof persistRequestsViewState === 'function') persistRequestsViewState();
    dbRequestsPage = 1;
    dbBulkDeleteSelection = new Set();
    dbVisibleBulkDeleteIds = [];
    renderDbBulkDeleteToolbar();
    loadDbRequests();
}

function setDbRequestsStatusBanner(message, variant) {
    if (typeof setInlineStatus === 'function') {
        setInlineStatus('dbRequestsStatusBanner', message, variant || 'info');
    }
}

function showDbRequestsAfterSubmit(status, message) {
    const targetStatus = mapDbLifecycleToUiStatus(status || 'pending');
    clearDbRequestsRefreshPoll();
    if (typeof currentRequestsCategory !== 'undefined') currentRequestsCategory = 'databases';
    if (typeof currentRequestsStatus !== 'undefined') currentRequestsStatus = targetStatus;
    dbStatusFilter = targetStatus;
    if (typeof setRequestsFlowMode === 'function') {
        try { setRequestsFlowMode('mine'); } catch (_) {}
    }
    if (typeof persistRequestsViewState === 'function') persistRequestsViewState();
    if (typeof showPage === 'function') {
        try { showPage('requests'); } catch (_) {}
    }
    focusDbRequestsStatus(targetStatus);
    setDbRequestsLoadingState('Refreshing your database requests...');
    loadDbRequests();
    refreshApprovedDatabases();
    let attemptsRemaining = 6;
    const poll = function() {
        attemptsRemaining -= 1;
        loadDbRequests();
        refreshApprovedDatabases();
        if (attemptsRemaining > 0) {
            dbRequestsRefreshPollId = window.setTimeout(poll, 1800);
        } else {
            clearDbRequestsRefreshPoll();
        }
    };
    dbRequestsRefreshPollId = window.setTimeout(poll, 1800);
    window.setTimeout(function() {
        const dbCard = document.getElementById('requestsDatabasesCard');
        if (dbCard && typeof dbCard.scrollIntoView === 'function') {
            dbCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 80);
    setDbRequestsStatusBanner(
        message || 'Database request submitted successfully. Track it under My Requests > Databases.',
        'info'
    );
}

function mapDbLifecycleToUiStatus(status) {
    const s = String(status || '').trim().toLowerCase();
    if (!s) return 'pending';
    if (s === 'active') return 'active';
    if (s === 'approved') return 'approved';
    if (s === 'pending') return 'pending';
    if (s === 'rejected' || s === 'denied' || s === 'failed' || s === 'cancelled' || s === 'canceled') return 'rejected';
    if (s === 'expired' || s === 'revoked') return 'expired';
    return s;
}

function normalizeDbRequestUiStatus(req) {
    const row = req && typeof req === 'object' ? req : {};
    const lifecycle = String(row.lifecycle_status || row.status || '').trim().toLowerCase();
    const isExpired = row.is_expired === true;
    if (lifecycle === 'pending') return 'pending';
    if (lifecycle === 'denied' || lifecycle === 'rejected' || lifecycle === 'failed' || lifecycle === 'cancelled' || lifecycle === 'canceled') return 'rejected';
    if (lifecycle === 'expired' || lifecycle === 'revoked') return 'expired';
    if ((lifecycle === 'active' || lifecycle === 'approved') && isExpired) return 'expired';
    return mapDbLifecycleToUiStatus(lifecycle || row.status || '');
}

function isDbRequestDeletableStatus(status) {
    const s = String(status || '').toLowerCase();
    return s === 'pending';
}

function isDbBulkDeleteStatus(status) {
    const s = String(status || '').toLowerCase();
    return s === 'pending';
}

function renderDbBulkDeleteToolbar() {
    const box = document.getElementById('dbRequestsBulkActions');
    if (!box) return;
    const visibleIds = Array.isArray(dbVisibleBulkDeleteIds) ? dbVisibleBulkDeleteIds : [];
    if (!isDbBulkDeleteStatus(dbStatusFilter) || !visibleIds.length) {
        box.style.display = 'none';
        box.innerHTML = '';
        return;
    }
    const selectedCount = visibleIds.filter(id => dbBulkDeleteSelection.has(id)).length;
    const allChecked = selectedCount > 0 && selectedCount === visibleIds.length;
    box.style.display = 'flex';
    box.innerHTML = `
        <label class="db-bulk-select-label">
            <input type="checkbox" ${allChecked ? 'checked' : ''} onchange="toggleDbBulkSelectAll(this.checked)">
            <span>Select all</span>
        </label>
        <span class="db-bulk-count">${selectedCount} selected</span>
        <button class="btn-danger btn-sm" ${selectedCount ? '' : 'disabled'} onclick="deleteSelectedDbRequests()">
            <i class="fas fa-trash"></i> Delete selected
        </button>
    `;
}

function syncDbBulkSelectionToDom() {
    const checkboxes = document.querySelectorAll('.db-request-select-checkbox');
    checkboxes.forEach(cb => {
        const rid = cb.getAttribute('data-request-id') || '';
        cb.checked = dbBulkDeleteSelection.has(rid);
    });
}

function toggleDbRequestSelection(requestId, checked) {
    const rid = String(requestId || '').trim();
    if (!rid) return;
    if (checked) dbBulkDeleteSelection.add(rid);
    else dbBulkDeleteSelection.delete(rid);
    renderDbBulkDeleteToolbar();
}

function toggleDbBulkSelectAll(checked) {
    if (!Array.isArray(dbVisibleBulkDeleteIds)) return;
    if (checked) {
        dbVisibleBulkDeleteIds.forEach(id => dbBulkDeleteSelection.add(id));
    } else {
        dbVisibleBulkDeleteIds.forEach(id => dbBulkDeleteSelection.delete(id));
    }
    syncDbBulkSelectionToDom();
    renderDbBulkDeleteToolbar();
}

async function deleteSelectedDbRequests() {
    const selectedIds = (dbVisibleBulkDeleteIds || []).filter(id => dbBulkDeleteSelection.has(id));
    if (!selectedIds.length) {
        alert('Select at least one request to delete.');
        return;
    }
    if (typeof confirmAppAction === 'function') {
        const confirmed = await confirmAppAction(`Delete ${selectedIds.length} selected request(s)?`, {
            title: 'Delete requests',
            confirmLabel: 'Delete',
            variant: 'warning'
        });
        if (!confirmed) return;
    } else if (!confirm(`Delete ${selectedIds.length} selected request(s)?`)) {
        return;
    }
    try {
        const res = await fetch(`${DB_API_BASE}/api/databases/requests/bulk-delete`, {
            method: 'POST',
            headers: getDbRequestHeaders(),
            credentials: 'include',
            body: JSON.stringify({ request_ids: selectedIds })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        const deleted = Array.isArray(data.deleted) ? data.deleted : [];
        const failed = Array.isArray(data.failed) ? data.failed : [];
        deleted.forEach(id => dbBulkDeleteSelection.delete(id));
        alert(
            failed.length
                ? `Deleted ${deleted.length} request(s). ${failed.length} could not be deleted.`
                : `Deleted ${deleted.length} request(s).`
        );
        loadDbRequests();
        refreshApprovedDatabases();
    } catch (e) {
        alert('Failed: ' + safeUserFacingErrorMessage(e));
    }
}

function focusDbRequestsStatus(status) {
    dbStatusFilter = mapDbLifecycleToUiStatus(status);
    if (typeof currentRequestsCategory !== 'undefined') currentRequestsCategory = 'databases';
    if (typeof currentRequestsStatus !== 'undefined') currentRequestsStatus = dbStatusFilter;
    if (typeof persistRequestsViewState === 'function') persistRequestsViewState();
    dbRequestsPage = 1;
    dbBulkDeleteSelection = new Set();
    dbVisibleBulkDeleteIds = [];
    renderDbBulkDeleteToolbar();
    document.querySelectorAll('.requests-status-btn[data-category="databases"]').forEach(btn => {
        btn.classList.remove('requests-status-glow');
        if (btn.dataset.status === dbStatusFilter) btn.classList.add('requests-status-glow');
    });
}

function onDbRequestsSearchChange() {
    dbRequestsSearch = (document.getElementById('dbRequestsSearchInput')?.value || '').trim();
    dbRequestsPage = 1;
    loadDbRequests();
}

function setDbRequestsPage(nextPage) {
    const p = parseInt(nextPage, 10);
    if (!p || p < 1) return;
    dbRequestsPage = p;
    loadDbRequests();
}

function renderDbRequestsPager(meta) {
    const pager = document.getElementById('dbRequestsPager');
    if (!pager) return;
    const page = parseInt(meta?.page || 1, 10) || 1;
    const pageSize = parseInt(meta?.page_size || meta?.pageSize || 20, 10) || 20;
    const total = parseInt(meta?.total || 0, 10) || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = total === 0 ? 0 : ((page - 1) * pageSize + 1);
    const end = Math.min(total, page * pageSize);

    if (totalPages <= 1) {
        pager.innerHTML = total ? `<span class="db-requests-pager-meta">${start}-${end} of ${total}</span>` : '';
        return;
    }

    const prevDisabled = page <= 1 ? 'disabled' : '';
    const nextDisabled = page >= totalPages ? 'disabled' : '';
    pager.innerHTML = `
        <span class="db-requests-pager-meta">${start}-${end} of ${total}</span>
        <button class="db-requests-pager-btn" ${prevDisabled} onclick="setDbRequestsPage(${page - 1})" title="Previous page">
            <i class="fas fa-chevron-left"></i>
        </button>
        <span class="db-requests-pager-page">Page ${page} / ${totalPages}</span>
        <button class="db-requests-pager-btn" ${nextDisabled} onclick="setDbRequestsPage(${page + 1})" title="Next page">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;
}

function normalizeDbRequestRow(req) {
    if (!req || typeof req !== 'object') return null;
    const row = Object.assign({}, req);
    const requestId = String(row.request_id || row.id || '').trim();
    if (!requestId) return null;
    row.request_id = requestId;
    if (!row.status && row.lifecycle_status) row.status = row.lifecycle_status;
    row.status = normalizeDbRequestUiStatus(row);
    return row;
}

async function fetchDbRequestsFromGenericFeed(requestedStatus, queryText) {
    const res = await fetch(`${DB_API_BASE}/api/requests`, { credentials: 'include' });
    const data = await res.json().catch(function() { return []; });
    if (!res.ok) {
        throw new Error((data && data.error) || 'Failed to load requests.');
    }
    const rows = Array.isArray(data) ? data : [];
    const q = String(queryText || '').trim().toLowerCase();
    const requestsFlowMode = (typeof window.getRequestsFlowMode === 'function') ? window.getRequestsFlowMode() : 'mine';
    const filtered = rows
        .filter(function(item) {
            return item && item.type === 'database_access';
        })
        .map(normalizeDbRequestRow)
        .filter(Boolean)
        .filter(function(item) {
            if (requestsFlowMode === 'mine') return item?.is_requester === true;
            if (requestsFlowMode === 'approvals') return item?.is_requester !== true && (item?.can_approve === true || item?.can_deny === true);
            return true;
        })
        .filter(function(item) {
            const uiStatus = normalizeDbRequestUiStatus(item);
            if (requestedStatus && requestedStatus !== 'all' && uiStatus !== requestedStatus) {
                return false;
            }
            if (!q) return true;
            const dbNames = Array.isArray(item.databases)
                ? item.databases.map(function(db) { return String((db && db.name) || '').trim().toLowerCase(); }).join(' ')
                : '';
            const searchHay = [
                String(item.request_id || '').toLowerCase(),
                String(item.account_id || '').toLowerCase(),
                String(item.db_instance_id || '').toLowerCase(),
                String(item.user_email || '').toLowerCase(),
                dbNames
            ].join(' ');
            return searchHay.includes(q);
        })
        .sort(function(a, b) {
            return new Date(b.created_at || b.requested_at || 0) - new Date(a.created_at || a.requested_at || 0);
        });
    const page = parseInt(dbRequestsPage || 1, 10) || 1;
    const pageSize = parseInt(dbRequestsPageSize || 20, 10) || 20;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return {
        requests: filtered.slice(start, end),
        page: page,
        page_size: pageSize,
        total: filtered.length
    };
}

async function loadDbRequests() {
    const requestedStatus = String(dbStatusFilter || 'pending').trim().toLowerCase() || 'pending';
    const loadSeq = ++dbRequestsLoadSeq;
    const list = document.getElementById('dbRequestsList');
    if (list) {
        list.innerHTML = `<div class="db-requests-empty"><i class="fas fa-spinner fa-spin"></i> Loading ${escapeHtml(requestedStatus)} database requests...</div>`;
    }
    try {
        const url = new URL(`${DB_API_BASE}/api/databases/requests`);
        url.searchParams.set('status', requestedStatus);
        const requestsFlowMode = (typeof window.getRequestsFlowMode === 'function') ? window.getRequestsFlowMode() : 'mine';
        url.searchParams.set('flow_mode', requestsFlowMode);
        url.searchParams.set('page', String(dbRequestsPage || 1));
        url.searchParams.set('page_size', String(dbRequestsPageSize || 20));
        if (dbRequestsSearch) url.searchParams.set('q', dbRequestsSearch);

        const res = await fetch(url.toString(), { credentials: 'include' });
        let data = await res.json().catch(function() { return {}; });
        if (!res.ok) {
            data = await fetchDbRequestsFromGenericFeed(requestedStatus, dbRequestsSearch);
        }
        if (loadSeq !== dbRequestsLoadSeq) return;
        if (!list) return;
        let requests = Array.isArray(data.requests) ? data.requests.map(normalizeDbRequestRow).filter(Boolean) : [];
        databaseRequestsCache = requests.slice();
        renderDbRequestsPager(data);
        if (!isDbBulkDeleteStatus(requestedStatus)) {
            dbBulkDeleteSelection = new Set();
            dbVisibleBulkDeleteIds = [];
        }
        if (!requests || requests.length === 0) {
            const label = requestsFlowMode === 'approvals'
                ? 'database requests are waiting for your approval'
                : `${requestedStatus || 'pending'} database requests`;
            list.innerHTML = `<div class="db-requests-empty">No ${escapeHtml(label)}</div>`;
            databaseRequestsCache = [];
            dbBulkDeleteSelection = new Set();
            dbVisibleBulkDeleteIds = [];
            renderDbBulkDeleteToolbar();
            clearDbRequestsRefreshPoll();
            return;
        }
        const roleLabel = r => ({ read_only: 'Read-only', read_limited_write: 'Limited Write', read_full_write: 'Full Write', admin: 'Admin', custom: 'Custom (NPAMx)' })[r] || r;
        const isAdminUser = (typeof currentUser !== 'undefined' && currentUser && currentUser.isAdmin) || localStorage.getItem('isAdmin') === 'true';
        const canApprove = (req) => req?.status === 'pending' && req?.can_approve === true;
        const canDeny = (req) => req?.status === 'pending' && req?.can_deny === true;
        const canDeleteRequest = (req) => {
            const status = String(req?.status || '').toLowerCase();
            const staleApproved = isDbApprovedStaleRequest(req);
            if (status !== 'pending' && !staleApproved) return false;
            if (isAdminUser) return true;
            return req?.is_requester === true;
        };
        const canCloneRequest = (req) => {
            const status = String(req?.status || '').toLowerCase();
            return req?.is_requester === true && ['completed', 'expired', 'revoked'].includes(status);
        };
        scheduleDbRequestsRefreshWhileProvisioning(requests);
        dbVisibleBulkDeleteIds = isDbBulkDeleteStatus(requestedStatus)
            ? requests.filter(canDeleteRequest).map(req => String(req.request_id || '').trim()).filter(Boolean)
            : [];
        if (isDbBulkDeleteStatus(requestedStatus)) {
            dbBulkDeleteSelection = new Set(
                Array.from(dbBulkDeleteSelection).filter(id => dbVisibleBulkDeleteIds.includes(id))
            );
        }
        const tableHeader = `
            <div class="db-requests-table-header ${isDbBulkDeleteStatus(requestedStatus) ? 'db-requests-table-header-bulk' : ''}">
                ${isDbBulkDeleteStatus(requestedStatus) ? '<div class="db-requests-col db-requests-col-select"></div>' : ''}
                <div class="db-requests-col db-requests-col-id">Request</div>
                <div class="db-requests-col db-requests-col-status">Status</div>
                <div class="db-requests-col db-requests-col-target">Target</div>
                <div class="db-requests-col db-requests-col-expiry">Expires</div>
                <div class="db-requests-col db-requests-col-actions">Quick Action</div>
                <div class="db-requests-col db-requests-col-expand"></div>
            </div>`;
        const tableRows = requests.map(req => {
            const db = req.databases && req.databases[0];
            const eng = String(db?.engine || 'db');
            const dbNames = Array.isArray(req.databases)
                ? req.databases.map(d => d?.name).filter(Boolean).join(', ')
                : '';
            const firstDbName = (dbNames.split(',')[0] || db?.name || 'default').trim().replace(/'/g, "\\'");
            const perms = Array.isArray(req.permissions)
                ? req.permissions
                : (typeof req.permissions === 'string' ? req.permissions.split(',').map(s => s.trim()).filter(Boolean) : []);
            const permsText = perms.length ? perms.join(', ') : '—';
            const queryTypes = Array.isArray(req.query_types)
                ? req.query_types.map(s => String(s || '').trim()).filter(Boolean)
                : [];
            const actionsText = queryTypes.length ? queryTypes.join(', ') : permsText;
            const expires = formatDbDateTime(req.expires_at);
            const requestedAt = req.requested_at || req.created_at;
            const requestedAtText = formatDbDateTime(requestedAt);
            const justification = String(req.justification || '').trim();
            const accountId = String(req.account_id || '').trim();
            const accountName = String(req.account_name || '').trim();
            const accountText = accountName
                ? (accountId ? `${accountName} (${accountId})` : accountName)
                : (accountId || '—');
            const instanceText = String(req.requested_instance_input || req.db_instance_id || db?.id || '—').trim() || '—';
            const scopeMeta = getDbRequestScopeMeta(req.engine || db?.engine || '');
            const schemaText = String(req.requested_schema_name || '').trim() || '—';
            const tableText = String(req.requested_table_name || '').trim()
                || (Array.isArray(req.requested_tables) && req.requested_tables.length ? req.requested_tables.join(', ') : '—');
            const detailText = String(req.requested_column_name || '').trim() || '—';
            const accessTypeText = String(req.requested_access_type || '').trim() || actionsText;
            const requestIdRaw = String(req.request_id || '');
            const requestIdEsc = requestIdRaw.replace(/'/g, "\\'");
            const isActive = req.status === 'active';
            const isPendingSelfApproval = req.status === 'pending' && req?.is_requester === true && req?.can_approve === true;
            const domId = domIdFromRequestId(requestIdRaw);
            const showBulkSelect = isDbBulkDeleteStatus(requestedStatus) && canDeleteRequest(req);
            const checked = dbBulkDeleteSelection.has(requestIdRaw);
            const approvalNote = String(req.approval_note || '').trim();
            const activationError = String(req.activation_error || '').trim();
            const activationMessage = String(req.activation_progress?.message || '').trim();
            const activationRetryable = isDbRetryableActivation(req);
            const activationIssueLabel = activationRetryable ? 'Provisioning' : 'Activation issue';
            const activationIssueStyle = activationRetryable ? 'color:#8a5a00;' : 'color:#c62828;';
            const lifecycleStatus = String(req.lifecycle_status || req.status || '').trim().toLowerCase();
            const canCancelProcessing = req?.is_requester === true && lifecycleStatus === 'approved' && activationRetryable;
            const canDeleteStaleApproved = canDeleteRequest(req) && isDbApprovedStaleRequest(req);
            const workflowName = String(req.approval_workflow_name || '').trim();
            const pendingStage = String(req.pending_stage || '').trim();
            const pendingApprovers = Array.isArray(req.pending_approvers)
                ? req.pending_approvers.map(item => String(item || '').trim()).filter(Boolean).join(', ')
                : '';
            const cancelledReason = String(req.cancellation_reason || req.approval_note || '').trim();
            const activationProblem = lifecycleStatus === 'approved' && activationError;
            const statusLabel = lifecycleStatus === 'cancelled' || lifecycleStatus === 'canceled'
                ? 'cancelled'
                : activationProblem
                    ? 'activation issue'
                    : (isPendingSelfApproval ? 'pending self approval' : String(req.status || '').replace(/_/g, ' '));
            const statusBadge = activationProblem ? 'rejected' : String(req.status || '').trim().toLowerCase();
            const activationProgressPanel = lifecycleStatus === 'approved'
                ? renderDbActivationProgress(req)
                : '';
            const quickRowActions = [];
            if (canCloneRequest(req)) {
                quickRowActions.push(`<button class="btn-secondary btn-sm" onclick="event.preventDefault(); event.stopPropagation(); cloneDbRequest('${requestIdEsc}')"><i class="fas fa-clone"></i> Clone</button>`);
            }
            if (req.status === 'approved' && !activationRetryable) {
                quickRowActions.push(`<button class="btn-secondary btn-sm" onclick="event.preventDefault(); event.stopPropagation(); retryDbActivation('${requestIdEsc}')"><i class="fas fa-rotate-right"></i> Activate</button>`);
            }
            return `<details class="db-request-item db-request-${escapeAttr(req.status)}">
                <summary class="db-request-summary db-request-table-row ${showBulkSelect ? 'db-request-table-row-bulk' : ''}">
                    ${showBulkSelect ? `<div class="db-requests-col db-requests-col-select">
                        <label class="db-request-select-wrap" onclick="event.stopPropagation()">
                            <input
                                type="checkbox"
                                class="db-request-select-checkbox"
                                data-request-id="${escapeAttr(requestIdRaw)}"
                                ${checked ? 'checked' : ''}
                                onchange="toggleDbRequestSelection('${requestIdEsc}', this.checked)"
                            >
                        </label>
                    </div>` : ''}
                    <div class="db-requests-col db-requests-col-id" data-label="Request">
                        <div class="db-request-cell-primary"><span class="db-request-id">${escapeHtml((req.request_id || '').slice(0, 8))}</span></div>
                        <div class="db-request-cell-secondary">${escapeHtml(eng)} · ${escapeHtml(roleLabel(req.role))}</div>
                    </div>
                    <div class="db-requests-col db-requests-col-status" data-label="Status">
                        <span class="db-request-status db-status-badge-${escapeAttr(statusBadge)}">${escapeHtml(statusLabel)}</span>
                    </div>
                    <div class="db-requests-col db-requests-col-target" data-label="Target">
                        <div class="db-request-cell-primary">${escapeHtml(instanceText)}</div>
                        <div class="db-request-cell-secondary">${escapeHtml(dbNames || '—')} · ${escapeHtml(accountText)}</div>
                    </div>
                    <div class="db-requests-col db-requests-col-expiry" data-label="Expires">
                        <div class="db-request-cell-primary">${escapeHtml(expires)}</div>
                        <div class="db-request-cell-secondary">${escapeHtml(String(req.duration_hours || 2))}h</div>
                    </div>
                    <div class="db-requests-col db-requests-col-actions" data-label="Quick Action">
                        <div class="db-request-row-actions" onclick="event.stopPropagation()">
                            ${quickRowActions.length ? quickRowActions.join('') : '<span class="db-request-row-action-placeholder">Open row</span>'}
                        </div>
                    </div>
                    <div class="db-requests-col db-requests-col-expand">
                        <i class="fas fa-chevron-down db-request-chevron" aria-hidden="true"></i>
                    </div>
                </summary>
                <div class="db-request-details">
                    <div class="db-request-body">
                        <p><strong>Requested:</strong> ${escapeHtml(requestedAtText)}</p>
                        ${req.requested_by_email && String(req.requested_by_email).toLowerCase() !== String(req.user_email || '').toLowerCase() ? `<p><strong>Submitted By:</strong> ${escapeHtml(req.requested_by_email)}</p>` : ''}
                        <p><strong>AWS Account:</strong> <span class="db-req-perms">${escapeHtml(accountText)}</span></p>
                        <p><strong>Requested:</strong> ${escapeHtml(requestedAtText)}</p>
                        <p><strong>${escapeHtml(getDbTargetLabel(req.engine || db?.engine || '', req.resource_kind || ''))}:</strong> <code>${escapeHtml(instanceText)}</code></p>
                        <p><strong>Database(s):</strong> ${escapeHtml(dbNames || '—')}</p>
                        ${scopeMeta.schemaVisible ? `<p><strong>${escapeHtml(scopeMeta.schemaLabel)}:</strong> ${escapeHtml(schemaText)}</p>` : ''}
                        <p><strong>${escapeHtml(scopeMeta.objectPluralLabel)}:</strong> ${escapeHtml(tableText)}</p>
                        <p><strong>${escapeHtml(scopeMeta.detailLabel)}:</strong> ${escapeHtml(detailText)}</p>
                        <p><strong>Actions:</strong> <span class="db-req-perms">${escapeHtml(actionsText)}</span></p>
                        <p><strong>Access Type:</strong> <span class="db-req-perms">${escapeHtml(accessTypeText)}</span></p>
                        <p><span class="db-req-proxy">Proxy:</span> <code>${escapeHtml(String(db?.host || '-'))}:${escapeHtml(String(db?.port || '-'))}</code></p>
                        <p>Role: ${escapeHtml(roleLabel(req.role))} | ${escapeHtml(String(req.duration_hours || 2))}h</p>
                        ${justification ? `<p class="db-req-justification">${escapeHtml(justification)}</p>` : ''}
                        ${workflowName ? `<p><strong>Workflow:</strong> ${escapeHtml(workflowName)}</p>` : ''}
                        ${pendingStage ? `<p><strong>Pending Stage:</strong> ${escapeHtml(pendingStage)}</p>` : ''}
                        ${pendingApprovers ? `<p><strong>Current Approvers:</strong> ${escapeHtml(pendingApprovers)}</p>` : ''}
                        ${approvalNote ? `<p class="db-req-justification">${escapeHtml(approvalNote)}</p>` : ''}
                        ${(lifecycleStatus === 'cancelled' || lifecycleStatus === 'canceled') && cancelledReason ? `<p class="db-req-justification" style="color:#8a5a00;"><strong>Cancelled:</strong> ${escapeHtml(cancelledReason)}</p>` : ''}
                        ${req.status === 'approved' && !activationProgressPanel && activationMessage ? `<p class="db-req-justification"><strong>Activation:</strong> ${escapeHtml(activationMessage)}</p>` : ''}
                        ${req.status === 'approved' && !activationProgressPanel && activationError ? `<p class="db-req-justification" style="${activationIssueStyle}"><strong>${escapeHtml(activationIssueLabel)}:</strong> ${escapeHtml(activationError)}</p>` : ''}
                        ${activationProgressPanel}
                        ${isActive ? `<div class="db-cred-inline" id="dbCredInline-${escapeAttr(domId)}" style="display:none;"></div>` : ''}
                    </div>
                    <div class="db-request-actions" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
                        <button class="btn-secondary btn-sm" onclick="viewDbRequestDetails('${requestIdEsc}')"><i class="fas fa-circle-info"></i> View</button>
                        ${isActive ? `
                            <button class="btn-primary btn-sm" onclick="connectToDatabase('${String(db?.host || '').replace(/'/g, "\\'")}', '${String(db?.port || '').replace(/'/g, "\\'")}', '${eng.replace(/'/g, "\\'")}', '${requestIdEsc}', '${firstDbName}')"><i class="fas fa-terminal"></i> PAM Terminal</button>
                            <button class="btn-secondary btn-sm" onclick="toggleDbCredInline('${requestIdEsc}')"><i class="fas fa-key"></i> Login details</button>
                            <button class="btn-secondary btn-sm" onclick="openDbExternalToolModal('${requestIdEsc}')"><i class="fas fa-key"></i> Get login details</button>
                        ` : ''}
                        ${req.status === 'approved' && activationRetryable ? `
                            <button class="btn-secondary btn-sm" onclick="openDbExternalToolModal('${requestIdEsc}')"><i class="fas fa-spinner fa-spin"></i> Preparing access...</button>
                        ` : ''}
                        ${canCancelProcessing ? `
                            <button class="btn-danger btn-sm" onclick="cancelDbProcessing('${requestIdEsc}')"><i class="fas fa-ban"></i> Cancel Processing</button>
                        ` : ''}
                        ${req.status === 'approved' && !activationRetryable ? `
                            <button class="btn-secondary btn-sm" onclick="retryDbActivation('${requestIdEsc}')"><i class="fas fa-rotate-right"></i> Activate</button>
                        ` : ''}
                        ${canApprove(req) ? `
                        <button class="btn-primary btn-sm" onclick="approveDbRequest('${requestIdEsc}')"><i class="fas fa-check"></i> ${isPendingSelfApproval ? 'Self Approve' : 'Approve'}</button>
                        ` : ''}
                        ${canDeny(req) ? `
                        <button class="btn-danger btn-sm" onclick="denyDbRequest('${requestIdEsc}')"><i class="fas fa-times"></i> Reject</button>
                        ` : ''}
                        ${canDeleteRequest(req) ? `
                        <button class="btn-danger btn-sm" onclick="deleteDbRequest('${requestIdEsc}')"><i class="fas fa-trash"></i> ${canDeleteStaleApproved ? 'Delete Stale Request' : 'Delete'}</button>
                        ` : ''}
                    </div>
                </div>
            </details>`;
        }).join('');
        list.innerHTML = `<div class="db-requests-table-shell">${tableHeader}${tableRows}</div>`;
        syncDbBulkSelectionToDom();
        renderDbBulkDeleteToolbar();
        clearDbRequestsRefreshPoll();
    } catch (e) {
        if (loadSeq !== dbRequestsLoadSeq) return;
        const list = document.getElementById('dbRequestsList');
        if (list) list.innerHTML = `<div class="db-requests-empty">${escapeHtml(safeUserFacingErrorMessage(e) || 'Error loading requests')}</div>`;
        databaseRequestsCache = [];
        dbVisibleBulkDeleteIds = [];
        renderDbBulkDeleteToolbar();
        clearDbRequestsRefreshPoll();
    }
}

async function denyDbRequest(requestId) {
    let reason = '';
    if (typeof promptAppAction === 'function') {
        reason = await promptAppAction(
            'Provide a reason for rejecting this request.',
            {
                title: 'Reject request',
                submitLabel: 'Reject request',
                cancelLabel: 'Cancel',
                variant: 'warning',
                placeholder: 'Enter rejection reason (required)',
                helperText: 'This reason is stored for audit and emailed to the requester.',
                minLength: 3,
                required: true,
            }
        );
        if (reason === null) return;
    } else {
        reason = prompt('Enter reason for rejection (required):');
        if (!reason || reason.length < 3) {
            alert('Please enter a reason (at least 3 characters).');
            return;
        }
    }
    try {
        const res = await fetch(`${DB_API_BASE}/api/request/${requestId}/deny`, {
            method: 'POST',
            headers: getDbRequestHeaders(),
            credentials: 'include',
            body: JSON.stringify({ reason: reason })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        alert('Request rejected');
        loadDbRequests();
        if (typeof loadRequests === 'function') loadRequests();
    } catch (e) {
        alert('Failed: ' + safeUserFacingErrorMessage(e));
    }
}

async function deleteDbRequest(requestId) {
    const row = Array.isArray(databaseRequestsCache)
        ? databaseRequestsCache.find(item => String(item?.request_id || '').trim() === String(requestId || '').trim())
        : null;
    const staleApproved = isDbApprovedStaleRequest(row);
    const promptMessage = staleApproved
        ? 'Delete this stale approved request from your list? Any partial provisioning cleanup will be attempted first.'
        : 'Delete this old request from your list?';
    if (typeof confirmAppAction === 'function') {
        const confirmed = await confirmAppAction(promptMessage, {
            title: 'Delete request',
            confirmLabel: 'Delete',
            variant: 'warning'
        });
        if (!confirmed) return;
    } else if (!confirm(promptMessage)) {
        return;
    }
    try {
        const res = await fetch(`${DB_API_BASE}/api/databases/request/${encodeURIComponent(requestId)}/delete`, {
            method: 'DELETE',
            headers: getDbRequestHeaders(),
            credentials: 'include'
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        alert('Request deleted');
        loadDbRequests();
        refreshApprovedDatabases();
    } catch (e) {
        alert('Failed: ' + safeUserFacingErrorMessage(e));
    }
}

async function approveDbRequest(requestId) {
    if (typeof confirmAppAction === 'function') {
        const confirmed = await confirmAppAction('Approve this database access request?', {
            title: 'Approve request',
            confirmLabel: 'Approve',
            variant: 'info'
        });
        if (!confirmed) return;
    } else if (!confirm('Approve this database access request?')) {
        return;
    }
    try {
        clearDbRequestsRefreshPoll();
        if (typeof setRequestsFlowMode === 'function') {
            try { setRequestsFlowMode('mine'); } catch (_) {}
        } else {
            requestsFlowMode = 'mine';
        }
        if (typeof currentRequestsCategory !== 'undefined') currentRequestsCategory = 'databases';
        if (typeof currentRequestsStatus !== 'undefined') currentRequestsStatus = 'approved';
        focusDbRequestsStatus('approved');
        if (typeof showPage === 'function') {
            try { showPage('requests'); } catch (_) {}
        }
        setDbRequestsLoadingState('Approving request and preparing access...');
        setDbRequestsStatusBanner('Approving request and preparing access...', 'info');
        const res = await fetch(`${DB_API_BASE}/api/approve/${requestId}`, {
            method: 'POST',
            headers: getDbRequestHeaders(),
            credentials: 'include',
            body: JSON.stringify({})
        });
        const data = await res.json();
        const status = String(data.status || '').toLowerCase();
        const activationRetryable = data.activation_retryable === true;
        if (data.error && status !== 'approved') throw new Error(data.error);
        if (data.error && status === 'approved') {
            if (activationRetryable) {
                setDbRequestsStatusBanner(data.message || 'Approved. We are still preparing access in the background.', 'info');
            } else {
                alert(`${data.message || 'Approved.'} ${safeUserFacingErrorMessage({ message: data.error })}`);
            }
        } else {
            alert(data.message || '✅ Approved');
        }
        if (typeof setRequestsFlowMode === 'function') {
            try { setRequestsFlowMode('mine'); } catch (_) {}
        } else {
            requestsFlowMode = 'mine';
        }
        focusDbRequestsStatus(status === 'active' ? 'active' : (data.status || 'approved'));
        loadDbRequests();
        refreshApprovedDatabases();
        if (typeof loadRequests === 'function') loadRequests();
    } catch (e) {
        alert('Failed: ' + safeUserFacingErrorMessage(e));
    }
}

async function retryDbActivation(requestId) {
    if (!requestId) return;
    try {
        const res = await fetch(`${DB_API_BASE}/api/databases/request/${encodeURIComponent(requestId)}/activate`, {
            method: 'POST',
            headers: getDbRequestHeaders(),
            credentials: 'include',
            body: JSON.stringify({})
        });
        const data = await res.json();
        const status = String(data.status || '').toLowerCase();
        const activationRetryable = data.activation_retryable === true;
        if (data.error && status !== 'approved') {
            throw new Error(data.error);
        }
        if (data.error && status === 'approved') {
            if (activationRetryable) {
                setDbRequestsStatusBanner(data.message || 'Access is still being prepared.', 'info');
            } else {
                alert(`${data.message || 'Activation is still pending.'} ${safeUserFacingErrorMessage({ message: data.error })}`);
            }
        } else {
            alert(data.message || 'Activation requested.');
        }
        focusDbRequestsStatus(status === 'active' ? 'active' : (data.status || 'approved'));
        loadDbRequests();
        refreshApprovedDatabases();
    } catch (e) {
        alert('Failed: ' + safeUserFacingErrorMessage(e));
    }
}

async function cancelDbProcessing(requestId) {
    if (!requestId) return;
    const confirmationMessage = 'Are you sure you want to cancel the processing? If it is canceled, you need to go with request and approvals again.';
    let confirmed = false;
    if (typeof confirmAppAction === 'function') {
        confirmed = await confirmAppAction(confirmationMessage, {
            title: 'Cancel processing',
            confirmLabel: 'Cancel Processing',
            variant: 'warning'
        });
    } else {
        confirmed = window.confirm(confirmationMessage);
    }
    if (!confirmed) return;
    try {
        const res = await fetch(`${DB_API_BASE}/api/databases/request/${encodeURIComponent(requestId)}/cancel-processing`, {
            method: 'POST',
            headers: getDbRequestHeaders(),
            credentials: 'include',
            body: JSON.stringify({})
        });
        const data = await res.json().catch(function() { return {}; });
        if (!res.ok || data.error) {
            throw new Error((data && data.error) || 'Failed to cancel request processing.');
        }
        const message = data.message || 'Provisioning cancelled. Submit a new request and complete approvals again to retry.';
        setDbRequestsStatusBanner(message, 'info');
        alert(message);
        clearDbRequestsRefreshPoll();
        loadDbRequests();
        refreshApprovedDatabases();
        if (typeof loadRequests === 'function') loadRequests();
    } catch (e) {
        alert('Failed: ' + safeUserFacingErrorMessage(e));
    }
}

function closeDbRequestDetailsModal() {
    const el = document.getElementById('dbRequestDetailsModal');
    if (el) el.remove();
}

function closeDbExternalToolModal() {
    const el = document.getElementById('dbExternalToolModal');
    if (el) el.remove();
}

function closeDbCredInline(requestId) {
    const domId = domIdFromRequestId(requestId);
    const el = document.getElementById(`dbCredInline-${domId}`);
    if (!el) return;
    el.style.display = 'none';
    el.innerHTML = '';
}

async function copyToClipboard(text) {
    const value = String(text || '');
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch (e) {
        // fall through to legacy copy fallback
    }
    try {
        const el = document.createElement('textarea');
        el.value = value;
        el.setAttribute('readonly', 'readonly');
        el.style.position = 'fixed';
        el.style.top = '-9999px';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.focus();
        el.select();
        el.setSelectionRange(0, el.value.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(el);
        return !!ok;
    } catch (e) {
        return false;
    }
}

async function fetchDbCredentials(requestId, opts = {}) {
    const rid = String(requestId || '').trim();
    if (!rid) throw new Error('Missing request id');
    const forceRefresh = !!opts.forceRefresh;
    if (!forceRefresh && dbCredCache[rid]?.data) {
        const cached = dbCredCache[rid].data;
        const isIam = String(cached?.effective_auth || '').toLowerCase() === 'iam';
        // IAM tokens are short-lived; refresh frequently to avoid stale tokens.
        if (!isIam) return cached;
        if (Date.now() - (dbCredCache[rid].fetchedAt || 0) < 60 * 1000) return cached;
    }

    const res = await fetch(`${DB_API_BASE}/api/databases/request/${encodeURIComponent(rid)}/credentials`, {
        credentials: 'include'
    });
    const data = await res.json();
    if (data.error) {
        const msg = [data.error, data.message].filter(Boolean).join(' ').trim() || data.error;
        const err = new Error(msg);
        err.activationProgress = data.activation_progress || null;
        err.apiMessage = data.message || '';
        throw err;
    }
    dbCredCache[rid] = { data, fetchedAt: Date.now() };
    return data;
}

function isDbCredentialPreparingMessage(message) {
    const msg = String(message || '').toLowerCase();
    return (
        msg.includes('credentials are not available') ||
        msg.includes('request is not active yet') ||
        msg.includes('access is being prepared') ||
        msg.includes('activation in progress') ||
        msg.includes('activation is pending') ||
        msg.includes('retry in a few minutes') ||
        msg.includes('approved. activation is pending')
    );
}

function parseCliFlagValue(command, flagName) {
    const cmd = String(command || '');
    if (!cmd) return '';
    const rx = new RegExp(`(?:^|\\s)--${flagName}\\s+([^\\s]+)`);
    const m = cmd.match(rx);
    if (!m) return '';
    return String(m[1] || '').trim().replace(/^['"]|['"]$/g, '');
}

function parseMysqlOptionValue(command, optName) {
    const cmd = String(command || '');
    if (!cmd) return '';
    const rx = new RegExp(`(?:^|\\s)--${optName}\\s+([^\\s]+)`);
    const m = cmd.match(rx);
    if (!m) return '';
    return String(m[1] || '').trim().replace(/^['"]|['"]$/g, '');
}

function normalizeIamLocalInstructions(rawInstructions, fallback = {}) {
    const src = (rawInstructions && typeof rawInstructions === 'object') ? rawInstructions : {};
    const out = { ...src };
    const service = String(out.service || fallback.service || '').trim().toLowerCase();
    if (typeof out.available !== 'boolean') {
        out.available = !!(fallback && fallback.hostname && fallback.username);
    }
    if (!out.available) return out;
    if (service === 'redshift') {
        const hostname = String(out.hostname || fallback.hostname || '').trim();
        const username = String(out.username || fallback.username || '').trim();
        const region = String(out.region || fallback.region || '').trim() || 'ap-south-1';
        const database = String(out.database || fallback.database || '').trim() || 'dev';
        const clusterIdentifier = String(out.cluster_identifier || fallback.cluster_identifier || '').trim();
        let port = String(out.port || fallback.port || 5439).trim();
        if (!port || !/^\d+$/.test(port)) port = '5439';
        out.service = 'redshift';
        out.token_command_label = out.token_command_label || 'Fetch temporary Redshift credentials:';
        out.connect_command_label = out.connect_command_label || 'Connect with psql:';
        if (hostname) out.hostname = hostname;
        if (username) out.username = username;
        out.region = region;
        out.database = database;
        if (clusterIdentifier) out.cluster_identifier = clusterIdentifier;
        out.port = parseInt(port, 10);
        if (Array.isArray(out.steps) && out.steps.length) {
            out.steps = [
                '1. Configure AWS CLI with your own Identity Center user session (not admin/shared credentials).',
                '2. Run the Redshift credentials command below. It fetches, exports, and prints temporary DbUser and DbPassword values valid for about 15 minutes.',
                '3. Use the printed values or the exported shell variables in your SQL client.',
                '4. Re-run the command whenever the temporary password expires.'
            ];
        }
        return out;
    }
    if (service === 'postgres') {
        const cliCmd = String(out.cli_command || '');
        const connectCmd = String(out.connect_command || '');
        const hostname = String(
            out.hostname ||
            parseCliFlagValue(cliCmd, 'hostname') ||
            fallback.hostname ||
            ''
        ).trim();
        const username = String(
            out.username ||
            parseCliFlagValue(cliCmd, 'username') ||
            fallback.username ||
            ''
        ).trim();
        const database = String(out.database || fallback.database || 'postgres').trim() || 'postgres';
        const region = String(
            out.region ||
            parseCliFlagValue(cliCmd, 'region') ||
            fallback.region ||
            'ap-south-1'
        ).trim() || 'ap-south-1';
        let port = String(
            out.port ||
            parseCliFlagValue(cliCmd, 'port') ||
            fallback.port ||
            5432
        ).trim();
        if (!port || !/^\d+$/.test(port)) port = '5432';

        if (hostname && username) {
            out.cli_command = [
                'aws rds generate-db-auth-token',
                `--hostname ${hostname}`,
                `--port ${port}`,
                `--username ${username}`,
                `--region ${region}`
            ].join(' ');
            out.token_command = [
                'TOKEN="$(aws rds generate-db-auth-token \\',
                `  --hostname ${hostname} \\`,
                `  --port ${port} \\`,
                `  --username ${username} \\`,
                `  --region ${region})"`,
                "printf 'IAM Token Password: %s\\n' \"$TOKEN\""
            ].join('\n');
            out.connect_command = [
                'PGPASSWORD="$TOKEN" psql \\',
                `  "host=${hostname} port=${port} dbname=${database} user=${username} sslmode=require"`
            ].join('\n');
            out.hostname = hostname;
            out.port = parseInt(port, 10);
            out.username = username;
            out.region = region;
            out.database = database;
        } else if (connectCmd) {
            out.connect_command = connectCmd.trim();
        }
        if (Array.isArray(out.steps) && out.steps.length) {
            out.steps = [
                '1. Configure AWS CLI with your own Identity Center user session (not admin/shared credentials).',
                '2. Generate token using the command below (token is valid ~15 minutes).',
                '3. Copy the printed IAM Token Password.',
                '4. Connect with psql/DBeaver PostgreSQL and regenerate token when it expires.'
            ];
        }
        out.service = 'postgres';
        out.token_command_label = out.token_command_label || 'Save token in shell variable and print password:';
        out.connect_command_label = out.connect_command_label || 'Connect with psql:';
        out.workbench_steps = [];
        return out;
    }

    const cliCmd = String(out.cli_command || '');
    const mysqlCmd = String(out.mysql_connect_command || '');

    const hostname = String(
        out.hostname ||
        parseCliFlagValue(cliCmd, 'hostname') ||
        parseMysqlOptionValue(mysqlCmd, 'host') ||
        fallback.hostname ||
        ''
    ).trim();
    const username = String(
        out.username ||
        parseCliFlagValue(cliCmd, 'username') ||
        parseMysqlOptionValue(mysqlCmd, 'user') ||
        fallback.username ||
        ''
    ).trim();
    const region = String(
        out.region ||
        parseCliFlagValue(cliCmd, 'region') ||
        fallback.region ||
        ''
    ).trim();

    let port = String(
        out.port ||
        parseCliFlagValue(cliCmd, 'port') ||
        parseMysqlOptionValue(mysqlCmd, 'port') ||
        fallback.port ||
        3306
    ).trim();
    if (!port || !/^\d+$/.test(port)) port = '3306';

    if (hostname && username) {
        out.cli_command = [
            'aws rds generate-db-auth-token',
            `--hostname ${hostname}`,
            `--port ${port}`,
            `--username ${username}`,
            `--region ${region || 'ap-south-1'}`
        ].join(' ');

        out.token_command = [
            'export LIBMYSQL_ENABLE_CLEARTEXT_PLUGIN=1',
            'TOKEN="$(aws rds generate-db-auth-token \\',
            `  --hostname ${hostname} \\`,
            `  --port ${port} \\`,
            `  --username ${username} \\`,
            `  --region ${region || 'ap-south-1'})"`,
            "printf 'IAM Token Password: %s\\n' \"$TOKEN\""
        ].join('\n');

        out.mysql_connect_command = [
            'MYSQL_PWD="$TOKEN" mysql \\',
            `  --host ${hostname} \\`,
            `  --port ${port} \\`,
            `  --user ${username} \\`,
            '  --enable-cleartext-plugin \\',
            '  --ssl-mode=REQUIRED \\',
            '  --protocol=TCP'
        ].join('\n');
        out.connect_command = out.mysql_connect_command;
        out.connect_command_label = out.connect_command_label || 'Connect with MySQL CLI:';
        out.hostname = hostname;
        out.port = parseInt(port, 10);
        out.username = username;
        out.region = region || 'ap-south-1';
    } else if (mysqlCmd) {
        // Minimum safety fallback: preserve cleartext plugin for proxy IAM auth and enforce TLS/TCP.
        let sanitized = mysqlCmd
            .trim();
        if (!/LIBMYSQL_ENABLE_CLEARTEXT_PLUGIN=1/.test(sanitized)) {
            sanitized = `LIBMYSQL_ENABLE_CLEARTEXT_PLUGIN=1 ${sanitized}`.trim();
        }
        if (!/\s--enable-cleartext-plugin\b/.test(sanitized)) sanitized += ' --enable-cleartext-plugin';
        if (!/\s--ssl-mode=REQUIRED\b/.test(sanitized)) sanitized += ' --ssl-mode=REQUIRED';
        if (!/\s--protocol=TCP(\s|$)/.test(sanitized)) sanitized += ' --protocol=TCP';
        out.mysql_connect_command = sanitized;
        out.connect_command = sanitized;
        out.connect_command_label = out.connect_command_label || 'Connect with MySQL CLI:';
    }

    if (Array.isArray(out.steps) && out.steps.length) {
        out.steps = [
            '1. Configure AWS CLI with your own Identity Center user session (not admin/shared credentials).',
            '2. Generate token using the command below (token is valid ~15 minutes).',
            '3. Run the MySQL command with MYSQL_PWD="$TOKEN".',
            '4. For DBeaver/Workbench, use the generated token as password and reconnect when token expires.'
        ];
    }

    out.service = service || 'mysql';
    out.token_command_label = out.token_command_label || 'Save token in shell variable:';
    out.connect_command = out.connect_command || out.mysql_connect_command || '';
    out.connect_command_label = out.connect_command_label || 'Connect with MySQL CLI:';

    return out;
}

function renderDbPreparingHtml(secondsElapsed, details) {
    const sec = Math.max(0, parseInt(secondsElapsed || 0, 10) || 0);
    let msg = 'This can take up to 2-3 minutes while access is being prepared.';
    let steps = null;
    if (details && typeof details === 'object') {
        if (details.message) msg = String(details.message);
        if (details.progress && Array.isArray(details.progress.steps)) steps = details.progress.steps;
    } else if (details) {
        msg = String(details);
    }
    const stepsHtml = Array.isArray(steps) && steps.length
        ? `
            <div class="db-step-hint" style="margin-top:8px;">
                ${(steps || []).map((s, idx) => {
                    const status = String(s.status || 'pending').toLowerCase();
                    const icon = status === 'done'
                        ? '<i class="fas fa-check-circle" style="color:#22c55e;"></i>'
                        : status === 'in_progress'
                            ? '<i class="fas fa-spinner fa-spin" style="color:#f59e0b;"></i>'
                            : '<i class="far fa-circle" style="opacity:0.7;"></i>';
                    return `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;">${icon}<span>${idx + 1}. ${escapeHtml(String(s.label || s.key || 'Step'))}</span></div>`;
                }).join('')}
            </div>`
        : '';
    return `
        <div class="db-cred-loading">
            <i class="fas fa-spinner fa-spin"></i>
            Preparing access...
            <div class="db-step-hint" style="margin-top:6px;">${escapeHtml(msg)}</div>
            ${stepsHtml}
            <div class="db-step-hint" style="margin-top:2px; opacity:0.85;">Elapsed: ${sec}s</div>
        </div>
    `;
}

function createDbPreparingTicker(renderFn, initialDetail) {
    const startedAt = Date.now();
    let latestDetail = initialDetail || null;
    let stopped = false;
    let timerId = null;

    const repaint = () => {
        if (stopped) return;
        const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        renderFn(elapsedSec, latestDetail);
    };

    repaint();
    timerId = window.setInterval(repaint, 1000);

    return {
        update(detail) {
            latestDetail = detail || latestDetail;
            repaint();
        },
        stop() {
            stopped = true;
            if (timerId) {
                window.clearInterval(timerId);
                timerId = null;
            }
        }
    };
}

async function fetchDbCredentialsWithPreparation(requestId, opts = {}) {
    const rid = String(requestId || '').trim();
    if (!rid) throw new Error('Missing request id');
    const timeoutMs = Number.isFinite(opts.timeoutMs) ? Number(opts.timeoutMs) : 180000; // 3 minutes
    const intervalMs = Number.isFinite(opts.intervalMs) ? Number(opts.intervalMs) : 4000;
    const onPreparing = typeof opts.onPreparing === 'function' ? opts.onPreparing : null;
    const startedAt = Date.now();
    let attempt = 0;
    let forceRefresh = false;

    while (true) {
        attempt += 1;
        try {
            return await fetchDbCredentials(rid, { forceRefresh });
        } catch (e) {
            const raw = String((e && e.message) || e || '');
            if (!isDbCredentialPreparingMessage(raw)) throw e;
            const elapsedMs = Date.now() - startedAt;
            if (onPreparing) {
                onPreparing({
                    attempt,
                    elapsedMs,
                    elapsedSec: Math.floor(elapsedMs / 1000),
                    message: raw,
                    detail: {
                        message: (e && e.apiMessage) || raw,
                        progress: (e && e.activationProgress) || null
                    }
                });
            }
            if (elapsedMs >= timeoutMs) {
                throw new Error('Access is still being prepared. Please retry in a minute.');
            }
            forceRefresh = true;
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
    }
}

function renderDbCredentialsInline(containerEl, creds) {
    const proxyHost = creds.proxy_host || '—';
    const proxyPort = creds.proxy_port || '—';
    const username = creds.db_username || '—';
    const endpointLabel = getDbEndpointLabel(creds.connect_endpoint_mode);
    const expires = formatDbDateTime(creds.expires_at);
    const password = creds.password || creds.vault_token || '';
    const isIam = String(creds.effective_auth || '').toLowerCase() === 'iam';
    const tokenExpires = formatDbDateTime(creds.iam_token_expires_at) === '—' ? '' : formatDbDateTime(creds.iam_token_expires_at);
    const localInstr = normalizeIamLocalInstructions(creds.local_token_instructions, {
        username,
        region: '',
        service:
            (String(creds.resource_kind || '').toLowerCase() === 'redshift_cluster' || String(creds.engine || '').toLowerCase() === 'redshift')
                ? 'redshift'
                : (String(creds.engine || '').toLowerCase().includes('postgres') ? 'postgres' : 'mysql'),
        database: creds.database || ''
    });
    const inlineId = escapeAttr(containerEl.dataset.reqid || '');
    const tokenCommandId = `dbCredTokenCmd-${inlineId}`;
    const connectCommand = localInstr.connect_command || localInstr.mysql_connect_command || '';
    const localBlock = (localInstr && localInstr.available && Array.isArray(localInstr.steps))
        ? `
        <details class="db-cred-local-instr" style="margin-top:14px;border:1px solid var(--border-color);border-radius:10px;overflow:hidden;">
            <summary style="padding:10px 14px;cursor:pointer;font-weight:600;background:var(--bg-secondary);">
                <i class="fas fa-laptop-code"></i> ${escapeHtml(localInstr.heading || 'Generate IAM token on your machine')}
            </summary>
            <div style="padding:12px 14px;font-size:13px;">
                ${localInstr.cli_command ? `<p class="db-step-hint" style="margin-bottom:10px;">Configure AWS credentials (SSO or access key), then run:</p><pre style="margin:8px 0;padding:12px;background:var(--bg-primary);border-radius:8px;overflow-x:auto;font-size:12px;">${escapeHtml(localInstr.cli_command || '')}</pre>` : ''}
                ${localInstr.service !== 'redshift' && localInstr.token_command ? `<div class="db-step-hint" style="margin:8px 0 6px 0;">${escapeHtml(localInstr.token_command_label || 'Save token in shell variable:')}</div><pre style="margin:0 0 8px 0;padding:12px;background:var(--bg-primary);border-radius:8px;overflow-x:auto;font-size:12px;">${escapeHtml(localInstr.token_command)}</pre>` : ''}
                ${connectCommand ? `<div class="db-step-hint" style="margin:8px 0 6px 0;">${escapeHtml(localInstr.connect_command_label || 'Connect with CLI:')}</div><pre style="margin:0 0 8px 0;padding:12px;background:var(--bg-primary);border-radius:8px;overflow-x:auto;font-size:12px;">${escapeHtml(connectCommand)}</pre>` : ''}
                <ol style="margin:8px 0 0 0;padding-left:18px;">
                    ${(localInstr.steps || []).map(s => `<li style="margin:4px 0;">${escapeHtml(s)}</li>`).join('')}
                </ol>
                ${Array.isArray(localInstr.dbeaver_steps) && localInstr.dbeaver_steps.length ? `<div style="margin-top:10px;"><strong>DBeaver</strong><ol style="margin:6px 0 0 0;padding-left:18px;">${localInstr.dbeaver_steps.map(s => `<li style="margin:4px 0;">${escapeHtml(s)}</li>`).join('')}</ol></div>` : ''}
                ${Array.isArray(localInstr.workbench_steps) && localInstr.workbench_steps.length ? `<div style="margin-top:10px;"><strong>MySQL Workbench</strong><ol style="margin:6px 0 0 0;padding-left:18px;">${localInstr.workbench_steps.map(s => `<li style="margin:4px 0;">${escapeHtml(s)}</li>`).join('')}</ol></div>` : ''}
            </div>
        </details>`
        : '';

    const iamPasswordInfo = isIam
        ? `
            <div class="db-cred-password">
            <div class="db-cred-k">${escapeHtml(localInstr.service === 'redshift' ? 'Temporary DB Password' : 'IAM Token Password')}</div>
            <div class="db-cred-note">
                ${escapeHtml(localInstr.service === 'redshift'
                    ? 'Run the command below to fetch, export, and print temporary Redshift credentials, then use REDSHIFT_DB_PASSWORD as the password.'
                    : 'Generate token locally with your own AWS Identity Center credentials, then use that token as password.')}
                ${tokenExpires ? `Token valid until ${escapeHtml(tokenExpires)}.` : ''}
            </div>
            ${localInstr && localInstr.token_command ? `
            <div class="db-cred-password-row" style="margin-top:8px;">
                <textarea id="${escapeAttr(tokenCommandId)}" readonly style="flex:1;min-width:240px;min-height:92px;padding:10px 12px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-secondary);color:var(--text-primary);font-family:var(--font-mono, monospace);font-size:12px;resize:vertical;">${escapeHtml(localInstr.token_command)}</textarea>
                <button class="btn-primary btn-sm" onclick="(async function(){const el=document.getElementById('${escapeAttr(tokenCommandId)}'); if(!el) return; const ok=await copyToClipboard(el.value); alert(ok?'Copied':'Copy failed');})()">
                    <i class="fas fa-copy"></i> ${escapeHtml(localInstr.service === 'redshift' ? 'Copy credentials command' : 'Copy token command')}
                </button>
            </div>` : ''}
        </div>`
        : `
        <div class="db-cred-password">
            <div class="db-cred-k">Password</div>
            <div class="db-cred-password-row">
                <input id="dbCredPwd-${inlineId}" type="password" value="${escapeAttr(password)}" readonly>
                <button class="btn-secondary btn-sm" onclick="(function(){const el=document.getElementById('dbCredPwd-${inlineId}'); if(!el) return; el.type = (el.type==='password')?'text':'password';})()">
                    <i class="fas fa-eye"></i> Show
                </button>
                <button class="btn-primary btn-sm" onclick="(async function(){const el=document.getElementById('dbCredPwd-${inlineId}'); if(!el) return; const ok=await copyToClipboard(el.value); alert(ok?'Copied':'Copy failed');})()">
                    <i class="fas fa-copy"></i> Copy
                </button>
            </div>
        </div>`;

    containerEl.innerHTML = `
        <div class="db-cred-inline-grid">
            <div><div class="db-cred-k">${escapeHtml(endpointLabel)} Host</div><div class="db-cred-v"><code>${escapeHtml(proxyHost)}</code></div></div>
            <div><div class="db-cred-k">${escapeHtml(endpointLabel)} Port</div><div class="db-cred-v"><code>${escapeHtml(String(proxyPort))}</code></div></div>
            <div>
                <div class="db-cred-k">DB Username</div>
                <div class="db-cred-v">
                    <div class="db-cred-password-row">
                        <input id="dbCredUser-${inlineId}" type="text" value="${escapeAttr(username)}" readonly>
                        <button class="btn-primary btn-sm" onclick="(async function(){const el=document.getElementById('dbCredUser-${inlineId}'); if(!el) return; const ok=await copyToClipboard(el.value); alert(ok?'Copied':'Copy failed');})()">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                </div>
            </div>
            <div><div class="db-cred-k">Expiry</div><div class="db-cred-v">${escapeHtml(expires)}</div></div>
        </div>
        ${iamPasswordInfo}
        ${localBlock}
    `;
}

async function toggleDbCredInline(requestId) {
    const rid = String(requestId || '').trim();
    if (!rid) return;
    const domId = domIdFromRequestId(rid);
    const el = document.getElementById(`dbCredInline-${domId}`);
    if (!el) return;

    if (el.style.display === 'block') {
        closeDbCredInline(rid);
        return;
    }

    el.style.display = 'block';
    el.dataset.reqid = domId;
    const ticker = createDbPreparingTicker((elapsedSec, detail) => {
        if (el.style.display === 'block') {
            el.innerHTML = renderDbPreparingHtml(
                elapsedSec,
                detail || { message: 'Waiting for DB user and permissions to finish provisioning.' }
            );
        }
    }, { message: 'Waiting for DB user and permissions to finish provisioning.' });

    try {
        const creds = await fetchDbCredentialsWithPreparation(rid, {
            onPreparing: (info) => {
                ticker.update(info.detail || { message: 'Waiting for DB user and permissions to finish provisioning.' });
            }
        });
        ticker.stop();
        renderDbCredentialsInline(el, creds);
    } catch (e) {
        ticker.stop();
        el.innerHTML = `<div class="db-cred-error">Failed to load credentials: ${escapeHtml(safeUserFacingErrorMessage(e))}</div>`;
    }
}

async function openDbExternalToolModal(requestId) {
    if (!requestId) return;
    closeDbExternalToolModal();
    const modal = document.createElement('div');
    modal.id = 'dbExternalToolModal';
    modal.className = 'db-modal-wrap';
    const requestIdEsc = String(requestId).replace(/'/g, "\\'");
    modal.innerHTML = `
      <div class="db-modal-backdrop" onclick="closeDbExternalToolModal()"></div>
      <div class="db-modal">
        <div class="db-modal-header">
          <div class="db-modal-title">
            <span class="db-modal-title-main">Get login details</span>
            <span class="db-modal-sub">Request: <code>${escapeHtml(String(requestId))}</code></span>
          </div>
          <button class="btn-icon" onclick="closeDbExternalToolModal()" title="Close"><i class="fas fa-times"></i></button>
        </div>
        <div class="db-modal-body" id="dbExternalToolModalBody">
          ${renderDbPreparingHtml(0, 'Preparing DB access and credentials. This may take a few minutes.')}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const ticker = createDbPreparingTicker((elapsedSec, detail) => {
        const body = document.getElementById('dbExternalToolModalBody');
        if (!body) return;
        body.innerHTML = renderDbPreparingHtml(
            elapsedSec,
            detail || { message: 'Preparing DB access and credentials. This may take a few minutes.' }
        );
    }, 'Preparing DB access and credentials. This may take a few minutes.');

    try {
        const data = await fetchDbCredentialsWithPreparation(requestId, {
            onPreparing: (info) => {
                ticker.update(info.detail || { message: 'Waiting for DB user, policy assignment, and credential activation.' });
            }
        });
        ticker.stop();

        const expires = formatDbDateTime(data.expires_at);
        const proxyHost = data.proxy_host || '—';
        const proxyPort = data.proxy_port || '—';
        const endpointLabel = getDbEndpointLabel(data.connect_endpoint_mode);
        const username = data.db_username || '—';
        const dbName = data.database || 'default';
        const isIam = String(data.effective_auth || '').toLowerCase() === 'iam';
        const usernameFieldId = `dbModalUsername-${domIdFromRequestId(String(requestId))}`;

        const tokenExpires = formatDbDateTime(data.iam_token_expires_at) === '—' ? '' : formatDbDateTime(data.iam_token_expires_at);
        const localInstr = normalizeIamLocalInstructions(data.local_token_instructions, {
            hostname: proxyHost,
            port: proxyPort,
            username,
            region: data.region || '',
            service:
                (String(data.resource_kind || '').toLowerCase() === 'redshift_cluster' || String(data.engine || '').toLowerCase() === 'redshift')
                    ? 'redshift'
                    : (String(data.engine || '').toLowerCase().includes('postgres') ? 'postgres' : 'mysql'),
            database: dbName || ''
        });
        const modalTokenCommandId = `dbModalTokenCommand-${domIdFromRequestId(String(requestId))}`;
        const connectCommand = localInstr.connect_command || localInstr.mysql_connect_command || '';
        const tokenField = isIam ? `
            <div class="db-modal-grid" style="margin-top:14px;">
                <div style="grid-column: 1 / -1;">
                    <strong>${escapeHtml(localInstr.service === 'redshift' ? 'Temporary DB Password' : 'IAM Token Password')}</strong>
                    <div class="db-step-hint" style="margin-top:6px;">
                        ${escapeHtml(localInstr.service === 'redshift'
                            ? 'Run the command below to fetch, export, and print temporary Redshift credentials, then use REDSHIFT_DB_PASSWORD as the password in your SQL client.'
                            : 'Generate token locally with your own AWS Identity Center session and paste it as password in your DB client.')}
                        ${tokenExpires ? `Token valid until <strong>${escapeHtml(tokenExpires)}</strong>.` : ''}
                    </div>
                    ${localInstr.token_command ? `
                    <div class="db-step-hint" style="margin-top:8px;">${escapeHtml(localInstr.token_command_label || 'Token command:')}</div>
                    <pre style="margin:6px 0;padding:12px;background:var(--bg-primary);border-radius:8px;overflow-x:auto;font-size:12px;">${escapeHtml(localInstr.token_command)}</pre>
                    <textarea id="${escapeAttr(modalTokenCommandId)}" readonly style="position:fixed;left:-9999px;top:-9999px;opacity:0;">${escapeHtml(localInstr.token_command)}</textarea>
                    <button class="btn-primary btn-sm" onclick="(async function(){const el=document.getElementById('${escapeAttr(modalTokenCommandId)}'); if(!el) return; const ok=await copyToClipboard(el.value); alert(ok?'Copied':'Copy failed');})()">
                        <i class="fas fa-copy"></i> ${escapeHtml(localInstr.service === 'redshift' ? 'Copy credentials command' : 'Copy token command')}
                    </button>` : ''}
                    <small class="db-step-hint" style="display:block;margin-top:8px;">
                        Use <strong>${escapeHtml(proxyHost)}:${escapeHtml(String(proxyPort))}</strong> (${escapeHtml(endpointLabel.toLowerCase())}). Access expires automatically.
                    </small>
                </div>
            </div>
        ` : `
            <div class="db-modal-grid" style="margin-top:14px;">
                <div style="grid-column: 1 / -1;">
                    <strong>Password (Vault Token)</strong>
                    <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;">
                        <input id="dbVaultTokenInput" type="password" value="${escapeAttr(data.password || data.vault_token || '')}" readonly
                               style="flex:1;min-width:240px;padding:10px 12px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-secondary);color:var(--text-primary);">
                        <button class="btn-secondary btn-sm" onclick="(function(){const el=document.getElementById('dbVaultTokenInput'); if(!el) return; el.type = (el.type==='password') ? 'text' : 'password';})()">
                            <i class="fas fa-eye"></i> Show
                        </button>
                        <button class="btn-primary btn-sm" onclick="(async function(){const el=document.getElementById('dbVaultTokenInput'); if(!el) return; const ok=await copyToClipboard(el.value); alert(ok?'Copied':'Copy failed');})()">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                    <small class="db-step-hint" style="display:block;margin-top:8px;">
                        Use <strong>${escapeHtml(proxyHost)}:${escapeHtml(String(proxyPort))}</strong> (proxy only). Access expires automatically.
                    </small>
                </div>
            </div>
        `;
        const localBlock = (localInstr && localInstr.available && localInstr.cli_command)
            ? `
            <details class="db-cred-local-instr" style="margin-top:14px;border:1px solid var(--border-color);border-radius:10px;overflow:hidden;">
                <summary style="padding:10px 14px;cursor:pointer;font-weight:600;background:var(--bg-secondary);">
                    <i class="fas fa-laptop-code"></i> ${escapeHtml(localInstr.heading || 'Generate IAM token on your machine')}
                </summary>
                <div style="padding:12px 14px;font-size:13px;">
                    <p class="db-step-hint" style="margin-bottom:10px;">Configure AWS credentials (e.g. <code>aws sso login</code> or access key), then run:</p>
                    <pre style="margin:8px 0;padding:12px;background:var(--bg-primary);border-radius:8px;overflow-x:auto;font-size:12px;">${escapeHtml(localInstr.cli_command)}</pre>
                    ${localInstr.token_command ? `<div class="db-step-hint" style="margin:8px 0 6px 0;">${escapeHtml(localInstr.token_command_label || 'Save token in shell variable:')}</div><pre style="margin:0 0 8px 0;padding:12px;background:var(--bg-primary);border-radius:8px;overflow-x:auto;font-size:12px;">${escapeHtml(localInstr.token_command)}</pre>` : ''}
                    ${connectCommand ? `<div class="db-step-hint" style="margin:8px 0 6px 0;">${escapeHtml(localInstr.connect_command_label || 'Connect with CLI:')}</div><pre style="margin:0 0 8px 0;padding:12px;background:var(--bg-primary);border-radius:8px;overflow-x:auto;font-size:12px;">${escapeHtml(connectCommand)}</pre>` : ''}
                    ${Array.isArray(localInstr.steps) && localInstr.steps.length ? `<ol style="margin:8px 0 0 0;padding-left:18px;">${localInstr.steps.map(s => `<li style="margin:4px 0;">${escapeHtml(s)}</li>`).join('')}</ol>` : ''}
                    ${Array.isArray(localInstr.dbeaver_steps) && localInstr.dbeaver_steps.length ? `<div style="margin-top:10px;"><strong>DBeaver</strong><ol style="margin:6px 0 0 0;padding-left:18px;">${localInstr.dbeaver_steps.map(s => `<li style="margin:4px 0;">${escapeHtml(s)}</li>`).join('')}</ol></div>` : ''}
                    ${Array.isArray(localInstr.workbench_steps) && localInstr.workbench_steps.length ? `<div style="margin-top:10px;"><strong>MySQL Workbench</strong><ol style="margin:6px 0 0 0;padding-left:18px;">${localInstr.workbench_steps.map(s => `<li style="margin:4px 0;">${escapeHtml(s)}</li>`).join('')}</ol></div>` : ''}
                </div>
            </details>`
            : '';

        modal.innerHTML = `
          <div class="db-modal-backdrop" onclick="closeDbExternalToolModal()"></div>
          <div class="db-modal">
            <div class="db-modal-header">
              <div class="db-modal-title">
                <span class="db-modal-title-main">Get login details</span>
                <span class="db-modal-sub">Request: <code>${escapeHtml(requestId)}</code></span>
              </div>
              <button class="btn-icon" onclick="closeDbExternalToolModal()" title="Close"><i class="fas fa-times"></i></button>
            </div>
            <div class="db-modal-body">
              <div class="db-modal-grid">
                <div><strong>Proxy Host:</strong> <code>${escapeHtml(proxyHost)}</code></div>
                <div><strong>Proxy Port:</strong> <code>${escapeHtml(String(proxyPort))}</code></div>
                <div><strong>Database:</strong> <code>${escapeHtml(dbName)}</code></div>
                <div><strong>Expires:</strong> ${escapeHtml(expires)}</div>
              </div>
              <div style="margin-top:10px;">
                <strong>Username</strong>
                <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;">
                  <input id="${escapeAttr(usernameFieldId)}" type="text" value="${escapeAttr(username)}" readonly
                         style="flex:1;min-width:240px;padding:10px 12px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-secondary);color:var(--text-primary);">
                  <button class="btn-primary btn-sm" onclick="(async function(){const el=document.getElementById('${escapeAttr(usernameFieldId)}'); if(!el) return; const ok=await copyToClipboard(el.value); alert(ok?'Copied':'Copy failed');})()">
                    <i class="fas fa-copy"></i> Copy username
                  </button>
                </div>
              </div>
              ${tokenField}
              ${localBlock}
            </div>
          </div>
        `;
    } catch (e) {
        ticker.stop();
        const body = document.getElementById('dbExternalToolModalBody');
        const msg = safeUserFacingErrorMessage(e);
        if (body) {
            body.innerHTML = `
                <div class="db-cred-error">Failed to load credentials: ${escapeHtml(msg)}</div>
                <div style="margin-top:10px;">
                    <button class="btn-secondary btn-sm" onclick="openDbExternalToolModal('${requestIdEsc}')">
                        <i class="fas fa-rotate-right"></i> Retry
                    </button>
                </div>
            `;
        } else {
            alert('Failed to load credentials: ' + msg);
        }
    }
}

async function viewDbRequestDetails(requestId) {
    if (!requestId) return;
    try {
        const res = await fetch(`${DB_API_BASE}/api/request/${encodeURIComponent(requestId)}`, {
            credentials: 'include'
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const dbs = Array.isArray(data.databases) ? data.databases : [];
        const db = dbs[0] || {};
        const perms = Array.isArray(data.permissions)
            ? data.permissions
            : (typeof data.permissions === 'string' ? data.permissions.split(',').map(s => s.trim()).filter(Boolean) : []);
        const permsText = perms.length ? perms.join(', ') : '—';
        const queryTypes = Array.isArray(data.query_types)
            ? data.query_types.map(s => String(s || '').trim()).filter(Boolean)
            : [];
        const actionsText = queryTypes.length ? queryTypes.join(', ') : permsText;
        const created = formatDbDateTime(data.created_at);
        const expires = formatDbDateTime(data.expires_at);
        const status = String(data.status || 'pending');
        const role = getDbRoleLabel(String(data.role || 'custom'));
        const justification = String(data.justification || '').trim() || '—';
        const workflowName = String(data.approval_workflow_name || '').trim() || '—';
        const approvalNote = String(data.approval_note || '').trim() || '—';
        const requestApproverEmail = String(data.request_approver_email || '').trim() || '—';
        const dbOwnerEmail = String(data.db_owner_email || '').trim() || '—';
        const securityLeadEmail = String(data.security_lead_email || '').trim() || '—';
        const pendingExpiryText = formatDbDateTime(data.pending_expires_at);
        const pendingStage = String(data.pending_stage || '').trim() || '—';
        const pendingApprovers = Array.isArray(data.pending_approvers)
            ? data.pending_approvers.map(item => String(item || '').trim()).filter(Boolean).join(', ')
            : '';
        const approvalHistory = Array.isArray(data.approval_history) ? data.approval_history : [];
        const dbNames = dbs.map(d => d?.name).filter(Boolean).join(', ') || '—';
        const accountId = String(data.account_id || '').trim();
        const accountName = String(data.account_name || '').trim();
        const accountText = accountName
            ? (accountId ? `${accountName} (${accountId})` : accountName)
            : (accountId || '—');
        const instanceText = String(data.requested_instance_input || data.db_instance_id || db.id || '—').trim() || '—';
        const scopeMeta = getDbRequestScopeMeta(data.engine || db.engine || '');
        const schemaText = String(data.requested_schema_name || '').trim() || '—';
        const tableText = String(data.requested_table_name || '').trim()
            || (Array.isArray(data.requested_tables) && data.requested_tables.length ? data.requested_tables.join(', ') : '—');
        const detailText = String(data.requested_column_name || '').trim() || '—';
        const accessTypeText = String(data.requested_access_type || '').trim() || actionsText;
        const endpointLabel = getDbEndpointLabel(data.connect_endpoint_mode);
        const proxyEndpoint = (data.proxy_host && data.proxy_port)
            ? `${data.proxy_host}:${data.proxy_port}`
            : ((db.host && db.port) ? `${db.host}:${db.port}` : (db.host || '—'));

        closeDbRequestDetailsModal();
        const modal = document.createElement('div');
        modal.id = 'dbRequestDetailsModal';
        modal.className = 'db-modal-wrap';
        modal.innerHTML = `
          <div class="db-modal-backdrop" onclick="closeDbRequestDetailsModal()"></div>
          <div class="db-modal">
            <div class="db-modal-header">
              <div class="db-modal-title">
                <span class="db-modal-title-main">Database Request Details</span>
                <span class="db-modal-sub">ID: <code>${escapeHtml(requestId)}</code></span>
              </div>
              <button class="btn-icon" onclick="closeDbRequestDetailsModal()" title="Close"><i class="fas fa-times"></i></button>
            </div>
            <div class="db-modal-body">
              <div class="db-modal-grid">
                <div><strong>Status:</strong> <span class="badge">${escapeHtml(status)}</span></div>
                <div><strong>Engine:</strong> ${escapeHtml(String(db.engine || data.engine || '—'))}</div>
                <div><strong>Workflow:</strong> ${escapeHtml(workflowName)}</div>
                <div><strong>Approver Email:</strong> ${escapeHtml(requestApproverEmail)}</div>
                <div><strong>DB Owner Email:</strong> ${escapeHtml(dbOwnerEmail)}</div>
                <div><strong>SecOps Lead:</strong> ${escapeHtml(securityLeadEmail)}</div>
                <div><strong>Pending Stage:</strong> ${escapeHtml(pendingStage)}</div>
                <div><strong>Pending Expires:</strong> ${escapeHtml(pendingExpiryText)}</div>
                <div><strong>${escapeHtml(endpointLabel)}:</strong> <code>${escapeHtml(proxyEndpoint)}</code></div>
                <div><strong>AWS Account:</strong> ${escapeHtml(accountText)}</div>
                <div><strong>${escapeHtml(getDbTargetLabel(data.engine || db.engine || '', data.resource_kind || ''))}:</strong> <code>${escapeHtml(instanceText)}</code></div>
                <div><strong>Database(s):</strong> ${escapeHtml(dbNames)}</div>
                ${scopeMeta.schemaVisible ? `<div><strong>${escapeHtml(scopeMeta.schemaLabel)}:</strong> ${escapeHtml(schemaText)}</div>` : ''}
                <div><strong>${escapeHtml(scopeMeta.objectPluralLabel)}:</strong> ${escapeHtml(tableText)}</div>
                <div><strong>${escapeHtml(scopeMeta.detailLabel)}:</strong> ${escapeHtml(detailText)}</div>
                <div><strong>Actions:</strong> ${escapeHtml(actionsText)}</div>
                <div><strong>Access Type:</strong> ${escapeHtml(accessTypeText)}</div>
                <div><strong>Role:</strong> ${escapeHtml(role)}</div>
                <div><strong>Duration:</strong> ${escapeHtml(String(data.duration_hours || 2))}h</div>
                <div><strong>Created:</strong> ${escapeHtml(created)}</div>
                <div><strong>Expires:</strong> ${escapeHtml(expires)}</div>
              </div>
              <div class="db-modal-justification">
                <div class="db-modal-justification-label"><strong>Justification</strong></div>
                <div class="db-modal-justification-text">${escapeHtml(justification)}</div>
              </div>
              <div class="db-modal-justification">
                <div class="db-modal-justification-label"><strong>Approval Summary</strong></div>
                <div class="db-modal-justification-text">${escapeHtml(approvalNote)}</div>
                ${pendingApprovers ? `<div class="db-modal-justification-text" style="margin-top:8px;"><strong>Current Approvers:</strong> ${escapeHtml(pendingApprovers)}</div>` : ''}
              </div>
              ${approvalHistory.length ? `
              <div class="db-modal-justification">
                <div class="db-modal-justification-label"><strong>Approval History</strong></div>
                <div class="db-modal-justification-text">${approvalHistory.map(function(item) {
                    const stage = String(item.stage_name || 'Approval').trim();
                    const decision = String(item.decision || '').trim() || 'pending';
                    const actor = String(item.actor_email || '').trim() || 'system';
                    const reason = String(item.reason || '').trim();
                    const actedAt = formatDbDateTime(item.acted_at);
                    const actedAtText = actedAt === '—' ? '' : actedAt;
                    return escapeHtml(`${stage}: ${decision} by ${actor}${actedAtText ? ' on ' + actedAtText : ''}${reason ? ' - ' + reason : ''}`);
                }).join('<br>')}</div>
              </div>` : ''}
            </div>
          </div>
        `;
        document.body.appendChild(modal);
    } catch (e) {
        alert('Failed to load request details: ' + safeUserFacingErrorMessage(e));
    }
}

async function cloneDbRequest(requestId) {
    if (!requestId) return;
    try {
        const res = await fetch(`${DB_API_BASE}/api/request/${encodeURIComponent(requestId)}`, {
            credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Failed to load request.');
        const status = String(data.status || '').toLowerCase();
        if (!['completed', 'expired', 'revoked'].includes(status)) {
            alert('Only completed requests can be cloned.');
            return;
        }
        const dbs = Array.isArray(data.databases) ? data.databases : [];
        const firstDb = dbs[0] || {};
        const engineLabel = String(data.engine || firstDb.engine || selectedEngine?.label || 'Database');
        const engineKey = String(firstDb.engine || selectedEngine?.engine || 'mysql').toLowerCase();
        selectedEngine = { id: `clone-${engineKey}`, label: engineLabel, engine: engineKey };
        selectedDatabases = dbs.length ? dbs.map(function(db) {
            return {
                id: String(data.db_instance_id || data.requested_instance_input || db.id || '').trim(),
                name: String(db.name || data.requested_database_name || '').trim(),
                engine: String(db.engine || engineKey).trim()
            };
        }) : [{
            id: String(data.db_instance_id || data.requested_instance_input || '').trim(),
            name: String(data.requested_database_name || '').trim(),
            engine: engineKey
        }];
        dbRequestDraft = {
            account_id: String(data.account_id || '').trim(),
            _selectedInstance: {
                id: String(data.db_instance_id || data.requested_instance_input || '').trim(),
                name: String(data.requested_database_name || '').trim(),
                engine: engineKey,
                region: String(data.db_region || '').trim()
            },
            requested_instance_input: String(data.requested_instance_input || data.db_instance_id || '').trim(),
            requested_database_name: String(data.requested_database_name || '').trim(),
            requested_schema_name: String(data.requested_schema_name || '').trim(),
            requested_table_name: String(data.requested_table_name || '').trim(),
            requested_column_name: String(data.requested_column_name || '').trim(),
            requested_tables: Array.isArray(data.requested_tables) ? data.requested_tables.slice() : [],
            requested_access_type: String(data.requested_access_type || '').trim(),
            permissions: Array.isArray(data.permissions) ? data.permissions.slice() : [],
            query_types: Array.isArray(data.query_types) ? data.query_types.slice() : [],
            role: String(data.role || 'custom').trim(),
            duration_hours: parseInt(data.duration_hours || 2, 10) || 2,
            justification: String(data.justification || '').trim(),
            request_approver_email: String(data.request_approver_email || '').trim().toLowerCase(),
            db_owner_email: String(data.db_owner_email || '').trim().toLowerCase()
        };
        dbApproverEmailManuallyEdited = !!dbRequestDraft.request_approver_email;
        dbOwnerEmailManuallyEdited = !!dbRequestDraft.db_owner_email;
        dbStructuredPermissions = Array.isArray(data.permissions) ? data.permissions.map(function(item) { return String(item || '').trim().toUpperCase(); }).filter(Boolean) : [];
        syncDbApproverEmail(dbRequestDraft.request_approver_email || '');
        syncDbOwnerEmail(dbRequestDraft.db_owner_email || '');
        if (typeof showPage === 'function') showPage('databases');
        transitionToDbStructuredUI();
        hydrateStructuredSummary();
        setDbSubmitStatus('dbStructuredSubmitStatus', 'Previous request cloned. Review and edit the fields before submitting.', 'info');
    } catch (error) {
        alert('Failed to clone request: ' + safeUserFacingErrorMessage(error));
    }
}

async function editDbRequestDurationModal(requestId) {
    const current = Array.isArray(databaseRequestsCache)
        ? databaseRequestsCache.find(item => String(item?.request_id || '').trim() === String(requestId || '').trim())
        : null;
    const maxDurationHours = String(current?.account_env || '').trim().toLowerCase() === 'prod' ? 72 : 120;
    const hrs = prompt(`New duration (1-${maxDurationHours} hours):`, String(current?.duration_hours || 2));
    if (!hrs) return;
    const h = parseInt(hrs, 10);
    if (h < 1 || h > maxDurationHours) {
        alert(`Duration must be 1-${maxDurationHours} hours`);
        return;
    }
    try {
        const res = await fetch(`${DB_API_BASE}/api/databases/request/${requestId}/update-duration`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ duration_hours: h })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        loadDbRequests();
        alert('Duration updated');
    } catch (e) {
        alert('Failed: ' + safeUserFacingErrorMessage(e));
    }
}

async function loadDatabases() {
    try {
        applyDatabaseFeatureFlags();
        renderDbTree();
        loadDbRequests();
        refreshApprovedDatabases();
    } catch (e) {
        console.error('Error loading databases:', e);
        applyDatabaseFeatureFlags();
        renderDbTree();
    }
}

document.addEventListener('npam-features-updated', function (evt) {
    const flags = evt && evt.detail ? evt.detail.features : null;
    applyDatabaseFeatureFlags(flags);
});

async function refreshApprovedDatabases() {
    const tbody = document.getElementById('approvedDatabasesTableBody');
    if (!tbody) return;
    try {
        const res = await fetch(`${DB_API_BASE}/api/databases/approved`, {
            credentials: 'include'
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Error loading approved databases');
        }
        const data = await res.json();
        if (!data.databases?.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">No approved databases found</td></tr>';
            return;
        }
        const roleLabel = r => ({ read_only: 'Read-only', read_limited_write: 'Limited Write', read_full_write: 'Full Write', admin: 'Admin', custom: 'Custom (NPAMx)' })[r || 'custom'] || (r || 'Custom (NPAMx)');
        tbody.innerHTML = data.databases.map(db => {
            const requestId = (db.request_id || '').replace(/'/g, "\\'");
            const dbName = (db.db_name || db.engine || '').replace(/'/g, "\\'");
            const effectiveAuth = String(db.effective_auth || 'password').toLowerCase();
            const lifecycle = String(db.status || '').toLowerCase();
            const isExpired = lifecycle === 'expired' || Boolean(db.is_expired);
            const activationError = String(db.activation_error || '').trim();
            const isReady = lifecycle === 'active' && !activationError && !isExpired;
            const endpointLabel = getDbEndpointLabel(db.connect_endpoint_mode);
            const expires = formatDbDateTime(db.expires_at);
            const lifecycleBadge = isReady
                ? '<span class="badge">Active</span>'
                : (isExpired
                    ? '<span class="badge badge-secondary">Expired</span>'
                    : (activationError
                        ? '<span class="badge badge-danger">Activation failed</span>'
                        : '<span class="badge">Approved</span>'));
            const userDisplay = effectiveAuth === 'iam'
                ? `<span class="badge">IAM</span> <code title="Username is masked for safety">${escapeHtml(db.masked_username || '')}</code>`
                : `<code title="Username is masked for safety">${escapeHtml(db.masked_username || '')}</code>`;
            const actionBtn = isReady
                ? `
                    <button class="btn-primary btn-sm" onclick="openDbExternalToolModal('${requestId}')"><i class="fas fa-key"></i> Get login details</button>
                    <button class="btn-secondary btn-sm" onclick="connectToDatabase('${db.host}', '${db.port}', '${db.engine}', '${requestId}', '${dbName}')"><i class="fas fa-terminal"></i> PAM Terminal</button>
                `
                : `
                    <button class="btn-primary btn-sm" onclick="openDbExternalToolModal('${requestId}')"><i class="fas fa-key"></i> View request</button>
                    <span style="display:block;margin-top:6px;font-size:12px;color:${isExpired ? '#b42318' : '#8a5a00'};">${isExpired ? 'Access expired. Raise a new request or renew from My Requests.' : 'Access not active yet. Retry activation from My Requests.'}</span>
                `;
            return `<tr>
                <td>${db.engine}</td>
                <td>
                    <strong>${escapeHtml(endpointLabel)}:</strong> ${escapeHtml(db.host)}:${escapeHtml(String(db.port))}
                    ${activationError ? `<div style="margin-top:6px;color:#b42318;font-size:12px;">${escapeHtml(activationError)}</div>` : ''}
                </td>
                <td>${userDisplay}</td>
                <td>${lifecycleBadge} <span class="badge">${roleLabel(db.role)}</span></td>
                <td>${escapeHtml(expires)}</td>
                <td>
                    ${actionBtn}
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">${escapeHtml(safeUserFacingErrorMessage(e) || 'Error loading approved databases')}</td></tr>`;
    }
}

function connectToDatabase(host, port, engine, requestId, dbName) {
    // Always navigate to Database Terminal page - initDatabaseTerminalPage will open the connection
    window.pendingTerminalConnection = { host, port, engine, requestId: requestId || '', dbName: dbName || 'default' };
    if (typeof showPage === 'function') {
        showPage('databaseTerminal');
    } else {
        alert('Go to Database Terminal page from the sidebar to connect.');
    }
}

function showDatabaseTerminal(dbName, host, port, engine, requestId) {
    const container = document.getElementById('databaseTerminalContainer');
    if (!container) return;
    container.innerHTML = `
        <div class="db-query-terminal" id="dbQueryTerminal">
            <div class="db-terminal-header">
                <div class="db-terminal-info">
                    <div class="db-terminal-title"><i class="fas fa-database"></i> ${engine} Query Terminal</div>
                    <div class="db-terminal-connection"><code>${host}:${port}/${dbName}</code></div>
                </div>
                <div class="db-terminal-actions">
                    <button class="btn-secondary btn-sm" onclick="toggleDbTerminalExpand()" title="Expand terminal">
                        <i class="fas fa-expand-alt" id="dbTerminalExpandIcon"></i>
                    </button>
                    <button class="btn-danger btn-sm" onclick="disconnectDatabase()"><i class="fas fa-times"></i> Disconnect</button>
                </div>
            </div>
            <div id="dbOutput" class="db-terminal-output"></div>
            <div class="db-terminal-input-row">
                <input type="text" id="dbQuery" class="db-query-input" placeholder="Enter SQL..." onkeypress="if(event.key==='Enter') executeQuery()">
                <button class="btn-primary" onclick="executeQuery()"><i class="fas fa-play"></i> Execute</button>
            </div>
        </div>
    `;
    window.dbConn = { dbName, host, port, engine, requestId: requestId || '' };
    appendOutput(`[OK] Connected to ${engine}\nHost: ${host}:${port}\nDatabase: ${dbName}\n\n`);
}

function toggleDbTerminalExpand() {
    const terminal = document.getElementById('dbQueryTerminal');
    const icon = document.getElementById('dbTerminalExpandIcon');
    if (!terminal || !icon) return;
    const expanded = terminal.classList.toggle('db-terminal-expanded');
    icon.className = expanded ? 'fas fa-compress-alt' : 'fas fa-expand-alt';
    icon.parentElement.title = expanded ? 'Collapse terminal' : 'Expand terminal';
}

function appendOutput(text) {
    const el = document.getElementById('dbOutput');
    if (el) {
        let html = escapeHtml(text).replace(/\n/g, '<br>');
        html = html.replace(/\[OK\]/g, '<i class="fas fa-check-circle" style="color:#22c55e;margin-right:4px"></i>');
        html = html.replace(/\[ERROR\]/g, '<i class="fas fa-times-circle" style="color:#ef4444;margin-right:4px"></i>');
        el.innerHTML += html;
        el.scrollTop = el.scrollHeight;
    }
}

async function executeQuery() {
    const query = document.getElementById('dbQuery')?.value?.trim();
    if (!query || !window.dbConn) return;
    appendOutput(`\n> ${query}\n`);
    document.getElementById('dbQuery').value = '';
    try {
        const res = await fetch(`${DB_API_BASE}/api/databases/execute-query`, {
            method: 'POST',
            headers: getDbRequestHeaders(),
            credentials: 'include',
            body: JSON.stringify({
                request_id: window.dbConn.requestId,
                query,
                dbName: window.dbConn.dbName
            })
        });
        const data = await res.json();
        if (data.error) {
            const errMsg = data.error.startsWith('❌') ? data.error.replace(/^❌\s*/, '[ERROR] ') : `[ERROR] ${data.error}`;
            appendOutput(`\n${errMsg}\n\n`);
        }
        else if (data.results) appendOutput(formatResults(data.results) + '\n');
        else appendOutput(`\n[OK] ${data.affected_rows || 0} row(s)\n\n`);
    } catch (e) {
        appendOutput(`\n[ERROR] ${e.message}\n\n`);
    }
}

function formatResults(results) {
    if (!results?.length) return '\n(Empty set)\n';
    const keys = Object.keys(results[0]);
    let out = '\n' + keys.join(' | ') + '\n' + '-'.repeat(40) + '\n';
    results.forEach(r => out += keys.map(k => r[k]).join(' | ') + '\n');
    return out + `\n[OK] ${results.length} row(s)\n`;
}

function disconnectDatabase() {
    if (!confirm('Disconnect?')) return;
    const c = document.getElementById('databaseTerminalContainer');
    if (c) c.innerHTML = `<div class="db-terminal-placeholder"><i class="fas fa-database"></i><p>No active connection</p><p class="hint">Click Connect on an approved database</p></div>`;
    window.dbConn = null;
}

window.openStructuredDatabaseAccess = openStructuredDatabaseAccess;
window.setDbAccessMode = setDbAccessMode;
window.closeDbStructuredPanel = closeDbStructuredPanel;
window.loadDatabases = loadDatabases;
