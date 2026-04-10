// Admin Functions - User, Group & Role Management (PAM RBAC)

// API base (works behind nginx reverse-proxy and localhost dev)
window.API_BASE = window.API_BASE || (
    (window.location.origin + '/api')
);

// Default groups and roles: employees, engineer, admin (attach role when creating user/group)
window.USER_MGMT_GROUPS = window.USER_MGMT_GROUPS || [
    { id: 'employees', name: 'Employees', role: 'Employee', aliases: ['readaccess', 'readonly', 'read_only', 'employee'] },
    { id: 'engineer', name: 'Engineer', role: 'Engineer', aliases: ['manager'] },
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
        id: 'Engineer',
        name: 'Engineer',
        desc: 'Operational access without PAM governance ownership.',
        actions: [
            'All Employees capabilities',
            'Access Admin panel',
            'View Identity Center hierarchy and operational pages',
            'Work with approvals, reports, integrations, and active sessions',
            'No access to PAM admin assignment, features, or guardrails'
        ]
    },
    {
        id: 'Admin',
        name: 'Admin',
        desc: 'Full administrative access.',
        actions: [
            'All Engineer capabilities',
            'Manage PAM admin assignments and platform controls',
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
window.__ROLE_EDITOR_MODAL_STATE = window.__ROLE_EDITOR_MODAL_STATE || { kind: '', active: false, sourceId: '' };

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
    if (raw === 'engineer' || raw === 'engineers' || raw === 'manager' || raw === 'managers') return 'engineer';
    if (raw === 'admin' || raw === 'admins') return 'admin';
    return raw;
}

function _normalizeRole(role) {
    var v = String(role || '').trim();
    if (!v) return 'Employee';
    var low = v.toLowerCase();
    if (low === 'readonly' || low === 'read' || low === 'readaccess' || low === 'employee' || low === 'employees' || low === 'user') return 'Employee';
    if (low === 'engineer' || low === 'eng' || low === 'manager') return 'Engineer';
    if (low === 'superadmin' || low === 'super_admin') return 'SuperAdmin';
    if (low === 'admin' || low === 'administrator' || low === 'system administrator') return 'Admin';
    return v;
}

// Show admin panel button only for admins
function checkAdminAccess() {
    var adminBtn = document.getElementById('adminPanelBtn');
    if (!adminBtn) return;
    var canAdmin = (typeof canAccessAdminConsole === 'function')
        ? canAccessAdminConsole()
        : (localStorage.getItem('isAdmin') === 'true');
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

function ensureRoleEditorPlaceholder(sourceId) {
    var source = document.getElementById(sourceId);
    if (!source || source.dataset.placeholderId) return;
    var placeholder = document.createElement('div');
    placeholder.id = sourceId + 'Placeholder';
    source.parentNode.insertBefore(placeholder, source);
    source.dataset.placeholderId = placeholder.id;
}

function openRoleEditorModal(kind) {
    var isIam = kind === 'iam';
    var modalId = isIam ? 'iamRoleEditModal' : 'pamRoleEditModal';
    var mountId = isIam ? 'iamRoleEditModalMount' : 'pamRoleEditModalMount';
    var sourceId = isIam ? 'iamRoleBuilderCard' : 'pamAppRoleBuilderCard';
    var source = document.getElementById(sourceId);
    var mount = document.getElementById(mountId);
    if (!source || !mount) return;
    ensureRoleEditorPlaceholder(sourceId);
    source.style.display = '';
    mount.appendChild(source);
    window.__ROLE_EDITOR_MODAL_STATE = { kind: kind, active: true, sourceId: sourceId };
    showModal(modalId);
}

function closeRoleEditorModal(kind) {
    var state = window.__ROLE_EDITOR_MODAL_STATE || {};
    var resolvedKind = kind || state.kind;
    var sourceId = resolvedKind === 'iam' ? 'iamRoleBuilderCard' : 'pamAppRoleBuilderCard';
    var source = document.getElementById(sourceId);
    var placeholderId = source ? source.dataset.placeholderId : '';
    var placeholder = placeholderId ? document.getElementById(placeholderId) : null;
    if (source && placeholder && placeholder.parentNode) {
        placeholder.parentNode.insertBefore(source, placeholder);
        placeholder.remove();
        delete source.dataset.placeholderId;
    }
    if (source) source.style.display = 'none';
    window.__ROLE_EDITOR_MODAL_STATE = { kind: '', active: false, sourceId: '' };
    var overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.remove('show');
    document.querySelectorAll('.modal').forEach(function(modal) {
        modal.classList.remove('show');
    });
    if (resolvedKind === 'iam') resetIamRoleTemplateForm();
    else resetPamAppRoleForm();
}

function showCreatePamAppRoleModal() {
    resetPamAppRoleForm();
    syncPamAppRoleAssignmentState(false);
    openRoleEditorModal('pam');
}

function showCreateIamRoleModal() {
    resetIamRoleTemplateForm();
    syncIamRoleAssignmentState(false);
    openRoleEditorModal('iam');
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

// Populate group dropdown (employees, engineer, admin)
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
                var msg = (err && err.message) ? err.message : 'Backend API unavailable.';
                alert('Failed to create user: ' + msg);
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
            var isRemovingFromEngineer = groupName !== 'engineer' && selectedUsers.some(function(u) {
                return _normalizeGroupId(u.group || u.role || '') === 'engineer';
            });
            if (isRemovingFromEngineer && actorRole === 'Engineer') {
                alert('Engineers cannot remove users from the engineer group. Use an Admin account.');
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
    var manager = users.filter(function(u) { var r = (u.role || u.group || '').toLowerCase(); return r === 'engineer' || r === 'manager'; }).length;
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

// Edit access group (Employees, Engineer, Admin)
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
    return (window.location.origin || (window.location.protocol + '//' + window.location.hostname)) + '/api';
}

function getAdminApiCandidates() {
    var out = [];
    var preferred = getAdminApiBase();
    if (preferred) out.push(preferred);

    var originApi = (window.location.origin || (window.location.protocol + '//' + window.location.hostname)) + '/api';
    out.push(originApi);

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
            var targetIsSuper = String(role || '').toLowerCase() === 'superadmin';
            var canEditRole = canManage && (!targetIsSuper || window.PAM_ADMIN_CONTEXT.is_super_admin);
            var roleOptions = '<option value="Employee"' + (role === 'Employee' ? ' selected' : '') + '>Employee</option>' +
                '<option value="Admin"' + (role === 'Admin' ? ' selected' : '') + '>Admin</option>' +
                '<option value="Engineer"' + (role === 'Engineer' ? ' selected' : '') + '>Engineer</option>';
            if (window.PAM_ADMIN_CONTEXT.is_super_admin === true) {
                roleOptions += '<option value="SuperAdmin"' + (role === 'SuperAdmin' ? ' selected' : '') + '>SuperAdmin</option>';
            }
            var roleCell = canEditRole
                ? '<select class="pam-admin-role-select">' + roleOptions + '</select>'
                : '<span class="badge">' + (role || 'Admin') + '</span>';
            var actionHtml = [];
            if (canEditRole) {
                actionHtml.push('<button type="button" class="btn-primary btn-pam btn-sm" onclick="savePamAdminRole(this)" data-email="' + _escHtml(email) + '"><i class="fas fa-save"></i> Save</button>');
            }
            if (canRemove) {
                actionHtml.push('<button type="button" class="btn-secondary btn-pam btn-sm" onclick="removePamAdmin(\'' + safe + '\')"><i class="fas fa-user-minus"></i> Remove</button>');
            }
            if (!actionHtml.length) {
                actionHtml.push('<span class="text-muted">Restricted</span>');
            }
            return '<tr><td>' + (email || '') + '</td><td>' + roleCell + '</td><td style="display:flex; gap:8px; flex-wrap:wrap;">' + actionHtml.join('') + '</td></tr>';
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
                var roleOptions = '<option value="Employee">Employee</option><option value="Admin">Admin</option><option value="Engineer">Engineer</option>';
                if (window.PAM_ADMIN_CONTEXT && window.PAM_ADMIN_CONTEXT.is_super_admin === true) {
                    roleOptions += '<option value="SuperAdmin">SuperAdmin</option>';
                }
                return '<tr><td>' + (name || '—') + '</td><td>' + (email || '—') + '</td><td><select class="pam-admin-role-select">' + roleOptions + '</select></td><td><button type="button" class="btn-primary btn-pam btn-sm" onclick="addPamAdminWithRole(this)" data-email="' + emailAttr + '"><i class="fas fa-save"></i> Save role</button></td></tr>';
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

function savePamAdminRole(btn) {
    var row = btn.closest('tr');
    if (!row) return;
    var email = (btn.getAttribute('data-email') || '').trim();
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
    role = _normalizeRole(role || 'Admin');
    try {
        var result = await fetchAdminJson('/admin/pam-admins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, role: role })
        });
        var data = result.data || {};
        if (data.error) { alert('Error: ' + data.error); return; }
        if (data.status === 'already_added') {
            alert('User is already assigned to that PAM role.');
        } else if (data.status === 'removed') {
            alert('User reverted to Employee.');
        } else if (data.status === 'no_change') {
            alert('User already has Employee access.');
        }
        loadPamAdmins();
        var resultsEl = document.getElementById('pamAdminSearchResults');
        if (resultsEl) {
            var msg = role === 'Employee'
                ? 'User reverted to Employee access.'
                : 'Saved as ' + role + '. Search again to add more.';
            resultsEl.innerHTML = '<p class="text-muted" style="padding: 10px;">' + msg + '</p>';
        }
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
    if (typeof hasPamCapability === 'function') {
        var requestedCapability = ({
            users: 'admin.identity_center.users.view',
            groups: 'admin.identity_center.groups.view',
            'permission-sets': 'admin.identity_center.permission_sets.view',
            'stale-jit': 'admin.identity_center.permission_sets.view',
            organization: 'admin.identity_center.organization.view'
        })[String(tab || 'users')];
        if (requestedCapability && !hasPamCapability(requestedCapability)) {
            if (hasPamCapability('admin.identity_center.users.view')) tab = 'users';
            else if (hasPamCapability('admin.identity_center.groups.view')) tab = 'groups';
            else if (hasPamCapability('admin.identity_center.permission_sets.view')) tab = 'permission-sets';
            else tab = 'organization';
        }
    }
    var tabKey = String(tab || 'users');
    var panels = {
        users: 'awsIdcUsersPanel',
        groups: 'awsIdcGroupsPanel',
        'permission-sets': 'awsIdcPermissionSetsPanel',
        'stale-jit': 'awsIdcStaleJitPanel',
        organization: 'awsIdcOrgPanel'
    };
    var buttons = {
        users: 'awsIdcUsersSubTab',
        groups: 'awsIdcGroupsSubTab',
        'permission-sets': 'awsIdcPermissionSetsSubTab',
        'stale-jit': 'awsIdcStaleJitSubTab',
        organization: 'awsIdcOrgSubTab'
    };
    Object.keys(panels).forEach(function(key) {
        var panel = document.getElementById(panels[key]);
        if (panel) panel.style.display = key === tabKey ? 'block' : 'none';
        var btn = document.getElementById(buttons[key]);
        if (btn) btn.classList.toggle('active', key === tabKey);
    });
    if (tabKey === 'stale-jit') {
        loadStaleJitPermissionSets();
    }
}

function _renderAwsIdcUsers(data) {
    var body = document.getElementById('awsIdcUsersBody');
    if (!body) return;
    var canEditProfiles = (typeof hasFullAdminControls === 'function') ? hasFullAdminControls() : false;
    if (data && data.error) {
        body.innerHTML = '<tr><td colspan="6" class="text-danger">' + _escHtml(data.error) + '</td></tr>';
        return;
    }
    var list = Array.isArray(data) ? data : (data && data.users) ? data.users : [];
    if (!list.length) {
        body.innerHTML = '<tr><td colspan="6" class="text-muted">No users returned.</td></tr>';
        return;
    }
    body.innerHTML = list.map(function(u) {
        var full = [u.first_name || '', u.last_name || ''].join(' ').trim();
        var actions = canEditProfiles
            ? '<button type="button" class="btn-secondary btn-pam btn-sm" onclick="openAdminUserProfileModal(\'' + _jsSingleQuote(u.email || '') + '\')">Edit Profile</button>'
            : '<span class="text-muted">View only</span>';
        return '<tr>'
            + '<td>' + _escHtml(u.username || '-') + '</td>'
            + '<td>' + _escHtml(u.email || '-') + '</td>'
            + '<td>' + _escHtml(u.display_name || '-') + '</td>'
            + '<td>' + _escHtml(full || '-') + '</td>'
            + '<td>' + _escHtml(u.team || '-') + '</td>'
            + '<td>' + actions + '</td>'
            + '</tr>';
    }).join('');
}

async function openAdminUserProfileModal(userEmail) {
    var email = String(userEmail || '').trim().toLowerCase();
    if (!email) return;
    try {
        var result = await fetchAdminJson('/admin/users/' + encodeURIComponent(email) + '/profile');
        var profile = (result.data && result.data.business_profile) || {};
        var modal = document.getElementById('adminUserProfileModal');
        if (!modal) return;
        (document.getElementById('adminProfileTargetEmail') || {}).value = email;
        (document.getElementById('adminProfileManagerEmail') || {}).value = profile.manager_email || '';
        (document.getElementById('adminProfileManagerManagerEmail') || {}).value = profile.manager_manager_email || '';
        (document.getElementById('adminProfileTeam') || {}).value = profile.team || '';
        (document.getElementById('adminProfileLocation') || {}).value = profile.location || '';
        Array.from(document.querySelectorAll('input[name="adminProfileFrequentEnv"]')).forEach(function(cb) {
            cb.checked = Array.isArray(profile.frequent_environments) && profile.frequent_environments.indexOf(String(cb.value || '').trim().toLowerCase()) >= 0;
        });
        if (typeof setInlineStatus === 'function') setInlineStatus('adminUserProfileStatus', '', 'info');
        showModal('adminUserProfileModal');
    } catch (err) {
        alert('Failed to load user profile: ' + (err.message || ''));
    }
}

async function saveAdminUserProfile(e) {
    if (e) e.preventDefault();
    var email = String((document.getElementById('adminProfileTargetEmail') || {}).value || '').trim().toLowerCase();
    if (!email) {
        alert('User email is required.');
        return;
    }
    var payload = {
        manager_email: (document.getElementById('adminProfileManagerEmail') || {}).value || '',
        manager_manager_email: (document.getElementById('adminProfileManagerManagerEmail') || {}).value || '',
        team: (document.getElementById('adminProfileTeam') || {}).value || '',
        location: (document.getElementById('adminProfileLocation') || {}).value || '',
        frequent_environments: Array.from(document.querySelectorAll('input[name="adminProfileFrequentEnv"]:checked')).map(function(cb) {
            return String(cb.value || '').trim().toLowerCase();
        })
    };
    try {
        await fetchAdminJson('/admin/users/' + encodeURIComponent(email) + '/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (typeof setInlineStatus === 'function') setInlineStatus('adminUserProfileStatus', 'Profile updated successfully.', 'success');
    } catch (err) {
        if (typeof setInlineStatus === 'function') setInlineStatus('adminUserProfileStatus', err.message || 'Failed to update profile.', 'error');
    }
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

window.AWS_IDC_STALE_JIT_PERMISSION_SETS = window.AWS_IDC_STALE_JIT_PERMISSION_SETS || [];

function _staleJitBadge(text, tone) {
    return '<span class="stale-jit-badge stale-jit-badge-' + _escHtml(tone || 'muted') + '">' + _escHtml(String(text || '')) + '</span>';
}

function _syncStaleJitSelectionState() {
    var selectedCount = document.querySelectorAll('.aws-idc-stale-jit-item:checked').length;
    var totalCount = document.querySelectorAll('.aws-idc-stale-jit-item').length;
    var selectAll = document.getElementById('awsIdcStaleJitSelectAll');
    if (selectAll) {
        selectAll.indeterminate = selectedCount > 0 && selectedCount < totalCount;
        selectAll.checked = totalCount > 0 && selectedCount === totalCount;
    }
    var deleteBtn = document.getElementById('awsIdcStaleJitDeleteBtn');
    if (deleteBtn) {
        deleteBtn.disabled = selectedCount === 0;
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete selected stale' + (selectedCount ? (' (' + selectedCount + ')') : '');
    }
}

function _renderStaleJitPermissionSets(data) {
    var body = document.getElementById('awsIdcStaleJitSetsBody');
    var statusEl = document.getElementById('awsIdcStaleJitSetsStatus');
    if (!body || !statusEl) return;
    var list = Array.isArray(data && data.stale_jit_permission_sets) ? data.stale_jit_permission_sets : [];
    window.AWS_IDC_STALE_JIT_PERMISSION_SETS = list;
    var staleCount = Number(data && data.stale_count || 0);
    var warningCount = Array.isArray(data && data.warnings) ? data.warnings.length : 0;
    var totalCount = Number(data && data.total || list.length);
    var warnings = Array.isArray(data && data.warnings) ? data.warnings : [];
    var statusHtml = '<div class="stale-jit-meta">'
        + _staleJitBadge('Total: ' + totalCount, 'muted')
        + _staleJitBadge('Stale: ' + staleCount, staleCount > 0 ? 'danger' : 'ok')
        + _staleJitBadge('Warnings: ' + warningCount, warningCount > 0 ? 'warn' : 'ok')
        + '</div>';
    if (warnings.length) {
        statusHtml += '<div class="stale-jit-warning">' + _escHtml(String(warnings[0] || '')) + (warnings.length > 1 ? (' (+' + (warnings.length - 1) + ' more)') : '') + '</div>';
    }
    statusEl.innerHTML = statusHtml;
    var selectAll = document.getElementById('awsIdcStaleJitSelectAll');
    if (selectAll) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
    }
    if (!list.length) {
        body.innerHTML = '<tr><td colspan="5" class="text-muted">No stale JIT permission sets found.</td></tr>';
        _syncStaleJitSelectionState();
        return;
    }
    body.innerHTML = list.map(function(item, idx) {
        var arn = String(item.arn || '');
        var assigned = Number(item.assigned_accounts_count || 0);
        var escapedArn = _escHtml(arn);
        var stale = !!item.stale;
        var assignedBadge = assigned === 0
            ? _staleJitBadge('0 (unassigned)', 'ok')
            : _staleJitBadge(String(assigned), 'warn');
        var stateBadge = stale
            ? _staleJitBadge('Stale', 'danger')
            : _staleJitBadge('In use', 'info');
        return '<tr>'
            + '<td><input type="checkbox" class="aws-idc-stale-jit-item stale-jit-checkbox" data-idx="' + idx + '" data-arn="' + escapedArn + '"></td>'
            + '<td><span class="stale-jit-name">' + _escHtml(item.name || '-') + '</span></td>'
            + '<td>' + assignedBadge + '</td>'
            + '<td>' + stateBadge + '</td>'
            + '<td class="stale-jit-arn">' + escapedArn + '</td>'
            + '</tr>';
    }).join('');
    var boxes = document.querySelectorAll('.aws-idc-stale-jit-item');
    boxes.forEach(function(cb) {
        cb.addEventListener('change', _syncStaleJitSelectionState);
    });
    _syncStaleJitSelectionState();
}

async function loadStaleJitPermissionSets() {
    var statusEl = document.getElementById('awsIdcStaleJitSetsStatus');
    if (statusEl) statusEl.innerHTML = '<span class="text-muted">Loading stale JIT permission sets...</span>';
    try {
        var result = await fetchAdminJson('/admin/identity-center/permission-sets/jit-stale');
        var data = result.data || {};
        if (data.error) throw new Error(data.error);
        _renderStaleJitPermissionSets(data);
    } catch (e) {
        if (statusEl) statusEl.innerHTML = '<span class="text-danger">Failed to load stale list: ' + _escHtml(e.message || 'unknown error') + '</span>';
        var body = document.getElementById('awsIdcStaleJitSetsBody');
        if (body) body.innerHTML = '<tr><td colspan="5" class="text-danger">' + _escHtml(e.message || 'Failed to load stale list') + '</td></tr>';
        _syncStaleJitSelectionState();
    }
}

function _selectedStaleJitPermissionSetArns() {
    var selected = [];
    var boxes = document.querySelectorAll('.aws-idc-stale-jit-item:checked');
    boxes.forEach(function(cb) {
        var arn = String(cb.getAttribute('data-arn') || '').trim();
        if (arn) selected.push(arn);
    });
    return selected;
}

function toggleAllStaleJitPermissionSets(checked) {
    var boxes = document.querySelectorAll('.aws-idc-stale-jit-item');
    boxes.forEach(function(cb) { cb.checked = !!checked; });
    _syncStaleJitSelectionState();
}

async function deleteSelectedStaleJitPermissionSets() {
    var arns = _selectedStaleJitPermissionSetArns();
    if (!arns.length) {
        alert('Select at least one stale JIT permission set.');
        return;
    }
    var confirmMessage = 'Are you sure you want to delete ' + arns.length + ' selected stale JIT permission set(s)?\n\n'
        + 'This will permanently remove those permission sets from IAM Identity Center.';
    var proceed = false;
    if (typeof window.confirmAppAction === 'function') {
        proceed = await window.confirmAppAction(confirmMessage, {
            title: 'Delete Stale JIT Permission Sets',
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
            variant: 'warning'
        });
    } else {
        proceed = confirm(confirmMessage);
    }
    if (!proceed) return;

    var deleteBtn = document.getElementById('awsIdcStaleJitDeleteBtn');
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
    }
    try {
        var result = await fetchAdminJson('/admin/identity-center/permission-sets/jit-stale/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ arns: arns })
        });
        var data = result.data || {};
        if (data.error) throw new Error(data.error);
        var deleted = Number(data.deleted_count || 0);
        var errCount = Array.isArray(data.errors) ? data.errors.length : 0;
        var skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
        alert('Stale cleanup result: deleted=' + deleted + ', skipped=' + skipped + ', errors=' + errCount);
        loadStaleJitPermissionSets();
    } catch (e) {
        alert('Failed to delete stale permission sets: ' + (e.message || 'unknown error'));
    } finally {
        _syncStaleJitSelectionState();
    }
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
        + '<label class="aws-idc-env-tag" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();" onmouseup="event.stopPropagation();">'
        + '<span>Tag:</span>'
        + '<select onclick="event.stopPropagation();" onmousedown="event.stopPropagation();" onmouseup="event.stopPropagation();" onchange="event.stopPropagation(); saveAwsIdentityCenterEnvTag(\'' + jsType + '\', \'' + jsId + '\', this.value)">'
        + option('', 'inherit')
        + option('prod', 'prod')
        + option('nonprod', 'non prod')
        + option('sandbox', 'sandbox')
        + '</select>'
        + '</label>';
}

function _accountVisibilitySelectHtml(accountId, visibleToRequesters) {
    var jsId = _jsSingleQuote(accountId);
    var current = visibleToRequesters === false ? 'hidden' : 'visible';
    function option(value, label) {
        return '<option value="' + value + '"' + (current === value ? ' selected' : '') + '>' + label + '</option>';
    }
    return ''
        + '<label class="aws-idc-env-tag" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();" onmouseup="event.stopPropagation();">'
        + '<span>Requester view:</span>'
        + '<select onclick="event.stopPropagation();" onmousedown="event.stopPropagation();" onmouseup="event.stopPropagation();" onchange="event.stopPropagation(); saveAwsIdentityCenterAccountVisibility(\'' + jsId + '\', this.value)">'
        + option('visible', 'visible')
        + option('hidden', 'hidden')
        + '</select>'
        + '</label>';
}

function _treeNodeKey(prefix, id, name) {
    var pid = String(id || '').trim();
    var pname = String(name || '').trim();
    return String(prefix || 'node') + ':' + (pid || pname || 'unknown');
}

function _captureAwsIdcTreeOpenState(treeEl) {
    var state = {};
    if (!treeEl) return state;
    var nodes = treeEl.querySelectorAll('details.aws-idc-tree-node[data-node-key]');
    nodes.forEach(function(node) {
        var key = node.getAttribute('data-node-key');
        if (!key) return;
        state[key] = !!node.open;
    });
    return state;
}

function _isAwsIdcNodeOpen(openState, key, fallbackOpen) {
    if (openState && Object.prototype.hasOwnProperty.call(openState, key)) {
        return !!openState[key];
    }
    return !!fallbackOpen;
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

function _sortNodesByName(nodes) {
    var arr = Array.isArray(nodes) ? nodes.slice() : [];
    arr.sort(function(a, b) {
        var an = String((a && (a.name || a.id)) || '').toLowerCase();
        var bn = String((b && (b.name || b.id)) || '').toLowerCase();
        return an.localeCompare(bn);
    });
    return arr;
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
    var visibleToRequesters = account.visible_to_requesters !== false;
    var inheritedLabel = assigned ? 'Tagged' : 'Inherited';
    var envLabel = '<small>' + _escHtml(effective) + (assigned ? ' (tagged)' : ' (inherited)') + '</small>';
    var visibilityLabel = '<small>' + (visibleToRequesters ? 'Visible to requesters' : 'Hidden from requesters') + '</small>';
    var psTargetId = 'awsIdcPerms_' + accountId.replace(/[^a-zA-Z0-9_-]/g, '_');
    var jsAccountId = _jsSingleQuote(accountId);
    var jsTarget = _jsSingleQuote(psTargetId);
    return ''
        + '<div class="aws-idc-account-item" style="margin-left:' + (depth * 14) + 'px;">'
        + '<div class="aws-idc-account-main">'
        + '<div class="aws-idc-account-heading">'
        + '<strong>' + _escHtml(accountName) + '</strong>'
        + '<span class="aws-idc-node-pill aws-idc-node-pill-neutral">' + _escHtml(accountId) + '</span>'
        + '<span class="aws-idc-node-pill aws-idc-node-pill-' + _escHtml(effective || 'nonprod') + '">' + _escHtml(effective || 'nonprod') + '</span>'
        + '<span class="aws-idc-node-pill aws-idc-node-pill-neutral">' + _escHtml(inheritedLabel) + '</span>'
        + '</div>'
        + (accountEmail ? '<div class="aws-idc-account-subline">' + _escHtml(accountEmail) + '</div>' : '')
        + '<div id="' + _escHtml(psTargetId) + '" class="aws-idc-account-perms"><small><button type="button" class="btn-secondary btn-pam btn-sm" onclick="loadAwsIdentityCenterAccountPermissionSets(\'' + jsAccountId + '\', \'' + jsTarget + '\')">Load permission sets</button></small></div>'
        + '</div>'
        + '<div class="aws-idc-account-controls">'
        + envLabel
        + _envTagSelectHtml('account', accountId, assigned)
        + visibilityLabel
        + _accountVisibilitySelectHtml(accountId, visibleToRequesters)
        + '</div>'
        + '</div>';
}

function _renderAwsIdcOuNode(ou, depth, openState) {
    var ouId = String(ou.id || '').trim();
    var ouName = String(ou.name || ouId || 'OU').trim();
    var ouKey = _treeNodeKey('ou', ouId, ouName);
    var assigned = _normalizeEnvOption(ou.assigned_environment);
    var effective = _normalizeEnvOption(ou.effective_environment || 'nonprod') || 'nonprod';
    var childOuCount = Array.isArray(ou.ous) ? ou.ous.length : 0;
    var accountCount = Array.isArray(ou.accounts) ? ou.accounts.length : 0;
    var childrenHtml = '';

    var childOus = _sortNodesByName(Array.isArray(ou.ous) ? ou.ous : []);
    childOus.forEach(function(child) {
        childrenHtml += _renderAwsIdcOuNode(child, depth + 1, openState);
    });
    var accounts = _sortNodesByName(Array.isArray(ou.accounts) ? ou.accounts : []);
    accounts.forEach(function(acc) {
        childrenHtml += _renderAwsIdcAccountNode(acc, depth + 1);
    });
    if (!childrenHtml) childrenHtml = '<p class="text-muted" style="margin-left:' + ((depth + 1) * 10) + 'px;">No accounts in this OU.</p>';

    return ''
        + '<details class="aws-idc-tree-node"' + (_isAwsIdcNodeOpen(openState, ouKey, true) ? ' open' : '') + ' data-node-key="' + _escHtml(ouKey) + '">'
        + '<summary>'
        + '<div class="aws-idc-summary-row">'
        + '<div class="aws-idc-summary-main">'
        + '<span class="aws-idc-summary-title">OU: ' + _escHtml(ouName) + '</span>'
        + '<span class="aws-idc-node-pill aws-idc-node-pill-neutral">' + _escHtml(ouId) + '</span>'
        + '<span class="aws-idc-node-pill aws-idc-node-pill-' + _escHtml(effective || 'nonprod') + '">' + _escHtml(effective || 'nonprod') + '</span>'
        + '<span class="aws-idc-node-pill aws-idc-node-pill-neutral">' + (assigned ? 'Tagged' : 'Inherited') + '</span>'
        + '</div>'
        + '<div class="aws-idc-summary-meta">'
        + '<span>' + childOuCount + ' OUs</span>'
        + '<span>' + accountCount + ' Accounts</span>'
        + _envTagSelectHtml('ou', ouId, assigned)
        + '</div>'
        + '</div>'
        + '</summary>'
        + '<div class="aws-idc-tree-children">' + childrenHtml + '</div>'
        + '</details>';
}

function _renderAwsIdcOrgHierarchy(payload) {
    var summaryEl = document.getElementById('awsIdcOrgSummary');
    var treeEl = document.getElementById('awsIdcOrgTree');
    if (!summaryEl || !treeEl) return;
    var openState = _captureAwsIdcTreeOpenState(treeEl);
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

    var roots = _sortNodesByName(Array.isArray(payload && payload.roots) ? payload.roots : []);
    if (!roots.length) {
        summaryEl.textContent = 'No organization/account data returned.';
        treeEl.innerHTML = warningHtml + '<p class="text-muted">No hierarchy data found.</p>';
        return;
    }

    var org = payload.organization || {};
    var orgId = String(org.id || '').trim();
    var orgName = String(org.display_name || '').trim() || (orgId ? ('Organization ' + orgId) : 'Organization');
    var orgKey = _treeNodeKey('org', orgId, orgName);
    var totalAccounts = roots.reduce(function(sum, r) { return sum + _countHierarchyAccounts(r); }, 0);
    summaryEl.textContent = 'Organizations: ' + (orgId ? 1 : 0) + ' | Roots: ' + roots.length + ' | Accounts: ' + totalAccounts;
    if (payload && payload.cached) {
        summaryEl.textContent += ' | Source: cached hierarchy';
    }

    var rootHtml = roots.map(function(root) {
        var rootId = String(root.id || '').trim();
        var rootName = String(root.name || rootId || 'Root').trim();
        var rootKey = _treeNodeKey('root', rootId, rootName);
        var rootAssigned = _normalizeEnvOption(root.assigned_environment);
        var rootEffective = _normalizeEnvOption(root.effective_environment || 'nonprod') || 'nonprod';
        var rootOuCount = Array.isArray(root.ous) ? root.ous.length : 0;
        var rootAccountCount = Array.isArray(root.accounts) ? root.accounts.length : 0;

        var childrenHtml = '';
        var ous = _sortNodesByName(Array.isArray(root.ous) ? root.ous : []);
        ous.forEach(function(ou) { childrenHtml += _renderAwsIdcOuNode(ou, 1, openState); });
        var directAccounts = _sortNodesByName(Array.isArray(root.accounts) ? root.accounts : []);
        directAccounts.forEach(function(acc) { childrenHtml += _renderAwsIdcAccountNode(acc, 1); });
        if (!childrenHtml) childrenHtml = '<p class="text-muted">No accounts under this root.</p>';

        return ''
            + '<details class="aws-idc-tree-node"' + (_isAwsIdcNodeOpen(openState, rootKey, true) ? ' open' : '') + ' data-node-key="' + _escHtml(rootKey) + '">'
            + '<summary>'
            + '<div class="aws-idc-summary-row">'
            + '<div class="aws-idc-summary-main">'
            + '<span class="aws-idc-summary-title">Root: ' + _escHtml(rootName) + '</span>'
            + '<span class="aws-idc-node-pill aws-idc-node-pill-neutral">' + _escHtml(rootId) + '</span>'
            + '<span class="aws-idc-node-pill aws-idc-node-pill-' + _escHtml(rootEffective || 'nonprod') + '">' + _escHtml(rootEffective || 'nonprod') + '</span>'
            + '<span class="aws-idc-node-pill aws-idc-node-pill-neutral">' + (rootAssigned ? 'Tagged' : 'Inherited') + '</span>'
            + '</div>'
            + '<div class="aws-idc-summary-meta">'
            + '<span>' + rootOuCount + ' OUs</span>'
            + '<span>' + rootAccountCount + ' Accounts</span>'
            + _envTagSelectHtml('root', rootId, rootAssigned)
            + '</div>'
            + '</div>'
            + '</summary>'
            + '<div class="aws-idc-tree-children">' + childrenHtml + '</div>'
            + '</details>';
    }).join('');

    treeEl.innerHTML = warningHtml + '<details class="aws-idc-tree-node"' + (_isAwsIdcNodeOpen(openState, orgKey, true) ? ' open' : '') + ' data-node-key="' + _escHtml(orgKey) + '">'
        + '<summary>'
        + '<div class="aws-idc-summary-row">'
        + '<div class="aws-idc-summary-main">'
        + '<span class="aws-idc-summary-title">' + _escHtml(orgName) + '</span>'
        + (orgId ? ('<span class="aws-idc-node-pill aws-idc-node-pill-neutral">' + _escHtml(orgId) + '</span>') : '')
        + '</div>'
        + '<div class="aws-idc-summary-meta">'
        + '<span>' + roots.length + ' Roots</span>'
        + '<span>' + totalAccounts + ' Accounts</span>'
        + '</div>'
        + '</div>'
        + '</summary>'
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

function saveAwsIdentityCenterAccountVisibility(accountId, visibility) {
    fetchAdminJson('/admin/identity-center/account-visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            account_id: accountId,
            visible: visibility !== 'hidden'
        })
    })
        .then(function(resp) {
            var data = resp.data || {};
            if (data.error) {
                alert('Failed to save visibility: ' + data.error);
                return;
            }
            if (window.__npamReadCache && window.__npamReadCache.db_accounts) {
                window.__npamReadCache.db_accounts = { data: null, ts: 0, promise: null };
            }
            loadAwsIdentityCenterHierarchy();
        })
        .catch(function(e) {
            alert('Failed to save visibility: ' + (e.message || 'unknown error'));
        });
}

function loadAwsIdentityCenterAccountPermissionSets(accountId, targetId) {
    _renderAwsIdcAccountPermissionSets(accountId, targetId);
}

function loadAwsIdentityCenterHierarchy() {
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
    loadStaleJitPermissionSets();

    // Hierarchy is loaded by loadAwsIdentityCenterHierarchy() to support refresh after tagging.
}

window.showAwsIdentityCenterSubTab = showAwsIdentityCenterSubTab;
window.loadAwsIdentityCenterData = loadAwsIdentityCenterData;
window.saveAwsIdentityCenterEnvTag = saveAwsIdentityCenterEnvTag;
window.saveAwsIdentityCenterAccountVisibility = saveAwsIdentityCenterAccountVisibility;
window.loadAwsIdentityCenterAccountPermissionSets = loadAwsIdentityCenterAccountPermissionSets;
window.loadStaleJitPermissionSets = loadStaleJitPermissionSets;
window.deleteSelectedStaleJitPermissionSets = deleteSelectedStaleJitPermissionSets;
window.toggleAllStaleJitPermissionSets = toggleAllStaleJitPermissionSets;

// Load users management - also populates USER_MGMT_USERS for modals (legacy; Admin tab now uses PAM admins)
async function loadUsersManagement() {
    window.__npamReadCache = window.__npamReadCache || {};
    const cache = window.__npamReadCache.admin_users || (window.__npamReadCache.admin_users = { data: null, ts: 0, promise: null });
    loadPamAdmins();
    try {
        var now = Date.now();
        if (cache.promise) {
            var result = await cache.promise;
        } else if (cache.data && (now - cache.ts) < 15000) {
            var result = cache.data;
        } else {
            cache.promise = fetchAdminJson('/admin/users')
                .then(function(result) {
                    cache.data = result;
                    cache.ts = Date.now();
                    return result;
                })
                .finally(function() {
                    cache.promise = null;
                });
            var result = await cache.promise;
        }
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
window.__adminUsersManagementImpl = loadUsersManagement;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAdminAccess);
} else {
    checkAdminAccess();
}

window.USER_MGMT_GROUPS_DATA = window.USER_MGMT_GROUPS_DATA || [];
window.INDIVIDUAL_USER_RESULTS = window.INDIVIDUAL_USER_RESULTS || [];
window.IAM_ROLE_TEMPLATES = window.IAM_ROLE_TEMPLATES || [];
window.IAM_ROLE_SELECTED_USERS = window.IAM_ROLE_SELECTED_USERS || [];
window.IAM_ROLE_SELECTED_GROUPS = window.IAM_ROLE_SELECTED_GROUPS || [];
window.IAM_ROLE_SEARCH_RESULTS = window.IAM_ROLE_SEARCH_RESULTS || { user: [], group: [] };

function _badgeClassForRole(role) {
    var normalized = _normalizeRole(role || 'Employee');
    if (normalized === 'Admin' || normalized === 'SuperAdmin') return 'badge-admin';
    if (normalized === 'Engineer') return 'badge-manager';
    return 'badge-readaccess';
}

function _groupRoleCardClass(role) {
    var normalized = _normalizeRole(role || 'Employee');
    if (normalized === 'Admin' || normalized === 'SuperAdmin') return 'group-role-admin';
    if (normalized === 'Engineer') return 'group-role-manager';
    return 'group-role-readaccess';
}

function _isReservedPrivilegedGroup(group) {
    var gid = _normalizeGroupId((group && (group.id || group.name)) || '');
    return gid === 'pam_admins' || gid === 'pam_engineers' || gid === 'pam_superadmins';
}

async function loadGroupsManagement(force) {
    window.__npamReadCache = window.__npamReadCache || {};
    var cache = window.__npamReadCache.admin_groups || (window.__npamReadCache.admin_groups = { data: null, ts: 0, promise: null });
    try {
        var now = Date.now();
        var result;
        if (!force && cache.promise) {
            result = await cache.promise;
        } else if (!force && cache.data && (now - cache.ts) < 15000) {
            result = cache.data;
        } else {
            cache.promise = fetchAdminJson('/admin/groups')
                .then(function(resp) {
                    cache.data = resp;
                    cache.ts = Date.now();
                    return resp;
                })
                .finally(function() { cache.promise = null; });
            result = await cache.promise;
        }
        var groups = Array.isArray(result.data?.groups) ? result.data.groups : [];
        window.USER_MGMT_GROUPS_DATA = groups;
        renderGroupsManagement(groups);
        populateGroupDropdown();
        return groups;
    } catch (e) {
        renderGroupsManagement([], e.message || 'Failed to load groups.');
        return [];
    }
}

function renderGroupsManagement(groups, error) {
    var body = document.getElementById('groupsManagementBody');
    if (!body) return;
    var canManageGroups = (typeof hasFullAdminControls === 'function') ? hasFullAdminControls() : false;
    if (error) {
        body.innerHTML = '<p class="text-danger">' + _escHtml(error) + '</p>';
        return;
    }
    if (!Array.isArray(groups) || !groups.length) {
        body.innerHTML = '<p class="text-muted">No groups found yet. Create your first group.</p>';
        return;
    }
    body.innerHTML = groups.map(function(group) {
        var members = Array.isArray(group.members_detail) ? group.members_detail : [];
        var memberNames = members.slice(0, 4).map(function(member) {
            return _escHtml(member.display_name || member.email || 'User');
        }).join(', ');
        var moreCount = members.length > 4 ? (' +' + (members.length - 4) + ' more') : '';
        var isReserved = _isReservedPrivilegedGroup(group);
        var actions = [];
        if (canManageGroups) {
            actions.push('<button class="btn-secondary btn-pam btn-sm" onclick="editGroup(\'' + _jsSingleQuote(group.id) + '\')"><i class="fas fa-edit"></i> Edit</button>');
            actions.push('<button class="btn-secondary btn-pam btn-sm" onclick="showCreateGroupModal(\'' + _jsSingleQuote(group.id) + '\')"><i class="fas fa-user-plus"></i> Add Users</button>');
            if (!isReserved) {
                actions.push('<button class="btn-danger btn-pam btn-sm" onclick="deleteGroup(\'' + _jsSingleQuote(group.id) + '\')"><i class="fas fa-trash"></i> Delete</button>');
            }
        }
        return ''
            + '<div class="group-detail-card ' + _groupRoleCardClass(group.role) + '">'
            + '  <div class="group-detail-header">'
            + '    <h4><i class="fas fa-users"></i> ' + _escHtml(group.name || group.id || 'Group') + '</h4>'
            + '    <span class="badge ' + _badgeClassForRole(group.role) + '">' + _escHtml(group.role || 'Employee') + '</span>'
            + '  </div>'
            + '  <p class="group-role-desc">' + _escHtml(group.description || 'No description added yet.') + '</p>'
            + '  <p class="group-role-desc"><strong>Members:</strong> ' + String(group.member_count || 0) + (memberNames ? ' · ' + memberNames + moreCount : '') + '</p>'
            + '  <p class="group-role-desc"><strong>PAM App Roles:</strong> ' + _escHtml(((group.pam_app_roles || []).map(function(item) { return item.name || item.id || ''; }).join(', ')) || '—') + '</p>'
            + (isReserved ? '  <p class="group-role-desc"><strong>System group:</strong> Reserved for PAM role binding.</p>' : '')
            + '  <div class="group-card-actions">'
            + (actions.length ? actions.join('') : '<span class="text-muted">Restricted</span>')
            + '  </div>'
            + '</div>';
    }).join('');
}

function populateGroupDropdown() {
    var sel = document.getElementById('userGroup');
    var assignSel = document.getElementById('groupName');
    var groups = Array.isArray(window.USER_MGMT_GROUPS_DATA) ? window.USER_MGMT_GROUPS_DATA : [];
    var options = '<option value="">Select group</option>' + groups.map(function(g) {
        return '<option value="' + _escHtml(g.id || '') + '">' + _escHtml((g.name || g.id || '') + ' (' + (g.role || 'Employee') + ')') + '</option>';
    }).join('');
    if (sel) sel.innerHTML = options;
    if (assignSel) sel ? null : null;
    if (assignSel) assignSel.innerHTML = options;
}

window.GROUP_MEMBER_SELECTIONS = window.GROUP_MEMBER_SELECTIONS || {};

function getGroupMemberSelection(groupId) {
    var key = String(groupId || '').trim();
    if (!key) return new Set();
    var existing = window.GROUP_MEMBER_SELECTIONS[key];
    if (existing instanceof Set) return existing;
    var next = new Set(Array.isArray(existing) ? existing : []);
    window.GROUP_MEMBER_SELECTIONS[key] = next;
    return next;
}

function toggleGroupUserSelection(email, checked) {
    var groupId = _normalizeGroupId((document.getElementById('groupName') || {}).value || '');
    if (!groupId) return;
    var normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return;
    var selection = getGroupMemberSelection(groupId);
    if (checked) selection.add(normalizedEmail);
    else selection.delete(normalizedEmail);
    renderGroupSelectionSummary(groupId);
}

function toggleVisibleGroupUsers(checked) {
    var groupId = _normalizeGroupId((document.getElementById('groupName') || {}).value || '');
    if (!groupId) return;
    var selection = getGroupMemberSelection(groupId);
    Array.from(document.querySelectorAll('#groupUsersList input[name="groupUser"]')).forEach(function(cb) {
        if (cb.disabled) return;
        cb.checked = !!checked;
        var email = String(cb.value || '').trim().toLowerCase();
        if (!email) return;
        if (checked) selection.add(email);
        else selection.delete(email);
    });
    renderGroupSelectionSummary(groupId);
}

function renderGroupSelectionSummary(groupId) {
    var countEl = document.getElementById('groupUserSelectionCount');
    var selectVisibleEl = document.getElementById('groupUserSelectVisible');
    var selection = getGroupMemberSelection(groupId);
    var visible = Array.from(document.querySelectorAll('#groupUsersList input[name="groupUser"]')).filter(function(cb) {
        return !cb.disabled;
    });
    var visibleChecked = visible.filter(function(cb) { return cb.checked; }).length;
    if (countEl) {
        countEl.textContent = selection.size
            ? (selection.size + ' user' + (selection.size === 1 ? '' : 's') + ' selected')
            : 'No users selected yet';
    }
    if (selectVisibleEl) {
        selectVisibleEl.checked = !!visible.length && visibleChecked === visible.length;
        selectVisibleEl.indeterminate = visibleChecked > 0 && visibleChecked < visible.length;
        selectVisibleEl.disabled = visible.length === 0;
    }
}

async function populateGroupUsersList() {
    var container = document.getElementById('groupUsersList');
    var groupId = _normalizeGroupId((document.getElementById('groupName') && document.getElementById('groupName').value) || '');
    var q = String((document.getElementById('groupUserSearchInput') && document.getElementById('groupUserSearchInput').value) || '').trim();
    if (!container) return;
    if (!groupId) {
        container.innerHTML = '<p class="text-muted">Select a group first.</p>';
        return;
    }
    container.innerHTML = '<p class="text-muted">Searching users…</p>';
    try {
        var result = await fetchAdminJson('/admin/users' + (q ? ('?q=' + encodeURIComponent(q)) : ''));
        var users = Array.isArray(result.data) ? result.data : [];
        var group = (window.USER_MGMT_GROUPS_DATA || []).find(function(item) { return String(item.id || '') === groupId; }) || {};
        var existingMembers = Array.isArray(group.members_detail) ? group.members_detail.map(function(item) { return String(item.email || '').toLowerCase(); }) : [];
        var selection = getGroupMemberSelection(groupId);
        if (!users.length) {
            container.innerHTML = '<p class="text-muted">No users found.</p>';
            renderGroupSelectionSummary(groupId);
            return;
        }
        container.innerHTML =
            '<div class="users-checklist-toolbar">' +
                '<label class="user-check-item user-check-item-toolbar">' +
                    '<input type="checkbox" id="groupUserSelectVisible" onchange="toggleVisibleGroupUsers(this.checked)">' +
                    '<span>Select visible results</span>' +
                '</label>' +
                '<span id="groupUserSelectionCount" class="users-checklist-count">No users selected yet</span>' +
            '</div>' +
            '<div class="users-checklist-inner users-checklist-cards">' + users.map(function(u) {
            var email = String(u.email || '').trim().toLowerCase();
            var label = _escHtml(u.display_name || u.name || email || 'User');
            var alreadyMember = existingMembers.indexOf(email) >= 0;
            var checked = selection.has(email) ? ' checked' : '';
            return (
                '<label class="user-check-item user-check-card' + (alreadyMember ? ' is-disabled' : '') + '">' +
                    '<input type="checkbox" name="groupUser" value="' + _escHtml(email) + '"' + (alreadyMember ? ' disabled' : '') + checked + ' onchange="toggleGroupUserSelection(this.value, this.checked)">' +
                    '<span class="user-check-indicator"><i class="fas fa-check"></i></span>' +
                    '<span class="user-check-copy">' +
                        '<strong>' + label + '</strong>' +
                        '<span>' + _escHtml(email) + (alreadyMember ? ' · already in group' : '') + '</span>' +
                    '</span>' +
                '</label>'
            );
        }).join('') + '</div>';
        renderGroupSelectionSummary(groupId);
    } catch (e) {
        container.innerHTML = '<p class="text-danger">' + _escHtml(e.message || 'Failed to search users.') + '</p>';
        renderGroupSelectionSummary(groupId);
    }
}

function showCreateNewGroupModal(groupId) {
    openUserMgmtModal('createNewGroupModal');
    var form = document.getElementById('createNewGroupForm');
    if (form) form.reset();
    var editingIdEl = document.getElementById('editingGroupId');
    if (editingIdEl) editingIdEl.value = '';
    if (groupId) {
        var group = (window.USER_MGMT_GROUPS_DATA || []).find(function(item) { return String(item.id || '') === String(groupId || ''); });
        if (group) {
            if (editingIdEl) editingIdEl.value = group.id || '';
            var nameEl = document.getElementById('newGroupName');
            var descEl = document.getElementById('newGroupDescription');
            var roleEl = document.getElementById('newGroupRole');
            if (nameEl) nameEl.value = group.name || group.id || '';
            if (descEl) descEl.value = group.description || '';
            if (roleEl) roleEl.value = _normalizeRole(group.role || 'Employee');
        }
    }
}

function editGroup(groupId) {
    showCreateNewGroupModal(groupId);
}

function showCreateGroupModal(groupId) {
    openUserMgmtModal('createGroupModal');
    populateGroupDropdown();
    var groupSelect = document.getElementById('groupName');
    if (groupSelect && groupId) groupSelect.value = groupId;
    if (groupId) window.GROUP_MEMBER_SELECTIONS[groupId] = new Set();
    var searchInput = document.getElementById('groupUserSearchInput');
    if (searchInput) searchInput.value = '';
    populateGroupUsersList();
}

async function handleGroupEditorSubmit(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    var editingId = String((document.getElementById('editingGroupId') || {}).value || '').trim();
    var name = String((document.getElementById('newGroupName') || {}).value || '').trim();
    var description = String((document.getElementById('newGroupDescription') || {}).value || '').trim();
    var role = _normalizeRole((document.getElementById('newGroupRole') || {}).value || 'Employee');
    if (!name) {
        alert('Group name is required.');
        return;
    }
    try {
        if (editingId) {
            await fetchAdminJson('/admin/groups/' + encodeURIComponent(editingId), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, description: description, role: role })
            });
        } else {
            await fetchAdminJson('/admin/groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, description: description, role: role })
            });
        }
        closeModal();
        await loadGroupsManagement(true);
        if (typeof loadPamAdmins === 'function') await loadPamAdmins();
    } catch (err) {
        alert('Failed to save group: ' + (err.message || ''));
    }
}

