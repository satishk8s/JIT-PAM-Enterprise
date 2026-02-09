/**
 * Terminal Page - Multi-tab DB + VM Connections
 * Supports 3+ simultaneous database connections in tabs.
 */

const TERMINAL_API_BASE = (typeof DB_API_BASE !== 'undefined') ? DB_API_BASE : ((typeof API_BASE !== 'undefined') ? API_BASE.replace('/api', '') : (window.location.port === '80' || window.location.port === '443' || window.location.port === '' ? window.location.origin : `${window.location.protocol}//${window.location.hostname}:5000`));

window.terminalTabs = []; // { id, conn, tabEl, contentEl, outputEl, inputEl }
let terminalTabCounter = 0;

function toggleTerminalCategory(type) {
    const list = document.getElementById(`${type}ConnectionsList`);
    const category = list?.closest('.terminal-category');
    const header = category?.querySelector('.terminal-category-header');
    if (category && header) {
        category.classList.toggle('open');
        header.classList.toggle('open');
    }
}

async function refreshTerminalPage() {
    await Promise.all([loadTerminalDbConnections(), loadTerminalVmConnections()]);
}

async function loadTerminalDbConnections() {
    const emptyState = document.getElementById('dbEmptyState');
    const listItems = document.getElementById('dbListItems');
    if (!emptyState || !listItems) return;
    const userEmail = localStorage.getItem('userEmail') || 'satish.korra@nykaa.com';
    const url = `${TERMINAL_API_BASE}/api/databases/approved?user_email=${encodeURIComponent(userEmail)}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        const dbs = data.databases || [];
        if (!dbs.length) {
            emptyState.style.display = 'block';
            listItems.style.display = 'none';
            listItems.innerHTML = '';
            return;
        }
        emptyState.style.display = 'none';
        listItems.style.display = 'block';
        const roleLabel = r => ({ read_only: 'Read-only', read_limited_write: 'Limited Write', read_full_write: 'Full Write', admin: 'Admin' })[r || 'read_only'] || (r || 'Read-only');
        listItems.innerHTML = dbs.map(db => {
            const reqId = (db.request_id || '').replace(/'/g, "\\'");
            const dbName = (db.db_name || db.engine || 'default').replace(/'/g, "\\'");
            return `<div class="terminal-connection-card">
                <div class="conn-icon"><i class="fas fa-database"></i></div>
                <div class="conn-info">
                    <div class="conn-name">${db.engine || 'MySQL'} - ${db.db_name || 'default'}</div>
                    <div class="conn-detail">${db.host}:${db.port} • ${roleLabel(db.role)}</div>
                </div>
                <button class="conn-action" onclick="connectTerminalDb('${db.host}', '${db.port}', '${db.engine}', '${reqId}', '${dbName}')">
                    Connect
                </button>
            </div>`;
        }).join('');
    } catch (e) {
        emptyState.style.display = 'block';
        listItems.style.display = 'none';
        emptyState.innerHTML = '<p>Error loading</p><small>' + (e.message || '') + '</small>';
    }
}

async function loadTerminalVmConnections() {
    const emptyState = document.getElementById('vmEmptyState');
    const listItems = document.getElementById('vmListItems');
    if (!emptyState || !listItems) return;
    try {
        const userEmail = localStorage.getItem('userEmail') || 'satish.korra@nykaa.com';
        const res = await fetch(`${TERMINAL_API_BASE}/api/instances/approved?user_email=${encodeURIComponent(userEmail)}`);
        const data = await res.json();
        const instances = data.instances || [];
        if (!instances.length) {
            emptyState.style.display = 'block';
            listItems.style.display = 'none';
            listItems.innerHTML = '';
            return;
        }
        emptyState.style.display = 'none';
        listItems.style.display = 'block';
        listItems.innerHTML = instances.map(inst => {
            const name = (inst.instance_name || inst.instance_id || '').replace(/'/g, "\\'");
            const ip = (inst.public_ip || inst.private_ip || 'N/A').replace(/'/g, "\\'");
            return `<div class="terminal-connection-card">
                <div class="conn-icon"><i class="fab fa-aws"></i></div>
                <div class="conn-info">
                    <div class="conn-name">${inst.instance_name || inst.instance_id}</div>
                    <div class="conn-detail">${inst.private_ip || inst.public_ip || 'N/A'}</div>
                </div>
                <button class="conn-action" onclick="connectTerminalVm('${inst.instance_id}', '${name}', '${ip}')">
                    Connect
                </button>
            </div>`;
        }).join('');
    } catch (e) {
        emptyState.style.display = 'block';
        listItems.style.display = 'none';
        emptyState.innerHTML = '<p>Error loading</p><small>' + (e.message || '') + '</small>';
    }
}

function connectTerminalDb(host, port, engine, requestId, dbName) {
    const placeholder = document.getElementById('terminalPlaceholder');
    const active = document.getElementById('terminalActive');
    const tabsBar = document.getElementById('terminalTabsBar');
    const tabsContent = document.getElementById('terminalTabsContent');
    if (!placeholder || !active || !tabsBar || !tabsContent) return;

    placeholder.style.display = 'none';
    active.style.display = 'flex';
    active.style.flexDirection = 'column';
    active.style.flex = '1';

    const id = 'term-tab-' + (++terminalTabCounter);
    const conn = { type: 'db', dbName, host, port, engine, requestId };
    const tabLabel = `${engine} @ ${dbName}`;

    const tabBtn = document.createElement('div');
    tabBtn.className = 'terminal-tab active';
    tabBtn.id = id + '-tab';
    tabBtn.innerHTML = `<span class="terminal-tab-label">${tabLabel}</span><button class="terminal-tab-close" onclick="closeTerminalTab('${id}')" title="Close"><i class="fas fa-times"></i></button>`;
    tabBtn.onclick = function(e) { if (!e.target.closest('.terminal-tab-close')) switchTerminalTab('${id}'); };

    const contentEl = document.createElement('div');
    contentEl.className = 'terminal-tab-panel active';
    contentEl.id = id + '-panel';
    contentEl.innerHTML = `
        <div class="term-query-terminal">
            <div class="term-query-header">
                <div class="term-query-title"><i class="fas fa-database"></i> ${engine} <code>${host}:${port}/${dbName}</code></div>
                <button class="btn-secondary btn-sm" onclick="closeTerminalTab('${id}')"><i class="fas fa-times"></i> Close</button>
            </div>
            <div class="term-query-output" id="${id}-output"></div>
            <div class="term-query-input-row">
                <input type="text" id="${id}-input" placeholder="Enter SQL, Ctrl+Enter to run" onkeydown="if(event.ctrlKey&&event.key==='Enter')submitTerminalQueryForTab('${id}')">
                <button class="btn-submit" onclick="submitTerminalQueryForTab('${id}')"><i class="fas fa-play"></i> Submit</button>
            </div>
        </div>
    `;

    tabsBar.appendChild(tabBtn);
    tabsContent.appendChild(contentEl);

    const entry = { id, conn, tabEl: tabBtn, contentEl, outputEl: contentEl.querySelector('.term-query-output'), inputEl: contentEl.querySelector('input') };
    window.terminalTabs.push(entry);

    appendTerminalOutputForTab(id, `[OK] Connected to ${engine}\nHost: ${host}:${port}\nDatabase: ${dbName}\n\n`);
    switchTerminalTab(id);
}

function connectTerminalVm(instanceId, instanceName, privateIp) {
    const placeholder = document.getElementById('terminalPlaceholder');
    const active = document.getElementById('terminalActive');
    const tabsBar = document.getElementById('terminalTabsBar');
    const tabsContent = document.getElementById('terminalTabsContent');
    if (!placeholder || !active || !tabsBar || !tabsContent) return;

    placeholder.style.display = 'none';
    active.style.display = 'flex';
    active.style.flexDirection = 'column';
    active.style.flex = '1';

    const id = 'term-tab-' + (++terminalTabCounter);
    const conn = { type: 'vm', instanceId, instanceName, privateIp };

    const tabBtn = document.createElement('div');
    tabBtn.className = 'terminal-tab active';
    tabBtn.id = id + '-tab';
    tabBtn.innerHTML = `<span class="terminal-tab-label">${instanceName || instanceId}</span><button class="terminal-tab-close" onclick="closeTerminalTab('${id}')" title="Close"><i class="fas fa-times"></i></button>`;
    tabBtn.onclick = function(e) { if (!e.target.closest('.terminal-tab-close')) switchTerminalTab('${id}'); };

    const contentEl = document.createElement('div');
    contentEl.className = 'terminal-tab-panel active';
    contentEl.id = id + '-panel';
    contentEl.innerHTML = `
        <div class="term-vm-panel">
            <h4><i class="fas fa-server"></i> ${instanceName || instanceId}</h4>
            <p style="color: var(--text-muted); margin-bottom: 16px;">${privateIp}</p>
            <button class="btn-session" onclick="connectToTerminal('${instanceId}', '${instanceName}', '${privateIp}')"><i class="fas fa-external-link-alt"></i> Open in AWS Session Manager</button>
            <button class="btn-secondary" style="margin-left: 12px;" onclick="showSSHCredentialsModal('${instanceId}', '${instanceName}', '${privateIp}')"><i class="fas fa-terminal"></i> SSH Terminal</button>
            <button class="btn-secondary" style="margin-left: 12px;" onclick="closeTerminalTab('${id}')"><i class="fas fa-times"></i> Close</button>
        </div>
    `;

    tabsBar.appendChild(tabBtn);
    tabsContent.appendChild(contentEl);

    window.terminalTabs.push({ id, conn, tabEl: tabBtn, contentEl });
    switchTerminalTab(id);
}

function switchTerminalTab(id) {
    window.terminalTabs.forEach(t => {
        t.tabEl.classList.toggle('active', t.id === id);
        t.contentEl.classList.toggle('active', t.id === id);
    });
}

function closeTerminalTab(id) {
    const idx = window.terminalTabs.findIndex(t => t.id === id);
    if (idx >= 0) {
        const t = window.terminalTabs[idx];
        t.tabEl.remove();
        t.contentEl.remove();
        window.terminalTabs.splice(idx, 1);
    }
    if (window.terminalTabs.length === 0) {
        const placeholder = document.getElementById('terminalPlaceholder');
        const active = document.getElementById('terminalActive');
        if (placeholder) placeholder.style.display = 'flex';
        if (active) active.style.display = 'none';
        const bar = document.getElementById('terminalTabsBar');
        const content = document.getElementById('terminalTabsContent');
        if (bar) bar.innerHTML = '';
        if (content) content.innerHTML = '';
    } else {
        switchTerminalTab(window.terminalTabs[0].id);
    }
}

function appendTerminalOutputForTab(id, text) {
    const t = window.terminalTabs.find(x => x.id === id);
    if (t && t.outputEl) {
        let html = escapeHtml(text).replace(/\n/g, '<br>');
        html = html.replace(/\[OK\]/g, '<i class="fas fa-check-circle" style="color:#22c55e;margin-right:4px"></i>');
        html = html.replace(/\[ERROR\]/g, '<i class="fas fa-times-circle" style="color:#ef4444;margin-right:4px"></i>');
        t.outputEl.innerHTML += html;
        t.outputEl.scrollTop = t.outputEl.scrollHeight;
    }
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

async function submitTerminalQueryForTab(id) {
    const t = window.terminalTabs.find(x => x.id === id);
    if (!t || !t.conn || t.conn.type !== 'db' || !t.inputEl) return;
    const query = t.inputEl.value.trim();
    if (!query) return;

    appendTerminalOutputForTab(id, `\n> ${query}\n`);
    t.inputEl.value = '';

    const userEmail = localStorage.getItem('userEmail') || '';
    try {
        const res = await fetch(`${TERMINAL_API_BASE}/api/databases/execute-query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                request_id: t.conn.requestId,
                user_email: userEmail,
                query,
                dbName: t.conn.dbName
            })
        });
        const data = await res.json();
        if (data.error) {
            const errMsg = data.error.startsWith('❌') ? data.error.replace(/^❌\s*/, '[ERROR] ') : `[ERROR] ${data.error}`;
            appendTerminalOutputForTab(id, `${errMsg}\n`);
        } else if (data.results) {
            const rows = data.results;
            if (rows.length === 0) appendTerminalOutputForTab(id, '(0 rows)\n');
            else appendTerminalOutputForTab(id, JSON.stringify(rows, null, 2) + '\n');
        } else if (data.affected_rows !== undefined) {
            appendTerminalOutputForTab(id, `[OK] ${data.affected_rows} row(s) affected\n`);
        }
    } catch (e) {
        appendTerminalOutputForTab(id, `[ERROR] ${e.message}\n`);
    }
}

function disconnectTerminal() {
    const active = window.terminalTabs?.[0]?.id;
    if (active) closeTerminalTab(active);
}

function initTerminalPage() {
    document.querySelectorAll('.terminal-category-header').forEach(h => h && h.classList.add('open'));
    document.querySelectorAll('.terminal-category').forEach(c => c && c.classList.add('open'));
    refreshTerminalPage();
    if (window.pendingTerminalConnection) {
        const c = window.pendingTerminalConnection;
        setTimeout(function() {
            if (c.host && c.port) connectTerminalDb(c.host, c.port, c.engine, c.requestId, c.dbName);
            window.pendingTerminalConnection = null;
        }, 350);
    }
}
