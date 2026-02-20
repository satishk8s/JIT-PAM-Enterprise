// Feature Management and runtime UI gating
(function () {
    'use strict';

    const FEATURE_DEFAULTS = {
        cloud_access: true,
        storage_access: true,
        databases_access: true,
        workloads_access: true,
        terminal_access: true,
        request_calendar: true,
        database_ai_assistant: true
    };

    const FEATURE_KEY_ALIASES = {
        cloud: 'cloud_access',
        cloud_access: 'cloud_access',
        storage: 'storage_access',
        storage_access: 'storage_access',
        database: 'databases_access',
        databases: 'databases_access',
        databases_access: 'databases_access',
        workload: 'workloads_access',
        workloads: 'workloads_access',
        workloads_access: 'workloads_access',
        terminal: 'terminal_access',
        terminal_access: 'terminal_access',
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

    function getApiBase() {
        if (typeof window !== 'undefined' && window.API_BASE) {
            return String(window.API_BASE).replace(/\/+$/, '');
        }
        if (!window.location.port || window.location.port === '80' || window.location.port === '443') {
            return (window.location.origin || (window.location.protocol + '//' + window.location.hostname)) + '/api';
        }
        return window.location.protocol + '//' + window.location.hostname + ':5000/api';
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
            el.style.removeProperty('display');
            if (displayType) {
                el.style.display = displayType;
            }
        } else {
            el.style.display = 'none';
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
            aws: ['cloud_access'],
            gcp: ['cloud_access'],
            accounts: ['cloud_access'],
            newRequest: ['cloud_access'],
            policy: ['cloud_access'],
            s3: ['storage_access'],
            gcs: ['storage_access'],
            databases: ['databases_access'],
            databaseTerminal: ['databases_access', 'terminal_access'],
            instances: ['workloads_access'],
            gcpVms: ['workloads_access'],
            vmTerminal: ['workloads_access', 'terminal_access']
        };
        const needs = required[p];
        if (!needs || !needs.length) return true;
        return needs.every(isFeatureEnabled);
    }

    function syncFeatureToggleControls(flags) {
        const mapping = {
            featureCloudAccess: 'cloud_access',
            featureStorageAccess: 'storage_access',
            featureDatabasesAccess: 'databases_access',
            featureWorkloadsAccess: 'workloads_access',
            featureTerminalAccess: 'terminal_access',
            featureRequestCalendar: 'request_calendar',
            featureDatabaseAIAssistant: 'database_ai_assistant'
        };
        Object.keys(mapping).forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.checked = !!flags[mapping[id]];
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
        const cloudEnabled = !!flags.cloud_access;
        const storageEnabled = !!flags.storage_access;
        const dbEnabled = !!flags.databases_access;
        const workloadsEnabled = !!flags.workloads_access;
        const terminalEnabled = !!flags.terminal_access;

        setVisible(document.getElementById('navCategoryCloudAccess'), cloudEnabled, 'block');
        setVisible(document.getElementById('navItemAws'), cloudEnabled, 'flex');
        setVisible(document.getElementById('navItemGcp'), cloudEnabled, 'flex');

        setVisible(document.getElementById('navCategoryStorageAccess'), storageEnabled, 'block');
        setVisible(document.getElementById('navItemS3'), storageEnabled, 'flex');
        setVisible(document.getElementById('navItemGcs'), storageEnabled, 'flex');

        setVisible(document.getElementById('navCategoryWorkloadsAccess'), workloadsEnabled, 'block');
        setVisible(document.getElementById('navItemInstances'), workloadsEnabled, 'flex');
        setVisible(document.getElementById('navItemGcpVms'), workloadsEnabled, 'flex');

        setVisible(document.getElementById('navCategoryDatabasesAccess'), dbEnabled, 'block');
        setVisible(document.getElementById('navItemDatabases'), dbEnabled, 'flex');
        setVisible(document.getElementById('navItemDatabasesStructured'), dbEnabled, 'flex');

        const showDbTerminal = terminalEnabled && dbEnabled;
        const showVmTerminal = terminalEnabled && workloadsEnabled;
        setVisible(document.getElementById('navItemDatabaseTerminal'), showDbTerminal, 'flex');
        setVisible(document.getElementById('navItemVmTerminal'), showVmTerminal, 'flex');
        setVisible(document.getElementById('navCategoryTerminalAccess'), showDbTerminal || showVmTerminal, 'block');
    }

    function applyRequestsGating(flags) {
        setVisible(document.getElementById('requestsCloudCard'), !!flags.cloud_access, 'block');
        setVisible(document.getElementById('requestsStorageCard'), !!flags.storage_access, 'block');
        setVisible(document.getElementById('requestsDatabasesCard'), !!flags.databases_access, 'block');
        setVisible(document.getElementById('requestsWorkloadsCard'), !!flags.workloads_access, 'block');

        if (typeof currentRequestsCategory !== 'undefined') {
            const categoryToFeature = {
                cloud: 'cloud_access',
                storage: 'storage_access',
                databases: 'databases_access',
                workloads: 'workloads_access'
            };
            const feature = categoryToFeature[currentRequestsCategory];
            if (feature && !isFeatureEnabled(feature)) {
                const fallbackCategory = isFeatureEnabled('cloud_access') ? 'cloud'
                    : isFeatureEnabled('databases_access') ? 'databases'
                    : isFeatureEnabled('storage_access') ? 'storage'
                    : isFeatureEnabled('workloads_access') ? 'workloads'
                    : 'cloud';
                if (typeof filterRequestsByCategory === 'function') {
                    filterRequestsByCategory(fallbackCategory, fallbackCategory === 'databases' ? 'active' : 'pending');
                }
            }
        }
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
        updateFeatureCardStatus(normalized);
        applySidebarGating(normalized);
        applyRequestsGating(normalized);
        applyDatabasePageFeatureFlags(normalized);
        applyRuntimePageGuard();
        publishFeatureUpdate(normalized);
        return Object.assign({}, normalized);
    }

    async function fetchFeatures(path) {
        const apiBase = getApiBase();
        const res = await fetch(apiBase + path, { credentials: 'include' });
        const text = await res.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (_) { data = {}; }
        if (!res.ok) {
            const msg = data && data.error ? data.error : ('Request failed (' + res.status + ')');
            throw new Error(msg);
        }
        return data || {};
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
        const apiBase = getApiBase();
        const res = await fetch(apiBase + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body || {})
        });
        const text = await res.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (_) { data = {}; }
        return { ok: res.ok, status: res.status, data: data };
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
        if (result.status === 404 || result.status === 405) {
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
