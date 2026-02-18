// Database Management - Tree + AI + JIT Access

const DB_API_BASE = (typeof API_BASE !== 'undefined') ? API_BASE.replace('/api', '') : 'http://localhost:5000';
let selectedDatabases = [];
let currentDbAccount = '';
let dbConversationId = null;
let selectedEngine = null;
let dbRequestDraft = null;
let dbStatusFilter = 'active';
let dbStepState = null; // { step: 1|2, provider: 'aws'|'managed'|'gcp'|'azure'|'oracle'|'atlas' }
let dbAccessMode = 'ai'; // 'ai' | 'structured'
let dbStructuredPermissions = [];
const dbCredCache = {}; // requestId -> { data, fetchedAt }
let dbRequestsPage = 1;
let dbRequestsPageSize = 20;
let dbRequestsSearch = '';

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
    },
    {
        id: 'privileges',
        title: 'Privileges',
        ops: ['GRANT', 'REVOKE']
    },
    {
        id: 'admin',
        title: 'Administrative',
        ops: ['EXECUTE', 'CALL', 'LOCK', 'UNLOCK']
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
}

function openStructuredDatabaseAccess() {
    try { setDbAccessMode('structured'); } catch (_) {}
    if (typeof showPage === 'function') showPage('databases');
}

function setDbAccessMode(mode) {
    const m = (mode || '').toLowerCase() === 'structured' ? 'structured' : 'ai';
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
            content.innerHTML = `<div class="db-step-loading"><i class="fas fa-spinner fa-spin"></i> Fetching RDS instances…</div>`;
            const result = await fetchDatabasesForAccount(accountId, selectedEngine?.engine);
            const instances = result.databases || [];
            if (result.error) {
                showDbErrorPopup(result.error, result.instructions);
            } else {
                dbLastFetchError = null;
            }
            const emptyMsg = result.error
                ? 'Could not list RDS instances. Check permissions or enter instance ID manually.'
                : 'No RDS instances found in this account.';
            content.innerHTML = `
                ${result.error ? `<div class="db-step-error-bar"><span class="db-error-reopen" onclick="reopenDbErrorPopup()" title="View error details">&#128577; Unable to list RDS — Click to see instructions</span> <button class="btn-secondary btn-sm" onclick="retryDbFetch()" style="margin-left:8px">Retry</button></div>` : ''}
                ${instances.length ? `
                <div class="db-step-toolbar">
                    <div class="db-step-toolbar-left">
                        <span class="db-step-count"><i class="fas fa-server"></i> <span id="dbStepInstanceCount">${instances.length}</span> Instances</span>
                        <span class="db-step-toolbar-subtle">Use search and pick from the dropdown.</span>
                    </div>
                    <div class="db-step-search">
                        <i class="fas fa-search"></i>
                        <input type="text" id="dbStepInstanceSearch" placeholder="Type to filter instance ID, engine, or default DB..." oninput="filterDbStepInstances()">
                    </div>
                </div>` : ''}
                <div class="db-step-field">
                    <label>Select RDS Instance</label>
                    ${instances.length ? `
                    <div class="db-instance-select-shell">
                        <i class="fas fa-server"></i>
                        <select id="dbStepInstanceSelect" class="db-step-select db-step-instance-select" onchange="onDbStepInstanceDropdownChange(this)">
                            <option value="">-- Select an RDS instance --</option>
                            ${instances.map(inst => {
                                const eng = (inst.engine || selectedEngine.engine || 'mysql').toString().toLowerCase();
                                const defaultDb = inst.name || 'default';
                                const searchText = escapeAttr(`${inst.id} ${inst.engine} ${defaultDb} ${inst.region || ''}`.toLowerCase());
                                return `<option
                                    value="${escapeAttr(inst.id)}"
                                    data-name="${escapeAttr(defaultDb)}"
                                    data-engine="${escapeAttr(eng)}"
                                    data-auth-mode="${escapeAttr(inst.auth_mode || '')}"
                                    data-iam-auth-enabled="${escapeAttr(String(!!inst.iam_auth_enabled))}"
                                    data-password-auth-enabled="${escapeAttr(String(inst.password_auth_enabled !== false))}"
                                    data-db-resource-id="${escapeAttr(inst.db_resource_id || '')}"
                                    data-region="${escapeAttr(inst.region || '')}"
                                    data-search="${searchText}"
                                >${escapeHtml(inst.id)} | ${escapeHtml(inst.engine)} | default DB ${escapeHtml(defaultDb)}</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <p id="dbStepSelectedInstanceMeta" class="db-step-selected-meta" style="display:none;"></p>
                    <p id="dbStepInstanceEmptyFiltered" class="db-step-empty db-step-empty-filter" style="display:none;">No instances match your search.</p>
                    ` : `<p class="db-step-empty">${emptyMsg}</p>`}
                </div>
                <div class="db-step-manual-toggle">
                    <button type="button" class="btn-secondary btn-sm" onclick="toggleDbManualEntry()">Can't find your instance? Enter instance ID manually</button>
                </div>
                <div id="dbManualEntry" class="db-manual-entry" style="display:${instances.length ? 'none' : 'block'}">
                    <div class="db-step-field"><label>RDS Instance ID</label><input type="text" id="dbStepInstanceId" placeholder="e.g. database-1" class="db-step-input"></div>
                    <div class="db-step-field"><label>Region (optional)</label><input type="text" id="dbStepInstanceRegion" placeholder="e.g. ap-south-1" class="db-step-input"></div>
                </div>
            `;
        } else if (step === 3 && useChatFlow) {
            const inst = dbRequestDraft._selectedInstance || {};
            const defaultDb = inst.name || 'default';
            content.innerHTML = `
                <div class="db-step-field">
                    <label>Database Name(s)</label>
                    <div class="db-step-dbname-shell">
                        <i class="fas fa-table"></i>
                        <input type="text" id="dbStepDbName" placeholder="e.g. mydb" class="db-step-input" value="${(defaultDb || '').replace(/"/g, '&quot;')}">
                    </div>
                    <div class="db-step-dbname-suggestions">
                        <button type="button" class="db-step-suggestion" onclick="applyDbNameSuggestion('default')">default</button>
                        <button type="button" class="db-step-suggestion" onclick="applyDbNameSuggestion('app')">app</button>
                        <button type="button" class="db-step-suggestion" onclick="applyDbNameSuggestion('analytics')">analytics</button>
                        <button type="button" class="db-step-suggestion" onclick="applyDbNameSuggestion('reporting')">reporting</button>
                    </div>
                    <small class="db-step-hint">Enter the database name inside the instance. Multiple databases: comma-separated.</small>
                </div>
            `;
        } else if (step === 2 && !useChatFlow) {
            const accountId = document.getElementById('dbStepAccount')?.value || dbRequestDraft?.account_id;
            content.innerHTML = `<div class="db-step-loading"><i class="fas fa-spinner fa-spin"></i> Fetching databases…</div>`;
            const result = await fetchDatabasesForAccount(accountId, selectedEngine?.engine);
            const dbs = result.databases || [];
            if (result.error) {
                showDbErrorPopup(result.error, result.instructions);
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
	                                <input type="checkbox" value="${escapeAttr(db.id)}" data-name="${escapeAttr(db.name)}" data-engine="${escapeAttr(eng)}" onchange="toggleDbStepSelection()">
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
    try {
        const r = await fetch(`${DB_API_BASE}/api/accounts`);
        const data = await r.json();
        return typeof data === 'object' && !Array.isArray(data) ? Object.values(data) : (data || []);
    } catch (e) {
        return [{ id: 'default', name: 'Default Account' }];
    }
}

async function fetchDatabasesForAccount(accountId, engine) {
    if (!accountId) return { databases: [], error: null, instructions: [] };
    try {
        let url = `${DB_API_BASE}/api/databases?account_id=${encodeURIComponent(accountId)}`;
        if (engine) url += `&engine=${encodeURIComponent(engine)}`;
        const r = await fetch(url);
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
        engine: radio.getAttribute('data-engine'),
        auth_mode: radio.getAttribute('data-auth-mode') || '',
        iam_auth_enabled: String(radio.getAttribute('data-iam-auth-enabled') || '').toLowerCase() === 'true',
        password_auth_enabled: String(radio.getAttribute('data-password-auth-enabled') || '').toLowerCase() !== 'false',
        db_resource_id: radio.getAttribute('data-db-resource-id') || '',
        region: radio.getAttribute('data-region') || ''
    };
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
        renderDbStepSelectedInstanceMeta(null);
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
            renderDbStepSelectedInstanceMeta(null);
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

function updateDbStepNextButton() {
    const btn = document.getElementById('dbStepNextBtn');
    if (!btn || !dbStepState || !selectedEngine) return;
    const { step, provider } = dbStepState;
    const useChatFlow = provider === 'aws' && AWS_CHAT_FLOW_ENGINES.includes((selectedEngine.engine || '').toLowerCase());
    const finalLabel = dbAccessMode === 'structured' ? 'Continue to Permissions' : 'Continue to NPAMX';
    let label = 'Continue';

    if (provider === 'aws' && useChatFlow) {
        if (step === 1) label = 'Next: Instance';
        else if (step === 2) label = 'Next: Database Name';
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
            dbStepState.step = 2;
            renderDbStepContent();
            return;
        }
        if (step === 2 && useChatFlow) {
            const select = document.getElementById('dbStepInstanceSelect');
            const hasDiscoveredInstances = !!(select && Array.from(select.options).some(opt => !!opt.value));
            const selectedOption = (select && select.value) ? select.options[select.selectedIndex] : null;
            const manualInstanceId = document.getElementById('dbStepInstanceId')?.value?.trim();
            const manualRegion = document.getElementById('dbStepInstanceRegion')?.value?.trim();
            if (manualInstanceId) {
                dbRequestDraft._selectedInstance = { id: manualInstanceId, name: 'default', engine: selectedEngine.engine, region: manualRegion || '' };
            } else if (hasDiscoveredInstances) {
                if (!selectedOption) {
                    alert('Please select an RDS instance or enter instance ID manually.');
                    return;
                }
                dbRequestDraft._selectedInstance = {
                    id: selectedOption.value,
                    name: selectedOption.getAttribute('data-name'),
                    engine: selectedOption.getAttribute('data-engine'),
                    auth_mode: selectedOption.getAttribute('data-auth-mode') || '',
                    iam_auth_enabled: String(selectedOption.getAttribute('data-iam-auth-enabled') || '').toLowerCase() === 'true',
                    password_auth_enabled: String(selectedOption.getAttribute('data-password-auth-enabled') || '').toLowerCase() !== 'false',
                    db_resource_id: selectedOption.getAttribute('data-db-resource-id') || '',
                    region: selectedOption.getAttribute('data-region') || ''
                };
            } else {
                if (!manualInstanceId) {
                    alert('Please enter the RDS instance ID.');
                    return;
                }
                dbRequestDraft._selectedInstance = { id: manualInstanceId, name: 'default', engine: selectedEngine.engine, region: manualRegion || '' };
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
                engine: inst.engine || selectedEngine.engine
            }));
            if (selectedDatabases.length === 0) {
                alert('Please enter at least one database name.');
                return;
            }
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
    document.getElementById('dbAiEngineLabel').textContent = selectedEngine?.label || 'Database';
    initDbChatWithPrompts(selectedEngine?.label || 'Database', selectedEngine?.engine || 'mysql');
}

function transitionToDbStructuredUI() {
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
    renderStructuredPermissionGroups(engine);
    hydrateStructuredSummary();
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
    const aria = variant === 'loader' ? 'aria-label="NPAMX thinking"' : 'aria-label="NPAMX"';
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
    if (chat) chat.innerHTML = '';
    const msg = `Great, ${dbNames} is selected. What do you need to do (debug errors, check schema, or fix data)?`;
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
    if (e.includes('aurora')) return 'mysql';
    if (e.includes('maria')) return 'mysql';
    return e;
}

function getStructuredPermissionGroupsForEngine(engine) {
    const e = normalizeEngineForStructured(engine);
    const isMysql = ['mysql'].includes(e);
    const isPostgres = ['postgres', 'postgresql'].includes(e);
    const isMssql = ['mssql', 'sqlserver', 'sql_server'].includes(e);
    const isRedshift = ['redshift'].includes(e);
    const isDoc = ['documentdb', 'mongodb', 'docdb'].includes(e);

    // Default: SQL-like set.
    let groups = DB_STRUCTURED_PERMISSIONS.map(g => ({ ...g, ops: [...g.ops] }));

    if (isMysql) {
        // MySQL doesn't support MERGE keyword.
        groups = groups.map(g => (g.id === 'modification' ? { ...g, ops: g.ops.filter(op => op !== 'MERGE') } : g));
    } else if (isPostgres) {
        // Postgres doesn't support DESCRIBE as a SQL keyword.
        groups = groups.map(g => (g.id === 'retrieval' ? { ...g, ops: g.ops.filter(op => op !== 'DESCRIBE') } : g));
    } else if (isRedshift) {
        // Redshift is Postgres-like; keep without DESCRIBE.
        groups = groups.map(g => (g.id === 'retrieval' ? { ...g, ops: g.ops.filter(op => op !== 'DESCRIBE') } : g));
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

function renderStructuredPermissionGroups(engine) {
    const container = document.getElementById('dbStructuredPermGroups');
    const selectedContainer = document.getElementById('dbStructuredSelected');
    if (!container || !selectedContainer) return;

    const groups = getStructuredPermissionGroupsForEngine(engine);
    container.innerHTML = groups.map(g => `
        <div class="db-perm-group" data-group="${escapeAttr(g.id)}">
            <div class="db-perm-group-title">${escapeHtml(g.title)}</div>
            <div class="db-perm-btns">
                ${(g.ops || []).map(op => `
                    <button type="button" class="db-perm-btn" data-op="${escapeAttr(op)}">${escapeHtml(op)}</button>
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
    syncStructuredPermissionUI();
}

function toggleStructuredPermission(op) {
    const perm = String(op || '').trim();
    if (!perm) return;
    const idx = dbStructuredPermissions.indexOf(perm);
    if (idx >= 0) dbStructuredPermissions.splice(idx, 1);
    else dbStructuredPermissions.push(perm);
    syncStructuredPermissionUI();
    hydrateStructuredSummary();
}

function removeStructuredPermission(op) {
    const perm = String(op || '').trim();
    if (!perm) return;
    dbStructuredPermissions = dbStructuredPermissions.filter(p => p !== perm);
    syncStructuredPermissionUI();
    hydrateStructuredSummary();
}

function syncStructuredPermissionUI() {
    const container = document.getElementById('dbStructuredPermGroups');
    const selectedContainer = document.getElementById('dbStructuredSelected');
    if (!container || !selectedContainer) return;

    const selected = new Set(dbStructuredPermissions);
    container.querySelectorAll('.db-perm-btn').forEach(btn => {
        const op = btn.getAttribute('data-op') || '';
        btn.classList.toggle('is-selected', selected.has(op));
    });

    if (!dbStructuredPermissions.length) {
        selectedContainer.innerHTML = `<div class="db-perm-selected-empty">Select one or more permissions above.</div>`;
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
}

function deriveStructuredRole(ops) {
    const perms = Array.isArray(ops) ? ops : [];
    const up = perms.map(p => String(p || '').toUpperCase());
    const hasAdminOps = up.some(p => ['GRANT', 'REVOKE', 'EXECUTE', 'CALL', 'LOCK', 'UNLOCK'].includes(p));
    if (hasAdminOps) return 'admin';
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

function setStructuredDuration(hours) {
    const el = document.getElementById('dbStructuredDuration');
    if (!el) return;
    const h = parseInt(hours, 10);
    if (!Number.isFinite(h) || h < 1 || h > 24) return;
    el.value = String(h);
    hydrateStructuredSummary();
}

function resetStructuredDbRequest() {
    dbStructuredPermissions = [];
    const dur = document.getElementById('dbStructuredDuration');
    const just = document.getElementById('dbStructuredJustification');
    if (dur) dur.value = '2';
    if (just) just.value = '';
    syncStructuredPermissionUI();
    hydrateStructuredSummary();
}

function hydrateStructuredSummary() {
    const summary = document.getElementById('dbStructuredSummary');
    if (!summary) return;
    const dbs = selectedDatabases?.map(d => d.name).filter(Boolean) || [];
    const dbNames = dbs.length ? dbs.join(', ') : (dbRequestDraft?.db_name || 'default');
    const duration = parseInt(document.getElementById('dbStructuredDuration')?.value || '2', 10) || 2;
    const justification = String(document.getElementById('dbStructuredJustification')?.value || '').trim();
    const role = deriveStructuredRole(dbStructuredPermissions);
    const ops = dbStructuredPermissions.length ? dbStructuredPermissions.join(', ') : '—';

    summary.innerHTML = `
        <div class="db-structured-summary-grid">
            <span><strong>Engine:</strong> ${escapeHtml(selectedEngine?.label || 'Database')}</span>
            <span><strong>Database(s):</strong> ${escapeHtml(dbNames)}</span>
            <span><strong>Selected Queries:</strong> ${escapeHtml(ops)}</span>
            <span><strong>Role:</strong> ${escapeHtml(getDbRoleLabel(role))}</span>
            <span><strong>Duration:</strong> ${escapeHtml(String(duration))}h</span>
            <span><strong>Reason:</strong> ${escapeHtml(justification || '—')}</span>
        </div>
    `;
    summary.style.display = 'block';
}

async function submitStructuredDbRequest() {
    if (!selectedEngine || !dbRequestDraft || !selectedDatabases?.length) {
        alert('Please select account, instance, and database first.');
        return;
    }
    if (!dbStructuredPermissions.length) {
        alert('Please select at least one query permission.');
        return;
    }
    const duration = parseInt(document.getElementById('dbStructuredDuration')?.value || '0', 10);
    if (!duration || duration < 1 || duration > 24) {
        alert('Duration must be between 1 and 24 hours.');
        return;
    }
    const justification = String(document.getElementById('dbStructuredJustification')?.value || '').trim();
    if (!justification || justification.length < 3) {
        alert('Please enter a short business justification.');
        return;
    }

    const userEmail = localStorage.getItem('userEmail') || 'user@company.com';
    const fullName = (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || localStorage.getItem('userName') || userEmail.split('@')[0].replace(/\./g, ' ');
    let accountId = dbRequestDraft.account_id || dbRequestDraft.project_id || dbRequestDraft.subscription_id || dbRequestDraft.compartment_id || dbRequestDraft.atlas_project_id || '';
    if (!accountId) {
        const accounts = await fetchAccounts();
        if (accounts.length) accountId = accounts[0].id;
    }
    const inst = dbRequestDraft?._selectedInstance || {};
    const role = deriveStructuredRole(dbStructuredPermissions);
    const query_types = deriveStructuredQueryTypes(dbStructuredPermissions);

    try {
        const res = await fetch(`${DB_API_BASE}/api/databases/request-access`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                databases: selectedDatabases,
                account_id: accountId,
                region: inst.region || '',
                db_instance_id: inst.id || '',
                user_email: userEmail,
                user_full_name: fullName,
                db_username: userEmail.split('@')[0],
                permissions: dbStructuredPermissions,
                query_types,
                role,
                duration_hours: duration,
                justification,
                preferred_auth: dbRequestDraft.preferred_auth || ''
            })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        loadDbRequests();
        refreshApprovedDatabases();
        alert(`Request submitted successfully!\n\nStatus: ${data.status}\n${data.message}\n\nTrack it under My Requests > Databases.`);
        // Keep user in structured panel but clear for next request.
        resetStructuredDbRequest();
    } catch (e) {
        alert('Failed: ' + safeUserFacingErrorMessage(e));
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
            region: selectedInstance.region || ''
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
    })[role] || 'Custom (NPAMX)';
}

function shouldShowDbRequestSummary() {
    if (!dbRequestDraft || !selectedEngine || !selectedDatabases?.length) return false;
    // Only show summary when NPAMX is at the confirmation stage (strict workflow).
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
            headers: {'Content-Type': 'application/json'},
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
    const databases = selectedDatabases?.map(d => d.name).join(', ') || (dbRequestDraft.db_name || 'default');
    const operations = permissionsText || (dbRequestDraft.role === 'read_only'
        ? 'SELECT'
        : dbRequestDraft.role === 'read_limited_write'
            ? 'SELECT, INSERT, UPDATE, DELETE'
            : dbRequestDraft.role === 'read_full_write'
                ? 'SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, TRUNCATE'
                : dbRequestDraft.role === 'admin'
                    ? 'ALL PRIVILEGES'
                    : 'Custom (NPAMX)');
    const title = dbRequestDraft._readyToSubmit ? 'Confirmed request' : 'Please confirm this request';
    summary.innerHTML = `
        <p><strong>${escapeHtml(title)}</strong></p>
        <div class="db-ai-summary-grid">
            <span><strong>Engine:</strong> ${escapeHtml(selectedEngine.label)}</span>
            <span><strong>Databases:</strong> ${escapeHtml(databases)}</span>
            <span><strong>Operations:</strong> ${escapeHtml(operations)}</span>
            <span><strong>Role:</strong> ${escapeHtml(role)}</span>
            <span><strong>Reason:</strong> ${escapeHtml(reason)}</span>
            <span><strong>Duration:</strong> ${escapeHtml(String(duration))} hour(s)</span>
        </div>`;
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

async function submitDbRequestViaAi(opts = {}) {
    if (!selectedEngine || !dbRequestDraft) {
        alert('Please complete the NPAMX conversation first. Select account and database.');
        return;
    }
    const skipPrompt = !!opts.skipPrompt;
    if (!dbRequestDraft._readyToSubmit && !dbRequestDraft.confirmed_by_user) {
        alert('Please finish the NPAMX chat and confirm the summary by replying Yes before submitting.');
        return;
    }
    const userEmail = localStorage.getItem('userEmail') || 'user@company.com';
    const fullName = (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || localStorage.getItem('userName') || userEmail.split('@')[0].replace(/\./g, ' ');
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
        const accounts = await fetchAccounts();
        if (accounts.length) accountId = accounts[0].id;
    }
    const databases = selectedDatabases.length ? selectedDatabases : [];
    if (!databases.length) {
        alert('Please select an instance and database name first.');
        return;
    }
    try {
        const inst = dbRequestDraft?._selectedInstance || {};
        const res = await fetch(`${DB_API_BASE}/api/databases/request-access`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                databases,
                account_id: accountId,
                region: inst.region || '',
                db_instance_id: inst.id || '',
                user_email: userEmail,
                user_full_name: fullName,
                db_username: userEmail.split('@')[0],
                permissions: dbRequestDraft.permissions || '',
                query_types: Array.isArray(dbRequestDraft.query_types) ? dbRequestDraft.query_types : [],
                role: dbRequestDraft.role || 'custom',
                duration_hours: dbRequestDraft.duration_hours || 2,
                justification,
                preferred_auth: dbRequestDraft.preferred_auth || '',
                ai_generated: true,
                confirmed_by_user: !!dbRequestDraft.confirmed_by_user,
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
        alert('Failed: ' + safeUserFacingErrorMessage(e));
    }
}

function filterDbRequests(status) {
    dbStatusFilter = (status || 'active');
    dbRequestsPage = 1;
    loadDbRequests();
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

async function loadDbRequests() {
    const userEmail = localStorage.getItem('userEmail') || 'satish@nykaa.com';
    try {
        const url = new URL(`${DB_API_BASE}/api/databases/requests`);
        url.searchParams.set('user_email', userEmail);
        url.searchParams.set('status', dbStatusFilter || 'active');
        url.searchParams.set('page', String(dbRequestsPage || 1));
        url.searchParams.set('page_size', String(dbRequestsPageSize || 20));
        if (dbRequestsSearch) url.searchParams.set('q', dbRequestsSearch);

        const res = await fetch(url.toString());
        const data = await res.json();
        const list = document.getElementById('dbRequestsList');
        if (!list) return;
        const requests = data.requests || [];
        renderDbRequestsPager(data);
        if (!requests || requests.length === 0) {
            const label = dbStatusFilter ? dbStatusFilter : 'active';
            list.innerHTML = `<div class="db-requests-empty">No ${escapeHtml(label)} database requests</div>`;
            return;
        }
        const roleLabel = r => ({ read_only: 'Read-only', read_limited_write: 'Limited Write', read_full_write: 'Full Write', admin: 'Admin', custom: 'Custom (NPAMX)' })[r] || r;
        const isAdminUser = (typeof currentUser !== 'undefined' && currentUser && currentUser.isAdmin) || localStorage.getItem('isAdmin') === 'true';
        const currentUserEmail = (localStorage.getItem('userEmail') || '').trim().toLowerCase();
        const canApprove = (req) => {
            if (req.status !== 'pending') return false;
            const requesterEmail = String(req.user_email || '').trim().toLowerCase();
            return isAdminUser || (currentUserEmail && requesterEmail === currentUserEmail);
        };
        list.innerHTML = requests.map(req => {
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
            const expires = req.expires_at ? new Date(req.expires_at).toLocaleString() : '—';
            const justification = String(req.justification || '').trim();
            const requestIdRaw = String(req.request_id || '');
            const requestIdEsc = requestIdRaw.replace(/'/g, "\\'");
            const isActive = req.status === 'active';
            const statusLabel = String(req.status || '').replace(/_/g, ' ');
            const domId = domIdFromRequestId(requestIdRaw);
            return `<details class="db-request-item db-request-${escapeAttr(req.status)}">
                <summary class="db-request-summary">
                    <div class="db-request-summary-left">
                        <span class="db-request-id">${escapeHtml((req.request_id || '').slice(0, 8))}</span>
                        <span class="db-request-title"><strong>${escapeHtml(eng)}</strong>${dbNames ? ` • ${escapeHtml(dbNames)}` : ''}</span>
                    </div>
                    <div class="db-request-summary-right">
                        <span class="db-request-status db-status-badge-${escapeAttr(req.status)}">${escapeHtml(statusLabel)}</span>
                        <span class="db-request-expiry">Expires: ${escapeHtml(expires)}</span>
                        <i class="fas fa-chevron-down db-request-chevron" aria-hidden="true"></i>
                    </div>
                </summary>
                <div class="db-request-details">
                    <div class="db-request-body">
                        <p><span class="db-req-proxy">Proxy:</span> <code>${escapeHtml(String(db?.host || '-'))}:${escapeHtml(String(db?.port || '-'))}</code></p>
                        <p>Queries: <span class="db-req-perms">${escapeHtml(permsText)}</span></p>
                        <p>Role: ${escapeHtml(roleLabel(req.role))} | ${escapeHtml(String(req.duration_hours || 2))}h</p>
                        ${justification ? `<p class="db-req-justification">${escapeHtml(justification)}</p>` : ''}
                        ${isActive ? `<div class="db-cred-inline" id="dbCredInline-${escapeAttr(domId)}" style="display:none;"></div>` : ''}
                    </div>
                    <div class="db-request-actions" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
                        <button class="btn-secondary btn-sm" onclick="viewDbRequestDetails('${requestIdEsc}')"><i class="fas fa-circle-info"></i> View</button>
                        ${isActive ? `
                            <button class="btn-primary btn-sm" onclick="connectToDatabase('${String(db?.host || '').replace(/'/g, "\\'")}', '${String(db?.port || '').replace(/'/g, "\\'")}', '${eng.replace(/'/g, "\\'")}', '${requestIdEsc}', '${firstDbName}')"><i class="fas fa-terminal"></i> PAM Terminal</button>
                            <button class="btn-secondary btn-sm" onclick="toggleDbCredInline('${requestIdEsc}')"><i class="fas fa-key"></i> Credentials</button>
                            <button class="btn-secondary btn-sm" onclick="openDbExternalToolModal('${requestIdEsc}')"><i class="fas fa-up-right-from-square"></i> External Tool</button>
                        ` : ''}
                        ${req.status === 'approved' ? `
                            <button class="btn-secondary btn-sm" onclick="retryDbActivation('${requestIdEsc}')"><i class="fas fa-rotate-right"></i> Activate</button>
                        ` : ''}
                        ${canApprove(req) ? `
                        <button class="btn-primary btn-sm" onclick="approveDbRequest('${requestIdEsc}')"><i class="fas fa-check"></i> Approve</button>
                        <button class="btn-danger btn-sm" onclick="denyDbRequest('${requestIdEsc}')"><i class="fas fa-times"></i> Reject</button>
                        ` : ''}
                    </div>
                </div>
            </details>`;
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
        alert('Failed: ' + safeUserFacingErrorMessage(e));
    }
}

async function approveDbRequest(requestId) {
    if (!confirm('Approve this database access request?')) return;
    const role = (prompt('Approve as which role? (manager, db_owner, ciso)', 'manager') || '').trim().toLowerCase();
    if (!role) return;
    try {
        const res = await fetch(`${DB_API_BASE}/api/approve/${requestId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approver_role: role })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        alert(data.message || '✅ Approved');
        loadDbRequests();
        refreshApprovedDatabases();
        if (typeof loadRequests === 'function') loadRequests();
    } catch (e) {
        alert('Failed: ' + safeUserFacingErrorMessage(e));
    }
}

async function retryDbActivation(requestId) {
    if (!requestId) return;
    const userEmail = localStorage.getItem('userEmail') || '';
    try {
        const res = await fetch(`${DB_API_BASE}/api/databases/request/${encodeURIComponent(requestId)}/activate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_email: userEmail })
        });
        const data = await res.json();
        if (data.error) {
            // `error` is sanitized server-side; still run client-side safety sanitizer.
            throw new Error(data.error);
        }
        alert(data.message || 'Activation requested.');
        loadDbRequests();
        refreshApprovedDatabases();
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
    try {
        await navigator.clipboard.writeText(String(text || ''));
        return true;
    } catch (_) {
        return false;
    }
}

async function fetchDbCredentials(requestId) {
    const rid = String(requestId || '').trim();
    if (!rid) throw new Error('Missing request id');
    if (dbCredCache[rid]?.data) {
        const cached = dbCredCache[rid].data;
        const isIam = String(cached?.effective_auth || '').toLowerCase() === 'iam';
        // IAM tokens are short-lived; refresh frequently to avoid stale tokens.
        if (!isIam) return cached;
        if (Date.now() - (dbCredCache[rid].fetchedAt || 0) < 60 * 1000) return cached;
    }

    const userEmail = localStorage.getItem('userEmail') || '';
    const res = await fetch(`${DB_API_BASE}/api/databases/request/${encodeURIComponent(rid)}/credentials?user_email=${encodeURIComponent(userEmail)}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    dbCredCache[rid] = { data, fetchedAt: Date.now() };
    return data;
}

function renderDbCredentialsInline(containerEl, creds) {
    const proxyHost = creds.proxy_host || '—';
    const proxyPort = creds.proxy_port || '—';
    const username = creds.db_username || '—';
    const expires = creds.expires_at ? new Date(creds.expires_at).toLocaleString() : '—';
    const password = creds.password || creds.vault_token || '';
    const isIam = String(creds.effective_auth || '').toLowerCase() === 'iam';
    const tokenExpires = creds.iam_token_expires_at ? new Date(creds.iam_token_expires_at).toLocaleString() : '';
    const localInstr = creds.local_token_instructions;
    const localBlock = (localInstr && localInstr.available && Array.isArray(localInstr.steps))
        ? `
        <details class="db-cred-local-instr" style="margin-top:14px;border:1px solid var(--border-color);border-radius:10px;overflow:hidden;">
            <summary style="padding:10px 14px;cursor:pointer;font-weight:600;background:var(--bg-secondary);">
                <i class="fas fa-laptop-code"></i> ${escapeHtml(localInstr.heading || 'Generate IAM token on your machine')}
            </summary>
            <div style="padding:12px 14px;font-size:13px;">
                <p class="db-step-hint" style="margin-bottom:10px;">Configure AWS credentials (SSO or access key), then run:</p>
                <pre style="margin:8px 0;padding:12px;background:var(--bg-primary);border-radius:8px;overflow-x:auto;font-size:12px;">${escapeHtml(localInstr.cli_command || '')}</pre>
                <ol style="margin:8px 0 0 0;padding-left:18px;">
                    ${(localInstr.steps || []).map(s => `<li style="margin:4px 0;">${escapeHtml(s)}</li>`).join('')}
                </ol>
            </div>
        </details>`
        : '';

    containerEl.innerHTML = `
        <div class="db-cred-inline-grid">
            <div><div class="db-cred-k">Proxy Host</div><div class="db-cred-v"><code>${escapeHtml(proxyHost)}</code></div></div>
            <div><div class="db-cred-k">Proxy Port</div><div class="db-cred-v"><code>${escapeHtml(String(proxyPort))}</code></div></div>
            <div><div class="db-cred-k">DB Username</div><div class="db-cred-v"><code>${escapeHtml(username)}</code></div></div>
            <div><div class="db-cred-k">Expiry</div><div class="db-cred-v">${escapeHtml(expires)}</div></div>
        </div>
        <div class="db-cred-password">
            <div class="db-cred-k">${isIam ? 'IAM Token (Password)' : 'Password'}</div>
            ${isIam && tokenExpires ? `<div class="db-cred-note">Token valid until ${escapeHtml(tokenExpires)} (generate a fresh token if it expires).</div>` : ''}
            <div class="db-cred-password-row">
                <input id="dbCredPwd-${escapeAttr(containerEl.dataset.reqid || '')}" type="password" value="${escapeAttr(password)}" readonly>
                <button class="btn-secondary btn-sm" onclick="(function(){const el=document.getElementById('dbCredPwd-${escapeAttr(containerEl.dataset.reqid || '')}'); if(!el) return; el.type = (el.type==='password')?'text':'password';})()">
                    <i class="fas fa-eye"></i> Show
                </button>
                <button class="btn-primary btn-sm" onclick="(async function(){const el=document.getElementById('dbCredPwd-${escapeAttr(containerEl.dataset.reqid || '')}'); if(!el) return; const ok=await copyToClipboard(el.value); alert(ok?'Copied':'Copy failed');})()">
                    <i class="fas fa-copy"></i> Copy
                </button>
            </div>
        </div>
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
    el.innerHTML = `<div class="db-cred-loading"><i class="fas fa-spinner fa-spin"></i> Loading credentials…</div>`;
    el.dataset.reqid = domId;

    try {
        const creds = await fetchDbCredentials(rid);
        renderDbCredentialsInline(el, creds);
    } catch (e) {
        el.innerHTML = `<div class="db-cred-error">Failed to load credentials: ${escapeHtml(safeUserFacingErrorMessage(e))}</div>`;
    }
}

async function openDbExternalToolModal(requestId) {
    if (!requestId) return;
    const userEmail = localStorage.getItem('userEmail') || '';
    try {
        const res = await fetch(`${DB_API_BASE}/api/databases/request/${encodeURIComponent(requestId)}/credentials?user_email=${encodeURIComponent(userEmail)}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        closeDbExternalToolModal();
        const modal = document.createElement('div');
        modal.id = 'dbExternalToolModal';
        modal.className = 'db-modal-wrap';

        const expires = data.expires_at ? new Date(data.expires_at).toLocaleString() : '—';
        const proxyHost = data.proxy_host || '—';
        const proxyPort = data.proxy_port || '—';
        const username = data.db_username || '—';
        const dbName = data.database || 'default';
        const isIam = String(data.effective_auth || '').toLowerCase() === 'iam';

        const tokenExpires = data.iam_token_expires_at ? new Date(data.iam_token_expires_at).toLocaleString() : '';
        const tokenField = `
            <div class="db-modal-grid" style="margin-top:14px;">
                <div style="grid-column: 1 / -1;">
                    <strong>${isIam ? 'IAM Token (Password)' : 'Password (Vault Token)'}</strong>
                    ${isIam && tokenExpires ? `<div class="db-step-hint" style="margin-top:6px;">Token valid until <strong>${escapeHtml(tokenExpires)}</strong>. Generate a fresh token if it expires.</div>` : ''}
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

        const localInstr = data.local_token_instructions;
        const localBlock = (localInstr && localInstr.available && localInstr.cli_command)
            ? `
            <details class="db-cred-local-instr" style="margin-top:14px;border:1px solid var(--border-color);border-radius:10px;overflow:hidden;">
                <summary style="padding:10px 14px;cursor:pointer;font-weight:600;background:var(--bg-secondary);">
                    <i class="fas fa-laptop-code"></i> ${escapeHtml(localInstr.heading || 'Generate IAM token on your machine')}
                </summary>
                <div style="padding:12px 14px;font-size:13px;">
                    <p class="db-step-hint" style="margin-bottom:10px;">Configure AWS credentials (e.g. <code>aws sso login</code> or access key), then run:</p>
                    <pre style="margin:8px 0;padding:12px;background:var(--bg-primary);border-radius:8px;overflow-x:auto;font-size:12px;">${escapeHtml(localInstr.cli_command)}</pre>
                    ${Array.isArray(localInstr.steps) && localInstr.steps.length ? `<ol style="margin:8px 0 0 0;padding-left:18px;">${localInstr.steps.map(s => `<li style="margin:4px 0;">${escapeHtml(s)}</li>`).join('')}</ol>` : ''}
                </div>
            </details>`
            : '';

        modal.innerHTML = `
          <div class="db-modal-backdrop" onclick="closeDbExternalToolModal()"></div>
          <div class="db-modal">
            <div class="db-modal-header">
              <div class="db-modal-title">
                <span class="db-modal-title-main">External Tool Credentials</span>
                <span class="db-modal-sub">Request: <code>${escapeHtml(requestId)}</code></span>
              </div>
              <button class="btn-icon" onclick="closeDbExternalToolModal()" title="Close"><i class="fas fa-times"></i></button>
            </div>
            <div class="db-modal-body">
              <div class="db-modal-grid">
                <div><strong>Proxy Host:</strong> <code>${escapeHtml(proxyHost)}</code></div>
                <div><strong>Proxy Port:</strong> <code>${escapeHtml(String(proxyPort))}</code></div>
                <div><strong>Database:</strong> <code>${escapeHtml(dbName)}</code></div>
                <div><strong>Username:</strong> <code>${escapeHtml(username)}</code></div>
                <div><strong>Expires:</strong> ${escapeHtml(expires)}</div>
              </div>
              ${tokenField}
              ${localBlock}
            </div>
          </div>
        `;
        document.body.appendChild(modal);
    } catch (e) {
        alert('Failed to load credentials: ' + safeUserFacingErrorMessage(e));
    }
}

async function viewDbRequestDetails(requestId) {
    if (!requestId) return;
    try {
        const res = await fetch(`${DB_API_BASE}/api/request/${encodeURIComponent(requestId)}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const dbs = Array.isArray(data.databases) ? data.databases : [];
        const db = dbs[0] || {};
        const perms = Array.isArray(data.permissions)
            ? data.permissions
            : (typeof data.permissions === 'string' ? data.permissions.split(',').map(s => s.trim()).filter(Boolean) : []);
        const permsText = perms.length ? perms.join(', ') : '—';
        const created = data.created_at ? new Date(data.created_at).toLocaleString() : '—';
        const expires = data.expires_at ? new Date(data.expires_at).toLocaleString() : '—';
        const status = String(data.status || 'pending');
        const role = getDbRoleLabel(String(data.role || 'custom'));
        const justification = String(data.justification || '').trim() || '—';
        const dbNames = dbs.map(d => d?.name).filter(Boolean).join(', ') || '—';
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
                <div><strong>Proxy Endpoint:</strong> <code>${escapeHtml(proxyEndpoint)}</code></div>
                <div><strong>Database(s):</strong> ${escapeHtml(dbNames)}</div>
                <div><strong>Selected Queries:</strong> ${escapeHtml(permsText)}</div>
                <div><strong>Role:</strong> ${escapeHtml(role)}</div>
                <div><strong>Duration:</strong> ${escapeHtml(String(data.duration_hours || 2))}h</div>
                <div><strong>Created:</strong> ${escapeHtml(created)}</div>
                <div><strong>Expires:</strong> ${escapeHtml(expires)}</div>
              </div>
              <div class="db-modal-justification">
                <div class="db-modal-justification-label"><strong>Justification</strong></div>
                <div class="db-modal-justification-text">${escapeHtml(justification)}</div>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
    } catch (e) {
        alert('Failed to load request details: ' + safeUserFacingErrorMessage(e));
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
        alert('Failed: ' + safeUserFacingErrorMessage(e));
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
        const roleLabel = r => ({ read_only: 'Read-only', read_limited_write: 'Limited Write', read_full_write: 'Full Write', admin: 'Admin', custom: 'Custom (NPAMX)' })[r || 'custom'] || (r || 'Custom (NPAMX)');
        tbody.innerHTML = data.databases.map(db => {
            const requestId = (db.request_id || '').replace(/'/g, "\\'");
            const dbName = (db.db_name || db.engine || '').replace(/'/g, "\\'");
            const effectiveAuth = String(db.effective_auth || 'password').toLowerCase();
            const userDisplay = effectiveAuth === 'iam'
                ? `<span class="badge">IAM</span> <code title="Username is masked for safety">${escapeHtml(db.masked_username || '')}</code>`
                : `<code title="Username is masked for safety">${escapeHtml(db.masked_username || '')}</code>`;
            const actionBtn = `
                <button class="btn-primary btn-sm" onclick="connectToDatabase('${db.host}', '${db.port}', '${db.engine}', '${requestId}', '${dbName}')"><i class="fas fa-terminal"></i> PAM Terminal</button>
                <button class="btn-secondary btn-sm" onclick="openDbExternalToolModal('${requestId}')"><i class="fas fa-key"></i> External Tool</button>
            `;
            return `<tr>
                <td>${db.engine}</td>
                <td><strong>${db.host}:${db.port}</strong></td>
                <td>${userDisplay}</td>
                <td><span class="badge">${roleLabel(db.role)}</span></td>
                <td>${new Date(db.expires_at).toLocaleString()}</td>
                <td>
                    ${actionBtn}
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">Error loading</td></tr>';
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
