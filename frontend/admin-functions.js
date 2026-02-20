// Admin Functions - User, Group & Role Management (PAM RBAC)

// API base (works behind nginx reverse-proxy and localhost dev)
window.API_BASE = window.API_BASE || (
    (!window.location.port || window.location.port === '80' || window.location.port === '443')
        ? (window.location.origin + '/api')
        : (window.location.protocol + '//' + window.location.hostname + ':5000/api')
);

// Default groups and roles: employees, manager, admin (attach role when creating user/group)
window.USER_MGMT_GROUPS = window.USER_MGMT_GROUPS || [
    { id: 'employees', name: 'Employees', role: 'Employee', aliases: ['readaccess', 'readonly', 'read_only', 'employee'] },
    { id: 'manager', name: 'Manager', role: 'Manager' },
    { id: 'admin', name: 'Admin', role: 'Admin' }
];
window.PAM_ROLES = window.PAM_ROLES || [
    {
        id: 'Employee',
        name: 'Employees',
        desc: 'Base user access in PAM.',
        actions: [
            'View pages and available options',
            'Request access when category toggles are enabled',
            'Use terminal only when terminal toggles are enabled'
        ]
    },
    {
        id: 'Manager',
        name: 'Manager',
        desc: 'Operational access with user/group management.',
        actions: [
            'All Employees capabilities',
            'Add users to Manager group',
            'Create groups and assign users',
            'Manage integrations',
            'Download logs',
            'Access Admin panel'
        ]
    },
    {
        id: 'Admin',
        name: 'Admin',
        desc: 'Full administrative access.',
        actions: [
            'All Manager capabilities',
            'Add or remove users from Manager group',
            'Full PAM configuration access'
        ]
    }
];
window.PAM_ADMIN_CONTEXT = window.PAM_ADMIN_CONTEXT || {
    actor_role: '',
    can_manage_admins: false,
    is_super_admin: false
};
window.USER_MGMT_USERS = window.USER_MGMT_USERS || [];

function _roleForGroup(groupId) {
    var g = _normalizeGroupId(groupId);
    var groups = window.USER_MGMT_GROUPS || [];
    var found = groups.find(function(x) {
        var id = _normalizeGroupId(x.id || x.name || '');
        if (id === g) return true;
        var aliases = Array.isArray(x.aliases) ? x.aliases : [];
        return aliases.some(function(a) { return _normalizeGroupId(a) === g; });
    });
    return found ? String(found.role || '').trim() : '';
}

function _groupForRole(roleId) {
    var r = _normalizeRole(roleId).toLowerCase();
    var groups = window.USER_MGMT_GROUPS || [];
    var found = groups.find(function(x) { return _normalizeRole(x.role || '').toLowerCase() === r; });
    return found ? String(found.id || found.name || '').trim() : '';
}

function _normalizeGroupId(groupId) {
    var raw = String(groupId || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!raw) return '';
    if (raw === 'readaccess' || raw === 'readonly' || raw === 'read_only' || raw === 'employee' || raw === 'employees') return 'employees';
    if (raw === 'manager' || raw === 'managers') return 'manager';
    if (raw === 'admin' || raw === 'admins') return 'admin';
    return raw;
}

