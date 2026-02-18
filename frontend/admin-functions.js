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
    var form = document.getElementById('createUserForm');
    if (form) form.reset();
    var groupSel = document.getElementById('userGroup');
    if (groupSel && !groupSel.value) groupSel.value = 'readaccess';
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

// Populate group dropdown (readaccess, manager, admin)
function populateGroupDropdown() {
    var sel = document.getElementById('userGroup');
    if (sel) {
        var groups = window.USER_MGMT_GROUPS || [];
        sel.innerHTML = '<option value="">Select group</option>' +
            groups.map(function(g) { return '<option value="' + (g.id || g.name) + '">' + (g.name || g.id) + '</option>'; }).join('');
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
        createUserForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var email = (document.getElementById('userEmail') && document.getElementById('userEmail').value || '').trim();
            var firstName = (document.getElementById('userFirstName') && document.getElementById('userFirstName').value || '').trim();
            var lastName = (document.getElementById('userLastName') && document.getElementById('userLastName').value || '').trim();
            var displayName = (document.getElementById('userDisplayName') && document.getElementById('userDisplayName').value || '').trim();
            var group = (document.getElementById('userGroup') && document.getElementById('userGroup').value || '').trim();
            if (!email) {
                alert('Email address is required.');
                return;
            }
            if (!firstName || !lastName) {
                alert('First name and last name are required.');
                return;
            }
            if (!group) {
                alert('Please select a group.');
                return;
            }
            var role = _roleForGroup(group) || _normalizeRole('');
            var userData = {
                first_name: firstName,
                last_name: lastName,
                display_name: displayName || (firstName + ' ' + lastName).trim(),
                email: email,
                role: role,
                group: group
            };
            fetch((window.API_BASE || 'http://127.0.0.1:5000/api') + '/admin/create-user', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(userData)
            }).then(function(r) { return r.json(); }).then(function(result) {
                alert('User created: ' + (userData.display_name || firstName + ' ' + lastName));
                closeModal();
                addUserToStore(userData);
                if (typeof loadUsersManagement === 'function') loadUsersManagement();
            }).catch(function(err) {
                addUserToStore(userData);
                alert('User added locally: ' + (userData.display_name || firstName + ' ' + lastName) + '\n(API unavailable - saved for demo)');
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

// --- PAM solution admins (Admin → Users & Groups: who can manage this PAM) ---
function getAdminApiBase() {
    return (typeof API_BASE !== 'undefined' ? API_BASE : (window.API_BASE || (window.location.port === '5000' ? (window.location.protocol + '//' + window.location.hostname + ':5000/api') : (window.location.origin + '/api'))));
}

async function loadPamAdmins() {
    var tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    try {
        var apiBase = getAdminApiBase();
        var res = await fetch(apiBase + '/admin/pam-admins');
        var data = await res.json();
        var emails = (data && data.emails) ? data.emails : (data.pam_admins && data.pam_admins.map(function(p) { return p.email; })) || [];
        if (emails.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: var(--text-secondary);">No PAM admins yet. Search Identity Center users above and add them.</td></tr>';
            return;
        }
        tbody.innerHTML = emails.map(function(email) {
            var safe = String(email).replace(/'/g, "\\'");
            return '<tr><td>' + (email || '') + '</td><td><button type="button" class="btn-secondary btn-pam btn-sm" onclick="removePamAdmin(\'' + safe + '\')"><i class="fas fa-user-minus"></i> Remove</button></td></tr>';
        }).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: var(--danger);">Failed to load. ' + (e.message || '') + '</td></tr>';
    }
}

async function searchIdCUsersForPamAdmin() {
    var input = document.getElementById('pamAdminSearchInput');
    var resultsEl = document.getElementById('pamAdminSearchResults');
    if (!resultsEl) return;
    var q = (input && input.value) ? input.value.trim() : '';
    if (!q) {
        resultsEl.innerHTML = '<p class="text-muted" style="padding: 10px;">Enter a name or email and click Search.</p>';
        return;
    }
    resultsEl.innerHTML = '<p class="text-muted" style="padding: 10px;">Searching…</p>';
    try {
        var apiBase = getAdminApiBase();
        var res = await fetch(apiBase + '/admin/identity-center/users?search=' + encodeURIComponent(q));
        var data = await res.json();
        var users = (data && data.users) ? data.users : [];
        if (users.length === 0) {
            resultsEl.innerHTML = '<p class="text-muted" style="padding: 10px;">No Identity Center users match.</p>';
            return;
        }
        resultsEl.innerHTML = '<table class="users-table" style="width:100%; font-size: 13px;"><thead><tr><th>Name</th><th>Email</th><th>Action</th></tr></thead><tbody>' +
            users.map(function(u) {
                var name = (u.display_name || ((u.first_name || '') + ' ' + (u.last_name || '')).trim() || u.username || '—');
                var email = u.email || '—';
                var safeEmail = String(email).replace(/'/g, "\\'").replace(/"/g, '&quot;');
                return '<tr><td>' + (name || '—') + '</td><td>' + (email || '—') + '</td><td><button type="button" class="btn-primary btn-pam btn-sm" onclick="addPamAdmin(\'' + safeEmail + '\')"><i class="fas fa-plus"></i> Add as PAM admin</button></td></tr>';
            }).join('') +
            '</tbody></table>';
    } catch (e) {
        resultsEl.innerHTML = '<p class="text-muted" style="padding: 10px;">Error: ' + (e.message || 'Failed to search') + '</p>';
    }
}

async function addPamAdmin(email) {
    if (!email || email === '—') return;
    try {
        var apiBase = getAdminApiBase();
        var res = await fetch(apiBase + '/admin/pam-admins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });
        var data = await res.json();
        if (data.error) { alert('Error: ' + data.error); return; }
        if (data.status === 'already_added') { alert('User is already a PAM admin.'); }
        loadPamAdmins();
        document.getElementById('pamAdminSearchResults').innerHTML = '<p class="text-muted" style="padding: 10px;">Added. Search again to add more.</p>';
    } catch (e) {
        alert('Failed to add: ' + (e.message || ''));
    }
}

async function removePamAdmin(email) {
    if (!email || !confirm('Remove this user from PAM admins?')) return;
    try {
        var apiBase = getAdminApiBase();
        var res = await fetch(apiBase + '/admin/pam-admins/' + encodeURIComponent(email), { method: 'DELETE' });
        var data = await res.json();
        if (data.error) { alert('Error: ' + data.error); return; }
        loadPamAdmins();
    } catch (e) {
        alert('Failed to remove: ' + (e.message || ''));
    }
}

// Load users management - also populates USER_MGMT_USERS for modals (legacy; Admin tab now uses PAM admins)
async function loadUsersManagement() {
    loadPamAdmins();
    try {
        var apiBase = getAdminApiBase();
        var response = await fetch(apiBase + '/admin/users');
        var data = await response.json();
        if (Array.isArray(data)) {
            window.USER_MGMT_USERS = data;
        } else if (data && data.error) {
            console.error('Error loading users:', data.error);
        }
    } catch (e) {
        console.error('Error loading users:', e);
    }
    if (!window.USER_MGMT_USERS || window.USER_MGMT_USERS.length === 0) {
        window.USER_MGMT_USERS = [];
    }
    if (typeof updateAccessGroupCounts === 'function') updateAccessGroupCounts();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAdminAccess);
} else {
    checkAdminAccess();
}