async function handleGroupMembersSubmit(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    var groupId = _normalizeGroupId((document.getElementById('groupName') || {}).value || '');
    var selected = Array.from(getGroupMemberSelection(groupId));
    if (!groupId) {
        alert('Please select a group.');
        return;
    }
    if (!selected.length) {
        alert('Select at least one user to add.');
        return;
    }
    try {
        await fetchAdminJson('/admin/groups/' + encodeURIComponent(groupId) + '/members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emails: selected })
        });
        window.GROUP_MEMBER_SELECTIONS[groupId] = new Set();
        closeModal();
        await loadGroupsManagement(true);
        if (typeof loadPamAdmins === 'function') await loadPamAdmins();
    } catch (err) {
        alert('Failed to add users to group: ' + (err.message || ''));
    }
}

async function deleteAccessGroup(groupId) {
    if (!confirm('Delete this group?')) return;
    try {
        await fetchAdminJson('/admin/groups/' + encodeURIComponent(groupId), { method: 'DELETE' });
        await loadGroupsManagement(true);
        if (typeof loadPamAdmins === 'function') await loadPamAdmins();
    } catch (err) {
        alert('Failed to delete group: ' + (err.message || ''));
    }
}

function deleteGroup(groupId) {
    deleteAccessGroup(groupId);
}

