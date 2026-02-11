/**
 * Terminal Pages - separated Database and VM terminals.
 * Each page has independent tabs/state and shared backend APIs.
 */

const TERMINAL_API_BASE = (typeof DB_API_BASE !== 'undefined')
    ? DB_API_BASE
    : ((typeof API_BASE !== 'undefined')
        ? API_BASE.replace('/api', '')
        : (window.location.port === '80' || window.location.port === '443' || window.location.port === ''
            ? window.location.origin
            : `${window.location.protocol}//${window.location.hostname}:5000`));

const TERMINAL_MODES = {
    database: {
        pageId: 'databaseTerminalPage',
        categoryType: 'db',
        categoryId: 'databaseTerminalDbCategory',
        listId: 'databaseTerminalDbConnectionsList',
        emptyId: 'databaseTerminalDbEmptyState',
        itemsId: 'databaseTerminalDbListItems',
        placeholderId: 'databaseTerminalPlaceholder',
        activeId: 'databaseTerminalActive',
        tabsBarId: 'databaseTerminalTabsBar',
        tabsContentId: 'databaseTerminalTabsContent'
    },
    vm: {
        pageId: 'vmTerminalPage',
        categoryType: 'vm',
        categoryId: 'vmTerminalVmCategory',
        listId: 'vmTerminalVmConnectionsList',
        emptyId: 'vmTerminalVmEmptyState',
        itemsId: 'vmTerminalVmListItems',
        placeholderId: 'vmTerminalPlaceholder',
        activeId: 'vmTerminalActive',
        tabsBarId: 'vmTerminalTabsBar',
        tabsContentId: 'vmTerminalTabsContent'
    }
};

window.terminalStates = window.terminalStates || {
    database: { tabs: [], counter: 0 },
    vm: { tabs: [], counter: 0 }
};

function normalizeTerminalMode(mode) {
    return mode === 'vm' ? 'vm' : 'database';
}

function getTerminalModeConfig(mode) {
    return TERMINAL_MODES[normalizeTerminalMode(mode)];
}

function getTerminalState(mode) {
    return window.terminalStates[normalizeTerminalMode(mode)];
}

function getTerminalElements(mode) {
    const cfg = getTerminalModeConfig(mode);
    return {
        page: document.getElementById(cfg.pageId),
        category: document.getElementById(cfg.categoryId),
        list: document.getElementById(cfg.listId),
        empty: document.getElementById(cfg.emptyId),
        items: document.getElementById(cfg.itemsId),
        placeholder: document.getElementById(cfg.placeholderId),
        active: document.getElementById(cfg.activeId),
        tabsBar: document.getElementById(cfg.tabsBarId),
        tabsContent: document.getElementById(cfg.tabsContentId)
    };
}

function syncTerminalVisibility(mode) {
    const { placeholder, active } = getTerminalElements(mode);
    if (!placeholder || !active) return;

    const state = getTerminalState(mode);
    if (state.tabs.length === 0) {
        placeholder.style.display = 'flex';
        active.style.display = 'none';
    } else {
        placeholder.style.display = 'none';
        active.style.display = 'flex';
        active.style.flexDirection = 'column';
        active.style.flex = '1';
    }
}

function toggleTerminalCategory(type, mode) {
    const resolvedMode = mode || (type === 'vm' ? 'vm' : 'database');
    const { category } = getTerminalElements(resolvedMode);
    if (!category) return;

    const header = category.querySelector('.terminal-category-header');
    category.classList.toggle('open');
    if (header) header.classList.toggle('open');
}

async function refreshDatabaseTerminalPage() {
    await loadTerminalDbConnections('database');
    syncTerminalVisibility('database');
}

async function refreshVmTerminalPage() {
    await loadTerminalVmConnections('vm');
    syncTerminalVisibility('vm');
}

// Backward compatibility for legacy callers.
async function refreshTerminalPage() {
    await Promise.all([refreshDatabaseTerminalPage(), refreshVmTerminalPage()]);
}

