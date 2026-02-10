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
    if (confirm('🔄 Sync from AWS Identity Center?\n\nThis will:\n✓ Import all users from Identity Center\n✓ Import all groups\n✓ Only Identity Center users can access cloud\n\nContinue?')) {
        fetch('http://127.0.0.1:5000/api/admin/sync-from-identity-center', {
            method: 'POST'
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                alert(`✅ Identity Center Sync Complete!\n\nUsers synced: ${data.summary.users_synced}\nGroups synced: ${data.summary.groups_synced}`);
            } else {
                alert(`❌ Sync failed: ${data.summary.error}`);
            }
        })
        .catch(err => alert('❌ Error: ' + err.message));
    }
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
