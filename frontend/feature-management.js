// Feature Management and runtime UI gating
(function () {
    'use strict';

    const FEATURE_DEFAULTS = {
        cloud_access: true,
        aws_access: true,
        gcp_access: true,
        storage_access: true,
        s3_access: true,
        gcs_access: true,
        databases_access: true,
        databases_structured_access: true,
        workloads_access: true,
        instances_access: true,
        gcp_vms_access: true,
        terminal_access: true,
        database_terminal_access: true,
        vm_terminal_access: true,
        request_calendar: true,
        database_ai_assistant: true
    };

    const FEATURE_KEY_ALIASES = {
        cloud: 'cloud_access',
        cloud_access: 'cloud_access',
        aws: 'aws_access',
        aws_access: 'aws_access',
        gcp: 'gcp_access',
        gcp_access: 'gcp_access',
        storage: 'storage_access',
        storage_access: 'storage_access',
        s3: 's3_access',
        s3_access: 's3_access',
        gcs: 'gcs_access',
        gcs_access: 'gcs_access',
        database: 'databases_access',
        databases: 'databases_access',
        databases_access: 'databases_access',
        databases_structured: 'databases_structured_access',
        databases_structured_access: 'databases_structured_access',
        workload: 'workloads_access',
        workloads: 'workloads_access',
        workloads_access: 'workloads_access',
        instances: 'instances_access',
        instances_access: 'instances_access',
        gcp_vms: 'gcp_vms_access',
        gcp_vms_access: 'gcp_vms_access',
        terminal: 'terminal_access',
        terminal_access: 'terminal_access',
        database_terminal: 'database_terminal_access',
        database_terminal_access: 'database_terminal_access',
        vm_terminal: 'vm_terminal_access',
        vm_terminal_access: 'vm_terminal_access',
        calendar: 'request_calendar',
        request_calendar: 'request_calendar',
        requestable_calendar: 'request_calendar',
        requestable_for_access_calendar: 'request_calendar',
        database_ai: 'database_ai_assistant',
        ai: 'database_ai_assistant',
        database_ai_assistant: 'database_ai_assistant'
    };

    let currentFeatures = (function () {
        try {
            const raw = localStorage.getItem('npam_feature_flags');
            if (!raw) return Object.assign({}, FEATURE_DEFAULTS);
            const parsed = JSON.parse(raw);
            return normalizeFeatures(parsed, FEATURE_DEFAULTS);
        } catch (_) {
            return Object.assign({}, FEATURE_DEFAULTS);
        }
    })();
    let adminFeatureLoadInFlight = false;

    function getApiBases() {
        const bases = [];
        const pushBase = function (value) {
            const normalized = String(value || '').replace(/\/+$/, '');
            if (!normalized) return;
            if (bases.indexOf(normalized) === -1) bases.push(normalized);
        };
        const pushWithApiVariants = function (value) {
            const normalized = String(value || '').replace(/\/+$/, '');
            if (!normalized) return;
            if (normalized.endsWith('/api')) {
                pushBase(normalized);
                pushBase(normalized.slice(0, -4));
            } else {
                pushBase(normalized + '/api');
                pushBase(normalized);
            }
        };

        const originBase = window.location.origin || (window.location.protocol + '//' + window.location.hostname);
        // Prefer same-origin routes first; stale cross-origin API_BASE should not break feature toggles.
        pushBase(originBase + '/api');
        pushBase(originBase);
        pushBase((window.location.origin || (window.location.protocol + '//' + window.location.hostname)) + '/api');
        if (typeof window !== 'undefined' && window.API_BASE) {
            pushWithApiVariants(window.API_BASE);
        }
        pushBase(window.location.protocol + '//' + window.location.hostname + ':5000/api');
        return bases;
    }

    function withLeadingSlash(path) {
        const raw = String(path || '').trim();
        if (!raw) return '/';
        return raw.charAt(0) === '/' ? raw : ('/' + raw);
    }

    function joinBasePath(base, path) {
        const b = String(base || '').replace(/\/+$/, '');
        const p = withLeadingSlash(path);
        return b + p;
    }

    function candidateUrlsFor(path) {
        const p = withLeadingSlash(path);
        const urls = [];
        const pushUrl = function (value) {
            const normalized = String(value || '').trim();
            if (!normalized) return;
            if (urls.indexOf(normalized) === -1) urls.push(normalized);
        };

        // First attempt relative URLs to avoid CORS/network mismatch.
        pushUrl('/api' + p);
        pushUrl(p);
        getApiBases().forEach(function (base) {
            pushUrl(joinBasePath(base, p));
        });
        return urls;
    }

    function rememberWorkingApiBase(base) {
        const normalized = String(base || '').replace(/\/+$/, '');
        if (!normalized) return;
        window.API_BASE = normalized;
    }

    function canonicalFeatureKey(key) {
        const raw = String(key || '').trim().toLowerCase();
        if (!raw) return '';
        return FEATURE_KEY_ALIASES[raw] || raw;
    }

    function asBool(value, fallback) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return !!value;
        const raw = String(value == null ? '' : value).trim().toLowerCase();
        if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true;
        if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false;
        return !!fallback;
    }

    function normalizeFeatures(raw, base) {
        const out = Object.assign({}, base || FEATURE_DEFAULTS);
        if (!raw || typeof raw !== 'object') return out;
        Object.keys(raw).forEach(function (k) {
            const canonical = canonicalFeatureKey(k);
            if (Object.prototype.hasOwnProperty.call(FEATURE_DEFAULTS, canonical)) {
                out[canonical] = asBool(raw[k], out[canonical]);
            }
        });
        return out;
    }

    function setVisible(el, visible, displayType) {
        if (!el) return;
        if (visible) {
            if (displayType) {
                el.style.setProperty('display', displayType, 'important');
            } else {
                el.style.removeProperty('display');
            }
        } else {
            el.style.setProperty('display', 'none', 'important');
        }
    }

    function isFeatureEnabled(key) {
        const canonical = canonicalFeatureKey(key);
        if (!canonical || !Object.prototype.hasOwnProperty.call(FEATURE_DEFAULTS, canonical)) return true;
        return currentFeatures[canonical] !== false;
    }

    function isPageAllowedByFeatures(pageId) {
        const p = String(pageId || '').trim();
        if (!p) return true;
        const required = {
            aws: ['cloud_access', 'aws_access'],
            gcp: ['cloud_access', 'gcp_access'],
            accounts: ['cloud_access'],
            newRequest: ['cloud_access'],
            policy: ['cloud_access'],
            s3: ['storage_access', 's3_access'],
            gcs: ['storage_access', 'gcs_access'],
            databases: ['databases_access'],
            databaseTerminal: ['databases_access', 'terminal_access', 'database_terminal_access'],
            instances: ['workloads_access', 'instances_access'],
            gcpVms: ['workloads_access', 'gcp_vms_access'],
            vmTerminal: ['workloads_access', 'terminal_access', 'vm_terminal_access']
        };
        const needs = required[p];
        if (!needs || !needs.length) return true;
        return needs.every(isFeatureEnabled);
    }

    function syncFeatureToggleControls(flags) {
        const mapping = {
            featureCloudAccess: 'cloud_access',
            featureAwsAccess: 'aws_access',
            featureGcpAccess: 'gcp_access',
            featureStorageAccess: 'storage_access',
            featureS3Access: 's3_access',
            featureGcsAccess: 'gcs_access',
            featureDatabasesAccess: 'databases_access',
            featureDatabasesStructuredAccess: 'databases_structured_access',
            featureWorkloadsAccess: 'workloads_access',
            featureInstancesAccess: 'instances_access',
            featureGcpVmsAccess: 'gcp_vms_access',
            featureTerminalAccess: 'terminal_access',
            featureDatabaseTerminalAccess: 'database_terminal_access',
            featureVmTerminalAccess: 'vm_terminal_access',
            featureRequestCalendar: 'request_calendar',
            featureDatabaseAIAssistant: 'database_ai_assistant'
        };
        Object.keys(mapping).forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.checked = !!flags[mapping[id]];
        });
    }

    function syncFeatureToggleDependencies(flags) {
        const dependencies = {
            featureAwsAccess: ['cloud_access'],
            featureGcpAccess: ['cloud_access'],
            featureS3Access: ['storage_access'],
            featureGcsAccess: ['storage_access'],
            featureDatabasesStructuredAccess: ['databases_access'],
            featureDatabaseAIAssistant: ['databases_access'],
            featureInstancesAccess: ['workloads_access'],
            featureGcpVmsAccess: ['workloads_access'],
            featureDatabaseTerminalAccess: ['databases_access', 'terminal_access'],
            featureVmTerminalAccess: ['workloads_access', 'terminal_access']
        };

        Object.keys(dependencies).forEach(function (id) {
            const el = document.getElementById(id);
            if (!el) return;
            const req = dependencies[id];
            const enabled = req.every(function (k) { return !!flags[k]; });
            el.disabled = !enabled;
            const row = el.closest('.feature-child-item');
            if (row) row.classList.toggle('disabled', !enabled);
        });
    }

    function updateFeatureCardStatus(flags) {
        const statusMap = [
            { key: 'cloud_access', badgeId: 'featureCloudStatusBadge', textId: 'featureCloudStatusText' },
            { key: 'storage_access', badgeId: 'featureStorageStatusBadge', textId: 'featureStorageStatusText' },
            { key: 'databases_access', badgeId: 'featureDatabasesStatusBadge', textId: 'featureDatabasesStatusText' },
            { key: 'workloads_access', badgeId: 'featureWorkloadsStatusBadge', textId: 'featureWorkloadsStatusText' },
            { key: 'terminal_access', badgeId: 'featureTerminalStatusBadge', textId: 'featureTerminalStatusText' },
            { key: 'request_calendar', badgeId: 'featureCalendarStatusBadge', textId: 'featureCalendarStatusText' },
            { key: 'database_ai_assistant', badgeId: 'featureDbAiStatusBadge', textId: 'featureDbAiStatusText' }
        ];

        statusMap.forEach(function (entry) {
            const enabled = !!flags[entry.key];
            const badge = document.getElementById(entry.badgeId);
            const text = document.getElementById(entry.textId);
            if (badge) {
                badge.className = enabled ? 'badge badge-success' : 'badge badge-warning';
                badge.textContent = enabled ? 'Enabled' : 'Disabled';
            }
            if (text) {
                text.textContent = enabled ? 'Visible to users' : 'Hidden from users';
            }
        });
    }

    function applySidebarGating(flags) {
        const cloudParent = !!flags.cloud_access;
        const awsEnabled = cloudParent && !!flags.aws_access;
        const gcpEnabled = cloudParent && !!flags.gcp_access;

        const storageParent = !!flags.storage_access;
        const s3Enabled = storageParent && !!flags.s3_access;
        const gcsEnabled = storageParent && !!flags.gcs_access;

        const workloadsParent = !!flags.workloads_access;
        const instancesEnabled = workloadsParent && !!flags.instances_access;
        const gcpVmsEnabled = workloadsParent && !!flags.gcp_vms_access;

        const dbParent = !!flags.databases_access;
        const dbStructuredEnabled = dbParent && !!flags.databases_structured_access;

        const terminalParent = !!flags.terminal_access;
        const showDbTerminal = terminalParent && dbParent && !!flags.database_terminal_access;
        const showVmTerminal = terminalParent && workloadsParent && !!flags.vm_terminal_access;

        setVisible(document.getElementById('navCategoryCloudAccess'), awsEnabled || gcpEnabled, 'block');
        setVisible(document.getElementById('navItemAws'), awsEnabled, 'flex');
        setVisible(document.getElementById('navItemGcp'), gcpEnabled, 'flex');

        setVisible(document.getElementById('navCategoryStorageAccess'), s3Enabled || gcsEnabled, 'block');
        setVisible(document.getElementById('navItemS3'), s3Enabled, 'flex');
        setVisible(document.getElementById('navItemGcs'), gcsEnabled, 'flex');

        setVisible(document.getElementById('navCategoryWorkloadsAccess'), instancesEnabled || gcpVmsEnabled, 'block');
        setVisible(document.getElementById('navItemInstances'), instancesEnabled, 'flex');
        setVisible(document.getElementById('navItemGcpVms'), gcpVmsEnabled, 'flex');

        setVisible(document.getElementById('navCategoryDatabasesAccess'), dbParent, 'block');
        setVisible(document.getElementById('navItemDatabases'), false, 'flex');
        setVisible(document.getElementById('navItemDatabasesStructured'), dbStructuredEnabled, 'flex');

        setVisible(document.getElementById('navItemDatabaseTerminal'), showDbTerminal, 'flex');
        setVisible(document.getElementById('navItemVmTerminal'), showVmTerminal, 'flex');
        setVisible(document.getElementById('navCategoryTerminalAccess'), showDbTerminal || showVmTerminal, 'block');
    }

    function applyRequestsGating(flags) {
        const cloudVisible = !!flags.cloud_access && (!!flags.aws_access || !!flags.gcp_access);
        const storageVisible = !!flags.storage_access && (!!flags.s3_access || !!flags.gcs_access);
        const workloadsVisible = !!flags.workloads_access && (!!flags.instances_access || !!flags.gcp_vms_access);

        setVisible(document.getElementById('requestsCloudCard'), cloudVisible, 'block');
        setVisible(document.getElementById('requestsStorageCard'), storageVisible, 'block');
        setVisible(document.getElementById('requestsDatabasesCard'), !!flags.databases_access, 'block');
        setVisible(document.getElementById('requestsWorkloadsCard'), workloadsVisible, 'block');

        if (typeof currentRequestsCategory !== 'undefined') {
            const categoryEnabled = {
                cloud: cloudVisible,
                storage: storageVisible,
                databases: !!flags.databases_access,
                workloads: workloadsVisible
            };
            if (categoryEnabled[currentRequestsCategory] === false) {
                const fallbackCategory = categoryEnabled.cloud ? 'cloud'
                    : categoryEnabled.databases ? 'databases'
                    : categoryEnabled.storage ? 'storage'
                    : categoryEnabled.workloads ? 'workloads'
                    : 'cloud';
                if (typeof filterRequestsByCategory === 'function') {
                    filterRequestsByCategory(fallbackCategory, fallbackCategory === 'databases' ? 'active' : 'pending');
                }
            }
        }
    }

    function applyFeatureOptionGating(flags) {
        const cloudParent = !!flags.cloud_access;
        const awsEnabled = cloudParent && !!flags.aws_access;
        const gcpEnabled = cloudParent && !!flags.gcp_access;

        setVisible(document.getElementById('requestStepCloudAwsOption'), awsEnabled, 'block');
        setVisible(document.getElementById('requestStepCloudGcpOption'), gcpEnabled, 'block');
        setVisible(document.getElementById('accountsAwsProviderCard'), awsEnabled, 'block');
        setVisible(document.getElementById('accountsGcpProviderCard'), gcpEnabled, 'block');
    }

    function applyRuntimePageGuard() {
        const activePage = document.querySelector('.page.active');
        if (!activePage) return;
        const pageId = String(activePage.id || '').replace(/Page$/, '');
        if (!pageId || isPageAllowedByFeatures(pageId)) return;
        if (typeof showPage === 'function') {
            showPage('requests');
        }
    }

    function applyDatabasePageFeatureFlags(flags) {
        if (typeof window.applyDatabaseFeatureFlags === 'function') {
            try {
                window.applyDatabaseFeatureFlags(flags);
            } catch (e) {
                console.warn('Failed to apply database feature flags', e);
            }
        }
    }

    function publishFeatureUpdate(flags) {
        try {
            document.dispatchEvent(new CustomEvent('npam-features-updated', { detail: { features: Object.assign({}, flags) } }));
        } catch (_) {}
    }

    function applyFeatureVisibility(flags, options) {
        const opts = options || {};
        const normalized = normalizeFeatures(flags, currentFeatures);
        currentFeatures = normalized;
        try {
            localStorage.setItem('npam_feature_flags', JSON.stringify(normalized));
        } catch (_) {}
        if (opts.syncControls !== false) syncFeatureToggleControls(normalized);
        syncFeatureToggleDependencies(normalized);
        updateFeatureCardStatus(normalized);
        applySidebarGating(normalized);
        applyRequestsGating(normalized);
        applyFeatureOptionGating(normalized);
        applyDatabasePageFeatureFlags(normalized);
        applyRuntimePageGuard();
        publishFeatureUpdate(normalized);
        return Object.assign({}, normalized);
    }

    function rememberApiBaseFromUrl(url) {
        const raw = String(url || '');
        if (!raw) return;
        const originBase = window.location.origin || (window.location.protocol + '//' + window.location.hostname);
        if (raw.startsWith('/')) {
            rememberWorkingApiBase(originBase + '/api');
            return;
        }
        try {
            const u = new URL(raw);
            if (/\/api(?:\/|$)/.test(u.pathname)) {
                const idx = u.pathname.indexOf('/api');
                rememberWorkingApiBase(u.origin + u.pathname.slice(0, idx + 4));
            } else {
                rememberWorkingApiBase(u.origin + '/api');
            }
        } catch (_) {
            // Ignore malformed URL.
        }
    }

    async function fetchFeatures(path) {
        const candidates = candidateUrlsFor(path);
        let lastError = null;
        for (const url of candidates) {
            try {
                const res = await fetch(url, { credentials: 'include' });
                const text = await res.text();
                let data = {};
                try { data = text ? JSON.parse(text) : {}; } catch (_) { data = {}; }
                if (!res.ok) {
                    const msg = data && data.error ? data.error : ('Request failed (' + res.status + ')');
                    if (res.status === 404 || res.status === 405) {
                        lastError = new Error(msg);
                        continue;
                    }
                    throw new Error(msg);
                }
                rememberApiBaseFromUrl(url);
                return data || {};
            } catch (e) {
                lastError = e;
            }
        }
        throw (lastError || new Error('Backend unavailable'));
    }

    async function refreshFeaturesFromServer() {
        try {
            const data = await fetchFeatures('/features');
            const payload = normalizeFeatures(data.features || data, FEATURE_DEFAULTS);
            applyFeatureVisibility(payload);
            return Object.assign({}, currentFeatures);
        } catch (e) {
            console.warn('Using local/default feature flags:', e.message || e);
            applyFeatureVisibility(currentFeatures);
            return Object.assign({}, currentFeatures);
        }
    }

    async function loadFeatureToggles() {
        if (adminFeatureLoadInFlight) return;
        adminFeatureLoadInFlight = true;
        try {
            const data = await fetchFeatures('/admin/features');
            const payload = normalizeFeatures(data.features || data, FEATURE_DEFAULTS);
            applyFeatureVisibility(payload);
        } catch (e) {
            // Non-admin users are expected to hit 403 for admin endpoint.
            await refreshFeaturesFromServer();
        } finally {
            adminFeatureLoadInFlight = false;
        }
    }

    async function postJson(path, body) {
        const candidates = candidateUrlsFor(path);
        let sawNotFound = false;
        let last = { ok: false, status: 0, data: { error: 'Backend unavailable' }, sawNotFound: false };
        for (const url of candidates) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(body || {})
                });
                const text = await res.text();
                let data = {};
                try { data = text ? JSON.parse(text) : {}; } catch (_) { data = {}; }
                const out = { ok: res.ok, status: res.status, data: data, sawNotFound: sawNotFound };
                if (res.ok) {
                    rememberApiBaseFromUrl(url);
                    return out;
                }
                if (res.status === 404 || res.status === 405) {
                    sawNotFound = true;
                    last = { ok: false, status: res.status, data: data, sawNotFound: true };
                    continue;
                }
                return out;
            } catch (e) {
                last = { ok: false, status: 0, data: { error: e.message || 'Request failed' }, sawNotFound: sawNotFound };
            }
        }
        last.sawNotFound = last.sawNotFound || sawNotFound;
        return last;
    }

    async function saveFeaturePatchLegacy(patch) {
        const merged = Object.assign({}, currentFeatures);
        const entries = Object.entries(patch || {});
        for (const entry of entries) {
            const key = entry[0];
            const value = !!entry[1];
            const result = await postJson('/admin/toggle-feature', {
                feature: key,
                enabled: value
            });
            if (!result.ok || (result.data && result.data.error)) {
                throw new Error((result.data && result.data.error) || ('Request failed (' + result.status + ')'));
            }
            if (result.data && typeof result.data.features === 'object') {
                Object.assign(merged, normalizeFeatures(result.data.features, merged));
            } else {
                merged[key] = value;
            }
        }
        return normalizeFeatures(merged, currentFeatures);
    }

    async function saveFeaturePatch(patch) {
        const result = await postJson('/admin/features', { features: patch || {} });
        if (result.ok && !(result.data && result.data.error)) {
            return normalizeFeatures((result.data && result.data.features) || patch || {}, currentFeatures);
        }

        // Backward compatibility: older backend may only expose /api/admin/toggle-feature.
        if (result.status === 404 || result.status === 405 || !!result.sawNotFound) {
            return saveFeaturePatchLegacy(patch);
        }

        throw new Error((result.data && result.data.error) || ('Request failed (' + result.status + ')'));
    }

    async function toggleFeature(featureKey, enabled) {
        const canonical = canonicalFeatureKey(featureKey);
        if (!canonical || !Object.prototype.hasOwnProperty.call(FEATURE_DEFAULTS, canonical)) {
            alert('Unknown feature key: ' + featureKey);
            return;
        }
        const before = Object.assign({}, currentFeatures);
        const patch = {};
        patch[canonical] = !!enabled;

        applyFeatureVisibility(patch, { syncControls: true });
        try {
            const saved = await saveFeaturePatch(patch);
            applyFeatureVisibility(saved, { syncControls: true });
        } catch (e) {
            applyFeatureVisibility(before, { syncControls: true });
            alert('Failed to update feature: ' + (e.message || 'Unknown error'));
        }
    }

    window.toggleFeature = toggleFeature;
    window.loadFeatureToggles = loadFeatureToggles;
    window.refreshFeaturesFromServer = refreshFeaturesFromServer;
    window.applyFeatureVisibility = applyFeatureVisibility;
    window.isFeatureEnabled = isFeatureEnabled;
    window.isPageAllowedByFeatures = isPageAllowedByFeatures;
    window.getCurrentFeatures = function () { return Object.assign({}, currentFeatures); };

    document.addEventListener('DOMContentLoaded', function () {
        refreshFeaturesFromServer();
    });
})();