async function searchIndividualUsers() {
    var q = String((document.getElementById('individualUserSearchInput') || {}).value || '').trim();
    var body = document.getElementById('individualUsersTableBody');
    if (!body) return;
    if (!q) {
        body.innerHTML = '<tr><td colspan="7" class="text-muted" style="text-align:center;">Enter a name or email to search.</td></tr>';
        return;
    }
    body.innerHTML = '<tr><td colspan="7" class="text-muted" style="text-align:center;">Searching…</td></tr>';
    try {
        var result = await fetchAdminJson('/admin/users?q=' + encodeURIComponent(q));
        var users = Array.isArray(result.data) ? result.data : [];
        window.INDIVIDUAL_USER_RESULTS = users;
        if (!users.length) {
            body.innerHTML = '<tr><td colspan="7" class="text-muted" style="text-align:center;">No matching users found.</td></tr>';
            return;
        }
        body.innerHTML = users.map(function(user) {
            var groups = Array.isArray(user.group_ids) ? user.group_ids.join(', ') : '—';
            var appRoles = Array.isArray(user.pam_app_roles)
                ? user.pam_app_roles.map(function(item) { return item.name || item.id || ''; }).filter(Boolean).join(', ')
                : '—';
            return '<tr>'
                + '<td>' + _escHtml(user.display_name || user.email || 'User') + '<br><small>' + _escHtml(user.email || '') + '</small></td>'
                + '<td>' + _escHtml(user.pam_role || 'Employee') + '</td>'
                + '<td>' + _escHtml(groups || '—') + '</td>'
                + '<td>' + _escHtml(appRoles || '—') + '</td>'
                + '<td>' + _escHtml(user.team || '—') + '</td>'
                + '<td>' + _escHtml(user.location || '—') + '</td>'
                + '<td>' + _escHtml(user.manager_email || '—') + '</td>'
                + '</tr>';
        }).join('');
    } catch (err) {
        body.innerHTML = '<tr><td colspan="7" class="text-danger" style="text-align:center;">' + _escHtml(err.message || 'Failed to search users.') + '</td></tr>';
    }
}

