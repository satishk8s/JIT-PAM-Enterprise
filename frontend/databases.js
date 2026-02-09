// Database Management - Tree + AI + JIT Access

const DB_API_BASE = (typeof API_BASE !== 'undefined') ? API_BASE.replace('/api', '') : 'http://localhost:5000';
let selectedDatabases = [];
let currentDbAccount = '';
let dbConversationId = null;
let selectedEngine = null;
let dbRequestDraft = null;
let dbStatusFilter = 'all';
let dbStepState = null; // { step: 1|2, provider: 'aws'|'managed'|'gcp'|'azure'|'oracle'|'atlas' }

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
    selectedEngine = null;
    dbStepState = null;
    dbConversationId = null;
}

function closeDbAiPanel() {
    const aiPanel = document.getElementById('dbAiPanel');
    if (aiPanel) aiPanel.classList.add('db-ai-panel-hidden');
    const stepPanel = document.getElementById('dbStepPanel');
    if (stepPanel) stepPanel.classList.add('db-step-hidden');
    selectedEngine = null;
    dbStepState = null;
    dbConversationId = null;
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
            const result = await fetchDatabasesForAccount(accountId);
            const instances = result.databases || [];
            if (result.error) {
                showDbErrorPopup(result.error, result.instructions);
            } else {
                dbLastFetchError = null;
            }
            content.innerHTML = `
                ${result.error ? `<div class="db-step-error-bar"><span class="db-error-reopen" onclick="reopenDbErrorPopup()" title="View error details">&#128577; Unable to list RDS — Click to see instructions</span></div>` : ''}
                <div class="db-step-field">
                    <label>Select RDS Instance</label>
                    <div id="dbStepInstanceList" class="db-step-instance-list">
                        ${instances.length ? instances.map(inst => {
                            const eng = (inst.engine || selectedEngine.engine || 'mysql').toString().toLowerCase();
                            const defaultDb = inst.name || 'default';
                            return `<label class="db-instance-card">
                                <input type="radio" name="dbInstance" value="${inst.id}" data-name="${defaultDb}" data-host="${inst.host}" data-port="${inst.port || 3306}" data-engine="${eng}" onchange="onDbStepInstanceSelect(this)">
                                <div class="db-instance-card-inner">
                                    <i class="fas fa-database"></i>
                                    <div>
                                        <strong>${inst.id}</strong>
                                        <small>${inst.engine} @ ${inst.host}</small>
                                    </div>
                                </div>
                            </label>`;
                        }).join('') : '<p class="db-step-empty">No instances found. Enter host manually below.</p>'}
                    </div>
                </div>
            `;
            if (!instances.length) {
                content.innerHTML += `<div class="db-step-field"><label>Instance Host</label><input type="text" id="dbStepHost" placeholder="e.g. mydb.xxx.us-east-1.rds.amazonaws.com" class="db-step-input"></div>
                    <div class="db-step-field"><label>Database Name</label><input type="text" id="dbStepDbName" placeholder="e.g. mydb" class="db-step-input"></div>`;
            }
        } else if (step === 3 && useChatFlow) {
            const inst = dbRequestDraft._selectedInstance || {};
            const defaultDb = inst.name || 'default';
            content.innerHTML = `
                <div class="db-step-field">
                    <label>Database Name</label>
                    <input type="text" id="dbStepDbName" placeholder="e.g. mydb" class="db-step-input" value="${(defaultDb || '').replace(/"/g, '&quot;')}">
                    <small class="db-step-hint">Enter the database name inside the instance. Multiple databases: comma-separated.</small>
                </div>
            `;
        } else if (step === 2 && !useChatFlow) {
            const accountId = document.getElementById('dbStepAccount')?.value || dbRequestDraft?.account_id;
            const result = await fetchDatabasesForAccount(accountId);
            const dbs = result.databases || [];
            if (result.error) {
                showDbErrorPopup(result.error, result.instructions);
            } else {
                dbLastFetchError = null;
            }
            content.innerHTML = `
                ${result.error ? `<div class="db-step-error-bar"><span class="db-error-reopen" onclick="reopenDbErrorPopup()" title="View error details">&#128577; Unable to list databases — Click to see instructions</span></div>` : ''}
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