async function loadTerminalDbConnections(mode = 'database') {
    const { empty, items } = getTerminalElements(mode);
    if (!empty || !items) return;

    const userEmail = localStorage.getItem('userEmail') || 'satish@nykaa.com';
    const url = `${TERMINAL_API_BASE}/api/databases/approved?user_email=${encodeURIComponent(userEmail)}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        const dbs = data.databases || [];

        if (!dbs.length) {
            empty.style.display = 'block';
            items.style.display = 'none';
            items.innerHTML = '';
            return;
        }

        empty.style.display = 'none';
        items.style.display = 'block';

        const roleLabel = r => ({
            read_only: 'Read-only',
            read_limited_write: 'Limited Write',
            read_full_write: 'Full Write',
            admin: 'Admin'
        })[r || 'read_only'] || (r || 'Read-only');

        items.innerHTML = dbs.map(db => {
            const reqId = (db.request_id || '').replace(/'/g, "\\'");
            const dbName = (db.db_name || db.engine || 'default').replace(/'/g, "\\'");
            return `<div class="terminal-connection-card">
                <div class="conn-icon"><i class="fas fa-database"></i></div>
                <div class="conn-info">
                    <div class="conn-name">${db.engine || 'MySQL'} - ${db.db_name || 'default'}</div>
                    <div class="conn-detail">${db.host}:${db.port} • ${roleLabel(db.role)}</div>
                </div>
                <button class="conn-action" onclick="connectTerminalDb('${db.host}', '${db.port}', '${db.engine}', '${reqId}', '${dbName}', '${normalizeTerminalMode(mode)}')">
                    Connect
                </button>
            </div>`;
        }).join('');
    } catch (e) {
        empty.style.display = 'block';
        items.style.display = 'none';
        empty.innerHTML = '<p>Error loading</p><small>' + (e.message || '') + '</small>';
    }
}

async function loadTerminalVmConnections(mode = 'vm') {
    const { empty, items } = getTerminalElements(mode);
    if (!empty || !items) return;

    try {
        const userEmail = localStorage.getItem('userEmail') || 'satish@nykaa.com';
        const res = await fetch(`${TERMINAL_API_BASE}/api/instances/approved?user_email=${encodeURIComponent(userEmail)}`);
        const data = await res.json();
        const instances = data.instances || [];

        if (!instances.length) {
            empty.style.display = 'block';
            items.style.display = 'none';
            items.innerHTML = '';
            return;
        }

        empty.style.display = 'none';
        items.style.display = 'block';
        items.innerHTML = instances.map(inst => {
            const name = (inst.instance_name || inst.instance_id || '').replace(/'/g, "\\'");
            const ip = (inst.public_ip || inst.private_ip || 'N/A').replace(/'/g, "\\'");
            return `<div class="terminal-connection-card">
                <div class="conn-icon"><i class="fab fa-aws"></i></div>
                <div class="conn-info">
                    <div class="conn-name">${inst.instance_name || inst.instance_id}</div>
                    <div class="conn-detail">${inst.private_ip || inst.public_ip || 'N/A'}</div>
                </div>
                <button class="conn-action" onclick="connectTerminalVm('${inst.instance_id}', '${name}', '${ip}', '${normalizeTerminalMode(mode)}')">
                    Connect
                </button>
            </div>`;
        }).join('');
    } catch (e) {
        empty.style.display = 'block';
        items.style.display = 'none';
        empty.innerHTML = '<p>Error loading</p><small>' + (e.message || '') + '</small>';
    }
}

function connectTerminalDb(host, port, engine, requestId, dbName, mode = 'database') {
    const resolvedMode = normalizeTerminalMode(mode);
    const { placeholder, active, tabsBar, tabsContent } = getTerminalElements(resolvedMode);
    if (!placeholder || !active || !tabsBar || !tabsContent) return;

    placeholder.style.display = 'none';
    active.style.display = 'flex';
    active.style.flexDirection = 'column';
    active.style.flex = '1';

    const state = getTerminalState(resolvedMode);
    const id = `term-${resolvedMode}-tab-${++state.counter}`;
    const conn = { type: 'db', dbName, host, port, engine, requestId };
    const tabLabel = `${engine} @ ${dbName}`;

    const tabBtn = document.createElement('div');
    tabBtn.className = 'terminal-tab active';
    tabBtn.id = id + '-tab';
    tabBtn.innerHTML = `<span class="terminal-tab-label">${tabLabel}</span><button class="terminal-tab-close" onclick="closeTerminalTab('${id}', '${resolvedMode}')" title="Close"><i class="fas fa-times"></i></button>`;
    tabBtn.onclick = function(e) {
        if (!e.target.closest('.terminal-tab-close')) switchTerminalTab(id, resolvedMode);
    };

    const contentEl = document.createElement('div');
    contentEl.className = 'terminal-tab-panel active';
    contentEl.id = id + '-panel';
    contentEl.innerHTML = `
        <div class="term-query-terminal">
            <div class="term-query-header">
                <div class="term-query-title"><i class="fas fa-database"></i> ${engine} <code>${host}:${port}/${dbName}</code></div>
                <button class="btn-secondary btn-sm" onclick="closeTerminalTab('${id}', '${resolvedMode}')"><i class="fas fa-times"></i> Close</button>
            </div>
            <div class="term-query-output" id="${id}-output"></div>
            <div class="term-query-input-row">
                <input type="text" id="${id}-input" placeholder="Enter SQL, Ctrl+Enter to run" onkeydown="if(event.ctrlKey&&event.key==='Enter')submitTerminalQueryForTab('${id}', '${resolvedMode}')">
                <button class="btn-submit" onclick="submitTerminalQueryForTab('${id}', '${resolvedMode}')"><i class="fas fa-play"></i> Submit</button>
            </div>
        </div>
    `;

    tabsBar.appendChild(tabBtn);
    tabsContent.appendChild(contentEl);

    const entry = {
        id,
        conn,
        tabEl: tabBtn,
        contentEl,
        outputEl: contentEl.querySelector('.term-query-output'),
        inputEl: contentEl.querySelector('input')
    };
    state.tabs.push(entry);

    appendTerminalOutputForTab(id, `[OK] Connected to ${engine}\nHost: ${host}:${port}\nDatabase: ${dbName}\n\n`, resolvedMode);
    switchTerminalTab(id, resolvedMode);
}

function connectTerminalVm(instanceId, instanceName, privateIp, mode = 'vm') {
    const resolvedMode = normalizeTerminalMode(mode);
    const { placeholder, active, tabsBar, tabsContent } = getTerminalElements(resolvedMode);
    if (!placeholder || !active || !tabsBar || !tabsContent) return;

    placeholder.style.display = 'none';
    active.style.display = 'flex';
    active.style.flexDirection = 'column';
    active.style.flex = '1';

    const state = getTerminalState(resolvedMode);
    const id = `term-${resolvedMode}-tab-${++state.counter}`;
    const conn = { type: 'vm', instanceId, instanceName, privateIp };

    const tabBtn = document.createElement('div');
    tabBtn.className = 'terminal-tab active';
    tabBtn.id = id + '-tab';
    tabBtn.innerHTML = `<span class="terminal-tab-label">${instanceName || instanceId}</span><button class="terminal-tab-close" onclick="closeTerminalTab('${id}', '${resolvedMode}')" title="Close"><i class="fas fa-times"></i></button>`;
    tabBtn.onclick = function(e) {
        if (!e.target.closest('.terminal-tab-close')) switchTerminalTab(id, resolvedMode);
    };

    const contentEl = document.createElement('div');
    contentEl.className = 'terminal-tab-panel active';
    contentEl.id = id + '-panel';
    contentEl.innerHTML = `
        <div class="term-vm-panel">
            <h4><i class="fas fa-server"></i> ${instanceName || instanceId}</h4>
            <p style="color: var(--text-muted); margin-bottom: 16px;">${privateIp}</p>
            <button class="btn-session" onclick="connectToTerminal('${instanceId}', '${instanceName}', '${privateIp}')"><i class="fas fa-external-link-alt"></i> Open in AWS Session Manager</button>
            <button class="btn-secondary" style="margin-left: 12px;" onclick="showSSHCredentialsModal('${instanceId}', '${instanceName}', '${privateIp}')"><i class="fas fa-terminal"></i> SSH Terminal</button>
            <button class="btn-secondary" style="margin-left: 12px;" onclick="closeTerminalTab('${id}', '${resolvedMode}')"><i class="fas fa-times"></i> Close</button>
        </div>
    `;

    tabsBar.appendChild(tabBtn);
    tabsContent.appendChild(contentEl);

    state.tabs.push({ id, conn, tabEl: tabBtn, contentEl });
    switchTerminalTab(id, resolvedMode);
}

function switchTerminalTab(id, mode = 'database') {
    const state = getTerminalState(mode);
    state.tabs.forEach(t => {
        t.tabEl.classList.toggle('active', t.id === id);
        t.contentEl.classList.toggle('active', t.id === id);
    });
}

function closeTerminalTab(id, mode = 'database') {
    const resolvedMode = normalizeTerminalMode(mode);
    const state = getTerminalState(resolvedMode);
    const idx = state.tabs.findIndex(t => t.id === id);

    if (idx >= 0) {
        const t = state.tabs[idx];
        t.tabEl.remove();
        t.contentEl.remove();
        state.tabs.splice(idx, 1);
    }

    const { placeholder, active, tabsBar, tabsContent } = getTerminalElements(resolvedMode);
    if (state.tabs.length === 0) {
        if (placeholder) placeholder.style.display = 'flex';
        if (active) active.style.display = 'none';
        if (tabsBar) tabsBar.innerHTML = '';
        if (tabsContent) tabsContent.innerHTML = '';
    } else {
        switchTerminalTab(state.tabs[0].id, resolvedMode);
    }
}

function appendTerminalOutputForTab(id, text, mode = 'database') {
    const state = getTerminalState(mode);
    const t = state.tabs.find(x => x.id === id);
    if (!t || !t.outputEl) return;

    let html = escapeHtml(text).replace(/\n/g, '<br>');
    html = html.replace(/\[OK\]/g, '<i class="fas fa-check-circle" style="color:#22c55e;margin-right:4px"></i>');
    html = html.replace(/\[ERROR\]/g, '<i class="fas fa-times-circle" style="color:#ef4444;margin-right:4px"></i>');
    t.outputEl.innerHTML += html;
    t.outputEl.scrollTop = t.outputEl.scrollHeight;
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

async function submitTerminalQueryForTab(id, mode = 'database') {
    const resolvedMode = normalizeTerminalMode(mode);
    const state = getTerminalState(resolvedMode);
    const t = state.tabs.find(x => x.id === id);

    if (!t || !t.conn || t.conn.type !== 'db' || !t.inputEl) return;

    const query = t.inputEl.value.trim();
    if (!query) return;

    appendTerminalOutputForTab(id, `\n> ${query}\n`, resolvedMode);
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
            const errMsg = data.error.startsWith('❌')
                ? data.error.replace(/^❌\s*/, '[ERROR] ')
                : `[ERROR] ${data.error}`;
            appendTerminalOutputForTab(id, `${errMsg}\n`, resolvedMode);
        } else if (data.results) {
            const rows = data.results;
            if (rows.length === 0) appendTerminalOutputForTab(id, '(0 rows)\n', resolvedMode);
            else appendTerminalOutputForTab(id, JSON.stringify(rows, null, 2) + '\n', resolvedMode);
        } else if (data.affected_rows !== undefined) {
            appendTerminalOutputForTab(id, `[OK] ${data.affected_rows} row(s) affected\n`, resolvedMode);
        }
    } catch (e) {
        appendTerminalOutputForTab(id, `[ERROR] ${e.message}\n`, resolvedMode);
    }
}

function disconnectTerminal(mode = 'database') {
    const state = getTerminalState(mode);
    const activeId = state.tabs?.[0]?.id;
    if (activeId) closeTerminalTab(activeId, mode);
}

function openTerminalCategories(pageId) {
    const page = document.getElementById(pageId);
    if (!page) return;

    page.querySelectorAll('.terminal-category-header').forEach(h => h.classList.add('open'));
    page.querySelectorAll('.terminal-category').forEach(c => c.classList.add('open'));
}

function initDatabaseTerminalPage() {
    openTerminalCategories('databaseTerminalPage');
    refreshDatabaseTerminalPage();

    if (window.pendingTerminalConnection) {
        const c = window.pendingTerminalConnection;
        setTimeout(function() {
            if (c.host && c.port) {
                connectTerminalDb(c.host, c.port, c.engine, c.requestId, c.dbName, 'database');
            }
            window.pendingTerminalConnection = null;
        }, 350);
    }

    syncTerminalVisibility('database');
}

function initVmTerminalPage() {
    openTerminalCategories('vmTerminalPage');
    refreshVmTerminalPage();
    syncTerminalVisibility('vm');
}

// Backward compatibility for legacy callers.
function initTerminalPage() {
    initVmTerminalPage();
}