window.PAM_APP_ROLE_TEMPLATES = window.PAM_APP_ROLE_TEMPLATES || [];
window.PAM_APP_CAPABILITY_GROUPS = window.PAM_APP_CAPABILITY_GROUPS || [];
window.PAM_APP_ROLE_SELECTED_USERS = window.PAM_APP_ROLE_SELECTED_USERS || [];
window.PAM_APP_ROLE_SELECTED_GROUPS = window.PAM_APP_ROLE_SELECTED_GROUPS || [];
window.PAM_APP_ROLE_SEARCH_RESULTS = window.PAM_APP_ROLE_SEARCH_RESULTS || { user: [], group: [] };

function renderPamAppCapabilityGroups(groups) {
    var body = document.getElementById('pamAppCapabilityGroups');
    if (!body) return;
    var sections = Array.isArray(groups) ? groups : [];
    if (!sections.length) {
        body.innerHTML = '<p class="text-muted">No capability catalog available.</p>';
        return;
    }
    body.innerHTML = sections.map(function(section) {
        var caps = Array.isArray(section.capabilities) ? section.capabilities : [];
        return ''
            + '<div class="guardrail-principal-panel">'
            + '  <label>' + _escHtml(section.label || section.id || 'Capabilities') + '</label>'
            + '  <div class="guardrail-chip-list" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">'
            + caps.map(function(item) {
                var capabilityId = Array.isArray(item) ? item[0] : '';
                var capabilityLabel = Array.isArray(item) ? item[1] : capabilityId;
                return '<label><input type="checkbox" name="pamAppCapability" value="' + _escHtml(capabilityId) + '"> ' + _escHtml(capabilityLabel || capabilityId) + '</label>';
            }).join('')
            + '  </div>'
            + '</div>';
    }).join('');
}

