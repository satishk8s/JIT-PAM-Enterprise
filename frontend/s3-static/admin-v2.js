// Admin interface functionality
let currentSection = 'users';

// Initialize admin interface
window.addEventListener('load', async () => {
  await loadUserProfile();
  await loadUsers();
  await loadPermissionUsers();
  setupAdminEventListeners();
});

// Section Management
function showSection(section) {
  // Hide all sections
  document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
  
  // Show selected section
  document.getElementById(section + 'Section').style.display = 'block';
  event.target.classList.add('active');
  
  currentSection = section;
  
  // Load section data
  switch(section) {
    case 'users': loadUsers(); break;
    case 'accounts': loadAccounts(); break;
    case 'buckets': loadBucketPermissions(); break;
  }
}

// User Management
async function loadUsers() {
  try {
    const data = await api('/api/admin/users');
    const grid = document.querySelector('.users-grid');
    grid.innerHTML = '';
    
    data.users.forEach(user => {
      const card = createUserCard(user);
      grid.appendChild(card);
    });
  } catch (e) {
    console.error('Failed to load users:', e);
  }
}

function createUserCard(user) {
  const card = document.createElement('div');
  card.className = 'user-card';
  card.onclick = () => openUserDetails(user.username);
  
  const roleClass = user.role.toLowerCase();
  const icon = user.role === 'admin' ? 'fas fa-crown' : 'fas fa-user';
  
  card.innerHTML = `
    <div class="user-avatar">
      <i class="${icon}"></i>
    </div>
    <div class="user-info">
      <h4>${user.full_name || user.username}</h4>
      <p>${user.username}</p>
      <span class="role-badge ${roleClass}">${user.role}</span>
    </div>
  `;
  
  return card;
}

// Modal Management
function openCreateUserModal() {
  document.getElementById('createUserModal').classList.add('show');
}

function closeCreateUserModal() {
  document.getElementById('createUserModal').classList.remove('show');
  clearCreateUserForm();
}

function clearCreateUserForm() {
  document.getElementById('newUserEmail').value = '';
  document.getElementById('newUserName').value = '';
  document.getElementById('newUserCompany').value = '';
  document.getElementById('newUserManager').value = '';
  document.getElementById('newUserRole').value = 'readonly';
  document.getElementById('newUserPassword').value = '';
}

async function createUser() {
  const userData = {
    username: document.getElementById('newUserEmail').value,
    password: document.getElementById('newUserPassword').value,
    role: document.getElementById('newUserRole').value,
    full_name: document.getElementById('newUserName').value,
    company: document.getElementById('newUserCompany').value,
    manager: document.getElementById('newUserManager').value
  };
  
  try {
    await api('/api/admin/create-user', 'POST', userData);
    alert('User created successfully');
    closeCreateUserModal();
    loadUsers();
  } catch (e) {
    alert('Failed to create user: ' + e.message);
  }
}

async function openUserDetails(username) {
  // Load user data and show modal
  document.getElementById('userDetailsModal').classList.add('show');
  document.getElementById('editUserEmail').value = username;
  
  // Load user permissions
  await loadUserPermissions(username);
}

function closeUserDetailsModal() {
  document.getElementById('userDetailsModal').classList.remove('show');
}

async function updateUser() {
  const username = document.getElementById('editUserEmail').value;
  const role = document.getElementById('editUserRole').value;
  
  try {
    await api('/api/admin/update-role', 'POST', { username, role });
    alert('User updated successfully');
    closeUserDetailsModal();
    loadUsers();
  } catch (e) {
    alert('Failed to update user: ' + e.message);
  }
}

async function deleteUser() {
  const username = document.getElementById('editUserEmail').value;
  if (!confirm(`Delete user ${username}?`)) return;
  
  try {
    await api('/api/admin/delete-user', 'POST', { username });
    alert('User deleted successfully');
    closeUserDetailsModal();
    loadUsers();
  } catch (e) {
    alert('Failed to delete user: ' + e.message);
  }
}

