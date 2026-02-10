/**
 * Terminal Pages - DB Terminal, VM Terminal, Container Terminal (separate)
 */

const TERMINAL_API_BASE = (typeof DB_API_BASE !== 'undefined') ? DB_API_BASE : ((typeof API_BASE !== 'undefined') ? API_BASE.replace('/api', '') : (window.location.port === '80' || window.location.port === '443' || window.location.port === '' ? window.location.origin : `${window.location.protocol}//${window.location.hostname}:5000`));

window.terminalTabs = [];
let terminalTabCounter = 0;

// --- DB Terminal ---
async function refreshDbTerminal() {
    var emptyEl = document.getElementById('dbTerminalEmpty');
    var listEl = document.getElementById('dbTerminalList');
    if (!emptyEl || !listEl) return;
    var userEmail = localStorage.getItem('userEmail') || 'satish@nykaa.com';
    try {
        var res = await fetch(TERMINAL_API_BASE + '/api/databases/approved?user_email=' + encodeURIComponent(userEmail));
        var data = await res.json();
        var dbs = data.databases || [];
        if (!dbs.length) {
            emptyEl.style.display = 'block';
            listEl.style.display = 'none';
            listEl.innerHTML = '';
            return;
        }
        emptyEl.style.display = 'none';
        listEl.style.display = 'block';
        var roleLabel = function(r) { return { read_only: 'Read-only', read_limited_write: 'Limited Write', read_full_write: 'Full Write', admin: 'Admin' }[r || 'read_only'] || (r || 'Read-only'); };
        listEl.innerHTML = dbs.map(function(db) {
            var reqId = (db.request_id || '').replace(/'/g, "\\'");
            var dbName = (db.db_name || db.engine || 'default').replace(/'/g, "\\'");
            return '<div class="terminal-connection-card" style="display:flex;align-items:center;gap:16px;padding:16px;background:var(--bg-panel);border:1px solid var(--border-subtle);border-radius:8px;margin-bottom:12px;"><div><i class="fas fa-database" style="font-size:24px;color:var(--primary);"></i></div><div style="flex:1;"><strong>' + (db.engine || 'MySQL') + ' - ' + (db.db_name || 'default') + '</strong><br><small>' + db.host + ':' + db.port + ' • ' + roleLabel(db.role) + '</small></div><button class="btn-primary btn-sm" onclick="connectTerminalDb(\'' + db.host + '\',\'' + db.port + '\',\'' + (db.engine || 'mysql') + '\',\'' + reqId + '\',\'' + dbName + '\')"><i class="fas fa-plug"></i> Connect</button></div>';
        }).join('');
    } catch (e) {
        emptyEl.style.display = 'block';
        listEl.style.display = 'none';
        emptyEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i><p>Error loading</p><small>' + (e.message === 'Failed to fetch' ? 'Backend not running. Start the backend and refresh.' : e.message) + '</small>';
    }
    if (window.pendingTerminalConnection) {
        var c = window.pendingTerminalConnection;
        setTimeout(function() {
            if (c.host && c.port && typeof connectTerminalDb === 'function') {
                connectTerminalDb(c.host, c.port, c.engine, c.requestId, c.dbName || 'default');
            }
            window.pendingTerminalConnection = null;
        }, 300);
    }
}

function connectTerminalDb(host, port, engine, requestId, dbName) {
    var area = document.getElementById('dbTerminalArea');
    var tabsBar = document.getElementById('dbTerminalTabsBar');
    var tabsContent = document.getElementById('dbTerminalTabsContent');
    if (!area || !tabsBar || !tabsContent) return;
    area.style.display = 'block';
    var id = 'term-tab-' + (++terminalTabCounter);
    var conn = { type: 'db', dbName: dbName, host: host, port: port, engine: engine, requestId: requestId };
    var tabBtn = document.createElement('div');
    tabBtn.className = 'terminal-tab active';
    tabBtn.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:8px 16px;margin-right:4px;background:var(--primary);color:white;border-radius:6px;cursor:pointer;font-size:13px;';
    tabBtn.innerHTML = '<span>' + engine + ' @ ' + dbName + '</span><button onclick="closeDbTerminalTab(\'' + id + '\');event.stopPropagation();" style="background:none;border:none;color:white;cursor:pointer;padding:0 4px;">&times;</button>';
    tabBtn.onclick = function(ev) { if (!ev.target.closest('button')) switchDbTerminalTab(id); };
    var contentEl = document.createElement('div');
    contentEl.className = 'terminal-tab-panel active';
    contentEl.id = id + '-panel';
    contentEl.innerHTML = '<div style="padding:16px;background:var(--bg-panel);border:1px solid var(--border-subtle);border-radius:8px;margin-top:12px;"><div style="margin-bottom:12px;"><strong><i class="fas fa-database"></i> ' + engine + ' <code>' + host + ':' + port + '/' + dbName + '</code></strong></div><div id="' + id + '-output" style="height:200px;overflow-y:auto;background:#0B1220;color:#E5E7EB;padding:12px;font-family:monospace;font-size:13px;border-radius:6px;margin-bottom:12px;"></div><div style="display:flex;gap:8px;"><input type="text" id="' + id + '-input" placeholder="Enter SQL, Ctrl+Enter to run" style="flex:1;padding:10px;border:1px solid var(--border-subtle);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);" onkeydown="if(event.ctrlKey&&event.key===\'Enter\')submitTerminalQueryForTab(\'' + id + '\')"><button class="btn-primary" onclick="submitTerminalQueryForTab(\'' + id + '\')"><i class="fas fa-play"></i> Run</button></div></div>';
    tabsBar.appendChild(tabBtn);
    tabsContent.appendChild(contentEl);
    var entry = { id: id, conn: conn, tabEl: tabBtn, contentEl: contentEl, outputEl: contentEl.querySelector('#' + id + '-output'), inputEl: contentEl.querySelector('#' + id + '-input') };
    window.terminalTabs.push(entry);
    appendTerminalOutputForTab(id, '[OK] Connected to ' + engine + '\nHost: ' + host + ':' + port + '\nDatabase: ' + dbName + '\n\n');
    switchDbTerminalTab(id);
}

function switchDbTerminalTab(id) {
    window.terminalTabs.forEach(function(t) {
        t.tabEl.classList.toggle('active', t.id === id);
        t.contentEl.style.display = t.id === id ? 'block' : 'none';
    });
}

function closeDbTerminalTab(id) {
    var idx = window.terminalTabs.findIndex(function(t) { return t.id === id; });
    if (idx >= 0) {
        var t = window.terminalTabs[idx];
        t.tabEl.remove();
        t.contentEl.remove();
        window.terminalTabs.splice(idx, 1);
    }
    if (window.terminalTabs.length === 0) {
        var area = document.getElementById('dbTerminalArea');
        if (area) area.style.display = 'none';
        document.getElementById('dbTerminalTabsBar').innerHTML = '';
        document.getElementById('dbTerminalTabsContent').innerHTML = '';
    } else {
        switchDbTerminalTab(window.terminalTabs[0].id);
    }
}

function appendTerminalOutputForTab(id, text) {
    var t = window.terminalTabs.find(function(x) { return x.id === id; });
    if (t && t.outputEl) {
        var d = document.createElement('div');
        d.textContent = text;
        var html = d.innerHTML.replace(/\n/g, '<br>').replace(/\[OK\]/g, '<span style="color:#22c55e;">[OK]</span>').replace(/\[ERROR\]/g, '<span style="color:#ef4444;">[ERROR]</span>');
        t.outputEl.innerHTML += html;
        t.outputEl.scrollTop = t.outputEl.scrollHeight;
    }
}

async function submitTerminalQueryForTab(id) {
    var t = window.terminalTabs.find(function(x) { return x.id === id; });
    if (!t || !t.conn || t.conn.type !== 'db' || !t.inputEl) return;
    var query = t.inputEl.value.trim();
    if (!query) return;
    appendTerminalOutputForTab(id, '\n> ' + query + '\n');
    t.inputEl.value = '';
    var userEmail = localStorage.getItem('userEmail') || '';
    try {
        var res = await fetch(TERMINAL_API_BASE + '/api/databases/execute-query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request_id: t.conn.requestId, user_email: userEmail, query: query, dbName: t.conn.dbName })
        });
        var data = await res.json();
        if (data.error) {
            appendTerminalOutputForTab(id, '[ERROR] ' + (data.error.replace(/^❌\s*/, '')) + '\n');
        } else if (data.results) {
            appendTerminalOutputForTab(id, (data.results.length === 0 ? '(0 rows)' : JSON.stringify(data.results, null, 2)) + '\n');
        } else if (data.affected_rows !== undefined) {
            appendTerminalOutputForTab(id, '[OK] ' + data.affected_rows + ' row(s) affected\n');
        }
    } catch (e) {
        appendTerminalOutputForTab(id, '[ERROR] ' + e.message + '\n');
    }
}

// --- VM Terminal ---
async function refreshVmTerminal() {
    var tbody = document.getElementById('vmTerminalTableBody');
    if (!tbody) return;
    var userEmail = localStorage.getItem('userEmail') || 'satish@nykaa.com';
    try {
        var res = await fetch(TERMINAL_API_BASE + '/api/instances/approved?user_email=' + encodeURIComponent(userEmail));
        var data = await res.json();
        var instances = data.instances || [];
        if (!instances.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#999;"><i class="fas fa-server"></i><p style="margin:8px 0;">No VM access</p><small>Request access from EC2 Instances page</small></td></tr>';
            return;
        }
        tbody.innerHTML = instances.map(function(inst) {
            var name = (inst.instance_name || inst.instance_id || '-');
            var ip = (inst.public_ip || inst.private_ip || 'N/A');
            return '<tr><td><code>' + inst.instance_id + '</code></td><td>' + name + '</td><td>' + (inst.private_ip || 'N/A') + '</td><td>' + new Date(inst.expires_at).toLocaleString() + '</td><td><button class="btn-primary btn-sm vm-connect-btn" data-id="' + inst.instance_id + '" data-name="' + name.replace(/"/g, '&quot;') + '" data-ip="' + ip.replace(/"/g, '&quot;') + '"><i class="fas fa-terminal"></i> Connect</button></td></tr>';
        }).join('');
        tbody.querySelectorAll('.vm-connect-btn').forEach(function(btn) {
            btn.onclick = function() {
                if (typeof connectToTerminal === 'function') {
                    connectToTerminal(btn.dataset.id, btn.dataset.name, btn.dataset.ip);
                }
            };
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#f44336;"><i class="fas fa-exclamation-triangle"></i><p style="margin:8px 0;">Error loading</p><small>' + (e.message === 'Failed to fetch' ? 'Backend not running. Start the backend and refresh.' : e.message) + '</small></td></tr>';
    }
}