function resetPamAppRoleForm() {
    var form = document.getElementById('pamAppRoleForm');
    if (form) form.reset();
    var idEl = document.getElementById('pamAppRoleId');
    if (idEl) idEl.value = '';
    var nameEl = document.getElementById('pamAppRoleName');
    if (nameEl) nameEl.disabled = false;
    window.PAM_APP_ROLE_SELECTED_USERS = [];
    window.PAM_APP_ROLE_SELECTED_GROUPS = [];
    renderPamAppAssignmentChips();
    syncPamAppRoleAssignmentState(false);
}

function syncPamAppRoleAssignmentState(isEditing) {
    var panel = document.getElementById('pamAppRoleAssignmentsPanel');
    var note = document.getElementById('pamAppRoleAssignmentNote');
    if (panel) panel.style.display = isEditing ? '' : 'none';
    if (note) note.style.display = isEditing ? 'none' : '';
}

function renderPamAppAssignmentChips() {
    var userWrap = document.getElementById('pamAppRoleSelectedUsers');
    var groupWrap = document.getElementById('pamAppRoleSelectedGroups');
    if (userWrap) {
        userWrap.innerHTML = (window.PAM_APP_ROLE_SELECTED_USERS || []).map(function(item, idx) {
            return '<span class="guardrail-chip">' + _escHtml(item.email || item.display_name || 'User') + '<button type="button" onclick="removePamAppAssignmentChip(\'user\',' + idx + ')">&times;</button></span>';
        }).join('');
    }
    if (groupWrap) {
        groupWrap.innerHTML = (window.PAM_APP_ROLE_SELECTED_GROUPS || []).map(function(item, idx) {
            return '<span class="guardrail-chip">' + _escHtml(item.name || item.id || 'Group') + '<button type="button" onclick="removePamAppAssignmentChip(\'group\',' + idx + ')">&times;</button></span>';
        }).join('');
    }
}