async function resetUserMFA() {
  const username = document.getElementById('editUserEmail').value;
  if (!confirm(`Reset MFA for ${username}?`)) return;
  
  try {
    await api('/api/admin/reset-mfa', 'POST', { username });
    alert('MFA reset successfully');
  } catch (e) {
    alert('Failed to reset MFA: ' + e.message);
  }
}

// Accounts Management
async function loadAccounts() {
  // Implementation for loading AWS accounts
  const tbody = document.getElementById('accountsTableBody');
  tbody.innerHTML = '<tr><td colspan="5">No accounts configured</td></tr>';
}

function openAddAccountModal() {
  alert('Add Account functionality coming soon');
}

// Bucket Permissions Management
async function loadBucketPermissions() {
  try {
    const data = await api('/api/admin/bucket-permissions');
    const tbody = document.getElementById('permissionsTableBody');
    tbody.innerHTML = '';
    
    if (!data.permissions.length) {
      tbody.innerHTML = '<tr><td colspan="6">No permissions assigned</td></tr>';
      return;
    }
    
    data.permissions.forEach(perm => {
      const row = createPermissionRow(perm);
      tbody.appendChild(row);
    });
  } catch (e) {
    console.error('Failed to load permissions:', e);
  }
}

async function loadPermissionUsers() {
  const res = await api('/api/admin/users');
  const sel = document.getElementById('perm_user');
  sel.innerHTML = '';
  res.users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.username;
    opt.textContent = u.username + ' (' + u.role + ')';
    sel.appendChild(opt);
  });
}

function createPermissionRow(perm) {
  const row = document.createElement('tr');
  
  const permissions = [];
  if (perm.can_read) permissions.push('Read');
  if (perm.can_upload) permissions.push('Upload');
  if (perm.can_download) permissions.push('Download');
  if (perm.can_delete) permissions.push('Delete');
  
  const pathDisplay = perm.prefix_path ? perm.prefix_path : 'Entire Bucket';
  
  row.innerHTML = `
    <td>${perm.username}</td>
    <td>${perm.bucket_name}</td>
    <td>${pathDisplay}</td>
    <td>${permissions.join(', ') || 'None'}</td>
    <td>—</td>
    <td>
      <button class="action-btn" onclick="editPermission('${perm.username}', '${perm.bucket_name}')">
        <i class="fas fa-edit"></i>
      </button>
      <button class="action-btn" onclick="revokePermission('${perm.username}', '${perm.bucket_name}')">
        <i class="fas fa-trash"></i>
      </button>
    </td>
  `;
  
  return row;
}

function openGrantAccessModal() {
  alert('Grant Access functionality coming soon');
}

function editPermission(username, bucket) {
  alert(`Edit permission for ${username} on ${bucket}`);
}

function revokePermission(username, bucket) {
  if (confirm(`Revoke access for ${username} to ${bucket}?`)) {
    alert('Permission revoked');
    loadBucketPermissions();
  }
}

// User Bucket Permissions Functions
function toggleUserPrefixInput() {
  const accessLevel = document.getElementById('userAccessLevel').value;
  const prefixInput = document.getElementById('userPrefixPath');
  
  if (accessLevel === 'prefix') {
    prefixInput.style.display = 'inline-block';
  } else {
    prefixInput.style.display = 'none';
    prefixInput.value = '';
  }
}

async function loadUserPermissions(username) {
  try {
    const data = await api('/api/admin/bucket-permissions');
    const userPerms = data.permissions.filter(p => p.username === username);
    const tbody = document.getElementById('userPermissionsTable');
    tbody.innerHTML = '';
    
    if (!userPerms.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No bucket permissions assigned</td></tr>';
      return;
    }
    
    userPerms.forEach(perm => {
      const row = createUserPermissionRow(perm);
      tbody.appendChild(row);
    });
  } catch (e) {
    console.error('Failed to load user permissions:', e);
  }
}

