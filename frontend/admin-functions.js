// Admin Functions - User & Group Management

// Access groups (who accesses the tool) - ReadOnly, Manager, Admin (same as roles)
window.USER_MGMT_GROUPS = window.USER_MGMT_GROUPS || [
    { id: 'ReadOnly', name: 'ReadOnly' },
    { id: 'Manager', name: 'Manager' },
    { id: 'Admin', name: 'Admin' }
];
window.USER_MGMT_USERS = window.USER_MGMT_USERS || [];

// Show admin panel button only for admins
function checkAdminAccess() {
    var adminBtn = document.getElementById('adminPanelBtn');
    if (!adminBtn) return;
    var isAdmin = localStorage.getItem('isAdmin') === 'true';
    if (isAdmin) {
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
}

// Show create group modal (Assign Users to Group)
function showCreateGroupModal() {
    openUserMgmtModal('createGroupModal');
    populateGroupUsersList();
    document.getElementById('createGroupForm').reset();
}

// Populate group dropdown from groups store
function populateGroupDropdown() {
    var sel = document.getElementById('userGroup');
    if (!sel) return;
    var groups = window.USER_MGMT_GROUPS || [];
    sel.innerHTML = '<option value="">Select Group (optional)</option>' +
        groups.map(function(g) {
            return '<option value="' + (g.id || g.name) + '">' + (g.name || g.id) + '</option>';
        }).join('');
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
            var name = (u.first_name || '') + ' ' + (u.middle_name || '') + ' ' + (u.last_name || '');
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
            var firstName = document.getElementById('userFirstName').value.trim();
            var middleName = document.getElementById('userMiddleName').value.trim();
            var lastName = document.getElementById('userLastName').value.trim();
            var email = document.getElementById('userEmail').value.trim();
            var role = document.getElementById('userRole').value;
            var group = document.getElementById('userGroup').value;
            if (!email) {
                alert('Email address is required.');
                return;
            }
            var userData = {
                first_name: firstName,
                middle_name: middleName,
                last_name: lastName,
                email: email,
                role: role,
                group: group || null
            };
            fetch('http://127.0.0.1:5000/api/admin/create-user', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(userData)
            }).then(function(r) { return r.json(); }).then(function(result) {
                alert('User created: ' + firstName + ' ' + lastName);
                closeModal();
                addUserToStore(userData);
                if (typeof loadUsersManagement === 'function') loadUsersManagement();
            }).catch(function(err) {
                addUserToStore(userData);
                alert('User added locally: ' + firstName + ' ' + lastName + '\n(API unavailable - saved for demo)');
                closeModal();
                if (typeof loadUsersManagement === 'function') loadUsersManagement();
            });
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
    var readonly = users.filter(function(u) { return u.role === 'ReadOnly'; }).length;
    var manager = users.filter(function(u) { return u.role === 'Manager'; }).length;
    var admin = users.filter(function(u) { return u.role === 'Admin'; }).length;
    var el;
    if (el = document.getElementById('readonlyGroupCount')) el.textContent = readonly;
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
