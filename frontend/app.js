// Global state
let currentUser = null;
let accounts = {};
let permissionSets = [];
let requests = [];
let currentTheme = 'light';
let isAdmin = false;
let bootstrapState = null;
let appSettings = {
    documentation_home_url: '',
    documentation_search_url: '',
    documentation_articles: [],
    support_email: '',
    break_glass_network_restricted: false,
    break_glass_request_allowed: true,
    idc_assume_role_arn: '',
    idc_assume_role_session_name: 'npam-idc',
    resource_assume_role_arn: '',
    resource_assume_role_session_name: 'npam-resource',
    resource_role_mappings: [],
    db_connect_proxy_mappings: [],
    db_connect_proxy_host_nonprod: '',
    db_connect_proxy_port_nonprod: '',
    db_connect_allow_direct_nonprod: false,
    sns_notifications_enabled: false,
    sns_topic_arn: '',
    gmail_notifications_enabled: false,
    gmail_sender_email: '',
    gmail_sender_display_name: 'NPAMx',
    gmail_workspace_domain: '',
    gmail_workspace_admin_contact: '',
    gmail_project_id: '',
    gmail_oauth_client_id: '',
    gmail_client_secret_name: '',
    gmail_refresh_token_secret_name: '',
    notification_email_footer_note: 'Please do not reply to this email. For support, please contact Nykaa SecOps team.',
    notify_email_databases_access: true,
    notify_email_cloud_access: true,
    notify_email_storage_access: true,
    notify_email_workloads_access: true,
    notify_email_admin_activity: false,
    notify_email_feedback_to_admins: true,
    notify_email_feedback_updates_to_users: true,
    feedback_admin_send_to_all: false,
    feedback_admin_target_roles: ['Admin', 'SuperAdmin'],
    feedback_admin_target_group_ids: [],
    feedback_admin_direct_emails: [],
    feedback_admin_cc_emails: [],
    feedback_admin_bcc_emails: [],
    db_user_audit_schedule_enabled: false,
    db_user_audit_schedule_weekday: 'Sun',
    db_user_audit_schedule_time_ist: '09:00',
    db_user_audit_notify_on_red_flag: true,
    notify_email_access_approval_reminders: true,
    notify_email_access_ready_to_requestor: true,
    jumpcloud_enabled: false,
    jumpcloud_api_base_url: 'https://console.jumpcloud.com/api',
    jumpcloud_api_key_secret_name: '',
    jumpcloud_user_lookup_field: 'email',
    jumpcloud_manager_attribute_name: 'manager',
    jumpcloud_department_attribute_name: 'department',
    jumpcloud_job_title_attribute_name: 'jobTitle',
    jumpcloud_sync_mode: 'on_demand',
    jumpcloud_directory_id: '',
    jumpcloud_admin_contact: '',
    jira_enabled: false,
    jira_base_url: '',
    jira_project_key: '',
    jira_user_email: '',
    jira_api_token_secret_name: '',
    audit_logs_bucket: '',
    audit_logs_prefix: 'npamx/audit',
    audit_logs_auto_export: false,
    request_approver_email_domain: 'nykaa.com',
    desktop_agent_enabled: false,
    desktop_agent_auth_mode: 'identity_center',
    desktop_agent_shared_token: '',
    desktop_agent_token_configured: false,
    desktop_agent_download_url_windows: '',
    desktop_agent_download_url_macos: '',
    desktop_agent_download_url_linux: '',
    desktop_agent_download_delivery: 's3_proxy',
    desktop_agent_download_s3_bucket: '',
    desktop_agent_download_s3_region: '',
    desktop_agent_download_s3_key_windows: '',
    desktop_agent_download_s3_key_macos: '',
    desktop_agent_download_s3_key_linux: '',
    desktop_agent_download_available_windows: false,
    desktop_agent_download_available_macos: false,
    desktop_agent_download_available_linux: false,
    desktop_agent_network_scope: 'netskope',
    desktop_agent_heartbeat_ttl_seconds: 180,
    desktop_agent_pairing_code_ttl_seconds: 600,
    desktop_agent_pairing_poll_interval_seconds: 5,
    desktop_agent_token_ttl_days: 1
};
let currentProfileData = null;
let feedbackAdminStatusTab = 'new';
let feedbackAdminSubTab = 'feedback';
let notificationAudienceGroupsCache = [];
let notificationsModalTab = 'all';
let documentationArticleDraft = [];
let documentationArticleEditIndex = -1;
let feedbackInboxCache = [];
let adminAnnouncementsCache = [];
let userNotificationsState = {
    announcements: [],
    feedback_updates: [],
    admin_feedback_queue: [],
    unread_announcement_ids: [],
    unread_feedback_ids: [],
    unread_admin_feedback_ids: [],
    unread_count: 0,
    active_ribbon: null
};
let notificationsRefreshTimer = null;
let announcementRibbonTimer = null;
let announcementRibbonIndex = 0;
const ANNOUNCEMENT_RIBBON_CYCLE_MS = 9400;
let pendingProfileMfaSetup = null;
let lastHomeSummary = null;
let homeRecentDeleteSelection = new Set();
let homeRecentExpanded = false;
let activeHomeHistoryCategory = 'databases';
let activeHomeHistoryPeriod = 'month';
let activeIntegrationProvider = '';
let siemIntegrationPanel = 's3';
let vaultDbConnectionInventory = [];
let vaultDbConnectionInventoryLoading = false;
let vaultDbConnectionInventoryTesting = {};
let desktopAgentRuntimeStatus = null;
let dbUserInventoryConnections = [];
let dbUserInventoryRows = [];
let dbUserInventorySelection = new Set();
let dbUserInventoryLoading = false;
let dbUserInventoryLastRun = null;
let dbUserInventoryLastSummary = null;
let adminPendingDatabaseApprovals = [];
let adminTrendsData = null;
let adminTrendsPeriod = 'day_30';
let appNotificationSeq = 0;
const NPAMX_PRODUCT_NAME = 'NPAMx';
const NPAMX_VERSION_LABEL = '1.0';
let ticketsSelection = new Set();
let ticketsLoadTimer = null;
let adminDbSessionsLoadSeq = 0;
let adminDbSessionsRevoking = false;
let adminDbSessionsLocallyRevoked = new Set();
window.PAM_CAPABILITIES = Array.isArray(window.PAM_CAPABILITIES) ? window.PAM_CAPABILITIES : [];
window.PAM_EFFECTIVE_APP_ROLES = Array.isArray(window.PAM_EFFECTIVE_APP_ROLES) ? window.PAM_EFFECTIVE_APP_ROLES : [];
window.PAM_CAPABILITIES_LOADED = window.PAM_CAPABILITIES_LOADED === true;
window.NPAM_USER_PROFILE = window.NPAM_USER_PROFILE || null;

/** Escape for safe insertion into HTML (prevents XSS). */
function escapeHtml(str) {
    if (str == null) return '';
    const s = String(str);
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function apiBaseUrl() {
    return String((typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : API_BASE || '/api').replace(/\/+$/, '');
}

function apiUrl(path) {
    const normalized = String(path || '').trim();
    return apiBaseUrl() + (normalized.startsWith('/') ? normalized : '/' + normalized);
}

function normalizePamRole(role) {
    const raw = String(role || '').trim().toLowerCase();
    if (!raw) return 'Employee';
    if (raw === 'superadmin' || raw === 'super_admin' || raw === 'super admin' || raw === 'break_glass') return 'SuperAdmin';
    if (raw === 'admin' || raw === 'administrator') return 'Admin';
    if (raw === 'engineer' || raw === 'eng' || raw === 'manager') return 'Engineer';
    return 'Employee';
}

function isBreakGlassRouteRequested() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        return params.get('break_glass') === '1';
    } catch (_) {
        return false;
    }
}

function shouldShowBreakGlassEntry() {
    if (bootstrapState && bootstrapState.email) return true;
    if (isBreakGlassRouteRequested()) return true;
    if (appSettings && appSettings.break_glass_request_allowed === true) {
        return false;
    }
    return false;
}

function updateBreakGlassEntryVisibility() {
    const btn = document.getElementById('breakGlassLoginBtn');
    if (!btn) return;
    btn.style.display = shouldShowBreakGlassEntry() ? 'inline-flex' : 'none';
}

function currentPamRole() {
    if (isBreakGlassSession()) return 'SuperAdmin';
    return normalizePamRole(localStorage.getItem('userRole') || '');
}

function getStoredPamCapabilities() {
    try {
        const raw = localStorage.getItem('pamCapabilities');
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.map(function(item) { return String(item || '').trim(); }).filter(Boolean) : [];
    } catch (_) {
        return [];
    }
}

function getStoredPamAppRoles() {
    try {
        const raw = localStorage.getItem('pamAppRoles');
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function getCurrentPamCapabilities() {
    if (Array.isArray(window.PAM_CAPABILITIES) && (window.PAM_CAPABILITIES.length || window.PAM_CAPABILITIES_LOADED)) {
        return window.PAM_CAPABILITIES.slice();
    }
    const stored = getStoredPamCapabilities();
    window.PAM_CAPABILITIES = stored.slice();
    return stored;
}

function getCurrentPamAppRoles() {
    if (Array.isArray(window.PAM_EFFECTIVE_APP_ROLES) && (window.PAM_EFFECTIVE_APP_ROLES.length || window.PAM_CAPABILITIES_LOADED)) {
        return window.PAM_EFFECTIVE_APP_ROLES.slice();
    }
    const stored = getStoredPamAppRoles();
    window.PAM_EFFECTIVE_APP_ROLES = stored.slice();
    return stored;
}

function setPamCapabilities(capabilities, roles) {
    const nextCaps = Array.isArray(capabilities)
        ? capabilities.map(function(item) { return String(item || '').trim(); }).filter(Boolean)
        : [];
    const nextRoles = Array.isArray(roles) ? roles : [];
    window.PAM_CAPABILITIES = nextCaps;
    window.PAM_EFFECTIVE_APP_ROLES = nextRoles;
    window.PAM_CAPABILITIES_LOADED = true;
    localStorage.setItem('pamCapabilities', JSON.stringify(nextCaps));
    localStorage.setItem('pamAppRoles', JSON.stringify(nextRoles));
}

function clearPamCapabilities() {
    window.PAM_CAPABILITIES = [];
    window.PAM_EFFECTIVE_APP_ROLES = [];
    window.PAM_CAPABILITIES_LOADED = false;
    localStorage.removeItem('pamCapabilities');
    localStorage.removeItem('pamAppRoles');
}

function legacyRoleHasCapability(capabilityId) {
    const role = currentPamRole();
    const capability = String(capabilityId || '').trim();
    if (!capability) return true;
    if (role === 'SuperAdmin' || role === 'Admin') return true;
    if (role === 'Engineer') {
        const engineerDefaults = new Set([
            'home.view', 'requests.view', 'sessions.view', 'tickets.view',
            'cloud.aws.view', 'cloud.gcp.view',
            'workloads.instances.view', 'workloads.gcp_vms.view',
            'storage.s3.view', 'storage.gcs.view',
            'databases.request.view',
            'terminal.database.view', 'terminal.vm.view',
            'admin.console.view',
            'admin.identity_center.view',
            'admin.identity_center.users.view',
            'admin.identity_center.groups.view',
            'admin.identity_center.permission_sets.view',
            'admin.identity_center.organization.view',
            'admin.integrations.view',
            'admin.integrations.cloud.manage',
            'admin.integrations.ticketing.manage',
            'admin.integrations.siem.manage',
            'admin.integrations.igp.manage',
            'admin.feedback.view'
        ]);
        return engineerDefaults.has(capability);
    }
    const employeeDefaults = new Set([
        'home.view', 'requests.view',
        'cloud.aws.view', 'cloud.gcp.view',
        'workloads.instances.view', 'workloads.gcp_vms.view',
        'storage.s3.view', 'storage.gcs.view',
        'databases.request.view',
        'terminal.database.view', 'terminal.vm.view'
    ]);
    return employeeDefaults.has(capability);
}

function hasPamCapability(capabilityId) {
    const capability = String(capabilityId || '').trim();
    if (!capability) return true;
    const caps = getCurrentPamCapabilities();
    if (caps.length || window.PAM_CAPABILITIES_LOADED) {
        if (!caps.length) {
            return legacyRoleHasCapability(capability);
        }
        return caps.indexOf(capability) >= 0;
    }
    return legacyRoleHasCapability(capability);
}

function capabilityForPage(pageId) {
    const page = String(pageId || '').trim();
    const map = {
        home: 'home.view',
        requests: 'requests.view',
        sessions: 'sessions.view',
        tickets: 'tickets.view',
        aws: 'cloud.aws.view',
        gcp: 'cloud.gcp.view',
        instances: 'workloads.instances.view',
        gcpVms: 'workloads.gcp_vms.view',
        s3: 'storage.s3.view',
        gcs: 'storage.gcs.view',
        databases: 'databases.request.view',
        databaseTerminal: 'terminal.database.view',
        vmTerminal: 'terminal.vm.view',
        admin: 'admin.console.view',
        dashboard: 'admin.console.view'
    };
    return map[page] || '';
}

function adminTabCapability(tabId) {
    const map = {
        users: 'admin.users.view',
        identityCenter: 'admin.identity_center.view',
        policies: 'admin.management.view',
        security: 'admin.security.view',
        integrations: 'admin.integrations.view',
        trends: 'admin.console.view',
        databaseSessions: 'admin.database_sessions.view',
        feedback: 'admin.feedback.view'
    };
    return map[String(tabId || '').trim()] || '';
}

function adminSubTabCapability(group, tabId) {
    const maps = {
        users: {
            users: 'admin.users.pam_admins.manage',
            groups: 'admin.users.groups.manage',
            roles: 'admin.users.individuals.manage'
        },
        management: {
            policies: 'admin.management.policies.view',
            approvalWorkflow: 'admin.management.approval_workflows.manage',
            pendingApprovals: 'admin.management.approval_workflows.manage',
            ticketsManagement: 'admin.integrations.ticketing.manage',
            features: 'admin.management.features.manage'
        },
        security: {
            security: 'admin.security.settings.manage',
            iam: 'admin.security.iam_roles.manage',
            guardrails: 'admin.security.guardrails.manage',
            dbUsers: 'admin.db_governance.view',
            audit: 'admin.security.audit.view'
        },
        integrations: {
            cloud: 'admin.integrations.cloud.manage',
            vaultdb: 'admin.integrations.cloud.manage',
            ticketing: 'admin.integrations.ticketing.manage',
            documentation: 'admin.integrations.ticketing.manage',
            siem: 'admin.integrations.siem.manage',
            igp: 'admin.integrations.igp.manage'
        },
        identityCenter: {
            users: 'admin.identity_center.users.view',
            groups: 'admin.identity_center.groups.view',
            'permission-sets': 'admin.identity_center.permission_sets.view',
            organization: 'admin.identity_center.organization.view'
        }
    };
    const groupMap = maps[String(group || '').trim()] || {};
    return groupMap[String(tabId || '').trim()] || '';
}

function firstAccessiblePage() {
    const ordered = ['home', 'requests', 'aws', 'gcp', 'instances', 'gcpVms', 's3', 'gcs', 'databases', 'databaseTerminal', 'vmTerminal'];
    for (let i = 0; i < ordered.length; i++) {
        if (hasPamCapability(capabilityForPage(ordered[i]))) return ordered[i];
    }
    return 'home';
}

window.hasPamCapability = hasPamCapability;
window.getCurrentPamCapabilities = getCurrentPamCapabilities;

function canAccessAdminConsole() {
    return hasPamCapability('admin.console.view');
}

function isBusinessProfileGateActive() {
    return window.__npamBusinessProfileGateActive === true;
}

function syncBusinessProfileGateUi() {
    const closeBtn = document.getElementById('profileModalCloseBtn');
    if (closeBtn) closeBtn.style.display = isBusinessProfileGateActive() ? 'none' : '';
}

function hasFullAdminControls() {
    return hasPamCapability('admin.full_controls');
}

function isFullAdminManagementTab(tabId) {
    return ['users', 'policies', 'security'].indexOf(String(tabId || '').trim()) >= 0;
}

function hasSuperAdminControls() {
    return hasPamCapability('admin.super_controls');
}

async function apiJson(path, init) {
    const options = Object.assign({ credentials: 'include' }, init || {});
    const res = await fetch(apiUrl(path), options);
    const data = await res.json().catch(function() { return {}; });
    if (!res.ok) {
        throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    }
    return data || {};
}

function setInlineStatus(elementId, message, variant) {
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

function getNotificationRoot() {
    let root = document.getElementById('appNotificationRoot');
    if (root || typeof document === 'undefined') return root;
    if (!document.body) return null;
    root = document.createElement('div');
    root.id = 'appNotificationRoot';
    root.className = 'app-notification-root';
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-atomic', 'true');
    document.body.appendChild(root);
    return root;
}

function inferNotificationVariant(message, explicitVariant) {
    const variant = String(explicitVariant || '').trim().toLowerCase();
    if (variant) return variant;
    const text = String(message || '').trim().toLowerCase();
    if (!text) return 'info';
    if (text.includes('failed') || text.includes('error') || text.includes('denied') || text.includes('unable') || text.includes('invalid')) {
        return 'error';
    }
    if (text.includes('warning') || text.includes('caution') || text.includes('review')) {
        return 'warning';
    }
    if (text.includes('success') || text.includes('approved') || text.includes('saved') || text.includes('submitted') || text.includes('created') || text.includes('updated') || text.includes('verified') || text.includes('ready') || text.includes('complete')) {
        return 'success';
    }
    return 'info';
}

function notificationTitleForVariant(variant) {
    if (variant === 'error') return 'Action failed';
    if (variant === 'warning') return 'Review required';
    if (variant === 'success') return 'Success';
    return 'Notice';
}

function notificationIconForVariant(variant) {
    if (variant === 'error') return 'fa-circle-xmark';
    if (variant === 'warning') return 'fa-triangle-exclamation';
    if (variant === 'success') return 'fa-circle-check';
    return 'fa-circle-info';
}

function formatRelativeFeedbackCategory(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'databases_access') return 'Databases Access';
    if (raw === 'cloud_access') return 'Cloud Access';
    if (raw === 'workloads_access') return 'Workloads Access';
    if (raw === 'storage_access') return 'Storage Access';
    return value || '—';
}

function formatRelativeFeedbackType(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'ui') return 'UI Related';
    if (raw === 'access_workflow') return 'Access Workflow Related';
    if (raw === 'application') return 'Application Related';
    if (raw === 'other') return 'Other';
    return value || '—';
}

function formatFeedbackStatusLabel(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'in_progress') return 'In Progress';
    if (raw === 'closed') return 'Closed';
    return 'New';
}

function dismissAppNotification(id) {
    const root = getNotificationRoot();
    if (!root) return;
    const el = root.querySelector('[data-toast-id="' + String(id).replace(/"/g, '&quot;') + '"]');
    if (!el) return;
    el.classList.remove('is-visible');
    window.setTimeout(function() {
        if (el.parentNode) el.parentNode.removeChild(el);
    }, 180);
}

function showAppNotification(message, variant, options) {
    const root = getNotificationRoot();
    const text = String(message || '').trim();
    if (!root || !text) return;
    const opts = options && typeof options === 'object' ? options : {};
    const resolvedVariant = inferNotificationVariant(text, variant);
    const toastId = 'toast-' + (++appNotificationSeq);
    const toast = document.createElement('div');
    toast.className = 'app-toast app-toast-' + resolvedVariant;
    toast.setAttribute('role', resolvedVariant === 'error' ? 'alert' : 'status');
    toast.setAttribute('data-toast-id', toastId);
    const title = String(opts.title || notificationTitleForVariant(resolvedVariant)).trim();
    toast.innerHTML = '' +
        '<div class="app-toast-icon"><i class="fas ' + notificationIconForVariant(resolvedVariant) + '"></i></div>' +
        '<div class="app-toast-copy">' +
            '<div class="app-toast-title">' + escapeHtml(title) + '</div>' +
            '<div class="app-toast-message">' + escapeHtml(text) + '</div>' +
        '</div>' +
        '<button type="button" class="app-toast-close" aria-label="Dismiss notification"><i class="fas fa-xmark"></i></button>';
    root.appendChild(toast);
    const closeBtn = toast.querySelector('.app-toast-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            dismissAppNotification(toastId);
        });
    }
    window.requestAnimationFrame(function() {
        toast.classList.add('is-visible');
    });
    const duration = Number(opts.duration);
    const timeoutMs = Number.isFinite(duration) && duration > 0
        ? duration
        : (resolvedVariant === 'error' ? 7000 : (resolvedVariant === 'warning' ? 6000 : 4200));
    if (!opts.persistent) {
        window.setTimeout(function() {
            dismissAppNotification(toastId);
        }, timeoutMs);
    }
}

window.showAppNotification = showAppNotification;
window.notifyApp = showAppNotification;

const __nativeAlert = window.alert ? window.alert.bind(window) : null;
window.alert = function(message) {
    const text = String(message || '').trim();
    if (!text) return;
    showAppNotification(text);
};

function closeAppConfirmModal(result) {
    const overlay = document.getElementById('appConfirmOverlay');
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

function confirmAppAction(message, options) {
    const text = String(message || '').trim();
    if (!text) return Promise.resolve(true);
    const opts = options && typeof options === 'object' ? options : {};
    const title = String(opts.title || 'Confirm action').trim();
    const confirmLabel = String(opts.confirmLabel || 'Continue').trim();
    const cancelLabel = String(opts.cancelLabel || 'Cancel').trim();
    const variant = String(opts.variant || 'warning').trim().toLowerCase();

    const existing = document.getElementById('appConfirmOverlay');
    if (existing && typeof existing.__resolver === 'function') {
        existing.__resolver(false);
        existing.remove();
    }

    return new Promise(function(resolve) {
        const overlay = document.createElement('div');
        overlay.id = 'appConfirmOverlay';
        overlay.className = 'modal-overlay show app-confirm-overlay';
        overlay.innerHTML = `
            <div class="modal app-confirm-modal show app-confirm-${escapeHtml(variant)}" role="dialog" aria-modal="true" aria-labelledby="appConfirmTitle">
                <div class="modal-header app-confirm-header">
                    <h3 id="appConfirmTitle"><i class="fas fa-triangle-exclamation"></i> ${escapeHtml(title)}</h3>
                    <button type="button" class="modal-close" aria-label="Close confirmation"><i class="fas fa-xmark"></i></button>
                </div>
                <div class="modal-body app-confirm-body">
                    <p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>
                </div>
                <div class="app-confirm-actions">
                    <button type="button" class="btn-secondary app-confirm-cancel">${escapeHtml(cancelLabel)}</button>
                    <button type="button" class="btn-danger app-confirm-submit">${escapeHtml(confirmLabel)}</button>
                </div>
            </div>
        `;
        overlay.__resolver = resolve;
        document.body.appendChild(overlay);
        const closeBtn = overlay.querySelector('.modal-close');
        const cancelBtn = overlay.querySelector('.app-confirm-cancel');
        const submitBtn = overlay.querySelector('.app-confirm-submit');
        if (closeBtn) closeBtn.addEventListener('click', function() { closeAppConfirmModal(false); });
        if (cancelBtn) cancelBtn.addEventListener('click', function() { closeAppConfirmModal(false); });
        if (submitBtn) submitBtn.addEventListener('click', function() { closeAppConfirmModal(true); });
        overlay.addEventListener('click', function(evt) {
            if (evt.target === overlay) closeAppConfirmModal(false);
        });
        const onKeyDown = function(evt) {
            if (evt.key === 'Escape') {
                closeAppConfirmModal(false);
            }
        };
        overlay.__onKeyDown = onKeyDown;
        document.addEventListener('keydown', onKeyDown);
        window.setTimeout(function() {
            if (submitBtn) submitBtn.focus();
        }, 10);
    });
}

window.confirmAppAction = confirmAppAction;

function closeAppPromptModal(value) {
    const overlay = document.getElementById('appPromptOverlay');
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
    if (typeof resolver === 'function') resolver(value);
}

function promptAppAction(message, options) {
    const text = String(message || '').trim();
    const opts = options && typeof options === 'object' ? options : {};
    const title = String(opts.title || 'Provide details').trim();
    const submitLabel = String(opts.submitLabel || 'Submit').trim();
    const cancelLabel = String(opts.cancelLabel || 'Cancel').trim();
    const variant = String(opts.variant || 'warning').trim().toLowerCase();
    const placeholder = String(opts.placeholder || '').trim();
    const helperText = String(opts.helperText || '').trim();
    const defaultValue = String(opts.defaultValue || '');
    const minLength = Number.isFinite(Number(opts.minLength)) ? Math.max(0, Number(opts.minLength)) : 0;
    const required = opts.required === true || minLength > 0;

    const existing = document.getElementById('appPromptOverlay');
    if (existing && typeof existing.__resolver === 'function') {
        existing.__resolver(null);
        existing.remove();
    }

    return new Promise(function(resolve) {
        const overlay = document.createElement('div');
        overlay.id = 'appPromptOverlay';
        overlay.className = 'modal-overlay show app-confirm-overlay app-prompt-overlay';
        overlay.innerHTML = `
            <div class="modal app-confirm-modal app-prompt-modal show app-confirm-${escapeHtml(variant)}" role="dialog" aria-modal="true" aria-labelledby="appPromptTitle">
                <div class="modal-header app-confirm-header">
                    <h3 id="appPromptTitle"><i class="fas fa-pen-to-square"></i> ${escapeHtml(title)}</h3>
                    <button type="button" class="modal-close" aria-label="Close prompt"><i class="fas fa-xmark"></i></button>
                </div>
                <div class="modal-body app-confirm-body app-prompt-body">
                    ${text ? `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>` : ''}
                    ${helperText ? `<p class="app-prompt-helper">${escapeHtml(helperText)}</p>` : ''}
                    <textarea class="app-prompt-input" rows="4" placeholder="${escapeHtml(placeholder)}">${escapeHtml(defaultValue)}</textarea>
                    <div class="app-prompt-error" aria-live="polite"></div>
                </div>
                <div class="app-confirm-actions">
                    <button type="button" class="btn-secondary app-prompt-cancel">${escapeHtml(cancelLabel)}</button>
                    <button type="button" class="btn-danger app-prompt-submit">${escapeHtml(submitLabel)}</button>
                </div>
            </div>
        `;
        overlay.__resolver = resolve;
        document.body.appendChild(overlay);
        const closeBtn = overlay.querySelector('.modal-close');
        const cancelBtn = overlay.querySelector('.app-prompt-cancel');
        const submitBtn = overlay.querySelector('.app-prompt-submit');
        const inputEl = overlay.querySelector('.app-prompt-input');
        const errorEl = overlay.querySelector('.app-prompt-error');
        const showError = function(msg) {
            if (!errorEl) return;
            errorEl.textContent = String(msg || '').trim();
        };
        const submit = function() {
            const value = String((inputEl && inputEl.value) || '').trim();
            if (required && value.length < minLength) {
                const minText = minLength > 0 ? `Please enter at least ${minLength} characters.` : 'This field is required.';
                showError(minText);
                if (inputEl) inputEl.focus();
                return;
            }
            showError('');
            closeAppPromptModal(value);
        };
        if (inputEl) {
            inputEl.addEventListener('input', function() {
                showError('');
            });
        }
        if (closeBtn) closeBtn.addEventListener('click', function() { closeAppPromptModal(null); });
        if (cancelBtn) cancelBtn.addEventListener('click', function() { closeAppPromptModal(null); });
        if (submitBtn) submitBtn.addEventListener('click', submit);
        overlay.addEventListener('click', function(evt) {
            if (evt.target === overlay) closeAppPromptModal(null);
        });
        const onKeyDown = function(evt) {
            if (evt.key === 'Escape') {
                closeAppPromptModal(null);
                return;
            }
            if (evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) {
                submit();
            }
        };
        overlay.__onKeyDown = onKeyDown;
        document.addEventListener('keydown', onKeyDown);
        window.setTimeout(function() {
            if (inputEl) inputEl.focus();
        }, 10);
    });
}

window.promptAppAction = promptAppAction;

function formatDateTimeIst(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date) + ' IST';
}

function formatDateIst(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'short',
        day: '2-digit'
    }).format(date);
}

function formatDurationHours(value) {
    const hours = Number(value || 0);
    if (!Number.isFinite(hours) || hours <= 0) return '-';
    return hours + (hours === 1 ? ' hour' : ' hours');
}

function isBreakGlassSession() {
    return String(localStorage.getItem('loginMethod') || '').trim().toLowerCase() === 'break_glass';
}

function hasAdminSession() {
    return isBreakGlassSession() || hasFullAdminControls() || canAccessAdminConsole();
}

// PAM admin check: isAdmin is set from API /api/admin/check-pam-admin (backend stores PAM solution admins)
const API_BASE_FOR_ADMIN = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '/api';
let pamAdminStatusRequest = null;
let pamAdminStatusRequestedEmail = '';

function deriveNameFromEmail(email) {
    const em = String(email || '').trim();
    if (!em || em.toLowerCase() === 'email' || em.indexOf('@') < 0) return '';
    const local = em.split('@', 1)[0].replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!local) return '';
    return local.split(' ').map(p => p ? (p.charAt(0).toUpperCase() + p.slice(1)) : '').join(' ').trim();
}

function renderProfileNameFallback() {
    var el = document.getElementById('userNameDisplay') || document.getElementById('userName');
    if (!el) return;
    var rawName = String(localStorage.getItem('userName') || '').trim();
    var email = String(localStorage.getItem('userEmail') || '').trim();
    if (!rawName || rawName.toLowerCase() === 'user' || rawName.toLowerCase() === 'email') {
        rawName = deriveNameFromEmail(email) || 'User';
    }
    var safe = String(rawName)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    var admin = hasFullAdminControls() || canAccessAdminConsole();
    el.innerHTML = admin
        ? '<i class="fas fa-crown profile-crown-icon" title="PAM Admin"></i> ' + safe
        : safe;
}

window.renderProfileNameFallback = renderProfileNameFallback;

let inactivityTimer = null;
let inactivityDebounce = null;
const INACTIVITY_TIMEOUT = 30 * 60 * 1000;

function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(function() {
        alert('Session expired due to inactivity. You will be logged out.');
        logout();
    }, INACTIVITY_TIMEOUT);
}

function debouncedResetInactivityTimer() {
    if (inactivityDebounce) clearTimeout(inactivityDebounce);
    inactivityDebounce = setTimeout(resetInactivityTimer, 80);
}

function initInactivityTracking() {
    if (document.documentElement.dataset.boundInactivityTracking === '1') return;
    document.addEventListener('mousedown', resetInactivityTimer);
    document.addEventListener('mousemove', debouncedResetInactivityTimer);
    document.addEventListener('keypress', resetInactivityTimer);
    document.addEventListener('scroll', function() {
        debouncedResetInactivityTimer();
    }, { passive: true });
    document.addEventListener('touchstart', resetInactivityTimer);
    document.documentElement.dataset.boundInactivityTracking = '1';
    resetInactivityTimer();
}

function setPamAdminFromApi(email) {
    if (typeof fetch === 'undefined') return;
    const em = String(email || '').trim();
    if (!em) return;
    if (pamAdminStatusRequest && pamAdminStatusRequestedEmail === em) return;
    const path = '/admin/check-pam-admin?email=' + encodeURIComponent(em);
    const candidates = [];
    const addCandidate = function(base) {
        const cleaned = String(base || '').replace(/\/+$/, '');
        if (cleaned && candidates.indexOf(cleaned) === -1) candidates.push(cleaned);
    };
    addCandidate('/api');
    addCandidate(API_BASE_FOR_ADMIN);
    if (typeof window !== 'undefined' && window.API_BASE) addCandidate(window.API_BASE);

    pamAdminStatusRequestedEmail = em;
    pamAdminStatusRequest = (async function() {
        let data = null;
        for (let i = 0; i < candidates.length; i++) {
            const base = candidates[i];
            try {
                const r = await fetch(base + path, { credentials: 'include' });
                if (!r.ok) continue;
                const contentType = String(r.headers.get('Content-Type') || '').toLowerCase();
                if (!contentType.includes('application/json')) continue;
                data = await r.json();
                if (typeof window !== 'undefined' && window.API_BASE !== base) window.API_BASE = base;
                break;
            } catch (_) {
                continue;
            }
        }
        if (!data || typeof data.isAdmin !== 'boolean') return;

        const responseEmail = String((data && data.email) || '').trim();
        const storedEmail = String(localStorage.getItem('userEmail') || '').trim();
        const finalEmail = responseEmail || em || storedEmail;
        if (finalEmail) localStorage.setItem('userEmail', finalEmail);

        const responseNameRaw = String((data && (data.display_name || data.displayName)) || '').trim();
        let finalName = '';
        if (responseNameRaw && responseNameRaw.toLowerCase() !== 'user' && responseNameRaw.toLowerCase() !== 'email') {
            finalName = responseNameRaw;
        } else {
            const storedName = String(localStorage.getItem('userName') || '').trim();
            if (storedName && storedName.toLowerCase() !== 'user' && storedName.toLowerCase() !== 'email') {
                finalName = storedName;
            } else {
                finalName = deriveNameFromEmail(finalEmail);
            }
        }
        if (finalName) localStorage.setItem('userName', finalName);

        const existingBreakGlassAdmin = isBreakGlassSession();
        const roleFromApi = normalizePamRole((data && data.role) || (existingBreakGlassAdmin ? 'SuperAdmin' : 'Employee'));
        isAdmin = existingBreakGlassAdmin ? true : (data.isAdmin === true || roleFromApi === 'Admin' || roleFromApi === 'SuperAdmin');
        localStorage.setItem('isAdmin', String(isAdmin));
        localStorage.setItem('userRole', roleFromApi);
        setPamCapabilities((data && data.capabilities) || [], (data && data.app_roles) || []);
        if (typeof currentUser !== 'undefined' && currentUser) {
            currentUser.isAdmin = isAdmin;
            if (finalEmail) currentUser.email = finalEmail;
            if (finalName) currentUser.name = finalName;
        }
        if (typeof checkAdminAccess === 'function') checkAdminAccess();
        if (typeof updateUIForRole === 'function') updateUIForRole();
        if (typeof applyRoleRouteLanding === 'function') applyRoleRouteLanding();
    })().finally(function() {
        pamAdminStatusRequest = null;
        pamAdminStatusRequestedEmail = '';
    });
}

let ssoProfileSyncInFlight = false;

async function fetchSsoProfileWithFallback() {
    const urls = [
        API_BASE_FOR_ADMIN + '/saml/profile',
        '/saml/profile'
    ];
    let lastError = null;
    for (const url of urls) {
        try {
            const res = await fetch(url, { credentials: 'include' });
            if (!res.ok) {
                lastError = new Error('HTTP ' + res.status);
                continue;
            }
            const ct = String(res.headers.get('content-type') || '').toLowerCase();
            if (!ct.includes('application/json')) {
                lastError = new Error('Non-JSON response');
                continue;
            }
            return await res.json();
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError || new Error('Failed to load SSO profile');
}

async function syncSsoProfileFromSession() {
    if (ssoProfileSyncInFlight || typeof fetch === 'undefined') return;
    ssoProfileSyncInFlight = true;
    try {
        const data = await fetchSsoProfileWithFallback();
        if (!data || data.logged_in !== true) return;

        const email = String(data.email || '').trim();
        const fallbackEmail = String(localStorage.getItem('userEmail') || '').trim();
        const resolvedEmail = email || fallbackEmail;
        const profileName = String(data.display_name || '').trim();
        const storedName = String(localStorage.getItem('userName') || '').trim();
        let displayName = profileName;
        if (!displayName || displayName.toLowerCase() === 'user' || displayName.toLowerCase() === 'email') {
            displayName = (storedName && storedName.toLowerCase() !== 'user' && storedName.toLowerCase() !== 'email')
                ? storedName
                : deriveNameFromEmail(resolvedEmail);
        }

        const isAdminFromSession = data.is_admin === true;
        const authType = String(data.auth_type || '').trim().toLowerCase() === 'break_glass' ? 'break_glass' : 'sso';
        const resolvedRole = normalizePamRole(data.role || (isAdminFromSession ? 'Admin' : 'Employee'));

        if (resolvedEmail) localStorage.setItem('userEmail', resolvedEmail);
        if (displayName) localStorage.setItem('userName', displayName);
        localStorage.setItem('loginMethod', authType);
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('isAdmin', String(isAdminFromSession));
        localStorage.setItem('userRole', resolvedRole);

        isAdmin = isAdminFromSession;
        currentUser = {
            email: resolvedEmail,
            name: displayName || deriveNameFromEmail(resolvedEmail) || (localStorage.getItem('userName') || 'User'),
            isAdmin: isAdminFromSession
        };

        setPamAdminFromApi(resolvedEmail || '');
        if (typeof updateUIForRole === 'function') updateUIForRole();
        if (typeof checkAdminAccess === 'function') checkAdminAccess();
        if (typeof applyRoleRouteLanding === 'function') applyRoleRouteLanding();
        try {
            const profile = await loadProfileData();
            maybePromptForBusinessProfile(profile);
        } catch (_) {}
    } catch (_) {
        // Keep existing localStorage identity if session hydration fails.
    } finally {
        ssoProfileSyncInFlight = false;
    }
}

let sessionResumeCheckInFlight = false;
async function revalidateSessionOnResume() {
    if (sessionResumeCheckInFlight) return;
    if (localStorage.getItem('isLoggedIn') !== 'true') return;
    sessionResumeCheckInFlight = true;
    try {
        const data = await fetchSsoProfileWithFallback();
        if (!data || data.logged_in !== true) {
            await logout();
            return;
        }
        applyAuthenticatedProfile(data);
        if (typeof updateUIForRole === 'function') updateUIForRole();
        if (typeof checkAdminAccess === 'function') checkAdminAccess();
        try {
            const profile = await loadProfileData();
            maybePromptForBusinessProfile(profile);
        } catch (_) {}
    } catch (_) {
        // Leave the current UI state unchanged on transient network errors.
    } finally {
        sessionResumeCheckInFlight = false;
    }
}

function setLoginStatus(message, variant) {
    const statusEl = document.getElementById('loginStatus');
    if (!statusEl) return;
    const text = String(message || '').trim();
    if (!text) {
        statusEl.hidden = true;
        statusEl.textContent = '';
        statusEl.removeAttribute('data-variant');
        return;
    }
    statusEl.hidden = false;
    statusEl.textContent = text;
    statusEl.setAttribute('data-variant', String(variant || 'info'));
}

function clearSessionRestorePending() {
    if (typeof document === 'undefined' || !document.documentElement) return;
    document.documentElement.classList.remove('session-restore-pending');
}

function clearAppBootPending() {
    if (typeof document === 'undefined' || !document.documentElement) return;
    document.documentElement.classList.remove('app-boot-pending');
}

function clearStoredAuthState() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('userRole');
    localStorage.removeItem('loginMethod');
    localStorage.removeItem('npam_feature_flags');
    clearPamCapabilities();
    currentUser = null;
    isAdmin = false;
}

function applyAuthenticatedProfile(profile) {
    const data = profile || {};
    const email = String(data.email || '').trim();
    const displayName = String(data.display_name || deriveNameFromEmail(email) || 'User').trim();
    const adminFromSession = data.is_admin === true;
    const authType = String(data.auth_type || '').trim().toLowerCase() === 'break_glass' ? 'break_glass' : 'sso';
    const role = normalizePamRole(data.role || (adminFromSession ? 'Admin' : 'Employee'));

    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('userEmail', email);
    localStorage.setItem('userName', displayName);
    localStorage.setItem('isAdmin', String(adminFromSession));
    localStorage.setItem('userRole', role);
    localStorage.setItem('loginMethod', authType);

    isAdmin = adminFromSession;
    currentUser = {
        email: email,
        name: displayName,
        isAdmin: adminFromSession
    };
}

function restoreStoredAuthState() {
    if (localStorage.getItem('isLoggedIn') !== 'true') return false;
    const email = String(localStorage.getItem('userEmail') || '').trim();
    const storedName = String(localStorage.getItem('userName') || '').trim();
    const role = normalizePamRole(localStorage.getItem('userRole') || 'Employee');
    const authType = String(localStorage.getItem('loginMethod') || 'sso').trim().toLowerCase() === 'break_glass' ? 'break_glass' : 'sso';
    const displayName = storedName || deriveNameFromEmail(email) || 'User';

    currentUser = {
        email: email,
        name: displayName,
        isAdmin: authType === 'break_glass'
    };
    isAdmin = currentUser.isAdmin;
    localStorage.setItem('userName', displayName);
    localStorage.setItem('userRole', role);
    localStorage.setItem('loginMethod', authType);
    setPamAdminFromApi(email || '');
    return true;
}

async function bootstrapAuthState() {
    const restoredFromStorage = restoreStoredAuthState();
    try {
        const data = await fetchSsoProfileWithFallback();
        if (data && data.logged_in === true) {
            applyAuthenticatedProfile(data);
            if (typeof refreshFeaturesFromServer === 'function') {
                try {
                    await refreshFeaturesFromServer();
                } catch (_) {}
            } else if (typeof loadFeatureToggles === 'function') {
                try {
                    await loadFeatureToggles();
                } catch (_) {}
            }
            setLoginStatus('', 'info');
            showMainApp();
            setPamAdminFromApi(data.email || '');
            try {
                const profile = await loadProfileData();
                maybePromptForBusinessProfile(profile);
            } catch (_) {}
            if (typeof applyRoleRouteLanding === 'function') {
                setTimeout(function() { applyRoleRouteLanding(); }, 100);
            }
            return;
        }
        if (data && data.logged_in === false) {
            clearStoredAuthState();
            await initializeBootstrapFlow();
            clearAppBootPending();
            return;
        }
    } catch (_) {
        if (restoredFromStorage) {
            if (typeof refreshFeaturesFromServer === 'function') {
                try {
                    await refreshFeaturesFromServer();
                } catch (_) {}
            } else if (typeof loadFeatureToggles === 'function') {
                try {
                    await loadFeatureToggles();
                } catch (_) {}
            }
            showMainApp();
            try {
                const profile = await loadProfileData();
                maybePromptForBusinessProfile(profile);
            } catch (_) {}
            return;
        }
    }
    if (!restoredFromStorage) {
        clearStoredAuthState();
        await initializeBootstrapFlow();
    }
    clearAppBootPending();
}

function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

function initGlobalCsrfFetchProtection() {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function' || window.__npamCsrfFetchWrapped) {
        return;
    }
    const originalFetch = window.fetch.bind(window);
    function normalizeInternalUrl(targetUrl) {
        try {
            const resolved = new URL(String(targetUrl || ''), window.location.origin);
            const isLoopback = ['127.0.0.1', 'localhost', '0.0.0.0'].includes(String(resolved.hostname || '').toLowerCase());
            if (isLoopback && String(resolved.pathname || '').startsWith('/api')) {
                return resolved.pathname + resolved.search + resolved.hash;
            }
            return resolved.toString();
        } catch (_) {
            return String(targetUrl || '');
        }
    }

    window.fetch = function(input, init) {
        const requestInit = init ? Object.assign({}, init) : {};
        const method = String(
            requestInit.method ||
            ((input && typeof input === 'object' && 'method' in input) ? input.method : 'GET') ||
            'GET'
        ).toUpperCase();

        let targetUrl = '';
        try {
            targetUrl = typeof input === 'string' ? input : String((input && input.url) || '');
        } catch (_) {
            targetUrl = '';
        }

        const normalizedUrl = normalizeInternalUrl(targetUrl || '');
        let resolvedUrl;
        try {
            resolvedUrl = new URL(normalizedUrl || '', window.location.origin);
        } catch (_) {
            resolvedUrl = null;
        }
        const isInternalApi = !!resolvedUrl && resolvedUrl.origin === window.location.origin && String(resolvedUrl.pathname || '').startsWith('/api');

        if (!normalizedUrl && !isInternalApi) {
            return originalFetch(input, init);
        }

        const headers = new Headers(
            requestInit.headers ||
            ((input && typeof input === 'object' && 'headers' in input) ? input.headers : {})
        );
        if (isInternalApi && !requestInit.credentials) {
            requestInit.credentials = 'include';
        }
        if (isInternalApi && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !headers.has('X-CSRF-Token')) {
            const csrfToken = getCsrfToken();
            if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
        }
        requestInit.headers = headers;
        let fetchInput = input;
        if (normalizedUrl && normalizedUrl !== targetUrl) {
            if (typeof Request !== 'undefined' && input instanceof Request) {
                fetchInput = new Request(normalizedUrl, input);
            } else {
                fetchInput = normalizedUrl;
            }
        }
        return originalFetch(fetchInput, requestInit);
    };
    window.__npamCsrfFetchWrapped = true;
}

initGlobalCsrfFetchProtection();

async function fetchBootstrapStatus() {
    const base = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE.replace(/\/+$/, '') : '/api';
    const res = await fetch(base + '/auth/bootstrap-status', { credentials: 'include' });
    if (!res.ok) {
        return { bootstrap_required: false, break_glass_available: false };
    }
    return res.json();
}

async function initializeBootstrapFlow() {
    clearSessionRestorePending();
    try {
        const status = await fetchBootstrapStatus();
        if (status && status.bootstrap_required === true) {
            bootstrapState = {
                email: '',
                totp_secret: '',
                qr_code_data_uri: ''
            };
            showBootstrapSetupView(status);
            if (status.pending_mfa_enrollment === true) {
                setLoginStatus(
                    'A break-glass bootstrap account is already staged. Re-enter the same email and password to regenerate MFA enrollment if needed, then verify the authenticator code.',
                    'info'
                );
                return;
            }
            setLoginStatus('First-time setup required. Create the initial break-glass SuperAdmin and enroll MFA before using the password login path.', 'info');
            updateBreakGlassEntryVisibility();
            return;
        }
    } catch (_) {
        // Fall back to normal login when bootstrap status cannot be determined.
    }
    showDefaultLogin();
}

// API Base URL - use /api when on port 80 (nginx proxy), else hostname:5000
// Override: set window.API_BASE before app.js loads
const API_BASE = (typeof window !== 'undefined' && window.API_BASE)
  ? window.API_BASE
  : '/api';

const APP_ROUTE_ADMIN = '/admin';
const APP_ROUTE_USER = '/app';
const APP_ROUTE_ROOT = '/';

function normalizeAppPath(pathname) {
    const raw = String(pathname || '/').trim() || '/';
    let normalized = raw.split('?')[0];
    if (!normalized.startsWith('/')) normalized = '/' + normalized;
    if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
    return normalized || '/';
}

function canRewriteAppPath() {
    const current = normalizeAppPath(window.location.pathname);
    return current === '/' || current === '/index.html' || current === APP_ROUTE_USER || current === APP_ROUTE_ADMIN;
}

function pageExists(pageId) {
    return !!canonicalPageId(pageId);
}

function canonicalPageId(pageId) {
    const raw = String(pageId || '').trim();
    if (!raw) return '';
    if (document.getElementById(raw + 'Page')) return raw;
    const normalized = raw.toLowerCase();
    const pages = document.querySelectorAll('.page[id$="Page"]');
    for (let i = 0; i < pages.length; i++) {
        const candidate = String(pages[i].id || '').replace(/Page$/, '');
        if (candidate.toLowerCase() === normalized) return candidate;
    }
    return '';
}

function replaceAppUrl(pathname, hashPage) {
    if (!canRewriteAppPath()) return;
    const base = normalizeAppPath(pathname || '/');
    const page = String(hashPage || '').replace(/^#/, '').trim();
    const hash = page ? ('#' + page) : '';
    const target = base + hash;
    const current = normalizeAppPath(window.location.pathname) + (window.location.hash || '');
    if (target !== current && typeof history !== 'undefined' && typeof history.replaceState === 'function') {
        history.replaceState({}, '', target);
    }
}

function routePageFromHash() {
    const raw = String(window.location.hash || '').replace(/^#/, '').trim();
    return canonicalPageId(raw);
}

function applyRoleRouteLanding() {
    if (localStorage.getItem('isLoggedIn') !== 'true') return;
    const adminNow = canAccessAdminConsole();
    const path = normalizeAppPath(window.location.pathname);
    const hashPage = routePageFromHash();

    if (path === APP_ROUTE_ADMIN && !adminNow) {
        replaceAppUrl(APP_ROUTE_USER, 'home');
        if (typeof showPage === 'function') showPage('home');
        return;
    }

    if (path === APP_ROUTE_ADMIN && adminNow) {
        const adminPage = (hashPage && hashPage !== 'requests') ? hashPage : 'admin';
        if (typeof showPage === 'function') showPage(adminPage);
        return;
    }

    if (path === APP_ROUTE_USER) {
        if (adminNow) {
            replaceAppUrl(APP_ROUTE_ADMIN, 'admin');
            if (typeof showPage === 'function') showPage('admin');
        } else if (hashPage && hashPage !== 'admin') {
            if (typeof showPage === 'function') showPage(hashPage);
        } else if (typeof showPage === 'function') {
            showPage('home');
        }
        return;
    }

    if (path === APP_ROUTE_ROOT || path === '/index.html') {
        if (adminNow) {
            replaceAppUrl(APP_ROUTE_ADMIN, 'admin');
            if (typeof showPage === 'function') showPage('admin');
        } else {
            replaceAppUrl(APP_ROUTE_USER, 'home');
            if (typeof showPage === 'function') showPage('home');
        }
        return;
    }

    if (hashPage) {
        if (hashPage === 'admin' && !adminNow) {
            if (typeof showPage === 'function') showPage('home');
        } else if (typeof showPage === 'function') {
            showPage(hashPage);
        }
    }
}

function syncRouteWithCurrentPage(pageId) {
    if (localStorage.getItem('isLoggedIn') !== 'true') return;
    if (!canRewriteAppPath()) return;
    const adminNow = canAccessAdminConsole();
    const normalizedPage = canonicalPageId(pageId);
    const safePage = normalizedPage
        ? normalizedPage
        : (adminNow ? 'admin' : 'home');
    const finalPage = (!adminNow && safePage === 'admin') ? 'home' : safePage;
    const base = adminNow ? APP_ROUTE_ADMIN : APP_ROUTE_USER;
    replaceAppUrl(base, finalPage);
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    // Hide assistant surfaces until an authenticated session is confirmed.
    if (!document.documentElement.classList.contains('session-restore-pending')) {
        document.body.classList.add('login-page');
    }
    const copilotBtn = document.getElementById('securityCopilotButton');
    const copilotPopup = document.getElementById('securityCopilotPopup');
    const unifiedBtn = document.getElementById('unifiedAssistantButton');
    const unifiedPopup = document.getElementById('unifiedAssistantPopup');
    const versionBadge = document.getElementById('productVersionBadge');
    if (versionBadge) versionBadge.textContent = NPAMX_VERSION_LABEL;
    if (copilotBtn) copilotBtn.style.display = 'none';
    if (copilotPopup) copilotPopup.style.display = 'none';
    if (unifiedBtn) unifiedBtn.remove();
    if (unifiedPopup) unifiedPopup.remove();
    
    // Load theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    initInactivityTracking();
    setTimeout(renderProfileNameFallback, 50);
    setTimeout(renderProfileNameFallback, 900);
    if (localStorage.getItem('isLoggedIn') === 'true') {
        setTimeout(function() {
            if (typeof initUnifiedAssistant === 'function') initUnifiedAssistant();
        }, 500);
    }
    
    // Setup event listeners
    setupEventListeners();
    if (localStorage.getItem('isLoggedIn') !== 'true' && normalizeAppPath(window.location.pathname) === APP_ROUTE_ADMIN) {
        replaceAppUrl(APP_ROUTE_ROOT, '');
    }
    bootstrapAuthState();
    window.addEventListener('focus', revalidateSessionOnResume);
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') revalidateSessionOnResume();
    });
    window.addEventListener('storage', renderProfileNameFallback);
});

async function handleBreakGlassLogin(email, password, mfaCode) {
    const base = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE.replace(/\/+$/, '') : '/api';
    const url = base + '/auth/break-glass-login';
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password, mfa_code: String(mfaCode || '').trim() }),
        credentials: 'include'
    });
    const data = await res.json().catch(function() { return {}; });
    if (!res.ok) {
        const error = new Error(data.error || 'Login failed');
        error.retryAfter = Number(data.retry_after_seconds || 0);
        error.bootstrapRequired = data.bootstrap_required === true;
        error.mfaRequired = data.mfa_required === true;
        throw error;
    }
    applyAuthenticatedProfile({
        email: data.email || email,
        display_name: data.display_name || deriveNameFromEmail(data.email || email) || 'Admin',
        is_admin: true,
        role: normalizePamRole(data.role || 'SuperAdmin'),
        auth_type: data.auth_type || 'break_glass'
    });
    if (typeof checkAdminAccess === 'function') checkAdminAccess();
    if (typeof updateUIForRole === 'function') updateUIForRole();
    showMainApp();
    if (typeof setPamAdminFromApi === 'function') setPamAdminFromApi(data.email || email);
}

async function beginBootstrapBreakGlass(email, password, confirmPassword) {
    const base = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE.replace(/\/+$/, '') : '/api';
    const res = await fetch(base + '/auth/bootstrap-break-glass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            email: String(email || '').trim(),
            password: String(password || ''),
            confirm_password: String(confirmPassword || '')
        })
    });
    const data = await res.json().catch(function() { return {}; });
    if (!res.ok) {
        throw new Error(data.error || 'Bootstrap setup failed');
    }
    bootstrapState = data;
    return data;
}

async function verifyBootstrapBreakGlass(email, mfaCode) {
    const base = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE.replace(/\/+$/, '') : '/api';
    const res = await fetch(base + '/auth/bootstrap-break-glass/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            email: String(email || '').trim(),
            mfa_code: String(mfaCode || '').trim()
        })
    });
    const data = await res.json().catch(function() { return {}; });
    if (!res.ok) {
        throw new Error(data.error || 'Bootstrap MFA verification failed');
    }
    bootstrapState = null;
    return data;
}

function setupEventListeners() {
    const bootstrapSetupForm = document.getElementById('bootstrapSetupForm');
    if (bootstrapSetupForm) {
        bootstrapSetupForm.addEventListener('submit', function(e) {
            e.preventDefault();
            setLoginStatus('', 'info');
            const email = (document.getElementById('bootstrapEmail') || {}).value || '';
            const password = (document.getElementById('bootstrapPassword') || {}).value || '';
            const confirmPassword = (document.getElementById('bootstrapPasswordConfirm') || {}).value || '';
            const btn = this.querySelector('button[type="submit"]');
            if (btn) { btn.disabled = true; btn.textContent = 'Preparing MFA...'; }
            beginBootstrapBreakGlass(email, password, confirmPassword).then(function(data) {
                showBootstrapVerifyView(data);
                setLoginStatus('Bootstrap credentials stored. Scan the QR code and verify the current authenticator code.', 'info');
            }).catch(function(err) {
                setLoginStatus(err.message || 'Bootstrap setup failed.', 'error');
            }).finally(function() {
                if (btn) { btn.disabled = false; btn.textContent = 'Create Bootstrap Admin'; }
            });
        });
    }

    const bootstrapVerifyForm = document.getElementById('bootstrapVerifyForm');
    if (bootstrapVerifyForm) {
        bootstrapVerifyForm.addEventListener('submit', function(e) {
            e.preventDefault();
            setLoginStatus('', 'info');
            const email = (bootstrapState && bootstrapState.email) || ((document.getElementById('bootstrapVerifyEmail') || {}).textContent || '').trim();
            const code = (document.getElementById('bootstrapMfaCode') || {}).value || '';
            const btn = this.querySelector('button[type="submit"]');
            if (btn) { btn.disabled = true; btn.textContent = 'Verifying MFA...'; }
            verifyBootstrapBreakGlass(email, code).then(function(data) {
                applyAuthenticatedProfile({
                    email: data.email || email,
                    display_name: data.display_name || deriveNameFromEmail(data.email || email) || 'Admin',
                    is_admin: true,
                    role: normalizePamRole(data.role || 'SuperAdmin'),
                    auth_type: data.auth_type || 'break_glass'
                });
                setLoginStatus('', 'info');
                showMainApp();
                if (typeof setPamAdminFromApi === 'function') setPamAdminFromApi(data.email || email);
            }).catch(function(err) {
                setLoginStatus(err.message || 'Bootstrap MFA verification failed.', 'error');
            }).finally(function() {
                if (btn) { btn.disabled = false; btn.textContent = 'Verify MFA and Sign In'; }
            });
        });
    }

    // Username/Password form: break-glass login (full access; created manually on EC2)
    const usernamePasswordForm = document.getElementById('usernamePasswordForm');
    if (usernamePasswordForm) {
        usernamePasswordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            setLoginStatus('', 'info');
            const username = (document.getElementById('username') && document.getElementById('username').value) || '';
            const password = (document.getElementById('password') && document.getElementById('password').value) || '';
            const mfaCode = (document.getElementById('passwordMfaCode') && document.getElementById('passwordMfaCode').value) || '';
            if (!username || !password || !mfaCode) {
                setLoginStatus('Enter the admin email, password, and MFA code for break-glass or local PAM access.', 'error');
                return;
            }
            const email = username.trim();
            if (email.indexOf('@') < 0) {
                setLoginStatus('Use the full admin email address for break-glass sign-in.', 'error');
                return;
            }
            const btn = this.querySelector('button[type="submit"]');
            if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }
            handleBreakGlassLogin(email, password, mfaCode).then(function() {
                setLoginStatus('', 'info');
                if (btn) { btn.disabled = false; btn.textContent = 'Sign In Securely'; }
            }).catch(function(err) {
                if (btn) { btn.disabled = false; btn.textContent = 'Sign In Securely'; }
                if (err && err.bootstrapRequired) {
                    initializeBootstrapFlow();
                    return;
                }
                if (err && err.retryAfter > 0) {
                    setLoginStatus('Too many failed attempts. Wait ' + err.retryAfter + ' seconds before trying again.', 'error');
                    return;
                }
                setLoginStatus(err.message || 'Invalid email or password.', 'error');
            });
        });
    }

    const profilePasswordForm = document.getElementById('profilePasswordForm');
    if (profilePasswordForm) {
        profilePasswordForm.addEventListener('submit', handleProfilePasswordChange);
    }

    const profileMfaStartForm = document.getElementById('profileMfaStartForm');
    if (profileMfaStartForm) {
        profileMfaStartForm.addEventListener('submit', startProfileMfaEnrollment);
    }

    const profileMfaVerifyForm = document.getElementById('profileMfaVerifyForm');
    if (profileMfaVerifyForm) {
        profileMfaVerifyForm.addEventListener('submit', verifyProfileMfaEnrollment);
    }

    const profileBusinessProfileForm = document.getElementById('profileBusinessProfileForm');
    if (profileBusinessProfileForm) {
        profileBusinessProfileForm.addEventListener('submit', saveProfileBusinessProfile);
    }

    const feedbackForm = document.getElementById('feedbackForm');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', submitFeedbackForm);
    }
    const feedbackDescription = document.getElementById('feedbackDescription');
    if (feedbackDescription) {
        feedbackDescription.addEventListener('input', updateFeedbackWordCount);
        updateFeedbackWordCount();
    }

    const integrationConfigForm = document.getElementById('integrationConfigForm');
    if (integrationConfigForm) {
        integrationConfigForm.addEventListener('submit', saveIntegrationConfiguration);
    }

    const documentationSearchForm = document.getElementById('documentationSearchForm');
    if (documentationSearchForm) {
        documentationSearchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            searchDocumentationArticles();
        });
    }
    const documentationSearchInput = document.getElementById('documentationSearchInput');
    if (documentationSearchInput) {
        documentationSearchInput.addEventListener('input', function() {
            renderDocumentationSearchResults(documentationSearchInput.value || '');
        });
    }
    
    // New request form
    var newRequestForm = document.getElementById('newRequestForm');
    if (newRequestForm) newRequestForm.addEventListener('submit', handleNewRequest);
    
    // Close modal on overlay click
    var modalOverlay = document.getElementById('modalOverlay');
    if (modalOverlay) modalOverlay.addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal();
        }
    });
    
    // Prevent modal from closing when clicking inside modal content
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });
    
    // Close modals with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
    
    // Setup form handlers after DOM loads
    setTimeout(() => {
        const requestForOthersForm = document.getElementById('requestForOthersForm');
        if (requestForOthersForm) {
            requestForOthersForm.addEventListener('submit', handleRequestForOthers);
        }
        
        const manualOnboardForm = document.getElementById('manualOnboardForm');
        if (manualOnboardForm) {
            manualOnboardForm.addEventListener('submit', handleManualOnboard);
        }
        
        const appRequestForm = document.getElementById('appRequestForm');
        if (appRequestForm) {
            appRequestForm.addEventListener('submit', handleAppRequest);
            
            const appTypeSelect = document.getElementById('appType');
            if (appTypeSelect) {
                appTypeSelect.addEventListener('change', updateSpecificAppOptions);
            }
        }
    }, 100);

    startIstClock();
    loadPublicSettings();
}

// Login Flow Functions
function hideAllLoginViews() {
    ['bootstrapSetupView', 'bootstrapVerifyView', 'emailOTPView', 'passwordLoginView'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function clearLoginFormState() {
    const loginFields = [
        'username',
        'password',
        'passwordMfaCode',
        'bootstrapMfaCode',
        'bootstrapPassword',
        'bootstrapPasswordConfirm'
    ];
    loginFields.forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const passwordForm = document.getElementById('usernamePasswordForm');
    if (passwordForm) passwordForm.reset();
}

function showBootstrapSetupView(status) {
    hideAllLoginViews();
    const view = document.getElementById('bootstrapSetupView');
    if (view) view.style.display = 'block';
    const emailInput = document.getElementById('bootstrapEmail');
    if (emailInput) {
        const pendingEmail = String((bootstrapState && bootstrapState.email) || '').trim();
        emailInput.value = pendingEmail;
    }
    const passwordInput = document.getElementById('bootstrapPassword');
    const confirmInput = document.getElementById('bootstrapPasswordConfirm');
    if (passwordInput) passwordInput.value = '';
    if (confirmInput) confirmInput.value = '';
    setLoginStatus('', 'info');
}

function showBootstrapVerifyView(data) {
    hideAllLoginViews();
    const view = document.getElementById('bootstrapVerifyView');
    if (view) view.style.display = 'block';
    const qr = document.getElementById('bootstrapQrCode');
    const qrFallback = document.getElementById('bootstrapQrFallback');
    const secret = document.getElementById('bootstrapTotpSecret');
    const email = document.getElementById('bootstrapVerifyEmail');
    const provisioningUri = document.getElementById('bootstrapProvisioningUri');
    const code = document.getElementById('bootstrapMfaCode');
    const qrCodeDataUri = (data && data.qr_code_data_uri) || '';
    if (qr) {
        qr.src = qrCodeDataUri;
        qr.style.display = qrCodeDataUri ? 'block' : 'none';
    }
    if (qrFallback) qrFallback.style.display = qrCodeDataUri ? 'none' : 'block';
    if (secret) secret.textContent = (data && data.totp_secret) || '';
    if (email) email.textContent = (data && data.email) || '';
    if (provisioningUri) provisioningUri.textContent = (data && data.provisioning_uri) || '';
    if (code) code.value = '';
}

function showDefaultLogin() {
    clearSessionRestorePending();
    clearAppBootPending();
    hideAllLoginViews();
    clearLoginFormState();
    const defaultView = document.getElementById('emailOTPView');
    if (defaultView) defaultView.style.display = 'block';
    updateBreakGlassEntryVisibility();
    setLoginStatus('', 'info');
}

function showSSOLogin() {
    setLoginStatus('Redirecting to your identity provider...', 'info');
    var apiBase = typeof getApiBase === 'function' ? getApiBase() : (window.API_BASE || (window.location.origin + '/api'));
    window.location.href = apiBase + '/login';
}

function showUsernamePasswordLogin() {
    if (!shouldShowBreakGlassEntry()) {
        setLoginStatus('Break-glass login is restricted. Use the dedicated recovery entry path from an allowed network.', 'error');
        showDefaultLogin();
        return;
    }
    hideAllLoginViews();
    clearLoginFormState();
    const passwordView = document.getElementById('passwordLoginView');
    if (passwordView) passwordView.style.display = 'block';
    setLoginStatus('', 'info');
}

// Authentication
function handleLogin(e) {
    e.preventDefault();
    showUsernamePasswordLogin();
}

async function logout() {
    try {
        const base = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE.replace(/\/+$/, '') : '/api';
        const csrfToken = getCsrfToken();
        const headers = {};
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
        await fetch(base + '/auth/logout', {
            method: 'POST',
            credentials: 'include',
            headers: headers
        });
    } catch (_) {
        // Clear client state even when the backend logout call fails.
    }
    clearStoredAuthState();
    if (notificationsRefreshTimer) {
        window.clearInterval(notificationsRefreshTimer);
        notificationsRefreshTimer = null;
    }
    clearAnnouncementRibbonTimer();
    announcementRibbonIndex = 0;
    clearSessionRestorePending();
    clearAppBootPending();
    document.body.classList.add('login-page');
    document.body.classList.remove('user-is-admin');
    var loginPage = document.getElementById('loginPage');
    var mainApp = document.getElementById('mainApp');
    if (loginPage) loginPage.style.display = 'block';
    if (mainApp) mainApp.style.display = 'none';
    showDefaultLogin();
    var menu = document.getElementById('profileMenu');
    if (menu) menu.classList.remove('show');
    if (typeof history !== 'undefined' && typeof history.replaceState === 'function') {
        history.replaceState({}, '', '/');
    }
}

function showMainApp() {
    clearSessionRestorePending();
    clearAppBootPending();
    document.body.classList.remove('login-page');
    const loginPage = document.getElementById('loginPage');
    const mainApp = document.getElementById('mainApp');
    if (loginPage) loginPage.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';
    
    var active = document.querySelector('#mainApp .page.active');
    document.body.setAttribute('data-page', active ? active.id.replace('Page','') : 'dashboard');
    
    // Load admin status from storage
    isAdmin = hasFullAdminControls();
    
    // Set current user from storage
    const userEmail = localStorage.getItem('userEmail');
    const storedUserName = (localStorage.getItem('userName') || '').trim();
    if (userEmail) {
        currentUser = {
            email: userEmail,
            name: storedUserName || userEmail.split('@')[0],
            isAdmin: isAdmin
        };
    }

    // SSO fallback: recover email/display name/admin from active SAML session when storage is incomplete.
    if ((localStorage.getItem('loginMethod') || '') === 'sso') {
        if (!userEmail || !storedUserName || storedUserName.toLowerCase() === 'user') {
            syncSsoProfileFromSession();
        }
    }
    
    // User portal: skip admin-specific setup
    if (window.USER_PORTAL) {
        if (typeof primeCoreCollections === 'function') primeCoreCollections(false);
        if (typeof loadRequestsPage === 'function') loadRequestsPage();
        return;
    }
    
    // Update UI based on admin status (run twice to ensure it applies after DOM ready)
    updateUIForRole();
    setTimeout(updateUIForRole, 150);
    loadPublicSettings();
    loadUserNotifications().catch(function(err) {
        console.warn('Failed to load notifications:', err);
    });
    if (notificationsRefreshTimer) {
        window.clearInterval(notificationsRefreshTimer);
    }
    notificationsRefreshTimer = window.setInterval(function() {
        loadUserNotifications().catch(function() {});
    }, 120000);
    if (hasFullAdminControls() && typeof loadFeatureToggles === 'function') {
        loadFeatureToggles();
    } else if (typeof refreshFeaturesFromServer === 'function') {
        refreshFeaturesFromServer();
    } else {
        setTimeout(function() {
            if (hasFullAdminControls() && typeof loadFeatureToggles === 'function') loadFeatureToggles();
            else if (typeof refreshFeaturesFromServer === 'function') refreshFeaturesFromServer();
        }, 300);
    }
    setTimeout(function() {
        if (typeof applyRoleRouteLanding === 'function') applyRoleRouteLanding();
    }, 50);

    // Load initial data
    primeCoreCollections(false);
    if (!canAccessAdminConsole()) {
        loadHomeSummary();
    }
    if (document.getElementById('activeSessionsCount')) updateDashboard();
    
    // Load policy settings for admin toggles
    if (hasFullAdminControls() && typeof loadPolicySettings === 'function') {
        loadPolicySettings();
    }
}

function isPageEnabledByFeatureFlags(pageId) {
    if (typeof window.isPageAllowedByFeatures === 'function') {
        try {
            return window.isPageAllowedByFeatures(pageId);
        } catch (_) {
            return true;
        }
    }
    return true;
}

function applyPamCapabilityVisibility() {
    const navMap = {
        navItemHome: 'home.view',
        navItemRequests: 'requests.view',
        navItemSessions: 'sessions.view',
        navItemTickets: 'tickets.view',
        navItemAws: 'cloud.aws.view',
        navItemGcp: 'cloud.gcp.view',
        navItemInstances: 'workloads.instances.view',
        navItemGcpVms: 'workloads.gcp_vms.view',
        navItemS3: 'storage.s3.view',
        navItemGcs: 'storage.gcs.view',
        navItemDatabasesStructured: 'databases.request.view',
        navItemDatabaseTerminal: 'terminal.database.view',
        navItemVmTerminal: 'terminal.vm.view'
    };
    Object.keys(navMap).forEach(function(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = hasPamCapability(navMap[id]) ? '' : 'none';
    });

    const adminButtonMap = {
        users: 'admin.users.view',
        identityCenter: 'admin.identity_center.view',
        policies: 'admin.management.view',
        security: 'admin.security.view',
        integrations: 'admin.integrations.view',
        trends: 'admin.console.view',
        databaseSessions: 'admin.database_sessions.view',
        feedback: 'admin.feedback.view'
    };
    document.querySelectorAll('.admin-tab-btn').forEach(function(btn) {
        const onclick = String(btn.getAttribute('onclick') || '');
        const match = onclick.match(/showAdminTab\('([^']+)'/);
        const tabId = match ? match[1] : '';
        const visible = canAccessAdminConsole() && (!tabId || hasPamCapability(adminButtonMap[tabId] || ''));
        btn.style.setProperty('display', visible ? 'inline-flex' : 'none', 'important');
    });

    const subtabMap = {
        usersSubTab: 'admin.users.pam_admins.manage',
        groupsSubTab: 'admin.users.groups.manage',
        rolesSubTab: 'admin.users.individuals.manage',
        individualUsersSubTab: 'admin.users.individuals.manage',
        policiesSubTab: 'admin.management.policies.view',
        approvalWorkflowSubTab: 'admin.management.approval_workflows.manage',
        pendingApprovalsSubTab: 'admin.management.approval_workflows.manage',
        ticketsManagementSubTab: 'admin.integrations.ticketing.manage',
        featuresSubTab: 'admin.management.features.manage',
        securitySubTab: 'admin.security.settings.manage',
        iamSubTab: 'admin.security.iam_roles.manage',
        guardrailsSubTab: 'admin.security.guardrails.manage',
        dbUsersSubTab: 'admin.db_governance.view',
        auditSubTab: 'admin.security.audit.view',
        awsIdcUsersSubTab: 'admin.identity_center.users.view',
        awsIdcGroupsSubTab: 'admin.identity_center.groups.view',
        awsIdcPermissionSetsSubTab: 'admin.identity_center.permission_sets.view',
        awsIdcOrgSubTab: 'admin.identity_center.organization.view',
        intCloudSubTab: 'admin.integrations.cloud.manage',
        intVaultDbSubTab: 'admin.integrations.cloud.manage',
        intTicketingSubTab: 'admin.integrations.ticketing.manage',
        intDocumentationSubTab: 'admin.integrations.ticketing.manage',
        intSiemSubTab: 'admin.integrations.siem.manage',
        intIgpSubTab: 'admin.integrations.igp.manage'
    };
    Object.keys(subtabMap).forEach(function(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = hasPamCapability(subtabMap[id]) ? '' : 'none';
    });
}

function updateUIForRole() {
    const role = currentPamRole();
    const canAdminConsole = canAccessAdminConsole();
    const fullAdmin = hasFullAdminControls();
    const activePageEl = document.querySelector('.page.active');
    const activePageId = activePageEl ? String(activePageEl.id || '').replace(/Page$/, '') : '';
    const requestedPageId = routePageFromHash() || activePageId;
    if (activePageId && capabilityForPage(activePageId) && !hasPamCapability(capabilityForPage(activePageId))) {
        window.setTimeout(function() {
            if (typeof showPage === 'function') showPage(firstAccessiblePage());
        }, 0);
    }
    isAdmin = fullAdmin;
    var rawName = localStorage.getItem('userName') || (currentUser && currentUser.name) || (localStorage.getItem('userEmail') || '').split('@')[0].replace(/\./g, ' ') || 'User';
    const storedEmail = (localStorage.getItem('userEmail') || '').trim();
    if (rawName === 'Email' || storedEmail === 'Email') rawName = 'User';
    if (!rawName || String(rawName).trim().toLowerCase() === 'user') {
        const derived = deriveNameFromEmail(storedEmail);
        if (derived) rawName = derived;
    }
    const displayName = rawName || 'User';
    const userNameEl = document.getElementById('userNameDisplay');
    const legacyUserNameEl = document.getElementById('userName');
    if (userNameEl || legacyUserNameEl) {
        var safe = String(displayName).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        let html = 'EMP-' + safe;
        if (role === 'Engineer') {
            html = 'ENG-' + safe;
        } else if (role === 'Admin' || role === 'SuperAdmin') {
            html = '<i class="fas fa-crown profile-crown-icon" title="' + role + '"></i> ' + safe;
        }
        if (userNameEl) userNameEl.innerHTML = html;
        if (legacyUserNameEl) legacyUserNameEl.innerHTML = html;
    }
    var directOnlyWrap = document.getElementById('profileDirectOnlyWrap');
    var loginMethod = localStorage.getItem('loginMethod') || '';
    if (directOnlyWrap) directOnlyWrap.style.display = (loginMethod === 'break_glass') ? 'block' : 'none';
    
    // Directly show/hide admin-only elements via inline styles (reliable, bypasses CSS cache)
    document.querySelectorAll('.admin-only-nav').forEach(function(el) {
        if (canAdminConsole) {
            var disp = el.classList.contains('nav-item') ? 'flex' : el.classList.contains('nav-category') ? 'block' : 'inline-flex';
            el.style.setProperty('display', disp, 'important');
        } else {
            el.style.setProperty('display', 'none', 'important');
        }
    });
    if (canAdminConsole) {
        document.body.classList.add('user-is-admin');
        addAdminNavigation();
        if (!requestedPageId) {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            const dashPage = document.getElementById('dashboardPage');
            if (dashPage) dashPage.classList.add('active');
            document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
            const dashNav = document.querySelector('.sidebar-nav .nav-item[onclick*="dashboard"]');
            if (dashNav) dashNav.classList.add('active');
        }
    } else {
        document.body.classList.remove('user-is-admin');
        const shouldForceHome = !requestedPageId || requestedPageId === 'admin' || requestedPageId === 'dashboard';
        if (shouldForceHome) {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            const homePage = document.getElementById('homePage');
            if (homePage) homePage.classList.add('active');
            document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
            const homeNav = document.getElementById('navItemHome');
            if (homeNav) homeNav.classList.add('active');
            currentRequestsCategory = 'cloud';
            currentRequestsStatus = 'pending';
            currentFilter = 'pending';
            document.querySelectorAll('.requests-status-btn').forEach(b => {
                b.classList.remove('requests-status-glow');
                if (b.dataset.category === 'cloud' && b.dataset.status === 'pending') b.classList.add('requests-status-glow');
            });
            if (typeof loadHomeSummary === 'function') loadHomeSummary();
        }
    }

    if (typeof applyFeatureVisibility === 'function') {
        try {
            const flags = (typeof getCurrentFeatures === 'function') ? getCurrentFeatures() : null;
            applyFeatureVisibility(flags, { syncControls: false });
        } catch (_) {}
    }
    applyPamCapabilityVisibility();
}

function addAdminNavigation() {
    if (window.USER_PORTAL) return;
    const nav = document.querySelector('.app-nav');
    const existing = document.getElementById('adminNav');
    if (existing && !canAccessAdminConsole()) {
        existing.remove();
        return;
    }
    if (nav && !existing && canAccessAdminConsole()) {
        const adminBtn = document.createElement('button');
        adminBtn.id = 'adminNav';
        adminBtn.className = 'nav-btn';
        adminBtn.innerHTML = '<i class="fas fa-cog"></i> Admin';
        adminBtn.onclick = () => showPage('admin');
        nav.appendChild(adminBtn);
    }
}

function toggleSidebar(e) {
    if (e) e.stopPropagation();
    const layout = document.querySelector('.app-layout');
    const sidebar = document.getElementById('mainSidebar');
    const toggle = document.getElementById('sidebarToggle');
    const expandFab = document.getElementById('sidebarExpandFab');
    const main = document.querySelector('.app-main');
    const container = document.querySelector('.app-container');
    if (!sidebar || !toggle) return;
    const collapsed = !layout.classList.contains('sidebar-collapsed');
    layout.classList.toggle('sidebar-collapsed', collapsed);
    sidebar.classList.toggle('sidebar-collapsed', collapsed);
    if (main) main.classList.toggle('main-expanded', collapsed);
    if (container) container.classList.toggle('sidebar-collapsed', collapsed);
    toggle.title = collapsed ? 'Show sidebar' : 'Hide sidebar';
    const icon = document.getElementById('sidebarToggleIcon');
    const label = document.getElementById('sidebarToggleLabel');
    if (icon) icon.className = collapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
    if (label) label.textContent = collapsed ? 'Show Menu' : 'Hide Menu';
    if (expandFab) expandFab.style.display = collapsed ? 'flex' : 'none';
    localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
}

document.addEventListener('DOMContentLoaded', function() {
    clearLoginFormState();
    const collapsed = localStorage.getItem('sidebarCollapsed') === '1';
    const layout = document.querySelector('.app-layout');
    const sidebar = document.getElementById('mainSidebar');
    const toggle = document.getElementById('sidebarToggle');
    const expandFab = document.getElementById('sidebarExpandFab');
    const main = document.querySelector('.app-main');
    const container = document.querySelector('.app-container');
    if (collapsed && layout && sidebar && main) {
        layout.classList.add('sidebar-collapsed');
        sidebar.classList.add('sidebar-collapsed');
        main.classList.add('main-expanded');
        if (container) container.classList.add('sidebar-collapsed');
        if (toggle) toggle.title = 'Show sidebar';
        if (expandFab) expandFab.style.display = 'flex';
        var icon = document.getElementById('sidebarToggleIcon');
        var label = document.getElementById('sidebarToggleLabel');
        if (icon) icon.className = 'fas fa-chevron-right';
        if (label) label.textContent = 'Show Menu';
    }
});

window.addEventListener('pageshow', function() {
    clearLoginFormState();
});

// Theme Management
function toggleTheme() {
    var actualTheme = document.documentElement.getAttribute('data-theme') || 'light';
    var newTheme = actualTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    // Update theme buttons
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.remove('active');
        if (btn.onclick.toString().includes(theme)) {
            btn.classList.add('active');
        }
    });
    
    // Update theme toggle icon
    const themeIcon = document.querySelector('#themeToggleBtn i');
    if (themeIcon) {
        themeIcon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
}

function startIstClock() {
    updateIstClock();
    if (window.__npamIstClockStarted) return;
    window.__npamIstClockStarted = true;
    window.setInterval(updateIstClock, 1000);
}

function updateIstClock() {
    const el = document.getElementById('istClock');
    if (!el) return;
    const now = new Date();
    el.textContent = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(now) + ' IST';
}

function normalizeSettingsPayload(data) {
    const source = (data && data.settings) ? data.settings : (data || {});
    return {
        app_base_url: String(source.app_base_url || '').trim(),
        documentation_home_url: String(source.documentation_home_url || '').trim(),
        documentation_search_url: String(source.documentation_search_url || '').trim(),
        documentation_articles: Array.isArray(source.documentation_articles) ? source.documentation_articles.map(function(item) {
            return {
                id: String((item && item.id) || '').trim(),
                title: String((item && item.title) || '').trim(),
                url: String((item && item.url) || '').trim(),
                keywords: Array.isArray(item && item.keywords) ? item.keywords.map(function(keyword) { return String(keyword || '').trim(); }).filter(Boolean) : []
            };
        }).filter(function(item) { return item.title && item.url; }) : [],
        support_email: String(source.support_email || '').trim(),
        break_glass_network_restricted: source.break_glass_network_restricted === true || String(source.break_glass_network_restricted || '').trim().toLowerCase() === 'true',
        break_glass_request_allowed: source.break_glass_request_allowed === true || String(source.break_glass_request_allowed || '').trim().toLowerCase() === 'true',
        saml_idp_metadata_configured: source.saml_idp_metadata_configured === true || String(source.saml_idp_metadata_configured || '').trim().toLowerCase() === 'true',
        saml_acs_url: String(source.saml_acs_url || '').trim(),
        saml_audience_url: String(source.saml_audience_url || '').trim(),
        idc_assume_role_arn: String(source.idc_assume_role_arn || '').trim(),
        idc_assume_role_session_name: String(source.idc_assume_role_session_name || 'npam-idc').trim() || 'npam-idc',
        resource_assume_role_arn: String(source.resource_assume_role_arn || '').trim(),
        resource_assume_role_name_template: String(source.resource_assume_role_name_template || '').trim(),
        resource_assume_role_session_name: String(source.resource_assume_role_session_name || 'npam-resource').trim() || 'npam-resource',
        db_connect_proxy_mappings: Array.isArray(source.db_connect_proxy_mappings)
            ? source.db_connect_proxy_mappings.map(function(item) {
                return {
                    account_id: String((item && item.account_id) || '').trim(),
                    account_name: String((item && (item.account_name || item.label)) || '').trim(),
                    proxy_host: String((item && (item.proxy_host || item.host)) || '').trim(),
                    proxy_port: String((item && (item.proxy_port || item.port)) || '').trim()
                };
            }).filter(function(item) { return item.account_id || item.account_name || item.proxy_host || item.proxy_port; })
            : [],
        db_connect_proxy_host_nonprod: String(source.db_connect_proxy_host_nonprod || '').trim(),
        db_connect_proxy_port_nonprod: String(source.db_connect_proxy_port_nonprod || '').trim(),
        db_connect_allow_direct_nonprod: source.db_connect_allow_direct_nonprod === true || String(source.db_connect_allow_direct_nonprod || '').trim().toLowerCase() === 'true',
        sns_notifications_enabled: source.sns_notifications_enabled === true || String(source.sns_notifications_enabled || '').trim().toLowerCase() === 'true',
        sns_topic_arn: String(source.sns_topic_arn || '').trim(),
        gmail_notifications_enabled: source.gmail_notifications_enabled === true || String(source.gmail_notifications_enabled || '').trim().toLowerCase() === 'true',
        gmail_sender_email: String(source.gmail_sender_email || '').trim(),
        gmail_sender_display_name: String(source.gmail_sender_display_name || 'NPAMx').trim() || 'NPAMx',
        gmail_workspace_domain: String(source.gmail_workspace_domain || '').trim(),
        gmail_workspace_admin_contact: String(source.gmail_workspace_admin_contact || '').trim(),
        gmail_project_id: String(source.gmail_project_id || '').trim(),
        gmail_oauth_client_id: String(source.gmail_oauth_client_id || '').trim(),
        gmail_client_secret_name: String(source.gmail_client_secret_name || '').trim(),
        gmail_refresh_token_secret_name: String(source.gmail_refresh_token_secret_name || '').trim(),
        notification_email_footer_note: String(source.notification_email_footer_note || 'Please do not reply to this email. For support, please contact Nykaa SecOps team.').trim(),
        notify_email_databases_access: source.notify_email_databases_access !== false && String(source.notify_email_databases_access || '').trim().toLowerCase() !== 'false',
        notify_email_cloud_access: source.notify_email_cloud_access !== false && String(source.notify_email_cloud_access || '').trim().toLowerCase() !== 'false',
        notify_email_storage_access: source.notify_email_storage_access !== false && String(source.notify_email_storage_access || '').trim().toLowerCase() !== 'false',
        notify_email_workloads_access: source.notify_email_workloads_access !== false && String(source.notify_email_workloads_access || '').trim().toLowerCase() !== 'false',
        notify_email_admin_activity: source.notify_email_admin_activity === true || String(source.notify_email_admin_activity || '').trim().toLowerCase() === 'true',
        notify_email_feedback_to_admins: source.notify_email_feedback_to_admins !== false && String(source.notify_email_feedback_to_admins || '').trim().toLowerCase() !== 'false',
        notify_email_feedback_updates_to_users: source.notify_email_feedback_updates_to_users !== false && String(source.notify_email_feedback_updates_to_users || '').trim().toLowerCase() !== 'false',
        feedback_admin_send_to_all: source.feedback_admin_send_to_all === true || String(source.feedback_admin_send_to_all || '').trim().toLowerCase() === 'true',
        feedback_admin_target_roles: Array.isArray(source.feedback_admin_target_roles) ? source.feedback_admin_target_roles.map(function(item) { return String(item || '').trim(); }).filter(Boolean) : ['Admin', 'SuperAdmin'],
        feedback_admin_target_group_ids: Array.isArray(source.feedback_admin_target_group_ids) ? source.feedback_admin_target_group_ids.map(function(item) { return String(item || '').trim(); }).filter(Boolean) : [],
        feedback_admin_direct_emails: Array.isArray(source.feedback_admin_direct_emails) ? source.feedback_admin_direct_emails.map(function(item) { return String(item || '').trim().toLowerCase(); }).filter(Boolean) : [],
        feedback_admin_cc_emails: Array.isArray(source.feedback_admin_cc_emails) ? source.feedback_admin_cc_emails.map(function(item) { return String(item || '').trim().toLowerCase(); }).filter(Boolean) : [],
        feedback_admin_bcc_emails: Array.isArray(source.feedback_admin_bcc_emails) ? source.feedback_admin_bcc_emails.map(function(item) { return String(item || '').trim().toLowerCase(); }).filter(Boolean) : [],
        db_user_audit_schedule_enabled: source.db_user_audit_schedule_enabled === true || String(source.db_user_audit_schedule_enabled || '').trim().toLowerCase() === 'true',
        db_user_audit_schedule_weekday: String(source.db_user_audit_schedule_weekday || 'Sun').trim() || 'Sun',
        db_user_audit_schedule_time_ist: String(source.db_user_audit_schedule_time_ist || '09:00').trim() || '09:00',
        db_user_audit_notify_on_red_flag: source.db_user_audit_notify_on_red_flag !== false && String(source.db_user_audit_notify_on_red_flag || '').trim().toLowerCase() !== 'false',
        notify_email_access_approval_reminders: source.notify_email_access_approval_reminders !== false && String(source.notify_email_access_approval_reminders || '').trim().toLowerCase() !== 'false',
        notify_email_access_ready_to_requestor: source.notify_email_access_ready_to_requestor !== false && String(source.notify_email_access_ready_to_requestor || '').trim().toLowerCase() !== 'false',
        jumpcloud_enabled: source.jumpcloud_enabled === true || String(source.jumpcloud_enabled || '').trim().toLowerCase() === 'true',
        jumpcloud_api_base_url: String(source.jumpcloud_api_base_url || 'https://console.jumpcloud.com/api').trim(),
        jumpcloud_api_key_secret_name: String(source.jumpcloud_api_key_secret_name || '').trim(),
        jumpcloud_user_lookup_field: String(source.jumpcloud_user_lookup_field || 'email').trim() || 'email',
        jumpcloud_manager_attribute_name: String(source.jumpcloud_manager_attribute_name || 'manager').trim() || 'manager',
        jumpcloud_department_attribute_name: String(source.jumpcloud_department_attribute_name || 'department').trim() || 'department',
        jumpcloud_job_title_attribute_name: String(source.jumpcloud_job_title_attribute_name || 'jobTitle').trim() || 'jobTitle',
        jumpcloud_sync_mode: String(source.jumpcloud_sync_mode || 'on_demand').trim() || 'on_demand',
        jumpcloud_directory_id: String(source.jumpcloud_directory_id || '').trim(),
        jumpcloud_admin_contact: String(source.jumpcloud_admin_contact || '').trim(),
        jira_enabled: source.jira_enabled === true || String(source.jira_enabled || '').trim().toLowerCase() === 'true',
        jira_base_url: String(source.jira_base_url || '').trim(),
        jira_project_key: String(source.jira_project_key || '').trim(),
        jira_user_email: String(source.jira_user_email || '').trim(),
        jira_api_token_secret_name: String(source.jira_api_token_secret_name || '').trim(),
        audit_logs_bucket: String(source.audit_logs_bucket || '').trim(),
        audit_logs_prefix: String(source.audit_logs_prefix || 'npamx/audit').trim(),
        audit_logs_auto_export: source.audit_logs_auto_export === true || String(source.audit_logs_auto_export || '').trim().toLowerCase() === 'true',
        request_approver_email_domain: String(source.request_approver_email_domain || 'nykaa.com').trim(),
        desktop_agent_enabled: source.desktop_agent_enabled === true || String(source.desktop_agent_enabled || '').trim().toLowerCase() === 'true',
        desktop_agent_auth_mode: String(source.desktop_agent_auth_mode || 'identity_center').trim() || 'identity_center',
        desktop_agent_shared_token: String(source.desktop_agent_shared_token || '').trim(),
        desktop_agent_token_configured: source.desktop_agent_token_configured === true || String(source.desktop_agent_token_configured || '').trim().toLowerCase() === 'true',
        desktop_agent_download_url_windows: String(source.desktop_agent_download_url_windows || '').trim(),
        desktop_agent_download_url_macos: String(source.desktop_agent_download_url_macos || '').trim(),
        desktop_agent_download_url_linux: String(source.desktop_agent_download_url_linux || '').trim(),
        desktop_agent_download_delivery: String(source.desktop_agent_download_delivery || 's3_proxy').trim() || 's3_proxy',
        desktop_agent_download_s3_bucket: String(source.desktop_agent_download_s3_bucket || '').trim(),
        desktop_agent_download_s3_region: String(source.desktop_agent_download_s3_region || '').trim(),
        desktop_agent_download_s3_key_windows: String(source.desktop_agent_download_s3_key_windows || '').trim(),
        desktop_agent_download_s3_key_macos: String(source.desktop_agent_download_s3_key_macos || '').trim(),
        desktop_agent_download_s3_key_linux: String(source.desktop_agent_download_s3_key_linux || '').trim(),
        desktop_agent_download_available_windows: source.desktop_agent_download_available_windows === true || String(source.desktop_agent_download_available_windows || '').trim().toLowerCase() === 'true',
        desktop_agent_download_available_macos: source.desktop_agent_download_available_macos === true || String(source.desktop_agent_download_available_macos || '').trim().toLowerCase() === 'true',
        desktop_agent_download_available_linux: source.desktop_agent_download_available_linux === true || String(source.desktop_agent_download_available_linux || '').trim().toLowerCase() === 'true',
        desktop_agent_network_scope: String(source.desktop_agent_network_scope || 'netskope').trim() || 'netskope',
        desktop_agent_heartbeat_ttl_seconds: Number.parseInt(source.desktop_agent_heartbeat_ttl_seconds, 10) || 180,
        desktop_agent_pairing_code_ttl_seconds: Number.parseInt(source.desktop_agent_pairing_code_ttl_seconds, 10) || 600,
        desktop_agent_pairing_poll_interval_seconds: Number.parseInt(source.desktop_agent_pairing_poll_interval_seconds, 10) || 5,
        desktop_agent_token_ttl_days: Number.parseInt(source.desktop_agent_token_ttl_days, 10) || 1,
        resource_role_mappings: Array.isArray(source.resource_role_mappings)
            ? source.resource_role_mappings.map(function(item) {
                return {
                    account_id: String((item && item.account_id) || '').trim(),
                    role_arn: String((item && item.role_arn) || '').trim(),
                    account_name: String((item && (item.account_name || item.label)) || '').trim()
                };
            }).filter(function(item) { return item.account_id || item.role_arn || item.account_name; })
            : []
    };
}

function applyRuntimeSettings() {
    const flags = (typeof getCurrentFeatures === 'function') ? getCurrentFeatures() : {};
    const documentationEnabled = flags.documentation_portal !== false;
    const supportEnabled = flags.support_portal !== false;
    const hasDocumentation = !!(appSettings.documentation_home_url || appSettings.documentation_search_url);
    const hasDocumentationCatalog = Array.isArray(appSettings.documentation_articles) && appSettings.documentation_articles.length > 0;
    const hasDocumentationConfig = hasDocumentation || hasDocumentationCatalog;
    const hasSupport = !!appSettings.support_email;

    const documentationBtn = document.getElementById('documentationHeaderBtn');
    const supportBtn = document.getElementById('supportHeaderBtn');
    if (documentationBtn) {
        documentationBtn.style.display = documentationEnabled ? 'inline-flex' : 'none';
    }
    if (supportBtn) {
        supportBtn.style.display = supportEnabled ? 'inline-flex' : 'none';
    }

    const confluenceStatus = document.getElementById('confluenceIntegrationStatus');
    const confluenceAction = document.getElementById('confluenceIntegrationAction');
    const documentationCatalogStatus = document.getElementById('documentationCatalogStatus');
    const documentationCatalogAction = document.getElementById('documentationCatalogAction');
    if (confluenceStatus) {
        confluenceStatus.className = hasDocumentationConfig ? 'integration-status connected' : 'integration-status disconnected';
        confluenceStatus.innerHTML = hasDocumentationConfig
            ? '<i class="fas fa-check-circle"></i> Configured'
            : '<i class="fas fa-times-circle"></i> Not Configured';
    }
    if (confluenceAction) {
        confluenceAction.className = hasDocumentationConfig ? 'btn-secondary btn-pam btn-sm' : 'btn-primary btn-pam btn-sm';
        confluenceAction.innerHTML = hasDocumentationConfig
            ? '<i class="fas fa-cog"></i> Configure'
            : '<i class="fas fa-plug"></i> Configure';
    }
    if (documentationCatalogStatus) {
        documentationCatalogStatus.className = hasDocumentationConfig ? 'integration-status connected' : 'integration-status disconnected';
        documentationCatalogStatus.innerHTML = hasDocumentationConfig
            ? '<i class="fas fa-check-circle"></i> Catalog Ready'
            : '<i class="fas fa-times-circle"></i> Not Configured';
    }
    if (documentationCatalogAction) {
        documentationCatalogAction.className = hasDocumentationConfig ? 'btn-secondary btn-pam btn-sm' : 'btn-primary btn-pam btn-sm';
        documentationCatalogAction.innerHTML = hasDocumentationConfig
            ? '<i class="fas fa-cog"></i> Configure Articles'
            : '<i class="fas fa-plug"></i> Configure Articles';
    }

    const supportStatus = document.getElementById('supportIntegrationStatus');
    const supportAction = document.getElementById('supportIntegrationAction');
    if (supportStatus) {
        supportStatus.className = hasSupport ? 'integration-status connected' : 'integration-status disconnected';
        supportStatus.innerHTML = hasSupport
            ? '<i class="fas fa-check-circle"></i> Configured'
            : '<i class="fas fa-times-circle"></i> Not Configured';
    }
    if (supportAction) {
        supportAction.className = hasSupport ? 'btn-secondary btn-pam btn-sm' : 'btn-primary btn-pam btn-sm';
        supportAction.innerHTML = hasSupport
            ? '<i class="fas fa-cog"></i> Configure'
            : '<i class="fas fa-plug"></i> Configure';
    }

    const awsConfigured = !!(
        appSettings.idc_assume_role_arn ||
        appSettings.resource_assume_role_arn ||
        appSettings.resource_assume_role_name_template ||
        (appSettings.resource_role_mappings || []).length
    );
    const dbConnectionTestReady = !!awsConfigured;
    const rdsProxyConfigured = !!((appSettings.db_connect_proxy_mappings || []).length || appSettings.db_connect_proxy_host_nonprod);
    const snsConfigured = !!(appSettings.sns_notifications_enabled && appSettings.sns_topic_arn);
    const gmailConfigured = !!(
        appSettings.gmail_notifications_enabled &&
        appSettings.gmail_sender_email &&
        appSettings.gmail_project_id &&
        appSettings.gmail_oauth_client_id &&
        appSettings.gmail_client_secret_name &&
        appSettings.gmail_refresh_token_secret_name
    );
    const jumpcloudConfigured = !!(
        appSettings.jumpcloud_enabled &&
        appSettings.jumpcloud_api_base_url &&
        appSettings.jumpcloud_api_key_secret_name
    );
    const jiraConfigured = !!(
        appSettings.jira_enabled &&
        appSettings.jira_base_url &&
        appSettings.jira_project_key &&
        appSettings.jira_user_email &&
        appSettings.jira_api_token_secret_name
    );
    const auditExportConfigured = !!(appSettings.audit_logs_bucket && appSettings.audit_logs_prefix);
    const ssoConfigured = !!(appSettings.app_base_url && appSettings.saml_idp_metadata_configured);
    const awsCards = [
        document.getElementById('awsAdminIntegrationStatus'),
        document.getElementById('awsCloudIntegrationStatus')
    ].filter(Boolean);
    awsCards.forEach(function(el) {
        el.className = awsConfigured ? 'integration-status connected' : 'integration-status disconnected';
        el.innerHTML = awsConfigured
            ? '<i class="fas fa-check-circle"></i> Configured'
            : '<i class="fas fa-times-circle"></i> Not Configured';
    });
    const awsActions = [
        document.getElementById('awsAdminIntegrationAction'),
        document.getElementById('awsCloudIntegrationAction')
    ].filter(Boolean);
    awsActions.forEach(function(el) {
        el.className = awsConfigured ? 'btn-secondary btn-pam btn-sm' : 'btn-primary btn-pam btn-sm';
        el.innerHTML = awsConfigured
            ? '<i class="fas fa-cog"></i> Configure'
            : '<i class="fas fa-plug"></i> Configure';
    });

    const rdsProxyCards = [
        document.getElementById('rdsProxyAdminIntegrationStatus'),
        document.getElementById('rdsProxyCloudIntegrationStatus')
    ].filter(Boolean);
    rdsProxyCards.forEach(function(el) {
        el.className = rdsProxyConfigured ? 'integration-status connected' : 'integration-status disconnected';
        el.innerHTML = rdsProxyConfigured
            ? '<i class="fas fa-check-circle"></i> Configured'
            : '<i class="fas fa-times-circle"></i> Not Configured';
    });
    const rdsProxyActions = [
        document.getElementById('rdsProxyAdminIntegrationAction'),
        document.getElementById('rdsProxyCloudIntegrationAction')
    ].filter(Boolean);
    rdsProxyActions.forEach(function(el) {
        el.className = rdsProxyConfigured ? 'btn-secondary btn-pam btn-sm' : 'btn-primary btn-pam btn-sm';
        el.innerHTML = rdsProxyConfigured
            ? '<i class="fas fa-cog"></i> Configure'
            : '<i class="fas fa-plug"></i> Configure';
    });

    const dbConnectionPushStatus = document.getElementById('dbConnectionPushIntegrationStatus');
    const dbConnectionPushAction = document.getElementById('dbConnectionPushIntegrationAction');
    if (dbConnectionPushStatus) {
        dbConnectionPushStatus.className = dbConnectionTestReady ? 'integration-status connected' : 'integration-status disconnected';
        dbConnectionPushStatus.innerHTML = dbConnectionTestReady
            ? '<i class="fas fa-check-circle"></i> Ready'
            : '<i class="fas fa-times-circle"></i> Needs AWS setup';
    }
    if (dbConnectionPushAction) {
        dbConnectionPushAction.className = dbConnectionTestReady ? 'btn-secondary btn-pam btn-sm' : 'btn-primary btn-pam btn-sm';
        dbConnectionPushAction.innerHTML = dbConnectionTestReady
            ? '<i class="fas fa-cloud-upload-alt"></i> Open Push Console'
            : '<i class="fas fa-cloud-upload-alt"></i> Open Push Console';
    }

    const desktopAgentEnabled = !!appSettings.desktop_agent_enabled;
    const desktopAgentAuthMode = String(appSettings.desktop_agent_auth_mode || 'identity_center').trim().toLowerCase() || 'identity_center';
    const desktopAgentTokenConfigured = !!appSettings.desktop_agent_token_configured || !!appSettings.desktop_agent_shared_token;
    const desktopAgentConnected = Number((desktopAgentRuntimeStatus && desktopAgentRuntimeStatus.agents_connected) || 0);
    const desktopAgentLatestError = String((desktopAgentRuntimeStatus && desktopAgentRuntimeStatus.latest_error) || '').trim();
    const desktopAgentStatus = document.getElementById('desktopAgentIntegrationStatus');
    const desktopAgentAction = document.getElementById('desktopAgentIntegrationAction');
    if (desktopAgentStatus) {
        let statusHtml = '<i class="fas fa-times-circle"></i> Not Configured';
        let statusClass = 'integration-status disconnected';
        if (desktopAgentEnabled && desktopAgentTokenConfigured && desktopAgentConnected > 0) {
            statusClass = 'integration-status connected';
            statusHtml = '<i class="fas fa-check-circle"></i> Connected • ' + escapeHtml(String(desktopAgentConnected)) + ' active';
        } else if (desktopAgentEnabled && desktopAgentTokenConfigured && desktopAgentLatestError) {
            statusClass = 'integration-status disconnected';
            statusHtml = '<i class="fas fa-triangle-exclamation"></i> Failed • ' + escapeHtml(desktopAgentLatestError.slice(0, 60));
        } else if (desktopAgentEnabled && desktopAgentTokenConfigured) {
            statusClass = 'integration-status disconnected';
            statusHtml = '<i class="fas fa-clock"></i> Waiting for heartbeat';
        } else if (desktopAgentEnabled && desktopAgentAuthMode === 'shared_token') {
            statusClass = 'integration-status disconnected';
            statusHtml = '<i class="fas fa-key"></i> Token missing';
        } else if (desktopAgentEnabled) {
            statusClass = 'integration-status disconnected';
            statusHtml = '<i class="fas fa-clock"></i> Waiting for agent pairing';
        }
        desktopAgentStatus.className = statusClass;
        desktopAgentStatus.innerHTML = statusHtml;
    }
    if (desktopAgentAction) {
        const configured = desktopAgentEnabled && desktopAgentTokenConfigured;
        desktopAgentAction.className = configured ? 'btn-secondary btn-pam btn-sm' : 'btn-primary btn-pam btn-sm';
        desktopAgentAction.innerHTML = configured
            ? '<i class="fas fa-cog"></i> Configure'
            : '<i class="fas fa-plug"></i> Configure';
    }
    renderDesktopAgentUserPanel();

    const snsStatus = document.getElementById('snsIntegrationStatus');
    const snsAction = document.getElementById('snsIntegrationAction');
    if (snsStatus) {
        snsStatus.className = snsConfigured ? 'integration-status connected' : 'integration-status disconnected';
        snsStatus.innerHTML = snsConfigured
            ? '<i class="fas fa-check-circle"></i> Configured'
            : '<i class="fas fa-times-circle"></i> Not Configured';
    }
    if (snsAction) {
        snsAction.className = snsConfigured ? 'btn-secondary btn-pam btn-sm' : 'btn-primary btn-pam btn-sm';
        snsAction.innerHTML = snsConfigured
            ? '<i class="fas fa-cog"></i> Configure'
            : '<i class="fas fa-plug"></i> Configure';
    }

    const gmailStatus = document.getElementById('gmailIntegrationStatus');
    const gmailAction = document.getElementById('gmailIntegrationAction');
    if (gmailStatus) {
        gmailStatus.className = gmailConfigured ? 'integration-status connected' : 'integration-status disconnected';
        gmailStatus.innerHTML = gmailConfigured
            ? '<i class="fas fa-check-circle"></i> Configured'
            : '<i class="fas fa-times-circle"></i> Not Configured';
    }
    if (gmailAction) {
        gmailAction.className = gmailConfigured ? 'btn-secondary btn-pam btn-sm' : 'btn-primary btn-pam btn-sm';
        gmailAction.innerHTML = gmailConfigured
            ? '<i class="fas fa-cog"></i> Configure'
            : '<i class="fas fa-plug"></i> Configure';
    }

    const jumpcloudStatus = document.getElementById('jumpcloudIntegrationStatus');
    const jumpcloudAction = document.getElementById('jumpcloudIntegrationAction');
    if (jumpcloudStatus) {
        jumpcloudStatus.className = jumpcloudConfigured ? 'integration-status connected' : 'integration-status disconnected';
        jumpcloudStatus.innerHTML = jumpcloudConfigured
            ? '<i class="fas fa-check-circle"></i> Configured'
            : '<i class="fas fa-times-circle"></i> Not Configured';
    }
    if (jumpcloudAction) {
        jumpcloudAction.className = jumpcloudConfigured ? 'btn-secondary btn-pam btn-sm' : 'btn-primary btn-pam btn-sm';
        jumpcloudAction.innerHTML = jumpcloudConfigured
            ? '<i class="fas fa-cog"></i> Configure'
            : '<i class="fas fa-plug"></i> Configure';
    }

    const jiraStatus = document.getElementById('jiraIntegrationStatus');
    const jiraAction = document.getElementById('jiraIntegrationAction');
    if (jiraStatus) {
        jiraStatus.className = jiraConfigured ? 'integration-status connected' : 'integration-status disconnected';
        jiraStatus.innerHTML = jiraConfigured
            ? '<i class="fas fa-check-circle"></i> Configured'
            : '<i class="fas fa-times-circle"></i> Not Configured';
    }
    if (jiraAction) {
        jiraAction.className = jiraConfigured ? 'btn-secondary btn-pam btn-sm' : 'btn-primary btn-pam btn-sm';
        jiraAction.innerHTML = jiraConfigured
            ? '<i class="fas fa-cog"></i> Configure'
            : '<i class="fas fa-plug"></i> Configure';
    }

    const ssoStatus = document.getElementById('identityCenterLoginIntegrationStatus');
    const ssoAction = document.getElementById('identityCenterLoginIntegrationAction');
    if (ssoStatus) {
        ssoStatus.className = ssoConfigured ? 'integration-status connected' : 'integration-status disconnected';
        ssoStatus.innerHTML = ssoConfigured
            ? '<i class="fas fa-check-circle"></i> Configured'
            : '<i class="fas fa-times-circle"></i> Not Configured';
    }
    if (ssoAction) {
        ssoAction.className = ssoConfigured ? 'btn-secondary btn-pam btn-sm' : 'btn-primary btn-pam btn-sm';
        ssoAction.innerHTML = ssoConfigured
            ? '<i class="fas fa-cog"></i> Configure'
            : '<i class="fas fa-plug"></i> Configure';
    }

    const auditExportStatuses = [
        document.getElementById('auditExportIntegrationStatus'),
        document.getElementById('auditExportSiemIntegrationStatus'),
        document.getElementById('auditArchiveAdminIntegrationStatus'),
    ].filter(Boolean);
    const auditExportActions = [
        document.getElementById('auditExportIntegrationAction'),
        document.getElementById('auditExportSiemIntegrationAction'),
        document.getElementById('auditArchiveAdminIntegrationAction'),
    ].filter(Boolean);
    auditExportStatuses.forEach(function(el) {
        el.className = auditExportConfigured ? 'integration-status connected' : 'integration-status disconnected';
        el.innerHTML = auditExportConfigured
            ? '<i class="fas fa-check-circle"></i> Configured'
            : '<i class="fas fa-times-circle"></i> Not Configured';
    });
    auditExportActions.forEach(function(el) {
        el.className = auditExportConfigured ? 'btn-secondary btn-pam btn-sm' : 'btn-primary btn-pam btn-sm';
        el.innerHTML = auditExportConfigured
            ? '<i class="fas fa-cog"></i> Configure'
            : '<i class="fas fa-plug"></i> Configure';
    });
    const auditExportPanelStatus = document.getElementById('auditExportSiemPanelStatus');
    if (auditExportPanelStatus) {
        auditExportPanelStatus.className = auditExportConfigured ? 'integration-status connected' : 'integration-status disconnected';
        auditExportPanelStatus.innerHTML = auditExportConfigured
            ? ('<i class="fas fa-check-circle"></i> ' + (appSettings.audit_logs_auto_export ? 'Live Mirror On' : 'Configured'))
            : '<i class="fas fa-times-circle"></i> Not Configured';
    }
}

function getDesktopAgentDownloadUrl(osName) {
    const osKey = String(osName || '').trim().toLowerCase();
    const sameOriginDownloadUrl = function(path) {
        const normalized = String(path || '').trim();
        if (!normalized) return '';
        return normalized.startsWith('/') ? normalized : ('/' + normalized);
    };
    if (osKey === 'windows') {
        const available = appSettings.desktop_agent_download_available_windows || appSettings.desktop_agent_download_url_windows || appSettings.desktop_agent_download_s3_key_windows;
        return available ? sameOriginDownloadUrl('/api/desktop-agent/download/windows') : '';
    }
    if (osKey === 'macos' || osKey === 'mac') {
        const available = appSettings.desktop_agent_download_available_macos || appSettings.desktop_agent_download_url_macos || appSettings.desktop_agent_download_s3_key_macos;
        return available ? sameOriginDownloadUrl('/api/desktop-agent/download/macos') : '';
    }
    if (osKey === 'linux') {
        const available = appSettings.desktop_agent_download_available_linux || appSettings.desktop_agent_download_url_linux || appSettings.desktop_agent_download_s3_key_linux;
        return available ? sameOriginDownloadUrl('/api/desktop-agent/download/linux') : '';
    }
    return '';
}

function openDesktopAgentDownload(osName) {
    const url = getDesktopAgentDownloadUrl(osName);
    if (!url) {
        alert('Download link is not configured yet. Please contact NPAMX admin.');
        return;
    }
    openUrlInNewTab(url);
}

async function downloadDesktopAgentBootstrap() {
    const status = document.getElementById('desktopAgentPairStatus');
    try {
        if (status) status.textContent = 'Preparing your agent profile...';
        const resp = await fetch('/api/desktop-agent/bootstrap-config', {
            method: 'GET',
            credentials: 'same-origin'
        });
        if (!resp.ok) {
            let message = 'Failed to prepare agent profile.';
            try {
                const data = await resp.json();
                message = String((data && (data.error || data.message)) || message).trim() || message;
            } catch (_) {}
            throw new Error(message);
        }
        const blob = await resp.blob();
        let fileName = 'npamx-agent.bootstrap.json';
        const disposition = String(resp.headers.get('Content-Disposition') || '');
        const match = disposition.match(/filename="([^"]+)"/i);
        if (match && match[1]) fileName = match[1];
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
        if (status) status.textContent = 'Agent profile downloaded. Keep it next to the agent binary and launch the agent, then paste the pairing code here.';
    } catch (err) {
        if (status) status.textContent = err.message || 'Failed to download agent profile.';
    }
}

async function completeDesktopAgentPairing() {
    const input = document.getElementById('desktopAgentPairCodeInput');
    const status = document.getElementById('desktopAgentPairStatus');
    const code = String((input || {}).value || '').trim().toUpperCase();
    if (!code) {
        if (status) status.textContent = 'Enter the pairing code shown in NPAMX Agent.';
        return;
    }
    if (status) status.textContent = 'Connecting agent...';
    try {
        const data = await apiJson('/desktop-agent/login/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_code: code })
        });
        if (input) input.value = '';
        if (status) status.textContent = (data && data.message) ? data.message : 'Desktop agent connected successfully.';
    } catch (err) {
        if (status) status.textContent = err.message || 'Failed to connect desktop agent.';
    }
}

function renderDesktopAgentUserPanel() {
    const panel = document.getElementById('desktopAgentUserPanel');
    if (!panel) return;
    const enabled = !!appSettings.desktop_agent_enabled;
    panel.style.display = '';
    const windowsUrl = getDesktopAgentDownloadUrl('windows');
    const macUrl = getDesktopAgentDownloadUrl('macos');
    const linuxUrl = getDesktopAgentDownloadUrl('linux');
    const windowsBtn = document.getElementById('desktopAgentDownloadWindowsBtn');
    const macBtn = document.getElementById('desktopAgentDownloadMacBtn');
    const linuxBtn = document.getElementById('desktopAgentDownloadLinuxBtn');
    const profileBtn = document.getElementById('desktopAgentDownloadProfileBtn');
    const hint = document.getElementById('desktopAgentUserHint');
    const pairStatus = document.getElementById('desktopAgentPairStatus');
    if (windowsBtn) windowsBtn.disabled = !enabled || !windowsUrl;
    if (macBtn) macBtn.disabled = !enabled || !macUrl;
    if (linuxBtn) linuxBtn.disabled = !enabled || !linuxUrl;
    if (profileBtn) profileBtn.disabled = !enabled;
    if (pairStatus && !String(pairStatus.textContent || '').trim()) {
        pairStatus.textContent = 'Download the agent profile, launch the local agent, then paste the pairing code here to connect.';
    }
    if (hint) {
        if (!enabled) {
            hint.textContent = 'Desktop agent is currently disabled by admin. You can still see setup instructions here.';
            hint.className = 'home-summary-empty';
        } else if (windowsUrl || macUrl || linuxUrl) {
            const networkScope = String(appSettings.desktop_agent_network_scope || '').trim();
            hint.textContent = networkScope
                ? ('Use the NPAMX desktop agent over approved network scope: ' + networkScope + '. Download your per-user agent profile so the agent picks up NPAMX URL and your identity automatically.')
                : 'Use the NPAMX desktop agent over your approved enterprise network. Download your per-user agent profile so the agent picks up NPAMX URL and your identity automatically.';
            hint.className = 'notice-info-pam';
        } else {
            hint.textContent = 'Package links are pending from admin configuration. Contact NPAMX support if needed.';
            hint.className = 'home-summary-empty';
        }
    }
}

function showSiemIntegrationPanel(panel) {
    siemIntegrationPanel = String(panel || 's3').trim().toLowerCase() === 'vendors' ? 'vendors' : 's3';
    const s3Panel = document.getElementById('siemS3Panel');
    const vendorsPanel = document.getElementById('siemVendorsPanel');
    const s3Tab = document.getElementById('siemS3PanelTab');
    const vendorsTab = document.getElementById('siemVendorsPanelTab');
    if (s3Panel) s3Panel.style.display = siemIntegrationPanel === 's3' ? '' : 'none';
    if (vendorsPanel) vendorsPanel.style.display = siemIntegrationPanel === 'vendors' ? '' : 'none';
    if (s3Tab) s3Tab.classList.toggle('active', siemIntegrationPanel === 's3');
    if (vendorsTab) vendorsTab.classList.toggle('active', siemIntegrationPanel === 'vendors');
    if (siemIntegrationPanel === 's3') {
        loadSiemS3Panel();
    }
}

function loadSiemS3Panel() {
    const bucketEl = document.getElementById('siemAuditBucket');
    const prefixEl = document.getElementById('siemAuditPrefix');
    const autoEl = document.getElementById('siemAuditAutoExport');
    if (bucketEl) bucketEl.value = String(appSettings.audit_logs_bucket || '').trim();
    if (prefixEl) prefixEl.value = String(appSettings.audit_logs_prefix || 'npamx/audit').trim() || 'npamx/audit';
    if (autoEl) autoEl.checked = appSettings.audit_logs_auto_export === true;
}

async function saveSiemS3Integration() {
    const latestSettings = await loadAdminSettings().catch(function() { return Object.assign({}, appSettings); });
    const payload = Object.assign({}, latestSettings, {
        audit_logs_bucket: String((document.getElementById('siemAuditBucket') || {}).value || '').trim(),
        audit_logs_prefix: String((document.getElementById('siemAuditPrefix') || {}).value || '').trim() || 'npamx/audit',
        audit_logs_auto_export: !!document.getElementById('siemAuditAutoExport')?.checked,
    });
    try {
        await saveAdminSettings(payload);
        loadSiemS3Panel();
        setInlineStatus('siemS3InlineStatus', 'S3 log archive settings saved successfully.', 'success');
    } catch (err) {
        setInlineStatus('siemS3InlineStatus', err.message || 'Failed to save S3 log archive settings.', 'error');
    }
}

async function testSiemS3Integration() {
    const latestSettings = await loadAdminSettings().catch(function() { return Object.assign({}, appSettings); });
    const payload = Object.assign({}, latestSettings, {
        audit_logs_bucket: String((document.getElementById('siemAuditBucket') || {}).value || '').trim(),
        audit_logs_prefix: String((document.getElementById('siemAuditPrefix') || {}).value || '').trim() || 'npamx/audit',
        audit_logs_auto_export: !!document.getElementById('siemAuditAutoExport')?.checked,
    });
    try {
        await saveAdminSettings(payload);
        const data = await apiJson('/admin/audit-logs/test', { method: 'POST' });
        if (String(data.status || '').toLowerCase() !== 'success') {
            throw new Error(String(data.error || 'S3 archive test failed.'));
        }
        const checks = Array.isArray(data.result?.checks) ? data.result.checks : [];
        const summary = checks.map(function(item) { return String(item.message || '').trim(); }).filter(Boolean).join(' ');
        setInlineStatus('siemS3InlineStatus', summary || 'S3 archive test passed successfully.', 'success');
    } catch (err) {
        setInlineStatus('siemS3InlineStatus', err.message || 'Failed to test S3 archive settings.', 'error');
    }
}

function renderAwsRoleMappingRows(mappings) {
    const rows = Array.isArray(mappings) ? mappings : [];
    const html = rows.map(function(item, index) {
        return '' +
            '<div class="aws-role-row" data-index="' + index + '">' +
                '<div class="form-group">' +
                    '<label>Account Name</label>' +
                    '<input type="text" class="aws-role-account-name" placeholder="Security services / POC account" value="' + escapeHtml(item.account_name || item.label || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Account ID</label>' +
                    '<input type="text" class="aws-role-account-id" placeholder="123456789012" value="' + escapeHtml(item.account_id || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Role ARN</label>' +
                    '<input type="text" class="aws-role-arn" placeholder="arn:aws:iam::123456789012:role/NPAMX-Resource-Role" value="' + escapeHtml(item.role_arn || '') + '">' +
                '</div>' +
                '<div class="form-group aws-role-row-action">' +
                    '<label>&nbsp;</label>' +
                    '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="removeAwsRoleMappingRow(' + index + ')"><i class="fas fa-trash"></i> Remove</button>' +
                '</div>' +
            '</div>';
    }).join('');
    return '<div id="awsRoleMappingsList">' + html + '</div>';
}

function renderDbProxyMappingRows(mappings) {
    const rows = Array.isArray(mappings) ? mappings : [];
    const html = rows.map(function(item, index) {
        return '' +
            '<div class="aws-role-row" data-index="' + index + '">' +
                '<div class="form-group">' +
                    '<label>Account Name</label>' +
                    '<input type="text" class="db-proxy-account-name" placeholder="Nykaa-security-poc" value="' + escapeHtml(item.account_name || item.label || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Account ID</label>' +
                    '<input type="text" class="db-proxy-account-id" placeholder="123456789012" value="' + escapeHtml(item.account_id || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Proxy Host</label>' +
                    '<input type="text" class="db-proxy-host" placeholder="npamx-proxy.proxy-abcdefghijkl.ap-south-1.rds.amazonaws.com" value="' + escapeHtml(item.proxy_host || item.host || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Port</label>' +
                    '<input type="number" class="db-proxy-port" placeholder="3306" value="' + escapeHtml(String(item.proxy_port || item.port || '3306')) + '" min="1" max="65535">' +
                '</div>' +
                '<div class="form-group aws-role-row-action">' +
                    '<label>&nbsp;</label>' +
                    '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="removeDbProxyMappingRow(' + index + ')"><i class="fas fa-trash"></i> Remove</button>' +
                '</div>' +
            '</div>';
    }).join('');
    return '<div id="dbProxyMappingsList">' + html + '</div>';
}

function collectAwsIntegrationSettingsFromForm() {
    return {
        sso_instance_arn: String(appSettings.sso_instance_arn || '').trim(),
        identity_store_id: String(appSettings.identity_store_id || '').trim(),
        sso_start_url: String(appSettings.sso_start_url || '').trim(),
        idc_assume_role_arn: String((document.getElementById('integrationIdcRoleArn') || {}).value || '').trim(),
        idc_assume_role_session_name: String((document.getElementById('integrationIdcRoleSessionName') || {}).value || '').trim() || 'npam-idc',
        resource_assume_role_arn: String((document.getElementById('integrationResourceRoleArn') || {}).value || '').trim(),
        resource_assume_role_name_template: String((document.getElementById('integrationResourceRoleNameTemplate') || {}).value || '').trim(),
        resource_assume_role_session_name: String((document.getElementById('integrationResourceRoleSessionName') || {}).value || '').trim() || 'npam-resource',
        db_connect_proxy_mappings: collectDbProxyMappingsFromForm().filter(function(item) {
            return item.account_id && item.proxy_host;
        }),
        resource_role_mappings: collectAwsRoleMappingsFromForm().filter(function(item) {
            return item.account_id && item.role_arn;
        })
    };
}

function collectAwsRoleMappingsFromForm() {
    return Array.from(document.querySelectorAll('#awsRoleMappingsList .aws-role-row')).map(function(row) {
        return {
            account_id: String((row.querySelector('.aws-role-account-id') || {}).value || '').trim(),
            role_arn: String((row.querySelector('.aws-role-arn') || {}).value || '').trim(),
            account_name: String((row.querySelector('.aws-role-account-name') || {}).value || '').trim()
        };
    }).filter(function(item) { return item.account_id || item.role_arn || item.account_name; });
}

function collectDbProxyMappingsFromForm() {
    return Array.from(document.querySelectorAll('#dbProxyMappingsList .aws-role-row')).map(function(row) {
        return {
            account_id: String((row.querySelector('.db-proxy-account-id') || {}).value || '').trim(),
            account_name: String((row.querySelector('.db-proxy-account-name') || {}).value || '').trim(),
            proxy_host: String((row.querySelector('.db-proxy-host') || {}).value || '').trim(),
            proxy_port: String((row.querySelector('.db-proxy-port') || {}).value || '').trim()
        };
    }).filter(function(item) { return item.account_id || item.account_name || item.proxy_host || item.proxy_port; });
}

function deriveSsoUrlsFromBaseUrl(baseUrl) {
    const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!trimmed) {
        return { acs: '', audience: '' };
    }
    return {
        acs: trimmed + '/saml/acs',
        audience: trimmed + '/saml/metadata'
    };
}

function updateSsoIntegrationDerivedFields() {
    const baseUrl = String((document.getElementById('integrationAppBaseUrl') || {}).value || '').trim();
    const urls = deriveSsoUrlsFromBaseUrl(baseUrl);
    const acsEl = document.getElementById('integrationSsoAcsUrl');
    const audienceEl = document.getElementById('integrationSsoAudienceUrl');
    if (acsEl) acsEl.value = urls.acs;
    if (audienceEl) audienceEl.value = urls.audience;
}

async function readIntegrationFileAsText(inputId) {
    const input = document.getElementById(inputId);
    const file = input && input.files && input.files[0];
    if (!file) return '';
    return new Promise(function(resolve, reject) {
        const reader = new FileReader();
        reader.onload = function() { resolve(String(reader.result || '')); };
        reader.onerror = function() { reject(new Error('Failed to read uploaded file.')); };
        reader.readAsText(file);
    });
}

function addAwsRoleMappingRow() {
    const current = collectAwsRoleMappingsFromForm();
    current.push({ account_id: '', role_arn: '', account_name: '' });
    const fields = document.getElementById('integrationConfigFields');
    if (!fields) return;
    const rowsEl = document.getElementById('awsRoleMappingsWrap');
    if (rowsEl) {
        rowsEl.innerHTML = renderAwsRoleMappingRows(current);
    }
}

function addDbProxyMappingRow() {
    const current = collectDbProxyMappingsFromForm();
    current.push({ account_id: '', account_name: '', proxy_host: '', proxy_port: '3306' });
    const rowsEl = document.getElementById('dbProxyMappingsWrap');
    if (rowsEl) {
        rowsEl.innerHTML = renderDbProxyMappingRows(current);
    }
}

function removeAwsRoleMappingRow(index) {
    const current = collectAwsRoleMappingsFromForm();
    current.splice(index, 1);
    const rowsEl = document.getElementById('awsRoleMappingsWrap');
    if (rowsEl) {
        rowsEl.innerHTML = renderAwsRoleMappingRows(current);
    }
}

function removeDbProxyMappingRow(index) {
    const current = collectDbProxyMappingsFromForm();
    current.splice(index, 1);
    const rowsEl = document.getElementById('dbProxyMappingsWrap');
    if (rowsEl) {
        rowsEl.innerHTML = renderDbProxyMappingRows(current);
    }
}

function resetIntegrationConfigResults() {
    const el = document.getElementById('integrationConfigResults');
    if (!el) return;
    el.hidden = true;
    el.innerHTML = '';
}

function setIntegrationTestLoading(loading) {
    const testBtn = document.getElementById('integrationConfigTestBtn');
    const saveBtn = document.querySelector('#integrationConfigForm button[type="submit"]');
    const buttonLabel = (activeIntegrationProvider === 'jumpcloud')
        ? 'Run Test'
        : (activeIntegrationProvider === 'desktop_agent' ? 'Check Status' : 'Test');
    if (testBtn) {
        testBtn.disabled = !!loading;
        testBtn.innerHTML = loading
            ? '<span class="integration-test-spinner" aria-hidden="true"></span> Testing'
            : '<i class="fas fa-vial"></i> ' + buttonLabel;
    }
    if (saveBtn) {
        saveBtn.disabled = !!loading;
    }
}

function renderAwsIntegrationCheck(check) {
    const status = String((check && check.status) || 'skipped').trim().toLowerCase();
    const icon = status === 'success'
        ? 'fa-circle-check'
        : (status === 'error' ? 'fa-circle-xmark' : 'fa-circle-minus');
    const code = String((check && check.code) || '').trim();
    return '' +
        '<div class="integration-test-check integration-test-check-' + escapeHtml(status) + '">' +
            '<div class="integration-test-check-icon"><i class="fas ' + icon + '"></i></div>' +
            '<div class="integration-test-check-copy">' +
                '<div class="integration-test-check-title">' + escapeHtml((check && check.name) || 'Check') + '</div>' +
                (code ? '<div class="integration-test-check-message" style="margin-bottom:4px;"><code>' + escapeHtml(code) + '</code></div>' : '') +
                '<div class="integration-test-check-message">' + escapeHtml((check && check.message) || '') + '</div>' +
            '</div>' +
        '</div>';
}

function renderAwsIntegrationResultCard(result) {
    if (!result) return '';
    const checks = Array.isArray(result.checks) ? result.checks : [];
    const state = result.ok ? 'success' : (checks.some(function(item) { return item && item.status === 'error'; }) ? 'error' : 'skipped');
    const meta = [];
    if (result.role_arn) meta.push('<code>' + escapeHtml(result.role_arn) + '</code>');
    if (result.assumed_role_arn) meta.push('<code>' + escapeHtml(result.assumed_role_arn) + '</code>');
    if (result.account_id) meta.push('<span>Account ' + escapeHtml(result.account_id) + '</span>');
    if (result.host) {
        const hostLabel = result.port ? (String(result.host || '') + ':' + String(result.port || '')) : String(result.host || '');
        meta.push('<code>' + escapeHtml(hostLabel) + '</code>');
    }
    if (result.allow_direct) meta.push('<span>Direct fallback enabled</span>');
    return '' +
        '<div class="integration-test-card integration-test-card-' + escapeHtml(state) + '">' +
            '<div class="integration-test-card-header">' +
                '<div>' +
                    '<h4>' + escapeHtml(result.label || 'AWS role') + '</h4>' +
                    '<div class="integration-test-card-meta">' + meta.join('') + '</div>' +
                '</div>' +
                '<span class="integration-test-pill integration-test-pill-' + escapeHtml(state) + '">' + escapeHtml(state === 'success' ? 'Ready' : (state === 'error' ? 'Action needed' : 'Skipped')) + '</span>' +
            '</div>' +
            '<div class="integration-test-card-body">' + checks.map(renderAwsIntegrationCheck).join('') + '</div>' +
        '</div>';
}

function renderAwsIntegrationResults(payload) {
    const el = document.getElementById('integrationConfigResults');
    if (!el) return;
    const results = (payload && payload.results) || {};
    const summary = results.summary || {};
    const cards = [];
    const dbConnectResults = Array.isArray(results.db_connect) ? results.db_connect : (results.db_connect ? [results.db_connect] : []);
    if (activeIntegrationProvider === 'rds_proxy') {
        dbConnectResults.forEach(function(item) {
            cards.push(renderAwsIntegrationResultCard(item));
        });
    } else {
        if (results.management) cards.push(renderAwsIntegrationResultCard(results.management));
        dbConnectResults.forEach(function(item) {
            cards.push(renderAwsIntegrationResultCard(item));
        });
        (Array.isArray(results.resources) ? results.resources : []).forEach(function(item) {
            cards.push(renderAwsIntegrationResultCard(item));
        });
    }
    el.hidden = false;
    el.innerHTML = '' +
        '<div class="integration-test-summary">' +
            '<div class="integration-test-summary-badge integration-test-summary-pass"><i class="fas fa-check-circle"></i> ' + escapeHtml(summary.passed || 0) + ' passed</div>' +
            '<div class="integration-test-summary-badge integration-test-summary-fail"><i class="fas fa-times-circle"></i> ' + escapeHtml(summary.failed || 0) + ' failed</div>' +
            '<div class="integration-test-summary-badge integration-test-summary-skip"><i class="fas fa-minus-circle"></i> ' + escapeHtml(summary.skipped || 0) + ' skipped</div>' +
        '</div>' +
        '<div class="integration-test-grid">' + cards.join('') + '</div>';
}

function renderIdentityCenterIntegrationResults(payload) {
    const el = document.getElementById('integrationConfigResults');
    if (!el) return;
    const result = (payload && payload.result) || {};
    const checks = [
        {
            name: 'Metadata XML parsed',
            status: 'success',
            message: 'IAM Identity Center metadata was parsed successfully on the PAM backend.'
        },
        {
            name: 'Derived ACS URL',
            status: result.acs_url ? 'success' : 'error',
            message: result.acs_url || 'ACS URL could not be derived from the configured base URL.'
        },
        {
            name: 'Derived Audience / Entity ID',
            status: result.audience_url ? 'success' : 'error',
            message: result.audience_url || 'Audience URL could not be derived from the configured base URL.'
        },
        {
            name: 'Identity Center sign-in URL',
            status: result.sso_url ? 'success' : 'error',
            message: result.sso_url || 'Sign-in URL is missing from the uploaded metadata.'
        },
        {
            name: 'Signing certificate',
            status: result.signing_cert_configured ? 'success' : 'error',
            message: result.signing_cert_configured ? 'Signing certificate found in metadata.' : 'No signing certificate found in metadata.'
        }
    ];
    const state = checks.some(function(item) { return item.status === 'error'; }) ? 'error' : 'success';
    const checkHtml = checks.map(renderAwsIntegrationCheck).join('');
    el.hidden = false;
    el.innerHTML = '' +
        '<div class="integration-test-summary">' +
            '<div class="integration-test-summary-badge integration-test-summary-pass"><i class="fas fa-check-circle"></i> ' + escapeHtml(checks.filter(function(item) { return item.status === 'success'; }).length) + ' passed</div>' +
            '<div class="integration-test-summary-badge integration-test-summary-fail"><i class="fas fa-times-circle"></i> ' + escapeHtml(checks.filter(function(item) { return item.status === 'error'; }).length) + ' failed</div>' +
            '<div class="integration-test-summary-badge integration-test-summary-skip"><i class="fas fa-minus-circle"></i> 0 skipped</div>' +
        '</div>' +
        '<div class="integration-test-card integration-test-card-' + escapeHtml(state) + '">' +
            '<div class="integration-test-card-header">' +
                '<div>' +
                    '<h4>AWS Identity Center Login</h4>' +
                    '<div class="integration-test-card-meta"><code>' + escapeHtml(result.base_url || '') + '</code><code>' + escapeHtml(result.idp_entity_id || '') + '</code></div>' +
                '</div>' +
                '<span class="integration-test-pill integration-test-pill-' + escapeHtml(state) + '">' + escapeHtml(state === 'success' ? 'Ready' : 'Action needed') + '</span>' +
            '</div>' +
            '<div class="integration-test-card-body">' + checkHtml + '</div>' +
        '</div>';
}

function renderDesktopAgentIntegrationResults(payload) {
    const el = document.getElementById('integrationConfigResults');
    if (!el) return;
    const result = (payload && payload.result) || {};
    const checks = Array.isArray(result.checks) ? result.checks : [];
    const successCount = checks.filter(function(item) { return String(item && item.status || '').toLowerCase() === 'success'; }).length;
    const failureCount = checks.filter(function(item) { return String(item && item.status || '').toLowerCase() === 'error'; }).length;
    const skippedCount = checks.filter(function(item) { return String(item && item.status || '').toLowerCase() === 'skipped'; }).length;
    const state = failureCount ? 'error' : 'success';
    const latestAgent = result.latest_agent || {};
    const meta = [
        result.network_scope ? ('<span>Network ' + escapeHtml(result.network_scope) + '</span>') : '',
        result.heartbeat_ttl_seconds ? ('<span>TTL ' + escapeHtml(String(result.heartbeat_ttl_seconds)) + 's</span>') : '',
        latestAgent.agent_id ? ('<code>' + escapeHtml(latestAgent.agent_id) + '</code>') : '',
        latestAgent.user_email ? ('<span>' + escapeHtml(latestAgent.user_email) + '</span>') : '',
    ].filter(Boolean);
    el.hidden = false;
    el.innerHTML = '' +
        '<div class="integration-test-summary">' +
            '<div class="integration-test-summary-badge integration-test-summary-pass"><i class="fas fa-check-circle"></i> ' + escapeHtml(successCount) + ' passed</div>' +
            '<div class="integration-test-summary-badge integration-test-summary-fail"><i class="fas fa-times-circle"></i> ' + escapeHtml(failureCount) + ' failed</div>' +
            '<div class="integration-test-summary-badge integration-test-summary-skip"><i class="fas fa-minus-circle"></i> ' + escapeHtml(skippedCount) + ' skipped</div>' +
        '</div>' +
        '<div class="integration-test-card integration-test-card-' + escapeHtml(state) + '">' +
            '<div class="integration-test-card-header">' +
                '<div>' +
                    '<h4>Desktop Agent Connectivity</h4>' +
                    '<div class="integration-test-card-meta">' + meta.join('') + '</div>' +
                '</div>' +
                '<span class="integration-test-pill integration-test-pill-' + escapeHtml(state) + '">' + escapeHtml(state === 'success' ? 'Ready' : 'Action needed') + '</span>' +
            '</div>' +
            '<div class="integration-test-card-body">' +
                checks.map(renderAwsIntegrationCheck).join('') +
                '<div class="integration-test-check integration-test-check-' + escapeHtml(failureCount ? 'error' : 'success') + '">' +
                    '<div class="integration-test-check-icon"><i class="fas fa-laptop-code"></i></div>' +
                    '<div class="integration-test-check-copy">' +
                        '<div class="integration-test-check-title">Live status</div>' +
                        '<div class="integration-test-check-message">Connected=' + escapeHtml(String(result.agents_connected || 0)) + ', Total=' + escapeHtml(String(result.agents_total || 0)) + ', Stale=' + escapeHtml(String(result.agents_stale || 0)) + '</div>' +
                        (result.latest_error ? ('<div class="integration-test-check-message" style="margin-top:6px;">Reason: ' + escapeHtml(String(result.latest_error)) + '</div>') : '') +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
}

async function refreshDesktopAgentRuntimeStatus() {
    if (!canAccessAdminConsole()) return;
    try {
        const data = await apiJson('/admin/integrations/desktop-agent/status');
        desktopAgentRuntimeStatus = (data && data.result && typeof data.result === 'object') ? data.result : null;
    } catch (_) {
        desktopAgentRuntimeStatus = null;
    }
    applyRuntimeSettings();
}

async function loadDbConnectionTestAccounts() {
    const select = document.getElementById('integrationDbTestAccount');
    const instanceSelect = document.getElementById('integrationDbTestInstance');
    if (!select) return;
    select.innerHTML = '<option value="">Loading accounts...</option>';
    if (instanceSelect) {
        instanceSelect.innerHTML = '<option value="">Select account first</option>';
        instanceSelect.disabled = true;
    }
    try {
        const data = await apiJson('/accounts');
        const accounts = (typeof data === 'object' && !Array.isArray(data) ? Object.values(data) : (data || []))
            .filter(function(account) {
                return account && account.id;
            })
            .sort(function(a, b) {
                return String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''));
            });
        if (!accounts.length) {
            select.innerHTML = '<option value="">No AWS accounts found</option>';
            return;
        }
        select.innerHTML = '<option value="">Select AWS account</option>' + accounts.map(function(account) {
            const label = [account.name || account.id, account.id].filter(Boolean).join(' • ');
            const accountEnv = String(
                account.effective_environment
                || account.environment
                || account.source_environment
                || ''
            ).trim();
            return '<option value="' + escapeHtml(account.id) + '" data-account-env="' + escapeHtml(accountEnv) + '">' + escapeHtml(label) + '</option>';
        }).join('');
    } catch (err) {
        select.innerHTML = '<option value="">Failed to load accounts</option>';
        setInlineStatus('integrationConfigStatus', err.message || 'Failed to load AWS accounts for the DB tester.', 'error');
    }
}

function normalizeAccountEnvironmentTag(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'prod' || raw === 'production') return 'prod';
    if (raw === 'sandbox') return 'sandbox';
    return 'nonprod';
}

function normalizeDbEngineFamily(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw.includes('redshift')) return 'redshift';
    if (raw.includes('postgres')) return 'postgres';
    if (raw.includes('maria')) return 'maria';
    if (raw.includes('aurora')) return 'aurora';
    if (raw.includes('mysql')) return 'mysql';
    return raw;
}

function normalizeVaultPlane(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'prod' || raw === 'production') return 'prod';
    if (raw === 'sandbox') return 'sandbox';
    return 'nonprod';
}

function getSelectedVaultPlane(fallbackPlane) {
    const input = document.getElementById('integrationDbExecutionPlane');
    const fallback = normalizeVaultPlane(fallbackPlane || 'nonprod');
    if (!input) return fallback;
    return normalizeVaultPlane(input.value || fallback);
}

function defaultVaultSecretPrefixForPlane(planeValue) {
    const plane = normalizeVaultPlane(planeValue || 'nonprod');
    return 'kv/npamx/' + plane + '/db-admin/connections';
}

function syncVaultSecretPrefixWithPlane(force) {
    const prefixInput = document.getElementById('integrationDbAdminSecretPrefix');
    if (!prefixInput) return;
    const suggested = defaultVaultSecretPrefixForPlane(getSelectedVaultPlane('nonprod'));
    const current = String(prefixInput.value || '').trim();
    const lastSuggested = String(prefixInput.getAttribute('data-suggested') || '').trim();
    if (force || !current || current === lastSuggested) {
        prefixInput.value = suggested;
    }
    prefixInput.setAttribute('data-suggested', suggested);
}

function onVaultDbPlaneChanged() {
    syncVaultSecretPrefixWithPlane(false);
    suggestVaultAdminSecretRefForPush(false);
    loadVaultDbConnectionInventory();
}

function syncVaultPlaneFromSelectedAccount(force) {
    const accountSelect = document.getElementById('integrationDbTestAccount');
    const planeSelect = document.getElementById('integrationDbExecutionPlane');
    if (!accountSelect || !planeSelect) return;
    const selected = accountSelect.options ? accountSelect.options[accountSelect.selectedIndex] : null;
    const inferredEnv = normalizeAccountEnvironmentTag(selected ? selected.getAttribute('data-account-env') : '');
    if (!inferredEnv) return;
    const inferredPlane = normalizeVaultPlane(inferredEnv);
    const currentPlane = normalizeVaultPlane(planeSelect.value || 'nonprod');
    if (force || currentPlane !== inferredPlane) {
        planeSelect.value = inferredPlane;
        syncVaultSecretPrefixWithPlane(false);
        suggestVaultAdminSecretRefForPush(false);
    }
}

function onDbConnectionTestAccountChange() {
    syncVaultPlaneFromSelectedAccount(true);
    loadDbConnectionTestInstances();
}

function updateVaultPushTemplateForEngine(engineValue) {
    const engine = normalizeDbEngineFamily(engineValue);
    const templateInput = document.getElementById('integrationDbUsernameTemplate');
    const dbNameInput = document.getElementById('integrationDbName');
    if (templateInput && !String(templateInput.value || '').trim()) {
        templateInput.value = engine === 'redshift' ? 'dwh-{{.RoleName}}-{{random 6}}' : 'd-{{.RoleName}}-{{random 6}}';
    }
    if (dbNameInput && !String(dbNameInput.value || '').trim()) {
        if (engine === 'redshift') dbNameInput.value = 'dev';
        if (engine === 'postgres') dbNameInput.value = 'postgres';
    }
}

function suggestVaultAdminSecretRefForPush(force) {
    const secretRefInput = document.getElementById('integrationDbAdminSecretRef');
    if (!secretRefInput) return;
    const connectionName = String((document.getElementById('integrationDbConnectionName') || {}).value || '').trim();
    if (!connectionName) return;
    const prefixInput = document.getElementById('integrationDbAdminSecretPrefix');
    const prefixRaw = String((prefixInput || {}).value || defaultVaultSecretPrefixForPlane(getSelectedVaultPlane('nonprod'))).trim();
    const prefix = prefixRaw.replace(/\/+$/, '');
    if (!prefix) return;
    const suggested = prefix + '/' + connectionName;
    const current = String(secretRefInput.value || '').trim();
    const lastSuggested = String(secretRefInput.getAttribute('data-suggested') || '').trim();
    if (force || !current || current === lastSuggested) {
        secretRefInput.value = suggested;
    }
    secretRefInput.setAttribute('data-suggested', suggested);
}

function onDbConnectionTestInstanceChange() {
    const instanceSelect = document.getElementById('integrationDbTestInstance');
    const selected = instanceSelect && instanceSelect.options ? instanceSelect.options[instanceSelect.selectedIndex] : null;
    const connectionNameInput = document.getElementById('integrationDbConnectionName');
    const dbNameInput = document.getElementById('integrationDbName');
    if (connectionNameInput && instanceSelect) {
        connectionNameInput.value = String(instanceSelect.value || '').trim();
    }
    const engine = normalizeDbEngineFamily((selected && selected.getAttribute('data-engine')) || (document.getElementById('integrationDbTestEngine') || {}).value || '');
    if (dbNameInput && selected) {
        const suggestedDbName = String((selected.getAttribute('data-db-name') || '')).trim();
        if (suggestedDbName) {
            dbNameInput.value = suggestedDbName;
        } else if (!String(dbNameInput.value || '').trim()) {
            if (engine === 'postgres') dbNameInput.value = 'postgres';
            if (engine === 'redshift') dbNameInput.value = 'dev';
        }
    }
    updateVaultPushTemplateForEngine(engine);
    suggestVaultAdminSecretRefForPush(false);
}

async function loadDbConnectionTestInstances() {
    const accountSelect = document.getElementById('integrationDbTestAccount');
    const engineSelect = document.getElementById('integrationDbTestEngine');
    const instanceSelect = document.getElementById('integrationDbTestInstance');
    if (!accountSelect || !instanceSelect) return;
    const accountId = String(accountSelect.value || '').trim();
    const engineFilter = normalizeDbEngineFamily((engineSelect && engineSelect.value) || 'mysql') || 'mysql';
    resetIntegrationConfigResults();
    if (!accountId) {
        instanceSelect.innerHTML = '<option value="">Select account first</option>';
        instanceSelect.disabled = true;
        return;
    }
    instanceSelect.disabled = true;
    instanceSelect.innerHTML = '<option value="">Loading database targets...</option>';
    try {
        const data = await apiJson('/databases?account_id=' + encodeURIComponent(accountId) + '&engine=' + encodeURIComponent(engineFilter));
        const databases = Array.isArray(data.databases) ? data.databases : [];
        if (!databases.length) {
            instanceSelect.innerHTML = '<option value="">No matching database targets found</option>';
            return;
        }
        instanceSelect.innerHTML = '<option value="">Select database target</option>' + databases.map(function(item) {
            const label = [item.id, item.engine, item.status].filter(Boolean).join(' • ');
            return '<option value="' + escapeHtml(item.id) + '" data-region="' + escapeHtml(item.region || '') + '" data-engine="' + escapeHtml(item.engine || '') + '" data-db-name="' + escapeHtml(item.name || '') + '">' + escapeHtml(label) + '</option>';
        }).join('');
        instanceSelect.disabled = false;
        onDbConnectionTestInstanceChange();
    } catch (err) {
        instanceSelect.innerHTML = '<option value="">Failed to load instances</option>';
        setInlineStatus('integrationConfigStatus', err.message || 'Failed to load database targets for the selected account.', 'error');
    }
}

function renderVaultDbConnectionInventory() {
    const wrap = document.getElementById('integrationDbConnectionInventory');
    if (!wrap) return;
    if (vaultDbConnectionInventoryLoading) {
        wrap.innerHTML = '<div class="integration-test-loading"><span class="integration-test-spinner" aria-hidden="true"></span><div><strong>Refreshing Vault connections</strong><p>Reading live database/config entries from Vault for push management.</p></div></div>';
        return;
    }
    if (!vaultDbConnectionInventory.length) {
        wrap.innerHTML = '<div class="notice-info-pam">No Vault database connections were returned for this plane yet. Use Refresh Connections after DevOps adds a new connection in Vault.</div>';
        return;
    }
    const rows = vaultDbConnectionInventory.map(function(item) {
        const connectionName = String(item.connection_name || '').trim();
        const plane = String(item.plane || 'nonprod').trim() || 'nonprod';
        const status = String(item.status || 'limited').trim().toLowerCase();
        const statusClass = status === 'success' || status === 'ready'
            ? 'integration-test-pill-success'
            : (status === 'error' ? 'integration-test-pill-error' : 'integration-test-pill-skip');
        const statusLabel = status === 'success' || status === 'ready'
            ? 'Ready'
            : (status === 'error' ? 'Action needed' : (status === 'ready' ? 'Ready' : 'Limited'));
        const codeLabel = String(item.status_code || '').trim();
        const noteLabel = String(item.status_message || '').trim();
        return '' +
            '<tr>' +
                '<td><strong>' + escapeHtml(connectionName) + '</strong><div style="color: var(--text-muted, #6b7280); font-size: 12px; margin-top: 4px;">' + escapeHtml(plane) + '</div></td>' +
                '<td>' + escapeHtml(item.plugin_name || 'unknown') + '</td>' +
                '<td>' + escapeHtml(item.engine || 'unknown') + '</td>' +
                '<td>' + (item.endpoint ? ('<code>' + escapeHtml(item.endpoint) + '</code>') : '<span style="color: var(--text-muted, #6b7280);">Not derived</span>') + '</td>' +
                '<td>' + escapeHtml(item.allowed_roles || '(unknown)') + '</td>' +
                '<td><span class="integration-test-pill ' + statusClass + '">' + escapeHtml(statusLabel) + '</span>' + (codeLabel ? ('<div style="margin-top:6px;"><code>' + escapeHtml(codeLabel) + '</code></div>') : '') + (noteLabel ? ('<div style="margin-top:6px; color: var(--text-muted, #6b7280); font-size: 12px;">' + escapeHtml(noteLabel) + '</div>') : '') + '</td>' +
            '</tr>';
    }).join('');
    wrap.innerHTML = '' +
        '<div style="overflow-x:auto;">' +
            '<table class="admin-table" style="width:100%; min-width: 920px;">' +
                '<thead><tr><th>Vault Connection</th><th>Plugin</th><th>Engine</th><th>Endpoint</th><th>Allowed Roles</th><th>Status</th></tr></thead>' +
                '<tbody>' + rows + '</tbody>' +
            '</table>' +
        '</div>';
}

async function loadVaultDbConnectionInventory() {
    const plane = getSelectedVaultPlane('nonprod');
    vaultDbConnectionInventoryLoading = true;
    renderVaultDbConnectionInventory();
    setInlineStatus('integrationConfigStatus', 'Refreshing live Vault database connections for ' + plane + ' plane...', 'info');
    try {
        const data = await apiJson('/admin/integrations/database-connections?plane=' + encodeURIComponent(plane));
        if (String(data.status || '').toLowerCase() === 'error' && data.error_message) {
            throw new Error(String(data.error_message || '').trim() || 'Failed to refresh Vault database connections.');
        }
        vaultDbConnectionInventory = Array.isArray(data.connections) ? data.connections : [];
        renderVaultDbConnectionInventory();
        setInlineStatus(
            'integrationConfigStatus',
            vaultDbConnectionInventory.length
                ? 'Vault connection inventory refreshed. Select account/instance above and push per connection.'
                : 'Vault returned no database connections for this plane yet.',
            'info'
        );
    } catch (err) {
        vaultDbConnectionInventory = [];
        renderVaultDbConnectionInventory();
        setInlineStatus('integrationConfigStatus', err.message || 'Failed to refresh Vault database connections.', 'error');
    } finally {
        vaultDbConnectionInventoryLoading = false;
        renderVaultDbConnectionInventory();
    }
}

function collectVaultDbConnectionPushSettingsFromForm(pushMode) {
    const plane = getSelectedVaultPlane('nonprod');
    const accountId = String((document.getElementById('integrationDbTestAccount') || {}).value || '').trim();
    const engineSelect = document.getElementById('integrationDbTestEngine');
    const instanceSelect = document.getElementById('integrationDbTestInstance');
    const selectedOption = instanceSelect && instanceSelect.options ? instanceSelect.options[instanceSelect.selectedIndex] : null;
    const region = String((selectedOption && selectedOption.getAttribute('data-region')) || '').trim() || 'ap-south-1';
    const instanceEngine = normalizeDbEngineFamily((selectedOption && selectedOption.getAttribute('data-engine')) || '');
    const selectedEngine = normalizeDbEngineFamily((engineSelect && engineSelect.value) || instanceEngine || 'mysql');
    return {
        plane: plane,
        push_mode: String(pushMode || 'full').trim().toLowerCase() || 'full',
        account_id: accountId,
        db_instance_id: String((instanceSelect || {}).value || '').trim(),
        engine: selectedEngine || instanceEngine || 'mysql',
        region: region,
        connection_name: String((document.getElementById('integrationDbConnectionName') || {}).value || '').trim(),
        db_name: String((document.getElementById('integrationDbName') || {}).value || '').trim(),
        admin_username: String((document.getElementById('integrationDbAdminUsername') || {}).value || '').trim(),
        admin_password: String((document.getElementById('integrationDbAdminPassword') || {}).value || '').trim(),
        admin_secret_ref: String((document.getElementById('integrationDbAdminSecretRef') || {}).value || '').trim(),
        admin_secret_kv_version: String((document.getElementById('integrationDbAdminSecretKvVersion') || {}).value || '').trim() || '2',
        admin_secret_username_key: String((document.getElementById('integrationDbAdminSecretUsernameKey') || {}).value || '').trim() || 'username',
        admin_secret_password_key: String((document.getElementById('integrationDbAdminSecretPasswordKey') || {}).value || '').trim() || 'password',
        allowed_roles: String((document.getElementById('integrationDbAllowedRoles') || {}).value || '').trim() || '*',
        username_template: String((document.getElementById('integrationDbUsernameTemplate') || {}).value || '').trim(),
    };
}

function renderVaultDbConnectionPushResults(payload) {
    const result = (payload && payload.result) || {};
    const checks = Array.isArray(result.checks) ? result.checks : [];
    const state = String(payload && payload.status || '').toLowerCase() === 'success' ? 'success' : 'error';
    const meta = [
        result.connection_name ? ('<span>Connection ' + escapeHtml(result.connection_name) + '</span>') : '',
        result.engine ? ('<span>' + escapeHtml(result.engine) + '</span>') : '',
        result.plugin_name ? ('<span>' + escapeHtml(result.plugin_name) + '</span>') : '',
        result.host ? ('<code>' + escapeHtml(String(result.host || '') + (result.port ? ':' + String(result.port || '') : '')) + '</code>') : '',
        result.username_template ? ('<code>' + escapeHtml(result.username_template) + '</code>') : '',
        result.admin_secret_ref ? ('<code>' + escapeHtml(result.admin_secret_ref) + '</code>') : ''
    ].filter(Boolean);
    const el = document.getElementById('integrationConfigResults');
    if (!el) return;
    el.hidden = false;
    el.innerHTML = '' +
        '<div class="integration-test-summary">' +
            '<div class="integration-test-summary-badge integration-test-summary-pass"><i class="fas fa-check-circle"></i> ' + escapeHtml(checks.filter(function(item) { return item && item.status === 'success'; }).length) + ' passed</div>' +
            '<div class="integration-test-summary-badge integration-test-summary-fail"><i class="fas fa-times-circle"></i> ' + escapeHtml(checks.filter(function(item) { return item && item.status === 'error'; }).length) + ' failed</div>' +
            '<div class="integration-test-summary-badge integration-test-summary-skip"><i class="fas fa-minus-circle"></i> ' + escapeHtml(checks.filter(function(item) { return item && item.status === 'skipped'; }).length) + ' skipped</div>' +
        '</div>' +
        '<div class="integration-test-card integration-test-card-' + escapeHtml(state) + '">' +
            '<div class="integration-test-card-header">' +
                '<div><h4>Vault DB Connection Push</h4><div class="integration-test-card-meta">' + meta.join('') + '</div></div>' +
                '<span class="integration-test-pill integration-test-pill-' + escapeHtml(state) + '">' + escapeHtml(state === 'success' ? 'Saved' : 'Action needed') + '</span>' +
            '</div>' +
            '<div class="integration-test-card-body">' + checks.map(renderAwsIntegrationCheck).join('') + '</div>' +
        '</div>';
}

async function pushVaultDbConnectionFromUi(pushMode, triggerEl) {
    const normalizedPushMode = String(pushMode || 'full').trim().toLowerCase() || 'full';
    const isAllowedRolesOnly = normalizedPushMode === 'allowed_roles_only' || normalizedPushMode === 'roles_only' || normalizedPushMode === 'allowed_roles';
    const payload = collectVaultDbConnectionPushSettingsFromForm(normalizedPushMode);
    if (/^(kv|secret)\//i.test(String(payload.admin_username || '').trim())) {
        setInlineStatus('integrationConfigStatus', 'KV path was entered in Vault Admin Username. Move it to KV Secret Ref and keep username/password empty.', 'error');
        return;
    }
    if (!payload.connection_name) {
        setInlineStatus('integrationConfigStatus', 'Connection name is required.', 'error');
        return;
    }
    if (isAllowedRolesOnly) {
        const normalizedTarget = String(payload.connection_name || '').trim().toLowerCase();
        const knownConnections = Array.isArray(vaultDbConnectionInventory)
            ? vaultDbConnectionInventory
                .map(function(item) { return String((item && item.connection_name) || '').trim(); })
                .filter(Boolean)
            : [];
        const exists = knownConnections.some(function(name) { return name.toLowerCase() === normalizedTarget; });
        if (!exists) {
            const sample = knownConnections.slice(0, 3).join(', ');
            setInlineStatus(
                'integrationConfigStatus',
                'Connection name not found in Vault inventory. Use an existing Vault connection name'
                + (sample ? (': ' + sample) : '.'),
                'error'
            );
            return;
        }
    }
    if (!isAllowedRolesOnly) {
        if (!payload.account_id) {
            setInlineStatus('integrationConfigStatus', 'Select an AWS account first.', 'error');
            return;
        }
        if (!payload.db_instance_id) {
            setInlineStatus('integrationConfigStatus', 'Select a database target first.', 'error');
            return;
        }
        const hasInlineCreds = !!payload.admin_username && !!payload.admin_password;
        const hasSecretRef = !!payload.admin_secret_ref;
        if (hasSecretRef) {
            // KV is the source of truth when provided; ignore inline credentials to avoid accidental mismatch.
            payload.admin_username = '';
            payload.admin_password = '';
        }
        if (!hasInlineCreds && !hasSecretRef) {
            setInlineStatus('integrationConfigStatus', 'Provide either Vault admin username/password or a KV secret reference.', 'error');
            return;
        }
        if (!hasSecretRef && (!!payload.admin_username !== !!payload.admin_password)) {
            setInlineStatus('integrationConfigStatus', 'If not using KV secret reference, provide both admin username and admin password.', 'error');
            return;
        }
    } else {
        payload.admin_username = '';
        payload.admin_password = '';
        payload.admin_secret_ref = '';
    }
    const btn = triggerEl && triggerEl.tagName ? triggerEl : document.getElementById('integrationDbPushBtn');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="integration-test-spinner" aria-hidden="true"></span> Working...';
    }
    setInlineStatus(
        'integrationConfigStatus',
        isAllowedRolesOnly
            ? 'Updating allowed roles on the existing Vault connection...'
            : (!!payload.admin_secret_ref
                ? 'Pushing connection to Vault using KV secret reference and updating NPAMX mapping...'
                : 'Pushing connection to Vault and updating NPAMX mapping...'),
        'info'
    );
    resetIntegrationConfigResults();
    try {
        const data = await apiJson('/admin/integrations/database-connections/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        renderVaultDbConnectionPushResults(data);
        if (String(data.status || '').toLowerCase() === 'success') {
            setInlineStatus(
                'integrationConfigStatus',
                isAllowedRolesOnly
                    ? 'Allowed roles updated successfully on the selected Vault connection.'
                    : 'Vault connection saved successfully. NPAMX will use this mapping for new requests.',
                'success'
            );
            await loadVaultDbConnectionInventory();
        } else {
            throw new Error(String((data && data.error) || 'Failed to push Vault connection.'));
        }
    } catch (err) {
        setInlineStatus('integrationConfigStatus', err.message || 'Failed to push connection to Vault.', 'error');
    } finally {
        const pwdInput = document.getElementById('integrationDbAdminPassword');
        if (pwdInput) pwdInput.value = '';
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml || '<i class="fas fa-cloud-upload-alt"></i> Push to Vault';
        }
    }
}

function setDbUsersInventoryStatus(message, type) {
    setInlineStatus('dbUsersInventoryStatus', message, type || 'info');
}

function renderDbUserInventoryConnections() {
    const wrap = document.getElementById('dbUsersInventoryConnections');
    if (!wrap) return;
    const rowsByConnection = {};
    dbUserInventoryRows.forEach(function(row) {
        const connectionName = String(row.connection_name || '').trim();
        if (!connectionName) return;
        if (!rowsByConnection[connectionName]) {
            rowsByConnection[connectionName] = { total: 0, flagged: 0 };
        }
        rowsByConnection[connectionName].total += 1;
        if (String(row.origin_hint || '').trim() === 'manual_or_unknown') {
            rowsByConnection[connectionName].flagged += 1;
        }
    });
    if (dbUserInventoryLoading && !dbUserInventoryConnections.length) {
        wrap.innerHTML = '<div class="db-user-connection-empty"><i class="fas fa-spinner fa-spin"></i><span>Loading Vault database connections...</span></div>';
        return;
    }
    if (!dbUserInventoryConnections.length) {
        wrap.innerHTML = '<div class="db-user-connection-empty"><i class="fas fa-circle-info"></i><span>No Vault database connections found yet.</span></div>';
        return;
    }
    wrap.innerHTML = dbUserInventoryConnections.map(function(item) {
        const connectionName = String(item.connection_name || '').trim();
        const encodedConnectionName = encodeURIComponent(connectionName);
        const selected = dbUserInventorySelection.has(connectionName);
        const status = String(item.status || '').trim().toLowerCase();
        const note = String(item.status_message || item.last_test_message || item.message || '').trim();
        const engine = String(item.engine || 'unknown').trim();
        const endpoint = String(item.endpoint || item.host || '').trim();
        const port = String(item.port || '').trim();
        const counts = rowsByConnection[connectionName] || { total: 0, flagged: 0 };
        const statusLabel = status === 'success'
            ? 'Ready'
            : status === 'warning'
                ? 'Attention'
                : status === 'unsupported'
                    ? 'Unsupported'
                    : status === 'error'
                        ? 'Error'
                        : 'Available';
        const statusClass = status === 'success'
            ? 'db-user-connection-pill-success'
            : status === 'warning'
                ? 'db-user-connection-pill-warning'
                : status === 'unsupported'
                    ? 'db-user-connection-pill-neutral'
                    : status === 'error'
                        ? 'db-user-connection-pill-error'
                        : 'db-user-connection-pill-neutral';
        const selectedClass = selected ? ' is-selected' : '';
        const flaggedClass = counts.flagged ? ' has-review-flag' : '';
        const metrics = [];
        metrics.push('<span class="db-user-connection-metric"><i class="fas fa-database"></i> ' + escapeHtml(engine) + '</span>');
        if (endpoint) metrics.push('<span class="db-user-connection-metric"><i class="fas fa-server"></i> ' + escapeHtml(endpoint + (port ? (':' + port) : '')) + '</span>');
        if (status === 'success' || status === 'warning' || counts.total) metrics.push('<span class="db-user-connection-metric"><i class="fas fa-users"></i> ' + escapeHtml(String(counts.total)) + ' users</span>');
        return ''
            + '<label class="db-user-connection-card' + selectedClass + flaggedClass + '">'
            + '<div class="db-user-connection-card-top">'
            + '<div class="db-user-connection-checkbox">'
            + '<input type="checkbox" ' + (selected ? 'checked ' : '') + 'onchange="toggleDbUserInventoryConnectionSelection(decodeURIComponent(\'' + encodedConnectionName + '\'), this.checked)">'
            + '</div>'
            + '<div class="db-user-connection-copy">'
            + '<div class="db-user-connection-title-row">'
            + '<strong>' + escapeHtml(connectionName) + '</strong>'
            + '<span class="db-user-connection-pill ' + statusClass + '">' + escapeHtml(statusLabel) + '</span>'
            + '</div>'
            + '<div class="db-user-connection-meta">' + metrics.join('') + '</div>'
            + (note ? '<div class="db-user-connection-note">' + escapeHtml(note) + '</div>' : '')
            + '</div>'
            + '</div>'
            + '<div class="db-user-connection-footer">'
            + (counts.flagged
                ? '<span class="db-user-connection-alert"><i class="fas fa-triangle-exclamation"></i> Review needed for ' + escapeHtml(String(counts.flagged)) + ' user(s)</span>'
                : '<span class="db-user-connection-alert db-user-connection-alert-ok"><i class="fas fa-circle-check"></i> No unexpected users flagged in the latest scan</span>')
            + '</div>'
            + '</label>';
    }).join('');
}

function renderDbUserInventorySummary(summary) {
    const box = document.getElementById('dbUsersInventorySummary');
    if (!box) return;
    const src = summary && typeof summary === 'object' ? summary : null;
    if (!src) {
        box.innerHTML = 'Select one or more Vault connections, then click <strong>Fetch Users</strong>.';
        return;
    }
    box.innerHTML = ''
        + '<div class="notification-card-title-row"><strong>Inventory Summary</strong></div>'
        + '<div class="notification-card-meta">'
        + 'Selected: ' + escapeHtml(String(src.selected_connections || 0))
        + ' • Supported: ' + escapeHtml(String(src.supported_connections || 0))
        + ' • Unsupported: ' + escapeHtml(String(src.unsupported_connections || 0))
        + ' • Errors: ' + escapeHtml(String(src.error_connections || 0))
        + '</div>'
        + '<div class="notification-card-body">'
        + 'Total users: <strong>' + escapeHtml(String(src.total_users || 0)) + '</strong>'
        + ' • Vault dynamic: <strong>' + escapeHtml(String(src.vault_dynamic_users || 0)) + '</strong>'
        + ' • System/default: <strong>' + escapeHtml(String(src.system_users || 0)) + '</strong>'
        + ' • Vault admin: <strong>' + escapeHtml(String(src.connection_admin_users || 0)) + '</strong>'
        + ' • Flagged for review: <strong>' + escapeHtml(String(src.manual_or_unknown_users || 0)) + '</strong>'
        + '</div>';
}

function renderDbUserInventoryScheduleCard() {
    const scheduleWrap = document.getElementById('dbUsersAuditScheduleSummary');
    if (scheduleWrap) {
        const lastRun = dbUserInventoryLastRun && typeof dbUserInventoryLastRun === 'object' ? dbUserInventoryLastRun : {};
        const testedAt = String(lastRun.tested_at || '').trim();
        const trigger = String(lastRun.trigger || '').trim() || 'manual';
        const processed = Number(lastRun.processed_connections || 0);
        const flagged = Number(lastRun.manual_or_unknown_users || 0);
        scheduleWrap.innerHTML = testedAt
            ? '<strong>Last audit:</strong> ' + escapeHtml(formatDateTimeIst(testedAt)) + ' • '
                + escapeHtml(trigger === 'scheduled' ? 'Scheduled run' : 'On-demand run')
                + ' • Processed ' + escapeHtml(String(processed)) + ' connection(s)'
                + ' • Flagged ' + escapeHtml(String(flagged)) + ' user(s)'
            : 'No DB user audit has run yet.';
    }
    const enabledEl = document.getElementById('dbUserAuditScheduleEnabled');
    const weekdayEl = document.getElementById('dbUserAuditScheduleWeekday');
    const timeEl = document.getElementById('dbUserAuditScheduleTime');
    const notifyEl = document.getElementById('dbUserAuditNotifyOnRedFlag');
    const badgeEl = document.getElementById('dbUsersAuditScheduleBadge');
    if (enabledEl) enabledEl.checked = !!appSettings.db_user_audit_schedule_enabled;
    if (weekdayEl) weekdayEl.value = String(appSettings.db_user_audit_schedule_weekday || 'Sun').trim() || 'Sun';
    if (timeEl) timeEl.value = String(appSettings.db_user_audit_schedule_time_ist || '09:00').trim() || '09:00';
    if (notifyEl) notifyEl.checked = appSettings.db_user_audit_notify_on_red_flag !== false;
    if (badgeEl) {
        const enabled = !!appSettings.db_user_audit_schedule_enabled;
        badgeEl.className = 'db-user-scheduler-badge ' + (enabled ? 'is-enabled' : 'is-disabled');
        badgeEl.textContent = enabled ? 'Scheduled' : 'Paused';
    }
}

function renderDbUserInventoryRows() {
    const tbody = document.getElementById('dbUsersInventoryTableBody');
    if (!tbody) return;
    if (!dbUserInventoryRows.length) {
        const summary = dbUserInventoryLastSummary && typeof dbUserInventoryLastSummary === 'object' ? dbUserInventoryLastSummary : {};
        const processedConnections = Number(summary.processed_connections || 0);
        const errorConnections = Number(summary.error_connections || 0);
        const unsupportedConnections = Number(summary.unsupported_connections || 0);
        const message = processedConnections > 0
            ? (
                errorConnections > 0
                    ? 'The audit ran, but no user rows were returned. Check the connection cards above for Vault or database errors.'
                    : (unsupportedConnections > 0
                        ? 'The audit ran, but the selected connections do not support user inventory yet.'
                        : 'The audit ran, but no database user rows were returned for the selected connections.')
            )
            : 'No database user inventory loaded yet.';
        tbody.innerHTML = '<tr><td colspan="8" class="text-muted">' + escapeHtml(message) + '</td></tr>';
        return;
    }
    tbody.innerHTML = dbUserInventoryRows.map(function(item) {
        const origin = String(item.origin_hint || 'unknown').trim();
        const needsReview = origin === 'manual_or_unknown';
        const originLabel = origin === 'vault_dynamic'
            ? 'Vault dynamic'
            : origin === 'system'
                ? 'System/default'
                : origin === 'vault_connection_admin'
                    ? 'Vault admin'
                    : 'Manual or unknown';
        const reviewBadge = needsReview
            ? '<span class="db-user-review-pill db-user-review-pill-flagged"><i class="fas fa-triangle-exclamation"></i> Review needed</span>'
            : (origin === 'vault_dynamic'
                ? '<span class="db-user-review-pill db-user-review-pill-ok"><i class="fas fa-circle-check"></i> Expected</span>'
                : ((origin === 'system' || origin === 'vault_connection_admin')
                    ? '<span class="db-user-review-pill db-user-review-pill-system"><i class="fas fa-shield"></i> Allowlisted</span>'
                    : '<span class="db-user-review-pill db-user-review-pill-neutral"><i class="fas fa-circle-info"></i> Informational</span>'));
        return ''
            + '<tr' + (needsReview ? ' class="db-user-row-flagged"' : '') + '>'
            + '<td><strong>' + escapeHtml(String(item.connection_name || '')) + '</strong></td>'
            + '<td>' + escapeHtml(String(item.engine || '')) + '</td>'
            + '<td><code>' + escapeHtml(String(item.host || '') + (item.port ? (':' + String(item.port || '')) : '')) + '</code></td>'
            + '<td><div class="db-user-identity-cell"><strong>' + escapeHtml(String(item.username || '')) + '</strong>' + (needsReview ? '<div class="db-user-identity-note">Does not start with <code>d-</code> or <code>dwh-</code>.</div>' : '') + '</div></td>'
            + '<td>' + escapeHtml(String(item.db_host || '')) + '</td>'
            + '<td>' + escapeHtml(String(item.plugin || '')) + '</td>'
            + '<td><span class="integration-test-pill ' + (origin === 'vault_dynamic' ? 'integration-test-pill-success' : (origin === 'manual_or_unknown' ? 'integration-test-pill-error' : 'integration-test-pill-skip')) + '">' + escapeHtml(originLabel) + '</span></td>'
            + '<td>' + reviewBadge + '</td>'
            + '</tr>';
    }).join('');
}

async function refreshDbUserInventoryConnections() {
    const plane = getSelectedVaultPlane('nonprod');
    dbUserInventoryLoading = true;
    renderDbUserInventoryConnections();
    setDbUsersInventoryStatus('Refreshing Vault database connections for user inventory on ' + plane + ' plane...', 'info');
    try {
        const data = await apiJson('/admin/integrations/database-connections?plane=' + encodeURIComponent(plane));
        dbUserInventoryConnections = Array.isArray(data.connections) ? data.connections : [];
        if (!dbUserInventorySelection.size) {
            dbUserInventoryConnections.forEach(function(item) {
                const name = String(item.connection_name || '').trim();
                if (name) dbUserInventorySelection.add(name);
            });
        } else {
            dbUserInventorySelection = new Set(
                Array.from(dbUserInventorySelection).filter(function(name) {
                    return dbUserInventoryConnections.some(function(item) { return String(item.connection_name || '').trim() === name; });
                })
            );
        }
        renderDbUserInventoryConnections();
        setDbUsersInventoryStatus(
            dbUserInventoryConnections.length
                ? 'Vault connection inventory loaded. Select the databases you want to inspect.'
                : 'Vault returned no database connections for user inventory yet.',
            'info'
        );
    } catch (err) {
        dbUserInventoryConnections = [];
        renderDbUserInventoryConnections();
        setDbUsersInventoryStatus(err.message || 'Failed to refresh Vault connections for user inventory.', 'error');
    } finally {
        dbUserInventoryLoading = false;
        renderDbUserInventoryConnections();
    }
}

function selectAllDbUserInventoryConnections(checked) {
    if (checked) {
        dbUserInventorySelection = new Set(
            dbUserInventoryConnections.map(function(item) { return String(item.connection_name || '').trim(); }).filter(Boolean)
        );
    } else {
        dbUserInventorySelection = new Set();
    }
    renderDbUserInventoryConnections();
}

function toggleDbUserInventoryConnectionSelection(connectionName, checked) {
    const name = String(connectionName || '').trim();
    if (!name) return;
    if (checked) dbUserInventorySelection.add(name);
    else dbUserInventorySelection.delete(name);
    renderDbUserInventoryConnections();
}

async function runDbUserInventoryScan() {
    const plane = getSelectedVaultPlane('nonprod');
    const connectionNames = Array.from(dbUserInventorySelection).filter(Boolean);
    if (!connectionNames.length) {
        setDbUsersInventoryStatus('Select at least one Vault database connection to scan.', 'error');
        return;
    }
    setDbUsersInventoryStatus('Scanning selected databases through Vault temporary credentials...', 'info');
    try {
        const data = await apiJson('/admin/security/database-user-audit/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plane: plane, connection_names: connectionNames })
        });
        dbUserInventoryRows = Array.isArray(data.rows) ? data.rows : [];
        dbUserInventoryLastSummary = data && typeof data === 'object' && data.summary && typeof data.summary === 'object' ? data.summary : null;
        dbUserInventoryLastRun = data && typeof data === 'object' ? {
            tested_at: data.tested_at,
            tested_by: data.tested_by,
            trigger: 'manual',
            processed_connections: Number(((data.summary || {}).processed_connections) || 0),
            manual_or_unknown_users: Number(((data.summary || {}).manual_or_unknown_users) || 0)
        } : null;
        renderDbUserInventorySummary(data.summary || null);
        renderDbUserInventoryConnections();
        renderDbUserInventoryRows();
        renderDbUserInventoryScheduleCard();
        const manualCount = Number((data.summary || {}).manual_or_unknown_users || 0);
        setDbUsersInventoryStatus(
            'Database user inventory completed for ' + connectionNames.length + ' selected connection(s).'
            + (manualCount ? (' ' + manualCount + ' user(s) need manual review.') : ''),
            manualCount ? 'warning' : 'success'
        );
    } catch (err) {
        dbUserInventoryRows = [];
        dbUserInventoryLastSummary = null;
        renderDbUserInventoryConnections();
        renderDbUserInventoryRows();
        renderDbUserInventorySummary(null);
        setDbUsersInventoryStatus(err.message || 'Failed to scan database users through Vault.', 'error');
    }
}

async function loadDbUserInventoryAuditState() {
    try {
        const data = await apiJson('/admin/security/database-user-audit/state');
        dbUserInventoryLastRun = data && typeof data === 'object' && data.last_run && typeof data.last_run === 'object' ? data.last_run : null;
        renderDbUserInventoryScheduleCard();
    } catch (_) {
        dbUserInventoryLastRun = null;
        renderDbUserInventoryScheduleCard();
    }
}

async function saveDbUserAuditSchedule() {
    const latestSettings = await loadAdminSettings().catch(function() { return Object.assign({}, appSettings); });
    const payload = Object.assign({}, latestSettings, {
        db_user_audit_schedule_enabled: !!document.getElementById('dbUserAuditScheduleEnabled')?.checked,
        db_user_audit_schedule_weekday: String((document.getElementById('dbUserAuditScheduleWeekday') || {}).value || 'Sun').trim() || 'Sun',
        db_user_audit_schedule_time_ist: String((document.getElementById('dbUserAuditScheduleTime') || {}).value || '09:00').trim() || '09:00',
        db_user_audit_notify_on_red_flag: !!document.getElementById('dbUserAuditNotifyOnRedFlag')?.checked,
    });
    try {
        await saveAdminSettings(payload);
        renderDbUserInventoryScheduleCard();
        setDbUsersInventoryStatus('DB user audit schedule saved successfully.', 'success');
    } catch (err) {
        setDbUsersInventoryStatus(err.message || 'Failed to save DB user audit schedule.', 'error');
    }
}

function downloadDbUserInventoryCsv() {
    if (!dbUserInventoryRows.length) {
        setDbUsersInventoryStatus('No database user inventory is loaded yet.', 'error');
        return;
    }
    const headers = ['connection_name', 'engine', 'host', 'port', 'username', 'db_host', 'plugin', 'origin_hint', 'vault_managed'];
    const csv = [
        headers.join(','),
        ...dbUserInventoryRows.map(function(item) {
            return headers.map(function(key) {
                const raw = item && Object.prototype.hasOwnProperty.call(item, key) ? item[key] : '';
                const value = String(raw == null ? '' : raw).replace(/"/g, '""');
                return '"' + value + '"';
            }).join(',');
        })
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'npamx_db_user_inventory_' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

async function loadDbUserInventorySection() {
    renderDbUserInventorySummary(null);
    renderDbUserInventoryRows();
    renderDbUserInventoryScheduleCard();
    await loadDbUserInventoryAuditState();
    await refreshDbUserInventoryConnections();
}

function collectDbConnectionTestSettingsFromForm() {
    const accountId = String((document.getElementById('integrationDbTestAccount') || {}).value || '').trim();
    const instanceSelect = document.getElementById('integrationDbTestInstance');
    const selectedOption = instanceSelect && instanceSelect.options ? instanceSelect.options[instanceSelect.selectedIndex] : null;
    return {
        account_id: accountId,
        db_instance_id: String((instanceSelect || {}).value || '').trim(),
        region: String((selectedOption && selectedOption.getAttribute('data-region')) || '').trim(),
        connection_name: String((document.getElementById('integrationDbConnectionName') || {}).value || '').trim(),
    };
}

function renderDbConnectionIntegrationResults(payload) {
    const el = document.getElementById('integrationConfigResults');
    if (!el) return;
    const result = (payload && payload.result) || {};
    const checks = Array.isArray(result.checks) ? result.checks : [];
    const grants = Array.isArray(result.grants) ? result.grants : [];
    const successCount = checks.filter(function(item) { return item.status === 'success'; }).length;
    const failureCount = checks.filter(function(item) { return item.status === 'error'; }).length;
    const skippedCount = checks.filter(function(item) { return item.status === 'skipped'; }).length;
    const state = failureCount ? 'error' : 'success';
    const meta = [
        result.connection_name ? ('<span>Connection ' + escapeHtml(result.connection_name) + '</span>') : '',
        result.account_id ? ('<span>Account ' + escapeHtml(result.account_id) + '</span>') : '',
        result.instance_id ? ('<span>Instance ' + escapeHtml(result.instance_id) + '</span>') : '',
        result.plane ? ('<span>Plane ' + escapeHtml(result.plane) + '</span>') : '',
        result.plugin_name ? ('<span>' + escapeHtml(result.plugin_name) + '</span>') : '',
        result.engine ? ('<span>' + escapeHtml(result.engine) + '</span>') : '',
        result.connection_mode ? ('<span>' + escapeHtml(String(result.connection_mode).toUpperCase()) + '</span>') : '',
        result.host ? ('<code>' + escapeHtml(String(result.host || '') + (result.port ? ':' + String(result.port || '') : '')) + '</code>') : '',
        result.tested_username ? ('<code>' + escapeHtml(result.tested_username) + '</code>') : ''
    ].filter(Boolean);
    const grantsHtml = grants.length
        ? '<div class="integration-test-check integration-test-check-success"><div class="integration-test-check-icon"><i class="fas fa-key"></i></div><div class="integration-test-check-copy"><div class="integration-test-check-title">Observed grants</div><div class="integration-test-check-message">' + grants.map(function(grant) { return '<code style="display:block; margin-top:6px;">' + escapeHtml(grant) + '</code>'; }).join('') + '</div></div></div>'
        : '';
    el.hidden = false;
    el.innerHTML = '' +
        '<div class="integration-test-summary">' +
            '<div class="integration-test-summary-badge integration-test-summary-pass"><i class="fas fa-check-circle"></i> ' + escapeHtml(successCount) + ' passed</div>' +
            '<div class="integration-test-summary-badge integration-test-summary-fail"><i class="fas fa-times-circle"></i> ' + escapeHtml(failureCount) + ' failed</div>' +
            '<div class="integration-test-summary-badge integration-test-summary-skip"><i class="fas fa-minus-circle"></i> ' + escapeHtml(skippedCount) + ' skipped</div>' +
        '</div>' +
        '<div class="integration-test-card integration-test-card-' + escapeHtml(state) + '">' +
            '<div class="integration-test-card-header">' +
                '<div>' +
                    '<h4>Vault DB Connection Test</h4>' +
                    '<div class="integration-test-card-meta">' + meta.join('') + '</div>' +
                '</div>' +
                '<span class="integration-test-pill integration-test-pill-' + escapeHtml(state) + '">' + escapeHtml(state === 'success' ? 'Ready' : 'Action needed') + '</span>' +
            '</div>' +
            '<div class="integration-test-card-body">' + checks.map(renderAwsIntegrationCheck).join('') + grantsHtml + '</div>' +
        '</div>';
}

async function testIntegrationConfiguration() {
    if (activeIntegrationProvider !== 'aws' && activeIntegrationProvider !== 'rds_proxy' && activeIntegrationProvider !== 'sns' && activeIntegrationProvider !== 'identity_center_login' && activeIntegrationProvider !== 'jumpcloud' && activeIntegrationProvider !== 'gmail' && activeIntegrationProvider !== 'desktop_agent' && activeIntegrationProvider !== 'audit_export') return;
    resetIntegrationConfigResults();
    const isProxyOnly = activeIntegrationProvider === 'rds_proxy';
    const isSns = activeIntegrationProvider === 'sns';
    const isIdentityCenter = activeIntegrationProvider === 'identity_center_login';
    const isJumpCloud = activeIntegrationProvider === 'jumpcloud';
    const isGmail = activeIntegrationProvider === 'gmail';
    const isDesktopAgent = activeIntegrationProvider === 'desktop_agent';
    const isAuditExport = activeIntegrationProvider === 'audit_export';
    setInlineStatus(
        'integrationConfigStatus',
        isJumpCloud
            ? 'Validating JumpCloud profile sync configuration and required attribute mappings...'
            : isGmail
            ? 'Validating Google Workspace mail settings, secret lookups, and OAuth refresh token exchange...'
            : isDesktopAgent
            ? 'Checking desktop agent connectivity, Identity Center pairing configuration, and heartbeat status...'
            : isAuditExport
            ? 'Checking S3 bucket access and CSV write permissions for the NPAMX activity archive...'
            : isIdentityCenter
            ? 'Validating Identity Center SAML metadata and derived ACS/Audience values...'
            : isSns
            ? 'Testing SNS topic publish from the PAM backend...'
            :
        isProxyOnly
            ? 'Testing RDS Proxy configuration and connectivity from the PAM server...'
            : 'Testing AWS role assumptions, DB proxy configuration, and API access...',
        'info'
    );
    const resultsEl = document.getElementById('integrationConfigResults');
    if (resultsEl) {
        resultsEl.hidden = false;
        resultsEl.innerHTML = '<div class="integration-test-loading"><span class="integration-test-spinner" aria-hidden="true"></span><div><strong>Running validation</strong><p>' + escapeHtml(
            isJumpCloud
                ? 'Checking that JumpCloud profile sync is enabled, the API base URL is valid, a secret reference is present for the API key, and the manager/department/job title mappings are defined.'
                : isGmail
                ? 'Checking that Gmail is enabled, the sender mailbox and project details are present, secret references resolve correctly, and Google accepts the configured refresh token.'
                : isDesktopAgent
                ? 'Checking desktop agent auth mode, package availability, and whether any agent has sent a recent heartbeat.'
                : isAuditExport
                ? 'Checking that the configured S3 bucket is reachable from NPAMX, a CSV probe object can be written under the selected prefix, and the probe can be cleaned up.'
                : isIdentityCenter
                ? 'Parsing the uploaded metadata XML on the PAM backend and validating the derived SAML URLs.'
                : isSns
                ? 'Publishing a test notification to the configured SNS topic using the current PAM backend credentials.'
                :
            isProxyOnly
                ? 'Resolving the configured proxy endpoint and checking TCP connectivity from this PAM server.'
                : 'Attempting AssumeRole, AWS API access, and DB proxy connectivity checks for the configured integrations.'
        ) + '</p></div></div>';
    }
    setIntegrationTestLoading(true);
    try {
        const payload = isJumpCloud ? {
            jumpcloud_enabled: !!document.getElementById('integrationJumpcloudEnabled')?.checked,
            jumpcloud_api_base_url: String((document.getElementById('integrationJumpcloudApiBaseUrl') || {}).value || '').trim(),
            jumpcloud_api_key_secret_name: String((document.getElementById('integrationJumpcloudApiKeySecretName') || {}).value || '').trim(),
            jumpcloud_user_lookup_field: String((document.getElementById('integrationJumpcloudLookupField') || {}).value || '').trim() || 'email',
            jumpcloud_manager_attribute_name: String((document.getElementById('integrationJumpcloudManagerAttribute') || {}).value || '').trim() || 'manager',
            jumpcloud_department_attribute_name: String((document.getElementById('integrationJumpcloudDepartmentAttribute') || {}).value || '').trim() || 'department',
            jumpcloud_job_title_attribute_name: String((document.getElementById('integrationJumpcloudJobTitleAttribute') || {}).value || '').trim() || 'jobTitle',
            jumpcloud_sync_mode: String((document.getElementById('integrationJumpcloudSyncMode') || {}).value || '').trim() || 'on_demand',
            jumpcloud_directory_id: String((document.getElementById('integrationJumpcloudDirectoryId') || {}).value || '').trim(),
            jumpcloud_admin_contact: String((document.getElementById('integrationJumpcloudAdminContact') || {}).value || '').trim(),
        } : isGmail ? {
            gmail_notifications_enabled: !!document.getElementById('integrationGmailEnabled')?.checked,
            gmail_sender_email: String((document.getElementById('integrationGmailSenderEmail') || {}).value || '').trim(),
            gmail_sender_display_name: String((document.getElementById('integrationGmailSenderDisplayName') || {}).value || '').trim() || 'NPAMx',
            gmail_workspace_domain: String((document.getElementById('integrationGmailWorkspaceDomain') || {}).value || '').trim(),
            gmail_workspace_admin_contact: String((document.getElementById('integrationGmailWorkspaceAdminContact') || {}).value || '').trim(),
            gmail_project_id: String((document.getElementById('integrationGmailProjectId') || {}).value || '').trim(),
            gmail_oauth_client_id: String((document.getElementById('integrationGmailOauthClientId') || {}).value || '').trim(),
            gmail_client_secret_name: String((document.getElementById('integrationGmailClientSecretName') || {}).value || '').trim(),
            gmail_refresh_token_secret_name: String((document.getElementById('integrationGmailRefreshTokenSecretName') || {}).value || '').trim(),
        } : isDesktopAgent ? {
            desktop_agent_enabled: !!document.getElementById('integrationDesktopAgentEnabled')?.checked,
            desktop_agent_auth_mode: String((document.getElementById('integrationDesktopAgentAuthMode') || {}).value || '').trim() || 'identity_center',
            desktop_agent_shared_token: String((document.getElementById('integrationDesktopAgentToken') || {}).value || '').trim(),
            desktop_agent_network_scope: String((document.getElementById('integrationDesktopAgentNetworkScope') || {}).value || '').trim() || 'netskope',
            desktop_agent_download_delivery: String((document.getElementById('integrationDesktopAgentDownloadDelivery') || {}).value || '').trim() || 's3_proxy',
            desktop_agent_download_s3_bucket: String((document.getElementById('integrationDesktopAgentS3Bucket') || {}).value || '').trim(),
            desktop_agent_download_s3_region: String((document.getElementById('integrationDesktopAgentS3Region') || {}).value || '').trim(),
            desktop_agent_download_s3_key_windows: String((document.getElementById('integrationDesktopAgentS3KeyWindows') || {}).value || '').trim(),
            desktop_agent_download_s3_key_macos: String((document.getElementById('integrationDesktopAgentS3KeyMacos') || {}).value || '').trim(),
            desktop_agent_download_s3_key_linux: String((document.getElementById('integrationDesktopAgentS3KeyLinux') || {}).value || '').trim(),
            desktop_agent_download_url_windows: String((document.getElementById('integrationDesktopAgentWindowsUrl') || {}).value || '').trim(),
            desktop_agent_download_url_macos: String((document.getElementById('integrationDesktopAgentMacosUrl') || {}).value || '').trim(),
            desktop_agent_download_url_linux: String((document.getElementById('integrationDesktopAgentLinuxUrl') || {}).value || '').trim(),
            desktop_agent_heartbeat_ttl_seconds: Number.parseInt(String((document.getElementById('integrationDesktopAgentHeartbeatTtl') || {}).value || '180').trim(), 10) || 180,
            desktop_agent_pairing_code_ttl_seconds: Number.parseInt(String((document.getElementById('integrationDesktopAgentPairingCodeTtl') || {}).value || '600').trim(), 10) || 600,
            desktop_agent_pairing_poll_interval_seconds: Number.parseInt(String((document.getElementById('integrationDesktopAgentPairingPollInterval') || {}).value || '5').trim(), 10) || 5,
        } : isAuditExport ? {
            audit_logs_bucket: String((document.getElementById('integrationAuditBucket') || {}).value || '').trim(),
            audit_logs_prefix: String((document.getElementById('integrationAuditPrefix') || {}).value || '').trim() || 'npamx/audit',
            audit_logs_auto_export: !!document.getElementById('integrationAuditAutoExport')?.checked,
        } : isIdentityCenter ? {
            app_base_url: String((document.getElementById('integrationAppBaseUrl') || {}).value || '').trim(),
            saml_idp_metadata_xml: await readIntegrationFileAsText('integrationSsoMetadataFile')
        } : isSns ? {
            sns_notifications_enabled: !!document.getElementById('integrationSnsEnabled')?.checked,
            sns_topic_arn: String(document.getElementById('integrationSnsTopicArn')?.value || '').trim(),
            request_approver_email_domain: String(document.getElementById('integrationApproverEmailDomain')?.value || '').trim() || 'nykaa.com'
        } : collectAwsIntegrationSettingsFromForm();
        const data = await apiJson(
            isJumpCloud ? '/admin/integrations/jumpcloud/test' : (isGmail ? '/admin/integrations/gmail/test' : (isDesktopAgent ? '/admin/integrations/desktop-agent/test' : (isAuditExport ? '/admin/audit-logs/test' : (isIdentityCenter ? '/admin/integrations/identity-center-login/test' : (isSns ? '/admin/integrations/sns/test' : '/admin/integrations/aws/test'))))),
            {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: payload })
        });
        if (isAuditExport) {
            const checks = Array.isArray(data.result?.checks) ? data.result.checks : [];
            const ok = String(data.status || '').toLowerCase() === 'success';
            const detailHtml = checks.length
                ? checks.map(renderAwsIntegrationCheck).join('')
                : ('<div class="integration-test-check integration-test-check-' + escapeHtml(ok ? 'success' : 'error') + '"><div class="integration-test-check-icon"><i class="fas ' + (ok ? 'fa-circle-check' : 'fa-circle-xmark') + '"></i></div><div class="integration-test-check-copy"><div class="integration-test-check-title">Archive test</div><div class="integration-test-check-message">' + escapeHtml(String((data && (data.error || data.message)) || (ok ? 'S3 archive test passed.' : 'S3 archive test failed.'))) + '</div></div></div>');
            if (resultsEl) {
                resultsEl.hidden = false;
                resultsEl.innerHTML = '' +
                    '<div class="integration-test-summary">' +
                        '<div class="integration-test-summary-badge integration-test-summary-pass"><i class="fas fa-check-circle"></i> ' + escapeHtml(String(checks.filter(function(item) { return item.status === 'success'; }).length)) + ' passed</div>' +
                        '<div class="integration-test-summary-badge integration-test-summary-fail"><i class="fas fa-times-circle"></i> ' + escapeHtml(String(checks.filter(function(item) { return item.status === 'error'; }).length + (ok ? 0 : 1))) + ' failed</div>' +
                        '<div class="integration-test-summary-badge integration-test-summary-skip"><i class="fas fa-minus-circle"></i> ' + escapeHtml(String(checks.filter(function(item) { return item.status === 'warning' || item.status === 'skipped'; }).length)) + ' other</div>' +
                    '</div>' +
                    '<div class="integration-test-card integration-test-card-' + escapeHtml(ok ? 'success' : 'error') + '">' +
                        '<div class="integration-test-card-header"><h4>S3 Activity Archive Test</h4><span class="integration-test-pill integration-test-pill-' + escapeHtml(ok ? 'success' : 'error') + '">' + escapeHtml(ok ? 'Ready' : 'Action needed') + '</span></div>' +
                        '<div class="integration-test-card-body">' +
                            '<div class="integration-test-check integration-test-check-' + escapeHtml(ok ? 'success' : 'error') + '"><div class="integration-test-check-icon"><i class="fas ' + (ok ? 'fa-circle-check' : 'fa-circle-xmark') + '"></i></div><div class="integration-test-check-copy"><div class="integration-test-check-title">Target</div><div class="integration-test-check-message">Bucket ' + escapeHtml(String(data.result?.bucket || payload.audit_logs_bucket || '')) + ' • Prefix ' + escapeHtml(String(data.result?.prefix || payload.audit_logs_prefix || '')) + '</div></div></div>' +
                            detailHtml +
                        '</div>' +
                    '</div>';
            }
        } else if (isJumpCloud || isGmail) {
            renderAwsIntegrationResults(data);
        } else if (isDesktopAgent) {
            renderDesktopAgentIntegrationResults(data);
            desktopAgentRuntimeStatus = (data && data.result && typeof data.result === 'object') ? data.result : desktopAgentRuntimeStatus;
            applyRuntimeSettings();
        } else if (isIdentityCenter) {
            renderIdentityCenterIntegrationResults(data);
        } else if (isSns) {
            if (resultsEl) {
                resultsEl.hidden = false;
                resultsEl.innerHTML = '<div class="integration-test-card integration-test-card-success"><div class="integration-test-card-header"><h4>SNS test passed</h4><span class="integration-test-pill integration-test-pill-success">Ready</span></div><div class="integration-test-card-body"><div class="integration-test-check integration-test-check-success"><div class="integration-test-check-icon"><i class="fas fa-circle-check"></i></div><div class="integration-test-check-copy"><div class="integration-test-check-title">Publish succeeded</div><div class="integration-test-check-message">Test message sent to ' + escapeHtml(data.topic_arn || '') + ' at ' + escapeHtml(data.tested_at || '') + '.</div></div></div></div></div>';
            }
        } else {
            renderAwsIntegrationResults(data);
        }
        if (String(data.status || '').toLowerCase() === 'success') {
            setInlineStatus(
                'integrationConfigStatus',
                isJumpCloud
                    ? 'JumpCloud integration settings look complete. Save when you are ready to use JumpCloud as a read-only profile enrichment source.'
                    : isGmail
                    ? 'Google Workspace mail test passed. Save when you are ready to use this sender mailbox for NPAMX notifications.'
                    : isDesktopAgent
                    ? 'Desktop agent status is healthy. Save to keep this rollout configuration.'
                    : isAuditExport
                    ? 'S3 activity archive test passed. Save when you are ready to use this bucket and prefix.'
                    : isIdentityCenter
                    ? 'Identity Center settings validated on the PAM backend. Save the configuration, then use the derived ACS and Audience values in AWS IAM Identity Center.'
                    : isSns
                    ? 'SNS integration test passed. Save when you are ready to send approver notifications.'
                    :
                isProxyOnly
                    ? 'RDS Proxy connectivity test passed. Save when you are ready to use this endpoint.'
                    : 'AWS integration test passed. Save when you are ready to apply this routing.',
                'info'
            );
        } else {
            setInlineStatus(
                'integrationConfigStatus',
                isJumpCloud
                    ? 'JumpCloud configuration is incomplete. Review the missing fields below before saving.'
                    : isGmail
                    ? 'Google Workspace mail validation failed. Review the exact OAuth or Secrets Manager step below before saving.'
                    : isDesktopAgent
                    ? 'Desktop agent rollout is not ready yet. Fix token/setup or agent heartbeat issues.'
                    : isAuditExport
                    ? 'S3 activity archive validation failed. Review the exact bucket, prefix, or permission error below before saving.'
                    : isIdentityCenter
                    ? 'Identity Center validation failed. Review the exact SAML error below before saving.'
                    : isSns
                    ? 'SNS validation failed. Review the exact error below before saving.'
                    :
                isProxyOnly
                    ? 'RDS Proxy validation failed. Review the exact connectivity error below before saving.'
                    : 'One or more role checks failed. Review the exact errors below before saving.',
                'error'
            );
        }
    } catch (err) {
        if (resultsEl) {
            resultsEl.hidden = false;
            resultsEl.innerHTML = '<div class="integration-test-card integration-test-card-error"><div class="integration-test-card-header"><h4>' + (isJumpCloud ? 'JumpCloud validation failed' : (isGmail ? 'Google Workspace mail test failed' : (isDesktopAgent ? 'Desktop agent status check failed' : (isAuditExport ? 'S3 activity archive test failed' : (isIdentityCenter ? 'Identity Center validation failed' : (isSns ? 'SNS integration test failed' : 'AWS integration test failed')))))) + '</h4><span class="integration-test-pill integration-test-pill-error">Action needed</span></div><div class="integration-test-card-body"><div class="integration-test-check integration-test-check-error"><div class="integration-test-check-icon"><i class="fas fa-circle-xmark"></i></div><div class="integration-test-check-copy"><div class="integration-test-check-title">Request failed</div><div class="integration-test-check-message">' + escapeHtml(err.message || 'Unable to test integration settings.') + '</div></div></div></div></div>';
        }
        setInlineStatus('integrationConfigStatus', err.message || 'Failed to test integration.', 'error');
    } finally {
        setIntegrationTestLoading(false);
    }
}

async function loadPublicSettings(force) {
    if (!force && window.__npamSettingsLoaded) {
        applyRuntimeSettings();
        return appSettings;
    }
    try {
        const data = await apiJson('/settings');
        appSettings = normalizeSettingsPayload(data);
        window.__npamSettingsLoaded = true;
        applyRuntimeSettings();
        updateBreakGlassEntryVisibility();
    } catch (_) {
        applyRuntimeSettings();
        updateBreakGlassEntryVisibility();
    }
    return appSettings;
}

async function loadAdminSettings() {
    const data = await apiJson('/admin/settings');
    appSettings = normalizeSettingsPayload(data);
    window.__npamSettingsLoaded = true;
    applyRuntimeSettings();
    refreshDesktopAgentRuntimeStatus();
    loadSiemS3Panel();
    return appSettings;
}

async function saveAdminSettings(settings) {
    const data = await apiJson('/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: settings || {} })
    });
    appSettings = normalizeSettingsPayload(data);
    window.__npamSettingsLoaded = true;
    applyRuntimeSettings();
    refreshDesktopAgentRuntimeStatus();
    loadSiemS3Panel();
    return appSettings;
}

function showAppHome() {
    showPage(canAccessAdminConsole() ? 'dashboard' : 'home');
}

function openUrlInNewTab(url) {
    const target = String(url || '').trim();
    if (!target) return;
    window.open(target, '_blank', 'noopener');
}

function escapeJsString(value) {
    return String(value == null ? '' : value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '');
}

function parseDocumentationArticlesInput(rawValue) {
    return String(rawValue || '').split('\n').map(function(line) {
        return String(line || '').trim();
    }).filter(Boolean).map(function(line) {
        const parts = line.split('|').map(function(part) { return String(part || '').trim(); });
        const title = parts[0] || '';
        const url = parts[1] || '';
        const keywords = (parts[2] || '').split(',').map(function(item) { return String(item || '').trim(); }).filter(Boolean);
        return { title: title, url: url, keywords: keywords };
    }).filter(function(item) { return item.title && item.url; });
}

function formatDocumentationArticlesInput(items) {
    const list = Array.isArray(items) ? items : [];
    return list.map(function(item) {
        const title = String((item && item.title) || '').trim();
        const url = String((item && item.url) || '').trim();
        const keywords = Array.isArray(item && item.keywords) ? item.keywords.join(', ') : '';
        return [title, url, keywords].join(' | ');
    }).join('\n');
}

function cloneDocumentationArticles(items) {
    return (Array.isArray(items) ? items : []).map(function(item) {
        return {
            title: String((item && item.title) || '').trim(),
            url: String((item && item.url) || '').trim(),
            keywords: Array.isArray(item && item.keywords)
                ? item.keywords.map(function(keyword) { return String(keyword || '').trim(); }).filter(Boolean)
                : []
        };
    }).filter(function(item) { return item.title && item.url; });
}

function renderDocumentationKeywordChips(keywords) {
    const list = Array.isArray(keywords) ? keywords.map(function(item) {
        return String(item || '').trim();
    }).filter(Boolean) : [];
    if (!list.length) return '';
    return '<div class="documentation-keyword-chip-wrap">' + list.map(function(keyword) {
        return '<span class="documentation-keyword-chip">' + escapeHtml(keyword) + '</span>';
    }).join('') + '</div>';
}

function validateDocumentationArticles(items, editingIndex) {
    const list = cloneDocumentationArticles(items);
    const seenTitles = new Map();
    const seenUrls = new Map();
    for (let i = 0; i < list.length; i += 1) {
        const item = list[i];
        const effectiveIndex = Number.isInteger(editingIndex) && i === editingIndex ? editingIndex : i;
        const titleKey = String(item.title || '').trim().toLowerCase();
        const urlKey = String(item.url || '').trim().toLowerCase();
        if (titleKey) {
            if (seenTitles.has(titleKey) && seenTitles.get(titleKey) !== effectiveIndex) {
                return 'An article with the same title already exists.';
            }
            seenTitles.set(titleKey, effectiveIndex);
        }
        if (urlKey) {
            if (seenUrls.has(urlKey) && seenUrls.get(urlKey) !== effectiveIndex) {
                return 'An article with the same URL already exists.';
            }
            seenUrls.set(urlKey, effectiveIndex);
        }
    }
    return '';
}

function updateDocumentationArticleCount() {
    const countEl = document.getElementById('documentationArticlesCount');
    if (!countEl) return;
    const total = documentationArticleDraft.length;
    countEl.textContent = total === 1 ? '1 article' : (String(total) + ' articles');
}

function getDocumentationArticleMatches(query) {
    const articles = Array.isArray(appSettings.documentation_articles) ? appSettings.documentation_articles : [];
    const search = String(query || '').trim().toLowerCase();
    if (!search) return articles;
    return articles.filter(function(item) {
        const haystack = [
            String((item && item.title) || ''),
            ...(Array.isArray(item && item.keywords) ? item.keywords : [])
        ].join(' ').toLowerCase();
        return haystack.indexOf(search) >= 0;
    });
}

function setDocumentationSearchStatus(message, type) {
    const el = document.getElementById('documentationSearchStatus');
    if (!el) return;
    const text = String(message || '').trim();
    if (!text) {
        el.hidden = true;
        el.className = 'documentation-search-status';
        el.textContent = '';
        return;
    }
    el.hidden = false;
    el.className = 'documentation-search-status is-' + String(type || 'info').trim();
    el.textContent = text;
}

function renderDocumentationSearchResults(query) {
    const wrap = document.getElementById('documentationSearchResults');
    if (!wrap) return [];
    const normalizedQuery = String(query || '').trim();
    const matches = getDocumentationArticleMatches(query);
    const totalArticles = Array.isArray(appSettings.documentation_articles) ? appSettings.documentation_articles.length : 0;
    if (!matches.length) {
        const searchTemplate = String(appSettings.documentation_search_url || '').trim();
        const fallbackAction = searchTemplate && normalizedQuery
            ? '<button type="button" class="btn-secondary btn-pam documentation-result-action" onclick="openDocumentationExternalSearch()"><i class="fas fa-external-link-alt"></i> Search external documentation</button>'
            : '';
        setDocumentationSearchStatus(
            normalizedQuery
                ? 'No documentation articles matched "' + normalizedQuery + '".'
                : 'No documentation articles have been configured yet.',
            'warning'
        );
        wrap.innerHTML = '<div class="notification-card notification-card-empty documentation-result-empty"><strong>No matching article links found.</strong><div class="notification-card-body">Try a broader keyword, or use the documentation home page.</div>' + fallbackAction + '</div>';
        return matches;
    }
    setDocumentationSearchStatus(
        normalizedQuery
            ? ('Found ' + matches.length + ' matching article' + (matches.length === 1 ? '' : 's') + ' for "' + normalizedQuery + '".')
            : ('Showing all ' + totalArticles + ' configured article' + (totalArticles === 1 ? '' : 's') + '.'),
        'success'
    );
    wrap.innerHTML = '<div class="documentation-result-list">' + matches.map(function(item) {
        const keywords = Array.isArray(item.keywords) ? item.keywords : [];
        return ''
            + '<div class="documentation-result-card">'
            + '<div class="documentation-result-card-head">'
            + '<div>'
            + '<strong>' + escapeHtml(String(item.title || 'Article')) + '</strong>'
            + '<div class="documentation-result-url">' + escapeHtml(String(item.url || '')) + '</div>'
            + '</div>'
            + '<button type="button" class="btn-secondary btn-pam documentation-result-action" onclick="openUrlInNewTab(\'' + escapeJsString(String(item.url || '')) + '\')"><i class="fas fa-arrow-up-right-from-square"></i> Open</button>'
            + '</div>'
            + renderDocumentationKeywordChips(keywords)
            + '</div>';
    }).join('') + '</div>';
    if (normalizedQuery && typeof wrap.scrollIntoView === 'function') {
        wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return matches;
}

function openDocumentationPortal() {
    const searchTemplate = String(appSettings.documentation_search_url || '').trim();
    const homeUrl = String(appSettings.documentation_home_url || '').trim();
    const articleMatches = Array.isArray(appSettings.documentation_articles) ? appSettings.documentation_articles : [];
    if (searchTemplate || articleMatches.length) {
        const input = document.getElementById('documentationSearchInput');
        if (input) input.value = '';
        renderDocumentationSearchResults('');
        showModal('documentationSearchModal');
        return;
    }
    if (homeUrl) {
        openUrlInNewTab(homeUrl);
        return;
    }
    alert('Documentation is not configured yet.');
}

function openDocumentationHome() {
    const homeUrl = String(appSettings.documentation_home_url || '').trim();
    if (!homeUrl) {
        alert('Documentation home URL is not configured.');
        return;
    }
    closeModal();
    openUrlInNewTab(homeUrl);
}

function openDocumentationExternalSearch() {
    const query = String((document.getElementById('documentationSearchInput') || {}).value || '').trim();
    const template = String(appSettings.documentation_search_url || '').trim();
    if (!template) {
        openDocumentationHome();
        return;
    }
    const target = template.indexOf('{query}') >= 0
        ? template.replace('{query}', encodeURIComponent(query))
        : (template + (template.indexOf('?') >= 0 ? '&' : '?') + 'q=' + encodeURIComponent(query));
    closeModal();
    openUrlInNewTab(target);
}

function searchDocumentationArticles() {
    const query = String((document.getElementById('documentationSearchInput') || {}).value || '').trim();
    renderDocumentationSearchResults(query);
}

function renderDocumentationArticlesAdminList() {
    const wrap = document.getElementById('documentationArticlesAdminList');
    if (!wrap) return;
    updateDocumentationArticleCount();
    if (!documentationArticleDraft.length) {
        wrap.innerHTML = '<div class="documentation-admin-empty">No articles added yet. Click <strong>Add Article</strong> to start building the catalog.</div>';
        return;
    }
    wrap.innerHTML = documentationArticleDraft.map(function(item, index) {
        const keywords = Array.isArray(item.keywords) ? item.keywords : [];
        return ''
            + '<div class="documentation-admin-item">'
            + '<div class="documentation-admin-item-copy">'
            + '<strong>' + escapeHtml(String(item.title || 'Untitled article')) + '</strong>'
            + '<div class="documentation-admin-item-url">' + escapeHtml(String(item.url || '')) + '</div>'
            + (keywords.length ? renderDocumentationKeywordChips(keywords) : '<div class="documentation-admin-item-keywords">No keywords added yet.</div>')
            + '</div>'
            + '<div class="documentation-admin-item-actions">'
            + '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="openDocumentationArticleEditor(' + index + ')"><i class="fas fa-pen"></i> Edit</button>'
            + '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="deleteDocumentationArticle(' + index + ')"><i class="fas fa-trash"></i> Remove</button>'
            + '</div>'
            + '</div>';
    }).join('');
}

function openDocumentationArticleEditor(index) {
    const editingExisting = Number.isInteger(index) && index >= 0 && index < documentationArticleDraft.length;
    documentationArticleEditIndex = editingExisting ? index : -1;
    const item = editingExisting ? documentationArticleDraft[index] : { title: '', url: '', keywords: [] };
    const titleEl = document.getElementById('documentationArticleTitle');
    const urlEl = document.getElementById('documentationArticleUrl');
    const keywordsEl = document.getElementById('documentationArticleKeywords');
    const modalTitle = document.getElementById('documentationArticleEditorTitle');
    const status = document.getElementById('documentationArticleEditorStatus');
    if (titleEl) titleEl.value = String(item.title || '');
    if (urlEl) urlEl.value = String(item.url || '');
    if (keywordsEl) keywordsEl.value = Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
    if (modalTitle) {
        modalTitle.innerHTML = editingExisting
            ? '<i class="fas fa-pen"></i> Edit Documentation Article'
            : '<i class="fas fa-plus"></i> Add Documentation Article';
    }
    if (status) {
        status.hidden = true;
        status.textContent = '';
        status.removeAttribute('data-variant');
    }
    const integrationModal = document.getElementById('integrationConfigModal');
    if (integrationModal) integrationModal.classList.remove('show');
    showModal('documentationArticleEditorModal');
}

function closeDocumentationArticleEditor() {
    documentationArticleEditIndex = -1;
    closeModal();
    if (activeIntegrationProvider === 'confluence') {
        showModal('integrationConfigModal');
    }
}

function saveDocumentationArticleEditor(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    const title = String((document.getElementById('documentationArticleTitle') || {}).value || '').trim();
    const url = String((document.getElementById('documentationArticleUrl') || {}).value || '').trim();
    const keywords = String((document.getElementById('documentationArticleKeywords') || {}).value || '')
        .split(',')
        .map(function(item) { return String(item || '').trim(); })
        .filter(Boolean);
    const status = document.getElementById('documentationArticleEditorStatus');
    if (!title || !url) {
        setInlineStatus('documentationArticleEditorStatus', 'Title and URL are required.', 'error');
        return;
    }
    const article = { title: title, url: url, keywords: keywords };
    const nextDraft = cloneDocumentationArticles(documentationArticleDraft);
    if (documentationArticleEditIndex >= 0 && documentationArticleEditIndex < nextDraft.length) {
        nextDraft[documentationArticleEditIndex] = article;
    } else {
        nextDraft.push(article);
    }
    const validationError = validateDocumentationArticles(nextDraft, documentationArticleEditIndex);
    if (validationError) {
        setInlineStatus('documentationArticleEditorStatus', validationError, 'error');
        return;
    }
    documentationArticleDraft = nextDraft;
    renderDocumentationArticlesAdminList();
    if (status) {
        status.hidden = true;
        status.textContent = '';
    }
    documentationArticleEditIndex = -1;
    closeModal();
    showModal('integrationConfigModal');
}

function deleteDocumentationArticle(index) {
    if (!(Number.isInteger(index) && index >= 0 && index < documentationArticleDraft.length)) return;
    documentationArticleDraft.splice(index, 1);
    renderDocumentationArticlesAdminList();
}

function openSupportContact() {
    const email = String(appSettings.support_email || '').trim();
    if (!email) {
        alert('Support contact is not configured yet.');
        return;
    }
    const subject = encodeURIComponent('NPAMx Support Request');
    const body = encodeURIComponent('Please describe the issue you need help with.');
    const gmailUrl = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(email) + '&su=' + subject + '&body=' + body;
    const opened = window.open(gmailUrl, '_blank', 'noopener');
    if (!opened) {
        window.location.href = 'mailto:' + encodeURIComponent(email) + '?subject=' + subject + '&body=' + body;
    }
}

// Navigation
function showPage(pageId) {
    pageId = canonicalPageId(pageId) || pageId;
    const workflowRedirectToManagement = pageId === 'workflow';
    if (workflowRedirectToManagement) {
        pageId = 'admin';
    }
    const requiredCapability = capabilityForPage(pageId);
    if (requiredCapability && !hasPamCapability(requiredCapability)) {
        alert('You do not have access to this area.');
        pageId = firstAccessiblePage();
    }
    if (!isPageEnabledByFeatureFlags(pageId)) {
        alert('This feature is currently disabled by administrator.');
        pageId = firstAccessiblePage();
    }
    if (isBusinessProfileGateActive() && pageId !== 'home') {
        pageId = 'home';
        showModal('profileModal');
        setInlineStatus('profileStatus', 'Confirm your manager, enter your team name, and save your profile before using NPAMX.', 'warning');
    }

    document.body.setAttribute('data-page', pageId || '');
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
        page.style.removeProperty('display');
        page.style.removeProperty('visibility');
    });

    // Show selected page (skip if page was removed, e.g. azure/oracle in trimmed nykaa-jit)
    const pageEl = document.getElementById(pageId + 'Page');
    if (pageEl) {
        pageEl.classList.add('active');
        pageEl.style.setProperty('display', 'block', 'important');
        pageEl.style.setProperty('visibility', 'visible', 'important');
    }
    
    // Update sidebar nav items
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        item.classList.remove('active');
    });
    if (typeof event !== 'undefined' && event && event.target) {
        const navItem = event.target.closest('.nav-item');
        if (navItem) {
            navItem.classList.add('active');
        }
    }
    const navMap = {
        home: 'navItemHome',
        requests: 'navItemRequests',
        tickets: 'navItemTickets',
        aws: 'navItemAws',
        gcp: 'navItemGcp',
        s3: 'navItemS3',
        gcs: 'navItemGcs',
        instances: 'navItemInstances',
        gcpvms: 'navItemGcpVms',
        databases: 'navItemDatabasesStructured',
        homehistory: 'navItemHome'
    };
    const mappedNav = document.getElementById(navMap[String(pageId || '').toLowerCase()]);
    if (mappedNav) mappedNav.classList.add('active');
    
    // Load page-specific data
    if (pageId === 'accounts') {
        loadAccountsPage();
    } else if (pageId === 'home') {
        if (!Array.isArray(requests) || !requests.length) loadRequests(true);
        loadHomeSummary();
    } else if (pageId === 'homeHistory') {
        loadHomeHistory();
    } else if (pageId === 'requests') {
        if (!Array.isArray(requests) || !requests.length) loadRequests(true);
        restoreRequestsViewState();
        if (!currentRequestsCategory) currentRequestsCategory = 'cloud';
        if (!currentRequestsStatus) currentRequestsStatus = currentRequestsCategory === 'databases' ? 'pending' : 'pending';
        if (currentRequestsCategory === 'cloud') {
            currentFilter = currentRequestsStatus === 'pending' ? 'pending' : currentRequestsStatus === 'denied' ? 'denied' : 'approved';
        }
        filterRequestsByCategory(currentRequestsCategory, currentRequestsStatus);
        setRequestsFlowMode(currentRequestsFlowMode);
        // Initialize unified assistant for requests page
        setTimeout(() => {
            if (typeof initUnifiedAssistant === 'function') {
                initUnifiedAssistant();
            }
        }, 100);
    } else if (pageId === 'applications') {
        loadApplicationsPage();
    } else if (pageId === 'admin') {
        loadAdminPage();
        if (workflowRedirectToManagement) {
            setTimeout(function() {
                if (typeof showAdminTab === 'function') showAdminTab('policies');
                if (typeof showManagementSubTab === 'function') showManagementSubTab('approvalWorkflow');
            }, 80);
        }
    } else if (pageId === 'instances') {
        loadInstances();
    } else if (pageId === 'terminal') {
        if (typeof initTerminalPage === 'function') {
            initTerminalPage();
        } else if (typeof refreshApprovedInstances === 'function') {
            refreshApprovedInstances();
        }
    } else if (pageId === 's3') {
        loadS3Buckets();
    } else if (pageId === 'databases') {
        if (typeof loadDatabases === 'function') {
            loadDatabases();
        }
    } else if (pageId === 'dashboard') {
        if (!Array.isArray(requests) || !requests.length) loadRequests(true);
        updateDashboard();
    } else if (pageId === 'tickets') {
        loadTicketsPage();
    } else if (pageId === 'sessions') {
        loadAdminActiveSessionsPage();
    }
    
    // Remove unified assistant if not on requests page
    if (pageId !== 'requests') {
        const button = document.getElementById('unifiedAssistantButton');
        const popup = document.getElementById('unifiedAssistantPopup');
        if (button) button.remove();
        if (popup) popup.remove();
    }

    // On requests: hide Security Copilot (Unified Assistant only). On databases: hide both.
    const copilotBtn = document.getElementById('securityCopilotButton');
    const copilotPopup = document.getElementById('securityCopilotPopup');
    const hideCopilot = pageId === 'databases' || pageId === 'requests';
    if (copilotBtn) {
        copilotBtn.style.cssText = hideCopilot ? 'display: none !important; visibility: hidden !important; pointer-events: none !important' : '';
    }
    if (copilotPopup) {
        copilotPopup.classList.remove('show');
        copilotPopup.style.cssText = hideCopilot ? 'display: none !important; visibility: hidden !important' : '';
    }

    if (typeof syncRouteWithCurrentPage === 'function') {
        syncRouteWithCurrentPage(pageId);
    }
}

function showUsersSubTab(tab) {
    window.__npamAdminState = window.__npamAdminState || {};
    if (!hasPamCapability(adminSubTabCapability('users', tab))) {
        tab = hasPamCapability(adminSubTabCapability('users', 'users'))
            ? 'users'
            : (hasPamCapability(adminSubTabCapability('users', 'groups')) ? 'groups' : 'roles');
    }
    window.__npamAdminState.usersSubTab = tab;
    var usersEl = document.getElementById('usersSection');
    var groupsEl = document.getElementById('groupsSection');
    var rolesEl = document.getElementById('rolesSection');
    var individualUsersEl = document.getElementById('individualUsersSection');
    if (usersEl) {
        usersEl.style.setProperty('display', tab === 'users' ? 'block' : 'none', 'important');
        usersEl.style.setProperty('visibility', tab === 'users' ? 'visible' : 'hidden', 'important');
    }
    if (groupsEl) {
        groupsEl.style.setProperty('display', tab === 'groups' ? 'block' : 'none', 'important');
        groupsEl.style.setProperty('visibility', tab === 'groups' ? 'visible' : 'hidden', 'important');
    }
    if (rolesEl) {
        rolesEl.style.setProperty('display', tab === 'roles' ? 'block' : 'none', 'important');
        rolesEl.style.setProperty('visibility', tab === 'roles' ? 'visible' : 'hidden', 'important');
    }
    if (individualUsersEl) {
        individualUsersEl.style.setProperty('display', tab === 'individuals' ? 'block' : 'none', 'important');
        individualUsersEl.style.setProperty('visibility', tab === 'individuals' ? 'visible' : 'hidden', 'important');
    }

    var usersBtn = document.getElementById('usersSubTab');
    var groupsBtn = document.getElementById('groupsSubTab');
    var rolesBtn = document.getElementById('rolesSubTab');
    var individualUsersBtn = document.getElementById('individualUsersSubTab');
    [usersBtn, groupsBtn, rolesBtn, individualUsersBtn].forEach(function(btn) {
        if (btn) btn.classList.remove('active');
    });
    var activeBtn = tab === 'users'
        ? usersBtn
        : (tab === 'groups' ? groupsBtn : (tab === 'roles' ? rolesBtn : individualUsersBtn));
    if (activeBtn) activeBtn.classList.add('active');
}

window.showUsersSubTab = showUsersSubTab;

function mountApprovalWorkflowIntoManagement() {
    var mount = document.getElementById('approvalWorkflowMount');
    if (!mount || mount.getAttribute('data-mounted') === '1') return;
    var workflowPage = document.getElementById('workflowPage');
    if (!workflowPage) return;
    var pageContent = workflowPage.querySelector('.page-content');
    if (!pageContent) return;
    mount.appendChild(pageContent);
    workflowPage.remove();
    mount.setAttribute('data-mounted', '1');
}

function mountAdminTrendsIntoTab() {
    var mount = document.getElementById('adminTrendsMount');
    var board = document.getElementById('adminTrendsBoard');
    if (!mount || !board) return;
    if (board.parentElement !== mount) {
        mount.appendChild(board);
    }
}

function mountDbGovernanceIntoSecurity() {
    var mount = document.getElementById('dbGovernanceSecurityMount');
    var sourceTab = document.getElementById('adminDbGovernanceTab');
    if (!mount || !sourceTab || mount.dataset.mounted === '1') return;
    var inner = sourceTab.querySelector('.admin-tab-pam-inner');
    if (!inner) return;
    while (inner.firstChild) {
        mount.appendChild(inner.firstChild);
    }
    sourceTab.style.display = 'none';
    mount.dataset.mounted = '1';
}

function showManagementSubTab(tab) {
    window.__npamAdminState = window.__npamAdminState || {};
    if (!hasPamCapability(adminSubTabCapability('management', tab))) {
        tab = hasPamCapability(adminSubTabCapability('management', 'policies'))
            ? 'policies'
            : (hasPamCapability(adminSubTabCapability('management', 'approvalWorkflow'))
                ? 'approvalWorkflow'
                : (hasPamCapability(adminSubTabCapability('management', 'pendingApprovals'))
                    ? 'pendingApprovals'
                    : (hasPamCapability(adminSubTabCapability('management', 'ticketsManagement')) ? 'ticketsManagement' : 'features')));
    }
    window.__npamAdminState.managementSubTab = tab;
    var policiesSection = document.getElementById('policiesSection');
    var featuresSection = document.getElementById('featuresSection');
    var approvalWorkflowSection = document.getElementById('approvalWorkflowSection');
    var pendingApprovalsSection = document.getElementById('pendingApprovalsSection');
    var ticketsManagementSection = document.getElementById('ticketsManagementSection');
    if (policiesSection) {
        policiesSection.style.setProperty('display', tab === 'policies' ? 'block' : 'none', 'important');
        policiesSection.style.setProperty('visibility', tab === 'policies' ? 'visible' : 'hidden', 'important');
    }
    if (featuresSection) {
        featuresSection.style.setProperty('display', tab === 'features' ? 'block' : 'none', 'important');
        featuresSection.style.setProperty('visibility', tab === 'features' ? 'visible' : 'hidden', 'important');
    }
    if (approvalWorkflowSection) {
        approvalWorkflowSection.style.setProperty('display', tab === 'approvalWorkflow' ? 'block' : 'none', 'important');
        approvalWorkflowSection.style.setProperty('visibility', tab === 'approvalWorkflow' ? 'visible' : 'hidden', 'important');
    }
    if (pendingApprovalsSection) {
        pendingApprovalsSection.style.setProperty('display', tab === 'pendingApprovals' ? 'block' : 'none', 'important');
        pendingApprovalsSection.style.setProperty('visibility', tab === 'pendingApprovals' ? 'visible' : 'hidden', 'important');
    }
    if (ticketsManagementSection) {
        ticketsManagementSection.style.setProperty('display', tab === 'ticketsManagement' ? 'block' : 'none', 'important');
        ticketsManagementSection.style.setProperty('visibility', tab === 'ticketsManagement' ? 'visible' : 'hidden', 'important');
    }

    var policiesBtn = document.getElementById('policiesSubTab');
    var featuresBtn = document.getElementById('featuresSubTab');
    var approvalWorkflowBtn = document.getElementById('approvalWorkflowSubTab');
    var pendingApprovalsBtn = document.getElementById('pendingApprovalsSubTab');
    var ticketsManagementBtn = document.getElementById('ticketsManagementSubTab');
    [policiesBtn, approvalWorkflowBtn, pendingApprovalsBtn, ticketsManagementBtn, featuresBtn].forEach(function(btn) {
        if (!btn) return;
        btn.classList.remove('active');
        btn.style.background = 'var(--bg-secondary)';
        btn.style.color = 'var(--text-primary)';
        btn.style.border = '1.5px solid var(--border-color)';
    });

    var activeBtn = tab === 'features'
        ? featuresBtn
        : (tab === 'approvalWorkflow'
            ? approvalWorkflowBtn
            : (tab === 'pendingApprovals' ? pendingApprovalsBtn : (tab === 'ticketsManagement' ? ticketsManagementBtn : policiesBtn)));
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        activeBtn.style.color = 'white';
        activeBtn.style.border = 'none';
    }

    if (tab === 'features' && typeof loadFeatureToggles === 'function') {
        loadFeatureToggles();
    } else if (tab === 'approvalWorkflow') {
        mountApprovalWorkflowIntoManagement();
        setTimeout(function() {
            if (!window.__workflowDesignerInitializedInManagement && typeof initWorkflowDesigner === 'function') {
                initWorkflowDesigner();
                window.__workflowDesignerInitializedInManagement = true;
            }
        }, 60);
    } else if (tab === 'pendingApprovals' && typeof loadAdminPendingDatabaseApprovals === 'function') {
        loadAdminPendingDatabaseApprovals();
    } else if (tab === 'ticketsManagement' && typeof loadAdminTicketsManagement === 'function') {
        loadAdminTicketsManagement();
    }
}

window.showManagementSubTab = showManagementSubTab;

function setAdminPendingApprovalsStatus(message, type) {
    setInlineStatus('adminPendingApprovalsStatus', message, type || 'info');
}

function renderAdminPendingApprovalsEmptyState(items) {
    const box = document.getElementById('adminPendingApprovalsEmptyState');
    if (!box) return;
    const rows = Array.isArray(items) ? items : [];
    if (rows.length) {
        box.style.display = 'none';
        return;
    }
    box.style.display = 'block';
    box.innerHTML = '<strong>No active requests are waiting for approval right now.</strong><div class="notification-card-body">When any database, cloud, workloads, or storage request enters a pending approval stage, it will show up here for admins.</div>';
}

function renderAdminPendingApprovalsSummary(items) {
    const box = document.getElementById('adminPendingApprovalsSummary');
    if (!box) return;
    const rows = Array.isArray(items) ? items : [];
    renderAdminPendingApprovalsEmptyState(rows);
    if (!rows.length) {
        box.innerHTML = 'No requests are currently waiting for approval.';
        return;
    }
    const uniqueApprovers = new Set();
    const families = new Set();
    rows.forEach(function(item) {
        const family = String(item.category_label || item.category || '').trim();
        if (family) families.add(family);
        (Array.isArray(item.pending_approvers) ? item.pending_approvers : []).forEach(function(email) {
            const normalized = String(email || '').trim().toLowerCase();
            if (normalized) uniqueApprovers.add(normalized);
        });
    });
    box.innerHTML = ''
        + '<div class="notification-card-title-row"><strong>Pending Approval Summary</strong></div>'
        + '<div class="notification-card-meta">'
        + 'Requests waiting: ' + escapeHtml(String(rows.length))
        + ' • Unique pending approvers: ' + escapeHtml(String(uniqueApprovers.size))
        + ' • Request families: ' + escapeHtml(String(families.size))
        + '</div>'
        + '<div class="notification-card-body">'
        + 'Admins can review any pending request here. Database requests can also be rerouted or override-approved when the normal manager path is blocked.'
        + '</div>';
}

function renderAdminPendingApprovalsTable() {
    const tbody = document.getElementById('adminPendingApprovalsTableBody');
    if (!tbody) return;
    if (!adminPendingDatabaseApprovals.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-muted">No pending approvals found.</td></tr>';
        return;
    }
    tbody.innerHTML = adminPendingDatabaseApprovals.map(function(item) {
        const requestId = String(item.request_id || '').trim();
        const requestType = String(item.request_type || '').trim().toLowerCase();
        const canAdminOverride = !!item.can_admin_override;
        const requesterName = String(item.user_full_name || '').trim();
        const requesterEmail = String(item.user_email || '').trim();
        const requestorLabel = requesterName ? (requesterName + '<div class="db-user-identity-note">' + escapeHtml(requesterEmail || '—') + '</div>') : escapeHtml(requesterEmail || '—');
        const categoryLabel = String(item.category_label || item.category || 'Request').trim();
        const approvers = Array.isArray(item.pending_approvers) ? item.pending_approvers.map(function(v) { return String(v || '').trim(); }).filter(Boolean) : [];
        const pendingApproverText = approvers.length ? approvers.join(', ') : '—';
        const createdAt = item.created_at ? formatDateTimeIst(item.created_at) : '—';
        const pendingStage = String(item.pending_stage || '').trim() || 'Pending approval';
        const targetPrimary = String(item.target_primary || '').trim() || '—';
        const targetSecondary = String(item.target_secondary || '').trim();
        const accessSummary = String(item.access_summary || item.requested_access_type || '—').trim();
        const actionButtons = canAdminOverride
            ? (
                '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="viewAdminPendingDbApprovalDetails(\'' + escapeHtml(requestId) + '\')"><i class="fas fa-eye"></i> View</button>'
                + '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="reassignAdminPendingDbApproval(\'' + escapeHtml(requestId) + '\', \'' + escapeHtml(approvers.join(', ') || String(item.request_approver_email || approvers[0] || '')) + '\')"><i class="fas fa-user-pen"></i> Change Approver</button>'
                + '<button type="button" class="btn-primary btn-pam btn-sm" onclick="decideAdminPendingDbApproval(\'' + escapeHtml(requestId) + '\', \'approve\')"><i class="fas fa-check"></i> Admin Approve</button>'
                + '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="decideAdminPendingDbApproval(\'' + escapeHtml(requestId) + '\', \'deny\')"><i class="fas fa-ban"></i> Deny</button>'
            )
            : (
                '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="viewAdminPendingDbApprovalDetails(\'' + escapeHtml(requestId) + '\')"><i class="fas fa-eye"></i> View</button>'
                + '<span class="db-user-identity-note">Workflow override is available only for database requests.</span>'
            );
        return ''
            + '<tr>'
            + '<td><strong>' + escapeHtml(requestId.slice(0, 8)) + '...</strong><div class="db-user-identity-note">' + escapeHtml(String(item.approval_workflow_name || 'Workflow not set')) + '</div></td>'
            + '<td><span class="integration-test-pill ' + (requestType === 'database_access' ? 'integration-test-pill-success' : 'integration-test-pill-skip') + '">' + escapeHtml(categoryLabel) + '</span></td>'
            + '<td>' + requestorLabel + '</td>'
            + '<td><strong>' + escapeHtml(targetPrimary) + '</strong>' + (targetSecondary ? '<div class="db-user-identity-note">' + escapeHtml(targetSecondary) + '</div>' : '') + '<div class="db-user-identity-note">' + escapeHtml(accessSummary) + '</div></td>'
            + '<td>' + escapeHtml(pendingStage) + '<div class="db-user-identity-note">' + escapeHtml(String(item.approval_note || '—')) + '</div></td>'
            + '<td>' + escapeHtml(pendingApproverText) + '</td>'
            + '<td>' + escapeHtml(createdAt) + '</td>'
            + '<td><div class="notification-card-actions" style="margin-top:0;">'
            + actionButtons
            + '</div></td>'
            + '</tr>';
    }).join('');
}

async function loadAdminPendingDatabaseApprovals(force) {
    const tbody = document.getElementById('adminPendingApprovalsTableBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-muted">Loading pending approvals...</td></tr>';
    }
    setAdminPendingApprovalsStatus('Loading pending approval queue...', 'info');
    try {
        const data = await apiJson('/admin/database-approvals/pending');
        adminPendingDatabaseApprovals = Array.isArray(data.requests) ? data.requests : [];
        renderAdminPendingApprovalsSummary(adminPendingDatabaseApprovals);
        renderAdminPendingApprovalsTable();
        setAdminPendingApprovalsStatus(
            adminPendingDatabaseApprovals.length
                ? 'Pending approval queue loaded.'
                : 'No requests are currently waiting for approval.',
            'info'
        );
    } catch (err) {
        adminPendingDatabaseApprovals = [];
        renderAdminPendingApprovalsSummary([]);
        renderAdminPendingApprovalsTable();
        setAdminPendingApprovalsStatus(err.message || 'Failed to load pending approval queue.', 'error');
    }
}

function viewAdminPendingDbApprovalDetails(requestId) {
    const item = (Array.isArray(adminPendingDatabaseApprovals) ? adminPendingDatabaseApprovals : []).find(function(row) {
        return String((row || {}).request_id || '').trim() === String(requestId || '').trim();
    }) || {};
    if (String(item.request_type || '').trim().toLowerCase() !== 'database_access') {
        window.alert(
            'Request: ' + String(item.request_id || requestId || '—') + '\n'
            + 'Category: ' + String(item.category_label || item.category || 'Request') + '\n'
            + 'Requester: ' + String(item.user_email || '—') + '\n'
            + 'Target: ' + String(item.target_primary || '—') + '\n'
            + 'Stage: ' + String(item.pending_stage || 'Pending approval') + '\n'
            + 'Approvers: ' + String((item.pending_approvers || []).join(', ') || '—')
        );
        return;
    }
    if (typeof viewDbRequestDetails === 'function') {
        viewDbRequestDetails(requestId);
        return;
    }
    alert('Request details view is not available in this screen.');
}

async function reassignAdminPendingDbApproval(requestId, currentEmail) {
    const nextEmail = window.prompt(
        'Enter one or more approver emails to route this request to. Use commas if more than one approver should receive the pending approval email.',
        String(currentEmail || '').trim()
    );
    if (!nextEmail) return;
    const note = window.prompt(
        'Add a short reason for this approval reroute. This note is stored for audit and emergency tracking.',
        ''
    );
    if (note === null) return;
    setAdminPendingApprovalsStatus('Updating approver routing...', 'info');
    try {
        const result = await apiJson('/admin/database-approvals/' + encodeURIComponent(requestId) + '/reassign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                approver_emails: String(nextEmail || '').trim(),
                note: String(note || '').trim()
            })
        });
        setAdminPendingApprovalsStatus(result.message || 'Approver routing updated.', 'success');
        await loadAdminPendingDatabaseApprovals(true);
    } catch (err) {
        setAdminPendingApprovalsStatus(err.message || 'Failed to update approver routing.', 'error');
    }
}

async function decideAdminPendingDbApproval(requestId, decision) {
    const approve = String(decision || '').trim().toLowerCase() === 'approve';
    let reason = '';
    if (approve) {
        reason = window.prompt('Optional reason for admin approval override:', '') || '';
    } else if (typeof promptAppAction === 'function') {
        reason = await promptAppAction(
            'Provide a reason for denying this request.',
            {
                title: 'Admin deny request',
                submitLabel: 'Deny request',
                cancelLabel: 'Cancel',
                variant: 'warning',
                placeholder: 'Enter denial reason (required)',
                helperText: 'This reason is stored for audit and emailed to the requester.',
                minLength: 3,
                required: true,
            }
        );
        if (reason === null) return;
    } else {
        reason = window.prompt('Reason for admin denial override:', '');
        if (reason === null) return;
    }
    const confirmed = await confirmAppAction(
        approve
            ? 'Approve this pending request as an admin override? This should be used only for testing or emergency manager unavailability.'
            : 'Deny this pending request as an admin override?',
        {
            title: approve ? 'Admin approve request' : 'Admin deny request',
            confirmLabel: approve ? 'Approve' : 'Deny',
            cancelLabel: 'Cancel',
            variant: approve ? 'primary' : 'warning'
        }
    );
    if (!confirmed) return;
    setAdminPendingApprovalsStatus(approve ? 'Approving request...' : 'Denying request...', 'info');
    try {
        const result = await apiJson('/admin/database-approvals/' + encodeURIComponent(requestId) + '/decision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision: approve ? 'approve' : 'deny', reason: String(reason || '').trim() })
        });
        setAdminPendingApprovalsStatus(result.message || (approve ? 'Request approved.' : 'Request denied.'), 'success');
        await loadAdminPendingDatabaseApprovals(true);
    } catch (err) {
        setAdminPendingApprovalsStatus(err.message || 'Failed to update request decision.', 'error');
    }
}

function showSecuritySubTab(tab) {
    window.__npamAdminState = window.__npamAdminState || {};
    if (!hasPamCapability(adminSubTabCapability('security', tab))) {
        tab = hasPamCapability(adminSubTabCapability('security', 'security'))
            ? 'security'
            : (hasPamCapability(adminSubTabCapability('security', 'iam')) ? 'iam' : (hasPamCapability(adminSubTabCapability('security', 'dbUsers')) ? 'dbUsers' : 'audit'));
    }
    window.__npamAdminState.securitySubTab = tab;
    var securitySection = document.getElementById('securitySection');
    var iamSection = document.getElementById('iamSection');
    var guardrailsSection = document.getElementById('guardrailsSection');
    var dbUsersSection = document.getElementById('dbUsersSection');
    var auditSection = document.getElementById('auditSection');
    if (securitySection) {
        securitySection.style.setProperty('display', tab === 'security' ? 'block' : 'none', 'important');
        securitySection.style.setProperty('visibility', tab === 'security' ? 'visible' : 'hidden', 'important');
    }
    if (iamSection) {
        iamSection.style.setProperty('display', tab === 'iam' ? 'block' : 'none', 'important');
        iamSection.style.setProperty('visibility', tab === 'iam' ? 'visible' : 'hidden', 'important');
    }
    if (guardrailsSection) {
        guardrailsSection.style.setProperty('display', tab === 'guardrails' ? 'block' : 'none', 'important');
        guardrailsSection.style.setProperty('visibility', tab === 'guardrails' ? 'visible' : 'hidden', 'important');
    }
    if (dbUsersSection) {
        dbUsersSection.style.setProperty('display', tab === 'dbUsers' ? 'block' : 'none', 'important');
        dbUsersSection.style.setProperty('visibility', tab === 'dbUsers' ? 'visible' : 'hidden', 'important');
    }
    if (auditSection) {
        auditSection.style.setProperty('display', tab === 'audit' ? 'block' : 'none', 'important');
        auditSection.style.setProperty('visibility', tab === 'audit' ? 'visible' : 'hidden', 'important');
    }

    var securityBtn = document.getElementById('securitySubTab');
    var iamBtn = document.getElementById('iamSubTab');
    var guardrailsBtn = document.getElementById('guardrailsSubTab');
    var dbUsersBtn = document.getElementById('dbUsersSubTab');
    var auditBtn = document.getElementById('auditSubTab');
    [securityBtn, iamBtn, guardrailsBtn, dbUsersBtn, auditBtn].forEach(function(btn) {
        if (btn) btn.classList.remove('active', 'tab-glow-subtab-active');
    });
    var activeBtn = tab === 'security'
        ? securityBtn
        : (tab === 'iam' ? iamBtn : (tab === 'guardrails' ? guardrailsBtn : (tab === 'dbUsers' ? dbUsersBtn : auditBtn)));
    if (activeBtn) activeBtn.classList.add('active');

    if (tab === 'guardrails' && typeof refreshGuardrailsSection === 'function') {
        setTimeout(function() {
            refreshGuardrailsSection();
        }, 60);
    } else if (tab === 'dbUsers' && typeof window.loadDbUserInventorySection === 'function') {
        setTimeout(function() {
            mountDbGovernanceIntoSecurity();
            if (typeof loadDbGovernanceAdmin === 'function') {
                loadDbGovernanceAdmin(false);
            }
            window.loadDbUserInventorySection();
        }, 60);
    } else if (tab === 'iam' && typeof window.loadIamRoleTemplates === 'function') {
        setTimeout(function() {
            window.loadIamRoleTemplates(true);
        }, 60);
    }
}

window.showSecuritySubTab = showSecuritySubTab;

function showIntegrationsSubTab(tab) {
    window.__npamAdminState = window.__npamAdminState || {};
    if (!hasPamCapability(adminSubTabCapability('integrations', tab))) {
        if (hasPamCapability(adminSubTabCapability('integrations', 'cloud'))) tab = 'cloud';
        else if (hasPamCapability(adminSubTabCapability('integrations', 'vaultdb'))) tab = 'vaultdb';
        else if (hasPamCapability(adminSubTabCapability('integrations', 'ticketing'))) tab = 'ticketing';
        else if (hasPamCapability(adminSubTabCapability('integrations', 'documentation'))) tab = 'documentation';
        else if (hasPamCapability(adminSubTabCapability('integrations', 'siem'))) tab = 'siem';
        else tab = 'igp';
    }
    window.__npamAdminState.integrationsSubTab = tab;
    var ids = ['intCloudSection', 'intVaultDbSection', 'intTicketingSection', 'intDocumentationSection', 'intSiemSection', 'intIgpSection'];
    var map = { cloud: 0, vaultdb: 1, ticketing: 2, documentation: 3, siem: 4, igp: 5 };
    ids.forEach(function(id, i) {
        var el = document.getElementById(id);
        if (el) {
            el.style.setProperty('display', map[tab] === i ? 'block' : 'none', 'important');
            el.style.setProperty('visibility', map[tab] === i ? 'visible' : 'hidden', 'important');
        }
    });
    var btnIds = ['intCloudSubTab', 'intVaultDbSubTab', 'intTicketingSubTab', 'intDocumentationSubTab', 'intSiemSubTab', 'intIgpSubTab'];
    btnIds.forEach(function(id, i) {
        var btn = document.getElementById(id);
        if (btn) btn.classList.toggle('active', map[tab] === i);
    });
}

window.showIntegrationsSubTab = showIntegrationsSubTab;

function toggleSecurityCopilot() {
    const popup = document.getElementById('securityCopilotPopup');
    if (popup) popup.classList.toggle('show');
}

function sendCopilotMessage() {
    const input = document.getElementById('copilotInput');
    const messages = document.getElementById('copilotMessages');
    if (!input || !messages) return;

    const message = input.value.trim();
    if (!message) return;

    messages.innerHTML +=
        '<div class="copilot-message user">' +
            '<div class="message-content">' + escapeHtml(message) + '</div>' +
        '</div>';

    input.value = '';
    messages.scrollTop = messages.scrollHeight;

    setTimeout(function() {
        messages.innerHTML +=
            '<div class="copilot-message assistant">' +
                '<div class="message-content">' +
                    '<p>I understand you&apos;re asking about: "' + escapeHtml(message) + '"</p>' +
                    '<p>This feature is connected to NPAMx. For detailed help, please use NPAMx on the Requests page.</p>' +
                '</div>' +
            '</div>';
        messages.scrollTop = messages.scrollHeight;
    }, 500);
}

window.toggleSecurityCopilot = toggleSecurityCopilot;
window.sendCopilotMessage = sendCopilotMessage;

// Admin Tab Navigation
function showAdminTab(tabId, event) {
    if (!canAccessAdminConsole()) {
        alert('Admin access required.');
        showPage(firstAccessiblePage());
        return;
    }
    if (!hasPamCapability(adminTabCapability(tabId))) {
        const ordered = ['users', 'identityCenter', 'policies', 'security', 'integrations', 'trends', 'databaseSessions', 'feedback'];
        const fallback = ordered.find(function(item) { return hasPamCapability(adminTabCapability(item)); }) || '';
        if (!fallback) {
            alert('You do not have access to the admin console.');
            showPage(firstAccessiblePage());
            return;
        }
        tabId = fallback;
    }
    // Hide all admin tabs
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.style.display = 'none';
        tab.classList.remove('active');
    });
    
    const tabMap = {
        'users': 'adminUsersTab',
        'identityCenter': 'adminIdentityCenterTab',
        'policies': 'adminPoliciesTab',
        'security': 'adminSecurityTab',
        'integrations': 'adminIntegrationsTab',
        'trends': 'adminTrendsTab',
        'databaseSessions': 'adminDatabaseSessionsTab',
        'feedback': 'adminFeedbackTab',
        'reports': 'adminReportsTab'
    };
    if (!tabMap[tabId] || !document.getElementById(tabMap[tabId])) tabId = 'users';
    
    const targetTab = document.getElementById(tabMap[tabId]);
    if (targetTab) {
        targetTab.style.setProperty('display', 'block', 'important');
        targetTab.style.setProperty('visibility', 'visible', 'important');
        targetTab.classList.add('active');
        if (tabId === 'users' && typeof loadPamAdmins === 'function') loadPamAdmins();
        console.log('✅ Showing admin tab:', tabId, targetTab);
    } else {
        console.error('❌ Admin tab not found:', tabId, tabMap[tabId]);
    }
    
    // Update tab buttons
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (event && event.target) {
        const btn = event.target.closest('.admin-tab-btn');
        if (btn) btn.classList.add('active');
    } else {
        // Fallback: find button by tabId
        const btn = document.querySelector(`.admin-tab-btn[onclick*="'${tabId}'"]`);
        if (btn) btn.classList.add('active');
    }
    
    if (tabId === 'users') {
        const selectedUsersSubTab = (window.__npamAdminState && window.__npamAdminState.usersSubTab) || 'users';
        if (typeof window.showUsersSubTab === 'function') window.showUsersSubTab(selectedUsersSubTab);
        if (typeof loadUsersManagement === 'function') loadUsersManagement();
    } else if (tabId === 'identityCenter') {
        if (typeof showAwsIdentityCenterSubTab === 'function') showAwsIdentityCenterSubTab('users');
        if (typeof loadAwsIdentityCenterData === 'function') loadAwsIdentityCenterData();
    } else if (tabId === 'policies') {
        const selectedManagementSubTab = (window.__npamAdminState && window.__npamAdminState.managementSubTab) || 'policies';
        if (typeof showManagementSubTab === 'function') showManagementSubTab(selectedManagementSubTab);
        if (typeof initPolicyConfig === 'function') initPolicyConfig();
        setTimeout(() => {
            if (typeof loadPolicySettings === 'function') loadPolicySettings();
        }, 100);
        if (typeof loadAccountsForTagging === 'function') loadAccountsForTagging();
        if (typeof loadFeatureToggles === 'function') loadFeatureToggles();
    } else if (tabId === 'databaseSessions') {
        if (typeof loadAdminDatabaseSessions === 'function') loadAdminDatabaseSessions();
    } else if (tabId === 'feedback') {
        if (typeof showFeedbackAdminSubTab === 'function') showFeedbackAdminSubTab(feedbackAdminSubTab || 'feedback');
        if (typeof loadFeedbackInbox === 'function') loadFeedbackInbox(false);
        if (typeof loadAdminAnnouncements === 'function') loadAdminAnnouncements(false);
    } else if (tabId === 'trends') {
        mountAdminTrendsIntoTab();
        if (typeof loadAdminTrends === 'function') loadAdminTrends(false);
    } else if (tabId === 'security') {
        const selectedSecuritySubTab = (window.__npamAdminState && window.__npamAdminState.securitySubTab) || 'security';
        if (typeof window.showSecuritySubTab === 'function') {
            setTimeout(function() {
                window.showSecuritySubTab(selectedSecuritySubTab);
            }, 10);
        }
        if (typeof loadAuditLogs === 'function') loadAuditLogs();
    } else if (tabId === 'integrations') {
        const selectedIntegrationsSubTab = (window.__npamAdminState && window.__npamAdminState.integrationsSubTab) || 'cloud';
        if (typeof window.showIntegrationsSubTab === 'function') {
            setTimeout(function() {
                window.showIntegrationsSubTab(selectedIntegrationsSubTab);
            }, 10);
        }
        loadAdminSettings().catch(function() {});
    }
}

function bindAdminNavigationHandlers() {
    if (document.documentElement.dataset.boundAdminNavCapture === '1') return;
    document.addEventListener('click', function(evt) {
        const target = evt.target && evt.target.closest ? evt.target.closest('#usersSubTab, #groupsSubTab, #rolesSubTab, #individualUsersSubTab, #policiesSubTab, #approvalWorkflowSubTab, #pendingApprovalsSubTab, #ticketsManagementSubTab, #featuresSubTab, #securitySubTab, #iamSubTab, #guardrailsSubTab, #dbUsersSubTab, #auditSubTab, #intCloudSubTab, #intVaultDbSubTab, #intTicketingSubTab, #intDocumentationSubTab, #intSiemSubTab, #intIgpSubTab') : null;
        if (!target) return;
        evt.preventDefault();
        evt.stopPropagation();
        const id = target.id;
        if (id === 'usersSubTab' && typeof window.showUsersSubTab === 'function') window.showUsersSubTab('users');
        else if (id === 'groupsSubTab' && typeof window.showUsersSubTab === 'function') window.showUsersSubTab('groups');
        else if (id === 'rolesSubTab' && typeof window.showUsersSubTab === 'function') window.showUsersSubTab('roles');
        else if (id === 'individualUsersSubTab' && typeof window.showUsersSubTab === 'function') window.showUsersSubTab('individuals');
        else if (id === 'policiesSubTab' && typeof window.showManagementSubTab === 'function') window.showManagementSubTab('policies');
        else if (id === 'approvalWorkflowSubTab' && typeof window.showManagementSubTab === 'function') window.showManagementSubTab('approvalWorkflow');
        else if (id === 'pendingApprovalsSubTab' && typeof window.showManagementSubTab === 'function') window.showManagementSubTab('pendingApprovals');
        else if (id === 'ticketsManagementSubTab' && typeof window.showManagementSubTab === 'function') window.showManagementSubTab('ticketsManagement');
        else if (id === 'featuresSubTab' && typeof window.showManagementSubTab === 'function') window.showManagementSubTab('features');
        else if (id === 'securitySubTab' && typeof window.showSecuritySubTab === 'function') window.showSecuritySubTab('security');
        else if (id === 'iamSubTab' && typeof window.showSecuritySubTab === 'function') window.showSecuritySubTab('iam');
        else if (id === 'guardrailsSubTab' && typeof window.showSecuritySubTab === 'function') window.showSecuritySubTab('guardrails');
        else if (id === 'dbUsersSubTab' && typeof window.showSecuritySubTab === 'function') window.showSecuritySubTab('dbUsers');
        else if (id === 'auditSubTab' && typeof window.showSecuritySubTab === 'function') window.showSecuritySubTab('audit');
        else if (id === 'intCloudSubTab' && typeof window.showIntegrationsSubTab === 'function') window.showIntegrationsSubTab('cloud');
        else if (id === 'intVaultDbSubTab' && typeof window.showIntegrationsSubTab === 'function') window.showIntegrationsSubTab('vaultdb');
        else if (id === 'intTicketingSubTab' && typeof window.showIntegrationsSubTab === 'function') window.showIntegrationsSubTab('ticketing');
        else if (id === 'intDocumentationSubTab' && typeof window.showIntegrationsSubTab === 'function') window.showIntegrationsSubTab('documentation');
        else if (id === 'intSiemSubTab' && typeof window.showIntegrationsSubTab === 'function') window.showIntegrationsSubTab('siem');
        else if (id === 'intIgpSubTab' && typeof window.showIntegrationsSubTab === 'function') window.showIntegrationsSubTab('igp');
    }, true);
    document.documentElement.dataset.boundAdminNavCapture = '1';
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAdminNavigationHandlers);
} else {
    bindAdminNavigationHandlers();
}

// Admin: Database Sessions (emergency revoke)
function renderActiveSessionsCategoryRows(categoryKey, sessions) {
    const tbody = document.getElementById('activeSessions' + categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1) + 'Body');
    if (!tbody) return;
    const rows = Array.isArray(sessions) ? sessions : [];
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-muted">No active ' + escapeHtml(categoryLabelForHome(categoryKey).toLowerCase()) + '.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(function(item) {
        const startedAt = item.started_at ? formatDateTimeIst(item.started_at) : '—';
        const expiresAt = item.expires_at ? formatDateTimeIst(item.expires_at) : '—';
        return (
            '<tr>' +
                '<td>' + escapeHtml(item.user_email || '—') + '</td>' +
                '<td>' + escapeHtml(item.target || '—') + '</td>' +
                '<td>' + escapeHtml(startedAt) + '</td>' +
                '<td>' + escapeHtml(expiresAt) + '</td>' +
            '</tr>'
        );
    }).join('');
}

function applyActiveSessionsFeatureVisibility(flags) {
    const featureFlags = flags || ((typeof getCurrentFeatures === 'function') ? getCurrentFeatures() : {}) || {};
    const featureMap = {
        cloud: 'cloud_access',
        databases: 'databases_access',
        workloads: 'workloads_access',
        storage: 'storage_access'
    };
    let visibleCount = 0;
    Object.keys(featureMap).forEach(function(category) {
        const enabled = featureFlags[featureMap[category]] !== false;
        const summaryCard = document.querySelector('[data-session-category="' + category + '"]');
        const section = document.getElementById('activeSessionsCategory' + category.charAt(0).toUpperCase() + category.slice(1));
        if (summaryCard) summaryCard.style.display = enabled ? '' : 'none';
        if (section) section.style.display = enabled ? '' : 'none';
        if (enabled) visibleCount += 1;
    });
    const summaryGrid = document.getElementById('adminActiveSessionsSummary');
    const categoriesWrap = document.getElementById('adminActiveSessionsCategories');
    const sessionsNav = document.getElementById('navItemSessions');
    if (summaryGrid) summaryGrid.style.display = visibleCount > 0 ? '' : 'none';
    if (categoriesWrap) categoriesWrap.style.display = visibleCount > 0 ? '' : 'none';
    if (sessionsNav) sessionsNav.style.display = hasPamCapability('sessions.view') && visibleCount > 0 ? '' : 'none';
    return visibleCount;
}

function setActiveSessionsCategoryExpanded(category, expanded) {
    const normalized = String(category || '').trim().toLowerCase();
    ['cloud', 'databases', 'workloads', 'storage'].forEach(function(item) {
        const section = document.getElementById('activeSessionsCategory' + item.charAt(0).toUpperCase() + item.slice(1));
        const body = section ? section.querySelector('.active-sessions-category-body') : null;
        const isOpen = item === normalized ? !!expanded : false;
        if (section) section.classList.toggle('is-expanded', isOpen);
        if (body) body.style.display = isOpen ? 'block' : 'none';
        const summaryBtn = document.querySelector('[data-session-category="' + item + '"]');
        if (summaryBtn) {
            summaryBtn.classList.toggle('active', isOpen);
            summaryBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }
        const toggleBtn = document.querySelector('[data-session-toggle="' + item + '"]');
        if (toggleBtn) {
            toggleBtn.innerHTML = isOpen
                ? '<i class="fas fa-eye-slash"></i> Hide'
                : '<i class="fas fa-eye"></i> Show';
            toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }
    });
}

function toggleActiveSessionsCategory(category) {
    const normalized = String(category || '').trim().toLowerCase();
    const section = document.getElementById('activeSessionsCategory' + normalized.charAt(0).toUpperCase() + normalized.slice(1));
    const isExpanded = !!(section && section.classList.contains('is-expanded'));
    setActiveSessionsCategoryExpanded(normalized, !isExpanded);
}

function loadAdminActiveSessionsPage() {
    if (!hasPamCapability('sessions.view')) {
        setInlineStatus('adminActiveSessionsStatus', 'You do not have access to active sessions.', 'error');
        return;
    }
    const visibleCount = applyActiveSessionsFeatureVisibility();
    if (!visibleCount) {
        setInlineStatus('adminActiveSessionsStatus', 'All access categories are currently disabled by feature controls.', 'info');
        return;
    }
    setActiveSessionsCategoryExpanded('', false);
    ['cloud', 'databases', 'workloads', 'storage'].forEach(function(category) {
        renderActiveSessionsCategoryRows(category, []);
        const totalEl = document.getElementById('activeSessions' + category.charAt(0).toUpperCase() + category.slice(1) + 'Count');
        if (totalEl) totalEl.textContent = '0';
    });
    setInlineStatus('adminActiveSessionsStatus', 'Loading active sessions…', 'info');
    apiJson('/admin/active-sessions')
        .then(function(data) {
            const categories = (data && data.categories) || {};
            ['cloud', 'databases', 'workloads', 'storage'].forEach(function(category) {
                const block = categories[category] || {};
                const rows = Array.isArray(block.sessions) ? block.sessions : [];
                renderActiveSessionsCategoryRows(category, rows);
                const totalEl = document.getElementById('activeSessions' + category.charAt(0).toUpperCase() + category.slice(1) + 'Count');
                if (totalEl) totalEl.textContent = String(rows.length);
            });
            setInlineStatus('adminActiveSessionsStatus', '', 'info');
        })
        .catch(function(error) {
            ['cloud', 'databases', 'workloads', 'storage'].forEach(function(category) {
                const tbody = document.getElementById('activeSessions' + category.charAt(0).toUpperCase() + category.slice(1) + 'Body');
                if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-danger">' + escapeHtml((error && error.message) ? error.message : 'Failed to load active sessions.') + '</td></tr>';
            });
            setInlineStatus('adminActiveSessionsStatus', (error && error.message) ? error.message : 'Failed to load active sessions.', 'error');
        });
}

document.addEventListener('npam-features-updated', function (evt) {
    try {
        const flags = evt && evt.detail ? evt.detail.features : null;
        applyActiveSessionsFeatureVisibility(flags);
    } catch (_) {}
});

window.toggleActiveSessionsCategory = toggleActiveSessionsCategory;

function loadAdminDatabaseSessions(options) {
    options = options && typeof options === 'object' ? options : {};
    var loadSeq = ++adminDbSessionsLoadSeq;
    var tbody = document.getElementById('adminDbSessionsTableBody');
    var emptyEl = document.getElementById('adminDbSessionsEmpty');
    var revokeBtn = document.getElementById('adminRevokeDbSessionsBtn');
    var selectAll = document.getElementById('adminDbSessionsSelectAll');
    if (!tbody) return;
    var preserveExisting = options.preserveExisting === true;
    var loadingMessage = String(options.loadingMessage || 'Loading database sessions…').trim();
    if (!preserveExisting) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-muted">Loading…</td></tr>';
    }
    if (emptyEl) emptyEl.style.display = 'none';
    setInlineStatus('adminDbSessionsStatus', loadingMessage, 'info');
    var apiBase = typeof API_BASE !== 'undefined' ? API_BASE : (window.API_BASE || (window.location.origin + '/api'));
    fetch(apiBase + '/admin/database-sessions', {
        credentials: 'include',
        cache: 'no-store'
    })
        .then(function(r) { return r.json().then(function(data) { return { ok: r.ok, data: data }; }); })
        .then(function(data) {
            if (loadSeq !== adminDbSessionsLoadSeq) return;
            if (!data.ok) {
                throw new Error((data.data && data.data.error) ? data.data.error : 'Failed to load sessions');
            }
            var sessions = (data.data && data.data.sessions) ? data.data.sessions : [];
            sessions = sessions.filter(function(s) {
                return !adminDbSessionsLocallyRevoked.has(String((s || {}).request_id || '').trim());
            });
            if (sessions.length === 0) {
                tbody.innerHTML = '';
                if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.textContent = 'No active database sessions.'; }
                if (revokeBtn) revokeBtn.style.display = 'none';
                if (selectAll) selectAll.checked = false;
                setInlineStatus('adminDbSessionsStatus', 'All database sessions are now cleared.', 'success');
                return;
            }
            if (emptyEl) emptyEl.style.display = 'none';
            if (revokeBtn) revokeBtn.style.display = 'inline-flex';
            tbody.innerHTML = sessions.map(function(s) {
                var exp = (s.expires_at || '').replace('T', ' ').substring(0, 19);
                return '<tr><td><input type="checkbox" class="admin-db-session-cb" value="' + (s.request_id || '') + '"></td><td>' + (s.user_email || '—') + '</td><td><code>' + (s.request_id || '—') + '</code></td><td>' + (s.engine || 'mysql') + '</td><td>' + exp + '</td></tr>';
            }).join('');
            if (selectAll) selectAll.checked = false;
            setInlineStatus('adminDbSessionsStatus', 'Loaded ' + sessions.length + ' active database session(s).', 'success');
        })
        .catch(function(err) {
            if (loadSeq !== adminDbSessionsLoadSeq) return;
            tbody.innerHTML = '<tr><td colspan="5" class="text-danger">' + escapeHtml((err && err.message) ? err.message : 'Failed to load sessions.') + '</td></tr>';
            if (revokeBtn) revokeBtn.style.display = 'none';
            setInlineStatus('adminDbSessionsStatus', (err && err.message) ? err.message : 'Failed to load database sessions.', 'error');
        });
}
function toggleAdminDbSessionsSelectAll(checkbox) {
    document.querySelectorAll('.admin-db-session-cb').forEach(function(cb) { cb.checked = !!checkbox.checked; });
}
async function revokeSelectedDatabaseSessions() {
    if (adminDbSessionsRevoking) return;
    console.log('Revoke clicked (Admin DB sessions)');
    var checked = document.querySelectorAll('.admin-db-session-cb:checked');
    var ids = [];
    checked.forEach(function(cb) { if (cb.value) ids.push(cb.value); });
    console.log('Revoke clicked', ids.length ? ids : 'no-ids', 'sessionIds=', ids);
    if (ids.length === 0) {
        alert('Select at least one session to revoke.');
        return;
    }
    if (typeof confirmAppAction === 'function') {
        var confirmed = await confirmAppAction(
            'Revoke ' + ids.length + ' database session(s)? This will remove access in Vault and revoke the user\'s DB access immediately.',
            {
                title: 'Revoke database access',
                confirmLabel: 'Revoke',
                variant: 'warning'
            }
        );
        if (!confirmed) return;
    } else if (!confirm('Revoke ' + ids.length + ' database session(s)? This will remove access in Vault and revoke the user\'s DB access immediately.')) {
        return;
    }
    var apiBase = typeof API_BASE !== 'undefined' ? API_BASE : (window.API_BASE || (window.location.origin + '/api'));
    var url = apiBase + '/admin/revoke-database-sessions';
    var headers = { 'Content-Type': 'application/json' };
    var revokeBtn = document.getElementById('adminRevokeDbSessionsBtn');
    var selectedRows = [];
    checked.forEach(function(cb) {
        var row = cb.closest('tr');
        if (row) selectedRows.push(row);
    });
    if (typeof getCsrfToken === 'function') {
        var csrfToken = getCsrfToken();
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    }
    adminDbSessionsRevoking = true;
    if (revokeBtn) revokeBtn.disabled = true;
    selectedRows.forEach(function(row) {
        row.style.opacity = '0.55';
        row.style.pointerEvents = 'none';
        var cells = row.querySelectorAll('td');
        var lastCell = cells && cells.length ? cells[cells.length - 1] : null;
        if (lastCell) {
            lastCell.setAttribute('data-original-html', lastCell.innerHTML);
            lastCell.innerHTML = '<span class="text-muted">Revoking…</span>';
        }
    });
    setInlineStatus('adminDbSessionsStatus', 'Revoking ' + ids.length + ' database session(s). Please wait while Vault and cleanup finish…', 'warning');
    console.log('Revoke API request:', url, 'request_ids:', ids);
    fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: headers,
        body: JSON.stringify({ request_ids: ids, reason: 'Emergency revoke by admin' })
    })
        .then(function(r) { return r.json().then(function(data) { return { ok: r.ok, status: r.status, data: data }; }); })
        .then(function(result) {
            var data = result.data;
            console.log('Revoke API response:', result.status, result.ok, data);
            if (!result.ok) {
                alert('Revoke failed: ' + (data && data.error ? data.error : result.status));
                return;
            }
            var revoked = (data && data.revoked) ? data.revoked.length : 0;
            var failed = (data && data.failed) ? data.failed.length : 0;
            (data && data.revoked ? data.revoked : []).forEach(function(id) {
                adminDbSessionsLocallyRevoked.add(String(id || '').trim());
            });
            document.querySelectorAll('.admin-db-session-cb').forEach(function(cb) {
                var rid = String(cb.value || '').trim();
                if (adminDbSessionsLocallyRevoked.has(rid)) {
                    var row = cb.closest('tr');
                    if (row && row.parentNode) row.parentNode.removeChild(row);
                }
            });
            if (data && data.error) {
                setInlineStatus('adminDbSessionsStatus', 'Revoke failed: ' + data.error, 'error');
                alert('Error: ' + data.error);
            } else if (revoked) {
                setInlineStatus('adminDbSessionsStatus', 'Revoked ' + revoked + ' session(s). Refreshing the latest state…' + (failed ? ' Some rows had warnings.' : ''), failed ? 'warning' : 'success');
            } else if (failed) {
                setInlineStatus('adminDbSessionsStatus', 'Could not revoke ' + failed + ' session(s).', 'error');
                alert('Could not revoke ' + failed + ' session(s). ' + (data.failed && data.failed.length ? data.failed.map(function(f) { return (f.request_id || '').slice(0, 8) + ': ' + (f.error || ''); }).join('; ') : ''));
            }
            if (typeof loadAdminDatabaseSessions === 'function') {
                loadAdminDatabaseSessions({
                    preserveExisting: true,
                    loadingMessage: revoked ? 'Reconcile in progress. Fetching final revoke status…' : 'Refreshing database session state…'
                });
            }
        })
        .catch(function(err) {
            console.error('Revoke sessions error', err);
            selectedRows.forEach(function(row) {
                row.style.opacity = '';
                row.style.pointerEvents = '';
                var cells = row.querySelectorAll('td');
                var lastCell = cells && cells.length ? cells[cells.length - 1] : null;
                if (lastCell && lastCell.hasAttribute('data-original-html')) {
                    lastCell.innerHTML = lastCell.getAttribute('data-original-html') || '';
                    lastCell.removeAttribute('data-original-html');
                }
            });
            setInlineStatus('adminDbSessionsStatus', 'Revoke request failed. ' + ((err && err.message) ? err.message : 'Please retry.'), 'error');
            alert('Revoke request failed. ' + (err && err.message ? err.message : 'Check console.'));
        })
        .finally(function() {
            adminDbSessionsRevoking = false;
            if (revokeBtn) revokeBtn.disabled = false;
        });
}

// Profile Menu
function toggleProfileMenu() {
    const menu = document.getElementById('profileMenu');
    menu.classList.toggle('show');
}

// Close profile menu when clicking outside
document.addEventListener('click', function(e) {
    const profileDropdown = document.querySelector('.profile-dropdown');
    const menu = document.getElementById('profileMenu');
    if (profileDropdown && menu && !profileDropdown.contains(e.target)) {
        menu.classList.remove('show');
    }
});

// Modal Management
function showModal(modalId) {
    document.getElementById('modalOverlay').classList.add('show');
    document.getElementById(modalId).classList.add('show');
}

function closeModal() {
    if (window.__ROLE_EDITOR_MODAL_STATE && window.__ROLE_EDITOR_MODAL_STATE.active && typeof window.closeRoleEditorModal === 'function') {
        window.closeRoleEditorModal(window.__ROLE_EDITOR_MODAL_STATE.kind);
        return;
    }
    if (window.__WORKFLOW_EDITOR_MODAL_STATE && window.__WORKFLOW_EDITOR_MODAL_STATE.active && typeof window.closeApprovalWorkflowEditorModal === 'function') {
        window.closeApprovalWorkflowEditorModal();
        return;
    }
    var profileModal = document.getElementById('profileModal');
    if (isBusinessProfileGateActive() && profileModal && profileModal.classList.contains('show')) {
        setInlineStatus('profileStatus', 'Check your manager, enter your team name, and save your profile before using NPAMX.', 'warning');
        return;
    }
    document.getElementById('modalOverlay').classList.remove('show');
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('show');
    });
}

function startNewRequestForCloud(cloud, type) {
    window.currentCloudAccessPage = cloud; // For Back button to return to cloud page
    if (type === 'myself') {
        showNewRequestPage(cloud);
    } else {
        showRequestForOthersWithCloud(cloud);
    }
}

function showNewRequestPage(cloudProvider) {
    if (cloudProvider && !isPageEnabledByFeatureFlags(cloudProvider)) {
        alert('Cloud access is currently disabled by administrator.');
        showPage('requests');
        return;
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('newRequestPage').classList.add('active');
    if (cloudProvider && cloudProvider === 'aws') {
        // Skip cloud selection - go directly to AWS step
        if (typeof selectCloudProvider === 'function') {
            selectCloudProvider('aws');
        } else {
            document.getElementById('requestStep1').style.display = 'none';
            document.getElementById('requestStep2AWS').style.display = 'block';
            if (typeof loadAccountsDropdown === 'function') loadAccountsDropdown();
        }
    } else if (cloudProvider) {
        document.getElementById('requestStep1').style.display = 'block';
        document.getElementById('requestStep2AWS').style.display = 'none';
        alert(`${cloudProvider.toUpperCase()} integration coming soon!`);
    } else {
        window.currentCloudAccessPage = null;
        document.getElementById('requestStep1').style.display = 'block';
        document.getElementById('requestStep2AWS').style.display = 'none';
    }
    loadRequestModalData();
}

function showRequestForOthersWithCloud(cloudProvider) {
    if (cloudProvider && !isPageEnabledByFeatureFlags(cloudProvider)) {
        alert('Cloud access is currently disabled by administrator.');
        showPage('requests');
        return;
    }
    const page = document.getElementById('requestForOthersPage');
    if (!page) {
        showPage('requests');
        if (typeof filterRequestsByCategory === 'function') filterRequestsByCategory('cloud', 'pending');
        return;
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    page.classList.add('active');
    if (cloudProvider === 'aws') {
        if (typeof selectCloudProviderForOthers === 'function') {
            selectCloudProviderForOthers('aws');
        } else {
            const step1 = document.getElementById('othersStep1');
            const step2 = document.getElementById('othersStep2AWS');
            if (step1) step1.style.display = 'none';
            if (step2) step2.style.display = 'block';
            if (typeof loadAccountsForOthers === 'function') loadAccountsForOthers();
        }
    } else {
        window.currentCloudAccessPage = null;
        const step1 = document.getElementById('othersStep1');
        const step2 = document.getElementById('othersStep2AWS');
        if (step1) step1.style.display = 'block';
        if (step2) step2.style.display = 'none';
        if (cloudProvider) alert(`${cloudProvider.toUpperCase()} integration coming soon!`);
    }
}

function cancelNewRequest() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('requestsPage').classList.add('active');
    document.getElementById('newRequestForm').reset();
    document.getElementById('resourcesGroup').style.display = 'none';
    document.getElementById('aiPermissionsPreview').style.display = 'none';
    window.currentAIPermissions = null;
    selectedResources = [];
    selectedService = '';
}

function showRequestForOthersModal() {
    if (typeof isFeatureEnabled === 'function' && !isFeatureEnabled('cloud_access')) {
        alert('Cloud access is currently disabled by administrator.');
        showPage('requests');
        return;
    }
    const page = document.getElementById('requestForOthersPage');
    if (!page) {
        showPage('requests');
        if (typeof filterRequestsByCategory === 'function') filterRequestsByCategory('cloud', 'pending');
        return;
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    page.classList.add('active');
    const step1 = document.getElementById('othersStep1');
    const step2 = document.getElementById('othersStep2AWS');
    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
    if (typeof loadAccountsForOthers === 'function') loadAccountsForOthers();
}

function cancelRequestForOthers() {
    showPage('requests');
    document.getElementById('othersStep1').style.display = 'block';
    document.getElementById('othersStep2AWS').style.display = 'none';
}

function closeRequestForOthersModal() {
    cancelRequestForOthers();
    // Clear form
    document.getElementById('requestForOthersForm').reset();
    selectedEmails = [];
    renderEmailTags();
    otherCurrentAIPermissions = null;
    const preview = document.getElementById('otherAiPermissionsPreview');
    if (preview) preview.style.display = 'none';
}

function showManualOnboardModal() {
    showModal('manualOnboardModal');
}

function showNewAppRequestModal() {
    showModal('appRequestModal');
}

// Applications Page Functions
function loadApplicationsPage() {
    console.log('Applications page loaded');
}

function requestCloudAccess(provider) {
    alert(`Cloud access request for ${provider.toUpperCase()} will be available in future releases.`);
}

function requestK8sAccess(cluster) {
    alert(`Kubernetes access request for ${cluster.toUpperCase()} will be available in future releases.`);
}

function requestGkeAccess() {
    alert('Google GKE access request will be available in future releases.');
}

function requestDbAccess(database) {
    alert(`Database access request for ${database} will be available in future releases.`);
}

function requestAppAccess(app) {
    alert(`Application access request for ${app} will be available in future releases.`);
}

async function showProfile() {
    const menu = document.getElementById('profileMenu');
    if (menu) menu.classList.remove('show');
    showModal('profileModal');
    await loadProfileData();
    renderDesktopAgentUserPanel();
}

function updateFeedbackWordCount() {
    const textarea = document.getElementById('feedbackDescription');
    const counter = document.getElementById('feedbackWordCount');
    if (!textarea || !counter) return;
    const text = String(textarea.value || '').trim();
    const count = text ? text.split(/\s+/).filter(Boolean).length : 0;
    counter.textContent = count + ' / 300 words';
    counter.style.color = count > 300 ? 'var(--danger)' : '';
}

function openFeedbackModal() {
    const menu = document.getElementById('profileMenu');
    if (menu) menu.classList.remove('show');
    showModal('feedbackModal');
    showFeedbackHelpTab('faq');
    const form = document.getElementById('feedbackForm');
    if (form && !form.dataset.initialized) {
        form.reset();
    }
    const nameInput = document.getElementById('feedbackName');
    const preferredName = String((currentProfileData && currentProfileData.display_name) || (currentUser && currentUser.name) || localStorage.getItem('userName') || '').trim();
    if (nameInput && !String(nameInput.value || '').trim()) nameInput.value = preferredName;
    setInlineStatus('feedbackStatus', '', 'info');
    updateFeedbackWordCount();
}

function showFeedbackHelpTab(tab, event) {
    const activeTab = String(tab || 'faq').trim().toLowerCase() === 'feedback' ? 'feedback' : 'faq';
    const faqBtn = document.getElementById('feedbackHelpTabBtnFaq');
    const feedbackBtn = document.getElementById('feedbackHelpTabBtnFeedback');
    const faqContent = document.getElementById('feedbackFaqContent');
    const feedbackForm = document.getElementById('feedbackForm');
    if (faqBtn) faqBtn.classList.toggle('active', activeTab === 'faq');
    if (feedbackBtn) feedbackBtn.classList.toggle('active', activeTab === 'feedback');
    if (faqContent) faqContent.style.display = activeTab === 'faq' ? '' : 'none';
    if (feedbackForm) feedbackForm.style.display = activeTab === 'feedback' ? 'grid' : 'none';
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
}

function formatFeedbackStatusPill(value) {
    const raw = String(value || '').trim().toLowerCase();
    const resolved = raw === 'in_progress' ? 'in-progress' : (raw === 'closed' ? 'closed' : 'new');
    return '<span class="feedback-status-pill feedback-status-pill-' + resolved + '">' + escapeHtml(formatFeedbackStatusLabel(raw)) + '</span>';
}

function formatFeedbackReplySnippet(item) {
    const entry = item && typeof item === 'object' ? item : {};
    const reply = String(entry.admin_reply || '').trim();
    if (reply) {
        return '<div class="feedback-reply-snippet">' + escapeHtml(reply) + '</div>'
            + '<div class="feedback-reply-meta">' + escapeHtml(formatDateTimeIst(entry.admin_reply_at || entry.updated_at || '')) + '</div>';
    }
    return '<div class="text-muted">No admin reply yet.</div>';
}

function feedbackNotificationTimestamp(item) {
    const entry = item && typeof item === 'object' ? item : {};
    return String(entry.admin_reply_at || entry.status_updated_at || entry.updated_at || entry.submitted_at || '');
}

function announcementNotificationTimestamp(item) {
    return String(((item && item.updated_at) || (item && item.created_at) || '')).trim();
}

function sortNotificationsByTimestamp(items) {
    return (Array.isArray(items) ? items.slice() : []).sort(function(a, b) {
        return String(b && b.__sort_value || '').localeCompare(String(a && a.__sort_value || ''));
    });
}

async function submitFeedbackForm(e) {
    e.preventDefault();
    const description = String((document.getElementById('feedbackDescription') || {}).value || '').trim();
    const words = description ? description.split(/\s+/).filter(Boolean) : [];
    if (words.length > 300) {
        setInlineStatus('feedbackStatus', 'Feedback description must be 300 words or less.', 'error');
        return;
    }
    const selectedType = document.querySelector('input[name="feedbackType"]:checked');
    try {
        await apiJson('/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: (document.getElementById('feedbackName') || {}).value || '',
                category: (document.getElementById('feedbackCategory') || {}).value || '',
                feedback_type: selectedType ? selectedType.value : '',
                description: description,
            })
        });
        setInlineStatus('feedbackStatus', 'Feedback submitted successfully. Thank you.', 'success');
        const form = document.getElementById('feedbackForm');
        if (form) {
            form.reset();
            form.dataset.initialized = '1';
        }
        const nameInput = document.getElementById('feedbackName');
        const preferredName = String((currentProfileData && currentProfileData.display_name) || (currentUser && currentUser.name) || localStorage.getItem('userName') || '').trim();
        if (nameInput) nameInput.value = preferredName;
        updateFeedbackWordCount();
    } catch (err) {
        setInlineStatus('feedbackStatus', err.message || 'Failed to submit feedback.', 'error');
    }
}

async function loadFeedbackInbox(force) {
    const body = document.getElementById('feedbackInboxBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="7" class="text-muted" style="text-align:center;">Loading feedback…</td></tr>';
    const category = String((document.getElementById('feedbackCategoryFilter') || {}).value || '').trim();
    const feedbackType = String((document.getElementById('feedbackTypeFilter') || {}).value || '').trim();
    const query = String((document.getElementById('feedbackSearchInput') || {}).value || '').trim();
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (feedbackType) params.set('feedback_type', feedbackType);
    if (feedbackAdminStatusTab) params.set('status', feedbackAdminStatusTab);
    if (query) params.set('q', query);
    try {
        const data = await apiJson('/feedback' + (params.toString() ? ('?' + params.toString()) : ''));
        const items = Array.isArray(data.feedback) ? data.feedback : [];
        feedbackInboxCache = items.slice();
        if (!items.length) {
            body.innerHTML = '<tr><td colspan="7" class="text-muted" style="text-align:center;">No feedback found for this status.</td></tr>';
            return;
        }
        body.innerHTML = items.map(function(item) {
            const statusPill = formatFeedbackStatusPill(item.status);
            return '<tr>'
                + '<td>' + escapeHtml(formatDateTimeIst(item.submitted_at || '')) + '</td>'
                + '<td>' + escapeHtml(item.name || '—') + '<br><small>' + escapeHtml(item.email || '') + '</small></td>'
                + '<td>' + escapeHtml(formatRelativeFeedbackCategory(item.category)) + '</td>'
                + '<td>' + escapeHtml(formatRelativeFeedbackType(item.feedback_type)) + '</td>'
                + '<td style="max-width:460px; white-space:normal;">' + escapeHtml(item.description || '—') + '</td>'
                + '<td style="min-width:220px;">' + statusPill + formatFeedbackReplySnippet(item) + '</td>'
                + '<td><button type="button" class="btn-secondary btn-pam btn-sm" onclick="openFeedbackReplyModal(\'' + encodeURIComponent(String(item.id || '')) + '\')"><i class="fas fa-reply"></i> Edit</button></td>'
                + '</tr>';
        }).join('');
    } catch (err) {
        body.innerHTML = '<tr><td colspan="7" class="text-danger" style="text-align:center;">' + escapeHtml(err.message || 'Failed to load feedback.') + '</td></tr>';
    }
}

function showFeedbackAdminSubTab(tab) {
    const nextTab = String(tab || 'feedback').trim().toLowerCase();
    feedbackAdminSubTab = ['feedback', 'rules', 'announcements'].indexOf(nextTab) >= 0 ? nextTab : 'feedback';
    const feedbackBtn = document.getElementById('feedbackInboxSubTab');
    const rulesBtn = document.getElementById('feedbackRulesSubTab');
    const announcementsBtn = document.getElementById('feedbackAnnouncementsSubTab');
    const feedbackPanel = document.getElementById('feedbackInboxPanel');
    const rulesPanel = document.getElementById('notificationRulesPanel');
    const announcementsPanel = document.getElementById('adminAnnouncementsPanel');
    if (feedbackBtn) feedbackBtn.classList.toggle('active', feedbackAdminSubTab === 'feedback');
    if (rulesBtn) rulesBtn.classList.toggle('active', feedbackAdminSubTab === 'rules');
    if (announcementsBtn) announcementsBtn.classList.toggle('active', feedbackAdminSubTab === 'announcements');
    if (feedbackPanel) feedbackPanel.style.display = feedbackAdminSubTab === 'feedback' ? '' : 'none';
    if (rulesPanel) rulesPanel.style.display = feedbackAdminSubTab === 'rules' ? '' : 'none';
    if (announcementsPanel) announcementsPanel.style.display = feedbackAdminSubTab === 'announcements' ? '' : 'none';
    if (feedbackAdminSubTab === 'feedback') {
        loadFeedbackInbox(false);
    } else if (feedbackAdminSubTab === 'rules') {
        loadNotificationRulesPanel();
    } else {
        loadAdminAnnouncements(false);
    }
}

function setNotificationRulesCheckbox(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
}

async function ensureNotificationAudienceGroupsLoaded(force) {
    if (!force && Array.isArray(notificationAudienceGroupsCache) && notificationAudienceGroupsCache.length) return notificationAudienceGroupsCache;
    try {
        const data = await apiJson('/admin/groups');
        notificationAudienceGroupsCache = Array.isArray(data.groups) ? data.groups : [];
    } catch (_) {
        notificationAudienceGroupsCache = [];
    }
    return notificationAudienceGroupsCache;
}

function renderAudienceGroupCheckboxes(containerId, selectedIds, inputName) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    const selected = new Set((Array.isArray(selectedIds) ? selectedIds : []).map(function(item) { return String(item || '').trim(); }));
    const resolvedInputName = String(inputName || 'announcementTargetGroup').trim() || 'announcementTargetGroup';
    if (!notificationAudienceGroupsCache.length) {
        wrap.innerHTML = '<div class="guardrail-search-item"><span>No local NPAMX groups found yet.</span></div>';
        return;
    }
    wrap.innerHTML = notificationAudienceGroupsCache.map(function(group) {
        const groupId = String((group && group.id) || '').trim();
        const label = String((group && group.name) || groupId || 'Group').trim();
        const role = String((group && group.role) || '').trim();
        return '<label class="guardrail-search-item" style="display:flex; align-items:center; gap:8px;">'
            + '<input type="checkbox" name="' + escapeHtml(resolvedInputName) + '" value="' + escapeHtml(groupId) + '"' + (selected.has(groupId) ? ' checked' : '') + '>'
            + '<span>' + escapeHtml(label) + (role ? (' <small>(' + escapeHtml(role) + ')</small>') : '') + '</span>'
            + '</label>';
    }).join('');
}

function collectCheckedValues(selector) {
    return Array.from(document.querySelectorAll(selector)).filter(function(input) {
        return input && input.checked;
    }).map(function(input) {
        return String(input.value || '').trim();
    }).filter(Boolean);
}

function readNotificationEmailList(fieldId) {
    const value = String((document.getElementById(fieldId) || {}).value || '').trim();
    if (!value) return [];
    const seen = new Set();
    return value
        .split(/[\n,;]+/)
        .map(function(item) { return String(item || '').trim().toLowerCase(); })
        .filter(function(item) {
            if (!item || seen.has(item)) return false;
            seen.add(item);
            return true;
        });
}

function syncFeedbackAdminAllUsersState() {
    const allUsersChecked = !!(document.getElementById('feedbackAdminAudienceAllUsers') || {}).checked;
    const roleInputs = Array.from(document.querySelectorAll('input[name="feedbackAdminTargetRole"]'));
    const groupInputs = Array.from(document.querySelectorAll('input[name="feedbackAdminTargetGroup"]'));
    roleInputs.forEach(function(input) {
        input.disabled = allUsersChecked;
    });
    groupInputs.forEach(function(input) {
        input.disabled = allUsersChecked;
    });
    const hint = document.getElementById('feedbackAdminAudienceHint');
    if (hint) {
        hint.textContent = allUsersChecked
            ? 'All users will receive this feedback-admin email flow. Role and group filters are ignored while this is enabled.'
            : 'Choose specific PAM roles, local groups, or individual email addresses for feedback notifications.';
    }
}

async function loadNotificationRulesPanel() {
    await loadAdminSettings().catch(function() {
        return Object.assign({}, appSettings);
    });
    setNotificationRulesCheckbox('notifyRuleDatabasesAccess', appSettings.notify_email_databases_access);
    setNotificationRulesCheckbox('notifyRuleCloudAccess', appSettings.notify_email_cloud_access);
    setNotificationRulesCheckbox('notifyRuleStorageAccess', appSettings.notify_email_storage_access);
    setNotificationRulesCheckbox('notifyRuleWorkloadsAccess', appSettings.notify_email_workloads_access);
    setNotificationRulesCheckbox('notifyRuleApprovalReminders', appSettings.notify_email_access_approval_reminders);
    setNotificationRulesCheckbox('notifyRuleAccessReady', appSettings.notify_email_access_ready_to_requestor);
    setNotificationRulesCheckbox('notifyRuleFeedbackAdmins', appSettings.notify_email_feedback_to_admins);
    setNotificationRulesCheckbox('notifyRuleFeedbackUsers', appSettings.notify_email_feedback_updates_to_users);
    setNotificationRulesCheckbox('notifyRuleAdminActivity', appSettings.notify_email_admin_activity);
    setNotificationRulesCheckbox('feedbackAdminAudienceAllUsers', appSettings.feedback_admin_send_to_all);
    Array.from(document.querySelectorAll('input[name="feedbackAdminTargetRole"]')).forEach(function(input) {
        input.checked = !!(Array.isArray(appSettings.feedback_admin_target_roles) && appSettings.feedback_admin_target_roles.indexOf(String(input.value || '').trim()) >= 0);
    });
    const footerNoteEl = document.getElementById('notificationEmailFooterNote');
    if (footerNoteEl) {
        footerNoteEl.value = String(appSettings.notification_email_footer_note || '').trim()
            || 'Please do not reply to this email. For support, please contact Nykaa SecOps team.';
    }
    await ensureNotificationAudienceGroupsLoaded(false);
    renderAudienceGroupCheckboxes('feedbackAdminAudienceGroups', appSettings.feedback_admin_target_group_ids || [], 'feedbackAdminTargetGroup');
    const directEl = document.getElementById('feedbackAdminDirectEmails');
    const ccEl = document.getElementById('feedbackAdminCcEmails');
    const bccEl = document.getElementById('feedbackAdminBccEmails');
    if (directEl) directEl.value = Array.isArray(appSettings.feedback_admin_direct_emails) ? appSettings.feedback_admin_direct_emails.join(', ') : '';
    if (ccEl) ccEl.value = Array.isArray(appSettings.feedback_admin_cc_emails) ? appSettings.feedback_admin_cc_emails.join(', ') : '';
    if (bccEl) bccEl.value = Array.isArray(appSettings.feedback_admin_bcc_emails) ? appSettings.feedback_admin_bcc_emails.join(', ') : '';
    syncFeedbackAdminAllUsersState();
}

async function saveNotificationRules() {
    const latestSettings = await loadAdminSettings().catch(function() { return Object.assign({}, appSettings); });
    const payload = Object.assign({}, latestSettings, {
        notify_email_databases_access: !!document.getElementById('notifyRuleDatabasesAccess')?.checked,
        notify_email_cloud_access: !!document.getElementById('notifyRuleCloudAccess')?.checked,
        notify_email_storage_access: !!document.getElementById('notifyRuleStorageAccess')?.checked,
        notify_email_workloads_access: !!document.getElementById('notifyRuleWorkloadsAccess')?.checked,
        notify_email_access_approval_reminders: !!document.getElementById('notifyRuleApprovalReminders')?.checked,
        notify_email_access_ready_to_requestor: !!document.getElementById('notifyRuleAccessReady')?.checked,
        notify_email_feedback_to_admins: !!document.getElementById('notifyRuleFeedbackAdmins')?.checked,
        notify_email_feedback_updates_to_users: !!document.getElementById('notifyRuleFeedbackUsers')?.checked,
        notify_email_admin_activity: !!document.getElementById('notifyRuleAdminActivity')?.checked,
        feedback_admin_send_to_all: !!document.getElementById('feedbackAdminAudienceAllUsers')?.checked,
        feedback_admin_target_roles: collectCheckedValues('input[name="feedbackAdminTargetRole"]'),
        feedback_admin_target_group_ids: collectCheckedValues('input[name="feedbackAdminTargetGroup"]'),
        feedback_admin_direct_emails: readNotificationEmailList('feedbackAdminDirectEmails'),
        feedback_admin_cc_emails: readNotificationEmailList('feedbackAdminCcEmails'),
        feedback_admin_bcc_emails: readNotificationEmailList('feedbackAdminBccEmails'),
        notification_email_footer_note: String((document.getElementById('notificationEmailFooterNote') || {}).value || '').trim(),
    });
    try {
        await saveAdminSettings(payload);
        setInlineStatus('notificationRulesStatus', 'Notification rules saved successfully.', 'success');
    } catch (err) {
        setInlineStatus('notificationRulesStatus', err.message || 'Failed to save notification rules.', 'error');
    }
}

function collectNotificationPlaygroundPayload() {
    return {
        template_type: String((document.getElementById('notificationPreviewTemplate') || {}).value || 'announcement').trim(),
        target_email: String((document.getElementById('notificationPreviewTargetEmail') || {}).value || '').trim(),
        subject: String((document.getElementById('notificationPreviewSubject') || {}).value || '').trim(),
        message: String((document.getElementById('notificationPreviewMessage') || {}).value || '').trim(),
    };
}

function renderNotificationPreviewCard(preview, meta) {
    const card = document.getElementById('notificationPreviewCard');
    if (!card) return;
    const details = preview && typeof preview === 'object' ? preview : {};
    const extra = meta && typeof meta === 'object' ? meta : {};
    card.style.display = '';
    card.innerHTML = ''
        + '<div class="notification-card-title-row">'
            + '<strong>' + escapeHtml(details.template_label || 'Notification Preview') + '</strong>'
            + '<span class="feedback-status-pill feedback-status-pill-announcement">Preview</span>'
        + '</div>'
        + '<div class="notification-card-meta">'
            + '<code>' + escapeHtml(details.subject || '') + '</code>'
            + (extra.sent_to ? (' • sent to ' + escapeHtml(Array.isArray(extra.sent_to) ? extra.sent_to.join(', ') : String(extra.sent_to || ''))) : '')
        + '</div>'
        + '<div class="notification-card-body" style="white-space:pre-wrap;">' + escapeHtml(details.rendered_body_text || details.body_text || '') + '</div>';
}

async function previewNotificationTemplate() {
    try {
        const data = await apiJson('/admin/feedback/notification-playground/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(collectNotificationPlaygroundPayload())
        });
        renderNotificationPreviewCard(data.preview || {}, {});
        setInlineStatus('notificationRulesStatus', 'Preview generated successfully.', 'success');
    } catch (err) {
        setInlineStatus('notificationRulesStatus', err.message || 'Failed to generate preview.', 'error');
    }
}

async function sendNotificationTestEmail() {
    try {
        const data = await apiJson('/admin/feedback/notification-playground/test-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(collectNotificationPlaygroundPayload())
        });
        renderNotificationPreviewCard(data.preview || {}, { sent_to: data.sent_to || [] });
        setInlineStatus('notificationRulesStatus', 'Test email sent successfully.', 'success');
    } catch (err) {
        setInlineStatus('notificationRulesStatus', err.message || 'Failed to send test email.', 'error');
    }
}

function setFeedbackAdminStatusTab(status) {
    const nextStatus = String(status || 'new').trim().toLowerCase();
    feedbackAdminStatusTab = nextStatus === 'in_progress' || nextStatus === 'closed' ? nextStatus : 'new';
    ['new', 'in_progress', 'closed'].forEach(function(item) {
        const el = document.getElementById(
            item === 'new' ? 'feedbackStatusTabNew' : (item === 'in_progress' ? 'feedbackStatusTabInProgress' : 'feedbackStatusTabClosed')
        );
        if (el) el.classList.toggle('active', item === feedbackAdminStatusTab);
    });
    loadFeedbackInbox(true);
}

function openFeedbackReplyModal(feedbackId) {
    const id = decodeURIComponent(String(feedbackId || ''));
    const item = feedbackInboxCache.find(function(entry) {
        return String((entry && entry.id) || '') === id;
    });
    if (!item) {
        notifyApp('Feedback entry could not be found. Refresh and try again.', 'warning');
        return;
    }
    const original = document.getElementById('feedbackReplyOriginal');
    const replyId = document.getElementById('feedbackReplyId');
    const statusEl = document.getElementById('feedbackReplyWorkflowStatus');
    const messageEl = document.getElementById('feedbackReplyMessage');
    if (replyId) replyId.value = item.id || '';
    if (statusEl) statusEl.value = String(item.status || 'new').trim().toLowerCase() || 'new';
    if (messageEl) messageEl.value = item.admin_reply || '';
    if (original) {
        original.innerHTML = ''
            + '<div class="notification-card-title-row">'
                + '<strong>' + escapeHtml(item.name || item.email || 'User feedback') + '</strong>'
                + formatFeedbackStatusPill(item.status)
            + '</div>'
            + '<div class="notification-card-meta">'
                + escapeHtml(formatRelativeFeedbackCategory(item.category)) + ' • '
                + escapeHtml(formatRelativeFeedbackType(item.feedback_type)) + ' • '
                + escapeHtml(formatDateTimeIst(item.submitted_at || ''))
            + '</div>'
            + '<div class="notification-card-body">' + escapeHtml(item.description || '—') + '</div>';
    }
    setInlineStatus('feedbackReplyStatus', '', 'info');
    showModal('feedbackReplyModal');
}

async function openFeedbackReplyFromNotification(feedbackId) {
    const id = decodeURIComponent(String(feedbackId || ''));
    closeModal();
    try {
        if (typeof showPage === 'function') showPage('dashboard');
        if (typeof showAdminTab === 'function') showAdminTab('feedback');
        if (typeof showFeedbackAdminSubTab === 'function') showFeedbackAdminSubTab('feedback');
        if (typeof setFeedbackAdminStatusTab === 'function') {
            feedbackAdminStatusTab = 'new';
            setFeedbackAdminStatusTab('new');
        }
        await loadFeedbackInbox(true);
        const queuedItem = (userNotificationsState.admin_feedback_queue || []).find(function(entry) {
            return String((entry && entry.id) || '') === id;
        });
        if (queuedItem && !feedbackInboxCache.some(function(entry) { return String((entry && entry.id) || '') === id; })) {
            feedbackInboxCache = [queuedItem].concat(feedbackInboxCache || []);
        }
        window.setTimeout(function() {
            openFeedbackReplyModal(encodeURIComponent(id));
        }, 120);
    } catch (err) {
        notifyApp(err.message || 'Unable to open the feedback review right now. Please open Admin > Feedback and try again.', 'warning');
    }
}

async function saveFeedbackAdminReply(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    const id = String((document.getElementById('feedbackReplyId') || {}).value || '').trim();
    if (!id) {
        setInlineStatus('feedbackReplyStatus', 'Feedback id is missing. Please reopen the feedback and try again.', 'error');
        return;
    }
    try {
        await apiJson('/feedback/' + encodeURIComponent(id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: (document.getElementById('feedbackReplyWorkflowStatus') || {}).value || 'new',
                admin_reply: (document.getElementById('feedbackReplyMessage') || {}).value || ''
            })
        });
        setInlineStatus('feedbackReplyStatus', 'Feedback update saved successfully.', 'success');
        notifyApp('Feedback update saved successfully.', 'success');
        await loadFeedbackInbox(true);
        await loadUserNotifications();
        window.setTimeout(function() {
            closeModal();
        }, 300);
    } catch (err) {
        setInlineStatus('feedbackReplyStatus', err.message || 'Failed to save feedback update.', 'error');
    }
}

function normalizeNotificationsPayload(data) {
    const payload = data && typeof data === 'object' ? data : {};
    return {
        announcements: Array.isArray(payload.announcements) ? payload.announcements : [],
        feedback_updates: Array.isArray(payload.feedback_updates) ? payload.feedback_updates : [],
        admin_feedback_queue: Array.isArray(payload.admin_feedback_queue) ? payload.admin_feedback_queue : [],
        unread_announcement_ids: Array.isArray(payload.unread_announcement_ids) ? payload.unread_announcement_ids : [],
        unread_feedback_ids: Array.isArray(payload.unread_feedback_ids) ? payload.unread_feedback_ids : [],
        unread_admin_feedback_ids: Array.isArray(payload.unread_admin_feedback_ids) ? payload.unread_admin_feedback_ids : [],
        unread_count: Number(payload.unread_count || 0),
        active_ribbon: payload.active_ribbon && typeof payload.active_ribbon === 'object' ? payload.active_ribbon : null
    };
}

function updateNotificationsHeaderBadge() {
    const badge = document.getElementById('notificationsHeaderBadge');
    const trigger = document.getElementById('notificationsHeaderBtn');
    const unread = Number((userNotificationsState && userNotificationsState.unread_count) || 0);
    if (badge) {
        badge.hidden = unread < 1;
        badge.textContent = unread > 99 ? '99+' : String(unread || 0);
    }
    if (trigger) {
        trigger.classList.toggle('has-unread', unread > 0);
    }
}

function optimisticallyClearNotificationsBadge() {
    if (!userNotificationsState || typeof userNotificationsState !== 'object') return;
    userNotificationsState.unread_announcement_ids = [];
    userNotificationsState.unread_feedback_ids = [];
    userNotificationsState.unread_admin_feedback_ids = [];
    userNotificationsState.unread_count = 0;
    updateNotificationsHeaderBadge();
}

function clearAnnouncementRibbonTimer() {
    if (announcementRibbonTimer) {
        window.clearTimeout(announcementRibbonTimer);
        announcementRibbonTimer = null;
    }
}

function restartAnnouncementRibbonFlight() {
    const planeGroup = document.querySelector('#globalAnnouncementRibbon .announcement-plane-group');
    if (!planeGroup) return;
    planeGroup.classList.remove('is-animating');
    planeGroup.style.animation = 'none';
    planeGroup.style.transform = 'translate3d(10vw, -50%, 0)';
    window.requestAnimationFrame(function() {
        window.requestAnimationFrame(function() {
            planeGroup.style.animation = '';
            planeGroup.classList.add('is-animating');
        });
    });
}

function scheduleNextAnnouncementRibbonCycle() {
    clearAnnouncementRibbonTimer();
    announcementRibbonTimer = window.setTimeout(function() {
        const announcements = Array.isArray(userNotificationsState && userNotificationsState.announcements)
            ? userNotificationsState.announcements.filter(function(item) {
                return item && typeof item === 'object' && String(item.message || '').trim();
            })
            : [];
        if (!announcements.length) {
            clearAnnouncementRibbonTimer();
            return;
        }
        announcementRibbonIndex = (announcementRibbonIndex + 1) % announcements.length;
        renderAnnouncementRibbon();
    }, ANNOUNCEMENT_RIBBON_CYCLE_MS);
}

function renderAnnouncementRibbon() {
    const ribbon = document.getElementById('globalAnnouncementRibbon');
    const message = document.getElementById('globalAnnouncementRibbonMessage');
    const announcements = Array.isArray(userNotificationsState && userNotificationsState.announcements)
        ? userNotificationsState.announcements.filter(function(item) {
            return item && typeof item === 'object' && String(item.message || '').trim();
        })
        : [];
    if (!ribbon || !message) return;
    if (!announcements.length) {
        clearAnnouncementRibbonTimer();
        announcementRibbonIndex = 0;
        ribbon.style.display = 'none';
        document.body.classList.remove('has-announcement-ribbon');
        return;
    }
    if (announcementRibbonIndex >= announcements.length) {
        announcementRibbonIndex = 0;
    }
    const active = announcements[announcementRibbonIndex] || announcements[0];
    const text = String((active && active.message) || '').trim();
    if (!text) {
        clearAnnouncementRibbonTimer();
        announcementRibbonIndex = 0;
        ribbon.style.display = 'none';
        document.body.classList.remove('has-announcement-ribbon');
        return;
    }
    message.textContent = text;
    ribbon.style.display = '';
    document.body.classList.add('has-announcement-ribbon');
    restartAnnouncementRibbonFlight();
    scheduleNextAnnouncementRibbonCycle();
}

function buildFeedbackNotificationCard(item, unread, adminQueue) {
    const entry = item && typeof item === 'object' ? item : {};
    const reply = String(entry.admin_reply || '').trim();
    const message = adminQueue
        ? 'A new feedback item is waiting for review.'
        : (reply || ('Status changed to ' + formatFeedbackStatusLabel(entry.status) + '.'));
    return ''
        + '<div class="notification-card notification-card-feedback' + (unread ? ' is-unread' : '') + '">'
            + '<div class="notification-card-title-row">'
                + '<strong>' + escapeHtml(entry.name || entry.email || 'Feedback update') + '</strong>'
                + formatFeedbackStatusPill(entry.status)
            + '</div>'
            + '<div class="notification-card-meta">'
                + escapeHtml(formatRelativeFeedbackCategory(entry.category)) + ' • '
                + escapeHtml(formatRelativeFeedbackType(entry.feedback_type)) + ' • '
                + escapeHtml(formatDateTimeIst(feedbackNotificationTimestamp(entry)))
            + '</div>'
            + '<div class="notification-card-body">' + escapeHtml(message) + '</div>'
            + (adminQueue ? '<div class="notification-card-actions"><button type="button" class="btn-secondary btn-pam btn-sm" onclick="openFeedbackReplyFromNotification(\'' + encodeURIComponent(String(entry.id || '')) + '\')"><i class="fas fa-arrow-up-right-from-square"></i> Review</button></div>' : '')
        + '</div>';
}

function buildAnnouncementNotificationCard(item, unread) {
    const entry = item && typeof item === 'object' ? item : {};
    return ''
        + '<div class="notification-card notification-card-announcement' + (unread ? ' is-unread' : '') + '">'
            + '<div class="notification-card-title-row">'
                + '<strong>Announcement</strong>'
                + '<span class="feedback-status-pill feedback-status-pill-announcement">Live</span>'
            + '</div>'
            + '<div class="notification-card-meta">' + escapeHtml(formatDateTimeIst(announcementNotificationTimestamp(entry))) + '</div>'
            + '<div class="notification-card-body">' + escapeHtml(entry.message || '—') + '</div>'
        + '</div>';
}

function getFilteredNotificationsForModal() {
    const announcementUnread = new Set((userNotificationsState && userNotificationsState.unread_announcement_ids) || []);
    const feedbackUnread = new Set((userNotificationsState && userNotificationsState.unread_feedback_ids) || []);
    const adminFeedbackUnread = new Set((userNotificationsState && userNotificationsState.unread_admin_feedback_ids) || []);
    const feedbackCards = []
        .concat((userNotificationsState.feedback_updates || []).map(function(item) {
            return {
                type: 'feedback',
                id: item.id,
                __sort_value: feedbackNotificationTimestamp(item),
                unread: feedbackUnread.has(item.id),
                html: buildFeedbackNotificationCard(item, feedbackUnread.has(item.id), false)
            };
        }))
        .concat((userNotificationsState.admin_feedback_queue || []).map(function(item) {
            return {
                type: 'admin_feedback',
                id: item.id,
                __sort_value: feedbackNotificationTimestamp(item),
                unread: adminFeedbackUnread.has(item.id),
                html: buildFeedbackNotificationCard(item, adminFeedbackUnread.has(item.id), true)
            };
        }));
    const announcementCards = (userNotificationsState.announcements || []).map(function(item) {
        return {
            type: 'announcement',
            id: item.id,
            __sort_value: announcementNotificationTimestamp(item),
            unread: announcementUnread.has(item.id),
            html: buildAnnouncementNotificationCard(item, announcementUnread.has(item.id))
        };
    });
    const all = sortNotificationsByTimestamp(feedbackCards.concat(announcementCards));
    if (notificationsModalTab === 'feedback') return feedbackCards;
    if (notificationsModalTab === 'announcements') return announcementCards;
    return all;
}

function renderNotificationsModalList() {
    const list = document.getElementById('notificationsModalList');
    if (!list) return;
    const items = getFilteredNotificationsForModal();
    if (!items.length) {
        list.innerHTML = '<div class="notification-card notification-card-empty"><strong>No notifications right now.</strong><div class="notification-card-body">Replies, new feedback items, and announcement updates will appear here.</div></div>';
        return;
    }
    list.innerHTML = items.map(function(item) { return item.html; }).join('');
}

async function markVisibleNotificationsRead() {
    const items = getFilteredNotificationsForModal();
    const announcementIds = [];
    const feedbackIds = [];
    const adminFeedbackIds = [];
    items.forEach(function(item) {
        if (!item.unread) return;
        if (item.type === 'announcement') {
            announcementIds.push(item.id);
        } else if (item.type === 'feedback') {
            feedbackIds.push(item.id);
        } else if (item.type === 'admin_feedback') {
            adminFeedbackIds.push(item.id);
        }
    });
    if (!announcementIds.length && !feedbackIds.length && !adminFeedbackIds.length) return;
    try {
        await apiJson('/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                announcement_ids: announcementIds,
                feedback_ids: feedbackIds,
                admin_feedback_ids: adminFeedbackIds
            })
        });
        userNotificationsState.unread_announcement_ids = (userNotificationsState.unread_announcement_ids || []).filter(function(id) {
            return announcementIds.indexOf(id) < 0;
        });
        userNotificationsState.unread_feedback_ids = (userNotificationsState.unread_feedback_ids || []).filter(function(id) {
            return feedbackIds.indexOf(id) < 0;
        });
        userNotificationsState.unread_admin_feedback_ids = (userNotificationsState.unread_admin_feedback_ids || []).filter(function(id) {
            return adminFeedbackIds.indexOf(id) < 0;
        });
        userNotificationsState.unread_count = Math.max(
            0,
            Number(userNotificationsState.unread_announcement_ids.length || 0)
            + Number(userNotificationsState.unread_feedback_ids.length || 0)
            + Number(userNotificationsState.unread_admin_feedback_ids.length || 0)
        );
        updateNotificationsHeaderBadge();
        renderNotificationsModalList();
    } catch (err) {
        console.warn('Failed to mark notifications as read:', err);
    }
}

async function loadUserNotifications() {
    try {
        userNotificationsState = normalizeNotificationsPayload(await apiJson('/notifications'));
        renderAnnouncementRibbon();
        if (document.getElementById('notificationsModal') && document.getElementById('notificationsModal').classList.contains('show')) {
            renderNotificationsModalList();
            await markVisibleNotificationsRead();
            return;
        }
        updateNotificationsHeaderBadge();
    } catch (err) {
        console.warn('Failed to load user notifications:', err);
    }
}

async function openNotificationsModal() {
    const menu = document.getElementById('profileMenu');
    if (menu) menu.classList.remove('show');
    notificationsModalTab = 'all';
    showModal('notificationsModal');
    renderNotificationsModalList();
    optimisticallyClearNotificationsBadge();
    await markVisibleNotificationsRead();
    await loadUserNotifications();
    showNotificationsModalTab('all');
}

function showNotificationsModalTab(tab) {
    notificationsModalTab = String(tab || 'all').trim().toLowerCase();
    if (['all', 'feedback', 'announcements'].indexOf(notificationsModalTab) < 0) notificationsModalTab = 'all';
    ['all', 'feedback', 'announcements'].forEach(function(item) {
        const el = document.getElementById(
            item === 'all' ? 'notificationsModalTabAll' : (item === 'feedback' ? 'notificationsModalTabFeedback' : 'notificationsModalTabAnnouncements')
        );
        if (el) el.classList.toggle('active', item === notificationsModalTab);
    });
    renderNotificationsModalList();
    markVisibleNotificationsRead();
}

async function loadAdminAnnouncements(force) {
    const list = document.getElementById('adminAnnouncementsList');
    if (!list) return;
    list.innerHTML = '<div class="notification-card notification-card-empty"><strong>Loading notifications…</strong></div>';
    try {
        await ensureNotificationAudienceGroupsLoaded(force);
        const data = await apiJson('/admin/announcements');
        adminAnnouncementsCache = Array.isArray(data.announcements) ? data.announcements : [];
        if (!adminAnnouncementsCache.length) {
            list.innerHTML = '<div class="notification-card notification-card-empty"><strong>No notifications created yet.</strong><div class="notification-card-body">Create a release, maintenance, or downtime notification to broadcast it to all users.</div></div>';
            return;
        }
        list.innerHTML = adminAnnouncementsCache.map(function(item) {
            const status = item.closed ? 'Closed' : (item.active ? 'Live' : 'Draft');
            const pillClass = item.closed ? 'feedback-status-pill-closed' : (item.active ? 'feedback-status-pill-announcement' : 'feedback-status-pill-new');
            const targetRoles = Array.isArray(item.target_roles) ? item.target_roles : [];
            const targetGroups = Array.isArray(item.target_group_ids) ? item.target_group_ids : [];
            const audienceLabel = []
                .concat(targetRoles.length ? ['Roles: ' + targetRoles.join(', ')] : [])
                .concat(targetGroups.length ? ['Groups: ' + targetGroups.join(', ')] : [])
                .join(' • ') || 'Audience: All users';
            return ''
                + '<div class="notification-card notification-card-announcement-admin">'
                    + '<div class="notification-card-title-row">'
                        + '<strong>' + escapeHtml(status + ' notification') + '</strong>'
                        + '<span class="feedback-status-pill ' + pillClass + '">' + escapeHtml(status) + '</span>'
                    + '</div>'
                    + '<div class="notification-card-meta">Updated ' + escapeHtml(formatDateTimeIst(item.updated_at || item.created_at || '')) + ' • ' + escapeHtml(audienceLabel) + (item.email_enabled ? ' • Email enabled' : '') + '</div>'
                    + '<div class="notification-card-body">' + escapeHtml(item.message || '—') + '</div>'
                    + '<div class="notification-card-actions">'
                        + '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="openAnnouncementModal(\'' + encodeURIComponent(String(item.id || '')) + '\')"><i class="fas fa-pen"></i> Edit</button>'
                        + '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="toggleAnnouncementClosed(\'' + encodeURIComponent(String(item.id || '')) + '\',' + (item.closed ? 'false' : 'true') + ')"><i class="fas fa-box-archive"></i> ' + (item.closed ? 'Reopen' : 'Archive') + '</button>'
                        + '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="deleteAnnouncement(\'' + encodeURIComponent(String(item.id || '')) + '\')"><i class="fas fa-trash"></i> Delete</button>'
                    + '</div>'
                + '</div>';
        }).join('');
    } catch (err) {
        list.innerHTML = '<div class="notification-card notification-card-empty"><strong>' + escapeHtml(err.message || 'Failed to load announcements.') + '</strong></div>';
    }
}

function openAnnouncementModal(announcementId) {
    const id = announcementId ? decodeURIComponent(String(announcementId || '')) : '';
    const item = id ? adminAnnouncementsCache.find(function(entry) { return String((entry && entry.id) || '') === id; }) : null;
    const title = document.getElementById('announcementModalTitle');
    const idInput = document.getElementById('announcementId');
    const messageEl = document.getElementById('announcementMessage');
    const activeEl = document.getElementById('announcementActive');
    const closedEl = document.getElementById('announcementClosed');
    const directEl = document.getElementById('announcementDirectEmails');
    const ccEl = document.getElementById('announcementCcEmails');
    const bccEl = document.getElementById('announcementBccEmails');
    if (title) title.innerHTML = '<i class="fas fa-bullhorn"></i> ' + (item ? 'Edit Notification' : 'Create Notification');
    if (idInput) idInput.value = item ? (item.id || '') : '';
    if (messageEl) messageEl.value = item ? (item.message || '') : '';
    if (activeEl) activeEl.checked = item ? item.active !== false : true;
    if (closedEl) closedEl.checked = item ? item.closed === true : false;
    if (directEl) directEl.value = item && Array.isArray(item.direct_emails) ? item.direct_emails.join('\n') : '';
    if (ccEl) ccEl.value = item && Array.isArray(item.cc_emails) ? item.cc_emails.join('\n') : '';
    if (bccEl) bccEl.value = item && Array.isArray(item.bcc_emails) ? item.bcc_emails.join('\n') : '';
    const emailEnabledEl = document.getElementById('announcementEmailEnabled');
    if (emailEnabledEl) emailEnabledEl.checked = item ? item.email_enabled === true : false;
    Array.from(document.querySelectorAll('input[name="announcementTargetRole"]')).forEach(function(input) {
        input.checked = !!(item && Array.isArray(item.target_roles) && item.target_roles.indexOf(String(input.value || '').trim()) >= 0);
    });
    ensureNotificationAudienceGroupsLoaded(false).then(function() {
        renderAudienceGroupCheckboxes('announcementAudienceGroups', item && Array.isArray(item.target_group_ids) ? item.target_group_ids : []);
    });
    updateAnnouncementWordCount();
    setInlineStatus('announcementStatus', '', 'info');
    showModal('announcementModal');
}

function readAnnouncementEmailList(fieldId) {
    const value = String((document.getElementById(fieldId) || {}).value || '').trim();
    if (!value) return [];
    const seen = new Set();
    return value
        .split(/[\n,;]+/)
        .map(function(item) { return String(item || '').trim().toLowerCase(); })
        .filter(function(item) {
            if (!item || seen.has(item)) return false;
            seen.add(item);
            return true;
        });
}

function updateAnnouncementWordCount() {
    const textarea = document.getElementById('announcementMessage');
    const counter = document.getElementById('announcementWordCount');
    if (!textarea || !counter) return;
    const text = String(textarea.value || '').trim();
    const count = text ? text.split(/\s+/).filter(Boolean).length : 0;
    counter.textContent = count + ' / 1000 words';
    counter.style.color = count > 1000 ? 'var(--danger)' : '';
}

function collectAnnouncementFormPayload() {
    return {
        id: String((document.getElementById('announcementId') || {}).value || '').trim(),
        message: String((document.getElementById('announcementMessage') || {}).value || '').trim(),
        active: !!(document.getElementById('announcementActive') || {}).checked,
        closed: !!(document.getElementById('announcementClosed') || {}).checked,
        email_enabled: !!(document.getElementById('announcementEmailEnabled') || {}).checked,
        target_roles: collectCheckedValues('input[name="announcementTargetRole"]'),
        target_group_ids: collectCheckedValues('input[name="announcementTargetGroup"]'),
        direct_emails: readAnnouncementEmailList('announcementDirectEmails'),
        cc_emails: readAnnouncementEmailList('announcementCcEmails'),
        bcc_emails: readAnnouncementEmailList('announcementBccEmails')
    };
}

async function saveAnnouncementForm(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    const payload = collectAnnouncementFormPayload();
    const id = String(payload.id || '').trim();
    const words = String(payload.message || '').trim() ? String(payload.message || '').trim().split(/\s+/).filter(Boolean) : [];
    if (words.length > 1000) {
        setInlineStatus('announcementStatus', 'Announcement message must be 1000 words or less.', 'error');
        return;
    }
    try {
        const path = id ? ('/admin/announcements/' + encodeURIComponent(id)) : '/admin/announcements';
        await apiJson(path, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        setInlineStatus('announcementStatus', 'Notification saved successfully.', 'success');
        notifyApp('Notification saved successfully.', 'success');
        await loadAdminAnnouncements(true);
        await loadUserNotifications();
        window.setTimeout(function() {
            closeModal();
        }, 300);
    } catch (err) {
        setInlineStatus('announcementStatus', err.message || 'Failed to save notification.', 'error');
    }
}

async function sendAnnouncementEmailFlow() {
    const payload = collectAnnouncementFormPayload();
    const words = String(payload.message || '').trim() ? String(payload.message || '').trim().split(/\s+/).filter(Boolean) : [];
    if (!payload.message) {
        setInlineStatus('announcementStatus', 'Announcement message is required before sending.', 'error');
        return;
    }
    if (words.length > 1000) {
        setInlineStatus('announcementStatus', 'Announcement message must be 1000 words or less.', 'error');
        return;
    }
    try {
        const previewData = await apiJson('/admin/announcements/preview-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const recipientCount = Number(previewData.recipient_count || 0);
        if (recipientCount < 1) {
            setInlineStatus('announcementStatus', 'No recipients matched the selected roles, groups, or direct email addresses.', 'error');
            return;
        }
        const ccCount = Array.isArray(previewData.cc_recipients) ? previewData.cc_recipients.length : 0;
        const bccCount = Array.isArray(previewData.bcc_recipients) ? previewData.bcc_recipients.length : 0;
        const sendSummary = 'This will send the announcement email to ' + recipientCount + ' primary recipient(s)'
            + (ccCount ? (', ' + ccCount + ' CC') : '')
            + (bccCount ? (', ' + bccCount + ' BCC') : '')
            + '. Continue?';
        const confirmed = await confirmAppAction(sendSummary, {
            title: 'Send announcement email',
            confirmLabel: 'Send',
            variant: 'warning'
        });
        if (!confirmed) return;
        const sendData = await apiJson('/admin/announcements/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        setInlineStatus('announcementStatus', 'Announcement email sent to ' + escapeHtml(String(sendData.recipient_count || recipientCount)) + ' recipient(s).', 'success');
        notifyApp('Announcement email sent successfully.', 'success');
    } catch (err) {
        setInlineStatus('announcementStatus', err.message || 'Failed to send announcement email.', 'error');
    }
}

async function toggleAnnouncementClosed(announcementId, nextClosed) {
    const id = decodeURIComponent(String(announcementId || ''));
    const item = adminAnnouncementsCache.find(function(entry) { return String((entry && entry.id) || '') === id; });
    if (!item) return;
    try {
        await apiJson('/admin/announcements/' + encodeURIComponent(id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: item.message || '',
                active: item.active !== false,
                closed: nextClosed === true || String(nextClosed || '').trim().toLowerCase() === 'true'
            })
        });
        await loadAdminAnnouncements(true);
        await loadUserNotifications();
        notifyApp('Notification updated successfully.', 'success');
    } catch (err) {
        notifyApp(err.message || 'Failed to update notification.', 'error');
    }
}

async function deleteAnnouncement(announcementId) {
    const id = decodeURIComponent(String(announcementId || ''));
    const confirmed = await confirmAppAction('Delete this notification? Users will stop seeing it in the ribbon and notification bell.', {
        title: 'Delete notification',
        confirmLabel: 'Delete',
        variant: 'warning'
    });
    if (!confirmed) return;
    try {
        await apiJson('/admin/announcements/' + encodeURIComponent(id), {
            method: 'DELETE'
        });
        await loadAdminAnnouncements(true);
        await loadUserNotifications();
        notifyApp('Notification deleted successfully.', 'success');
    } catch (err) {
        notifyApp(err.message || 'Failed to delete notification.', 'error');
    }
}

function refreshFeedbackAdminPanel() {
    if (feedbackAdminSubTab === 'announcements') {
        loadAdminAnnouncements(true);
    } else if (feedbackAdminSubTab === 'rules') {
        loadNotificationRulesPanel();
    } else {
        loadFeedbackInbox(true);
    }
}

function getCurrentBusinessProfile() {
    return (window.NPAM_USER_PROFILE && typeof window.NPAM_USER_PROFILE === 'object')
        ? window.NPAM_USER_PROFILE
        : {};
}

function profileNeedsBusinessProfile(profile) {
    const data = profile || {};
    if (Array.isArray(data.missing_fields) && data.missing_fields.length) return true;
    return data.business_profile_required === true || data.business_profile_complete === false;
}

function setProfileDirectoryResults(kind, users) {
    const resultId = kind === 'manager_manager' ? 'profileManagerManagerSearchResults' : 'profileManagerSearchResults';
    const target = document.getElementById(resultId);
    if (!target) return;
    const items = Array.isArray(users) ? users : [];
    if (!items.length) {
        target.innerHTML = '<div class="guardrail-search-item"><span>No matching users found.</span></div>';
        return;
    }
    target.innerHTML = items.map(function(user, idx) {
        const display = String(user.display_name || user.email || user.username || 'User').trim();
        const email = String(user.email || '').trim().toLowerCase();
        return '<div class="guardrail-search-item">'
            + '<span>' + escapeHtml(display) + (email ? (' <small>(' + escapeHtml(email) + ')</small>') : '') + '</span>'
            + '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="selectProfileDirectoryUser(\'' + escapeHtml(kind) + '\',' + idx + ')">Use</button>'
            + '</div>';
    }).join('');
}

function renderProfileBusinessProfile(profile) {
    const data = profile || {};
    const business = data.business_profile || {};
    window.NPAM_USER_PROFILE = business;
    window.__npamBusinessProfileGateActive = profileNeedsBusinessProfile(data);
    syncBusinessProfileGateUi();
    const banner = document.getElementById('profileBusinessProfileBanner');
    const rmHint = document.getElementById('profileRmChangeHint');
    const rmInput = document.getElementById('profileManagerEmail');
    const rmSearchInput = document.getElementById('profileManagerSearchInput');
    const rmSearchBtn = document.getElementById('profileManagerSearchBtn');
    const mmSearchInput = document.getElementById('profileManagerManagerSearchInput');
    const mmSearchBtn = document.getElementById('profileManagerManagerSearchBtn');
    const mmInput = document.getElementById('profileManagerManagerEmail');
    const teamInput = document.getElementById('profileTeam');
    const jobTitleInput = document.getElementById('profileJobTitle');
    const saveBtn = document.getElementById('profileSaveBtn');
    const missing = Array.isArray(data.missing_fields) ? data.missing_fields : [];
    const remaining = Number.isFinite(Number(business.rm_changes_remaining)) ? Number(business.rm_changes_remaining) : 2;
    const rmLocked = business.rm_change_locked === true;
    const jumpcloudManaged = String(business.directory_profile_source || '').trim().toLowerCase() === 'jumpcloud';
    if (banner) {
        banner.hidden = false;
        if (missing.length) {
            banner.textContent = 'Check whether your reporting manager is correct. If it is wrong, contact IT. If everything is correct, enter your team name and save your profile before using NPAMX. Missing: ' + missing.join(', ') + '.';
            banner.setAttribute('data-variant', 'warning');
        } else if (jumpcloudManaged) {
            banner.textContent = 'Manager details are synced from JumpCloud. Confirm the reporting manager is correct, then enter or update your team name here before continuing.';
            banner.setAttribute('data-variant', 'success');
        } else {
            banner.textContent = 'Profile is complete. Confirm manager details and keep team name updated for approvals, reporting, and access tracking.';
            banner.setAttribute('data-variant', 'success');
        }
    }
    if (rmHint) {
        rmHint.textContent = jumpcloudManaged
            ? 'Reporting lines are synced from JumpCloud. If the manager is wrong, contact IT before continuing.'
            : (rmLocked
            ? 'You have used both self-service RM changes. Please contact the NPAMx admin for further RM updates.'
            : 'Confirm the reporting manager is correct. RM email can be changed ' + remaining + ' more time' + (remaining === 1 ? '' : 's') + '.');
        rmHint.style.color = (!jumpcloudManaged && rmLocked) ? 'var(--warning-700, #b45309)' : '';
    }

    const setValue = function(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    };
    setValue('profileManagerEmail', business.manager_email || '');
    setValue('profileManagerManagerEmail', business.manager_manager_email || '');
    setValue('profileTeam', business.team || '');
    setValue('profileJobTitle', business.job_title || '');
    setValue('profileLocation', business.location || '');
    setValue('profileManagerSearchInput', '');
    setValue('profileManagerManagerSearchInput', '');
    if (rmInput) rmInput.readOnly = rmLocked || jumpcloudManaged;
    if (rmSearchInput) rmSearchInput.disabled = rmLocked || jumpcloudManaged;
    if (rmSearchBtn) rmSearchBtn.disabled = rmLocked || jumpcloudManaged;
    if (mmInput) mmInput.readOnly = jumpcloudManaged;
    if (mmSearchInput) mmSearchInput.disabled = jumpcloudManaged;
    if (mmSearchBtn) mmSearchBtn.disabled = jumpcloudManaged;
    if (teamInput) teamInput.readOnly = false;
    if (jobTitleInput) jobTitleInput.readOnly = true;
    if (saveBtn) saveBtn.textContent = 'Save Profile';
    ['profileManagerSearchResults', 'profileManagerManagerSearchResults'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });

    Array.from(document.querySelectorAll('input[name="profileFrequentEnv"]')).forEach(function(cb) {
        cb.checked = Array.isArray(business.frequent_environments)
            && business.frequent_environments.indexOf(String(cb.value || '').trim().toLowerCase()) >= 0;
    });

    if (typeof window.applyDbProfileDefaults === 'function') {
        window.applyDbProfileDefaults(true);
    }
}

async function searchProfileDirectoryUser(kind) {
    const business = getCurrentBusinessProfile();
    if (String((business && business.directory_profile_source) || '').trim().toLowerCase() === 'jumpcloud') {
        setInlineStatus('profileStatus', 'Manager hierarchy is synced from JumpCloud and cannot be edited here.', 'info');
        return;
    }
    if (kind === 'manager' && business && business.rm_change_locked) {
        setInlineStatus('profileStatus', 'RM email can only be changed twice. Please contact the NPAMx admin for further updates.', 'warning');
        return;
    }
    const inputId = kind === 'manager_manager' ? 'profileManagerManagerSearchInput' : 'profileManagerSearchInput';
    const input = document.getElementById(inputId);
    const query = String((input && input.value) || '').trim();
    const resultId = kind === 'manager_manager' ? 'profileManagerManagerSearchResults' : 'profileManagerSearchResults';
    const target = document.getElementById(resultId);
    if (!target) return;
    if (!query) {
        target.innerHTML = '<div class="guardrail-search-item"><span>Enter a name or email to search.</span></div>';
        return;
    }
    target.innerHTML = '<div class="guardrail-search-item"><span>Searching…</span></div>';
    try {
        const data = await apiJson('/profile/directory-search?q=' + encodeURIComponent(query));
        window.__npamProfileDirectorySearch = window.__npamProfileDirectorySearch || { manager: [], manager_manager: [] };
        window.__npamProfileDirectorySearch[kind] = Array.isArray(data.users) ? data.users : [];
        setProfileDirectoryResults(kind, window.__npamProfileDirectorySearch[kind]);
    } catch (err) {
        target.innerHTML = '<div class="guardrail-search-item"><span>' + escapeHtml(err.message || 'Search failed.') + '</span></div>';
    }
}

function selectProfileDirectoryUser(kind, index) {
    const business = getCurrentBusinessProfile();
    if (kind === 'manager' && business && business.rm_change_locked) {
        setInlineStatus('profileStatus', 'RM email can only be changed twice. Please contact the NPAMx admin for further updates.', 'warning');
        return;
    }
    const results = (window.__npamProfileDirectorySearch && window.__npamProfileDirectorySearch[kind]) || [];
    const item = results[index];
    if (!item) return;
    const email = String(item.email || '').trim().toLowerCase();
    if (!email) return;
    const fieldId = kind === 'manager_manager' ? 'profileManagerManagerEmail' : 'profileManagerEmail';
    const resultId = kind === 'manager_manager' ? 'profileManagerManagerSearchResults' : 'profileManagerSearchResults';
    const field = document.getElementById(fieldId);
    const resultWrap = document.getElementById(resultId);
    if (field) field.value = email;
    if (resultWrap) resultWrap.innerHTML = '';
}

async function saveProfileBusinessProfile(e) {
    if (e) e.preventDefault();
    const environments = Array.from(document.querySelectorAll('input[name="profileFrequentEnv"]:checked')).map(function(cb) {
        return String(cb.value || '').trim().toLowerCase();
    });
    try {
        const data = await apiJson('/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                manager_email: (document.getElementById('profileManagerEmail') || {}).value || '',
                manager_manager_email: (document.getElementById('profileManagerManagerEmail') || {}).value || '',
                team: (document.getElementById('profileTeam') || {}).value || '',
                location: (document.getElementById('profileLocation') || {}).value || '',
                frequent_environments: environments,
            })
        });
        const nextProfile = Object.assign({}, currentProfileData || {}, data || {});
        currentProfileData = nextProfile;
        renderProfileBusinessProfile(nextProfile);
        window.__npamBusinessProfileGateActive = profileNeedsBusinessProfile(nextProfile);
        syncBusinessProfileGateUi();
        setInlineStatus('profileStatus', 'Profile saved successfully.', 'success');
        if (typeof showAppNotification === 'function') {
            showAppNotification('Profile saved successfully.', 'success');
        }
    } catch (err) {
        setInlineStatus('profileStatus', err.message || 'Failed to save workforce profile.', 'error');
    }
}

function maybePromptForBusinessProfile(profile) {
    const data = profile || currentProfileData || {};
    window.__npamBusinessProfileGateActive = profileNeedsBusinessProfile(data);
    syncBusinessProfileGateUi();
    if (!window.__npamBusinessProfileGateActive) return;
    const email = String(data.email || localStorage.getItem('userEmail') || '').trim().toLowerCase();
    const promptKey = email || 'current';
    if (window.__npamBusinessProfilePromptedFor === promptKey) return;
    window.__npamBusinessProfilePromptedFor = promptKey;
    showModal('profileModal');
    setInlineStatus('profileStatus', 'Check your manager, enter your team name, and save your profile before using NPAMX.', 'warning');
}

function renderProfileData(profile) {
    currentProfileData = profile || null;
    const data = profile || {};
    const authType = String(data.auth_type || 'sso').trim().toLowerCase();
    const breakGlass = data.break_glass || {};
    const directOnlyWrap = document.getElementById('profileDirectOnlyWrap');
    const ssoNote = document.getElementById('profileSsoNote');
    const devicesWrap = document.getElementById('profileMfaDevices');
    const lastLogin = document.getElementById('profileLastLogin');

    const setText = function(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    setText('profileDisplayName', data.display_name || deriveNameFromEmail(data.email || '') || 'User');
    setText('profileEmail', data.email || '-');
    setText('profileAuthType', authType === 'break_glass' ? 'Break-glass / Local Admin' : 'Identity Provider');
    setText('profileRole', data.role || (data.is_admin ? 'Admin' : 'User'));
    setText('profilePamAppRole', Array.isArray(data.pam_app_roles) && data.pam_app_roles.length
        ? data.pam_app_roles.map(function(item) { return String(item.name || item.id || '').trim(); }).filter(Boolean).join(', ')
        : '-');
    setText('profileCompanyRole', ((data.business_profile || {}).job_title) || '-');
    if (lastLogin) lastLogin.textContent = 'Last sign-in: ' + formatDateTimeIst(breakGlass.last_login_at);

    if (directOnlyWrap) directOnlyWrap.style.display = authType === 'break_glass' ? 'block' : 'none';
    if (ssoNote) ssoNote.style.display = authType === 'break_glass' ? 'none' : 'block';

    if (devicesWrap) {
        const devices = Array.isArray(breakGlass.mfa_devices) ? breakGlass.mfa_devices : [];
        devicesWrap.innerHTML = devices.map(function(device) {
            const enabled = device && device.enabled === true;
            return (
                '<div class="profile-device-card">' +
                    '<div class="profile-device-header">' +
                        '<strong>' + escapeHtml(device.label || 'Authenticator') + '</strong>' +
                        '<span class="badge ' + (enabled ? 'badge-success' : 'badge-warning') + '">' + (enabled ? 'Enrolled' : 'Not Enrolled') + '</span>' +
                    '</div>' +
                    '<p>' + (enabled
                        ? 'This device can be used for break-glass sign-in.'
                        : 'Enroll this device from the setup form below.') + '</p>' +
                '</div>'
            );
        }).join('') || '<div class="profile-device-card"><p>No MFA devices available.</p></div>';
    }

    const setupPanel = document.getElementById('profileMfaSetupPanel');
    if (setupPanel && !pendingProfileMfaSetup) {
        setupPanel.style.display = 'none';
    }

    renderProfileBusinessProfile(data);
    renderDesktopAgentUserPanel();
}

async function loadProfileData() {
    try {
        const data = await apiJson('/profile');
        const authoritativeEmail = String((data && data.email) || '').trim().toLowerCase();
        if (authoritativeEmail) {
            localStorage.setItem('userEmail', authoritativeEmail);
            if (currentUser && typeof currentUser === 'object') currentUser.email = authoritativeEmail;
        }
        renderProfileData(data);
        window.__npamBusinessProfileGateActive = profileNeedsBusinessProfile(data);
        syncBusinessProfileGateUi();
        setInlineStatus('profileStatus', '', 'info');
        return data;
    } catch (e) {
        setInlineStatus('profileStatus', e.message || 'Failed to load profile.', 'error');
        throw e;
    }
}
window.loadProfileData = loadProfileData;
window.loadAdminTicketsManagement = loadAdminTicketsManagement;
window.debouncedLoadAdminTicketsManagement = debouncedLoadAdminTicketsManagement;

async function handleProfilePasswordChange(e) {
    e.preventDefault();
    try {
        await apiJson('/profile/break-glass/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                current_password: (document.getElementById('profileCurrentPassword') || {}).value || '',
                new_password: (document.getElementById('profileNewPassword') || {}).value || '',
                confirm_password: (document.getElementById('profileConfirmPassword') || {}).value || '',
                mfa_code: (document.getElementById('profilePasswordMfaCode') || {}).value || ''
            })
        });
        e.target.reset();
        setInlineStatus('profileStatus', 'Password updated successfully.', 'info');
    } catch (err) {
        setInlineStatus('profileStatus', err.message || 'Failed to update password.', 'error');
    }
}

function renderPendingMfaSetup(data) {
    pendingProfileMfaSetup = data || null;
    const panel = document.getElementById('profileMfaSetupPanel');
    const qr = document.getElementById('profileMfaQr');
    const secret = document.getElementById('profileMfaSecret');
    const uri = document.getElementById('profileMfaProvisioningUri');
    if (panel) panel.style.display = data ? 'block' : 'none';
    if (qr) {
        qr.src = (data && data.qr_code_data_uri) || '';
        qr.style.display = (data && data.qr_code_data_uri) ? 'block' : 'none';
    }
    if (secret) secret.textContent = (data && data.totp_secret) || '';
    if (uri) uri.textContent = (data && data.provisioning_uri) || '';
    const verifyPassword = document.getElementById('profileMfaVerifyPassword');
    if (verifyPassword) verifyPassword.value = (document.getElementById('profileMfaCurrentPassword') || {}).value || '';
    const verifyCode = document.getElementById('profileMfaVerifyCode');
    if (verifyCode) verifyCode.value = '';
}

async function startProfileMfaEnrollment(e) {
    e.preventDefault();
    try {
        const data = await apiJson('/profile/break-glass/mfa/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                slot: (document.getElementById('profileMfaSlot') || {}).value || 'primary',
                current_password: (document.getElementById('profileMfaCurrentPassword') || {}).value || '',
                current_mfa_code: (document.getElementById('profileMfaCurrentCode') || {}).value || ''
            })
        });
        renderPendingMfaSetup(data);
        setInlineStatus('profileStatus', 'Authenticator setup generated. Scan the QR code and verify the new device.', 'info');
    } catch (err) {
        setInlineStatus('profileStatus', err.message || 'Failed to start MFA setup.', 'error');
    }
}

async function verifyProfileMfaEnrollment(e) {
    e.preventDefault();
    if (!pendingProfileMfaSetup) {
        setInlineStatus('profileStatus', 'Start MFA setup first.', 'error');
        return;
    }
    try {
        await apiJson('/profile/break-glass/mfa/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                slot: pendingProfileMfaSetup.slot || 'primary',
                current_password: (document.getElementById('profileMfaVerifyPassword') || {}).value || '',
                mfa_code: (document.getElementById('profileMfaVerifyCode') || {}).value || ''
            })
        });
        renderPendingMfaSetup(null);
        const startForm = document.getElementById('profileMfaStartForm');
        if (startForm) startForm.reset();
        setInlineStatus('profileStatus', 'MFA device enrolled successfully.', 'info');
        await loadProfileData();
    } catch (err) {
        setInlineStatus('profileStatus', err.message || 'Failed to verify MFA device.', 'error');
    }
}

async function removeSecondaryMfaDevice() {
    if (!isBreakGlassSession()) {
        setInlineStatus('profileStatus', 'Backup MFA removal is available for break-glass accounts only.', 'error');
        return;
    }
    try {
        await apiJson('/profile/break-glass/mfa/remove-secondary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                current_password: (document.getElementById('profileMfaCurrentPassword') || {}).value || '',
                mfa_code: (document.getElementById('profileMfaCurrentCode') || {}).value || ''
            })
        });
        renderPendingMfaSetup(null);
        setInlineStatus('profileStatus', 'Backup MFA device removed.', 'info');
        await loadProfileData();
    } catch (err) {
        setInlineStatus('profileStatus', err.message || 'Failed to remove backup MFA device.', 'error');
    }
}

window.searchProfileDirectoryUser = searchProfileDirectoryUser;
window.selectProfileDirectoryUser = selectProfileDirectoryUser;
window.openFeedbackModal = openFeedbackModal;
window.showFeedbackHelpTab = showFeedbackHelpTab;
window.loadFeedbackInbox = loadFeedbackInbox;
window.showFeedbackAdminSubTab = showFeedbackAdminSubTab;
window.setFeedbackAdminStatusTab = setFeedbackAdminStatusTab;
window.openFeedbackReplyModal = openFeedbackReplyModal;
window.openFeedbackReplyFromNotification = openFeedbackReplyFromNotification;
window.saveFeedbackAdminReply = saveFeedbackAdminReply;
window.openNotificationsModal = openNotificationsModal;
window.showNotificationsModalTab = showNotificationsModalTab;
window.loadUserNotifications = loadUserNotifications;
window.openAnnouncementModal = openAnnouncementModal;
window.saveAnnouncementForm = saveAnnouncementForm;
window.sendAnnouncementEmailFlow = sendAnnouncementEmailFlow;
window.toggleAnnouncementClosed = toggleAnnouncementClosed;
window.deleteAnnouncement = deleteAnnouncement;
window.loadAdminAnnouncements = loadAdminAnnouncements;
window.refreshFeedbackAdminPanel = refreshFeedbackAdminPanel;
window.loadDbUserInventorySection = loadDbUserInventorySection;
window.refreshDbUserInventoryConnections = refreshDbUserInventoryConnections;
window.selectAllDbUserInventoryConnections = selectAllDbUserInventoryConnections;
window.toggleDbUserInventoryConnectionSelection = toggleDbUserInventoryConnectionSelection;
window.runDbUserInventoryScan = runDbUserInventoryScan;
window.downloadDbUserInventoryCsv = downloadDbUserInventoryCsv;
window.saveDbUserAuditSchedule = saveDbUserAuditSchedule;
window.loadAdminTrends = loadAdminTrends;
window.setAdminTrendsPeriod = setAdminTrendsPeriod;

function showResetPassword() {
    showProfile();
}

function showMFAReset() {
    showProfile();
}

function showManager() {
    alert('Manager resolution will be added from a trusted directory source in a later phase.');
}

function showPasswordReset() {
    showProfile();
}

// Data Loading Functions
window.__npamReadCache = window.__npamReadCache || {};

function getReadCacheEntry(key) {
    const cache = window.__npamReadCache || {};
    if (!cache[key]) cache[key] = { data: null, ts: 0, promise: null };
    return cache[key];
}

function invalidateReadCache(key) {
    const entry = getReadCacheEntry(key);
    entry.data = null;
    entry.ts = 0;
}

async function fetchJsonWithShortCache(key, url, options, ttlMs, force) {
    const entry = getReadCacheEntry(key);
    const now = Date.now();
    if (entry.promise) return entry.promise;
    if (!force && entry.data !== null && (now - entry.ts) < ttlMs) {
        return entry.data;
    }
    entry.promise = fetch(url, options).then(async function(response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        entry.data = data;
        entry.ts = Date.now();
        return data;
    }).finally(function() {
        entry.promise = null;
    });
    return entry.promise;
}

async function loadAccounts(force) {
    try {
        accounts = await fetchJsonWithShortCache(
            'accounts',
            `${API_BASE}/accounts`,
            { credentials: 'include' },
            15000,
            force === true
        );
        console.log('Loaded accounts:', Object.keys(accounts).length);
    } catch (error) {
        console.error('Error loading accounts:', error);
        accounts = {};
    }
}

async function loadPermissionSets(force) {
    try {
        permissionSets = await fetchJsonWithShortCache(
            'permission_sets',
            `${API_BASE}/permission-sets`,
            { credentials: 'include' },
            15000,
            force === true
        );
        console.log('Loaded permission sets:', permissionSets.length);
    } catch (error) {
        console.error('Error loading permission sets:', error);
        permissionSets = [];
    }
}

async function loadRequests(force) {
    const requestsPage = document.getElementById('requestsPage');
    if (requestsPage && requestsPage.classList.contains('active')) {
        const loadingMarkup = '<div class="requests-empty"><i class="fas fa-spinner fa-spin"></i> Loading requests...</div>';
        const requestsGrid = document.getElementById('requestsGrid');
        const storageList = document.getElementById('storageRequestsList');
        const workloadsList = document.getElementById('workloadsRequestsList');
        const approvalsList = document.getElementById('requestsApprovalList');
        if (requestsGrid) requestsGrid.innerHTML = loadingMarkup;
        if (storageList) storageList.innerHTML = loadingMarkup;
        if (workloadsList) workloadsList.innerHTML = loadingMarkup;
        if (approvalsList) approvalsList.innerHTML = loadingMarkup;
    }
    try {
        requests = await fetchJsonWithShortCache(
            'requests',
            `${API_BASE}/requests`,
            { credentials: 'include' },
            8000,
            force === true
        );
        console.log('Loaded requests:', requests.length);
    } catch (error) {
        console.error('Error loading requests:', error);
        requests = [];
    } finally {
        if (requestsPage && requestsPage.classList.contains('active')) {
            if (typeof loadRequestsPage === 'function') loadRequestsPage();
            if (typeof renderRequestsApprovalFlow === 'function') renderRequestsApprovalFlow();
        }
    }
}

async function primeCoreCollections(force) {
    return Promise.allSettled([
        loadAccounts(force === true),
        loadPermissionSets(force === true),
        loadRequests(force === true)
    ]);
}

// Dashboard Functions
function updateDashboard() {
    // Update new KPI cards
    const activeSessions = requests.filter(r => r.status === 'approved' && new Date(r.expires_at) > new Date()).length;
    const pendingApprovals = requests.filter(r => r.status === 'pending').length;
    const highRiskRequests = requests.filter(r => {
        if (typeof calculateAIRiskScore === 'function') {
            return calculateAIRiskScore(r) >= 70;
        }
        return false;
    }).length;
    const policyViolations = 0; // TODO: Calculate from audit logs
    
    const activeSessionsEl = document.getElementById('activeSessionsCount');
    const pendingApprovalsEl = document.getElementById('pendingApprovalsCount');
    const highRiskRequestsEl = document.getElementById('highRiskRequestsCount');
    const policyViolationsEl = document.getElementById('policyViolationsCount');
    
    if (activeSessionsEl) activeSessionsEl.textContent = activeSessions;
    if (pendingApprovalsEl) pendingApprovalsEl.textContent = pendingApprovals;
    if (highRiskRequestsEl) highRiskRequestsEl.textContent = highRiskRequests;
    if (policyViolationsEl) policyViolationsEl.textContent = policyViolations;
    
    // Update old IDs for backward compatibility
    const activeAccessEl = document.getElementById('activeAccessCount');
    const pendingRequestsEl = document.getElementById('pendingRequestsCount');
    const approvedRequestsEl = document.getElementById('approvedRequestsCount');
    
    if (activeAccessEl) activeAccessEl.textContent = activeSessions;
    if (pendingRequestsEl) pendingRequestsEl.textContent = pendingApprovals;
    if (approvedRequestsEl) {
        const approvedThisMonth = requests.filter(r => {
            const requestDate = new Date(r.created_at);
            const now = new Date();
            return r.status === 'approved' && 
                   requestDate.getMonth() === now.getMonth() && 
                   requestDate.getFullYear() === now.getFullYear();
        }).length;
        approvedRequestsEl.textContent = approvedThisMonth;
    }
    
    // Update recent activity (old function)
    updateRecentActivity();
    
    // Update admin metrics (merged from admin dashboard)
    if (typeof updateAdminDashboard === 'function') updateAdminDashboard();
    
    // Update dashboard panels
    if (typeof updateRecentJITRequests === 'function') updateRecentJITRequests();
    if (typeof updateLiveSessions === 'function') updateLiveSessions();
    if (typeof updateAIDecisionsFeed === 'function') updateAIDecisionsFeed();
}

function updateRecentActivity() {
    const recentActivity = document.getElementById('recentActivity');
    if (!recentActivity) return;
    const sortedRequests = requests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
    
    if (sortedRequests.length === 0) {
        recentActivity.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">No recent activity</p>';
        return;
    }
    
    recentActivity.innerHTML = sortedRequests.map(request => {
        const account = accounts[request.account_id];
        const iconClass = request.status === 'approved' ? 'success' : 
                         request.status === 'denied' ? 'danger' : 'warning';
        const icon = request.status === 'approved' ? 'check' : 
                    request.status === 'denied' ? 'times' : 'clock';
        const label = request.type === 'database_access' 
            ? `Database: ${(request.databases && request.databases[0]?.host) || 'DB'}`
            : `${account ? account.name : 'Unknown Account'} - ${request.permission_set || 'access'}`;
        return `
            <div class="activity-item">
                <div class="activity-icon ${iconClass}">
                    <i class="fas fa-${icon}"></i>
                </div>
                <div class="activity-content">
                    <p><strong>Access request ${request.status}</strong></p>
                    <p>${label}</p>
                    <small>${formatDate(request.created_at)}</small>
                </div>
            </div>
        `;
    }).join('');
}

function categoryLabelForHome(category) {
    const labels = {
        databases: 'Database Access',
        cloud: 'Cloud Access',
        workloads: 'Workloads Access',
        storage: 'Storage Access'
    };
    return labels[String(category || '').trim().toLowerCase()] || 'Request History';
}

function canDeleteHomeRecentItem(item) {
    if (!item || String(item.category || '').trim().toLowerCase() !== 'databases') return false;
    const status = String(item.status || '').trim().toLowerCase();
    return status === 'pending';
}

async function deleteHomeRecentRequest(requestId, category) {
    const requestCategory = String(category || '').trim().toLowerCase();
    if (!requestId || requestCategory !== 'databases') return;
    if (typeof deleteDbRequest === 'function') {
        await deleteDbRequest(requestId);
        homeRecentDeleteSelection.delete(String(requestId));
        loadHomeSummary();
    }
}

function getPendingHomeRecentDeleteIds() {
    const recent = Array.isArray((lastHomeSummary || {}).recent) ? lastHomeSummary.recent : [];
    return recent
        .filter(canDeleteHomeRecentItem)
        .map(function(item) { return String(item.request_id || '').trim(); })
        .filter(Boolean);
}

function toggleHomeRecentDeleteSelection(requestId, checked) {
    const rid = String(requestId || '').trim();
    if (!rid) return;
    if (checked) homeRecentDeleteSelection.add(rid);
    else homeRecentDeleteSelection.delete(rid);
    renderHomeSummary(lastHomeSummary || { cards: [], recent: [] });
}

function toggleHomeRecentDeleteSelectAll(checked) {
    const pendingIds = getPendingHomeRecentDeleteIds();
    if (checked) {
        pendingIds.forEach(function(id) { homeRecentDeleteSelection.add(id); });
    } else {
        pendingIds.forEach(function(id) { homeRecentDeleteSelection.delete(id); });
    }
    renderHomeSummary(lastHomeSummary || { cards: [], recent: [] });
}

async function deleteSelectedHomeRecentRequests() {
    const selectedIds = getPendingHomeRecentDeleteIds().filter(function(id) {
        return homeRecentDeleteSelection.has(id);
    });
    if (!selectedIds.length) {
        alert('Select at least one pending request to delete.');
        return;
    }
    if (typeof confirmAppAction === 'function') {
        const confirmed = await confirmAppAction(`Delete ${selectedIds.length} pending request(s)?`, {
            title: 'Delete pending requests',
            confirmLabel: 'Delete',
            variant: 'warning'
        });
        if (!confirmed) return;
    }
    try {
        const response = await fetch(apiUrl('/databases/requests/bulk-delete'), {
            method: 'POST',
            headers: (typeof getDbRequestHeaders === 'function') ? getDbRequestHeaders() : { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ request_ids: selectedIds })
        });
        const data = await response.json().catch(function() { return {}; });
        if (!response.ok || data.error) throw new Error((data && data.error) || 'Failed to delete selected requests.');
        selectedIds.forEach(function(id) { homeRecentDeleteSelection.delete(id); });
        showAppNotification(`Deleted ${selectedIds.length} pending request(s).`, 'success');
        loadHomeSummary();
        if (typeof loadDbRequests === 'function') loadDbRequests();
    } catch (error) {
        alert('Failed: ' + (error.message || 'Unable to delete selected requests.'));
    }
}

window.deleteHomeRecentRequest = deleteHomeRecentRequest;
window.toggleHomeRecentDeleteSelection = toggleHomeRecentDeleteSelection;
window.toggleHomeRecentDeleteSelectAll = toggleHomeRecentDeleteSelectAll;
window.deleteSelectedHomeRecentRequests = deleteSelectedHomeRecentRequests;

function updateHomeFeatureVisibility(flags) {
    const summaryGrid = document.getElementById('homeSummaryGrid');
    if (!summaryGrid) return;
    const featureMap = {
        cloud: 'cloud_access',
        storage: 'storage_access',
        databases: 'databases_access',
        workloads: 'workloads_access'
    };
    summaryGrid.querySelectorAll('[data-home-feature]').forEach(function(card) {
        const key = card.getAttribute('data-home-feature');
        const category = String(card.getAttribute('data-home-category') || '').trim().toLowerCase();
        const resolvedKey = featureMap[category] || key;
        card.style.display = (!flags || flags[resolvedKey] !== false) ? '' : 'none';
    });
}

function renderHomeHero(data) {
    const heroTitle = document.getElementById('homeHeroTitle');
    const heroSubtitle = document.getElementById('homeHeroSubtitle');
    const totalEl = document.getElementById('homeHeroTotalRequests');
    const pendingEl = document.getElementById('homeHeroPendingRequests');
    const approvedEl = document.getElementById('homeHeroApprovedRequests');
    const focusList = document.getElementById('homeFocusList');
    const cards = Array.isArray(data && data.cards) ? data.cards : [];
    const recent = Array.isArray(data && data.recent) ? data.recent : [];
    const totalRequests = cards.reduce(function(sum, card) { return sum + Number((card && card.total) || 0); }, 0);
    const approvedRequests = cards.reduce(function(sum, card) { return sum + Number((card && card.approved) || 0); }, 0);
    const pendingRequests = recent.filter(function(item) {
        return String((item && item.status) || '').trim().toLowerCase() === 'pending';
    }).length;
    const topCard = cards.slice().sort(function(a, b) {
        return Number((b && b.total) || 0) - Number((a && a.total) || 0);
    })[0];
    const latest = recent[0];

    if (heroTitle) {
        heroTitle.textContent = totalRequests ? 'Your privileged activity at a glance' : 'Your PAM workspace is ready';
    }
    if (heroSubtitle) {
        heroSubtitle.textContent = totalRequests
            ? 'Home is now personal to you: recent requests, next actions, and where your access footprint is concentrated.'
            : 'Start a request from the quick actions below and this page will turn into your personal activity view.';
    }
    if (totalEl) totalEl.textContent = String(totalRequests);
    if (pendingEl) pendingEl.textContent = String(pendingRequests);
    if (approvedEl) approvedEl.textContent = String(approvedRequests);
    if (!focusList) return;

    const focusItems = [];
    if (pendingRequests > 0) {
        focusItems.push({
            icon: 'fa-hourglass-half',
            title: pendingRequests + ' request' + (pendingRequests === 1 ? '' : 's') + ' waiting for approval',
            text: 'Open My Requests to track approval progress and follow-up tasks.'
        });
    }
    if (topCard && Number(topCard.total || 0) > 0) {
        focusItems.push({
            icon: 'fa-layer-group',
            title: (topCard.label || categoryLabelForHome(topCard.key)) + ' is your busiest access area',
            text: Number(topCard.total || 0) + ' request(s) in the last 90 days.'
        });
    }
    if (latest) {
        focusItems.push({
            icon: 'fa-clock-rotate-left',
            title: 'Latest activity: ' + categoryLabelForHome(latest.category),
            text: (latest.target || 'Recent request') + ' on ' + formatDateTimeIst(latest.created_at)
        });
    }

    if (!focusItems.length) {
        focusList.innerHTML = '<div class="home-summary-empty">No personal request history yet. Start with a cloud or database request.</div>';
        return;
    }

    focusList.innerHTML = focusItems.map(function(item) {
        return (
            '<div class="home-focus-item">' +
                '<div class="home-focus-icon"><i class="fas ' + escapeHtml(item.icon) + '"></i></div>' +
                '<div><strong>' + escapeHtml(item.title) + '</strong><p>' + escapeHtml(item.text) + '</p></div>' +
            '</div>'
        );
    }).join('');
}

function renderHomeSummary(data) {
    lastHomeSummary = data || { cards: [], recent: [] };
    renderHomeHero(lastHomeSummary);
    const grid = document.getElementById('homeSummaryGrid');
    const recentWrap = document.getElementById('homeRecentActivity');
    if (!grid && !recentWrap) return;

    const flags = (typeof getCurrentFeatures === 'function') ? getCurrentFeatures() : {};
    const featureMap = {
        cloud: 'cloud_access',
        storage: 'storage_access',
        databases: 'databases_access',
        workloads: 'workloads_access'
    };
    const cards = (lastHomeSummary.cards || []).filter(function(card) {
        return card && card.enabled !== false && flags[featureMap[card.key] || card.key] !== false;
    });

    if (grid) {
        if (!cards.length) {
            grid.innerHTML = '<div class="home-summary-empty">No request history blocks are enabled for your home page.</div>';
        } else {
        grid.innerHTML = cards.map(function(card) {
            const total = Number(card.total || 0);
            return (
                '<button type="button" class="home-summary-card" data-home-category="' + escapeHtml(card.key) + '" data-home-feature="' + escapeHtml(featureMap[card.key] || card.key) + '" onclick="openHomeHistory(\'' + escapeHtml(card.key) + '\')">' +
                    '<div class="home-summary-card-top">' +
                        '<div><h3>' + escapeHtml(card.label || categoryLabelForHome(card.key)) + '</h3><p>Last 90 days only</p></div>' +
                        '<span class="home-summary-total">' + total + '</span>' +
                    '</div>' +
                    '<div class="home-summary-metrics">' +
                        '<span class="home-metric approved"><i class="fas fa-check-circle"></i> ' + Number(card.approved || 0) + ' approved</span>' +
                        '<span class="home-metric denied"><i class="fas fa-times-circle"></i> ' + Number(card.denied || 0) + ' denied</span>' +
                    '</div>' +
                    '<div class="home-summary-footer">' +
                        '<span>' + (card.last_request_at ? ('Last request: ' + escapeHtml(formatDateTimeIst(card.last_request_at))) : 'No requests in the last 90 days') + '</span>' +
                        '<span class="home-summary-link">View history <i class="fas fa-arrow-right"></i></span>' +
                    '</div>' +
                '</button>'
            );
        }).join('');
        }
    }

    const recent = Array.isArray(lastHomeSummary.recent) ? lastHomeSummary.recent : [];
    if (!recentWrap) return;
    const recentLimit = 8;
    const showingAllRecent = homeRecentExpanded || recent.length <= recentLimit;
    const visibleRecent = showingAllRecent ? recent : recent.slice(0, recentLimit);
    const pendingDeleteIds = recent.filter(canDeleteHomeRecentItem).map(function(item) {
        return String(item.request_id || '').trim();
    }).filter(Boolean);
    homeRecentDeleteSelection = new Set(
        Array.from(homeRecentDeleteSelection).filter(function(id) { return pendingDeleteIds.includes(id); })
    );
    if (!recent.length) {
        recentWrap.innerHTML = '<p class="text-muted">No recent activity in the last 90 days.</p>';
    } else {
        const selectedCount = pendingDeleteIds.filter(function(id) { return homeRecentDeleteSelection.has(id); }).length;
        const allChecked = !!pendingDeleteIds.length && selectedCount === pendingDeleteIds.length;
        const toolbarHtml = pendingDeleteIds.length ? (
            '<div class="home-recent-bulk-actions">' +
                '<label class="db-bulk-select-label">' +
                    '<input type="checkbox" ' + (allChecked ? 'checked' : '') + ' onchange="toggleHomeRecentDeleteSelectAll(this.checked)">' +
                    '<span>Select all pending</span>' +
                '</label>' +
                '<span class="db-bulk-count">' + selectedCount + ' selected</span>' +
                '<button type="button" class="btn-danger btn-sm" ' + (selectedCount ? '' : 'disabled') + ' onclick="deleteSelectedHomeRecentRequests()">' +
                    '<i class="fas fa-trash"></i> Delete selected' +
                '</button>' +
            '</div>'
        ) : '';
        const toggleHtml = recent.length > recentLimit ? (
            '<div class="home-recent-bulk-actions">' +
                '<span class="db-bulk-count">Showing ' + visibleRecent.length + ' of ' + recent.length + ' recent items</span>' +
                '<button type="button" class="btn-secondary btn-sm" onclick="toggleHomeRecentActivity()">' +
                    (showingAllRecent ? '<i class="fas fa-eye-slash"></i> Hide extra' : '<i class="fas fa-eye"></i> Show all') +
                '</button>' +
            '</div>'
        ) : '';
        recentWrap.innerHTML = toolbarHtml + toggleHtml + visibleRecent.map(function(item) {
            const rawStatus = String(item.status || '').replace(/_/g, ' ');
            const denied = /deny|reject/i.test(rawStatus);
            const canDelete = canDeleteHomeRecentItem(item);
            const requestId = String(item.request_id || '').trim();
            const checked = homeRecentDeleteSelection.has(requestId);
            return (
                '<div class="home-activity-row">' +
                    '<div>' +
                        (canDelete ? '<label class="home-recent-select"><input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="toggleHomeRecentDeleteSelection(\'' + escapeHtml(requestId) + '\', this.checked)"></label>' : '') +
                        '<strong>' + escapeHtml(categoryLabelForHome(item.category)) + '</strong>' +
                        '<div class="home-activity-target">' + escapeHtml(item.target || '-') + '</div>' +
                    '</div>' +
                    '<div class="home-activity-meta">' +
                        '<span class="badge ' + (denied ? 'badge-warning' : 'badge-success') + '">' + escapeHtml(rawStatus || '-') + '</span>' +
                        '<span>' + escapeHtml(formatDateTimeIst(item.created_at)) + '</span>' +
                        (canDelete ? '<button type="button" class="btn-danger btn-sm" onclick="deleteHomeRecentRequest(\'' + escapeHtml(String(item.request_id || '')) + '\', \'' + escapeHtml(String(item.category || '')) + '\')"><i class="fas fa-trash"></i> Delete</button>' : '') +
                    '</div>' +
                '</div>'
            );
        }).join('');
    }
}

function toggleHomeRecentActivity() {
    homeRecentExpanded = !homeRecentExpanded;
    renderHomeSummary(lastHomeSummary || { cards: [], recent: [] });
}
window.toggleHomeRecentActivity = toggleHomeRecentActivity;

async function loadHomeSummary() {
    const grid = document.getElementById('homeSummaryGrid');
    if (grid) grid.innerHTML = '<div class="home-summary-empty">Loading request history…</div>';
    try {
        const data = await apiJson('/home/summary');
        renderHomeSummary(data);
    } catch (err) {
        if (grid) {
            grid.innerHTML = '<div class="home-summary-empty">' + escapeHtml(err.message || 'Failed to load request history.') + '</div>';
        }
    }
}

function openHomeHistory(category) {
    activeHomeHistoryCategory = String(category || 'databases').trim().toLowerCase() || 'databases';
    showPage('homeHistory');
}

function setHomeHistoryPeriod(period) {
    activeHomeHistoryPeriod = String(period || 'month').trim().toLowerCase() || 'month';
    document.querySelectorAll('.home-history-period').forEach(function(btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-period') === activeHomeHistoryPeriod);
    });
    loadHomeHistory();
}

function renderHomeHistoryChart(series) {
    const chart = document.getElementById('homeHistoryChart');
    if (!chart) return;
    const rows = Array.isArray(series) ? series : [];
    if (!rows.length) {
        chart.innerHTML = '<div class="home-summary-empty">No approved or declined requests are available for this period.</div>';
        return;
    }
    const maxValue = rows.reduce(function(max, row) {
        return Math.max(max, Number(row.approved || 0), Number(row.denied || 0));
    }, 0) || 1;
    chart.innerHTML = rows.map(function(row) {
        const approved = Number(row.approved || 0);
        const denied = Number(row.denied || 0);
        return (
            '<div class="home-history-bar-row">' +
                '<div class="home-history-label">' + escapeHtml(row.label || '-') + '</div>' +
                '<div class="home-history-bars">' +
                    '<div class="home-history-bar approved" style="width:' + ((approved / maxValue) * 100).toFixed(2) + '%;"><span>' + approved + '</span></div>' +
                    '<div class="home-history-bar denied" style="width:' + ((denied / maxValue) * 100).toFixed(2) + '%;"><span>' + denied + '</span></div>' +
                '</div>' +
            '</div>'
        );
    }).join('');
}

function renderHomeHistoryTable(items) {
    const body = document.getElementById('homeHistoryTableBody');
    if (!body) return;
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-secondary);">No request history found in the last 90 days.</td></tr>';
        return;
    }
    body.innerHTML = rows.map(function(item) {
        const rawStatus = String(item.status || '').replace(/_/g, ' ');
        const denied = /deny|reject/i.test(rawStatus);
        return (
            '<tr>' +
                '<td>' + escapeHtml(formatDateIst(item.created_at)) + '</td>' +
                '<td><code>' + escapeHtml(item.request_id || '-') + '</code></td>' +
                '<td>' + escapeHtml(item.target || '-') + '</td>' +
                '<td><span class="badge ' + (denied ? 'badge-warning' : 'badge-success') + '">' + escapeHtml(rawStatus || '-') + '</span></td>' +
                '<td>' + escapeHtml(formatDurationHours(item.duration_hours)) + '</td>' +
            '</tr>'
        );
    }).join('');
}

async function loadHomeHistory() {
    const title = document.getElementById('homeHistoryTitle');
    if (title) {
        title.innerHTML = '<i class="fas fa-chart-column"></i> ' + escapeHtml(categoryLabelForHome(activeHomeHistoryCategory));
    }
    try {
        const data = await apiJson('/home/history?category=' + encodeURIComponent(activeHomeHistoryCategory) + '&period=' + encodeURIComponent(activeHomeHistoryPeriod));
        renderHomeHistoryChart(data.series || []);
        renderHomeHistoryTable(data.requests || []);
    } catch (err) {
        const chart = document.getElementById('homeHistoryChart');
        if (chart) {
            chart.innerHTML = '<div class="home-summary-empty">' + escapeHtml(err.message || 'Failed to load request history.') + '</div>';
        }
        renderHomeHistoryTable([]);
    }
}

// Requests Page Functions
let currentFilter = 'all';
let currentRequestsCategory = 'cloud';
let currentRequestsStatus = 'pending';
let currentRequestsFlowMode = 'mine';

function persistRequestsViewState() {
    try {
        localStorage.setItem('npamxRequestsCategory', String(currentRequestsCategory || 'cloud'));
        localStorage.setItem('npamxRequestsStatus', String(currentRequestsStatus || 'pending'));
        localStorage.setItem('npamxRequestsFlowMode', String(currentRequestsFlowMode || 'mine'));
        if (typeof dbStatusFilter !== 'undefined') {
            localStorage.setItem('npamxDbStatusFilter', String(dbStatusFilter || 'pending'));
        }
    } catch (_) {}
}

function restoreRequestsViewState() {
    try {
        const savedCategory = String(localStorage.getItem('npamxRequestsCategory') || '').trim();
        const savedStatus = String(localStorage.getItem('npamxRequestsStatus') || '').trim();
        const savedFlowMode = String(localStorage.getItem('npamxRequestsFlowMode') || '').trim();
        const savedDbStatus = String(localStorage.getItem('npamxDbStatusFilter') || '').trim();
        if (savedCategory) currentRequestsCategory = savedCategory;
        if (savedStatus) currentRequestsStatus = savedStatus;
        if (savedFlowMode === 'mine' || savedFlowMode === 'approvals') currentRequestsFlowMode = savedFlowMode;
        if (savedDbStatus && typeof dbStatusFilter !== 'undefined') dbStatusFilter = savedDbStatus;
    } catch (_) {}
}

function getRequestsFlowMode() {
    return currentRequestsFlowMode === 'approvals' ? 'approvals' : 'mine';
}

function currentActorEmail() {
    return String((currentUser && currentUser.email) || localStorage.getItem('userEmail') || '').trim().toLowerCase();
}

function isOwnRequestRecord(request) {
    const actorEmail = currentActorEmail();
    const requesterEmail = String((request && request.user_email) || '').trim().toLowerCase();
    if (!actorEmail || !requesterEmail) return false;
    return actorEmail === requesterEmail || request?.is_requester === true;
}

function getActionableApprovalRequests() {
    return (Array.isArray(requests) ? requests : []).filter(function(request) {
        if (!request || String(request.status || '').trim().toLowerCase() !== 'pending') return false;
        if (isOwnRequestRecord(request)) return false;
        return request.can_approve === true || request.can_deny === true;
    });
}

function renderRequestsApprovalFlow() {
    const list = document.getElementById('requestsApprovalList');
    const summary = document.getElementById('requestsApprovalSummary');
    if (!list) return;
    const actionable = getActionableApprovalRequests();
    if (summary) {
        if (actionable.length) {
            summary.hidden = false;
            summary.textContent = actionable.length === 1
                ? '1 request is currently waiting for your approval.'
                : (String(actionable.length) + ' requests are currently waiting for your approval.');
        } else {
            summary.hidden = true;
            summary.textContent = '';
        }
    }
    if (!actionable.length) {
        list.innerHTML = '<div class="requests-empty">No requests are waiting for your approval.</div>';
        return;
    }
    list.innerHTML = actionable.map(function(request) {
        if (request.type === 'database_access') {
            const requestId = String(request.request_id || request.id || '').trim();
            const requestIdJs = requestId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const requester = String(request.user_email || 'Unknown user').trim();
            const accountName = String(request.account_name || request.account_id || 'Database').trim();
            const instanceName = String(request.requested_instance_input || request.db_instance_id || 'RDS instance').trim();
            const databaseName = String(request.requested_database_name || '').trim();
            const schemaName = String(request.requested_schema_name || '').trim();
            const requestedAt = request.requested_at || request.created_at;
            return (
                '<div class="approval-inbox-card">' +
                    '<div class="approval-inbox-meta">' +
                        '<span class="badge badge-warning">Database</span>' +
                        '<span class="badge badge-manager">Pending</span>' +
                    '</div>' +
                    '<h4>' + escapeHtml(instanceName || 'Database request') + '</h4>' +
                    '<div class="approval-inbox-copy">' +
                        '<p><strong>Requester:</strong> ' + escapeHtml(requester) + '</p>' +
                        '<p><strong>Account:</strong> ' + escapeHtml(accountName) + '</p>' +
                        (databaseName ? '<p><strong>Database:</strong> ' + escapeHtml(databaseName) + '</p>' : '') +
                        (schemaName ? '<p><strong>Schema:</strong> ' + escapeHtml(schemaName) + '</p>' : '') +
                        '<p><strong>Requested:</strong> ' + escapeHtml(requestedAt ? formatDateTimeIst(requestedAt) : '—') + '</p>' +
                    '</div>' +
                    '<div class="approval-inbox-actions">' +
                        '<button type="button" class="btn-secondary btn-sm" onclick="viewDbRequestDetails(\'' + requestIdJs + '\')"><i class="fas fa-circle-info"></i> View</button>' +
                        '<button type="button" class="btn-primary btn-sm" onclick="approveDbRequest(\'' + requestIdJs + '\')"><i class="fas fa-check"></i> Approve</button>' +
                        '<button type="button" class="btn-danger btn-sm" onclick="denyDbRequest(\'' + requestIdJs + '\')"><i class="fas fa-times"></i> Reject</button>' +
                    '</div>' +
                '</div>'
            );
        }
        const requestForApproval = Object.assign({}, request, { __approval_inbox: true });
        const account = accounts[request.account_id];
        if (typeof createJITRequestCard === 'function') {
            return createJITRequestCard(requestForApproval, account);
        }
        return (
            '<div class="approval-inbox-card">' +
                '<div class="approval-inbox-meta">' +
                    '<span class="badge badge-warning">Access</span>' +
                    '<span class="badge badge-manager">Pending</span>' +
                '</div>' +
                '<h4>' + escapeHtml(request.permission_set || 'Requested access') + '</h4>' +
                '<div class="approval-inbox-copy">' +
                    '<p><strong>Requester:</strong> ' + escapeHtml(request.user_email || 'Unknown user') + '</p>' +
                    '<p><strong>Target:</strong> ' + escapeHtml(account ? account.name : (request.account_id || '—')) + '</p>' +
                    '<p><strong>Duration:</strong> ' + escapeHtml(request.duration_hours || 8) + 'h</p>' +
                '</div>' +
            '</div>'
        );
    }).join('');
}

function setRequestsFlowMode(mode) {
    const normalized = mode === 'approvals' ? 'approvals' : 'mine';
    currentRequestsFlowMode = normalized;
    persistRequestsViewState();
    const ownFlow = document.getElementById('requestsOwnFlow');
    const approvalsFlow = document.getElementById('requestsApprovalFlow');
    const mineTab = document.getElementById('requestsMineTab');
    const approvalsTab = document.getElementById('requestsApprovalsTab');
    if (ownFlow) ownFlow.style.display = normalized === 'mine' ? 'block' : 'none';
    if (approvalsFlow) approvalsFlow.style.display = normalized === 'approvals' ? 'block' : 'none';
    if (mineTab) mineTab.classList.toggle('active', normalized === 'mine');
    if (approvalsTab) approvalsTab.classList.toggle('active', normalized === 'approvals');
    if (normalized === 'mine') {
        loadRequestsPage();
    } else {
        renderRequestsApprovalFlow();
    }
}

window.getRequestsFlowMode = getRequestsFlowMode;
window.setRequestsFlowMode = setRequestsFlowMode;

function filterRequestsByCategory(category, status) {
    if (typeof isFeatureEnabled === 'function') {
        const cloudEnabled = isFeatureEnabled('cloud_access') && (isFeatureEnabled('aws_access') || isFeatureEnabled('gcp_access'));
        const storageEnabled = isFeatureEnabled('storage_access') && (isFeatureEnabled('s3_access') || isFeatureEnabled('gcs_access'));
        const workloadsEnabled = isFeatureEnabled('workloads_access') && (isFeatureEnabled('instances_access') || isFeatureEnabled('gcp_vms_access'));
        const dbEnabled = isFeatureEnabled('databases_access');
        const categoryEnabled = {
            cloud: cloudEnabled,
            storage: storageEnabled,
            databases: dbEnabled,
            workloads: workloadsEnabled
        };
        if (categoryEnabled[category] === false) return;
    }
    currentRequestsCategory = category;
    currentRequestsStatus = status;
    persistRequestsViewState();

    // Update button glow - remove from all, add to active
    document.querySelectorAll('.requests-status-btn').forEach(btn => {
        btn.classList.remove('requests-status-glow');
        if (btn.dataset.category === category && btn.dataset.status === status) {
            btn.classList.add('requests-status-glow');
        }
    });

    if (category === 'cloud') {
        // Map to legacy filter: pending, in_progress->approved, completed->approved, denied
        currentFilter = status === 'pending' ? 'pending' : status === 'denied' ? 'denied' : 'approved';
        loadRequestsPage();
    } else if (category === 'databases' && typeof filterDbRequests === 'function') {
        filterDbRequests(status);
    } else if (category === 'storage') {
        loadStorageRequests();
    } else if (category === 'workloads') {
        loadWorkloadsRequests();
    }
}

function loadStorageRequests() {
    const list = document.getElementById('storageRequestsList');
    if (!list) return;
    list.innerHTML = '<div class="requests-empty">No storage requests</div>';
}

function loadWorkloadsRequests() {
    const list = document.getElementById('workloadsRequestsList');
    if (!list) return;
    list.innerHTML = '<div class="requests-empty">No workload requests</div>';
}

function filterRequests(filter) {
    currentFilter = filter;
    if (event && event.target) {
        event.target.classList.add('active');
    }
    loadRequestsPage();
}

function loadRequestsPage() {
    const grid = document.getElementById('requestsGrid');
    if (!grid) return;
    if (getRequestsFlowMode() !== 'mine') {
        grid.innerHTML = '<div class="empty-state"><p class="text-muted">Switch to My Requests to view your request history.</p></div>';
        return;
    }
    
    // Cloud Access: exclude database_access (those show under Databases)
    // Cloud Access only: exclude database_access (they show under Databases section)
    let filteredRequests = requests.filter(r => r.type !== 'database_access' && isOwnRequestRecord(r));
    if (currentFilter !== 'all') {
        filteredRequests = filteredRequests.filter(r => r.status === currentFilter);
    }
    
    if (filteredRequests.length === 0) {
        grid.innerHTML = '<div class="empty-state"><p class="text-muted">No requests found</p></div>';
    } else {
        // Use security-grade JIT request card helper if available
        if (typeof createJITRequestCard === 'function') {
            grid.innerHTML = filteredRequests.map(request => {
                const account = accounts[request.account_id];
                return createJITRequestCard(request, account);
            }).join('');
        } else {
            // Fallback to basic cards if helper not available (escape user data for XSS safety)
            grid.innerHTML = filteredRequests.map(request => {
                const account = accounts[request.account_id];
                const statusClass = `status-${escapeHtml(request.status)}`;
                return `
                    <div class="jit-request-card">
                        <div class="jit-request-header">
                            <div class="jit-user-info">
                                <div class="jit-user-email">${escapeHtml(request.user_email || 'Unknown User')}</div>
                                <span class="status-badge ${statusClass}">${escapeHtml(request.status)}</span>
                            </div>
                        </div>
                        
                        <div class="jit-request-details">
                            <div class="jit-detail-item">
                                <div class="jit-detail-label">Requested Role</div>
                                <div class="jit-detail-value">${escapeHtml(request.ai_generated ? 'AI Generated' : request.permission_set || 'Custom')}</div>
                            </div>
                            <div class="jit-detail-item">
                                <div class="jit-detail-label">Target</div>
                                <div class="jit-detail-value">${escapeHtml(account ? account.name : request.account_id)}</div>
                            </div>
                            <div class="jit-detail-item">
                                <div class="jit-detail-label">Duration</div>
                                <div class="jit-detail-value">${escapeHtml(request.duration_hours || 8)}h</div>
                            </div>
                        </div>
                        
                        <div class="jit-request-actions" style="margin-top: 10px; border-top: 1px solid var(--border-subtle); padding-top: 10px;">
                            <button class="btn-secondary" onclick="viewRequest('${escapeHtml(request.id)}')" style="width: 100%;">
                                <i class="fas fa-eye"></i> View Details
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // Load database requests into My Requests page
    if (typeof loadDbRequests === 'function') {
        loadDbRequests();
    }
    // Load storage and workloads (placeholders for now)
    loadStorageRequests();
    loadWorkloadsRequests();
}

async function viewRequest(requestId) {
    try {
        const response = await fetch(`${API_BASE}/request/${requestId}`);
        const request = await response.json();
        
        let details = `Request Details:\n\nID: ${request.id}\nStatus: ${request.status.toUpperCase()}\nAccount: ${accounts[request.account_id]?.name || 'Unknown'}\nDuration: ${request.duration_hours} hours\nJustification: ${request.justification}\n\n`;
        
        if (request.ai_generated && request.ai_permissions) {
            // Show the actual policy that will be created
            const policy = {
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Action": request.ai_permissions.actions,
                    "Resource": request.ai_permissions.resources
                }]
            };
            
            // Add conditions if present (for tag-based access)
            if (request.ai_permissions.conditions) {
                policy.Statement[0].Condition = request.ai_permissions.conditions;
            }
            
            details += `AWS IAM Policy (This gets created in AWS):\n${JSON.stringify(policy, null, 2)}\n\n`;
            
            if (request.service_configs) {
                details += `Service Configurations:\n${JSON.stringify(request.service_configs, null, 2)}\n`;
            }
        } else {
            details += `Permission Set: ${request.permission_set}\n`;
        }
        
        if (request.permission_set_name) {
            details += `\nCreated Permission Set: ${request.permission_set_name}`;
        }
        
        // Show in console for full view
        console.log('=== FULL REQUEST DETAILS ===');
        console.log('Request:', request);
        if (request.ai_generated && request.ai_permissions) {
            const policy = {
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Action": request.ai_permissions.actions,
                    "Resource": request.ai_permissions.resources
                }]
            };
            if (request.ai_permissions.conditions) {
                policy.Statement[0].Condition = request.ai_permissions.conditions;
            }
            console.log('=== EXACT AWS POLICY ===');
            console.log(JSON.stringify(policy, null, 2));
        }
        console.log('=== END DETAILS ===');
        
        const policy = request.ai_permissions ? JSON.stringify({
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Action": request.ai_permissions.actions,
                "Resource": request.ai_permissions.resources,
                ...(request.ai_permissions.conditions && {"Condition": request.ai_permissions.conditions})
            }]
        }, null, 2) : 'No policy data';
        
        const modalHtml = `<div class="policy-modal-overlay" onclick="this.remove()" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;"><div class="policy-modal-content" onclick="event.stopPropagation()" style="background: var(--bg-primary); color: var(--text-primary); padding: 2rem; border-radius: 8px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: var(--shadow);"><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;"><h3 style="color: var(--text-primary); margin: 0;">AWS IAM Policy</h3><button onclick="this.closest('.policy-modal-overlay').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary); padding: 4px;">&times;</button></div><pre style="background: var(--bg-secondary); color: var(--text-primary); padding: 1rem; overflow-x: auto; font-size: 12px; border-radius: 4px; border: 1px solid var(--border-color);">${policy}</pre><div style="margin-top: 1rem; text-align: right;"><button onclick="this.closest('.policy-modal-overlay').remove()" style="padding: 8px 16px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button></div></div></div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (error) {
        console.error('Error viewing request:', error);
        alert('Error loading request details');
    }
}

function modifyRequest(requestId) {
    const additionalPermissions = prompt('Enter additional permissions (comma-separated):\n\nExample: s3:PutObject, lambda:InvokeFunction');
    
    if (!additionalPermissions) return;
    
    const permissions = additionalPermissions.split(',').map(p => p.trim());
    
    fetch(`${API_BASE}/request/${requestId}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additional_permissions: permissions })
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            alert('Error: ' + result.error);
        } else {
            alert('✅ Request modified successfully! Approvals have been reset.');
            loadRequests();
            updateDashboard();
        }
    })
    .catch(error => {
        console.error('Error modifying request:', error);
        alert('Error modifying request');
    });
}

function approveRequest(requestId) {
    if (!confirm('Are you sure you want to approve this request?')) return;
    
    fetch(`${API_BASE}/approve/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approver_role: 'self' })
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            alert('Error: ' + result.error);
        } else {
            alert(result.message != null ? `✅ ${result.message}` : '✅ Approved');
            loadRequests();
            if (typeof loadRequestsPage === 'function') loadRequestsPage();
            if (typeof loadDbRequests === 'function') loadDbRequests();
            updateDashboard();
        }
    })
    .catch(error => {
        console.error('Error approving request:', error);
        alert('Error approving request');
    });
}

function revokeAccess(requestId) {
    const reason = prompt('⚠️ ADMIN REVOKE\n\nEnter reason for revoking access (required):');
    
    if (!reason) {
        alert('Revocation reason is required');
        return;
    }
    
    if (!confirm(`❌ Are you sure you want to REVOKE access?\n\nThis will immediately remove AWS permissions and delete the permission set.\n\nReason: ${reason}`)) {
        return;
    }
    
    fetch(`${API_BASE}/request/${requestId}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason })
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            alert('❌ Revocation Error: ' + result.error);
        } else {
            alert(`❌ ${result.message}`);
            loadRequests();
            updateDashboard();
            if (typeof loadAdminDatabaseSessions === 'function') loadAdminDatabaseSessions();
            if (typeof loadDbRequests === 'function') loadDbRequests();
        }
    })
    .catch(error => {
        console.error('Error revoking access:', error);
        alert('❌ Error revoking access');
    });
}

function deleteRequest(requestId) {
    if (!confirm('⚠️ ADMIN DELETE\n\nAre you sure you want to DELETE this request?\n\nThis action cannot be undone and will permanently remove the request from the system.')) {
        return;
    }
    
    fetch(`${API_BASE}/request/${requestId}/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            alert('❌ Delete Error: ' + result.error);
        } else {
            alert(`✅ ${result.message}`);
            loadRequests();
            updateDashboard();
        }
    })
    .catch(error => {
        console.error('Error deleting request:', error);
        alert('❌ Error deleting request');
    });
}

function toggleCloudProvider(provider) {
    const providerMap = {
        'aws': 'awsAccounts',
        'gcp': 'gcpProjects',
        'azure': 'azureSubscriptions',
        'oracle': 'oracleCompartments'
    };
    
    const elementId = providerMap[provider];
    const element = document.getElementById(elementId);
    const button = element.previousElementSibling;
    
    if (element.style.display === 'none') {
        element.style.display = 'block';
        button.classList.add('active');
        
        if (provider === 'aws') {
            loadAwsAccounts();
        }
    } else {
        element.style.display = 'none';
        button.classList.remove('active');
    }
}

function _escapeHtmlText(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _groupAccountsByOrgTree(accountsList) {
    const tree = new Map();
    (accountsList || []).forEach((account) => {
        const orgId = String(account.organization_id || '').trim();
        const orgName = String(account.organization_display_name || '').trim() || (orgId ? `Organization ${orgId}` : 'Organization');
        const orgKey = orgId || orgName || 'org';
        if (!tree.has(orgKey)) {
            tree.set(orgKey, {
                id: orgId,
                name: orgName,
                roots: new Map()
            });
        }
        const orgNode = tree.get(orgKey);

        const rootId = String(account.root_id || '').trim();
        const rootName = String(account.root_name || '').trim() || (rootId ? 'Root' : 'Root');
        const rootKey = rootId || rootName || 'root';
        if (!orgNode.roots.has(rootKey)) {
            orgNode.roots.set(rootKey, {
                id: rootId,
                name: rootName,
                ous: new Map()
            });
        }
        const rootNode = orgNode.roots.get(rootKey);

        const ouId = String(account.ou_id || '').trim();
        const ouName = String(account.ou_name || '').trim() || 'No OU';
        const ouKey = ouId || ouName || 'ou';
        if (!rootNode.ous.has(ouKey)) {
            rootNode.ous.set(ouKey, {
                id: ouId,
                name: ouName,
                accounts: []
            });
        }
        rootNode.ous.get(ouKey).accounts.push(account);
    });
    return tree;
}

function loadAwsAccounts() {
    const grid = document.getElementById('awsAccountsGrid');
    if (!grid) return;

    const accountList = Object.values(accounts || {});
    if (accountList.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">No accounts found</p>';
        return;
    }

    const tree = _groupAccountsByOrgTree(accountList);
    const orgBlocks = Array.from(tree.values()).map((orgNode) => {
        const rootBlocks = Array.from(orgNode.roots.values()).map((rootNode) => {
            const ouBlocks = Array.from(rootNode.ous.values()).map((ouNode) => {
                const rows = (ouNode.accounts || [])
                    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
                    .map((account) => {
                        const env = String(account.environment || 'nonprod').toLowerCase();
                        const envClass = env === 'prod' ? 'prod' : 'nonprod';
                        return `
                            <tr>
                                <td><strong>${_escapeHtmlText(account.name || account.id || 'Account')}</strong></td>
                                <td><code>${_escapeHtmlText(account.id || '')}</code></td>
                                <td><span class="account-type ${envClass}">${_escapeHtmlText(env)}</span></td>
                                <td>${_escapeHtmlText(account.email || '—')}</td>
                            </tr>
                        `;
                    }).join('');
                return `
                    <details class="org-tree-level org-tree-ou" open>
                        <summary>
                            <span class="org-tree-label"><i class="fas fa-sitemap"></i> OU: ${_escapeHtmlText(ouNode.name || 'No OU')}</span>
                            <span class="org-tree-meta">${(ouNode.accounts || []).length} account(s)</span>
                        </summary>
                        <div class="org-tree-table-wrap">
                            <table class="org-tree-accounts-table">
                                <thead>
                                    <tr>
                                        <th>Account Name</th>
                                        <th>Account ID</th>
                                        <th>Environment</th>
                                        <th>Email</th>
                                    </tr>
                                </thead>
                                <tbody>${rows}</tbody>
                            </table>
                        </div>
                    </details>
                `;
            }).join('');
            return `
                <details class="org-tree-level org-tree-root" open>
                    <summary>
                        <span class="org-tree-label"><i class="fas fa-folder-tree"></i> Root: ${_escapeHtmlText(rootNode.name || 'Root')}</span>
                        <span class="org-tree-meta">${Array.from(rootNode.ous.values()).reduce((n, ou) => n + ((ou.accounts || []).length), 0)} account(s)</span>
                    </summary>
                    <div class="org-tree-children">${ouBlocks}</div>
                </details>
            `;
        }).join('');

        return `
            <details class="org-tree-level org-tree-org" open>
                <summary>
                    <span class="org-tree-label"><i class="fas fa-building"></i> ${_escapeHtmlText(orgNode.name || 'Organization')}</span>
                    <span class="org-tree-meta">${Array.from(orgNode.roots.values()).reduce((n, root) => n + Array.from(root.ous.values()).reduce((m, ou) => m + ((ou.accounts || []).length), 0), 0)} account(s)</span>
                </summary>
                <div class="org-tree-children">${rootBlocks}</div>
            </details>
        `;
    }).join('');

    grid.innerHTML = `
        <div class="accounts-tree">
            ${orgBlocks}
        </div>
    `;
}

// Accounts Page Functions
function loadAccountsPage() {
    const awsAccounts = document.getElementById('awsAccounts');
    if (awsAccounts) awsAccounts.style.display = 'block';
    const awsToggle = document.querySelector(".cloud-provider-btn[onclick*=\"toggleCloudProvider('aws')\"]");
    if (awsToggle) awsToggle.classList.add('active');
    loadAwsAccounts();
}

function requestAccessForAccount(accountId) {
    // Pre-select the account in the modal
    loadRequestModalData();
    document.getElementById('requestAccount').value = accountId;
    showModal('newRequestModal');
}

// Request Modal Functions
function loadRequestModalData() {
    // Load accounts
    const accountSelect = document.getElementById('requestAccount');
    accountSelect.innerHTML = '<option value="">Select Account</option>' +
        Object.values(accounts).map(account => 
            `<option value="${account.id}">${account.name} (${account.id})</option>`
        ).join('');
    
    // Load permission sets
    const permissionSetSelect = document.getElementById('requestPermissionSet');
    permissionSetSelect.innerHTML = '<option value="">Select Permission Set</option>' +
        permissionSets.map(ps => 
            `<option value="${ps.arn}">${ps.name}</option>`
        ).join('');
    
    // Setup duration change handler
    const durationSelect = document.getElementById('requestDuration');
    if (durationSelect) {
        durationSelect.onchange = function() {
            if (this.value === 'custom') {
                showDateModal();
            }
        };
    }
    
    // Setup AWS services change handler
    const servicesSelect = document.getElementById('awsServices');
    if (servicesSelect) {
        servicesSelect.addEventListener('change', function() {
            updateServiceConfigs();
        });
    }
    
    // Set default date/time values
    const now = new Date();
    const startTime = new Date(now.getTime() + 5 * 60000); // 5 minutes from now
    const endTime = new Date(startTime.getTime() + 8 * 60 * 60 * 1000); // 8 hours later
    
    document.getElementById('startDateTime').value = formatDateTimeLocal(startTime);
    document.getElementById('endDateTime').value = formatDateTimeLocal(endTime);
}

let startCalendar, endCalendar;

function showDateModal() {
    const modal = document.getElementById('dateRangeModal');
    if (modal) {
        modal.style.display = 'block';
        
        if (!startCalendar) {
            const startInput = document.getElementById('startDateTime');
            const endInput = document.getElementById('endDateTime');
            if (startInput && endInput) {
                startCalendar = new CalendarPopup(startInput);
                endCalendar = new CalendarPopup(endInput);
            }
        }
    }
}

function closeDateModal() {
    const modal = document.getElementById('dateRangeModal');
    if (modal) {
        modal.style.display = 'none';
    }
    document.getElementById('requestDuration').value = '8';
}

function formatDateTimeLocal(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return '';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function applyCustomDates() {
    const startValue = document.getElementById('startDateTime').value;
    const endValue = document.getElementById('endDateTime').value;
    
    if (!startValue || !endValue) {
        alert('Please select both start and end dates');
        return;
    }
    
    // Parse calendar format: YYYY-MM-DD HH:mm AM/PM
    const parseDateTime = (str) => {
        const parts = str.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) (AM|PM)/);
        if (!parts) return null;
        
        let hours = parseInt(parts[4]);
        const minutes = parseInt(parts[5]);
        const ampm = parts[6];
        
        if (ampm === 'PM' && hours !== 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        
        return new Date(parts[1], parts[2] - 1, parts[3], hours, minutes);
    };
    
    const startDate = parseDateTime(startValue);
    const endDate = parseDateTime(endValue);
    
    if (!startDate || !endDate) {
        alert('Invalid date format');
        return;
    }
    
    const now = new Date();
    
    if (endDate <= startDate) {
        alert('End date must be after start date');
        return;
    }
    
    const durationMs = endDate.getTime() - startDate.getTime();
    const durationHours = Math.round(durationMs / (1000 * 60 * 60));
    const maxHours = 5 * 24;
    
    if (durationHours > maxHours) {
        alert(`Maximum duration is 5 days (120 hours). Selected duration: ${durationHours} hours`);
        return;
    }
    
    const durationSelect = document.getElementById('requestDuration');
    const customOption = durationSelect.querySelector('option[value="custom"]');
    customOption.textContent = `Custom (${durationHours}h)`;
    
    window.customDuration = {
        hours: durationHours,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
    };
    
    alert(`✅ Custom dates set: ${durationHours} hours\nFrom: ${startDate.toLocaleString()}\nTo: ${endDate.toLocaleString()}`);
    
    closeDateModal();
}



function updateServiceConfigs() {
    const servicesSelect = document.getElementById('awsServices');
    const configsContainer = document.getElementById('serviceConfigs');
    
    if (!servicesSelect || !configsContainer) return;
    
    const selectedServices = Array.from(servicesSelect.selectedOptions).map(option => option.value);
    
    // Clear existing configs
    configsContainer.innerHTML = '';
    
    // Service configuration templates
    const serviceConfigs = {
        ec2: {
            title: 'EC2 Configuration',
            icon: 'EC2',
            fields: [
                { id: 'ec2Tags', label: 'Instance Tags', placeholder: 'Environment=prod,Team=backend', required: true, help: 'Comma-separated key=value pairs' },
                { id: 'ec2Actions', label: 'Actions', placeholder: 'describe,start,stop', required: false, help: 'Specific EC2 actions (optional)' }
            ]
        },
        s3: {
            title: 'S3 Configuration',
            icon: 'S3',
            fields: [
                { id: 's3Bucket', label: 'Bucket Name', placeholder: 'my-app-bucket', required: true, help: 'Exact S3 bucket name' },
                { id: 's3Prefix', label: 'Object Prefix', placeholder: 'logs/', required: false, help: 'Limit access to specific path (optional)' }
            ]
        },
        secretsmanager: {
            title: 'Secrets Manager Configuration',
            icon: 'SM',
            fields: [
                { id: 'secretName', label: 'Secret Name', placeholder: 'MyApp-Database-Password', required: true, help: 'Exact secret name (required for security)' }
            ]
        },
        lambda: {
            title: 'Lambda Configuration',
            icon: 'λ',
            fields: [
                { id: 'lambdaFunction', label: 'Function Name', placeholder: 'my-function-name', required: true, help: 'Exact Lambda function name' },
                { id: 'lambdaActions', label: 'Actions', placeholder: 'invoke,get', required: false, help: 'Specific Lambda actions (optional)' }
            ]
        },
        rds: {
            title: 'RDS Configuration',
            icon: 'RDS',
            fields: [
                { id: 'rdsInstance', label: 'DB Instance ID', placeholder: 'my-database', required: false, help: 'Specific RDS instance (optional)' }
            ]
        },
        cloudwatch: {
            title: 'CloudWatch Configuration',
            icon: 'CW',
            fields: [
                { id: 'logGroup', label: 'Log Group', placeholder: '/aws/lambda/my-function', required: false, help: 'Specific log group (optional)' }
            ]
        }
    };
    
    // Generate config sections for selected services
    selectedServices.forEach(service => {
        const config = serviceConfigs[service];
        if (!config) return;
        
        const configDiv = document.createElement('div');
        configDiv.className = 'service-config';
        configDiv.innerHTML = `
            <h4>
                <span class="service-icon">${config.icon}</span>
                ${config.title}
            </h4>
            ${config.fields.map(field => `
                <div class="form-group">
                    <label>${field.label} ${field.required ? '<span class="required">*</span>' : ''}</label>
                    <input type="text" id="${field.id}" placeholder="${field.placeholder}" ${field.required ? 'required' : ''}>
                    <small>${field.help}</small>
                </div>
            `).join('')}
        `;
        
        configsContainer.appendChild(configDiv);
    });
    
    // Show/hide the configs container
    configsContainer.style.display = selectedServices.length > 0 ? 'block' : 'none';
}



function detectAnomalousActivity(userEmail, requestData) {
    const anomalies = [];
    
    // Check for unusual time
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
        anomalies.push('Request made outside business hours');
    }
    
    // Check for high-risk permissions
    if (requestData.ai_permissions && requestData.ai_permissions.actions) {
        const sensitiveActions = requestData.ai_permissions.actions.filter(action => 
            action.includes('Admin') || action.includes('Full') || action.includes('*')
        );
        if (sensitiveActions.length > 0) {
            anomalies.push('High-risk permissions requested');
        }
    }
    
    // Check for unusual account access
    const accountName = accounts[requestData.account_id]?.name || '';
    if (accountName.toLowerCase().includes('prod')) {
        anomalies.push('Production account access requested');
    }
    
    // Check for multiple requests in short time
    const recentRequests = requests.filter(r => 
        r.user_email === userEmail && 
        new Date(r.created_at) > new Date(Date.now() - 30 * 60 * 1000)
    );
    if (recentRequests.length > 2) {
        anomalies.push('Multiple requests in 30 minutes');
    }
    
    if (anomalies.length > 0) {
        notifyAdminOfAnomaly(userEmail, anomalies, requestData);
    }
}

function notifyAdminOfAnomaly(userEmail, anomalies, requestData) {
    const alertData = {
        timestamp: new Date().toISOString(),
        user: userEmail,
        anomalies: anomalies,
        request_details: {
            account: accounts[requestData.account_id]?.name,
            justification: requestData.justification,
            ip_address: 'Unknown' // Would be captured from request
        },
        risk_level: anomalies.length > 2 ? 'HIGH' : 'MEDIUM'
    };
    
    // Send to admin (in production, this would be real notification)
    console.warn('🚨 SECURITY ALERT:', alertData);
    
    // Store in audit log
    fetch(`${API_BASE}/security/anomaly`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData)
    }).catch(err => console.error('Failed to log anomaly:', err));
}

function calculateRiskScore(permissions, useCase) {
    let risk = 0;
    const highRiskActions = ['Delete', 'Create', 'Admin', 'Terminate', '*'];
    risk += permissions.actions.filter(action => 
        highRiskActions.some(risky => action.includes(risky))
    ).length * 2;
    
    const hour = new Date().getHours();
    if (hour < 9 || hour > 17) risk += 1;
    if (useCase.length < 20) risk += 1;
    if (permissions.actions.length > 10) risk += 1;
    
    return Math.min(risk, 10);
}

async function generateAIPermissions() {
    const useCase = document.getElementById('aiUseCase').value;
    if (!useCase) {
        alert('Please describe what you need to do');
        return;
    }
    
    // Clear previous messages
    const existingMsg = document.getElementById('intentMessage');
    if (existingMsg) existingMsg.remove();
    
    // Backend will handle all validation - just send the request
    
    const button = event.target;
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    button.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/generate-permissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ use_case: useCase })
        });
        
        const permissions = await response.json();
        
        if (permissions.error) {
            // Show inline message instead of alert
            if (permissions.intent_analysis) {
                showIntentMessage(permissions.intent_analysis, permissions.suggestion);
            } else if (permissions.suggestion === 'use_existing_permission_sets') {
                const useExisting = confirm(permissions.error + '\n\nWould you like to switch to existing permission sets tab?');
                if (useExisting) {
                    switchAccessType('existing');
                }
            } else {
                alert('Error: ' + permissions.error);
            }
            return;
        }
        
        // AI Risk Assessment and Anomaly Detection
        const riskScore = calculateRiskScore(permissions, useCase);
        if (riskScore > 7) {
            alert(`⚠️ AI Risk Assessment: HIGH RISK (${riskScore}/10)\n\nThis request requires manual review and approval.`);
            // Trigger anomaly detection
            detectAnomalousActivity(localStorage.getItem('userEmail'), {
                ai_permissions: permissions,
                account_id: document.getElementById('requestAccount').value,
                justification: useCase
            });
        } else if (riskScore > 4) {
            alert(`⚠️ AI Risk Assessment: MEDIUM RISK (${riskScore}/10)\n\nPlease ensure your justification is detailed.`);
        }
        
        // Check for restricted permissions
        const restrictedActions = permissions.actions.filter(action => 
            action.includes('Delete') || 
            action.includes('Create') || 
            action.includes('Admin') ||
            action.includes('RunInstances') ||
            action.includes('TerminateInstances')
        );
        
        if (restrictedActions.length > 0) {
            alert(`⚠️ Restricted permissions detected:\n\n${restrictedActions.join('\n')}\n\nYou are not authorized for these permissions. Please ask for read/list and limited write permissions only.\n\nFor resource creation/deletion, please connect with DevOps team with proper JIRA ticket and approvals.`);
            return;
        }
        
        // Auto-select services based on detected permissions
        const servicesSelect = document.getElementById('awsServices');
        if (servicesSelect && permissions.actions) {
            const autoServices = [];
            
            if (permissions.actions.some(action => action.includes('ec2:') || action.includes('ssm:'))) {
                autoServices.push('ec2');
            }
            if (permissions.actions.some(action => action.includes('s3:'))) {
                autoServices.push('s3');
            }
            if (permissions.actions.some(action => action.includes('lambda:'))) {
                autoServices.push('lambda');
            }
            if (permissions.actions.some(action => action.includes('rds:'))) {
                autoServices.push('rds');
            }
            if (permissions.actions.some(action => action.includes('logs:'))) {
                autoServices.push('cloudwatch');
            }
            if (permissions.actions.some(action => action.includes('secretsmanager:'))) {
                autoServices.push('secretsmanager');
            }
            
            if (autoServices.length > 0) {
                Array.from(servicesSelect.options).forEach(option => {
                    option.selected = autoServices.includes(option.value);
                });
                updateServiceConfigs();
                
                setTimeout(() => {
                    alert(`💡 Detected services: ${autoServices.join(', ')}\n\nPlease configure the services below with specific resource details.`);
                }, 500);
            }
        }
        
        // Display permissions
        const preview = document.getElementById('aiPermissionsPreview');
        const content = document.getElementById('aiPermissionsContent');
        
        content.innerHTML = `
            <p><strong>Description:</strong> ${permissions.description}</p>
            <p><strong>Actions:</strong></p>
            <ul>
                ${permissions.actions.map(action => `<li class="permission-item">${action}</li>`).join('')}
            </ul>
            <p><strong>Resources:</strong> ${JSON.stringify(permissions.resources)}</p>
        `;
        
        preview.style.display = 'block';
        
        // Store permissions for form submission
        window.currentAIPermissions = permissions;
        
        // Log AI usage for security monitoring
        fetch(`${API_BASE}/security/ai-usage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_email: localStorage.getItem('userEmail'),
                use_case: useCase,
                generated_actions: permissions.actions,
                timestamp: new Date().toISOString(),
                risk_score: riskScore
            })
        }).catch(err => console.error('Failed to log AI usage:', err));
        
    } catch (error) {
        console.error('Error generating permissions:', error);
        alert('Error generating permissions. Please try again.');
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

async function handleNewRequest(e) {
    e.preventDefault();
    console.log('Form submitted');
    
    // Check if user is logged in
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
        alert('Please login first');
        return;
    }
    
    const durationValue = document.getElementById('requestDuration').value;
    let durationHours;
    let customDates = null;
    
    if (durationValue === 'custom' && window.customDuration) {
        durationHours = window.customDuration.hours;
        customDates = {
            start: window.customDuration.startDate,
            end: window.customDuration.endDate
        };
    } else {
        durationHours = parseInt(durationValue);
    }
    
    const formData = {
        user_email: userEmail,
        account_id: document.getElementById('requestAccount').value,
        duration_hours: durationHours,
        justification: document.getElementById('requestJustification').value
    };
    
    if (customDates) {
        formData.custom_start_date = customDates.start;
        formData.custom_end_date = customDates.end;
    }
    
    console.log('Form data:', formData);
    
    // Validate required fields
    if (!formData.account_id) {
        alert('Please select an account');
        return;
    }
    
    if (!formData.justification) {
        alert('Please provide business justification');
        return;
    }
    
    // Check if AI permissions were generated
    if (window.currentAIPermissions) {
        formData.use_case = `Access to ${selectedService} resources: ${selectedResources.map(r => r.id).join(', ')}`;
        
        formData.aws_services = [selectedService];
        formData.service_configs = {};
        
        if (false) {
            // Auto-select services based on AI permissions if none selected
            if (window.currentAIPermissions && window.currentAIPermissions.actions) {
                const actions = window.currentAIPermissions.actions;
                const autoServices = [];
                
                if (actions.some(a => a.includes('ec2:') || a.includes('ssm:'))) autoServices.push('ec2');
                if (actions.some(a => a.includes('s3:'))) autoServices.push('s3');
                if (actions.some(a => a.includes('lambda:'))) autoServices.push('lambda');
                if (actions.some(a => a.includes('rds:'))) autoServices.push('rds');
                if (actions.some(a => a.includes('logs:'))) autoServices.push('cloudwatch');
                if (actions.some(a => a.includes('secretsmanager:'))) autoServices.push('secretsmanager');
                
                if (autoServices.length > 0) {
                    formData.aws_services = autoServices;
                    formData.service_configs = {};
                } else {
                    alert('Please select at least one AWS service');
                    return;
                }
            } else {
                alert('Please select at least one AWS service');
                return;
            }
        } else {
            formData.aws_services = selectedServices;
        }
        
        // Collect service configurations
        if (selectedServices.length > 0) {
            const serviceConfigs = {};
            let hasRequiredFields = true;
            
            selectedServices.forEach(service => {
                const configs = {};
                
                // Service-specific validation and collection
                if (service === 'ec2') {
                    const tags = document.getElementById('ec2Tags')?.value;
                    configs.tags = tags || '';
                    configs.actions = document.getElementById('ec2Actions')?.value || 'describe';
                }
                
                if (service === 's3') {
                    const bucket = document.getElementById('s3Bucket')?.value;
                    configs.bucket = bucket || '';
                    configs.prefix = document.getElementById('s3Prefix')?.value || '';
                }
                
                if (service === 'secretsmanager') {
                    const secretName = document.getElementById('secretName')?.value;
                    if (!secretName) {
                        alert('Secret name is required for Secrets Manager access');
                        hasRequiredFields = false;
                        return;
                    }
                    configs.secret_name = secretName;
                }
                
                if (service === 'lambda') {
                    const functionName = document.getElementById('lambdaFunction')?.value;
                    if (!functionName) {
                        alert('Lambda function name is required');
                        hasRequiredFields = false;
                        return;
                    }
                    configs.function_name = functionName;
                    configs.actions = document.getElementById('lambdaActions')?.value || 'invoke';
                }
                
                if (service === 'rds') {
                    configs.instance_id = document.getElementById('rdsInstance')?.value || '';
                }
                
                if (service === 'cloudwatch') {
                    configs.log_group = document.getElementById('logGroup')?.value || '';
                }
                
                serviceConfigs[service] = configs;
            });
            
            if (!hasRequiredFields) {
                return;
            }
            
            formData.aws_services = selectedServices;
            formData.service_configs = serviceConfigs;
        }
        
    } else {
        alert('Please complete the wizard: Select service → Select resources → Add tags → Generate permissions');
        return;
    }
    
    console.log('Final form data:', formData);
    
    try {
        const headers = { 'Content-Type': 'application/json' };
        const csrfToken = getCsrfToken();
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
        const response = await fetch(`${API_BASE}/request-access`, {
            method: 'POST',
            headers: headers,
            credentials: 'include',
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.error) {
            alert('Error: ' + result.error);
            return;
        }
        
        alert(`✅ Request submitted successfully!\n\nRequest ID: ${result.request_id}\n\nYour request is now pending approval.`);
        
        cancelNewRequest();
        
        // Refresh data
        await loadRequests();
        updateDashboard();
        
    } catch (error) {
        console.error('Error submitting request:', error);
        alert('Error submitting request. Please try again.');
    }
}

// Debug Functions
async function testConnection() {
    try {
        console.log('Testing connection to backend...');
        const response = await fetch(`${API_BASE}/accounts`);
        const data = await response.json();
        console.log('Backend response:', data);
        alert(`✅ Backend connection successful!\n\nFound ${Object.keys(data).length} accounts`);
    } catch (error) {
        console.error('Backend connection failed:', error);
        alert(`❌ Backend connection failed:\n\n${error.message}`);
    }
}

// Admin Functions - default to Users tab (87a181a behavior); Dashboard still supported if present
function loadAdminPage() {
    var adminPage = document.getElementById('adminPage');
    if (adminPage) {
        adminPage.classList.add('active');
        adminPage.style.setProperty('display', 'block', 'important');
        adminPage.style.setProperty('visibility', 'visible', 'important');
    }
    var preferredTab = ['users', 'identityCenter', 'policies', 'security', 'integrations', 'databaseSessions', 'feedback']
        .find(function(tabId) { return hasPamCapability(adminTabCapability(tabId)); }) || 'users';
    showAdminTab(preferredTab);
    if (preferredTab === 'users' && typeof loadUsersManagement === 'function') loadUsersManagement();
}


function loadUsersManagement() {
    if (typeof window.__adminUsersManagementImpl === 'function') {
        return window.__adminUsersManagementImpl();
    }
    if (typeof loadPamAdmins === 'function') {
        return loadPamAdmins();
    }
    return loadUsersTable();
}

function loadAuditLogs() {
    const fromEl = document.getElementById('auditDateFrom');
    const toEl = document.getElementById('auditDateTo');
    const today = new Date();
    const prior = new Date(today.getTime());
    prior.setDate(prior.getDate() - 29);
    const formatDateInput = function(value) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    };
    if (fromEl && !String(fromEl.value || '').trim()) fromEl.value = formatDateInput(prior);
    if (toEl && !String(toEl.value || '').trim()) toEl.value = formatDateInput(today);
    loadAuditLogsTable();
}

let __adminTicketsManagementTimer = null;

function setAdminTicketsManagementStatus(message, type) {
    setInlineStatus('ticketsManagementStatus', message, type || 'info');
}

function renderAdminTicketsManagementRows(rows) {
    const tbody = document.getElementById('ticketsManagementTableBody');
    if (!tbody) return;
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-muted">No tickets matched the current filter.</td></tr>';
        return;
    }
    tbody.innerHTML = items.map(function(ticket) {
        const requestedAt = ticket.requested_at ? formatDate(ticket.requested_at) : '—';
        const requester = String(ticket.raised_by_email || '').trim() || '—';
        const beneficiary = String(ticket.beneficiary_email || '').trim() || requester;
        const status = String(ticket.status || 'unknown').trim();
        const target = [ticket.account_id, ticket.resource_target].filter(Boolean).join(' / ') || '—';
        const approver = String(ticket.approved_by || ticket.declined_by || ticket.approver_emails || '—').trim() || '—';
        const decisionMeta = [];
        if (ticket.decline_reason) decisionMeta.push('Reason: ' + String(ticket.decline_reason || '').trim());
        if (ticket.deleted_at) decisionMeta.push('Deleted: ' + String(ticket.deleted_at || '').trim());
        return ''
            + '<tr>'
            + '<td>' + escapeHtml(requestedAt) + '</td>'
            + '<td>' + escapeHtml(String(ticket.category || '').toUpperCase() || '—') + '</td>'
            + '<td>' + escapeHtml(requester) + '</td>'
            + '<td>' + escapeHtml(beneficiary) + '</td>'
            + '<td title="' + escapeHtml(String(ticket.request_reason || '').trim()) + '"><strong>' + escapeHtml(target) + '</strong><div class="db-user-identity-note">' + escapeHtml(String(ticket.request_id || '').trim()) + '</div></td>'
            + '<td>' + escapeHtml(String(ticket.requested_actions || '—').trim() || '—') + '</td>'
            + '<td><span class="status-badge ' + (/denied|rejected/.test(status.toLowerCase()) ? 'status-denied' : 'status-approved') + '">' + escapeHtml(status) + '</span></td>'
            + '<td title="' + escapeHtml(decisionMeta.join(' | ')) + '">' + escapeHtml(approver) + '</td>'
            + '</tr>';
    }).join('');
}

function debouncedLoadAdminTicketsManagement() {
    window.clearTimeout(__adminTicketsManagementTimer);
    __adminTicketsManagementTimer = window.setTimeout(function() {
        loadAdminTicketsManagement();
    }, 250);
}

async function loadAdminTicketsManagement() {
    const tbody = document.getElementById('ticketsManagementTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="text-muted">Loading tickets...</td></tr>';
    const params = new URLSearchParams();
    const q = String((document.getElementById('ticketsManagementSearchInput') || {}).value || '').trim();
    const status = String((document.getElementById('ticketsManagementStatusFilter') || {}).value || '').trim();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    params.set('limit', '50');
    try {
        const data = await apiJson('/admin/tickets?' + params.toString());
        const rows = Array.isArray(data.tickets) ? data.tickets : [];
        renderAdminTicketsManagementRows(rows);
        setAdminTicketsManagementStatus(
            rows.length ? ('Loaded ' + rows.length + ' ticket(s).') : 'No tickets matched the current filter.',
            'info'
        );
    } catch (err) {
        renderAdminTicketsManagementRows([]);
        setAdminTicketsManagementStatus(err.message || 'Failed to load tickets management view.', 'error');
    }
}

function updateAdminDashboard() {
    if (typeof loadAdminTrends === 'function') {
        loadAdminTrends(false);
    }
}

function setAdminTrendsStatus(message, type) {
    setInlineStatus('adminTrendsStatus', message, type || 'info');
}

function setAdminTrendsPeriod(period) {
    adminTrendsPeriod = String(period || 'day_30').trim() || 'day_30';
    document.querySelectorAll('.admin-trends-period').forEach(function(btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-period') === adminTrendsPeriod);
    });
    renderAdminTrendsBoard(adminTrendsData);
}

function ensureAdminTrendsChartsLibrary(callback) {
    if (typeof Chart !== 'undefined') {
        callback();
        return;
    }
    if (window.__npamChartLoaderPending) return;
    window.__npamChartLoaderPending = true;
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    s.onload = function() {
        window.__npamChartLoaderPending = false;
        callback();
    };
    s.onerror = function() {
        window.__npamChartLoaderPending = false;
        setAdminTrendsStatus('Failed to load chart library for the admin trends board.', 'error');
    };
    document.head.appendChild(s);
}

function renderAdminTrendsWindowTable(data) {
    const tbody = document.getElementById('adminTrendsWindowTableBody');
    if (!tbody) return;
    const windows = data && typeof data === 'object' ? data.windows : null;
    if (!windows) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-muted">No trend data available yet.</td></tr>';
        return;
    }
    const order = ['today', 'last_7_days', 'this_week', 'last_30_days', 'last_12_weeks', 'last_12_months'];
    tbody.innerHTML = order.map(function(key) {
        const item = windows[key] || {};
        const counts = item.counts || {};
        return ''
            + '<tr>'
            + '<td><strong>' + escapeHtml(String(item.label || key)) + '</strong></td>'
            + '<td>' + escapeHtml(String(counts.total || 0)) + '</td>'
            + '<td>' + escapeHtml(String(counts.databases || 0)) + '</td>'
            + '<td>' + escapeHtml(String(counts.cloud || 0)) + '</td>'
            + '<td>' + escapeHtml(String(counts.workloads || 0)) + '</td>'
            + '<td>' + escapeHtml(String(counts.storage || 0)) + '</td>'
            + '</tr>';
    }).join('');
}

function renderAdminTrendsSummary(data) {
    const generated = document.getElementById('adminTrendsGeneratedAt');
    if (generated) {
        generated.textContent = data && data.generated_at ? ('Updated ' + formatDateTimeIst(data.generated_at)) : 'No data';
    }
    const windows = data && typeof data === 'object' ? data.windows : null;
    const current = windows && windows.last_30_days ? windows.last_30_days.counts : { total: 0, databases: 0, cloud: 0, workloads: 0, storage: 0 };
    const totalEl = document.getElementById('adminTrendTotalRequests');
    const dbEl = document.getElementById('adminTrendDatabaseRequests');
    const cloudEl = document.getElementById('adminTrendCloudRequests');
    const workloadsEl = document.getElementById('adminTrendWorkloadRequests');
    const storageEl = document.getElementById('adminTrendStorageRequests');
    const pendingEl = document.getElementById('adminTrendPendingRequests');
    if (totalEl) totalEl.textContent = String(current.total || 0);
    if (dbEl) dbEl.textContent = String(current.databases || 0);
    if (cloudEl) cloudEl.textContent = String(current.cloud || 0);
    if (workloadsEl) workloadsEl.textContent = String(current.workloads || 0);
    if (storageEl) storageEl.textContent = String(current.storage || 0);
    if (pendingEl) pendingEl.textContent = String(((data || {}).extras || {}).pending_approvals || 0);
    const pendingApprovalsEl = document.getElementById('pendingApprovalsCount');
    if (pendingApprovalsEl) pendingApprovalsEl.textContent = String(((data || {}).extras || {}).pending_approvals || 0);
    const repeatedUsersEl = document.getElementById('repeatedUsersCount');
    if (repeatedUsersEl) {
        const totalRepeated = Array.isArray(((data || {}).repeated_users || {}).by_category)
            ? ((data || {}).repeated_users || {}).by_category.reduce(function(sum, item) { return sum + Number(item.users || 0); }, 0)
            : 0;
        repeatedUsersEl.textContent = String(totalRepeated);
    }
    const newUsersEl = document.getElementById('newUsersCount');
    if (newUsersEl) newUsersEl.textContent = String(((data || {}).extras || {}).total_unique_requesters || 0);
    const exceptionalUsersEl = document.getElementById('exceptionalUsersCount');
    if (exceptionalUsersEl) exceptionalUsersEl.textContent = String(((data || {}).status_mix || {}).denied || 0);
}

function renderAdminTopRequesters(data) {
    const tbody = document.getElementById('adminTopRequestersTableBody');
    if (!tbody) return;
    const rows = Array.isArray(((data || {}).repeated_users || {}).top_requesters) ? ((data || {}).repeated_users || {}).top_requesters : [];
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-muted">No repeat requester trends found yet.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(function(item) {
        return ''
            + '<tr>'
            + '<td>' + escapeHtml(String(item.email || '—')) + '</td>'
            + '<td>' + escapeHtml(String(item.total_requests || 0)) + '</td>'
            + '<td>' + escapeHtml(String(item.databases || 0)) + '</td>'
            + '<td>' + escapeHtml(String(item.cloud || 0)) + '</td>'
            + '<td>' + escapeHtml(String(item.workloads || 0)) + '</td>'
            + '<td>' + escapeHtml(String(item.storage || 0)) + '</td>'
            + '</tr>';
    }).join('');
}

function renderAdminEnvironmentBreakdown(data) {
    const tbody = document.getElementById('adminEnvBreakdownTableBody');
    if (!tbody) return;
    const rows = data && typeof data.environment_breakdown === 'object' ? Object.values(data.environment_breakdown) : [];
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-muted">No environment split data available.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(function(item) {
        return ''
            + '<tr>'
            + '<td><strong>' + escapeHtml(String(item.label || 'Requests')) + '</strong></td>'
            + '<td>' + escapeHtml(String(item.prod_requests || 0)) + '</td>'
            + '<td>' + escapeHtml(String(item.nonprod_requests || 0)) + '</td>'
            + '<td>' + escapeHtml(String(item.prod_users || 0)) + '</td>'
            + '<td>' + escapeHtml(String(item.nonprod_users || 0)) + '</td>'
            + '</tr>';
    }).join('');
}

function destroyAdminTrendsCharts() {
    ['adminRequestVolumeChartInstance', 'adminRepeatedUsersChartInstance', 'adminDbRepeatedUsersChartInstance', 'adminEnvSplitChartInstance'].forEach(function(key) {
        if (window[key]) {
            window[key].destroy();
            window[key] = null;
        }
    });
}

function renderAdminTrendsCharts(data) {
    const series = data && data.series ? data.series[adminTrendsPeriod] : null;
    ensureAdminTrendsChartsLibrary(function() {
        destroyAdminTrendsCharts();
        const volumeCanvas = document.getElementById('adminRequestVolumeChart');
        const repeatedCanvas = document.getElementById('adminRepeatedUsersChart');
        const dbRepeatedCanvas = document.getElementById('adminDbRepeatedUsersChart');
        const envCanvas = document.getElementById('adminEnvSplitChart');
        if (volumeCanvas && Array.isArray(series)) {
            window.adminRequestVolumeChartInstance = new Chart(volumeCanvas, {
                type: 'line',
                data: {
                    labels: series.map(function(item) { return item.label; }),
                    datasets: [
                        { label: 'Total', data: series.map(function(item) { return Number(item.total || 0); }), borderColor: '#0f172a', backgroundColor: 'rgba(15, 23, 42, 0.08)', tension: 0.3, fill: true },
                        { label: 'Databases', data: series.map(function(item) { return Number(item.databases || 0); }), borderColor: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.08)', tension: 0.3 },
                        { label: 'Cloud', data: series.map(function(item) { return Number(item.cloud || 0); }), borderColor: '#7c3aed', backgroundColor: 'rgba(124, 58, 237, 0.08)', tension: 0.3 },
                        { label: 'Workloads', data: series.map(function(item) { return Number(item.workloads || 0); }), borderColor: '#ea580c', backgroundColor: 'rgba(234, 88, 12, 0.08)', tension: 0.3 },
                        { label: 'Storage', data: series.map(function(item) { return Number(item.storage || 0); }), borderColor: '#059669', backgroundColor: 'rgba(5, 150, 105, 0.08)', tension: 0.3 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom' } },
                    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
                }
            });
        }
        if (repeatedCanvas) {
            const repeated = Array.isArray(((data || {}).repeated_users || {}).by_category) ? ((data || {}).repeated_users || {}).by_category : [];
            window.adminRepeatedUsersChartInstance = new Chart(repeatedCanvas, {
                type: 'bar',
                data: {
                    labels: repeated.map(function(item) { return item.label; }),
                    datasets: [{
                        label: 'Repeated users',
                        data: repeated.map(function(item) { return Number(item.users || 0); }),
                        backgroundColor: ['#2563eb', '#7c3aed', '#ea580c', '#059669']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
                }
            });
        }
        if (dbRepeatedCanvas) {
            const repeatedDb = Array.isArray(((data || {}).repeated_users || {}).database_by_engine) ? ((data || {}).repeated_users || {}).database_by_engine : [];
            window.adminDbRepeatedUsersChartInstance = new Chart(dbRepeatedCanvas, {
                type: 'bar',
                data: {
                    labels: repeatedDb.map(function(item) { return item.label; }),
                    datasets: [{
                        label: 'Repeated DB users',
                        data: repeatedDb.map(function(item) { return Number(item.users || 0); }),
                        backgroundColor: ['#2563eb', '#be185d', '#64748b']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
                }
            });
        }
        if (envCanvas) {
            const envRows = data && typeof data.environment_breakdown === 'object' ? Object.values(data.environment_breakdown) : [];
            window.adminEnvSplitChartInstance = new Chart(envCanvas, {
                type: 'bar',
                data: {
                    labels: envRows.map(function(item) { return item.label; }),
                    datasets: [
                        { label: 'Prod', data: envRows.map(function(item) { return Number(item.prod_requests || 0); }), backgroundColor: '#dc2626' },
                        { label: 'Nonprod', data: envRows.map(function(item) { return Number(item.nonprod_requests || 0); }), backgroundColor: '#2563eb' }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom' } },
                    scales: { x: { stacked: false }, y: { beginAtZero: true, ticks: { precision: 0 } } }
                }
            });
        }
    });
}

function renderAdminTrendsBoard(data) {
    renderAdminTrendsWindowTable(data);
    renderAdminTrendsSummary(data || {});
    renderAdminTopRequesters(data || {});
    renderAdminEnvironmentBreakdown(data || {});
    if (data) renderAdminTrendsCharts(data);
}

async function loadAdminTrends(force) {
    const board = document.getElementById('adminTrendsBoard');
    if (!board) return;
    try {
        setAdminTrendsStatus('Loading admin request trends...', 'info');
        const data = await fetchJsonWithShortCache(
            'admin_analytics',
            `${API_BASE}/admin/analytics`,
            { credentials: 'include' },
            15000,
            force === true
        );
        adminTrendsData = data || null;
        renderAdminTrendsBoard(adminTrendsData);
        setAdminTrendsStatus('Admin trends board updated.', 'success');
    } catch (err) {
        setAdminTrendsStatus(err.message || 'Failed to load admin request trends.', 'error');
    }
}

function loadUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    const users = [];
    if (users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding: 32px; color: var(--text-secondary, #666);">
                    No local sample users. Sync your identity provider to populate this table.
                </td>
            </tr>`;
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${escapeHtml(user.email)}</td>
            <td>${escapeHtml(user.source)}</td>
            <td><span class="status-badge status-approved">${escapeHtml(user.status)}</span></td>
            <td>${user.mfa ? '✅ Enabled' : '❌ Disabled'}</td>
            <td>${escapeHtml(user.lastLogin)}</td>
            <td>${escapeHtml(user.requestCount)}</td>
            <td>
                <button class="btn-secondary" data-edit-email="${escapeHtml(user.email)}" type="button">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>
    `).join('');
    tbody.querySelectorAll('[data-edit-email]').forEach(btn => {
        btn.addEventListener('click', function() { editUser(this.getAttribute('data-edit-email') || ''); });
    });
}

function loadAuditLogsTable() {
    const tbody = document.getElementById('auditLogsTableBody');
    if (!tbody) return;
    tbody.innerHTML = `
        <tr>
            <td colspan="6" style="text-align:center; padding: 32px; color: var(--text-secondary, #666);">
                Loading audit logs...
            </td>
        </tr>`;
    apiJson('/admin/audit-logs').then(function(auditLogs) {
        const rows = Array.isArray(auditLogs) ? auditLogs : [];
        const eventFilter = String(document.getElementById('auditFilter')?.value || 'all').trim().toLowerCase();
        const fromDate = String(document.getElementById('auditDateFrom')?.value || '').trim();
        const toDate = String(document.getElementById('auditDateTo')?.value || '').trim();
        const filtered = rows.filter(function(log) {
            const eventText = String(log.event || '').toLowerCase();
            if (eventFilter !== 'all' && !eventText.includes(eventFilter)) return false;
            const ts = String(log.timestamp || '').slice(0, 10);
            if (fromDate && ts && ts < fromDate) return false;
            if (toDate && ts && ts > toDate) return false;
            return true;
        });
        if (!filtered.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding: 32px; color: var(--text-secondary, #666);">
                        No audit logs match the current filter.
                    </td>
                </tr>`;
            return;
        }
        tbody.innerHTML = filtered.map(function(log) {
            const statusClass = String(log.status || '').toLowerCase() === 'denied' ? 'status-denied' : 'status-approved';
            const resourceText = [log.resource, log.details].filter(Boolean).join(' — ');
            return `
                <tr>
                    <td>${escapeHtml(log.timestamp || '')}</td>
                    <td>${escapeHtml(log.user || '')}</td>
                    <td>${escapeHtml(log.event || '')}</td>
                    <td title="${escapeHtml(log.details || '')}">${escapeHtml(resourceText || '')}</td>
                    <td>${escapeHtml(log.ip || '')}</td>
                    <td><span class="status-badge ${statusClass}">${escapeHtml(log.status || '')}</span></td>
                </tr>
            `;
        }).join('');
    }).catch(function(err) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center; padding: 32px; color: #b91c1c;">
                    ${escapeHtml(err.message || 'Failed to load audit logs.')}
                </td>
            </tr>`;
    });
}

function clearTicketsFilters() {
    const category = document.getElementById('ticketsCategoryFilter');
    const status = document.getElementById('ticketsStatusFilter');
    const days = document.getElementById('ticketsDaysFilter');
    const from = document.getElementById('ticketsDateFrom');
    const to = document.getElementById('ticketsDateTo');
    const q = document.getElementById('ticketsSearchInput');
    if (category) category.value = 'all';
    if (status) status.value = 'all';
    if (days) days.value = '30';
    if (from) from.value = '';
    if (to) to.value = '';
    if (q) q.value = '';
    ticketsSelection = new Set();
    loadTicketsPage();
}

function debouncedLoadTicketsPage() {
    window.clearTimeout(ticketsLoadTimer);
    ticketsLoadTimer = window.setTimeout(function() {
        loadTicketsPage();
    }, 250);
}

function ticketsFilterParams() {
    const params = new URLSearchParams();
    const category = String(document.getElementById('ticketsCategoryFilter')?.value || 'all').trim();
    const status = String(document.getElementById('ticketsStatusFilter')?.value || 'all').trim();
    const days = String(document.getElementById('ticketsDaysFilter')?.value || '').trim();
    const dateFrom = String(document.getElementById('ticketsDateFrom')?.value || '').trim();
    const dateTo = String(document.getElementById('ticketsDateTo')?.value || '').trim();
    const q = String(document.getElementById('ticketsSearchInput')?.value || '').trim();
    if (category) params.set('category', category);
    if (status) params.set('status', status);
    if (days) params.set('days', days);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (q) params.set('q', q);
    params.set('page', '1');
    params.set('page_size', '250');
    return params;
}

function toggleAllTicketsSelection(checked) {
    const rows = document.querySelectorAll('.ticket-row-checkbox');
    ticketsSelection = new Set();
    rows.forEach(function(input) {
        input.checked = !!checked;
        if (checked && input.value) ticketsSelection.add(String(input.value));
    });
}

function toggleTicketSelection(requestId, checked) {
    const rid = String(requestId || '').trim();
    if (!rid) return;
    if (checked) ticketsSelection.add(rid);
    else ticketsSelection.delete(rid);
    const all = document.getElementById('ticketsSelectAll');
    const boxes = Array.from(document.querySelectorAll('.ticket-row-checkbox'));
    if (all) {
        all.checked = boxes.length > 0 && boxes.every(function(box) { return box.checked; });
    }
}

function renderTicketsSummary(meta) {
    const el = document.getElementById('ticketsSummary');
    if (!el) return;
    const total = Number(meta?.total || 0);
    const selected = ticketsSelection.size;
    const canDelete = meta?.can_delete === true;
    el.hidden = false;
    el.innerHTML = '<strong>Total tickets:</strong> ' + escapeHtml(String(total)) +
        ' &nbsp; <strong>Selected:</strong> ' + escapeHtml(String(selected)) +
        ' &nbsp; <strong>Delete permission:</strong> ' + escapeHtml(canDelete ? 'Break-glass enabled' : 'Read/export only');
    const deleteBtn = document.getElementById('deleteTicketsBtn');
    if (deleteBtn) deleteBtn.style.display = canDelete ? 'inline-flex' : 'none';
}

function loadTicketsPage() {
    const tbody = document.getElementById('ticketsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:32px; color: var(--text-secondary, #666);">Loading tickets...</td></tr>';
    const params = ticketsFilterParams();
    apiJson('/tickets?' + params.toString()).then(function(data) {
        const tickets = Array.isArray(data.tickets) ? data.tickets : [];
        const allowedIds = new Set(tickets.map(function(ticket) { return String(ticket.request_id || '').trim(); }).filter(Boolean));
        ticketsSelection = new Set(Array.from(ticketsSelection).filter(function(id) { return allowedIds.has(id); }));
        renderTicketsSummary(data);
        const pager = document.getElementById('ticketsPagerMeta');
        if (pager) pager.textContent = tickets.length ? ('Showing ' + tickets.length + ' of ' + Number(data.total || tickets.length) + ' ticket(s)') : 'No tickets found';
        const selectAll = document.getElementById('ticketsSelectAll');
        if (selectAll) selectAll.checked = tickets.length > 0 && tickets.every(function(ticket) { return ticketsSelection.has(String(ticket.request_id || '').trim()); });
        if (!tickets.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:32px; color: var(--text-secondary, #666);">No tickets match the current filter.</td></tr>';
            return;
        }
        tbody.innerHTML = tickets.map(function(ticket) {
            const rid = String(ticket.request_id || '').trim();
            const checked = ticketsSelection.has(rid) ? 'checked' : '';
            const decision = String(ticket.approved_by || ticket.declined_by || ticket.approver_emails || '—').trim() || '—';
            const requestedAtText = ticket.requested_at ? formatDate(ticket.requested_at) : '—';
            const decisionDetails = [];
            if (ticket.decline_reason) decisionDetails.push('Reason: ' + String(ticket.decline_reason || '').trim());
            if (ticket.deleted_at) decisionDetails.push('Deleted: ' + String(ticket.deleted_at || '').trim());
            const statusClass = /denied|rejected/.test(String(ticket.status || '').toLowerCase()) ? 'status-denied' : 'status-approved';
            return '' +
                '<tr>' +
                    '<td><input class="ticket-row-checkbox" type="checkbox" value="' + escapeHtml(rid) + '" ' + checked + ' onchange="toggleTicketSelection(\'' + escapeHtml(rid) + '\', this.checked)"></td>' +
                    '<td>' + escapeHtml(requestedAtText) + '</td>' +
                    '<td>' + escapeHtml(String(ticket.category || '').toUpperCase()) + '</td>' +
                    '<td><div>' + escapeHtml(ticket.raised_by_email || ticket.beneficiary_email || '') + '</div><small>' + escapeHtml(ticket.beneficiary_email || '') + '</small></td>' +
                    '<td title="' + escapeHtml(decisionDetails.join(' | ')) + '">' + escapeHtml(decision) + '</td>' +
                    '<td><div>' + escapeHtml(ticket.account_id || '') + '</div><small>' + escapeHtml(ticket.resource_target || '') + '</small></td>' +
                    '<td title="' + escapeHtml(ticket.request_reason || '') + '">' + escapeHtml(ticket.requested_actions || '—') + '</td>' +
                    '<td><span class="status-badge ' + statusClass + '">' + escapeHtml(ticket.status || '') + '</span></td>' +
                '</tr>';
        }).join('');
    }).catch(function(err) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:32px; color: #b91c1c;">' + escapeHtml(err.message || 'Failed to load tickets.') + '</td></tr>';
    });
}

function exportTicketsCsv(selectedOnly) {
    const params = ticketsFilterParams();
    if (selectedOnly) {
        const ids = Array.from(ticketsSelection);
        if (!ids.length) {
            alert('Select at least one ticket to export.');
            return;
        }
        params.set('request_ids', ids.join(','));
    }
    fetch(apiUrl('/tickets/export?' + params.toString()), { credentials: 'include' })
        .then(function(res) {
            if (!res.ok) {
                return res.json().catch(function() { return {}; }).then(function(data) {
                    throw new Error((data && data.error) || 'Failed to export tickets.');
                });
            }
            const disposition = String(res.headers.get('content-disposition') || '');
            const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
            const filename = match && match[1] ? match[1] : 'npamx_tickets.csv';
            return res.blob().then(function(blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                link.click();
                URL.revokeObjectURL(url);
            });
        })
        .catch(function(err) {
            alert(err.message || 'Failed to export tickets.');
        });
}

function deleteSelectedTickets() {
    const ids = Array.from(ticketsSelection);
    if (!ids.length) {
        alert('Select at least one ticket to delete.');
        return;
    }
    confirmAppAction('Delete the selected ticket history records? This is allowed only for break-glass SuperAdmin sessions.', {
        title: 'Delete ticket history',
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        variant: 'warning'
    }).then(function(confirmed) {
        if (!confirmed) return;
        return apiJson('/admin/tickets/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request_ids: ids })
        }).then(function(result) {
            ticketsSelection = new Set();
            loadTicketsPage();
            alert('Deleted ' + String(result.deleted || 0) + ' ticket record(s).');
        }).catch(function(err) {
            alert(err.message || 'Failed to delete ticket history.');
        });
    });
}

// User Management Functions
function syncUsers() {
    alert('🔄 Syncing users from identity providers...');
}

function editUser(email) {
    alert(`Edit user: ${email}`);
}

function generateTempPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    const arr = new Uint32Array(12);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(arr);
        for (let i = 0; i < 12; i++) {
            password += chars.charAt(arr[i] % chars.length);
        }
    } else {
        for (let i = 0; i < 12; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    }
    const el = document.getElementById('onboardPassword');
    if (el) el.value = password;
}

// Integration Functions
function showCloudOnboarding() {
    showModal('cloudOnboardingModal');
}

function onboardCloud(provider) {
    closeModal();
    alert(`${provider.toUpperCase()} onboarding will be available soon.\n\nYou'll be able to connect your ${provider.toUpperCase()} accounts and sync them automatically.`);
}

function showIntegrationTab(tabName) {
    document.querySelectorAll('.integration-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.integration-tab-content').forEach(content => content.classList.remove('active'));
    const btn = event?.target?.closest('.integration-tab-btn');
    if (btn) btn.classList.add('active');
    const tabEl = document.getElementById(tabName + 'IntegrationTab');
    if (tabEl) tabEl.classList.add('active');
    if (String(tabName || '').trim().toLowerCase() === 'siem') {
        showSiemIntegrationPanel(siemIntegrationPanel || 's3');
        loadSiemS3Panel();
    }
}

function showIntentMessage(intentAnalysis, suggestion) {
    const aiCopilotTab = document.getElementById('aiCopilotTab');
    const useCaseTextarea = document.getElementById('aiUseCase');
    
    let messageHtml = '';
    
    if (suggestion === 'create_jira_ticket') {
        messageHtml = `
            <div id="intentMessage" style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 1rem; margin: 1rem 0; border-radius: 4px;">
                <div style="display: flex; align-items: start; gap: 0.5rem;">
                    <i class="fas fa-exclamation-triangle" style="color: #856404; margin-top: 2px;"></i>
                    <div style="color: #856404; font-size: 0.9rem;">
                        <strong>Infrastructure Request Detected</strong><br>
                        This system provides temporary ACCESS to existing resources only.<br>
                        For new resource creation, please create a JIRA ticket for DevOps/Platform team.<br><br>
                        <strong>Detected:</strong> ${intentAnalysis.intents.join(', ')} - ${intentAnalysis.resources.join(', ')}<br><br>
                        <strong>To request access:</strong> Specify existing resource name (e.g., "access bucket: my-existing-bucket")
                    </div>
                </div>
            </div>
        `;
    } else if (suggestion === 'manager_approval_required') {
        messageHtml = `
            <div id="intentMessage" style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 1rem; margin: 1rem 0; border-radius: 4px;">
                <div style="display: flex; align-items: start; gap: 0.5rem;">
                    <i class="fas fa-ban" style="color: #721c24; margin-top: 2px;"></i>
                    <div style="color: #721c24; font-size: 0.9rem;">
                        <strong>Destructive Operation Detected</strong><br>
                        DELETE/CLEANUP operations require manager approval and proper justification.<br><br>
                        <strong>Detected:</strong> ${intentAnalysis.intents.join(', ')}<br><br>
                        <strong>Alternative:</strong> Request READ-ONLY access first to review data
                    </div>
                </div>
            </div>
        `;
    }
    
    useCaseTextarea.insertAdjacentHTML('afterend', messageHtml);
}

function configureIntegration(provider) {
    const key = String(provider || '').trim().toLowerCase();
    if (key !== 'confluence' && key !== 'support' && key !== 'aws' && key !== 'rds_proxy' && key !== 'sns' && key !== 'gmail' && key !== 'audit_export' && key !== 'identity_center_login' && key !== 'jira' && key !== 'jumpcloud' && key !== 'db_connection_push' && key !== 'desktop_agent') {
        alert(`${provider} integration settings will be implemented in a later phase.`);
        return;
    }
    if (!canAccessAdminConsole()) {
        alert('Admin access is required to configure integrations.');
        return;
    }
    loadAdminSettings().then(function(settings) {
        if (key === 'jira') {
            const jiraBaseUrl = String(settings.jira_base_url || '').trim();
            if (jiraBaseUrl) {
                window.open(jiraBaseUrl.replace(/\/+$/, '') + '/login', '_blank', 'noopener');
            }
        }
        activeIntegrationProvider = key;
        const title = document.getElementById('integrationConfigTitle');
        const fields = document.getElementById('integrationConfigFields');
        const status = document.getElementById('integrationConfigStatus');
        const results = document.getElementById('integrationConfigResults');
        const testBtn = document.getElementById('integrationConfigTestBtn');
        const saveBtn = document.querySelector('#integrationConfigForm button[type="submit"]');
        if (status) {
            status.hidden = true;
            status.textContent = '';
            status.removeAttribute('data-variant');
        }
        if (results) {
            results.hidden = true;
            results.innerHTML = '';
        }
        if (testBtn) {
            testBtn.hidden = key !== 'aws' && key !== 'rds_proxy' && key !== 'sns' && key !== 'identity_center_login' && key !== 'jumpcloud' && key !== 'gmail' && key !== 'desktop_agent' && key !== 'audit_export';
            testBtn.disabled = false;
            testBtn.innerHTML = (key === 'jumpcloud')
                ? '<i class="fas fa-vial"></i> Run Test'
                : (key === 'audit_export')
                ? '<i class="fas fa-vial"></i> Test S3 Access'
                : ((key === 'desktop_agent') ? '<i class="fas fa-heartbeat"></i> Check Status' : '<i class="fas fa-vial"></i> Test');
        }
        if (saveBtn) {
            saveBtn.hidden = key === 'db_connection_push';
            saveBtn.disabled = false;
        }
        if (title) {
            var titleMap = {
                confluence: '<i class="fas fa-book"></i> Configure Documentation',
                support: '<i class="fas fa-life-ring"></i> Configure Support Contact',
                sns: '<i class="fas fa-bell"></i> Configure SNS Notifications',
                gmail: '<i class="fab fa-google"></i> Configure Google Workspace Mail',
                jumpcloud: '<i class="fas fa-id-badge"></i> Configure JumpCloud Profile Sync',
                identity_center_login: '<i class="fas fa-building-shield"></i> Configure AWS Identity Center Login',
                audit_export: '<i class="fas fa-file-export"></i> Configure Audit Log Export',
                rds_proxy: '<i class="fas fa-network-wired"></i> Configure RDS Proxy',
                aws: '<i class="fab fa-aws"></i> Configure AWS Role Routing',
                db_connection_push: '<i class="fas fa-database"></i> Configure Vault DB Connections',
                desktop_agent: '<i class="fas fa-laptop-code"></i> Configure Desktop Agent'
            };
            title.innerHTML = titleMap[key] || '<i class="fas fa-plug"></i> Configure Integration';
        }
        if (fields) {
            if (key === 'desktop_agent') {
                fields.innerHTML =
                    '<div class="form-group">' +
                        '<label style="display:flex; align-items:center; gap:8px; margin-top:8px;"><input type="checkbox" id="integrationDesktopAgentEnabled" ' + (settings.desktop_agent_enabled ? 'checked' : '') + '> Enable desktop agent integration</label>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Agent Authentication Mode</label>' +
                            '<select id="integrationDesktopAgentAuthMode">' +
                                '<option value="identity_center" ' + (String(settings.desktop_agent_auth_mode || 'identity_center') === 'identity_center' ? 'selected' : '') + '>Identity Center Pairing (Recommended)</option>' +
                                '<option value="shared_token" ' + (String(settings.desktop_agent_auth_mode || '') === 'shared_token' ? 'selected' : '') + '>Shared Token (Legacy)</option>' +
                            '</select>' +
                            '<small class="form-hint">Use Identity Center pairing for production rollout. Shared token is only for emergency fallback.</small>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Network Scope</label>' +
                            '<input type="text" id="integrationDesktopAgentNetworkScope" placeholder="netskope" value="' + escapeHtml(settings.desktop_agent_network_scope || 'netskope') + '">' +
                            '<small class="form-hint">Label shown in status (for example: netskope-only).</small>' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Heartbeat TTL Seconds</label>' +
                            '<input type="number" id="integrationDesktopAgentHeartbeatTtl" min="30" max="86400" value="' + escapeHtml(String(settings.desktop_agent_heartbeat_ttl_seconds || 180)) + '">' +
                            '<small class="form-hint">Agent is shown connected only if heartbeat is within this TTL.</small>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Pairing Code TTL Seconds</label>' +
                            '<input type="number" id="integrationDesktopAgentPairingCodeTtl" min="120" max="1800" value="' + escapeHtml(String(settings.desktop_agent_pairing_code_ttl_seconds || 600)) + '">' +
                            '<small class="form-hint">How long a login code stays valid.</small>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Pairing Poll Interval Seconds</label>' +
                            '<input type="number" id="integrationDesktopAgentPairingPollInterval" min="3" max="30" value="' + escapeHtml(String(settings.desktop_agent_pairing_poll_interval_seconds || 5)) + '">' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Download Delivery</label>' +
                            '<select id="integrationDesktopAgentDownloadDelivery">' +
                                '<option value="s3_proxy" ' + (String(settings.desktop_agent_download_delivery || 's3_proxy') === 's3_proxy' ? 'selected' : '') + '>Private S3 via NPAMX backend (Recommended)</option>' +
                                '<option value="url" ' + (String(settings.desktop_agent_download_delivery || '') === 'url' ? 'selected' : '') + '>Direct URL (Legacy)</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>S3 Bucket (private)</label>' +
                            '<input type="text" id="integrationDesktopAgentS3Bucket" placeholder="npamx-private-agents" value="' + escapeHtml(settings.desktop_agent_download_s3_bucket || '') + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>S3 Region</label>' +
                            '<input type="text" id="integrationDesktopAgentS3Region" placeholder="ap-south-1" value="' + escapeHtml(settings.desktop_agent_download_s3_region || '') + '">' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Windows Object Key</label>' +
                            '<input type="text" id="integrationDesktopAgentS3KeyWindows" placeholder="desktop-agent/v1.0.0/npamx-agent-windows.exe" value="' + escapeHtml(settings.desktop_agent_download_s3_key_windows || '') + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>macOS Object Key</label>' +
                            '<input type="text" id="integrationDesktopAgentS3KeyMacos" placeholder="desktop-agent/v1.0.0/npamx-agent-macos.pkg" value="' + escapeHtml(settings.desktop_agent_download_s3_key_macos || '') + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Linux Object Key</label>' +
                            '<input type="text" id="integrationDesktopAgentS3KeyLinux" placeholder="desktop-agent/v1.0.0/npamx-agent-linux.tar.gz" value="' + escapeHtml(settings.desktop_agent_download_s3_key_linux || '') + '">' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Legacy Shared Token</label>' +
                            '<input type="password" id="integrationDesktopAgentToken" placeholder="Only needed for shared_token mode" value="' + escapeHtml(settings.desktop_agent_shared_token || '') + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Legacy Windows URL</label>' +
                            '<input type="text" id="integrationDesktopAgentWindowsUrl" placeholder="https://.../npamx-agent-windows.exe" value="' + escapeHtml(settings.desktop_agent_download_url_windows || '') + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Legacy macOS URL</label>' +
                            '<input type="text" id="integrationDesktopAgentMacosUrl" placeholder="https://.../npamx-agent-macos.pkg" value="' + escapeHtml(settings.desktop_agent_download_url_macos || '') + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Legacy Linux URL</label>' +
                            '<input type="text" id="integrationDesktopAgentLinuxUrl" placeholder="https://.../npamx-agent-linux.tar.gz" value="' + escapeHtml(settings.desktop_agent_download_url_linux || '') + '">' +
                        '</div>' +
                    '</div>' +
                    '<div class="notice-info-pam">' +
                        '<strong>How this works:</strong> Agent login uses Identity Center pairing with one-time code approval. Downloads are served through NPAMX backend, so users only click Download and do not need direct S3 access.' +
                    '</div>';
            } else if (key === 'db_connection_push') {
                fields.innerHTML =
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Vault Plane</label>' +
                            '<select id="integrationDbExecutionPlane" onchange="onVaultDbPlaneChanged()">' +
                                '<option value="nonprod" selected>Nonprod</option>' +
                                '<option value="prod">Prod</option>' +
                                '<option value="sandbox">Sandbox</option>' +
                            '</select>' +
                            '<small class="form-hint">Vault API paths, KV secret refs, and connection inventory use this plane only.</small>' +
                        '</div>' +
                        '<div class="form-group"></div>' +
                        '<div class="form-group"></div>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Engine</label>' +
                            '<select id="integrationDbTestEngine" onchange="loadDbConnectionTestInstances(); updateVaultPushTemplateForEngine(this.value)">' +
                                '<option value="mysql">MySQL / MariaDB / Aurora MySQL</option>' +
                                '<option value="postgres">PostgreSQL</option>' +
                                '<option value="redshift">Redshift</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>AWS Account</label>' +
                            '<select id="integrationDbTestAccount" onchange="onDbConnectionTestAccountChange()">' +
                                '<option value="">Select AWS account</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Database Target</label>' +
                            '<select id="integrationDbTestInstance" onchange="onDbConnectionTestInstanceChange()">' +
                                '<option value="">Select database target</option>' +
                            '</select>' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Vault Connection Name</label>' +
                            '<input type="text" id="integrationDbConnectionName" placeholder="database-1" oninput="suggestVaultAdminSecretRefForPush(false)">' +
                            '<small class="form-hint">Default is instance identifier. NPAMX stores map keys automatically for activation.</small>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Database Name (for Postgres/Redshift)</label>' +
                            '<input type="text" id="integrationDbName" placeholder="postgres / dev">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Allowed Roles</label>' +
                            '<input type="text" id="integrationDbAllowedRoles" value="*">' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Vault Admin Username (optional with KV Secret Ref)</label>' +
                            '<input type="text" id="integrationDbAdminUsername" placeholder="vault_admin_mysql_np / vault_admin_postgres_np">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Vault Admin Password (optional with KV Secret Ref)</label>' +
                            '<input type="password" id="integrationDbAdminPassword" placeholder="Enter current password">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Username Template</label>' +
                            '<input type="text" id="integrationDbUsernameTemplate" placeholder="d-{{.RoleName}}-{{random 6}}">' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>KV Secret Ref (recommended)</label>' +
                            '<input type="text" id="integrationDbAdminSecretRef" placeholder="kv/npamx/nonprod/db-admin/connections/database-1">' +
                            '<small class="form-hint">NPAMX reads admin username/password from this Vault KV path (keys default to <code>username</code>/<code>password</code>).</small>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>KV Secret Prefix</label>' +
                            '<input type="text" id="integrationDbAdminSecretPrefix" value="kv/npamx/nonprod/db-admin/connections" oninput="suggestVaultAdminSecretRefForPush(false)">' +
                            '<small class="form-hint">Used to auto-suggest secret ref as <code>&lt;prefix&gt;/&lt;connection_name&gt;</code>.</small>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>KV Version</label>' +
                            '<input type="number" id="integrationDbAdminSecretKvVersion" min="1" max="2" value="2">' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>KV Username Key</label>' +
                            '<input type="text" id="integrationDbAdminSecretUsernameKey" value="username">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>KV Password Key</label>' +
                            '<input type="text" id="integrationDbAdminSecretPasswordKey" value="password">' +
                        '</div>' +
                        '<div class="form-group"></div>' +
                    '</div>' +
                    '<div style="display:flex; justify-content:flex-end; gap:10px; margin-bottom: 16px;">' +
                        '<button type="button" class="btn-primary btn-pam btn-sm" id="integrationDbPushBtn" onclick="pushVaultDbConnectionFromUi(\'full\', this)"><i class="fas fa-cloud-upload-alt"></i> Push to Vault</button>' +
                        '<button type="button" class="btn-secondary btn-pam btn-sm" id="integrationDbAllowedRolesOnlyBtn" onclick="pushVaultDbConnectionFromUi(\'allowed_roles_only\', this)"><i class="fas fa-asterisk"></i> Apply Allowed Roles Only</button>' +
                        '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="loadVaultDbConnectionInventory()"><i class="fas fa-rotate"></i> Refresh Connections</button>' +
                    '</div>' +
                    '<div class="notice-info-pam" style="margin-bottom: 16px;">' +
                        '<strong>Push workflow:</strong> Use <strong>Push to Vault</strong> to upsert full connection config (KV/admin credential path). Use <strong>Apply Allowed Roles Only</strong> to update only <code>allowed_roles</code> on an existing Vault connection without DB admin credentials.' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:0;">' +
                        '<label>Configured Connections</label>' +
                        '<div id="integrationDbConnectionInventory">' +
                            '<div class="notice-info-pam">Loading live Vault database connections...</div>' +
                        '</div>' +
                    '</div>' +
                    '';
            } else if (key === 'confluence') {
                documentationArticleDraft = cloneDocumentationArticles(settings.documentation_articles || []);
                documentationArticleEditIndex = -1;
                fields.innerHTML =
                    '<div class="form-group">' +
                        '<label>Documentation Home URL <span class="required">*</span></label>' +
                        '<input type="url" id="integrationDocumentationHomeUrl" placeholder="https://your-domain.atlassian.net/wiki/home" value="' + escapeHtml(settings.documentation_home_url || '') + '" required>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Documentation Search URL</label>' +
                        '<input type="url" id="integrationDocumentationSearchUrl" placeholder="https://your-domain.atlassian.net/wiki/search?text={query}" value="' + escapeHtml(settings.documentation_search_url || '') + '">' +
                        '<small class="form-hint">Use <code>{query}</code> where the search term should be inserted.</small>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<div class="documentation-admin-header">' +
                            '<div>' +
                                '<div class="notification-card-title-row" style="margin-bottom:4px;">' +
                                    '<label style="margin:0;">Article Catalog</label>' +
                                    '<span id="documentationArticlesCount" class="db-user-scheduler-badge is-disabled">0 articles</span>' +
                                '</div>' +
                                '<small class="form-hint">Add multiple documents and keywords. Users can search these article links directly from the Documentation modal.</small>' +
                            '</div>' +
                            '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="openDocumentationArticleEditor()"><i class="fas fa-plus"></i> Add Article</button>' +
                        '</div>' +
                        '<div id="documentationArticlesAdminList" class="documentation-admin-list"></div>' +
                    '</div>';
                window.setTimeout(renderDocumentationArticlesAdminList, 0);
            } else if (key === 'support') {
                fields.innerHTML =
                    '<div class="form-group">' +
                        '<label>Support Email Address <span class="required">*</span></label>' +
                        '<input type="email" id="integrationSupportEmail" placeholder="support@company.com" value="' + escapeHtml(settings.support_email || '') + '" required>' +
                    '</div>';
            } else if (key === 'sns') {
                fields.innerHTML =
                    '<div class="form-group">' +
                        '<label>Enable SNS Notifications</label>' +
                        '<label style="display:flex; align-items:center; gap:8px; margin-top:8px;"><input type="checkbox" id="integrationSnsEnabled" ' + (settings.sns_notifications_enabled ? 'checked' : '') + '> Send request notifications to approvers</label>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>SNS Topic ARN <span class="required">*</span></label>' +
                        '<input type="text" id="integrationSnsTopicArn" placeholder="arn:aws:sns:ap-south-1:123456789012:npamx-approvals" value="' + escapeHtml(settings.sns_topic_arn || '') + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Allowed Approver Email Domain</label>' +
                        '<input type="text" id="integrationApproverEmailDomain" placeholder="nykaa.com" value="' + escapeHtml(settings.request_approver_email_domain || 'nykaa.com') + '">' +
                        '<small class="form-hint">Only approver emails ending with this domain can be used in database access requests.</small>' +
                    '</div>';
            } else if (key === 'gmail') {
                fields.innerHTML =
                    '<div class="notice-info-pam" style="margin-bottom: 16px;">' +
                        '<strong>Recommended model:</strong> use a dedicated Google Workspace mailbox such as <code>pam@nykaa.com</code>. NPAMx will send approval emails from that mailbox to the approver email entered in the request.' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Enable Google Workspace Mail</label>' +
                        '<label style="display:flex; align-items:center; gap:8px; margin-top:8px;"><input type="checkbox" id="integrationGmailEnabled" ' + (settings.gmail_notifications_enabled ? 'checked' : '') + '> Use Gmail API for dynamic approver emails</label>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Sender Mailbox <span class="required">*</span></label>' +
                            '<input type="email" id="integrationGmailSenderEmail" placeholder="pam@nykaa.com" value="' + escapeHtml(settings.gmail_sender_email || '') + '">' +
                            '<small class="form-hint">Dedicated mailbox to send NPAMx approval notifications.</small>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Sender Display Name</label>' +
                            '<input type="text" id="integrationGmailSenderDisplayName" placeholder="NPAMx" value="' + escapeHtml(settings.gmail_sender_display_name || 'NPAMx') + '">' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Workspace Domain</label>' +
                            '<input type="text" id="integrationGmailWorkspaceDomain" placeholder="nykaa.com" value="' + escapeHtml(settings.gmail_workspace_domain || '') + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Workspace Admin Contact</label>' +
                            '<input type="email" id="integrationGmailWorkspaceAdminContact" placeholder="workspace-admin@nykaa.com" value="' + escapeHtml(settings.gmail_workspace_admin_contact || '') + '">' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Google Cloud Project ID <span class="required">*</span></label>' +
                            '<input type="text" id="integrationGmailProjectId" placeholder="npamx-mail-prod" value="' + escapeHtml(settings.gmail_project_id || '') + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>OAuth Client ID <span class="required">*</span></label>' +
                            '<input type="text" id="integrationGmailOauthClientId" placeholder="1234567890-abc.apps.googleusercontent.com" value="' + escapeHtml(settings.gmail_oauth_client_id || '') + '">' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Client Secret Secret Name <span class="required">*</span></label>' +
                            '<input type="text" id="integrationGmailClientSecretName" placeholder="npamx/gmail/client-secret" value="' + escapeHtml(settings.gmail_client_secret_name || '') + '">' +
                            '<small class="form-hint">Store the OAuth client secret in Secrets Manager or your approved backend secret store. The UI stores only the secret name.</small>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Refresh Token Secret Name <span class="required">*</span></label>' +
                            '<input type="text" id="integrationGmailRefreshTokenSecretName" placeholder="npamx/gmail/refresh-token" value="' + escapeHtml(settings.gmail_refresh_token_secret_name || '') + '">' +
                            '<small class="form-hint">Store the long-lived refresh token securely. The UI stores only the secret name.</small>' +
                        '</div>' +
                    '</div>' +
                    '<div class="notice-warning-pam" style="margin-top: 12px;">' +
                        '<strong>Ask your Google Workspace / GCP admins for:</strong><br>' +
                        '1. A dedicated sender mailbox such as <code>pam@nykaa.com</code><br>' +
                        '2. A Google Cloud project for NPAMx mail sending<br>' +
                        '3. An OAuth client ID for Gmail API with <code>gmail.send</code> scope<br>' +
                        '4. Approval to generate a refresh token for the sender mailbox<br>' +
                        '5. Confirmation that the mailbox is allowed to send externally to approvers' +
                    '</div>';
            } else if (key === 'jumpcloud') {
                const jumpcloudSecretDisplay = String(settings.jumpcloud_api_key_secret_name || '').trim() === '__CONFIGURED__'
                    ? '__CONFIGURED__'
                    : String(settings.jumpcloud_api_key_secret_name || '').trim();
                const jumpcloudDirectoryDisplay = String(settings.jumpcloud_directory_id || '').trim() === '__CONFIGURED__'
                    ? '__CONFIGURED__'
                    : String(settings.jumpcloud_directory_id || '').trim();
                fields.innerHTML =
                    '<div class="notice-info-pam" style="margin-bottom: 16px;">' +
                        '<strong>Recommended model:</strong> keep AWS Identity Center as the login source and use JumpCloud only to enrich user profile data such as manager, department, and job title.' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Enable JumpCloud Attribute Sync</label>' +
                        '<label style="display:flex; align-items:center; gap:8px; margin-top:8px;"><input type="checkbox" id="integrationJumpcloudEnabled" ' + (settings.jumpcloud_enabled ? 'checked' : '') + '> Use JumpCloud as a read-only profile enrichment source</label>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>JumpCloud API Base URL <span class="required">*</span></label>' +
                            '<input type="url" id="integrationJumpcloudApiBaseUrl" placeholder="https://console.jumpcloud.com/api" value="' + escapeHtml(settings.jumpcloud_api_base_url || 'https://console.jumpcloud.com/api') + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>API Key Secret Name <span class="required">*</span></label>' +
                            '<input type="text" id="integrationJumpcloudApiKeySecretName" placeholder="npamx/jumpcloud/api-key" value="' + escapeHtml(jumpcloudSecretDisplay) + '">' +
                            '<small class="form-hint">Stored value stays hidden after save. Enter a new value only when you want to replace it.</small>' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>User Lookup Field</label>' +
                            '<select id="integrationJumpcloudLookupField">' +
                                '<option value="email"' + (String(settings.jumpcloud_user_lookup_field || 'email') === 'email' ? ' selected' : '') + '>Email</option>' +
                                '<option value="username"' + (String(settings.jumpcloud_user_lookup_field || '') === 'username' ? ' selected' : '') + '>Username</option>' +
                                '<option value="employeeIdentifier"' + (String(settings.jumpcloud_user_lookup_field || '') === 'employeeIdentifier' ? ' selected' : '') + '>Employee Identifier</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Sync Mode</label>' +
                            '<select id="integrationJumpcloudSyncMode">' +
                                '<option value="on_demand"' + (String(settings.jumpcloud_sync_mode || 'on_demand') === 'on_demand' ? ' selected' : '') + '>On demand</option>' +
                                '<option value="login_refresh"' + (String(settings.jumpcloud_sync_mode || '') === 'login_refresh' ? ' selected' : '') + '>At login refresh</option>' +
                            '</select>' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Manager Attribute Name</label>' +
                            '<input type="text" id="integrationJumpcloudManagerAttribute" placeholder="manager" value="' + escapeHtml(settings.jumpcloud_manager_attribute_name || 'manager') + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Department Attribute Name</label>' +
                            '<input type="text" id="integrationJumpcloudDepartmentAttribute" placeholder="department" value="' + escapeHtml(settings.jumpcloud_department_attribute_name || 'department') + '">' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Job Title Attribute Name</label>' +
                            '<input type="text" id="integrationJumpcloudJobTitleAttribute" placeholder="jobTitle" value="' + escapeHtml(settings.jumpcloud_job_title_attribute_name || 'jobTitle') + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>JumpCloud Directory / Org ID</label>' +
                            '<input type="text" id="integrationJumpcloudDirectoryId" placeholder="Optional directory identifier" value="' + escapeHtml(jumpcloudDirectoryDisplay) + '">' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>JumpCloud Admin Contact</label>' +
                        '<input type="email" id="integrationJumpcloudAdminContact" placeholder="jumpcloud-admin@nykaa.com" value="' + escapeHtml(settings.jumpcloud_admin_contact || '') + '">' +
                    '</div>' +
                    '<div class="notice-warning-pam" style="margin-top: 12px;">' +
                        '<strong>Ask the JumpCloud team for:</strong><br>' +
                        '1. API base URL and whether the standard <code>https://console.jumpcloud.com/api</code> endpoint should be used.<br>' +
                        '2. A read-only API key for system users / user directory lookups.<br>' +
                        '3. The exact lookup key shared with AWS Identity Center users, ideally <code>email</code>.<br>' +
                        '4. Confirmation of the manager field shape. In many JumpCloud setups the manager value is a JumpCloud user identifier rather than an email.<br>' +
                        '5. The exact field names used for department and job title if they differ from <code>department</code> and <code>jobTitle</code>.<br>' +
                        '6. The JumpCloud admin contact for future troubleshooting and permission changes.' +
                    '</div>';
            } else if (key === 'identity_center_login') {
                const baseUrl = String(settings.app_base_url || '').trim();
                const derived = deriveSsoUrlsFromBaseUrl(baseUrl);
                fields.innerHTML =
                    '<div class="notice-info-pam" style="margin-bottom: 16px;">' +
                        '<strong>Identity Center setup:</strong> upload the IAM Identity Center SAML metadata XML here. This base URL is used only for SAML ACS / audience generation and does not block access from other frontend URLs such as the public ALB.' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Identity Center / SAML Base URL <span class="required">*</span></label>' +
                        '<input type="url" id="integrationAppBaseUrl" placeholder="https://npamx.example.com" value="' + escapeHtml(baseUrl) + '" oninput="updateSsoIntegrationDerivedFields()">' +
                        '<small class="form-hint">Use the internal DNS or final hostname that IAM Identity Center will call back to. NPAMx can still be opened from other URLs, but SAML will use this hostname.</small>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Derived ACS URL</label>' +
                            '<input type="text" id="integrationSsoAcsUrl" value="' + escapeHtml(settings.saml_acs_url || derived.acs) + '" readonly>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Derived Audience / Entity ID</label>' +
                            '<input type="text" id="integrationSsoAudienceUrl" value="' + escapeHtml(settings.saml_audience_url || derived.audience) + '" readonly>' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Identity Center SAML Metadata XML <span class="required">*</span></label>' +
                        '<input type="file" id="integrationSsoMetadataFile" accept=".xml,text/xml,application/xml">' +
                        '<small class="form-hint">Upload the metadata XML you download from AWS IAM Identity Center. Current status: ' + escapeHtml(settings.saml_idp_metadata_configured ? 'Configured' : 'Not configured') + '.</small>' +
                    '</div>' +
                    '<div class="notice-warning-pam" style="margin-top: 12px;">' +
                        '<strong>Admin steps:</strong><br>' +
                        '1. In AWS IAM Identity Center, create or edit the Custom SAML 2.0 application.<br>' +
                        '2. Set the ACS URL to the derived ACS URL shown above.<br>' +
                        '3. Set the Audience / Entity ID to the derived Audience URL shown above.<br>' +
                        '4. Download the Identity Center metadata XML and upload it here.<br>' +
                        '5. Save the integration, then test login from the NPAMx landing page.' +
                    '</div>';
            } else if (key === 'jira') {
                const jiraBaseUrl = String(settings.jira_base_url || '').trim();
                const jiraLoginUrl = jiraBaseUrl ? jiraBaseUrl.replace(/\/+$/, '') + '/login' : '';
                fields.innerHTML =
                    '<div class="notice-info-pam" style="margin-bottom: 16px;">' +
                        '<strong>Recommended Jira model:</strong> configure one Jira project for proof-of-request tickets. Approve and deny actions will continue inside NPAMx. Users can later create Jira references from NPAMx using the configured Jira project.' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Enable Jira Integration</label>' +
                        '<label style="display:flex; align-items:center; gap:8px; margin-top:8px;"><input type="checkbox" id="integrationJiraEnabled" ' + (settings.jira_enabled ? 'checked' : '') + '> Allow Jira proof ticket creation from NPAMx</label>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Jira Base URL <span class="required">*</span></label>' +
                            '<input type="url" id="integrationJiraBaseUrl" placeholder="https://nykaa.atlassian.net" value="' + escapeHtml(jiraBaseUrl) + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Jira Project Key <span class="required">*</span></label>' +
                            '<input type="text" id="integrationJiraProjectKey" placeholder="NPAMX" value="' + escapeHtml(settings.jira_project_key || '') + '">' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-row-pam">' +
                        '<div class="form-group">' +
                            '<label>Jira User Email <span class="required">*</span></label>' +
                            '<input type="email" id="integrationJiraUserEmail" placeholder="pam@nykaa.com" value="' + escapeHtml(settings.jira_user_email || '') + '">' +
                            '<small class="form-hint">Use a dedicated Jira service user or a shared PAM operations mailbox account.</small>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Jira API Token Secret Name <span class="required">*</span></label>' +
                            '<input type="text" id="integrationJiraApiTokenSecretName" placeholder="npamx/jira/api-token" value="' + escapeHtml(settings.jira_api_token_secret_name || '') + '">' +
                            '<small class="form-hint">Store the Jira API token in Secrets Manager. NPAMx stores only the secret name.</small>' +
                        '</div>' +
                    '</div>' +
                    '<div class="notice-warning-pam" style="margin-top: 12px;">' +
                        '<strong>Admin steps:</strong><br>' +
                        '1. Ask the Jira admins for a dedicated Jira user or project access with issue create permission.<br>' +
                        '2. Generate an API token for that Jira user and store it in Secrets Manager.<br>' +
                        '3. Save the Jira base URL, project key, user email, and token secret name here.<br>' +
                        '4. Approve and deny decisions stay in NPAMx. Jira is only for proof / reference tickets.<br>' +
                        (jiraLoginUrl ? ('5. Optional sign-in check: <a href="' + escapeHtml(jiraLoginUrl) + '" target="_blank" rel="noopener noreferrer">Open Jira Login</a>') : '5. Optional sign-in check: save the base URL, then use the Jira login link.') +
                    '</div>';
            } else if (key === 'audit_export') {
                fields.innerHTML =
                    '<div class="notice-info-pam" style="margin-bottom: 16px;">' +
                        '<strong>Recommended model:</strong> use one S3 bucket and prefix for the NPAMX activity archive. Auto-export mirrors new user and admin activity as single CSV events, while full export writes snapshot CSVs for historical backfill.' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>S3 Bucket <span class="required">*</span></label>' +
                        '<input type="text" id="integrationAuditBucket" placeholder="npamx-audit-logs" value="' + escapeHtml(settings.audit_logs_bucket || '') + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Base Prefix</label>' +
                        '<input type="text" id="integrationAuditPrefix" placeholder="npamx/audit" value="' + escapeHtml(settings.audit_logs_prefix || 'npamx/audit') + '">' +
                        '<small class="form-hint">Example path: npamx/audit/events/app_activity/2026/04/01/file.csv</small>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label style="display:flex; align-items:center; gap:8px; margin-top:8px;"><input type="checkbox" id="integrationAuditAutoExport" ' + (settings.audit_logs_auto_export ? 'checked' : '') + '> Mirror new NPAMX activity events to S3 automatically</label>' +
                    '</div>' +
                    '<div class="notice-warning-pam" style="margin-top: 12px;">' +
                        '<strong>Coverage:</strong><br>' +
                        '1. Application activity for authenticated user and admin actions.<br>' +
                        '2. PAM approval, denial, revoke, and ticket export actions.<br>' +
                        '3. Database query audit events.<br>' +
                        '4. Full CSV snapshot export for backfill or SIEM reload jobs.' +
                    '</div>';
            } else if (key === 'rds_proxy') {
                fields.innerHTML =
                    '<div class="form-group">' +
                        '<label>Account-wise RDS Proxy Endpoints</label>' +
                        '<div id="dbProxyMappingsWrap">' + renderDbProxyMappingRows(settings.db_connect_proxy_mappings || []) + '</div>' +
                        '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="addDbProxyMappingRow()"><i class="fas fa-plus"></i> Add Proxy Endpoint</button>' +
                        '<small class="form-hint">Add account name, account ID, proxy host, and port. PAM will automatically show the proxy that matches the request account. Legacy nonprod fallback fields are still supported in backend settings, but they are intentionally hidden here.</small>' +
                    '</div>';
            } else {
                fields.innerHTML =
                    '<div class="form-group">' +
                        '<label>Management Role ARN</label>' +
                        '<input type="text" id="integrationIdcRoleArn" placeholder="arn:aws:iam::767398039045:role/PAM-IdentityCenter-Role" value="' + escapeHtml(settings.idc_assume_role_arn || '') + '">' +
                        '<small class="form-hint">Used for Organizations, Identity Store, and IAM Identity Center APIs.</small>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Management Role Session Name</label>' +
                        '<input type="text" id="integrationIdcRoleSessionName" placeholder="npam-idc" value="' + escapeHtml(settings.idc_assume_role_session_name || 'npam-idc') + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Default Resource Role ARN</label>' +
                        '<input type="text" id="integrationResourceRoleArn" placeholder="arn:aws:iam::116155851700:role/PAM-Security-Resources-Role" value="' + escapeHtml(settings.resource_assume_role_arn || '') + '">' +
                        '<small class="form-hint">Optional default role for AWS resource discovery when no per-account mapping exists.</small>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Per-account Role Name Template</label>' +
                        '<input type="text" id="integrationResourceRoleNameTemplate" placeholder="NPAMX-Resource-Role" value="' + escapeHtml(settings.resource_assume_role_name_template || '') + '">' +
                        '<small class="form-hint">If the same role name exists in every target account, NPAMx will automatically assume <code>arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME</code> without hardcoding one ARN per account.</small>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Resource Role Session Name</label>' +
                        '<input type="text" id="integrationResourceRoleSessionName" placeholder="npam-resource" value="' + escapeHtml(settings.resource_assume_role_session_name || 'npam-resource') + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label>Per-account Resource Role Mappings</label>' +
                        '<div id="awsRoleMappingsWrap">' + renderAwsRoleMappingRows(settings.resource_role_mappings || []) + '</div>' +
                        '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="addAwsRoleMappingRow()"><i class="fas fa-plus"></i> Add Account Role</button>' +
                        '<small class="form-hint">Use explicit mappings when a target account needs a different role ARN than the shared template.</small>' +
                    '</div>';
            }
        }
        showModal('integrationConfigModal');
        if (key === 'desktop_agent') {
            refreshDesktopAgentRuntimeStatus();
        } else if (key === 'db_connection_push') {
            vaultDbConnectionInventory = [];
            vaultDbConnectionInventoryTesting = {};
            vaultDbConnectionInventoryLoading = false;
            renderVaultDbConnectionInventory();
            setInlineStatus('integrationConfigStatus', 'Loading Vault database connections for push management...', 'info');
            updateVaultPushTemplateForEngine('mysql');
            syncVaultSecretPrefixWithPlane(true);
            suggestVaultAdminSecretRefForPush(true);
            loadDbConnectionTestAccounts();
            loadVaultDbConnectionInventory();
        }
    }).catch(function(err) {
        alert(err.message || 'Failed to load integration settings.');
    });
}

async function saveIntegrationConfiguration(e) {
    e.preventDefault();
    const key = activeIntegrationProvider;
    if (!key) return;
    if (key === 'db_connection_push') {
        setInlineStatus('integrationConfigStatus', 'Use Push to Vault in this screen. There are no saved settings for this workflow.', 'info');
        return;
    }
    const latestSettings = await loadAdminSettings().catch(function() {
        return Object.assign({}, appSettings);
    });
    const payload = Object.assign({}, latestSettings);
    if (key === 'confluence') {
        payload.documentation_home_url = String((document.getElementById('integrationDocumentationHomeUrl') || {}).value || '').trim();
        payload.documentation_search_url = String((document.getElementById('integrationDocumentationSearchUrl') || {}).value || '').trim();
        payload.documentation_articles = cloneDocumentationArticles(documentationArticleDraft);
        const validationError = validateDocumentationArticles(payload.documentation_articles);
        if (validationError) {
            setInlineStatus('integrationConfigStatus', validationError, 'error');
            return;
        }
    } else if (key === 'support') {
        payload.support_email = String((document.getElementById('integrationSupportEmail') || {}).value || '').trim();
    } else if (key === 'identity_center_login') {
        payload.app_base_url = String((document.getElementById('integrationAppBaseUrl') || {}).value || '').trim();
        const metadataXml = await readIntegrationFileAsText('integrationSsoMetadataFile');
        if (metadataXml) {
            payload.saml_idp_metadata_xml = metadataXml;
        }
    } else if (key === 'sns') {
        payload.sns_notifications_enabled = !!document.getElementById('integrationSnsEnabled')?.checked;
        payload.sns_topic_arn = String((document.getElementById('integrationSnsTopicArn') || {}).value || '').trim();
        payload.request_approver_email_domain = String((document.getElementById('integrationApproverEmailDomain') || {}).value || '').trim() || 'nykaa.com';
    } else if (key === 'gmail') {
        payload.gmail_notifications_enabled = !!document.getElementById('integrationGmailEnabled')?.checked;
        payload.gmail_sender_email = String((document.getElementById('integrationGmailSenderEmail') || {}).value || '').trim();
        payload.gmail_sender_display_name = String((document.getElementById('integrationGmailSenderDisplayName') || {}).value || '').trim() || 'NPAMx';
        payload.gmail_workspace_domain = String((document.getElementById('integrationGmailWorkspaceDomain') || {}).value || '').trim();
        payload.gmail_workspace_admin_contact = String((document.getElementById('integrationGmailWorkspaceAdminContact') || {}).value || '').trim();
        payload.gmail_project_id = String((document.getElementById('integrationGmailProjectId') || {}).value || '').trim();
        payload.gmail_oauth_client_id = String((document.getElementById('integrationGmailOauthClientId') || {}).value || '').trim();
        payload.gmail_client_secret_name = String((document.getElementById('integrationGmailClientSecretName') || {}).value || '').trim();
        payload.gmail_refresh_token_secret_name = String((document.getElementById('integrationGmailRefreshTokenSecretName') || {}).value || '').trim();
    } else if (key === 'jumpcloud') {
        payload.jumpcloud_enabled = !!document.getElementById('integrationJumpcloudEnabled')?.checked;
        payload.jumpcloud_api_base_url = String((document.getElementById('integrationJumpcloudApiBaseUrl') || {}).value || '').trim() || 'https://console.jumpcloud.com/api';
        payload.jumpcloud_api_key_secret_name = String((document.getElementById('integrationJumpcloudApiKeySecretName') || {}).value || '').trim();
        payload.jumpcloud_user_lookup_field = String((document.getElementById('integrationJumpcloudLookupField') || {}).value || '').trim() || 'email';
        payload.jumpcloud_manager_attribute_name = String((document.getElementById('integrationJumpcloudManagerAttribute') || {}).value || '').trim() || 'manager';
        payload.jumpcloud_department_attribute_name = String((document.getElementById('integrationJumpcloudDepartmentAttribute') || {}).value || '').trim() || 'department';
        payload.jumpcloud_job_title_attribute_name = String((document.getElementById('integrationJumpcloudJobTitleAttribute') || {}).value || '').trim() || 'jobTitle';
        payload.jumpcloud_sync_mode = String((document.getElementById('integrationJumpcloudSyncMode') || {}).value || '').trim() || 'on_demand';
        payload.jumpcloud_directory_id = String((document.getElementById('integrationJumpcloudDirectoryId') || {}).value || '').trim();
        payload.jumpcloud_admin_contact = String((document.getElementById('integrationJumpcloudAdminContact') || {}).value || '').trim();
    } else if (key === 'jira') {
        payload.jira_enabled = !!document.getElementById('integrationJiraEnabled')?.checked;
        payload.jira_base_url = String((document.getElementById('integrationJiraBaseUrl') || {}).value || '').trim();
        payload.jira_project_key = String((document.getElementById('integrationJiraProjectKey') || {}).value || '').trim();
        payload.jira_user_email = String((document.getElementById('integrationJiraUserEmail') || {}).value || '').trim();
        payload.jira_api_token_secret_name = String((document.getElementById('integrationJiraApiTokenSecretName') || {}).value || '').trim();
    } else if (key === 'audit_export') {
        payload.audit_logs_bucket = String((document.getElementById('integrationAuditBucket') || {}).value || '').trim();
        payload.audit_logs_prefix = String((document.getElementById('integrationAuditPrefix') || {}).value || '').trim() || 'npamx/audit';
        payload.audit_logs_auto_export = !!document.getElementById('integrationAuditAutoExport')?.checked;
    } else if (key === 'rds_proxy') {
        payload.db_connect_proxy_mappings = collectDbProxyMappingsFromForm().filter(function(item) {
            return item.account_id && item.proxy_host;
        });
    } else if (key === 'desktop_agent') {
        payload.desktop_agent_enabled = !!document.getElementById('integrationDesktopAgentEnabled')?.checked;
        payload.desktop_agent_auth_mode = String((document.getElementById('integrationDesktopAgentAuthMode') || {}).value || '').trim() || 'identity_center';
        payload.desktop_agent_shared_token = String((document.getElementById('integrationDesktopAgentToken') || {}).value || '').trim();
        payload.desktop_agent_network_scope = String((document.getElementById('integrationDesktopAgentNetworkScope') || {}).value || '').trim() || 'netskope';
        payload.desktop_agent_download_delivery = String((document.getElementById('integrationDesktopAgentDownloadDelivery') || {}).value || '').trim() || 's3_proxy';
        payload.desktop_agent_download_s3_bucket = String((document.getElementById('integrationDesktopAgentS3Bucket') || {}).value || '').trim();
        payload.desktop_agent_download_s3_region = String((document.getElementById('integrationDesktopAgentS3Region') || {}).value || '').trim();
        payload.desktop_agent_download_s3_key_windows = String((document.getElementById('integrationDesktopAgentS3KeyWindows') || {}).value || '').trim();
        payload.desktop_agent_download_s3_key_macos = String((document.getElementById('integrationDesktopAgentS3KeyMacos') || {}).value || '').trim();
        payload.desktop_agent_download_s3_key_linux = String((document.getElementById('integrationDesktopAgentS3KeyLinux') || {}).value || '').trim();
        payload.desktop_agent_download_url_windows = String((document.getElementById('integrationDesktopAgentWindowsUrl') || {}).value || '').trim();
        payload.desktop_agent_download_url_macos = String((document.getElementById('integrationDesktopAgentMacosUrl') || {}).value || '').trim();
        payload.desktop_agent_download_url_linux = String((document.getElementById('integrationDesktopAgentLinuxUrl') || {}).value || '').trim();
        payload.desktop_agent_heartbeat_ttl_seconds = Number.parseInt(String((document.getElementById('integrationDesktopAgentHeartbeatTtl') || {}).value || '180').trim(), 10) || 180;
        payload.desktop_agent_pairing_code_ttl_seconds = Number.parseInt(String((document.getElementById('integrationDesktopAgentPairingCodeTtl') || {}).value || '600').trim(), 10) || 600;
        payload.desktop_agent_pairing_poll_interval_seconds = Number.parseInt(String((document.getElementById('integrationDesktopAgentPairingPollInterval') || {}).value || '5').trim(), 10) || 5;
    } else if (key === 'aws') {
        payload.idc_assume_role_arn = String((document.getElementById('integrationIdcRoleArn') || {}).value || '').trim();
        payload.idc_assume_role_session_name = String((document.getElementById('integrationIdcRoleSessionName') || {}).value || '').trim() || 'npam-idc';
        payload.resource_assume_role_arn = String((document.getElementById('integrationResourceRoleArn') || {}).value || '').trim();
        payload.resource_assume_role_name_template = String((document.getElementById('integrationResourceRoleNameTemplate') || {}).value || '').trim();
        payload.resource_assume_role_session_name = String((document.getElementById('integrationResourceRoleSessionName') || {}).value || '').trim() || 'npam-resource';
        payload.resource_role_mappings = collectAwsRoleMappingsFromForm().filter(function(item) {
            return item.account_id && item.role_arn;
        });
    }
    try {
        await saveAdminSettings(payload);
        if (key === 'desktop_agent') {
            refreshDesktopAgentRuntimeStatus();
        }
        setInlineStatus('integrationConfigStatus', 'Integration settings saved successfully.', 'info');
        window.setTimeout(function() {
            closeModal();
        }, 350);
    } catch (err) {
        setInlineStatus('integrationConfigStatus', err.message || 'Failed to save integration settings.', 'error');
    }
}

function showAdminIntegrationCategory(category) {
    document.querySelectorAll('.admin-integration-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.admin-integration-category').forEach(el => el.classList.remove('active'));
    const btn = event?.target?.closest('.admin-integration-tab-btn');
    if (btn) btn.classList.add('active');
    const el = document.getElementById('adminIntegration' + category.charAt(0).toUpperCase() + category.slice(1));
    if (el) el.classList.add('active');
}

function filterAuditLogs() {
    loadAuditLogsTable();
}

async function exportAuditLogsToS3() {
    try {
        setInlineStatus('integrationConfigStatus', '', 'info');
        const result = await apiJson('/admin/audit-logs/export', { method: 'POST' });
        loadAuditLogsTable();
        setInlineStatus('siemS3InlineStatus', 'NPAMX activity archive exported successfully to S3.', 'success');
        alert('NPAMX activity archive exported successfully to S3.\n\n' + (Array.isArray(result.export?.uploaded_keys) ? result.export.uploaded_keys.join('\n') : ''));
    } catch (err) {
        setInlineStatus('siemS3InlineStatus', err.message || 'Failed to export NPAMX activity archive.', 'error');
        alert(err.message || 'Failed to export NPAMX activity archive.');
    }
}

function showReportsAuditSubTab(subTab, ev) {
    const reportsTab = document.getElementById('adminReportsTab');
    const reportsContent = document.getElementById('adminReportsContent');
    const auditContent = document.getElementById('adminAuditContent');
    if (!reportsTab || !reportsContent || !auditContent) return;
    reportsTab.querySelectorAll('.tab-glow-subtab').forEach(b => { b.classList.remove('tab-glow-subtab-active'); });
    if (ev && ev.target) ev.target.closest('.tab-glow-subtab')?.classList.add('tab-glow-subtab-active');
    reportsContent.style.display = subTab === 'reports' ? 'block' : 'none';
    auditContent.style.display = subTab === 'audit' ? 'block' : 'none';
    if (subTab === 'audit' && typeof loadAdminAuditLogs === 'function') loadAdminAuditLogs();
}

function filterAdminAuditLogs() {
    if (typeof loadAdminAuditLogs === 'function') loadAdminAuditLogs();
}

function loadRequestForOthersModalData() {
    // Load accounts
    const accountSelect = document.getElementById('otherRequestAccount');
    if (accountSelect) {
        accountSelect.innerHTML = '<option value="">Select Account</option>' +
            Object.values(accounts).map(account => 
                `<option value="${account.id}">${account.name} (${account.id})</option>`
            ).join('');
    }
    
    // Load permission sets
    const permissionSetSelect = document.getElementById('otherRequestPermissionSet');
    if (permissionSetSelect) {
        permissionSetSelect.innerHTML = '<option value="">Select Permission Set</option>' +
            permissionSets.map(ps => 
                `<option value="${ps.arn}">${ps.name}</option>`
            ).join('');
    }
    
    // Setup email tags functionality
    setupEmailTags();
}

let selectedEmails = [];

function setupEmailTags() {
    const emailInput = document.getElementById('requesterEmail');
    const emailTags = document.getElementById('emailTags');
    
    if (!emailInput || !emailTags) return;
    
    emailInput.addEventListener('keydown', function(e) {
        if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault();
            addEmailTag(this.value.trim());
            this.value = '';
        } else if (e.key === 'Backspace' && this.value === '' && selectedEmails.length > 0) {
            removeEmailTag(selectedEmails.length - 1);
        }
    });
    
    emailInput.addEventListener('blur', function() {
        if (this.value.trim()) {
            addEmailTag(this.value.trim());
            this.value = '';
        }
    });
}

function addEmailTag(email) {
    if (!email || !isValidEmail(email) || selectedEmails.includes(email)) {
        return;
    }
    
    selectedEmails.push(email);
    renderEmailTags();
}

function removeEmailTag(index) {
    selectedEmails.splice(index, 1);
    renderEmailTags();
}

function renderEmailTags() {
    const emailTags = document.getElementById('emailTags');
    if (!emailTags) return;
    
    emailTags.innerHTML = selectedEmails.map((email, index) => `
        <span class="email-tag">
            ${email}
            <button type="button" class="email-tag-remove" onclick="removeEmailTag(${index})">&times;</button>
        </span>
    `).join('');
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function switchOtherAccessType(type) {
    // Update tab buttons
    document.querySelectorAll('#requestForOthersModal .tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('#requestForOthersModal .tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(type === 'existing' ? 'otherExistingPermissionsTab' : 'otherAiCopilotTab').classList.add('active');
}

let otherCurrentAIPermissions = null;

async function generateOtherAIPermissions() {
    const useCase = document.getElementById('otherAiUseCase').value;
    if (!useCase) {
        alert('Please describe what users need to do');
        return;
    }
    
    // Simple validation - AI only responds to AWS access requests
    const useCaseLower = useCase.toLowerCase();
    
    // Check if request contains AWS services or access keywords
    const awsKeywords = ['aws', 'ec2', 's3', 'lambda', 'iam', 'cloudformation', 'rds', 'dynamodb', 'vpc', 'cloudwatch', 'access', 'permission'];
    const hasAwsContext = awsKeywords.some(keyword => useCaseLower.includes(keyword));
    
    if (!hasAwsContext) {
        alert('AI only generates AWS access permissions. Please specify your AWS access requirements.');
        return;
    }
    
    const button = event.target;
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    button.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/generate-permissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ use_case: useCase })
        });
        
        const permissions = await response.json();
        
        if (permissions.error) {
            alert('Error: ' + permissions.error);
            return;
        }
        
        // Display permissions
        const preview = document.getElementById('otherAiPermissionsPreview');
        const content = document.getElementById('otherAiPermissionsContent');
        
        content.innerHTML = `
            <p><strong>Description:</strong> ${permissions.description}</p>
            <p><strong>Actions:</strong></p>
            <ul>
                ${permissions.actions.map(action => `<li class="permission-item">${action}</li>`).join('')}
            </ul>
            <p><strong>Resources:</strong> ${JSON.stringify(permissions.resources)}</p>
        `;
        
        preview.style.display = 'block';
        
        // Store permissions for form submission
        otherCurrentAIPermissions = permissions;
        
    } catch (error) {
        console.error('Error generating permissions:', error);
        alert('Error generating permissions. Please try again.');
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

// Form Handlers
async function handleRequestForOthers(e) {
    e.preventDefault();
    
    // Add current input value to emails if any
    const currentInput = document.getElementById('requesterEmail').value.trim();
    if (currentInput && isValidEmail(currentInput) && !selectedEmails.includes(currentInput)) {
        selectedEmails.push(currentInput);
    }
    
    if (selectedEmails.length === 0) {
        alert('Please add at least one email address');
        return;
    }
    
    const account_id = document.getElementById('otherRequestAccount').value;
    const duration_hours = parseInt(document.getElementById('otherRequestDuration').value);
    const justification = document.getElementById('otherRequestJustification').value;
    
    // Check if AI or existing permission set
    const activeTab = document.querySelector('#requestForOthersModal .tab-btn.active').textContent;
    let permission_set = null;
    let use_case = null;
    
    if (activeTab.includes('AI')) {
        if (!otherCurrentAIPermissions) {
            alert('Please generate permissions first');
            return;
        }
        use_case = document.getElementById('otherAiUseCase').value;
    } else {
        permission_set = document.getElementById('otherRequestPermissionSet').value;
        if (!permission_set) {
            alert('Please select a permission set');
            return;
        }
    }
    
    // Validate required fields
    if (!account_id || !justification) {
        alert('Please fill in all required fields');
        return;
    }
    
    try {
        const results = [];
        
        // Submit request for each email
        for (const email of selectedEmails) {
            const formData = {
                user_email: email,
                account_id: account_id,
                duration_hours: duration_hours,
                justification: justification,
                requested_by: localStorage.getItem('userEmail')
            };
            
            // Add AI or existing permission set data
            if (use_case) {
                formData.use_case = use_case;
                formData.ai_generated = true;
            } else {
                formData.permission_set = permission_set;
                formData.ai_generated = false;
            }
            
            const response = await fetch(`${API_BASE}/request-for-others`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            results.push({ email, result });
        }
        
        // Show results
        const successful = results.filter(r => !r.result.error);
        const failed = results.filter(r => r.result.error);
        
        let message = `✅ Requests submitted for ${successful.length} user(s):\n`;
        successful.forEach(r => {
            message += `• ${r.email}: ${r.result.request_id}\n`;
        });
        
        if (failed.length > 0) {
            message += `\n❌ Failed for ${failed.length} user(s):\n`;
            failed.forEach(r => {
                message += `• ${r.email}: ${r.result.error}\n`;
            });
        }
        
        alert(message);
        closeRequestForOthersModal();
        
        // Refresh data
        await loadRequests();
        updateDashboard();
        
        // Clear form
        document.getElementById('requestForOthersForm').reset();
        selectedEmails = [];
        renderEmailTags();
        otherCurrentAIPermissions = null;
        document.getElementById('otherAiPermissionsPreview').style.display = 'none';
        
    } catch (error) {
        console.error('Error submitting request:', error);
        alert('Error submitting request. Please try again.');
    }
}

function handleManualOnboard(e) {
    e.preventDefault();
    alert('Manual onboarding initiated');
    closeModal();
}

function handleAppRequest(e) {
    e.preventDefault();
    alert('Application access request submitted');
    closeModal();
}

function updateSpecificAppOptions() {
    const appType = document.getElementById('appType').value;
    const specificAppSelect = document.getElementById('specificApp');
    
    const appOptions = {
        cloud: [
            { value: 'aws', text: 'Amazon Web Services' },
            { value: 'azure', text: 'Microsoft Azure' },
            { value: 'gcp', text: 'Google Cloud Platform' }
        ],
        kubernetes: [
            { value: 'eks', text: 'Amazon EKS' },
            { value: 'aks', text: 'Azure AKS' },
            { value: 'gke', text: 'Google GKE' }
        ],
        database: [
            { value: 'mysql', text: 'MySQL' },
            { value: 'postgres', text: 'PostgreSQL' },
            { value: 'mongodb', text: 'MongoDB' },
            { value: 'rds', text: 'Amazon RDS' }
        ],
        application: [
            { value: 'jenkins', text: 'Jenkins' },
            { value: 'grafana', text: 'Grafana' },
            { value: 'sonar', text: 'SonarQube' }
        ],
        ticketing: [
            { value: 'jira', text: 'JIRA' },
            { value: 'splunk', text: 'Splunk' },
            { value: 'servicenow', text: 'ServiceNow' }
        ]
    };
    
    specificAppSelect.innerHTML = '<option value="">Select Application</option>';
    
    if (appOptions[appType]) {
        specificAppSelect.innerHTML += appOptions[appType]
            .map(app => `<option value="${app.value}">${app.text}</option>`)
            .join('');
    }
}

function exportAuditLog() {
    const auditData = requests.map(r => ({
        request_id: r.id,
        user_email: r.user_email,
        account_id: r.account_id,
        status: r.status,
        created_at: r.created_at,
        expires_at: r.expires_at,
        justification: r.justification
    }));
    
    const blob = new Blob([JSON.stringify(auditData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jit-audit-log-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function cleanupOldRequests() {
    if (!confirm('🧹 This will delete all requests older than 3 days with inactive status.\n\nContinue?')) {
        return;
    }
    
    fetch(`${API_BASE}/cleanup/old-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(result => {
        alert(`✅ ${result.message}`);
        loadRequests();
        updateDashboard();
        if (isAdmin) updateAdminDashboard();
    })
    .catch(error => {
        console.error('Error cleaning up requests:', error);
        alert('❌ Error cleaning up requests');
    });
}

function revokeAllExpired() {
    if (!confirm('⚠️ This will revoke ALL expired access grants immediately.\n\nContinue?')) {
        return;
    }
    
    fetch(`${API_BASE}/cleanup/expired`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(result => {
        alert(`✅ ${result.message}`);
        loadRequests();
        updateDashboard();
        if (isAdmin) updateAdminDashboard();
    })
    .catch(error => {
        console.error('Error revoking expired access:', error);
        alert('❌ Error revoking expired access');
    });
}

function refreshRequests() {
    location.reload();
}

// Request Dropdown Toggle
function toggleRequestDropdown() {
    const menu = document.getElementById('requestDropdownMenu');
    menu.classList.toggle('show');
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
    const dropdown = document.querySelector('.request-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        const menu = document.getElementById('requestDropdownMenu');
        if (menu) menu.classList.remove('show');
    }
});

// Utility Functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}
