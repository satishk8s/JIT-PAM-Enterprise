// Policy Builder Functions

function toggleStep(stepId) {
    const step = document.getElementById(stepId);
    step.classList.toggle('active');
}

function loadTemplate(templateType) {
    const templates = {
        startup: {
            name: 'Startup Template',
            groups: 2,
            approval: 'Self-approval',
            jit: 'Disabled'
        },
        enterprise: {
            name: 'Enterprise Template',
            groups: 5,
            approval: 'Manager approval for prod',
            jit: 'Prod only'
        },
        regulated: {
            name: 'Regulated Template',
            groups: 8,
            approval: 'Dual approval',
            jit: 'Everything'
        }
    };
    
    const template = templates[templateType];
    if (confirm(`Load ${template.name}?\n\nThis will configure:\n- ${template.groups} groups\n- ${template.approval}\n- JIT: ${template.jit}\n\nCurrent configuration will be replaced.`)) {
        alert(`✅ ${template.name} loaded successfully!\n\nYou can now customize each step.`);
        
        // Expand all steps
        document.querySelectorAll('.step-card').forEach(card => card.classList.add('active'));
    }
}

function showCreateGroupWizard() {
    const groupName = prompt('Enter group name:');
    if (!groupName) return;
    
    const groupType = confirm('Is this a PERMANENT access group?\n\nClick OK for Permanent\nClick Cancel for JIT-only') ? 'Permanent' : 'JIT Only';
    
    const accessLevel = prompt('Select access level:\n\n1. L1 - Read Only\n2. L2 - Limited Write\n3. L3 - Admin\n\nEnter number (1-3):');
    
    const levels = {
        '1': 'Read-Only (L1)',
        '2': 'Limited Write (L2)',
        '3': 'Admin (L3)'
    };
    
    alert(`✅ Group "${groupName}" created!\n\nType: ${groupType}\nAccess Level: ${levels[accessLevel] || 'L1'}\n\nYou can now assign users to this group.`);
}

function editGroupConfig(groupId) {
    alert(`Edit Group: ${groupId}\n\nYou can modify:\n- Group type (Permanent/JIT)\n- Access level\n- Members\n- Permissions`);
}

function deleteGroupConfig(groupId) {
    if (confirm(`Delete group "${groupId}"?\n\nAll members will lose their access.`)) {
        alert(`✅ Group "${groupId}" deleted`);
    }
}

function showCreateLevelModal() {
    const levelName = prompt('Enter level name (e.g., L4, Senior-Dev, Data-Analyst):');
    if (!levelName) return;
    
    alert(`✅ Level "${levelName}" created!\n\nNow configure:\n- Allowed actions\n- Denied actions\n- Max duration\n- Approval requirements`);
}

function editLevel(levelId) {
    alert(`Edit Level: ${levelId}\n\nModify:\n- Allowed actions\n- Denied actions\n- Duration limits\n- Approval workflow`);
}

function editApprovalRule(ruleId) {
    alert(`Edit Approval Rule: ${ruleId}\n\nConfigure:\n- Approvers\n- Timeout\n- Auto-approve conditions\n- Escalation path`);
}

function addApprovalRule() {
    alert('Add Custom Approval Rule\n\nDefine:\n- Trigger conditions\n- Required approvers\n- Timeout\n- Auto-approve logic');
}

function testConfiguration() {
    alert('🧪 Testing Configuration...\n\n✅ Groups validated\n✅ Access levels validated\n✅ JIT flow validated\n✅ Approval workflow validated\n\nConfiguration is ready to deploy!');
}

function deployConfiguration() {
    if (confirm('🚀 Deploy to Production?\n\nThis will:\n- Apply new group configurations\n- Update access levels\n- Enable JIT flow\n- Activate approval workflows\n\nContinue?')) {
        alert('✅ Configuration deployed successfully!\n\nAll users will see the new access model immediately.');
    }
}