function removePamAppAssignmentChip(type, idx) {
    if (type === 'group') window.PAM_APP_ROLE_SELECTED_GROUPS.splice(idx, 1);
    else window.PAM_APP_ROLE_SELECTED_USERS.splice(idx, 1);
    renderPamAppAssignmentChips();
}

async function searchPamAppAssignments(type) {
    var isGroup = type === 'group';
    var inputId = isGroup ? 'pamAppRoleGroupSearchInput' : 'pamAppRoleUserSearchInput';
    var resultsId = isGroup ? 'pamAppRoleGroupSearchResults' : 'pamAppRoleUserSearchResults';
    var q = String((document.getElementById(inputId) || {}).value || '').trim();
    var target = document.getElementById(resultsId);
    if (!target) return;
    if (!q) {
        target.innerHTML = '<div class="guardrail-search-item"><span>Enter a search term.</span></div>';
        return;
    }
    target.innerHTML = '<div class="guardrail-search-item"><span>Searching…</span></div>';
    try {
        var result = await fetchAdminJson(isGroup ? ('/admin/groups?q=' + encodeURIComponent(q)) : ('/admin/users?q=' + encodeURIComponent(q)));
        var items = isGroup ? (Array.isArray(result.data?.groups) ? result.data.groups : []) : (Array.isArray(result.data) ? result.data : []);
        window.PAM_APP_ROLE_SEARCH_RESULTS[type] = items;
        if (!items.length) {
            target.innerHTML = '<div class="guardrail-search-item"><span>No matches found.</span></div>';
            return;
        }
        target.innerHTML = items.map(function(item, idx) {
            var label = isGroup ? (item.name || item.id || 'Group') : (item.display_name || item.email || 'User');
            return '<div class="guardrail-search-item"><span>' + _escHtml(label) + '</span><button type="button" class="btn-secondary btn-pam btn-sm" onclick="addPamAppAssignmentFromResult(\'' + type + '\',' + idx + ')">Add</button></div>';
        }).join('');
    } catch (err) {
        target.innerHTML = '<div class="guardrail-search-item"><span>' + _escHtml(err.message || 'Search failed.') + '</span></div>';
    }
}

function addPamAppAssignmentFromResult(type, idx) {
    var items = window.PAM_APP_ROLE_SEARCH_RESULTS[type] || [];
    var item = items[idx];
    if (!item) return;
    if (type === 'group') {
        var gid = String(item.id || '').trim();
        if (!window.PAM_APP_ROLE_SELECTED_GROUPS.some(function(existing) { return String(existing.id || '') === gid; })) {
            window.PAM_APP_ROLE_SELECTED_GROUPS.push({ id: gid, name: item.name || gid });
        }
    } else {
        var email = String(item.email || '').trim().toLowerCase();
        if (!window.PAM_APP_ROLE_SELECTED_USERS.some(function(existing) { return String(existing.email || '').toLowerCase() === email; })) {
            window.PAM_APP_ROLE_SELECTED_USERS.push({ email: email, display_name: item.display_name || email });
        }
    }
    renderPamAppAssignmentChips();
}

function pamAppCapabilityLabel(capabilityId) {
    var groups = window.PAM_APP_CAPABILITY_GROUPS || [];
    for (var i = 0; i < groups.length; i++) {
        var caps = Array.isArray(groups[i].capabilities) ? groups[i].capabilities : [];
        for (var j = 0; j < caps.length; j++) {
            if (Array.isArray(caps[j]) && String(caps[j][0] || '') === String(capabilityId || '')) {
                return caps[j][1] || caps[j][0];
            }
        }
    }
    return capabilityId || 'Capability';
}

async function loadPamAppRoleTemplates(force) {
    window.__npamReadCache = window.__npamReadCache || {};
    var cache = window.__npamReadCache.admin_pam_app_roles || (window.__npamReadCache.admin_pam_app_roles = { data: null, ts: 0, promise: null });
    try {
        var now = Date.now();
        var result;
        if (!force && cache.promise) result = await cache.promise;
        else if (!force && cache.data && (now - cache.ts) < 15000) result = cache.data;
        else {
            cache.promise = fetchAdminJson('/admin/app-roles')
                .then(function(resp) { cache.data = resp; cache.ts = Date.now(); return resp; })
                .finally(function() { cache.promise = null; });
            result = await cache.promise;
        }
        window.PAM_APP_ROLE_TEMPLATES = Array.isArray(result.data?.roles) ? result.data.roles : [];
        window.PAM_APP_CAPABILITY_GROUPS = Array.isArray(result.data?.capability_groups) ? result.data.capability_groups : [];
        renderPamAppCapabilityGroups(window.PAM_APP_CAPABILITY_GROUPS);
        renderPamAppRoleTemplates(window.PAM_APP_ROLE_TEMPLATES);
    } catch (err) {
        renderPamAppRoleTemplates([], err.message || 'Failed to load PAM roles.');
    }
}