function _normalizeRole(role) {
    var v = String(role || '').trim();
    if (!v) return 'Employee';
    var low = v.toLowerCase();
    if (low === 'readonly' || low === 'read' || low === 'readaccess' || low === 'employee' || low === 'employees' || low === 'user') return 'Employee';
    if (low === 'manager') return 'Manager';
    if (low === 'superadmin' || low === 'super_admin') return 'SuperAdmin';
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
    var canAdmin = legacyAdmin || role === 'Admin' || role === 'Manager' || role === 'SuperAdmin';
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
    if (groupSel && !groupSel.value) groupSel.value = 'employees';
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

// Populate group dropdown (employees, manager, admin)
function populateGroupDropdown() {
    var sel = document.getElementById('userGroup');
    if (sel) {
        var groups = window.USER_MGMT_GROUPS || [];
        sel.innerHTML = '<option value="">Select group</option>' +
            groups.map(function(g) {
                var gid = _normalizeGroupId(g.id || g.name || '');
                return '<option value="' + gid + '">' + (g.name || g.id || gid) + '</option>';
            }).join('');
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
            var group = _normalizeGroupId((document.getElementById('userGroup') && document.getElementById('userGroup').value || '').trim());
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
            var role = _roleForGroup(group) || _normalizeRole('employee');
            var userData = {
                first_name: firstName,
                last_name: lastName,
                display_name: displayName || (firstName + ' ' + lastName).trim(),
                email: email,
                role: role,
                group: group || 'employees'
            };
            fetch(getAdminApiBase() + '/admin/create-user', {
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
            var groupName = _normalizeGroupId(document.getElementById('groupName').value);
            var userIds = Array.from(document.querySelectorAll('input[name="groupUser"]:checked')).map(function(cb) { return cb.value; });
            if (!groupName) {
                alert('Please select a group.');
                return;
            }
            if (userIds.length === 0) {
                alert('Please select at least one user to assign.');
                return;
            }
            var actorRole = _normalizeRole(localStorage.getItem('userRole') || (localStorage.getItem('isAdmin') === 'true' ? 'Admin' : 'Employee'));
            var selectedUsers = (window.USER_MGMT_USERS || []).filter(function(u) {
                var key = u.email || u.id || '';
                return userIds.indexOf(key) >= 0;
            });
            var isRemovingFromManager = groupName !== 'manager' && selectedUsers.some(function(u) {
                return _normalizeGroupId(u.group || u.role || '') === 'manager';
            });
            if (isRemovingFromManager && actorRole === 'Manager') {
                alert('Managers can add users to Manager group, but only Admin can remove users from Manager group.');
                return;
            }

            (window.USER_MGMT_USERS || []).forEach(function(u) {
                var key = u.email || u.id || '';
                if (userIds.indexOf(key) >= 0) {
                    u.role = _roleForGroup(groupName) || _normalizeRole(groupName);
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
    var employees = users.filter(function(u) {
        var r = _normalizeRole(u.role || '');
        var g = _normalizeGroupId(u.group || '');
        return r === 'Employee' || g === 'employees';
    }).length;
    var manager = users.filter(function(u) { var r = (u.role || u.group || '').toLowerCase(); return r === 'manager'; }).length;
    var admin = users.filter(function(u) { var r = (u.role || u.group || '').toLowerCase(); return r === 'admin'; }).length;
    var el;
    if (el = document.getElementById('readaccessGroupCount')) el.textContent = employees;
    if (el = document.getElementById('readonlyGroupCount')) el.textContent = employees;
    if (el = document.getElementById('employeesGroupCount')) el.textContent = employees;
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

// Edit access group (Employees, Manager, Admin)
function editAccessGroup(groupName) {
    alert('Edit Group: ' + groupName + '\n\nUse "Assign Users to Group" to add or remove users from this access group.');
}

// Delete access group - removes all users from group (resets their role)
function deleteAccessGroup(groupName) {
    if (confirm('Remove all users from ' + groupName + ' group? Users will need to be reassigned.')) {
        (window.USER_MGMT_USERS || []).forEach(function(u) {
            if (u.role === groupName || u.group === groupName) {
                u.role = 'Employee';
                u.group = 'employees';
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
    if (typeof window !== 'undefined' && window.API_BASE) return window.API_BASE;
    if (typeof API_BASE !== 'undefined') return API_BASE;
    var port = (window.location.port || '').toString();
    if (port === '80' || port === '443' || port === '') {
        return (window.location.origin || (window.location.protocol + '//' + window.location.hostname)) + '/api';
    }
    return window.location.protocol + '//' + window.location.hostname + ':5000/api';
}

function getAdminApiCandidates() {
    var out = [];
    var preferred = getAdminApiBase();
    if (preferred) out.push(preferred);

    var originApi = (window.location.origin || (window.location.protocol + '//' + window.location.hostname)) + '/api';
    out.push(originApi);

    var backendApi = window.location.protocol + '//' + window.location.hostname + ':5000/api';
    out.push(backendApi);

    var dedup = [];
    out.forEach(function(v) {
        var s = String(v || '').replace(/\/+$/, '');
        if (s && dedup.indexOf(s) === -1) dedup.push(s);
    });
    return dedup;
}

async function fetchAdminJson(path, options) {
    var candidates = getAdminApiCandidates();
    var lastError = null;

    for (var i = 0; i < candidates.length; i++) {
        var base = candidates[i];
        try {
            var res = await fetch(base + path, options || {});
            var text = await res.text();
            var contentType = (res.headers.get('Content-Type') || '').toLowerCase();
            var trimmed = (text || '').trim().toLowerCase();
            var looksLikeHtml = trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.startsWith('<');
            if (!contentType.includes('application/json') || looksLikeHtml) {
                lastError = new Error('Server returned non-JSON.');
                continue;
            }
            var data = text ? JSON.parse(text) : {};
            if (window.API_BASE !== base) window.API_BASE = base;
            return { data: data, response: res, apiBase: base };
        } catch (e) {
            lastError = e;
        }
    }

    throw (lastError || new Error('Backend unavailable'));
}

async function loadPamAdmins() {
    var tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    try {
        var result = await fetchAdminJson('/admin/pam-admins');
        var data = result.data || {};
        window.PAM_ADMIN_CONTEXT = {
            actor_role: String(data.actor_role || ''),
            can_manage_admins: data.can_manage_admins === true,
            is_super_admin: data.is_super_admin === true
        };
        var list = (data && data.pam_admins) ? data.pam_admins : [];
        var canManage = window.PAM_ADMIN_CONTEXT.can_manage_admins === true;
        if (list.length === 0) {
            var emptyMsg = canManage
                ? 'No PAM admins yet. Search Identity Center users above and add them with a role.'
                : 'No PAM admins found. Your account does not have permission to manage PAM admins.';
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-secondary);">' + emptyMsg + '</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(function(a) {
            var email = a.email || a;
            var role = a.role || 'Admin';
            var safe = String(email).replace(/'/g, "\\'");
            var targetIsSuperAdmin = String(role || '').toLowerCase() === 'superadmin';
            var canRemove = canManage && (!targetIsSuperAdmin || window.PAM_ADMIN_CONTEXT.is_super_admin);
            var actionHtml = canRemove
                ? '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="removePamAdmin(\'' + safe + '\')"><i class="fas fa-user-minus"></i> Remove</button>'
                : '<span class="text-muted">Restricted</span>';
            return '<tr><td>' + (email || '') + '</td><td><span class="badge">' + (role || 'Admin') + '</span></td><td>' + actionHtml + '</td></tr>';
        }).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--danger);">Failed to load. ' + (e.message || '') + '</td></tr>';
    }
}

async function searchIdCUsersForPamAdmin() {
    var input = document.getElementById('pamAdminSearchInput');
    var resultsEl = document.getElementById('pamAdminSearchResults');
    if (!resultsEl) return;
    if (window.PAM_ADMIN_CONTEXT && window.PAM_ADMIN_CONTEXT.can_manage_admins !== true) {
        resultsEl.innerHTML = '<p class="text-muted" style="padding: 10px;">You do not have permission to manage PAM admins.</p>';
        return;
    }
    var q = (input && input.value) ? input.value.trim() : '';
    if (!q) {
        resultsEl.innerHTML = '<p class="text-muted" style="padding: 10px;">Enter a name or email and click Search.</p>';
        return;
    }
    resultsEl.innerHTML = '<p class="text-muted" style="padding: 10px;">Searching…</p>';
    try {
        // Use list endpoint with ?q= so filtering works even if /search path is stripped by proxy
        var result = await fetchAdminJson('/admin/identity-center/users?q=' + encodeURIComponent(q));
        var data = result.data || {};
        if (data && data.error) {
            resultsEl.innerHTML = '<p class="text-muted" style="padding: 10px;">' + (data.error || 'Backend error') + '</p>';
            return;
        }
        var users = (data && data.users) ? data.users : [];
        var ql = q.toLowerCase();
        users = users.filter(function(u) {
            var email = (u.email || '').toLowerCase();
            var display = (u.display_name || '').toLowerCase();
            var first = (u.first_name || '').toLowerCase();
            var last = (u.last_name || '').toLowerCase();
            var uname = (u.username || '').toLowerCase();
            return email.indexOf(ql) !== -1 || display.indexOf(ql) !== -1 || first.indexOf(ql) !== -1 || last.indexOf(ql) !== -1 || uname.indexOf(ql) !== -1;
        });
        if (users.length === 0) {
            resultsEl.innerHTML = '<p class="text-muted" style="padding: 10px;">No Identity Center users match &quot;' + String(q).replace(/</g, '&lt;') + '&quot;.</p>';
            return;
        }
        resultsEl.innerHTML = '<table class="users-table" style="width:100%; font-size: 13px;"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Action</th></tr></thead><tbody>' +
            users.map(function(u) {
                var name = (u.display_name || ((u.first_name || '') + ' ' + (u.last_name || '')).trim() || u.username || '—');
                var email = u.email || '—';
                var emailAttr = String(email).replace(/"/g, '&quot;').replace(/</g, '&lt;');
                var roleOptions = '<option value="Admin">Admin</option><option value="Manager">Manager</option>';
                if (window.PAM_ADMIN_CONTEXT && window.PAM_ADMIN_CONTEXT.is_super_admin === true) {
                    roleOptions += '<option value="SuperAdmin">SuperAdmin</option>';
                }
                return '<tr><td>' + (name || '—') + '</td><td>' + (email || '—') + '</td><td><select class="pam-admin-role-select">' + roleOptions + '</select></td><td><button type="button" class="btn-primary btn-pam btn-sm" onclick="addPamAdminWithRole(this)" data-email="' + emailAttr + '"><i class="fas fa-plus"></i> Add as PAM admin</button></td></tr>';
            }).join('') +
            '</tbody></table>';
    } catch (e) {
        resultsEl.innerHTML = '<p class="text-muted" style="padding: 10px;">Error: ' + (e.message || 'Failed to search') + '</p>';
    }
}

function addPamAdminWithRole(btn) {
    var row = btn.closest('tr');
    if (!row) return;
    var email = (btn.getAttribute('data-email') || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').trim();
    var select = row.querySelector('.pam-admin-role-select');
    var role = (select && select.value) ? select.value : 'Admin';
    addPamAdmin(email, role);
}

async function addPamAdmin(email, role) {
    if (!email || email === '—') return;
    if (window.PAM_ADMIN_CONTEXT && window.PAM_ADMIN_CONTEXT.can_manage_admins !== true) {
        alert('You do not have permission to manage PAM admins.');
        return;
    }
    role = role || 'Admin';
    try {
        var result = await fetchAdminJson('/admin/pam-admins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, role: role })
        });
        var data = result.data || {};
        if (data.error) { alert('Error: ' + data.error); return; }
        if (data.status === 'already_added') { alert('User is already a PAM admin.'); }
        loadPamAdmins();
        var resultsEl = document.getElementById('pamAdminSearchResults');
        if (resultsEl) resultsEl.innerHTML = '<p class="text-muted" style="padding: 10px;">Added as ' + role + '. Search again to add more.</p>';
    } catch (e) {
        alert('Failed to add: ' + (e.message || ''));
    }
}

async function removePamAdmin(email) {
    if (!email || !confirm('Remove this user from PAM admins?')) return;
    if (window.PAM_ADMIN_CONTEXT && window.PAM_ADMIN_CONTEXT.can_manage_admins !== true) {
        alert('You do not have permission to manage PAM admins.');
        return;
    }
    try {
        var result = await fetchAdminJson('/admin/pam-admins/' + encodeURIComponent(email), { method: 'DELETE' });
        var data = result.data || {};
        if (data.error) { alert('Error: ' + data.error); return; }
        loadPamAdmins();
    } catch (e) {
        alert('Failed to remove: ' + (e.message || ''));
    }
}

function _escHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showAwsIdentityCenterSubTab(tab) {
    var tabKey = String(tab || 'users');
    var panels = {
        users: 'awsIdcUsersPanel',
        groups: 'awsIdcGroupsPanel',
        'permission-sets': 'awsIdcPermissionSetsPanel',
        organization: 'awsIdcOrgPanel'
    };
    var buttons = {
        users: 'awsIdcUsersSubTab',
        groups: 'awsIdcGroupsSubTab',
        'permission-sets': 'awsIdcPermissionSetsSubTab',
        organization: 'awsIdcOrgSubTab'
    };
    Object.keys(panels).forEach(function(key) {
        var panel = document.getElementById(panels[key]);
        if (panel) panel.style.display = key === tabKey ? 'block' : 'none';
        var btn = document.getElementById(buttons[key]);
        if (btn) btn.classList.toggle('active', key === tabKey);
    });
}

function _renderAwsIdcUsers(data) {
    var body = document.getElementById('awsIdcUsersBody');
    if (!body) return;
    if (data && data.error) {
        body.innerHTML = '<tr><td colspan="4" class="text-danger">' + _escHtml(data.error) + '</td></tr>';
        return;
    }
    var list = Array.isArray(data) ? data : (data && data.users) ? data.users : [];
    if (!list.length) {
        body.innerHTML = '<tr><td colspan="4" class="text-muted">No users returned.</td></tr>';
        return;
    }
    body.innerHTML = list.map(function(u) {
        var full = [u.first_name || '', u.last_name || ''].join(' ').trim();
        return '<tr>'
            + '<td>' + _escHtml(u.username || '-') + '</td>'
            + '<td>' + _escHtml(u.email || '-') + '</td>'
            + '<td>' + _escHtml(u.display_name || '-') + '</td>'
            + '<td>' + _escHtml(full || '-') + '</td>'
            + '</tr>';
    }).join('');
}

function _renderAwsIdcGroups(data) {
    var body = document.getElementById('awsIdcGroupsBody');
    if (!body) return;
    if (data && data.error) {
        body.innerHTML = '<tr><td colspan="3" class="text-danger">' + _escHtml(data.error) + '</td></tr>';
        return;
    }
    var list = Array.isArray(data) ? data : (data && data.groups) ? data.groups : [];
    if (!list.length) {
        body.innerHTML = '<tr><td colspan="3" class="text-muted">No groups returned.</td></tr>';
        return;
    }
    body.innerHTML = list.map(function(g) {
        return '<tr>'
            + '<td>' + _escHtml(g.display_name || '-') + '</td>'
            + '<td>' + _escHtml(g.description || '-') + '</td>'
            + '<td>' + _escHtml(g.group_id || '-') + '</td>'
            + '</tr>';
    }).join('');
}

function _renderAwsIdcPermissionSets(data) {
    var body = document.getElementById('awsIdcPermissionSetsBody');
    if (!body) return;
    if (data && data.error) {
        body.innerHTML = '<tr><td colspan="2" class="text-danger">' + _escHtml(data.error) + '</td></tr>';
        return;
    }
    var list = Array.isArray(data) ? data : (data && data.permission_sets) ? data.permission_sets : [];
    if (!list.length) {
        body.innerHTML = '<tr><td colspan="2" class="text-muted">No permission sets returned.</td></tr>';
        return;
    }
    body.innerHTML = list.map(function(p) {
        return '<tr>'
            + '<td>' + _escHtml(p.name || '-') + '</td>'
            + '<td style="word-break: break-all;">' + _escHtml(p.arn || '-') + '</td>'
            + '</tr>';
    }).join('');
}

function _jsSingleQuote(value) {
    return String(value == null ? '' : value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}

function _normalizeEnvOption(value) {
    var raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'non prod' || raw === 'non-production' || raw === 'nonproduction') return 'nonprod';
    if (raw === 'prod' || raw === 'nonprod' || raw === 'sandbox') return raw;
    return '';
}

function _envTagSelectHtml(targetType, targetId, selectedEnv) {
    var current = _normalizeEnvOption(selectedEnv);
    var jsType = _jsSingleQuote(targetType);
    var jsId = _jsSingleQuote(targetId);
    function option(value, label) {
        var sel = current === value ? ' selected' : '';
        return '<option value="' + value + '"' + sel + '>' + label + '</option>';
    }
    return ''
        + '<label class="aws-idc-env-tag">'
        + '<span>Tag:</span>'
        + '<select onchange="saveAwsIdentityCenterEnvTag(\'' + jsType + '\', \'' + jsId + '\', this.value)">'
        + option('', 'inherit')
        + option('prod', 'prod')
        + option('nonprod', 'non prod')
        + option('sandbox', 'sandbox')
        + '</select>'
        + '</label>';
}

function _countHierarchyAccounts(rootNode) {
    function walkOu(ou) {
        var total = Array.isArray(ou.accounts) ? ou.accounts.length : 0;
        var childOus = Array.isArray(ou.ous) ? ou.ous : [];
        childOus.forEach(function(ch) { total += walkOu(ch); });
        return total;
    }
    var count = Array.isArray(rootNode.accounts) ? rootNode.accounts.length : 0;
    var ous = Array.isArray(rootNode.ous) ? rootNode.ous : [];
    ous.forEach(function(ou) { count += walkOu(ou); });
    return count;
}

function _renderAwsIdcAccountPermissionSets(accountId, targetId) {
    var target = document.getElementById(targetId);
    if (!target) return;
    target.innerHTML = '<small class="text-muted">Loading permission sets…</small>';
    fetchAdminJson('/admin/identity-center/account-permission-sets?account_id=' + encodeURIComponent(accountId))
        .then(function(resp) {
            var data = resp.data || {};
            if (data.error) {
                target.innerHTML = '<small class="text-danger">' + _escHtml(data.error) + '</small>';
                return;
            }
            var list = Array.isArray(data.permission_sets) ? data.permission_sets : [];
            if (!list.length) {
                target.innerHTML = '<small class="text-muted">No assigned permission sets found.</small>';
                return;
            }
            var names = list.map(function(p) { return _escHtml(p.name || '-'); }).join(', ');
            var more = Number(data.remaining || 0);
            target.innerHTML = '<small>Permission sets: ' + names + (more > 0 ? (' <em>' + more + ' more</em>') : '') + '</small>';
        })
        .catch(function(e) {
            target.innerHTML = '<small class="text-danger">' + _escHtml(e.message || 'Failed to load permission sets') + '</small>';
        });
}

function _renderAwsIdcAccountNode(account, depth) {
    var accountId = String(account.id || '').trim();
    var accountName = String(account.name || accountId || 'Account').trim();
    var accountEmail = String(account.email || '').trim();
    var effective = _normalizeEnvOption(account.effective_environment || account.source_environment || 'nonprod') || 'nonprod';
    var assigned = _normalizeEnvOption(account.assigned_environment);
    var envLabel = '<small>' + _escHtml(effective) + (assigned ? ' (tagged)' : ' (inherited)') + '</small>';
    var psTargetId = 'awsIdcPerms_' + accountId.replace(/[^a-zA-Z0-9_-]/g, '_');
    var jsAccountId = _jsSingleQuote(accountId);
    var jsTarget = _jsSingleQuote(psTargetId);
    return ''
        + '<div class="aws-idc-account-item" style="margin-left:' + (depth * 10) + 'px;">'
        + '<div>'
        + '<div><strong>' + _escHtml(accountName) + '</strong> <small>(' + _escHtml(accountId) + ')</small></div>'
        + (accountEmail ? '<div><small>' + _escHtml(accountEmail) + '</small></div>' : '')
        + '<div id="' + _escHtml(psTargetId) + '"><small><button type="button" class="btn-secondary btn-pam btn-sm" style="padding:2px 8px; font-size:11px;" onclick="loadAwsIdentityCenterAccountPermissionSets(\'' + jsAccountId + '\', \'' + jsTarget + '\')">Load permission sets</button></small></div>'
        + '</div>'
        + '<div style="display:flex; align-items:center; gap:10px;">'
        + envLabel
        + _envTagSelectHtml('account', accountId, assigned)
        + '</div>'
        + '</div>';
}

function _renderAwsIdcOuNode(ou, depth) {
    var ouId = String(ou.id || '').trim();
    var ouName = String(ou.name || ouId || 'OU').trim();
    var assigned = _normalizeEnvOption(ou.assigned_environment);
    var effective = _normalizeEnvOption(ou.effective_environment || 'nonprod') || 'nonprod';
    var childrenHtml = '';

    var childOus = Array.isArray(ou.ous) ? ou.ous : [];
    childOus.forEach(function(child) {
        childrenHtml += _renderAwsIdcOuNode(child, depth + 1);
    });
    var accounts = Array.isArray(ou.accounts) ? ou.accounts : [];
    accounts.forEach(function(acc) {
        childrenHtml += _renderAwsIdcAccountNode(acc, depth + 1);
    });
    if (!childrenHtml) childrenHtml = '<p class="text-muted" style="margin-left:' + ((depth + 1) * 10) + 'px;">No accounts in this OU.</p>';

    return ''
        + '<details class="aws-idc-tree-node" open>'
        + '<summary>'
        + 'OU: ' + _escHtml(ouName) + ' <small>(' + _escHtml(ouId) + ')</small> '
        + '<small>' + _escHtml(effective) + (assigned ? ' (tagged)' : ' (inherited)') + '</small> '
        + _envTagSelectHtml('ou', ouId, assigned)
        + '</summary>'
        + '<div class="aws-idc-tree-children">' + childrenHtml + '</div>'
        + '</details>';
}

function _renderAwsIdcOrgHierarchy(payload) {
    var summaryEl = document.getElementById('awsIdcOrgSummary');
    var treeEl = document.getElementById('awsIdcOrgTree');
    if (!summaryEl || !treeEl) return;
    if (payload && payload.error) {
        summaryEl.textContent = payload.error;
        treeEl.innerHTML = '<p class="text-danger">' + _escHtml(payload.error) + '</p>';
        return;
    }

    var errors = Array.isArray(payload && payload.errors) ? payload.errors : [];
    var hasAccessDenied = errors.some(function(err) {
        return /accessdenied/i.test(String(err || ''));
    });
    var warningHtml = '';
    if (errors.length) {
        warningHtml = '<div class="admin-role-hint" style="margin-bottom:10px; padding:10px; border:1px solid #f1c40f; background:#fff7db;">'
            + '<strong>Hierarchy warnings:</strong><br>'
            + errors.map(function(err) { return _escHtml(err); }).join('<br>')
            + (hasAccessDenied
                ? '<div style="margin-top:8px;"><strong>Required AWS Organizations permissions:</strong> organizations:ListRoots, organizations:ListOrganizationalUnitsForParent, organizations:ListAccountsForParent, organizations:DescribeOrganization.</div>'
                : '')
            + '</div>';
    }

    var roots = Array.isArray(payload && payload.roots) ? payload.roots : [];
    if (!roots.length) {
        summaryEl.textContent = 'No organization/account data returned.';
        treeEl.innerHTML = warningHtml + '<p class="text-muted">No hierarchy data found.</p>';
        return;
    }

    var org = payload.organization || {};
    var orgId = String(org.id || '').trim();
    var orgName = String(org.display_name || '').trim() || (orgId ? ('Organization ' + orgId) : 'Organization');
    var totalAccounts = roots.reduce(function(sum, r) { return sum + _countHierarchyAccounts(r); }, 0);
    summaryEl.textContent = 'Organizations: ' + (orgId ? 1 : 0) + ' | Roots: ' + roots.length + ' | Accounts: ' + totalAccounts;

    var rootHtml = roots.map(function(root) {
        var rootId = String(root.id || '').trim();
        var rootName = String(root.name || rootId || 'Root').trim();
        var rootAssigned = _normalizeEnvOption(root.assigned_environment);
        var rootEffective = _normalizeEnvOption(root.effective_environment || 'nonprod') || 'nonprod';

        var childrenHtml = '';
        var ous = Array.isArray(root.ous) ? root.ous : [];
        ous.forEach(function(ou) { childrenHtml += _renderAwsIdcOuNode(ou, 1); });
        var directAccounts = Array.isArray(root.accounts) ? root.accounts : [];
        directAccounts.forEach(function(acc) { childrenHtml += _renderAwsIdcAccountNode(acc, 1); });
        if (!childrenHtml) childrenHtml = '<p class="text-muted">No accounts under this root.</p>';

        return ''
            + '<details class="aws-idc-tree-node" open>'
            + '<summary>'
            + 'Root: ' + _escHtml(rootName) + ' <small>(' + _escHtml(rootId) + ')</small> '
            + '<small>' + _escHtml(rootEffective) + (rootAssigned ? ' (tagged)' : ' (inherited)') + '</small> '
            + _envTagSelectHtml('root', rootId, rootAssigned)
            + '</summary>'
            + '<div class="aws-idc-tree-children">' + childrenHtml + '</div>'
            + '</details>';
    }).join('');

    treeEl.innerHTML = warningHtml + '<details class="aws-idc-tree-node" open>'
        + '<summary>' + _escHtml(orgName) + (orgId ? (' <small>(' + _escHtml(orgId) + ')</small>') : '') + '</summary>'
        + '<div class="aws-idc-tree-children">' + (rootHtml || '<p class="text-muted">No roots found.</p>') + '</div>'
        + '</details>';

    if (errors.length) {
        summaryEl.textContent += ' | Warnings: ' + errors.length;
    }
}

function saveAwsIdentityCenterEnvTag(targetType, targetId, environment) {
    fetchAdminJson('/admin/identity-center/environment-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            target_type: targetType,
            target_id: targetId,
            environment: environment
        })
    })
        .then(function(resp) {
            var data = resp.data || {};
            if (data.error) {
                alert('Failed to save tag: ' + data.error);
                return;
            }
            loadAwsIdentityCenterHierarchy();
        })
        .catch(function(e) {
            alert('Failed to save tag: ' + (e.message || 'unknown error'));
        });
}

function loadAwsIdentityCenterAccountPermissionSets(accountId, targetId) {
    _renderAwsIdcAccountPermissionSets(accountId, targetId);
}

function loadAwsIdentityCenterHierarchy() {
    _renderAwsIdcOrgHierarchy({ roots: [] });
    fetchAdminJson('/admin/identity-center/org-hierarchy')
        .then(function(resp) {
            _renderAwsIdcOrgHierarchy(resp.data || {});
        })
        .catch(function(e) {
            _renderAwsIdcOrgHierarchy({ error: e.message || 'Failed to load organization hierarchy' });
        });
}

async function loadAwsIdentityCenterData() {
    _renderAwsIdcUsers({ users: [] });
    _renderAwsIdcGroups({ groups: [] });
    _renderAwsIdcPermissionSets({ permission_sets: [] });
    loadAwsIdentityCenterHierarchy();
    try {
        var usersResp = await fetchAdminJson('/admin/identity-center/users');
        _renderAwsIdcUsers(usersResp.data || {});
    } catch (e) {
        _renderAwsIdcUsers({ error: e.message || 'Failed to load users' });
    }

    try {
        var groupsResp = await fetchAdminJson('/admin/identity-center/groups');
        _renderAwsIdcGroups(groupsResp.data || {});
    } catch (e2) {
        _renderAwsIdcGroups({ error: e2.message || 'Failed to load groups' });
    }

    try {
        var psResp = await fetchAdminJson('/admin/identity-center/permission-sets');
        _renderAwsIdcPermissionSets(psResp.data || {});
    } catch (e3) {
        _renderAwsIdcPermissionSets({ error: e3.message || 'Failed to load permission sets' });
    }

    // Hierarchy is loaded by loadAwsIdentityCenterHierarchy() to support refresh after tagging.
}

window.showAwsIdentityCenterSubTab = showAwsIdentityCenterSubTab;
window.loadAwsIdentityCenterData = loadAwsIdentityCenterData;
window.saveAwsIdentityCenterEnvTag = saveAwsIdentityCenterEnvTag;
window.loadAwsIdentityCenterAccountPermissionSets = loadAwsIdentityCenterAccountPermissionSets;

// Load users management - also populates USER_MGMT_USERS for modals (legacy; Admin tab now uses PAM admins)
async function loadUsersManagement() {
    loadPamAdmins();
    try {
        var result = await fetchAdminJson('/admin/users');
        var data = result.data || {};
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