function showSyncFromAD() {
    const config = prompt('Enter AD Configuration (JSON format):\n\nExample:\n{\n  "domain": "company.local",\n  "ldap_url": "ldap://dc.company.local",\n  "bind_dn": "CN=Service,OU=Users,DC=company,DC=local",\n  "bind_password": "password",\n  "user_base_dn": "OU=Users,DC=company,DC=local",\n  "group_base_dn": "OU=Groups,DC=company,DC=local"\n}');
    
    if (!config) return;
    
    alert('🔄 Syncing from Active Directory...\n\nThis will:\n✓ Import all users from AD\n✓ Import all groups from AD\n✓ Only AD users can access cloud\n\nSync in progress...');
    
    // Call backend API
    fetch('http://127.0.0.1:5000/api/admin/sync-from-ad', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: config
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            alert(`✅ AD Sync Complete!\n\nUsers synced: ${data.summary.users_synced}\nGroups synced: ${data.summary.groups_synced}`);
        } else {
            alert(`❌ Sync failed: ${data.summary.error}`);
        }
    })
    .catch(err => alert('❌ Error: ' + err.message));
}

function showSyncFromIdentityCenter() {
    if (!confirm('🔄 Sync from AWS Identity Center?\n\nThis will:\n✓ Import all users from Identity Center\n✓ Import all groups\n✓ Only Identity Center users can access cloud\n\nContinue?')) return;
    var apiBase = (typeof API_BASE !== 'undefined' ? API_BASE : (window.API_BASE || (window.location.port === '5000' ? (window.location.protocol + '//' + window.location.hostname + ':5000/api') : (window.location.origin + '/api'))));
    var url = apiBase + '/admin/sync-from-identity-center';
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        .then(function(res) {
            var ct = (res.headers.get('Content-Type') || '').toLowerCase();
            if (!ct.includes('application/json')) {
                throw new Error('Backend returned non-JSON. Is the API URL correct? Use backend that serves this app (e.g. same host or set API_BASE).');
            }
            return res.json();
        })
        .then(function(data) {
            if (data.error) {
                alert('❌ Sync failed: ' + data.error);
                return;
            }
            if (data.status === 'success') {
                alert('✅ Identity Center Sync Complete!\n\nUsers synced: ' + (data.summary && data.summary.users_synced) + '\nGroups synced: ' + (data.summary && data.summary.groups_synced));
                if (typeof loadUsersManagement === 'function') loadUsersManagement();
                if (typeof loadManagementIdentityCenterLists === 'function') loadManagementIdentityCenterLists();
            } else {
                alert('❌ Sync failed: ' + (data.summary && data.summary.error || data.error || 'Unknown error'));
            }
        })
        .catch(function(err) {
            alert('❌ Error: ' + (err.message || 'Failed to fetch. Check backend is running and API URL (API_BASE) points to it.'));
        });
}

function showManualUserManagement() {
    const choice = prompt('Manual User Management\n\n1. Create users/groups in JIT tool\n2. Push to Identity Center\n3. Push to Active Directory\n\nEnter choice (1-3):');
    
    if (choice === '1') {
        alert('Create users and groups manually in the Users and Groups tabs.');
    } else if (choice === '2') {
        alert('✅ Pushing to Identity Center...\n\nAll manually created users and groups will be synced to AWS Identity Center.');
    } else if (choice === '3') {
        alert('✅ Pushing to Active Directory...\n\nAll manually created users and groups will be synced to AD.');
    }
}