function renderPamAppRoleTemplates(roles, error) {
    var body = document.getElementById('pamAppRolesBody');
    if (!body) return;
    if (error) {
        body.innerHTML = '<p class="text-danger">' + _escHtml(error) + '</p>';
        return;
    }
    if (!Array.isArray(roles) || !roles.length) {
        body.innerHTML = '<p class="text-muted">No PAM roles created yet.</p>';
        return;
    }
    body.innerHTML = roles.map(function(role) {
        var capabilityCount = Array.isArray(role.capabilities) ? role.capabilities.length : 0;
        var userCount = Array.isArray(role.user_emails) ? role.user_emails.length : 0;
        var groupCount = Array.isArray(role.group_ids) ? role.group_ids.length : 0;
        return ''
            + '<div class="group-detail-card group-role-admin">'
            + '  <div class="group-detail-header">'
            + '    <h4><i class="fas fa-user-shield"></i> ' + _escHtml(role.name || role.id || 'PAM Role') + '</h4>'
            + '    <span class="badge badge-admin">' + (role.system_default ? 'System Default' : 'Custom') + '</span>'
            + '  </div>'
            + '  <p class="group-role-desc">' + _escHtml(role.description || 'No description added yet.') + '</p>'
            + '  <p class="group-role-desc"><strong>Tabs / Subtabs:</strong> ' + _escHtml(String(capabilityCount)) + ' selected</p>'
            + '  <p class="group-role-desc"><strong>Assignments:</strong> ' + _escHtml(String(groupCount)) + ' groups, ' + _escHtml(String(userCount)) + ' users</p>'
            + '  <div class="group-card-actions">'
            + '<button class="btn-secondary btn-pam btn-sm" onclick="editPamAppRoleTemplate(\'' + _jsSingleQuote(role.id) + '\')"><i class="fas fa-edit"></i> ' + (role.system_default ? 'Edit Default Role' : 'Edit') + '</button>'
            + (role.system_default
                ? '<span class="text-muted">You can add or remove tabs here.</span>'
                : '<button class="btn-danger btn-pam btn-sm" onclick="deletePamAppRoleTemplate(\'' + _jsSingleQuote(role.id) + '\')"><i class="fas fa-trash"></i> Delete</button>')
            + '  </div>'
            + '</div>';
    }).join('');
}

function editPamAppRoleTemplate(roleId) {
    var role = (window.PAM_APP_ROLE_TEMPLATES || []).find(function(item) { return String(item.id || '') === String(roleId || ''); });
    if (!role) return;
    document.getElementById('pamAppRoleId').value = role.id || '';
    document.getElementById('pamAppRoleName').value = role.name || '';
    document.getElementById('pamAppRoleName').disabled = !!role.system_default;
    document.getElementById('pamAppRoleDescription').value = role.description || '';
    Array.from(document.querySelectorAll('input[name="pamAppCapability"]')).forEach(function(cb) {
        cb.checked = Array.isArray(role.capabilities) && role.capabilities.indexOf(String(cb.value || '').trim()) >= 0;
    });
    window.PAM_APP_ROLE_SELECTED_GROUPS = (role.group_ids || []).map(function(id) {
        var group = (window.USER_MGMT_GROUPS_DATA || []).find(function(item) { return String(item.id || '') === String(id || ''); });
        return { id: id, name: (group && (group.name || group.id)) || id };
    });
    window.PAM_APP_ROLE_SELECTED_USERS = (role.user_emails || []).map(function(email) { return { email: email, display_name: email }; });
    renderPamAppAssignmentChips();
    syncPamAppRoleAssignmentState(true);
    openRoleEditorModal('pam');
}

async function deletePamAppRoleTemplate(roleId) {
    if (!confirm('Delete this PAM role?')) return;
    try {
        await fetchAdminJson('/admin/app-roles/' + encodeURIComponent(roleId), { method: 'DELETE' });
        await loadPamAppRoleTemplates(true);
    } catch (err) {
        alert('Failed to delete PAM role: ' + (err.message || ''));
    }
}

async function savePamAppRoleForm(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    var id = String((document.getElementById('pamAppRoleId') || {}).value || '').trim();
    var name = String((document.getElementById('pamAppRoleName') || {}).value || '').trim();
    if (!name) {
        alert('Role name is required.');
        return;
    }
    var description = String((document.getElementById('pamAppRoleDescription') || {}).value || '').trim();
    var capabilities = Array.from(document.querySelectorAll('input[name="pamAppCapability"]:checked')).map(function(cb) {
        return String(cb.value || '').trim();
    });
    if (!capabilities.length) {
        alert('Select at least one tab or subtab.');
        return;
    }
    try {
        var response = await fetchAdminJson(id ? ('/admin/app-roles/' + encodeURIComponent(id)) : '/admin/app-roles', {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: id,
                name: name,
                description: description,
                capabilities: capabilities,
                group_ids: (window.PAM_APP_ROLE_SELECTED_GROUPS || []).map(function(item) { return item.id; }),
                user_emails: (window.PAM_APP_ROLE_SELECTED_USERS || []).map(function(item) { return item.email; })
            })
        });
        await loadPamAppRoleTemplates(true);
        var wasEditing = !!(window.__ROLE_EDITOR_MODAL_STATE && window.__ROLE_EDITOR_MODAL_STATE.active && window.__ROLE_EDITOR_MODAL_STATE.kind === 'pam');
        if (wasEditing) {
            closeRoleEditorModal('pam');
            if (typeof notifyApp === 'function') notifyApp('PAM role saved', 'Your PAM role changes were saved successfully.', 'success');
        } else {
            resetPamAppRoleForm();
            if (typeof notifyApp === 'function') notifyApp('PAM role created', 'PAM role saved. Use Edit to attach users or groups.', 'success');
        }
    } catch (err) {
        alert('Failed to save PAM role: ' + (err.message || ''));
    }
}

function resetIamRoleTemplateForm() {
    var form = document.getElementById('iamRoleTemplateForm');
    if (form) form.reset();
    var idEl = document.getElementById('iamRoleTemplateId');
    if (idEl) idEl.value = '';
    var nameEl = document.getElementById('iamRoleTemplateName');
    if (nameEl) nameEl.disabled = false;
    window.IAM_ROLE_SELECTED_USERS = [];
    window.IAM_ROLE_SELECTED_GROUPS = [];
    renderIamAssignmentChips();
    syncIamRoleAssignmentState(false);
}

function syncIamRoleAssignmentState(isEditing) {
    var panel = document.getElementById('iamRoleAssignmentsPanel');
    var note = document.getElementById('iamRoleAssignmentNote');
    if (panel) panel.style.display = isEditing ? '' : 'none';
    if (note) note.style.display = isEditing ? 'none' : '';
}

function renderIamAssignmentChips() {
    var userWrap = document.getElementById('iamRoleSelectedUsers');
    var groupWrap = document.getElementById('iamRoleSelectedGroups');
    if (userWrap) {
        userWrap.innerHTML = (window.IAM_ROLE_SELECTED_USERS || []).map(function(item, idx) {
            return '<span class="guardrail-chip">' + _escHtml(item.email || item.display_name || 'User') + '<button type="button" onclick="removeIamAssignmentChip(\'user\',' + idx + ')">&times;</button></span>';
        }).join('');
    }
    if (groupWrap) {
        groupWrap.innerHTML = (window.IAM_ROLE_SELECTED_GROUPS || []).map(function(item, idx) {
            return '<span class="guardrail-chip">' + _escHtml(item.name || item.id || 'Group') + '<button type="button" onclick="removeIamAssignmentChip(\'group\',' + idx + ')">&times;</button></span>';
        }).join('');
    }
}

function removeIamAssignmentChip(type, idx) {
    if (type === 'group') window.IAM_ROLE_SELECTED_GROUPS.splice(idx, 1);
    else window.IAM_ROLE_SELECTED_USERS.splice(idx, 1);
    renderIamAssignmentChips();
}

async function searchIamAssignments(type) {
    var isGroup = type === 'group';
    var inputId = isGroup ? 'iamRoleGroupSearchInput' : 'iamRoleUserSearchInput';
    var resultsId = isGroup ? 'iamRoleGroupSearchResults' : 'iamRoleUserSearchResults';
    var q = String((document.getElementById(inputId) || {}).value || '').trim();
    var target = document.getElementById(resultsId);
    if (!target) return;
    if (!q) {
        target.innerHTML = '<div class="guardrail-search-item"><span>Enter a search term.</span></div>';
        return;
    }
    target.innerHTML = '<div class="guardrail-search-item"><span>Searching…</span></div>';
    try {
        var result = await fetchAdminJson(isGroup ? ('/admin/groups?q=' + encodeURIComponent(q)) : ('/admin/users?q=' + encodeURIComponent(q)));
        var items = isGroup ? (Array.isArray(result.data?.groups) ? result.data.groups : []) : (Array.isArray(result.data) ? result.data : []);
        window.IAM_ROLE_SEARCH_RESULTS[type] = items;
        if (!items.length) {
            target.innerHTML = '<div class="guardrail-search-item"><span>No matches found.</span></div>';
            return;
        }
        target.innerHTML = items.map(function(item, idx) {
            var label = isGroup ? (item.name || item.id || 'Group') : (item.display_name || item.email || 'User');
            return '<div class="guardrail-search-item"><span>' + _escHtml(label) + '</span><button type="button" class="btn-secondary btn-pam btn-sm" onclick="addIamAssignmentFromResult(\'' + type + '\',' + idx + ')">Add</button></div>';
        }).join('');
    } catch (err) {
        target.innerHTML = '<div class="guardrail-search-item"><span>' + _escHtml(err.message || 'Search failed.') + '</span></div>';
    }
}

function addIamAssignmentFromResult(type, idx) {
    var items = window.IAM_ROLE_SEARCH_RESULTS[type] || [];
    var item = items[idx];
    if (!item) return;
    if (type === 'group') {
        var gid = String(item.id || '').trim();
        if (!window.IAM_ROLE_SELECTED_GROUPS.some(function(existing) { return String(existing.id || '') === gid; })) {
            window.IAM_ROLE_SELECTED_GROUPS.push({ id: gid, name: item.name || gid });
        }
    } else {
        var email = String(item.email || '').trim().toLowerCase();
        if (!window.IAM_ROLE_SELECTED_USERS.some(function(existing) { return String(existing.email || '').toLowerCase() === email; })) {
            window.IAM_ROLE_SELECTED_USERS.push({ email: email, display_name: item.display_name || email });
        }
    }
    renderIamAssignmentChips();
}

async function loadIamRoleTemplates(force) {
    window.__npamReadCache = window.__npamReadCache || {};
    var cache = window.__npamReadCache.admin_iam_roles || (window.__npamReadCache.admin_iam_roles = { data: null, ts: 0, promise: null });
    try {
        var now = Date.now();
        var result;
        if (!force && cache.promise) result = await cache.promise;
        else if (!force && cache.data && (now - cache.ts) < 15000) result = cache.data;
        else {
            cache.promise = fetchAdminJson('/admin/iam-roles')
                .then(function(resp) { cache.data = resp; cache.ts = Date.now(); return resp; })
                .finally(function() { cache.promise = null; });
            result = await cache.promise;
        }
        window.IAM_ROLE_TEMPLATES = Array.isArray(result.data?.roles) ? result.data.roles : [];
        renderIamRoleTemplates(window.IAM_ROLE_TEMPLATES);
    } catch (err) {
        renderIamRoleTemplates([], err.message || 'Failed to load IAM role templates.');
    }
}

