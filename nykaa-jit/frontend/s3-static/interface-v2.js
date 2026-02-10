// Enhanced S3 Explorer Interface
let currentBucket = '';
let currentPrefix = '';
let currentPermissions = {};
let selectedFiles = new Set();

// Initialize interface
window.addEventListener('load', async () => {
  await loadUserProfile();
  await loadBuckets();
  setupEventListeners();
});

// Profile Management
async function loadUserProfile() {
  try {
    const data = await api('/api/profile');
    document.getElementById('username-display').textContent = data.username;
    document.getElementById('profile-name').textContent = data.username;
    document.getElementById('profile-role').textContent = data.role.toUpperCase();
  } catch (e) {
    console.error('Failed to load profile:', e);
  }
}

function toggleProfileDropdown() {
  const dropdown = document.getElementById('profileDropdown');
  dropdown.classList.toggle('show');
}

// Theme Management
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  
  const themeText = document.getElementById('theme-text');
  themeText.textContent = newTheme === 'dark' ? 'Light Theme' : 'Dark Theme';
}

// Load saved theme
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
document.getElementById('theme-text').textContent = savedTheme === 'dark' ? 'Light Theme' : 'Dark Theme';

// Bucket Management
async function loadBuckets() {
  try {
    const res = await api('/api/s3/buckets');
    const bucketItems = document.getElementById('bucketItems');
    bucketItems.innerHTML = '';
    
    if (!res.buckets.length) {
      bucketItems.innerHTML = '<div class="bucket-item">No buckets assigned</div>';
      return;
    }
    
    res.buckets.forEach(bucket => {
      const item = document.createElement('div');
      item.className = 'bucket-item';
      item.innerHTML = `<i class="fas fa-bucket"></i> ${bucket.bucket_name}`;
      item.onclick = () => selectBucket(bucket.bucket_name, bucket);
      bucketItems.appendChild(item);
    });
    
    // Auto-expand bucket list
    document.querySelector('.bucket-list').classList.add('expanded');
  } catch (e) {
    console.error('Failed to load buckets:', e);
  }
}

function showMyBuckets() {
  const bucketList = document.querySelector('.bucket-list');
  bucketList.classList.toggle('expanded');
}

function filterBuckets() {
  const search = document.getElementById('bucketSearch').value.toLowerCase();
  const items = document.querySelectorAll('.bucket-item');
  
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(search) ? 'flex' : 'none';
  });
}

async function selectBucket(bucketName, permissions) {
  currentBucket = bucketName;
  currentPrefix = '';
  currentPermissions = permissions;
  
  // Update UI
  document.querySelectorAll('.bucket-item').forEach(item => item.classList.remove('active'));
  event.target.classList.add('active');
  
  document.getElementById('welcomeScreen').style.display = 'none';
  document.getElementById('bucketContent').style.display = 'flex';
  
  // Show/hide action buttons based on permissions
  document.getElementById('uploadBtn').style.display = (permissions.can_upload || permissions.can_read) ? 'inline-flex' : 'none';
  document.getElementById('downloadBtn').style.display = permissions.can_download ? 'inline-flex' : 'none';
  document.getElementById('deleteBtn').style.display = permissions.can_delete ? 'inline-flex' : 'none';
  
  await loadBucketContents();
}

async function loadBucketContents() {
  try {
    const data = await api(`/api/s3/list/${currentBucket}?prefix=${encodeURIComponent(currentPrefix)}`);
    
    // Update breadcrumb
    updateBreadcrumb();
    
    // Update file table
    const tbody = document.getElementById('fileTableBody');
    tbody.innerHTML = '';
    
    // Add folders
    data.folders.forEach(folder => {
      const row = createFolderRow(folder);
      tbody.appendChild(row);
    });
    
    // Add files
    data.files.forEach(file => {
      const row = createFileRow(file);
      tbody.appendChild(row);
    });
    
    // Clear selection
    selectedFiles.clear();
    updateActionButtons();
    
  } catch (e) {
    console.error('Failed to load bucket contents:', e);
    alert('Failed to load bucket contents: ' + e.message);
  }
}

function createFolderRow(folder) {
  const row = document.createElement('tr');
  const folderName = folder.Prefix.slice(currentPrefix.length).replace(/\/$/, '');
  
  row.innerHTML = `
    <td><input type="checkbox" disabled></td>
    <td>
      <div class="file-name folder-name" onclick="navigateToFolder('${folder.Prefix}')">
        <i class="fas fa-folder file-icon"></i>
        ${folderName}
      </div>
    </td>
    <td class="file-size">—</td>
    <td class="file-date">—</td>
    <td></td>
  `;
  
  return row;
}