function createUserPermissionRow(perm) {
  const row = document.createElement('tr');
  
  const permissions = [];
  if (perm.can_read) permissions.push('Read');
  if (perm.can_upload) permissions.push('Upload');
  if (perm.can_download) permissions.push('Download');
  if (perm.can_delete) permissions.push('Delete');
  
  const pathDisplay = perm.prefix_path ? perm.prefix_path : 'Entire Bucket';
  
  row.innerHTML = `
    <td>${perm.bucket_name}</td>
    <td>${pathDisplay}</td>
    <td>${permissions.join(', ') || 'None'}</td>
    <td>
      <button class="action-btn" onclick="removeUserBucketPermission('${perm.username}', '${perm.bucket_name}', '${perm.prefix_path || ''}')" title="Remove">
        <i class="fas fa-trash"></i>
      </button>
    </td>
  `;
  
  return row;
}

async function addUserBucketPermission() {
  const username = document.getElementById('editUserEmail').value;
  const bucket = document.getElementById('userBucketName').value.trim();
  const accessLevel = document.getElementById('userAccessLevel').value;
  const prefix = accessLevel === 'prefix' ? document.getElementById('userPrefixPath').value.trim() : '';
  const can_read = document.getElementById('userCanRead').checked ? 1 : 0;
  const can_upload = document.getElementById('userCanUpload').checked ? 1 : 0;
  const can_download = document.getElementById('userCanDownload').checked ? 1 : 0;
  const can_delete = document.getElementById('userCanDelete').checked ? 1 : 0;
  
  const msgEl = document.getElementById('userPermMsg');
  
  if (!bucket) {
    msgEl.textContent = 'Please enter a bucket name.';
    msgEl.style.color = 'var(--danger-color)';
    return;
  }
  
  if (accessLevel === 'prefix' && !prefix) {
    msgEl.textContent = 'Please enter a folder path.';
    msgEl.style.color = 'var(--danger-color)';
    return;
  }
  
  try {
    await api('/api/admin/set-bucket-perms', 'POST', {
      username,
      bucket_name: bucket,
      prefix_path: prefix,
      can_read,
      can_upload,
      can_download,
      can_delete
    });
    
    msgEl.textContent = 'Permission added successfully!';
    msgEl.style.color = 'var(--success-color)';
    
    // Clear form
    document.getElementById('userBucketName').value = '';
    document.getElementById('userPrefixPath').value = '';
    document.getElementById('userAccessLevel').value = 'bucket';
    document.getElementById('userCanRead').checked = false;
    document.getElementById('userCanUpload').checked = false;
    document.getElementById('userCanDownload').checked = false;
    document.getElementById('userCanDelete').checked = false;
    toggleUserPrefixInput();
    
    // Reload permissions
    await loadUserPermissions(username);
    
    // Clear message after 3 seconds
    setTimeout(() => {
      msgEl.textContent = '';
    }, 3000);
    
  } catch (e) {
    msgEl.textContent = 'Error: ' + e.message;
    msgEl.style.color = 'var(--danger-color)';
  }
}

async function removeUserBucketPermission(username, bucket, prefix) {
  if (!confirm(`Remove access to ${bucket}${prefix ? '/' + prefix : ''} for ${username}?`)) return;
  
  try {
    await api('/api/admin/set-bucket-perms', 'POST', {
      username,
      bucket_name: bucket,
      prefix_path: prefix,
      can_read: 0,
      can_upload: 0,
      can_download: 0,
      can_delete: 0
    });
    
    await loadUserPermissions(username);
  } catch (e) {
    alert('Failed to remove permission: ' + e.message);
  }
}

// Event Listeners
function setupAdminEventListeners() {
  // Close modals when clicking outside
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.classList.remove('show');
    }
  });
}