function renderIamRoleTemplates(roles, error) {
    var body = document.getElementById('iamRoleTemplatesBody');
    if (!body) return;
    if (error) {
        body.innerHTML = '<p class="text-danger">' + _escHtml(error) + '</p>';
        return;
    }
    if (!Array.isArray(roles) || !roles.length) {
        body.innerHTML = '<p class="text-muted">No IAM role templates created yet.</p>';
        return;
    }
    body.innerHTML = roles.map(function(role) {
        var roleType = String(role.request_role || '').trim().toLowerCase();
        var roleTypeLabel = ({
            read_only: 'Read Only',
            read_limited_write: 'Limited Write',
            admin: 'Full Admin'
        })[roleType] || 'Custom';
        var envLabel = Array.isArray(role.visible_environments) && role.visible_environments.length
            ? role.visible_environments.join(', ')
            : 'All';
        var actionCount = Array.isArray(role.actions) ? role.actions.length : 0;
        var userCount = Array.isArray(role.user_emails) ? role.user_emails.length : 0;
        var groupCount = Array.isArray(role.group_ids) ? role.group_ids.length : 0;
        return ''
            + '<div class="group-detail-card group-role-admin">'
            + '  <div class="group-detail-header">'
            + '    <h4><i class="fas fa-id-card"></i> ' + _escHtml(role.name || role.id || 'IAM Role') + '</h4>'
            + '    <span class="badge badge-admin">' + _escHtml(roleTypeLabel) + '</span>'
            + '  </div>'
            + '  <p class="group-role-desc">' + _escHtml(role.description || 'No description added yet.') + '</p>'
            + '  <p class="group-role-desc"><strong>Actions:</strong> ' + _escHtml(String(actionCount)) + ' selected</p>'
            + '  <p class="group-role-desc"><strong>Visible In:</strong> ' + _escHtml(envLabel) + (role.default_visible ? ' | Default request role' : '') + (role.system_default ? ' | System default' : '') + '</p>'
            + '  <p class="group-role-desc"><strong>Assignments:</strong> ' + _escHtml(String(groupCount)) + ' groups, ' + _escHtml(String(userCount)) + ' users</p>'
            + '  <div class="group-card-actions">'
            + '    <button class="btn-secondary btn-pam btn-sm" onclick="editIamRoleTemplate(\'' + _jsSingleQuote(role.id) + '\')"><i class="fas fa-edit"></i> ' + (role.system_default ? 'Edit Default Role' : 'Edit') + '</button>'
            + (role.system_default
                ? '    <span class="text-muted">You can tune actions and assignments here.</span>'
                : '    <button class="btn-danger btn-pam btn-sm" onclick="deleteIamRoleTemplate(\'' + _jsSingleQuote(role.id) + '\')"><i class="fas fa-trash"></i> Delete</button>')
            + '  </div>'
            + '</div>';
    }).join('');
}

function editIamRoleTemplate(roleId) {
    var role = (window.IAM_ROLE_TEMPLATES || []).find(function(item) { return String(item.id || '') === String(roleId || ''); });
    if (!role) return;
    document.getElementById('iamRoleTemplateId').value = role.id || '';
    document.getElementById('iamRoleTemplateName').value = role.name || '';
    document.getElementById('iamRoleTemplateName').disabled = !!role.system_default;
    document.getElementById('iamRoleTemplateDescription').value = role.description || '';
    Array.from(document.querySelectorAll('#iamRoleActionsGrid input[type="checkbox"]')).forEach(function(cb) {
        cb.checked = Array.isArray(role.actions) && role.actions.indexOf(String(cb.value || '').toUpperCase()) >= 0;
    });
    window.IAM_ROLE_SELECTED_GROUPS = (role.group_ids || []).map(function(id) {
        var group = (window.USER_MGMT_GROUPS_DATA || []).find(function(item) { return String(item.id || '') === String(id || ''); });
        return { id: id, name: (group && (group.name || group.id)) || id };
    });
    window.IAM_ROLE_SELECTED_USERS = (role.user_emails || []).map(function(email) { return { email: email, display_name: email }; });
    renderIamAssignmentChips();
    syncIamRoleAssignmentState(true);
    openRoleEditorModal('iam');
}

async function deleteIamRoleTemplate(roleId) {
    if (!confirm('Delete this IAM role template?')) return;
    try {
        await fetchAdminJson('/admin/iam-roles/' + encodeURIComponent(roleId), { method: 'DELETE' });
        await loadIamRoleTemplates(true);
    } catch (err) {
        alert('Failed to delete IAM role template: ' + (err.message || ''));
    }
}

async function saveIamRoleTemplateForm(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    var id = String((document.getElementById('iamRoleTemplateId') || {}).value || '').trim();
    var name = String((document.getElementById('iamRoleTemplateName') || {}).value || '').trim();
    if (!name) {
        alert('Role name is required.');
        return;
    }
    var description = String((document.getElementById('iamRoleTemplateDescription') || {}).value || '').trim();
    var actions = Array.from(document.querySelectorAll('#iamRoleActionsGrid input[type="checkbox"]:checked')).map(function(cb) {
        return String(cb.value || '').trim().toUpperCase();
    });
    try {
        var response = await fetchAdminJson(id ? ('/admin/iam-roles/' + encodeURIComponent(id)) : '/admin/iam-roles', {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: id,
                name: name,
                description: description,
                actions: actions,
                group_ids: (window.IAM_ROLE_SELECTED_GROUPS || []).map(function(item) { return item.id; }),
                user_emails: (window.IAM_ROLE_SELECTED_USERS || []).map(function(item) { return item.email; })
            })
        });
        await loadIamRoleTemplates(true);
        var wasEditing = !!(window.__ROLE_EDITOR_MODAL_STATE && window.__ROLE_EDITOR_MODAL_STATE.active && window.__ROLE_EDITOR_MODAL_STATE.kind === 'iam');
        if (wasEditing) {
            closeRoleEditorModal('iam');
            if (typeof notifyApp === 'function') notifyApp('IAM role saved', 'Your IAM role changes were saved successfully.', 'success');
        } else {
            resetIamRoleTemplateForm();
            if (typeof notifyApp === 'function') notifyApp('IAM role created', 'IAM role saved. Use Edit to attach users or groups.', 'success');
        }
    } catch (err) {
        alert('Failed to save IAM role template: ' + (err.message || ''));
    }
}

async function loadUsersManagement(force) {
    await loadPamAdmins();
    try {
        var result = await fetchAdminJson('/admin/users');
        window.USER_MGMT_USERS = Array.isArray(result.data) ? result.data : [];
    } catch (e) {
        window.USER_MGMT_USERS = [];
    }
    await loadGroupsManagement(!!force);
    await loadPamAppRoleTemplates(!!force);
    await loadIamRoleTemplates(!!force);
    if (typeof updateAccessGroupCounts === 'function') updateAccessGroupCounts();
}

window.__adminUsersManagementImpl = loadUsersManagement;
window.populateGroupUsersList = populateGroupUsersList;
window.editGroup = editGroup;
window.deleteAccessGroup = deleteAccessGroup;
window.deleteGroup = deleteGroup;
window.showCreateNewGroupModal = showCreateNewGroupModal;
window.showCreateGroupModal = showCreateGroupModal;
window.showCreatePamAppRoleModal = showCreatePamAppRoleModal;
window.showCreateIamRoleModal = showCreateIamRoleModal;
window.searchIndividualUsers = searchIndividualUsers;
window.searchPamAppAssignments = searchPamAppAssignments;
window.addPamAppAssignmentFromResult = addPamAppAssignmentFromResult;
window.removePamAppAssignmentChip = removePamAppAssignmentChip;
window.resetPamAppRoleForm = resetPamAppRoleForm;
window.closeRoleEditorModal = closeRoleEditorModal;
window.loadPamAppRoleTemplates = loadPamAppRoleTemplates;
window.editPamAppRoleTemplate = editPamAppRoleTemplate;
window.deletePamAppRoleTemplate = deletePamAppRoleTemplate;
window.searchIamAssignments = searchIamAssignments;
window.addIamAssignmentFromResult = addIamAssignmentFromResult;
window.removeIamAssignmentChip = removeIamAssignmentChip;
window.toggleGroupUserSelection = toggleGroupUserSelection;
window.toggleVisibleGroupUsers = toggleVisibleGroupUsers;
window.resetIamRoleTemplateForm = resetIamRoleTemplateForm;
window.loadGroupsManagement = loadGroupsManagement;
window.loadIamRoleTemplates = loadIamRoleTemplates;
window.editIamRoleTemplate = editIamRoleTemplate;
window.deleteIamRoleTemplate = deleteIamRoleTemplate;
window.openAdminUserProfileModal = openAdminUserProfileModal;
window.saveAdminUserProfile = saveAdminUserProfile;

function initializeAdminManagementV2() {
    var groupEditorForm = document.getElementById('createNewGroupForm');
    if (groupEditorForm && !groupEditorForm.dataset.v2bound) {
        groupEditorForm.dataset.v2bound = '1';
        groupEditorForm.addEventListener('submit', handleGroupEditorSubmit, true);
    }
    var groupMembersForm = document.getElementById('createGroupForm');
    if (groupMembersForm && !groupMembersForm.dataset.v2bound) {
        groupMembersForm.dataset.v2bound = '1';
        groupMembersForm.addEventListener('submit', handleGroupMembersSubmit, true);
    }
    var iamRoleForm = document.getElementById('iamRoleTemplateForm');
    if (iamRoleForm && !iamRoleForm.dataset.v2bound) {
        iamRoleForm.dataset.v2bound = '1';
        iamRoleForm.addEventListener('submit', saveIamRoleTemplateForm, true);
    }
    var pamAppRoleForm = document.getElementById('pamAppRoleForm');
    if (pamAppRoleForm && !pamAppRoleForm.dataset.v2bound) {
        pamAppRoleForm.dataset.v2bound = '1';
        pamAppRoleForm.addEventListener('submit', savePamAppRoleForm, true);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAdminManagementV2);
} else {
    initializeAdminManagementV2();
}
