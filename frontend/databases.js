// Database Management - Tree + AI + JIT Access

const DB_API_BASE = (typeof API_BASE !== 'undefined') ? API_BASE.replace('/api', '') : 'http://localhost:5000';
let selectedDatabases = [];
let currentDbAccount = '';
let dbConversationId = null;
let selectedEngine = null;
let dbRequestDraft = null;
let dbStatusFilter = 'pending';
let dbStepState = null; // { step: 1|2, provider: 'aws'|'managed'|'gcp'|'azure'|'oracle'|'atlas' }

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
            { id: 'rds-oracle', label: 'Oracle', engine: 'oracle', provider: 'aws' },
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
        id: 'azure',
        label: 'Azure',
        icon: 'fas fa-cloud',
        children: [
            { id: 'azure-sql', label: 'Azure SQL Database', engine: 'azuresql', provider: 'azure' },
            { id: 'azure-cosmos', label: 'Cosmos DB', engine: 'cosmosdb', provider: 'azure' },
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
    {
        id: 'oracle-cloud',
        label: 'Oracle Cloud',
        icon: 'fas fa-cloud',
        children: [
            { id: 'ora-autonomous', label: 'Autonomous DB', engine: 'autonomous', provider: 'oracle' },
        ]
    },
];

function renderDbTree() {
    const container = document.getElementById('dbTreeContainer');
    if (!container) return;
    let html = '';
    DB_TREE.forEach((cat, i) => {
        const catId = `db-cat-${cat.id}`;
        const openClass = i < 2 ? ' db-tree-open' : '';  // RDS and Managed open by default
        const chevronOpen = i < 2 ? ' db-tree-chevron-open' : '';
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
    // Show step panel, hide AI and placeholder
    document.getElementById('dbAiPanel').classList.add('db-ai-panel-hidden');
    document.getElementById('dbAiPlaceholder').style.display = 'none';
    dbRequestDraft = { engine, provider, databases: [] };
    dbStepState = { step: 1, provider };
    selectedDatabases = [];
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
    document.getElementById('dbAiPlaceholder').style.display = 'flex';
    selectedEngine = null;
    dbStepState = null;
    dbConversationId = null;
}

function closeDbAiPanel() {
    document.getElementById('dbAiPanel').classList.add('db-ai-panel-hidden');
    document.getElementById('dbAiPlaceholder').style.display = 'flex';
    document.getElementById('dbStepPanel').classList.add('db-step-hidden');
    selectedEngine = null;
    dbStepState = null;
    dbConversationId = null;
}

async function renderDbStepContent() {
    const content = document.getElementById('dbStepContent');
    if (!content || !dbStepState || !selectedEngine) return;
    const { step, provider } = dbStepState;

    if (provider === 'aws') {
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
        } else if (step === 2) {
            const accountId = document.getElementById('dbStepAccount')?.value || dbRequestDraft?.account_id;
            const wantEngine = (selectedEngine?.engine || '').toLowerCase();
            const result = await fetchDatabasesForAccount(accountId, wantEngine);
            const dbs = filterDatabasesByEngine(result.databases || [], wantEngine);
            content.innerHTML = `
                <div class="db-step-field">
                    <label>Select Database(s)</label>
                    <div id="dbStepDbList" class="db-step-db-list">
                        ${dbs.length ? dbs.map(db => {
                            const eng = (db.engine || selectedEngine.engine || 'mysql').toString().toLowerCase();
                            return `<label class="db-discover-item">
                                <input type="checkbox" value="${db.id}" data-name="${db.name}" data-host="${db.host}" data-port="${db.port || 3306}" data-engine="${eng}" onchange="toggleDbStepSelection()">
                                <span>${db.name}</span> <small>${db.engine} @ ${db.host}</small>
                            </label>`;
                        }).join('') : '<p class="db-step-empty">No databases found. Enter host manually below.</p>'}
                    </div>
                </div>
            `;
            if (!dbs.length) {
                content.innerHTML += `<div class="db-step-field"><label>Database Host</label><input type="text" id="dbStepHost" placeholder="e.g. mydb.xxx.us-east-1.rds.amazonaws.com" class="db-step-input"></div>
                    <div class="db-step-field"><label>Database Name</label><input type="text" id="dbStepDbName" placeholder="e.g. mydb" class="db-step-input"></div>`;
            }
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
}

async function fetchAccounts() {
    try {
        const r = await fetch(`${DB_API_BASE}/api/accounts`);
        const data = await r.json();
        return typeof data === 'object' && !Array.isArray(data) ? Object.values(data) : (data || []);
    } catch (e) {
        return [{ id: 'default', name: 'Default Account' }];
    }
}

function normalizeEngineForFilter(displayEngine) {
    if (!displayEngine) return '';
    const s = (displayEngine || '').toString().toLowerCase();
    if (s.includes('mysql') && !s.includes('aurora')) return 'mysql';
    if (s.includes('mariadb')) return 'maria';
    if (s.includes('postgres')) return 'postgres';
    if (s.includes('sqlserver') || s.includes('mssql')) return 'mssql';
    if (s.includes('aurora')) return 'aurora';
    return s;
}

function filterDatabasesByEngine(databases, wantEngine) {
    if (!wantEngine || !Array.isArray(databases)) return databases;
    const want = wantEngine.toLowerCase();
    return databases.filter(db => normalizeEngineForFilter(db.engine) === want);
}

async function fetchDatabasesForAccount(accountId, engine) {
    if (!accountId) return { databases: [], error: null };
    try {
        let url = `${DB_API_BASE}/api/databases?account_id=${encodeURIComponent(accountId)}`;
        if (engine) url += `&engine=${encodeURIComponent(engine)}`;
        const r = await fetch(url);
        const data = await r.json();
        return { databases: data.databases || [], error: data.error || null };
    } catch (e) {
        return { databases: [], error: e.message };
    }
}

async function fetchGcpProjects() {
    try {
        const r = await fetch(`${DB_API_BASE}/api/gcp/projects`);
        const data = await r.json();
        return data.projects || data || [];
    } catch (e) {
        return [{ id: 'proj-dev', name: 'Development' }, { id: 'proj-staging', name: 'Staging' }, { id: 'proj-prod', name: 'Production' }];
    }
}

async function fetchAzureSubscriptions() {
    try {
        const r = await fetch(`${DB_API_BASE}/api/azure/subscriptions`);
        const data = await r.json();
        return data.subscriptions || data || [];
    } catch (e) {
        return [{ id: 'sub-dev', name: 'Dev Subscription' }, { id: 'sub-prod', name: 'Production Subscription' }];
    }
}

async function fetchOracleCompartments() {
    try {
        const r = await fetch(`${DB_API_BASE}/api/oracle/compartments`);
        const data = await r.json();
        return data.compartments || data || [];
    } catch (e) {
        return [{ id: 'comp-root', name: 'Root' }, { id: 'comp-dev', name: 'Development' }, { id: 'comp-prod', name: 'Production' }];
    }
}

async function fetchMongoAtlasProjects() {
    try {
        const r = await fetch(`${DB_API_BASE}/api/mongodb-atlas/projects`);
        const data = await r.json();
        return data.projects || data || [];
    } catch (e) {
        return [{ id: 'atlas-cluster-1', name: 'Cluster-Production' }, { id: 'atlas-cluster-2', name: 'Cluster-Staging' }];
    }
}

function onDbStepAccountChange() {
    dbRequestDraft = dbRequestDraft || {};
    dbRequestDraft.account_id = document.getElementById('dbStepAccount')?.value || '';
}

function toggleDbStepSelection() {
    const checkboxes = document.querySelectorAll('#dbStepDbList input:checked');
    selectedDatabases = Array.from(checkboxes).map(cb => ({
        id: cb.value,
        name: cb.getAttribute('data-name'),
        host: cb.getAttribute('data-host'),
        port: cb.getAttribute('data-port') || 3306,
        engine: cb.getAttribute('data-engine')
    }));
}

async function dbStepNext() {
    if (!dbStepState || !selectedEngine) return;
    const { step, provider } = dbStepState;
    dbRequestDraft = dbRequestDraft || {};

    if (provider === 'aws') {
        if (step === 1) {
            const accountId = document.getElementById('dbStepAccount')?.value;
            if (!accountId) {
                alert('Please select an AWS account.');
                return;
            }
            dbRequestDraft.account_id = accountId;
            dbStepState.step = 2;
            renderDbStepContent();
            return;
        }
        if (step === 2) {
            const wantEngine = (selectedEngine?.engine || '').toLowerCase();
            const result = await fetchDatabasesForAccount(dbRequestDraft.account_id, wantEngine);
            const dbs = filterDatabasesByEngine(result.databases || [], wantEngine);
            if (dbs.length && selectedDatabases.length === 0) {
                alert('Please select at least one database.');
                return;
            }
            if (!dbs.length) {
                const host = document.getElementById('dbStepHost')?.value?.trim();
                const dbName = document.getElementById('dbStepDbName')?.value?.trim() || 'default';
                if (!host) {
                    alert('Please enter the database host.');
                    return;
                }
                selectedDatabases = [{ id: 'manual', name: dbName, host, port: 3306, engine: selectedEngine.engine }];
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

    // All steps complete — hide step panel, show AI assistant
    document.getElementById('dbStepPanel').classList.add('db-step-hidden');
    document.getElementById('dbAiEngineLabel').textContent = selectedEngine.label;
    document.getElementById('dbAiPanel').classList.remove('db-ai-panel-hidden');
    initDbAiChat(selectedEngine.label, selectedEngine.engine);
}

function initDbAiChat(label, engine) {
    const chat = document.getElementById('dbAiChat');
    chat.innerHTML = `<div class="db-ai-msg db-ai-bot">
        <p>Hi! I'll help you request access to <strong>${label}</strong>. Let me ask a few questions:</p>
        <p>1. Which <strong>account</strong> or <strong>environment</strong> do you need? (e.g., dev, staging, prod)</p>
        <p>2. What's the <strong>database name</strong> or <strong>cluster endpoint</strong>?</p>
        <p>3. What do you need to do? (read-only, run queries, update data, schema changes)</p>
        <p>4. How long do you need access? (2, 4, or 8 hours)</p>
        <p>Reply with your answers and I'll prepare the request.</p>
    </div>`;
    chat.scrollTop = chat.scrollHeight;
    document.getElementById('dbAiRequestSummary').style.display = 'none';
    document.getElementById('dbAiActions').style.display = 'none';
}

async function sendDbAiMessage() {
    const input = document.getElementById('dbAiInput');
    const message = input.value.trim();
    if (!message) return;
    const chat = document.getElementById('dbAiChat');
    chat.innerHTML += `<div class="db-ai-msg db-ai-user"><p>${escapeHtml(message)}</p></div>`;
    input.value = '';
    chat.scrollTop = chat.scrollHeight;

    try {
        const ctx = selectedEngine ? `User is requesting ${selectedEngine.label}. ` : '';
        const response = await fetch(`${DB_API_BASE}/api/databases/ai-chat`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                message: ctx + message,
                conversation_id: dbConversationId
            })
        });
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (parseErr) {
            if (!response.ok || text.trim().startsWith('<')) {
                chat.innerHTML += `<div class="db-ai-msg db-ai-error"><p>Server returned an error (${response.status}). Ensure the backend is running and reachable.</p></div>`;
            } else {
                throw parseErr;
            }
            chat.scrollTop = chat.scrollHeight;
            return;
        }
        if (data.conversation_id) dbConversationId = data.conversation_id;
        if (data.error) {
            chat.innerHTML += `<div class="db-ai-msg db-ai-error"><p>${escapeHtml(data.error)}</p></div>`;
        } else {
            chat.innerHTML += `<div class="db-ai-msg db-ai-bot"><p>${(data.response || '').replace(/\n/g, '<br>')}</p></div>`;
            if (data.permissions && data.permissions.length) {
                dbRequestDraft = dbRequestDraft || {};
                dbRequestDraft.permissions = data.permissions.join(',');
            }
        }
        chat.scrollTop = chat.scrollHeight;
        showDbRequestSummaryIfReady();
    } catch (err) {
        chat.innerHTML += `<div class="db-ai-msg db-ai-error"><p>Error: ${escapeHtml(err.message)}</p></div>`;
        chat.scrollTop = chat.scrollHeight;
    }
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function showDbRequestSummaryIfReady() {
    if (!dbRequestDraft || !selectedEngine) return;
    const summary = document.getElementById('dbAiRequestSummary');
    const actions = document.getElementById('dbAiActions');
    summary.innerHTML = `<p><strong>Draft:</strong> ${selectedEngine.label} | Role: ${dbRequestDraft.role || 'read_only'} | Duration: ${dbRequestDraft.duration_hours || 2}h</p>`;
    summary.style.display = 'block';
    actions.style.display = 'flex';
}

function editDbRequestDuration() {
    const hrs = prompt('Duration (hours):', dbRequestDraft?.duration_hours || 2);
    if (hrs) {
        const h = parseInt(hrs, 10);
        if (h >= 1 && h <= 24) {
            dbRequestDraft = dbRequestDraft || {};
            dbRequestDraft.duration_hours = h;
            showDbRequestSummaryIfReady();
        }
    }
}

async function submitDbRequestViaAi() {
    if (!selectedEngine || !dbRequestDraft) {
        alert('Please complete the AI conversation first. Select account and database.');
        return;
    }
    const userEmail = localStorage.getItem('userEmail') || 'user@company.com';
    const fullName = prompt('Your full name:', localStorage.getItem('userName') || '');
    if (!fullName) return;
    const justification = prompt('Justification (why you need access):', dbRequestDraft.justification || '');
    if (!justification) return;
    let accountId = dbRequestDraft.account_id || dbRequestDraft.project_id || dbRequestDraft.subscription_id || dbRequestDraft.compartment_id || dbRequestDraft.atlas_project_id || '';
    if (!accountId) {
        const accounts = await fetchAccounts();
        if (accounts.length) accountId = accounts[0].id;
    }
    const databases = selectedDatabases.length ? selectedDatabases : [{
        name: dbRequestDraft.db_name || 'default',
        host: dbRequestDraft.host || 'localhost',
        port: dbRequestDraft.port || 3306,
        engine: selectedEngine.engine
    }];
    if (!databases[0].host || databases[0].host === 'localhost') {
        const host = prompt('Database host/endpoint:');
        const dbName = prompt('Database name:');
        if (host) databases[0].host = host;
        if (dbName) databases[0].name = dbName;
    }
    try {
        const res = await fetch(`${DB_API_BASE}/api/databases/request-access`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                databases,
                account_id: accountId,
                user_email: userEmail,
                user_full_name: fullName,
                db_username: userEmail.split('@')[0],
                permissions: dbRequestDraft.permissions || 'SELECT',
                role: dbRequestDraft.role || 'read_only',
                duration_hours: dbRequestDraft.duration_hours || 2,
                justification,
                conversation_id: dbConversationId
            })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        closeDbAiPanel();
        loadDbRequests();
        refreshApprovedDatabases();
        alert(`Request submitted! Status: ${data.status}\n\n${data.message}`);
    } catch (e) {
        alert('Failed: ' + e.message);
    }
}

function filterDbRequests(status) {
    dbStatusFilter = status;
    loadDbRequests();
}

async function loadDbRequests() {
    const userEmail = localStorage.getItem('userEmail') || 'satish@nykaa.com';
    try {
        const res = await fetch(`${DB_API_BASE}/api/databases/requests?user_email=${encodeURIComponent(userEmail)}&status=${dbStatusFilter}`);
        const data = await res.json();
        const list = document.getElementById('dbRequestsList');
        if (!list) return;
        if (!data.requests || data.requests.length === 0) {
            list.innerHTML = `<div class="db-requests-empty">No ${dbStatusFilter.replace('_', ' ')} requests</div>`;
            return;
        }
        const roleLabel = r => ({ read_only: 'Read-only', read_limited_write: 'Limited Write', read_full_write: 'Full Write', admin: 'Admin' })[r] || r;
        list.innerHTML = data.requests.map(req => {
            const db = req.databases && req.databases[0];
            const eng = db?.engine || 'db';
            const canEdit = req.status === 'pending';
            return `<div class="db-request-card db-request-${req.status}">
                <div class="db-request-header">
                    <span class="db-request-id">${(req.request_id || '').slice(0, 8)}</span>
                    <span class="db-request-status db-status-badge-${req.status}">${req.status.replace('_', ' ')}</span>
                </div>
                <div class="db-request-body">
                    <p><strong>${eng}</strong> • ${db?.host || '-'}:${db?.port || '-'}</p>
                    <p>Role: ${roleLabel(req.role)} | ${req.duration_hours}h | ${req.justification?.slice(0, 50) || ''}...</p>
                </div>
                <div class="db-request-actions">
                    ${canEdit ? `<button class="btn-secondary btn-sm" onclick="editDbRequestDurationModal('${req.request_id}')"><i class="fas fa-edit"></i> Edit Duration</button>` : ''}
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        const list = document.getElementById('dbRequestsList');
        if (list) list.innerHTML = `<div class="db-requests-empty">Error loading requests</div>`;
    }
}

async function editDbRequestDurationModal(requestId) {
    const hrs = prompt('New duration (1-24 hours):', '2');
    if (!hrs) return;
    const h = parseInt(hrs, 10);
    if (h < 1 || h > 24) {
        alert('Duration must be 1-24 hours');
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
        alert('Failed: ' + e.message);
    }
}

async function loadDatabases() {
    try {
        renderDbTree();
        loadDbRequests();
        refreshApprovedDatabases();
    } catch (e) {
        console.error('Error loading databases:', e);
        renderDbTree();
    }
}

async function refreshApprovedDatabases() {
    const tbody = document.getElementById('approvedDatabasesTableBody');
    if (!tbody) return;
    try {
        const userEmail = localStorage.getItem('userEmail') || 'satish@nykaa.com';
        const res = await fetch(`${DB_API_BASE}/api/databases/approved?user_email=${encodeURIComponent(userEmail)}`);
        const data = await res.json();
        if (!data.databases?.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">No approved databases</td></tr>';
            return;
        }
        const roleLabel = r => ({ read_only: 'Read-only', read_limited_write: 'Limited Write', read_full_write: 'Full Write', admin: 'Admin' })[r || 'read_only'] || (r || 'Read-only');
        tbody.innerHTML = data.databases.map(db => {
            const requestId = (db.request_id || '').replace(/'/g, "\\'");
            const dbName = (db.db_name || db.engine || '').replace(/'/g, "\\'");
            return `<tr>
                <td>${db.engine}</td>
                <td><strong>${db.host}:${db.port}</strong></td>
                <td><code>${db.db_username}</code></td>
                <td><span class="badge">${roleLabel(db.role)}</span></td>
                <td>${new Date(db.expires_at).toLocaleString()}</td>
                <td>
                    <button class="btn-primary btn-sm" onclick="connectToDatabase('${db.host}', '${db.port}', '${db.engine}', '${requestId}', '${dbName}')">
                        <i class="fas fa-terminal"></i> Connect & Run Queries
                    </button>
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">Error loading</td></tr>';
    }
}

function connectToDatabase(host, port, engine, requestId, dbName) {
    window.pendingTerminalConnection = { host, port, engine, requestId: requestId || '', dbName: dbName || 'default' };
    if (typeof showPage === 'function') {
        showPage('terminal');
    } else {
        showDatabaseTerminal(dbName || 'testdb', host, port, engine, requestId || '');
    }
}

function showDatabaseTerminal(dbName, host, port, engine, requestId) {
    const container = document.getElementById('databaseTerminalContainer');
    if (!container) return;
    container.innerHTML = `
        <div class="db-query-terminal">
            <div class="db-terminal-header">
                <div class="db-terminal-info">
                    <div class="db-terminal-title"><i class="fas fa-database"></i> ${engine} Query Terminal</div>
                    <div class="db-terminal-connection"><code>${host}:${port}/${dbName}</code></div>
                </div>
                <button class="btn-danger btn-sm" onclick="disconnectDatabase()"><i class="fas fa-times"></i> Disconnect</button>
            </div>
            <div id="dbOutput" class="db-terminal-output"></div>
            <div class="db-terminal-input-row">
                <input type="text" id="dbQuery" class="db-query-input" placeholder="Enter SQL..." onkeypress="if(event.key==='Enter') executeQuery()">
                <button class="btn-primary" onclick="executeQuery()"><i class="fas fa-play"></i> Execute</button>
            </div>
        </div>
    `;
    window.dbConn = { dbName, host, port, engine, requestId: requestId || '' };
    appendOutput(`✅ Connected to ${engine}\nHost: ${host}:${port}\nDatabase: ${dbName}\n\n`);
}

function appendOutput(text) {
    const el = document.getElementById('dbOutput');
    if (el) {
        el.innerHTML += text.replace(/\n/g, '<br>');
        el.scrollTop = el.scrollHeight;
    }
}

async function executeQuery() {
    const query = document.getElementById('dbQuery')?.value?.trim();
    if (!query || !window.dbConn) return;
    appendOutput(`\n🔹 ${query}\n`);
    document.getElementById('dbQuery').value = '';
    const userEmail = localStorage.getItem('userEmail') || '';
    try {
        const res = await fetch(`${DB_API_BASE}/api/databases/execute-query`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                request_id: window.dbConn.requestId,
                user_email: userEmail,
                query,
                dbName: window.dbConn.dbName
            })
        });
        const data = await res.json();
        if (data.error) appendOutput(`\n❌ ${data.error}\n\n`);
        else if (data.results) appendOutput(formatResults(data.results) + '\n');
        else appendOutput(`\n✅ ${data.affected_rows || 0} row(s)\n\n`);
    } catch (e) {
        appendOutput(`\n❌ ${e.message}\n\n`);
    }
}

function formatResults(results) {
    if (!results?.length) return '\n📭 Empty set\n';
    const keys = Object.keys(results[0]);
    let out = '\n' + keys.join(' | ') + '\n' + '-'.repeat(40) + '\n';
    results.forEach(r => out += keys.map(k => r[k]).join(' | ') + '\n');
    return out + `\n✅ ${results.length} row(s)\n`;
}

function disconnectDatabase() {
    if (!confirm('Disconnect?')) return;
    const c = document.getElementById('databaseTerminalContainer');
    if (c) c.innerHTML = `<div class="db-terminal-placeholder"><i class="fas fa-database"></i><p>No active connection</p><p class="hint">Click Connect on an approved database</p></div>`;
    window.dbConn = null;
}