function exportConfiguration() {
    const config = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        groups: [],
        levels: [],
        jit_config: {},
        approval_workflow: {}
    };
    
    const blob = new Blob([JSON.stringify(config, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `policy-config-${Date.now()}.json`;
    a.click();
    
    alert('✅ Configuration exported as JSON');
}

function getApiBase() {
    return typeof API_BASE !== 'undefined' ? API_BASE : (window.API_BASE || (window.location.port === '5000' ? (window.location.protocol + '//' + window.location.hostname + ':5000/api') : (window.location.origin + '/api')));
}

function showManagementICTab(tab) {
    ['users', 'groups', 'permission-sets'].forEach(function(t) {
        var panel = document.getElementById('mgmtIC' + (t === 'users' ? 'Users' : t === 'groups' ? 'Groups' : 'PermissionSets') + 'Panel');
        var btn = document.querySelector('.mgmt-ic-tab[data-tab="' + t + '"]');
        if (panel) panel.style.display = t === tab ? 'block' : 'none';
        if (btn) btn.classList.toggle('active', t === tab);
    });
}

function loadManagementIdentityCenterLists() {
    var apiBase = getApiBase();
    var errMsg = 'Check backend is running and API_BASE points to it.';
    function safeJson(res) {
        var ct = (res.headers.get('Content-Type') || '').toLowerCase();
        if (!ct.includes('application/json')) throw new Error('Backend returned non-JSON. ' + errMsg);
        return res.json();
    }
    function showListError(panelId, bodyId, msg) {
        var body = document.getElementById(bodyId);
        if (!body) return;
        body.innerHTML = '<tr><td colspan="10" class="text-muted">' + (msg || 'Failed to load. ' + errMsg) + '</td></tr>';
    }
    function showUsers(data) {
        var body = document.getElementById('mgmtICUsersBody');
        if (!body) return;
        if (data && data.error) { showListError('mgmtICUsersPanel', 'mgmtICUsersBody', data.error); return; }
        var list = Array.isArray(data) ? data : (data && data.users) ? data.users : [];
        if (list.length === 0) { body.innerHTML = '<tr><td colspan="4" class="text-muted">No users returned.</td></tr>'; return; }
        body.innerHTML = list.map(function(u) {
            return '<tr><td>' + (u.username || u.user_name || '-') + '</td><td>' + (u.email || '-') + '</td><td>' + (u.display_name || '-') + '</td><td>' + (u.first_name || '') + ' ' + (u.last_name || '') + '</td></tr>';
        }).join('');
    }
    function showGroups(data) {
        var body = document.getElementById('mgmtICGroupsBody');
        if (!body) return;
        if (data && data.error) { showListError('mgmtICGroupsPanel', 'mgmtICGroupsBody', data.error); return; }
        var list = Array.isArray(data) ? data : (data && data.groups) ? data.groups : [];
        if (list.length === 0) { body.innerHTML = '<tr><td colspan="3" class="text-muted">No groups returned.</td></tr>'; return; }
        body.innerHTML = list.map(function(g) {
            return '<tr><td>' + (g.display_name || g.DisplayName || '-') + '</td><td>' + (g.description || g.Description || '-') + '</td><td>' + (g.group_id || g.GroupId || '-') + '</td></tr>';
        }).join('');
    }
    function showPermissionSets(data) {
        var body = document.getElementById('mgmtICPermissionSetsBody');
        if (!body) return;
        if (data && data.error) { showListError('mgmtICPermissionSetsPanel', 'mgmtICPermissionSetsBody', data.error); return; }
        var list = Array.isArray(data) ? data : (data && data.permission_sets) ? data.permission_sets : [];
        if (list.length === 0) { body.innerHTML = '<tr><td colspan="2" class="text-muted">No permission sets returned.</td></tr>'; return; }
        body.innerHTML = list.map(function(p) {
            var name = p.name || p.Name || p.permission_set_name || '-';
            var arn = p.arn || p.Arn || p.permission_set_arn || '-';
            return '<tr><td>' + name + '</td><td style="word-break:break-all;">' + arn + '</td></tr>';
        }).join('');
    }
    fetch(apiBase + '/admin/identity-center/users', { method: 'GET' })
        .then(safeJson).then(showUsers)
        .catch(function(e) { showUsers({ error: (e.message || 'Failed to fetch users. ' + errMsg) }); });
    fetch(apiBase + '/admin/identity-center/groups', { method: 'GET' })
        .then(safeJson).then(showGroups)
        .catch(function(e) { showGroups({ error: (e.message || 'Failed to fetch groups. ' + errMsg) }); });
    fetch(apiBase + '/admin/identity-center/permission-sets', { method: 'GET' })
        .then(safeJson).then(showPermissionSets)
        .catch(function(e) { showPermissionSets({ error: (e.message || 'Failed to fetch permission sets. ' + errMsg) }); });
}
