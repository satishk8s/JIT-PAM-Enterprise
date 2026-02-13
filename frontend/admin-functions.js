// Admin Functions - User, Group & Role Management (PAM RBAC)

// API base (works behind nginx reverse-proxy and localhost dev)
window.API_BASE = window.API_BASE || 'http://127.0.0.1:5000/api';

// Default groups and roles: readaccess, manager, admin (attach role when creating user/group)
window.USER_MGMT_GROUPS = window.USER_MGMT_GROUPS || [
    { id: 'readaccess', name: 'readaccess', role: 'Readaccess' },
    { id: 'manager', name: 'manager', role: 'Manager' },
    { id: 'admin', name: 'admin', role: 'Admin' }
];
window.PAM_ROLES = window.PAM_ROLES || [
    {
        id: 'Readaccess',
        name: 'Readaccess',
        desc: 'Read-only access to the PAM console.',
        actions: [
            'View requests and approvals',
            'View sessions',
            'View audit logs'
        ]
    },
    {
        id: 'Manager',
        name: 'Manager',
        desc: 'Operational admin access (non-superuser).',
        actions: [
            'Create users / assign groups',
            'Download logs',
            'Create guardrails',
            'Reset MFA for other users',
            'Manage integrations'
        ]
    },
    {
        id: 'Admin',
        name: 'Admin',
        desc: 'Full administrative access.',
        actions: [
            'All Manager capabilities',
            'Full PAM configuration access'
        ]
    }
];
window.USER_MGMT_USERS = window.USER_MGMT_USERS || [];

function _roleForGroup(groupId) {
    var g = String(groupId || '').toLowerCase();
    var groups = window.USER_MGMT_GROUPS || [];
    var found = groups.find(function(x) { return String(x.id || x.name || '').toLowerCase() === g; });
    return found ? String(found.role || '').trim() : '';
}

function _groupForRole(roleId) {
    var r = String(roleId || '').toLowerCase();
    var groups = window.USER_MGMT_GROUPS || [];
    var found = groups.find(function(x) { return String(x.role || '').toLowerCase() === r; });
    return found ? String(found.id || found.name || '').trim() : '';
}

function _normalizeRole(role) {
    var v = String(role || '').trim();
    if (!v) return 'Readaccess';
    var low = v.toLowerCase();
    if (low === 'readonly' || low === 'read' || low === 'readaccess') return 'Readaccess';
    if (low === 'manager') return 'Manager';
    if (low === 'admin' || low === 'administrator' || low === 'system administrator') return 'Admin';
    return v;
}

// Show admin panel button only for admins
function checkAdminAccess() {
    var adminBtn = document.getElementById('adminPanelBtn');
    if (!adminBtn) return;
    // Allow Manager/Admin to access the Admin panel (keep legacy isAdmin behavior too)
    var legacyAdmin = localStorage.getItem('isAdmin') === 'true';
    var role = _normalizeRole(localStorage.getItem('userRole'));
    var canAdmin = legacyAdmin || role === 'Admin' || role === 'Manager';
    if (canAdmin) {
        adminBtn.style.setProperty('display', 'inline-flex', 'important');
    } else {
        adminBtn.style.setProperty('display', 'none', 'important');
    }
}

// Open modal helper - hide all modals, show overlay and target modal
function openUserMgmtModal(modalId) {
    document.querySelectorAll('#modalOverlay .modal').forEach(function(m) {
        m.classList.remove('show');
    });
    document.getElementById('modalOverlay').classList.add('show');
    var modal = document.getElementById(modalId);
    if (modal) modal.classList.add('show');
}

// Show create user modal
function showCreateUserModal() {
    openUserMgmtModal('createUserModal');
    populateGroupDropdown();
    document.getElementById('createUserForm').reset();
    var roleSel = document.getElementById('userRole');
    var groupSel = document.getElementById('userGroup');
    if (roleSel && !roleSel.value) roleSel.value = 'Readaccess';
    if (groupSel && !groupSel.value) groupSel.value = _groupForRole(roleSel ? roleSel.value : 'Readaccess');
}

// Show create new group modal (Group Name + Role)
function showCreateNewGroupModal() {
    openUserMgmtModal('createNewGroupModal');
    var form = document.getElementById('createNewGroupForm');
    if (form) form.reset();
}

// Show assign users to group modal
function showCreateGroupModal() {
    openUserMgmtModal('createGroupModal');
    populateGroupUsersList();
    var form = document.getElementById('createGroupForm');
    if (form) form.reset();
}

// Populate group dropdown (readaccess, manager, admin) and role dropdown
function populateGroupDropdown() {
    var sel = document.getElementById('userGroup');
    if (sel) {
        var groups = window.USER_MGMT_GROUPS || [];
        sel.innerHTML = '<option value="">Select Group (optional)</option>' +
            groups.map(function(g) { return '<option value="' + (g.id || g.name) + '">' + (g.name || g.id) + '</option>'; }).join('');
    }
    var roleSel = document.getElementById('userRole');
    if (roleSel && !roleSel.dataset.populated) {
        var roles = window.PAM_ROLES || [{ id: 'Readaccess', name: 'Readaccess' }, { id: 'Manager', name: 'Manager' }, { id: 'Admin', name: 'Admin' }];
        roleSel.innerHTML = '<option value="">Select Role</option>' + roles.map(function(r) { return '<option value="' + (r.id || r.name) + '">' + (r.name || r.id) + '</option>'; }).join('');
        roleSel.dataset.populated = 'true';
    }
}