function createFileRow(file) {
  const row = document.createElement('tr');
  const fileName = file.Key.slice(currentPrefix.length);
  const fileSize = formatFileSize(file.Size);
  const lastModified = new Date(file.LastModified).toLocaleString();
  
  row.innerHTML = `
    <td><input type="checkbox" value="${file.Key}" onchange="toggleFileSelection('${file.Key}')"></td>
    <td>
      <div class="file-name">
        <i class="fas fa-file file-icon"></i>
        ${fileName}
      </div>
    </td>
    <td class="file-size">${fileSize}</td>
    <td class="file-date">${lastModified}</td>
    <td class="file-actions">
      ${currentPermissions.can_download ? `<button class="action-btn" onclick="downloadFile('${file.Key}')"><i class="fas fa-download"></i></button>` : ''}
      ${currentPermissions.can_delete ? `<button class="action-btn" onclick="deleteFile('${file.Key}')"><i class="fas fa-trash"></i></button>` : ''}
    </td>
  `;
  
  return row;
}

function updateBreadcrumb() {
  const breadcrumb = document.getElementById('breadcrumb');
  const parts = currentPrefix.split('/').filter(Boolean);
  
  let html = `<a href="#" onclick="navigateToFolder('')">${currentBucket}</a>`;
  let path = '';
  
  parts.forEach(part => {
    path += part + '/';
    html += ` / <a href="#" onclick="navigateToFolder('${path}')">${part}</a>`;
  });
  
  breadcrumb.innerHTML = html;
}

function navigateToFolder(prefix) {
  currentPrefix = prefix;
  loadBucketContents();
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// File Selection
function toggleFileSelection(fileKey) {
  if (selectedFiles.has(fileKey)) {
    selectedFiles.delete(fileKey);
  } else {
    selectedFiles.add(fileKey);
  }
  updateActionButtons();
}

function toggleSelectAll() {
  const checkboxes = document.querySelectorAll('#fileTableBody input[type="checkbox"]:not([disabled])');
  const selectAll = document.getElementById('selectAll');
  
  selectedFiles.clear();
  
  checkboxes.forEach(cb => {
    if (cb.value) {
      cb.checked = selectAll.checked;
      if (selectAll.checked) {
        selectedFiles.add(cb.value);
      }
    }
  });
  
  updateActionButtons();
}

function updateActionButtons() {
  const hasSelection = selectedFiles.size > 0;
  document.getElementById('downloadBtn').disabled = !hasSelection || !currentPermissions.can_download;
  document.getElementById('deleteBtn').disabled = !hasSelection || !currentPermissions.can_delete;
}

// File Operations
async function downloadFile(fileKey) {
  try {
    const response = await api(`/api/s3/presign-download/${currentBucket}`, 'POST', { key: fileKey });
    window.open(response.url, '_blank');
  } catch (e) {
    alert('Download failed: ' + e.message);
  }
}

async function downloadSelected() {
  if (!currentPermissions.can_download) {
    alert('You do not have download permissions');
    return;
  }
  
  for (const fileKey of selectedFiles) {
    await downloadFile(fileKey);
  }
}

async function deleteFile(fileKey) {
  if (!currentPermissions.can_delete) {
    alert('You do not have delete permissions');
    return;
  }
  
  if (!confirm(`Delete ${fileKey}?`)) return;
  
  try {
    await api(`/api/s3/delete/${currentBucket}`, 'POST', { key: fileKey });
    await loadBucketContents();
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}

async function deleteSelected() {
  if (!currentPermissions.can_delete) {
    alert('You do not have delete permissions');
    return;
  }
  
  if (!confirm(`Delete ${selectedFiles.size} selected files?`)) return;
  
  for (const fileKey of selectedFiles) {
    try {
      await api(`/api/s3/delete/${currentBucket}`, 'POST', { key: fileKey });
    } catch (e) {
      console.error('Failed to delete:', fileKey, e);
    }
  }
  
  await loadBucketContents();
}

function refreshBucket() {
  loadBucketContents();
}

// Event Listeners
function setupEventListeners() {
  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.profile-dropdown')) {
      document.getElementById('profileDropdown').classList.remove('show');
    }
  });
  
  // File input change
  document.getElementById('fileInput').addEventListener('change', handleFileSelection);
}

// Modal Functions
function openChangePassword() {
  document.getElementById('changePasswordModal').classList.add('show');
  document.getElementById('profileDropdown').classList.remove('show');
}

function closeChangePassword() {
  document.getElementById('changePasswordModal').classList.remove('show');
}

function openResetMFA() {
  document.getElementById('resetMFAModal').classList.add('show');
  document.getElementById('profileDropdown').classList.remove('show');
}

function closeResetMFA() {
  document.getElementById('resetMFAModal').classList.remove('show');
}

async function changePassword() {
  const current = document.getElementById('currentPassword').value;
  const newPass = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmPassword').value;
  
  if (newPass !== confirm) {
    alert('Passwords do not match');
    return;
  }
  
  try {
    await api('/api/change-password', 'POST', {
      old_password: current,
      new_password: newPass
    });
    alert('Password changed successfully');
    closeChangePassword();
  } catch (e) {
    alert('Failed to change password: ' + e.message);
  }
}

async function resetMFA() {
  try {
    await api('/api/reset-my-mfa', 'POST', {});
    alert('MFA reset successfully. You will need to set it up again on next login.');
    closeResetMFA();
  } catch (e) {
    alert('Failed to reset MFA: ' + e.message);
  }
}