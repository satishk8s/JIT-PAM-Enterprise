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
            content.innerHTML = `<div class="db-step-loading"><i class="fas fa-spinner fa-spin"></i> Fetching RDS instances…</div>`;
            const result = await fetchDatabasesForAccount(accountId, selectedEngine?.engine);
            const instances = result.databases || [];
            if (result.error) {
                showDbErrorPopup(result.error, result.instructions);
            } else {
                dbLastFetchError = null;
            }
            const emptyMsg = result.error
                ? 'Could not list RDS instances. Check permissions or enter host manually.'
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
                        <input type="text" id="dbStepInstanceSearch" placeholder="Type to filter instance ID, endpoint, or engine..." oninput="filterDbStepInstances()">
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
                                const searchText = escapeAttr(`${inst.id} ${inst.engine} ${inst.host} ${defaultDb}`.toLowerCase());
                                return `<option
                                    value="${escapeAttr(inst.id)}"
                                    data-name="${escapeAttr(defaultDb)}"
                                    data-host="${escapeAttr(inst.host)}"
                                    data-port="${escapeAttr(inst.port || 3306)}"
                                    data-engine="${escapeAttr(eng)}"
                                    data-auth-mode="${escapeAttr(inst.auth_mode || '')}"
                                    data-iam-auth-enabled="${escapeAttr(String(!!inst.iam_auth_enabled))}"
                                    data-password-auth-enabled="${escapeAttr(String(inst.password_auth_enabled !== false))}"
                                    data-db-resource-id="${escapeAttr(inst.db_resource_id || '')}"
                                    data-region="${escapeAttr(inst.region || '')}"
                                    data-search="${searchText}"
                                >${escapeHtml(inst.id)} | ${escapeHtml(inst.engine)} | ${escapeHtml(inst.host)}:${escapeHtml(String(inst.port || 3306))}</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <p id="dbStepSelectedInstanceMeta" class="db-step-selected-meta" style="display:none;"></p>
                    <p id="dbStepInstanceEmptyFiltered" class="db-step-empty db-step-empty-filter" style="display:none;">No instances match your search.</p>
                    ` : `<p class="db-step-empty">${emptyMsg}</p>`}
                </div>
                <div class="db-step-manual-toggle">
                    <button type="button" class="btn-secondary btn-sm" onclick="toggleDbManualEntry()">Can't find your instance? Enter host manually</button>
                </div>
                <div id="dbManualEntry" class="db-manual-entry" style="display:${instances.length ? 'none' : 'block'}">
                    <div class="db-step-field"><label>Instance Host</label><input type="text" id="dbStepHost" placeholder="e.g. mydb.xxx.us-east-1.rds.amazonaws.com" class="db-step-input"></div>
                    <div class="db-step-field"><label>Database Name</label><input type="text" id="dbStepDbName" placeholder="e.g. mydb" class="db-step-input"></div>
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
                ? 'Could not list databases. Check permissions or enter host manually.'
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
                        <input type="text" id="dbStepDbSearch" placeholder="Search database name, host, or engine..." oninput="filterDbStepDatabases()">
                    </div>
                </div>` : ''}
                <div class="db-step-field">
                    <label>Select Database(s)</label>
                    <div id="dbStepDbList" class="db-step-db-list">
                        ${dbs.length ? dbs.map(db => {
                            const eng = (db.engine || selectedEngine.engine || 'mysql').toString().toLowerCase();
                            const searchText = escapeAttr(`${db.name} ${db.host} ${db.engine}`.toLowerCase());
                            return `<label class="db-discover-item">
                                <input type="checkbox" value="${escapeAttr(db.id)}" data-name="${escapeAttr(db.name)}" data-host="${escapeAttr(db.host)}" data-port="${escapeAttr(db.port || 3306)}" data-engine="${escapeAttr(eng)}" onchange="toggleDbStepSelection()">
                                <span data-search="${searchText}">
                                    <strong>${escapeHtml(db.name)}</strong>
                                    <small>${escapeHtml(db.engine)} @ ${escapeHtml(db.host)}:${escapeHtml(String(db.port || 3306))}</small>
                                </span>
                            </label>`;
                        }).join('') : `<p class="db-step-empty">${emptyMsg}</p>
                        <div class="db-step-manual-toggle">
                            <button type="button" class="btn-secondary btn-sm" onclick="toggleDbManualEntry()">Or enter host manually</button>
                        </div>
                        <div id="dbManualEntry" class="db-manual-entry" style="display:none">
                            <div class="db-step-field"><label>Database Host</label><input type="text" id="dbStepHost" placeholder="e.g. mydb.xxx.us-east-1.rds.amazonaws.com" class="db-step-input"></div>
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
        host: radio.getAttribute('data-host'),
        port: radio.getAttribute('data-port') || 3306,
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

    const host = sourceEl.getAttribute('data-host') || '-';
    const port = sourceEl.getAttribute('data-port') || '3306';
    const engine = (sourceEl.getAttribute('data-engine') || selectedEngine?.engine || 'mysql').toUpperCase();
    const defaultDb = sourceEl.getAttribute('data-name') || 'default';
    meta.innerHTML = `
        <i class="fas fa-circle-check"></i>
        <span><strong>${escapeHtml(sourceEl.value)}</strong> | ${escapeHtml(engine)} | ${escapeHtml(host)}:${escapeHtml(String(port))} | default DB <strong>${escapeHtml(defaultDb)}</strong></span>
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
        host: cb.getAttribute('data-host'),
        port: cb.getAttribute('data-port') || 3306,
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
    let label = 'Continue';

    if (provider === 'aws' && useChatFlow) {
        if (step === 1) label = 'Next: Instance';
        else if (step === 2) label = 'Next: Database Name';
        else label = 'Continue to NPAMX';
    } else if (provider === 'aws' && !useChatFlow) {
        label = step === 1 ? 'Next: Databases' : 'Continue to NPAMX';
    } else {
        label = 'Continue to NPAMX';
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
            const manualHost = document.getElementById('dbStepHost')?.value?.trim();
            const manualDbName = document.getElementById('dbStepDbName')?.value?.trim() || 'default';
            if (manualHost) {
                dbRequestDraft._selectedInstance = { id: 'manual', name: manualDbName, host: manualHost, port: 3306, engine: selectedEngine.engine };
            } else if (hasDiscoveredInstances) {
                if (!selectedOption) {
                    alert('Please select an RDS instance or enter host manually.');
                    return;
                }
                dbRequestDraft._selectedInstance = {
                    id: selectedOption.value,
                    name: selectedOption.getAttribute('data-name'),
                    host: selectedOption.getAttribute('data-host'),
                    port: selectedOption.getAttribute('data-port') || 3306,
                    engine: selectedOption.getAttribute('data-engine'),
                    auth_mode: selectedOption.getAttribute('data-auth-mode') || '',
                    iam_auth_enabled: String(selectedOption.getAttribute('data-iam-auth-enabled') || '').toLowerCase() === 'true',
                    password_auth_enabled: String(selectedOption.getAttribute('data-password-auth-enabled') || '').toLowerCase() !== 'false',
                    db_resource_id: selectedOption.getAttribute('data-db-resource-id') || '',
                    region: selectedOption.getAttribute('data-region') || ''
                };
            } else {
                if (!manualHost) {
                    alert('Please enter the instance host.');
                    return;
                }
                dbRequestDraft._selectedInstance = { id: 'manual', name: manualDbName, host: manualHost, port: 3306, engine: selectedEngine.engine };
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
            const result = await fetchDatabasesForAccount(dbRequestDraft.account_id, selectedEngine?.engine);
            const dbs = result.databases || [];
            const manualHost = document.getElementById('dbStepHost')?.value?.trim();
            const manualDbName = document.getElementById('dbStepDbName')?.value?.trim() || 'default';
            if (dbs.length && selectedDatabases.length === 0 && !manualHost) {
                alert('Please select at least one database or enter host manually.');
                return;
            }
            if (!dbs.length || manualHost) {
                if (!manualHost) {
                    alert('Please enter the database host.');
                    return;
                }
                selectedDatabases = [{ id: 'manual', name: manualDbName, host: manualHost, port: 3306, engine: selectedEngine.engine }];
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

function dbAssistantAvatar() {
    return '<div class="db-ai-msg-avatar db-ai-msg-avatar-assistant"><i class="fas fa-comments"></i></div>';
}

function initDbAiChat(label, engine) {
    const chat = document.getElementById('dbAiChat');
    chat.innerHTML = `<div class="db-ai-msg db-ai-bot db-ai-welcome">
        ${dbAssistantAvatar()}
        <div class="db-ai-msg-content">
            <p><strong>Hey hi, how are you today?</strong> How can I help you with ${escapeHtml(label)} database access?</p>
            <p>Tell me your use case in plain language and I will guide the next steps.</p>
        </div>
    </div>`;
    chat.scrollTop = chat.scrollHeight;
    const quickPrompts = document.getElementById('dbAiQuickPrompts');
    if (quickPrompts) {
        quickPrompts.style.display = 'none';
        quickPrompts.innerHTML = '';
    }
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
            ${dbAssistantAvatar()}
            <div class="db-ai-msg-content">
                <p><strong>Great, ${escapeHtml(dbNames)} is selected.</strong></p>
                <p>Tell me what you want to do, and I will figure out the right access request.</p>
            </div>
        </div>`;
    chat.scrollTop = chat.scrollHeight;
    if (quickPrompts) {
        quickPrompts.style.display = 'none';
        quickPrompts.innerHTML = '';
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
    const rawMessage = input.value.trim();
    if (!rawMessage) return;
    const message = redactSensitiveChatInput(rawMessage);
    const wasRedacted = message !== rawMessage;
    hideDbQuickPrompts();
    const chat = document.getElementById('dbAiChat');
    const thinkingEl = document.getElementById('dbAiThinking');
    chat.innerHTML += `<div class="db-ai-msg db-ai-user"><div class="db-ai-msg-avatar"><i class="fas fa-user"></i></div><div class="db-ai-msg-content"><p>${escapeHtml(message)}</p></div></div>`;
    if (wasRedacted) {
        chat.innerHTML += `<div class="db-ai-msg db-ai-bot">${dbAssistantAvatar()}<div class="db-ai-msg-content"><p>Sensitive values were masked for safety.</p></div></div>`;
    }
    input.value = '';
    chat.scrollTop = chat.scrollHeight;
    if (thinkingEl) thinkingEl.style.display = 'flex';
    chat.scrollTop = chat.scrollHeight;

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
            if (thinkingEl) thinkingEl.style.display = 'none';
            if (!response.ok || text.trim().startsWith('<')) {
                chat.innerHTML += `<div class="db-ai-msg db-ai-error"><div class="db-ai-msg-avatar"><i class="fas fa-triangle-exclamation"></i></div><div class="db-ai-msg-content"><p>Server returned an error (${response.status}). Ensure the backend is running and reachable.</p><small style="opacity:0.8">API: ${escapeHtml((typeof DB_API_BASE !== 'undefined' ? DB_API_BASE : '') + '/api/databases/ai-chat')}</small></div></div>`;
            } else {
                throw parseErr;
            }
            chat.scrollTop = chat.scrollHeight;
            return;
        }
        if (thinkingEl) thinkingEl.style.display = 'none';
        if (data.conversation_id) dbConversationId = data.conversation_id;
        if (data.error) {
            chat.innerHTML += `<div class="db-ai-msg db-ai-error"><div class="db-ai-msg-avatar"><i class="fas fa-triangle-exclamation"></i></div><div class="db-ai-msg-content"><p>${escapeHtml(data.error)}</p></div></div>`;
        } else {
            const safeResponse = escapeHtml(data.response || '').replace(/\n/g, '<br>');
            chat.innerHTML += `<div class="db-ai-msg db-ai-bot">${dbAssistantAvatar()}<div class="db-ai-msg-content"><p>${safeResponse}</p></div></div>`;
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
        chat.scrollTop = chat.scrollHeight;
        showDbRequestSummaryIfReady();
    } catch (err) {
        const thinkingEl = document.getElementById('dbAiThinking');
        if (thinkingEl) thinkingEl.style.display = 'none';
        var apiUrl = (typeof DB_API_BASE !== 'undefined' ? DB_API_BASE : '?') + '/api/databases/ai-chat';
        chat.innerHTML += `<div class="db-ai-msg db-ai-error"><div class="db-ai-msg-avatar"><i class="fas fa-triangle-exclamation"></i></div><div class="db-ai-msg-content"><p>Error: ${escapeHtml(err.message)}</p><small style="opacity:0.8">API: ${escapeHtml(apiUrl)}</small></div></div>`;
        chat.scrollTop = chat.scrollHeight;
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
        const roleLabel = r => ({ read_only: 'Read-only', read_limited_write: 'Limited Write', read_full_write: 'Full Write', admin: 'Admin', custom: 'Custom (NPAMX)' })[r] || r;
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
        const roleLabel = r => ({ read_only: 'Read-only', read_limited_write: 'Limited Write', read_full_write: 'Full Write', admin: 'Admin', custom: 'Custom (NPAMX)' })[r || 'custom'] || (r || 'Custom (NPAMX)');
        tbody.innerHTML = data.databases.map(db => {
            const requestId = (db.request_id || '').replace(/'/g, "\\'");
            const dbName = (db.db_name || db.engine || '').replace(/'/g, "\\'");
            const effectiveAuth = String(db.effective_auth || 'password').toLowerCase();
            const userDisplay = effectiveAuth === 'iam'
                ? `<span class="badge">IAM token</span>`
                : `<code title="Username is masked for safety">${escapeHtml(db.masked_username || db.db_username || '')}</code>`;
            const actionBtn = effectiveAuth === 'iam'
                ? `<button class="btn-secondary btn-sm" onclick="alert('IAM auth is enabled. After approval, NPAMX assigns DB connect access via an Identity Center permission set. Use IAM token authentication to connect.')"><i class="fas fa-circle-info"></i> IAM Info</button>`
                : `<button class="btn-primary btn-sm" onclick="connectToDatabase('${db.host}', '${db.port}', '${db.engine}', '${requestId}', '${dbName}')"><i class="fas fa-terminal"></i> Connect & Run Queries</button>`;
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