// Populate users checklist for Add Group modal
function populateGroupUsersList() {
    var container = document.getElementById('groupUsersList');
    if (!container) return;
    var users = window.USER_MGMT_USERS || [];
    if (users.length === 0) {
        container.innerHTML = '<p class="text-muted">No users found. Create users first.</p>';
        return;
    }
    container.innerHTML = '<div class="users-checklist-inner">' +
        users.map(function(u) {
            var name = (u.first_name || '') + ' ' + (u.last_name || '');
            name = name.trim() || u.email || u.name || 'Unknown';
            return '<label class="user-check-item"><input type="checkbox" name="groupUser" value="' + (u.email || u.id) + '"> ' + name + ' (' + (u.email || '') + ')</label>';
        }).join('') +
        '</div>';
}

// Create user form submission
document.addEventListener('DOMContentLoaded', function() {
    var createUserForm = document.getElementById('createUserForm');
    if (createUserForm) {
        // Keep role/group in sync (predefined mapping)
        var roleSel = document.getElementById('userRole');
        var groupSel = document.getElementById('userGroup');
        if (roleSel) {
            roleSel.addEventListener('change', function() {
                if (!groupSel) return;
                var g = _groupForRole(roleSel.value);
                if (g) groupSel.value = g;
            });
        }
        if (groupSel) {
            groupSel.addEventListener('change', function() {
                if (!roleSel) return;
                var r = _roleForGroup(groupSel.value);
                if (r) roleSel.value = r;
            });
        }

        createUserForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var fullName = (document.getElementById('userFirstName') && document.getElementById('userFirstName').value || '').trim();
            var parts = fullName.split(/\s+/).filter(Boolean);
            var firstName = parts[0] || '';
            var lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
            var email = (document.getElementById('userEmail') && document.getElementById('userEmail').value || '').trim();
            var role = _normalizeRole(document.getElementById('userRole') ? document.getElementById('userRole').value : '');
            var group = (document.getElementById('userGroup') && document.getElementById('userGroup').value || '').trim();
            if (!group) group = _groupForRole(role);
            if (!email) {
                alert('Email address is required.');
                return;
            }
            var userData = {
                first_name: firstName,
                last_name: lastName,
                email: email,
                role: role,
                group: group || null
            };
            fetch((window.API_BASE || 'http://127.0.0.1:5000/api') + '/admin/create-user', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(userData)
            }).then(function(r) { return r.json(); }).then(function(result) {
                alert('User created: ' + (fullName || (firstName + ' ' + lastName)).trim());
                closeModal();
                addUserToStore(userData);
                if (typeof loadUsersManagement === 'function') loadUsersManagement();
            }).catch(function(err) {
                addUserToStore(userData);
                alert('User added locally: ' + (fullName || (firstName + ' ' + lastName)).trim() + '\n(API unavailable - saved for demo)');
                closeModal();
                if (typeof loadUsersManagement === 'function') loadUsersManagement();
            });
        });
    }

    var createNewGroupForm = document.getElementById('createNewGroupForm');
    if (createNewGroupForm) {
        createNewGroupForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var nameInput = document.getElementById('newGroupName');
            var roleInput = document.getElementById('newGroupRole');
            var groupName = (nameInput && nameInput.value || '').trim().toLowerCase().replace(/\s+/g, '');
            var role = _normalizeRole(roleInput ? roleInput.value : '');
            if (!groupName) {
                alert('Please enter a group name.');
                return;
            }
            if (!role) {
                alert('Please select a role.');
                return;
            }
            var groups = window.USER_MGMT_GROUPS || [];
            if (groups.some(function(g) { return (g.id || g.name || '').toLowerCase() === groupName; })) {
                alert('A group with this name already exists.');
                return;
            }
            groups.push({ id: groupName, name: groupName, role: role });
            window.USER_MGMT_GROUPS = groups;
            alert('Group created: ' + groupName + ' (' + role + ')');
            closeModal();
            if (typeof loadUsersManagement === 'function') loadUsersManagement();
        });
    }

    var createGroupForm = document.getElementById('createGroupForm');
    if (createGroupForm) {
        createGroupForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var groupName = document.getElementById('groupName').value;
            var userIds = Array.from(document.querySelectorAll('input[name="groupUser"]:checked')).map(function(cb) { return cb.value; });
            if (!groupName) {
                alert('Please select a group.');
                return;
            }
            if (userIds.length === 0) {
                alert('Please select at least one user to assign.');
                return;
            }
            (window.USER_MGMT_USERS || []).forEach(function(u) {
                if (userIds.indexOf(u.email) >= 0) {
                    u.role = groupName;
                    u.group = groupName;
                }
            });
            alert('Assigned ' + userIds.length + ' user(s) to ' + groupName);
            closeModal();
            if (typeof loadUsersManagement === 'function') loadUsersManagement();
            if (typeof updateAccessGroupCounts === 'function') updateAccessGroupCounts();
        });
    }
});