async function fetchDatabasesForAccount(accountId) {
    if (!accountId) return { databases: [], error: null, instructions: [] };
    try {
        const r = await fetch(`${DB_API_BASE}/api/databases?account_id=${accountId}`);
        const data = await r.json();
        return {
            databases: data.databases || [],
            error: data.error || null,
            instructions: data.instructions || []
        };
    } catch (e) {
        return {
            databases: [],
            error: e.message || 'Failed to fetch RDS instances',
            instructions: [
                'Check that the backend server is running and reachable.',
                'Ensure CORS is configured if frontend and backend are on different origins.'
            ]
        };
    }
}

let dbLastFetchError = null;

function showDbErrorPopup(error, instructions) {
    dbLastFetchError = { error, instructions };
    const popup = document.getElementById('dbErrorPopup');
    if (!popup) return;
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
        showDbErrorPopup(dbLastFetchError.error, dbLastFetchError.instructions);
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

function onDbStepInstanceSelect(radio) {
    if (!radio) return;
    dbRequestDraft = dbRequestDraft || {};
    dbRequestDraft._selectedInstance = {
        id: radio.value,
        name: radio.getAttribute('data-name'),
        host: radio.getAttribute('data-host'),
        port: radio.getAttribute('data-port') || 3306,
        engine: radio.getAttribute('data-engine')
    };
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
    const useChatFlow = provider === 'aws' && AWS_CHAT_FLOW_ENGINES.includes((selectedEngine.engine || '').toLowerCase());

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
        if (step === 2 && useChatFlow) {
            const result = await fetchDatabasesForAccount(dbRequestDraft.account_id);
            const instances = result.databases || [];
            const selectedRadio = document.querySelector('#dbStepInstanceList input[name="dbInstance"]:checked');
            if (instances.length) {
                if (!selectedRadio) {
                    alert('Please select an RDS instance.');
                    return;
                }
                dbRequestDraft._selectedInstance = {
                    id: selectedRadio.value,
                    name: selectedRadio.getAttribute('data-name'),
                    host: selectedRadio.getAttribute('data-host'),
                    port: selectedRadio.getAttribute('data-port') || 3306,
                    engine: selectedRadio.getAttribute('data-engine')
                };
            } else {
                const host = document.getElementById('dbStepHost')?.value?.trim();
                const dbName = document.getElementById('dbStepDbName')?.value?.trim() || 'default';
                if (!host) {
                    alert('Please enter the instance host.');
                    return;
                }
                dbRequestDraft._selectedInstance = { id: 'manual', name: dbName, host, port: 3306, engine: selectedEngine.engine };
            }
            dbStepState.step = 3;
            renderDbStepContent();
            return;
        }
        if (step === 3 && useChatFlow) {
            const inst = dbRequestDraft._selectedInstance || {};
            const dbNameInput = document.getElementById('dbStepDbName')?.value?.trim() || inst.name || 'default';
            const dbNames = dbNameInput.split(',').map(s => s.trim()).filter(Boolean);
            selectedDatabases = dbNames.map(name => ({
                id: inst.id || 'manual',
                name,
                host: inst.host,
                port: parseInt(inst.port, 10) || 3306,
                engine: inst.engine || selectedEngine.engine
            }));
            if (selectedDatabases.length === 0) {
                alert('Please enter at least one database name.');
                return;
            }
            transitionToDbChatUI();
            return;
        }
        if (step === 2 && !useChatFlow) {
            const result = await fetchDatabasesForAccount(dbRequestDraft.account_id);
            const dbs = result.databases || [];
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

function transitionToDbChatUI() {
    const stepPanel = document.getElementById('dbStepPanel');
    const aiPanel = document.getElementById('dbAiPanel');
    if (stepPanel) stepPanel.classList.add('db-step-hidden');
    if (aiPanel) aiPanel.classList.remove('db-ai-panel-hidden');
    document.getElementById('dbAiEngineLabel').textContent = selectedEngine?.label || 'Database';
    initDbChatWithPrompts(selectedEngine?.label || 'Database', selectedEngine?.engine || 'mysql');
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

function initDbChatWithPrompts(label, engine) {
    dbRequestDraft = dbRequestDraft || {};
    dbRequestDraft.duration_hours = dbRequestDraft.duration_hours || 2;
    const chat = document.getElementById('dbAiChat');
    const quickPrompts = document.getElementById('dbAiQuickPrompts');
    const dbNames = selectedDatabases?.map(d => d.name).join(', ') || 'database';
    chat.innerHTML = `
        <div class="db-ai-msg db-ai-bot db-ai-welcome">
            <div class="db-ai-msg-avatar"><i class="fas fa-robot"></i></div>
            <div class="db-ai-msg-content">
                <p><strong>Your request is ready.</strong></p>
                <p>Access to <strong>${dbNames}</strong> on ${label}.</p>
                <p>Choose an option below:</p>
            </div>
        </div>`;
    chat.scrollTop = chat.scrollHeight;
    if (quickPrompts) {
        quickPrompts.style.display = 'flex';
        quickPrompts.innerHTML = `
            <button class="db-ai-prompt-btn" onclick="sendDbAiPrompt('I need read-only access (SELECT, EXPLAIN) for querying and analytics.')">
                <i class="fas fa-eye"></i> Read-only access (SELECT, EXPLAIN)
            </button>
            <button class="db-ai-prompt-btn db-ai-prompt-custom" onclick="hideDbQuickPrompts(); document.getElementById('dbAiInput').focus();">
                <i class="fas fa-comments"></i> Chat with NPAMX for custom permissions
            </button>`;
    }
    document.getElementById('dbAiRequestSummary').style.display = 'none';
    document.getElementById('dbAiActions').style.display = 'none';
}

function sendDbAiPrompt(message) {
    document.getElementById('dbAiInput').value = message;
    sendDbAiMessage();
}

function hideDbQuickPrompts() {
    const el = document.getElementById('dbAiQuickPrompts');
    if (el) el.style.display = 'none';
}

async function sendDbAiMessage() {
    const input = document.getElementById('dbAiInput');
    const message = input.value.trim();
    if (!message) return;
    hideDbQuickPrompts();
    const chat = document.getElementById('dbAiChat');
    const thinkingEl = document.getElementById('dbAiThinking');
    chat.innerHTML += `<div class="db-ai-msg db-ai-user"><div class="db-ai-msg-avatar"><i class="fas fa-user"></i></div><div class="db-ai-msg-content"><p>${escapeHtml(message)}</p></div></div>`;
    input.value = '';
    chat.scrollTop = chat.scrollHeight;
    if (thinkingEl) thinkingEl.style.display = 'flex';
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
            if (thinkingEl) thinkingEl.style.display = 'none';
            if (!response.ok || text.trim().startsWith('<')) {
                chat.innerHTML += `<div class="db-ai-msg db-ai-error"><p>Server returned an error (${response.status}). Ensure the backend is running and reachable.</p><small style="opacity:0.8">API: ${escapeHtml((typeof DB_API_BASE !== 'undefined' ? DB_API_BASE : '') + '/api/databases/ai-chat')}</small></div>`;
            } else {
                throw parseErr;
            }
            chat.scrollTop = chat.scrollHeight;
            return;
        }
        if (thinkingEl) thinkingEl.style.display = 'none';
        if (data.conversation_id) dbConversationId = data.conversation_id;
        if (data.error) {
            chat.innerHTML += `<div class="db-ai-msg db-ai-error"><p>${escapeHtml(data.error)}</p></div>`;
        } else {
            chat.innerHTML += `<div class="db-ai-msg db-ai-bot"><div class="db-ai-msg-avatar"><i class="fas fa-robot"></i></div><div class="db-ai-msg-content"><p>${(data.response || '').replace(/\n/g, '<br>')}</p></div></div>`;
            if (data.permissions || data.suggested_role) {
                dbRequestDraft = dbRequestDraft || {};
                if (data.permissions && data.permissions.length) {
                    dbRequestDraft.permissions = Array.isArray(data.permissions) ? data.permissions.join(',') : data.permissions;
                }
                if (data.suggested_role) {
                    dbRequestDraft.role = data.suggested_role;
                }
            }
            if (selectedDatabases && selectedDatabases.length && !dbRequestDraft.role && message.toLowerCase().includes('read-only')) {
                dbRequestDraft.role = 'read_only';
                dbRequestDraft.permissions = 'SELECT, EXPLAIN';
            }
        }
        chat.scrollTop = chat.scrollHeight;
        showDbRequestSummaryIfReady();
    } catch (err) {
        const thinkingEl = document.getElementById('dbAiThinking');
        if (thinkingEl) thinkingEl.style.display = 'none';
        var apiUrl = (typeof DB_API_BASE !== 'undefined' ? DB_API_BASE : '?') + '/api/databases/ai-chat';
        chat.innerHTML += `<div class="db-ai-msg db-ai-error"><p>Error: ${escapeHtml(err.message)}</p><small style="opacity:0.8">API: ${escapeHtml(apiUrl)}</small></div>`;
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
    const fullName = (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || localStorage.getItem('userName') || userEmail.split('@')[0].replace(/\./g, ' ');
    const justification = prompt('Justification (why you need access):', dbRequestDraft.justification || '');
    if (!justification) return;
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
        var msg = `Request submitted successfully!\n\nStatus: ${data.status}\n${data.message}\n\nPlease check the approval status under My Requests tab in Databases.`;
        if (data.creation_error) msg += '\n\n' + data.creation_error;
        alert(msg);
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
            list.innerHTML = `<div class="db-requests-empty">No ${dbStatusFilter === 'all' ? '' : dbStatusFilter.replace('_', ' ') + ' '}database requests</div>`;
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
                <div class="db-request-actions" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
                    ${canEdit ? `
                    <button class="btn-primary" onclick="approveDbRequest('${req.request_id || ''}')"><i class="fas fa-check"></i> Approve</button>
                    <button class="btn-danger" onclick="denyDbRequest('${req.request_id || ''}')"><i class="fas fa-times"></i> Reject</button>
                    <button class="btn-secondary btn-sm" onclick="editDbRequestDurationModal('${req.request_id || ''}')"><i class="fas fa-edit"></i> Edit Duration</button>
                    ` : ''}
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        const list = document.getElementById('dbRequestsList');
        if (list) list.innerHTML = `<div class="db-requests-empty">Error loading requests</div>`;
    }
}

async function denyDbRequest(requestId) {
    const reason = prompt('Enter reason for rejection (required):');
    if (!reason || reason.length < 3) {
        alert('Please enter a reason (at least 3 characters).');
        return;
    }
    try {
        const res = await fetch(`${DB_API_BASE}/api/request/${requestId}/deny`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        alert('Request rejected');
        loadDbRequests();
        if (typeof loadRequests === 'function') loadRequests();
    } catch (e) {
        alert('Failed: ' + e.message);
    }
}

async function approveDbRequest(requestId) {
    if (!confirm('Approve this database access request?')) return;
    try {
        const res = await fetch(`${DB_API_BASE}/api/approve/${requestId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approver_role: 'self' })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        alert(data.message || '✅ Approved');
        loadDbRequests();
        refreshApprovedDatabases();
        if (typeof loadRequests === 'function') loadRequests();
    } catch (e) {
        alert('Failed: ' + e.message);
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
    // Always navigate to Terminal page - initTerminalPage will open the connection
    window.pendingTerminalConnection = { host, port, engine, requestId: requestId || '', dbName: dbName || 'default' };
    if (typeof showPage === 'function') {
        showPage('terminal');
    } else {
        alert('Go to Terminal page from the sidebar to connect.');
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
