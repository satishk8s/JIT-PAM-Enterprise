(function() {
    const state = {
        loading: false,
        search: '',
        summary: {},
        accounts: [],
        databases: [],
        findings: [],
        scanStatus: {},
        lastLoadedAt: '',
        errors: [],
    };

    function dgEscape(value) {
        if (value == null) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function dgFormatDate(value) {
        const raw = String(value || '').trim();
        if (!raw) return '—';
        if (typeof window.formatDateTimeIst === 'function') {
            try {
                return window.formatDateTimeIst(raw);
            } catch (_) {}
        }
        try {
            return new Date(raw).toLocaleString();
        } catch (_) {
            return raw;
        }
    }

    function dgSeverityBadge(severity) {
        const key = String(severity || '').trim().toLowerCase();
        if (key === 'critical') return 'badge badge-danger';
        if (key === 'high') return 'badge badge-danger';
        if (key === 'medium' || key === 'warning') return 'badge badge-warning';
        if (key === 'low') return 'badge badge-info';
        if (key === 'success' || key === 'ok') return 'badge badge-success';
        return 'badge badge-info';
    }

    function dgRiskFlagsHtml(flags) {
        const rows = Array.isArray(flags) ? flags : [];
        if (!rows.length) return '<span class="badge badge-success">No red flags</span>';
        return rows.map(function(item) {
            const severity = String(item && item.severity || 'info').trim().toLowerCase();
            return '<span class="' + dgSeverityBadge(severity) + '">' + dgEscape(item && item.label || severity) + '</span>';
        }).join(' ');
    }

    function dgMatches(item) {
        const q = String(state.search || '').trim().toLowerCase();
        if (!q) return true;
        const hay = JSON.stringify(item || {}).toLowerCase();
        return hay.indexOf(q) >= 0;
    }

    function setBanner(message, type) {
        const el = document.getElementById('dbGovernanceStatusBanner');
        if (!el) return;
        const text = String(message || '').trim();
        if (!text) {
            el.style.display = 'none';
            el.textContent = '';
            el.className = 'profile-status';
            return;
        }
        el.style.display = 'block';
        el.textContent = text;
        el.className = 'profile-status' + (type ? (' profile-status-' + type) : '');
    }

    function renderSummary() {
        const el = document.getElementById('dbGovernanceSummaryCards');
        if (!el) return;
        const summary = state.summary || {};
        const scan = state.scanStatus || {};
        const cards = [
            { label: 'Accounts', value: summary.accounts_total || 0, note: 'Governed cloud accounts' },
            { label: 'Databases', value: summary.databases_total || 0, note: 'Inventory records' },
            { label: 'Findings', value: summary.findings_total || 0, note: 'All open findings' },
            { label: 'Critical', value: summary.critical_findings || 0, note: 'Critical exposure count' },
            { label: 'High', value: summary.high_findings || 0, note: 'High severity count' },
            { label: 'Scans', value: scan.status || summary.scans_running || 'unknown', note: scan.message || 'DB Governance scan status' },
        ];
        el.innerHTML = cards.map(function(card) {
            return '' +
                '<div class="profile-summary-card db-governance-summary-card">' +
                    '<span class="profile-label">' + dgEscape(card.label) + '</span>' +
                    '<strong>' + dgEscape(card.value) + '</strong>' +
                    '<div class="db-governance-card-note">' + dgEscape(card.note) + '</div>' +
                '</div>';
        }).join('');
    }

    function renderScanStatus() {
        const el = document.getElementById('dbGovernanceScanStatusPanel');
        if (!el) return;
        const scan = state.scanStatus || {};
        const runningBadge = scan.running ? '<span class="badge badge-warning">Running</span>' : '<span class="badge badge-info">Idle</span>';
        el.innerHTML = '' +
            '<div class="db-governance-scan-grid">' +
                '<div><span class="profile-label">Status</span><strong>' + dgEscape(scan.status || 'unknown') + '</strong></div>' +
                '<div><span class="profile-label">Running</span><strong>' + runningBadge + '</strong></div>' +
                '<div><span class="profile-label">Last Scan</span><strong>' + dgEscape(dgFormatDate(scan.last_scan_at)) + '</strong></div>' +
                '<div><span class="profile-label">Next Scan</span><strong>' + dgEscape(dgFormatDate(scan.next_scan_at)) + '</strong></div>' +
            '</div>' +
            '<p class="admin-role-hint" style="margin: 12px 0 0 0;">' + dgEscape(scan.message || scan.nightly_skip_rule || 'No scan detail available yet.') + '</p>';
    }

    function renderAccounts() {
        const el = document.getElementById('dbGovernanceAccountsBody');
        if (!el) return;
        const rows = state.accounts.filter(dgMatches);
        if (!rows.length) {
            el.innerHTML = '<tr><td colspan="7" class="text-muted">No account rows available.</td></tr>';
            return;
        }
        el.innerHTML = rows.map(function(item) {
            return '' +
                '<tr>' +
                    '<td><strong>' + dgEscape(item.account_name || item.account_id || '—') + '</strong><div class="text-muted">' + dgEscape(item.account_id || '—') + '</div></td>' +
                    '<td>' + dgEscape(item.environment || '—') + '</td>' +
                    '<td>' + dgEscape(item.databases_total || 0) + '</td>' +
                    '<td>' + dgEscape(item.findings_total || 0) + '</td>' +
                    '<td><span class="' + dgSeverityBadge('critical') + '">' + dgEscape(item.critical_findings || 0) + '</span></td>' +
                    '<td><span class="' + dgSeverityBadge('high') + '">' + dgEscape(item.high_findings || 0) + '</span></td>' +
                    '<td>' + dgEscape(dgFormatDate(item.last_scan_at)) + '</td>' +
                '</tr>';
        }).join('');
    }

    function renderDatabases() {
        const el = document.getElementById('dbGovernanceDatabasesBody');
        if (!el) return;
        const rows = state.databases.filter(dgMatches);
        if (!rows.length) {
            el.innerHTML = '<tr><td colspan="8" class="text-muted">No database rows available.</td></tr>';
            return;
        }
        el.innerHTML = rows.map(function(item) {
            const statusBadge = item.status && String(item.status).toLowerCase() === 'available'
                ? '<span class="badge badge-success">' + dgEscape(item.status) + '</span>'
                : '<span class="badge badge-info">' + dgEscape(item.status || 'unknown') + '</span>';
            const scanBadge = item.scan_status && String(item.scan_status).toLowerCase() === 'healthy'
                ? '<span class="badge badge-success">' + dgEscape(item.scan_status) + '</span>'
                : '<span class="badge badge-warning">' + dgEscape(item.scan_status || 'unknown') + '</span>';
            return '' +
                '<tr>' +
                    '<td><strong>' + dgEscape(item.database_name || item.database_id || '—') + '</strong><div class="text-muted">' + dgEscape(item.region || '') + ' ' + dgEscape(item.resource_kind || '') + '</div></td>' +
                    '<td>' + dgEscape(item.account_name || item.account_id || '—') + '</td>' +
                    '<td>' + dgEscape(item.environment || '—') + '</td>' +
                    '<td>' + dgEscape(item.engine || '—') + '</td>' +
                    '<td>' + statusBadge + '</td>' +
                    '<td>' + scanBadge + '</td>' +
                    '<td><div class="db-governance-flag-row">' + dgRiskFlagsHtml(item.risk_flags) + '</div></td>' +
                    '<td>' + dgEscape(item.nightly_scan_note || '—') + '</td>' +
                '</tr>';
        }).join('');
    }

    function renderFindings() {
        const el = document.getElementById('dbGovernanceFindingsBody');
        if (!el) return;
        const rows = state.findings.filter(dgMatches);
        if (!rows.length) {
            el.innerHTML = '<tr><td colspan="7" class="text-muted">No findings available.</td></tr>';
            return;
        }
        el.innerHTML = rows.map(function(item) {
            return '' +
                '<tr>' +
                    '<td><span class="' + dgSeverityBadge(item.severity) + '">' + dgEscape(item.severity || 'info') + '</span></td>' +
                    '<td><strong>' + dgEscape(item.title || '—') + '</strong><div class="text-muted">' + dgEscape(item.category || '') + '</div></td>' +
                    '<td>' + dgEscape(item.database_name || item.database_id || '—') + '</td>' +
                    '<td>' + dgEscape(item.account_id || '—') + '</td>' +
                    '<td>' + dgEscape(item.status || 'open') + '</td>' +
                    '<td>' + dgEscape(dgFormatDate(item.detected_at)) + '</td>' +
                    '<td>' + dgEscape(item.recommended_action || item.message || '—') + '</td>' +
                '</tr>';
        }).join('');
    }

    function renderAll() {
        renderSummary();
        renderScanStatus();
        renderAccounts();
        renderDatabases();
        renderFindings();
    }

    async function loadDbGovernanceAdmin(forceRefresh) {
        if (state.loading && !forceRefresh) return;
        state.loading = true;
        setBanner('Loading DB Governance data from PAM backend...', 'info');
        renderAll();
        const calls = await Promise.allSettled([
            window.apiJson('/admin/db-governance/summary'),
            window.apiJson('/admin/db-governance/accounts'),
            window.apiJson('/admin/db-governance/databases'),
            window.apiJson('/admin/db-governance/findings'),
            window.apiJson('/admin/db-governance/scan-status'),
        ]);
        state.errors = [];
        const [summaryRes, accountsRes, databasesRes, findingsRes, scanRes] = calls;
        state.summary = summaryRes.status === 'fulfilled' ? (summaryRes.value.summary || {}) : {};
        state.accounts = accountsRes.status === 'fulfilled' ? (accountsRes.value.accounts || []) : [];
        state.databases = databasesRes.status === 'fulfilled' ? (databasesRes.value.databases || []) : [];
        state.findings = findingsRes.status === 'fulfilled' ? (findingsRes.value.findings || []) : [];
        state.scanStatus = scanRes.status === 'fulfilled' ? (scanRes.value.scan_status || {}) : {};
        calls.forEach(function(result) {
            if (result.status === 'rejected' && result.reason) {
                state.errors.push(String(result.reason.message || result.reason));
            }
        });
        state.lastLoadedAt = new Date().toISOString();
        state.loading = false;
        if (state.errors.length) {
            setBanner('DB Governance loaded partially. ' + state.errors[0], 'warning');
        } else {
            setBanner('DB Governance data refreshed successfully.', 'success');
        }
        renderAll();
    }

    function refreshDbGovernanceAdmin() {
        loadDbGovernanceAdmin(true);
    }

    function handleDbGovernanceSearchInput(value) {
        state.search = String(value || '').trim();
        renderAll();
    }

    window.loadDbGovernanceAdmin = loadDbGovernanceAdmin;
    window.refreshDbGovernanceAdmin = refreshDbGovernanceAdmin;
    window.handleDbGovernanceSearchInput = handleDbGovernanceSearchInput;
})();