function addUserToStore(user) {
    if (!window.USER_MGMT_USERS) window.USER_MGMT_USERS = [];
    window.USER_MGMT_USERS.push(user);
}

function updateAccessGroupCounts() {
    var users = window.USER_MGMT_USERS || [];
    var readaccess = users.filter(function(u) { var r = (u.role || u.group || '').toLowerCase(); return r === 'readaccess' || r === 'readonly'; }).length;
    var manager = users.filter(function(u) { var r = (u.role || u.group || '').toLowerCase(); return r === 'manager'; }).length;
    var admin = users.filter(function(u) { var r = (u.role || u.group || '').toLowerCase(); return r === 'admin'; }).length;
    var el;
    if (el = document.getElementById('readaccessGroupCount')) el.textContent = readaccess;
    if (el = document.getElementById('readonlyGroupCount')) el.textContent = readaccess;
    if (el = document.getElementById('managerGroupCount')) el.textContent = manager;
    if (el = document.getElementById('adminGroupCount')) el.textContent = admin;
}

// Edit user
function editUser(userId) {
    alert('Edit User: ' + userId + '\n\nEdit modal coming soon.');
}

// Delete user
function deleteUser(userId) {
    if (confirm('Delete user ' + userId + '? This action cannot be undone.')) {
        window.USER_MGMT_USERS = (window.USER_MGMT_USERS || []).filter(function(u) { return u.email !== userId; });
        alert('User ' + userId + ' deleted');
        if (typeof loadUsersManagement === 'function') loadUsersManagement();
    }
}

// Edit access group (ReadOnly, Manager, Admin)
function editAccessGroup(groupName) {
    alert('Edit Group: ' + groupName + '\n\nUse "Assign Users to Group" to add or remove users from this access group.');
}

// Delete access group - removes all users from group (resets their role)
function deleteAccessGroup(groupName) {
    if (confirm('Remove all users from ' + groupName + ' group? Users will need to be reassigned.')) {
        (window.USER_MGMT_USERS || []).forEach(function(u) {
            if (u.role === groupName || u.group === groupName) {
                u.role = 'ReadOnly';
                u.group = '';
            }
        });
        alert('All users removed from ' + groupName);
        if (typeof loadUsersManagement === 'function') loadUsersManagement();
        if (typeof updateAccessGroupCounts === 'function') updateAccessGroupCounts();
    }
}

// Alias for Groups Management UI (buttons call deleteGroup; implementation is deleteAccessGroup)
function deleteGroup(groupName) {
    deleteAccessGroup(groupName);
}

// Load users management - also populates USER_MGMT_USERS for modals
async function loadUsersManagement() {
    try {
        var response = await fetch('http://127.0.0.1:5000/api/admin/users');
        var data = await response.json();
        if (Array.isArray(data)) {
            window.USER_MGMT_USERS = data;
        }
    } catch (e) {
        console.error('Error loading users:', e);
    }
    if (!window.USER_MGMT_USERS || window.USER_MGMT_USERS.length === 0) {
        window.USER_MGMT_USERS = [
            { first_name: 'Satish', last_name: 'Korra', email: 'satish.korra@nykaa.com', role: 'Admin', group: 'DevOps Team' }
        ];
    }
    var tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    var users = window.USER_MGMT_USERS || [];
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No users found</td></tr>';
        return;
    }
    tbody.innerHTML = users.map(function(user) {
        var name = (user.first_name || '') + ' ' + (user.middle_name || '') + ' ' + (user.last_name || '');
        name = name.trim() || user.email;
        var role = (user.role || 'ReadOnly');
        var badgeClass = role === 'Admin' ? 'badge-danger' : role === 'Manager' ? 'badge-warning' : 'badge-info';
        return '<tr>' +
            '<td>' + name + '</td>' +
            '<td>' + (user.email || 'N/A') + '</td>' +
            '<td>' + (user.phone || 'N/A') + '</td>' +
            '<td>' + (user.department || 'N/A') + '</td>' +
            '<td>' + (user.group || 'N/A') + '</td>' +
            '<td><span class="badge ' + badgeClass + '">' + role + '</span></td>' +
            '<td><span class="badge badge-success">Active</span></td>' +
            '<td><div class="user-mgmt-actions"><button class="user-mgmt-glow-btn btn-sm" onclick="editUser(\'' + (user.email || '') + '\')">Edit</button>' +
            '<button class="user-mgmt-glow-btn btn-sm" onclick="deleteUser(\'' + (user.email || '') + '\')">Delete</button></div></td>' +
            '</tr>';
    }).join('');
    if (typeof updateAccessGroupCounts === 'function') updateAccessGroupCounts();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAdminAccess);
} else {
    checkAdminAccess();
}
