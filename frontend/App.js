// Global state
let currentUser = null;
let accounts = {};
let permissionSets = [];
let requests = [];
let currentTheme = 'light';
let isAdmin = false;

// Admin users list (in production, get from backend/LDAP)
const ADMIN_USERS = [
    'satish.korra@nykaa.com',
    'admin@nykaa.com',
    'security@nykaa.com'
];

// API Base URL
const API_BASE = 'http://localhost:5000/api';

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in (in production, check JWT token)
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    if (isLoggedIn === 'true') {
        showMainApp();
    }
    
    // Load theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    
    // Setup event listeners
    setupEventListeners();
});

function setupEventListeners() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // New request form
    document.getElementById('newRequestForm').addEventListener('submit', handleNewRequest);
    
    // Close modal on overlay click
    document.getElementById('modalOverlay').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal();
        }
    });
    
    // Close modals with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
    
    // Setup form handlers after DOM loads
    setTimeout(() => {
        const requestForOthersForm = document.getElementById('requestForOthersForm');
        if (requestForOthersForm) {
            requestForOthersForm.addEventListener('submit', handleRequestForOthers);
        }
        
        const manualOnboardForm = document.getElementById('manualOnboardForm');
        if (manualOnboardForm) {
            manualOnboardForm.addEventListener('submit', handleManualOnboard);
        }
        
        const appRequestForm = document.getElementById('appRequestForm');
        if (appRequestForm) {
            appRequestForm.addEventListener('submit', handleAppRequest);
            
            const appTypeSelect = document.getElementById('appType');
            if (appTypeSelect) {
                appTypeSelect.addEventListener('change', updateSpecificAppOptions);
            }
        }
    }, 100);
}

// Authentication
function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    // In production, validate with backend
    if (email && password) {
        // Check if user is admin
        isAdmin = ADMIN_USERS.includes(email.toLowerCase());
        
        currentUser = {
            email: email,
            name: 'Satish Korra',
            role: isAdmin ? 'System Administrator' : 'DevOps Engineer',
            isAdmin: isAdmin
        };
        
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userEmail', email);
        localStorage.setItem('isAdmin', isAdmin.toString());
        showMainApp();
    }
}

function logout() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('isAdmin');
    currentUser = null;
    isAdmin = false;
    document.getElementById('loginPage').style.display = 'block';
    document.getElementById('mainApp').style.display = 'none';
}

function showMainApp() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    
    // Load admin status from storage
    isAdmin = localStorage.getItem('isAdmin') === 'true';
    
    // Set current user from storage
    const userEmail = localStorage.getItem('userEmail');
    if (userEmail) {
        currentUser = {
            email: userEmail,
            name: userEmail.split('@')[0],
            isAdmin: isAdmin
        };
    }
    
    // Update UI based on admin status
    updateUIForRole();
    
    // Load initial data
    loadAccounts();
    loadPermissionSets();
    loadRequests();
    updateDashboard();
}

function updateUIForRole() {
    const userName = document.getElementById('userName');
    if (userName && currentUser) {
        userName.textContent = isAdmin ? `👑 ${currentUser.name} (Admin)` : currentUser.name;
    }
    
    // Add admin navigation if admin
    if (isAdmin) {
        addAdminNavigation();
    }
}

function addAdminNavigation() {
    const nav = document.querySelector('.app-nav');
    if (nav && !document.getElementById('adminNav')) {
        const adminBtn = document.createElement('button');
        adminBtn.id = 'adminNav';
        adminBtn.className = 'nav-btn';
        adminBtn.innerHTML = '<i class="fas fa-shield-alt"></i> Admin Panel';
        adminBtn.onclick = () => showPage('admin');
        nav.appendChild(adminBtn);
    }
}

// Theme Management
function toggleTheme() {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    // Update theme buttons
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.remove('active');
        if (btn.onclick.toString().includes(theme)) {
            btn.classList.add('active');
        }
    });
    
    // Update theme toggle icon
    const themeIcon = document.querySelector('.theme-toggle i');
    if (themeIcon) {
        themeIcon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
}

// Navigation
function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    document.getElementById(pageId + 'Page').classList.add('active');
    
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Load page-specific data
    if (pageId === 'accounts') {
        loadAccountsPage();
    } else if (pageId === 'requests') {
        loadRequestsPage();
    } else if (pageId === 'applications') {
        loadApplicationsPage();
    } else if (pageId === 'admin') {
        loadAdminPage();
    }
}

// Admin Tab Navigation
function showAdminTab(tabId) {
    // Hide all admin tabs
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById('admin' + tabId.charAt(0).toUpperCase() + tabId.slice(1) + 'Tab').classList.add('active');
    
    // Update tab buttons
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Load tab-specific data
    if (tabId === 'dashboard') {
        loadAdminDashboard();
    } else if (tabId === 'users') {
        loadUsersManagement();
    } else if (tabId === 'audit') {
        loadAuditLogs();
    }
}

// Profile Menu
function toggleProfileMenu() {
    const menu = document.getElementById('profileMenu');
    menu.classList.toggle('show');
}

// Close profile menu when clicking outside
document.addEventListener('click', function(e) {
    const profileDropdown = document.querySelector('.profile-dropdown');
    if (!profileDropdown.contains(e.target)) {
        document.getElementById('profileMenu').classList.remove('show');
    }
});

// Modal Management
function showModal(modalId) {
    document.getElementById('modalOverlay').classList.add('show');
    document.getElementById(modalId).classList.add('show');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('show');
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('show');
    });
}

function showNewRequestModal() {
    loadRequestModalData();
    showModal('newRequestModal');
}

function showRequestForOthersModal() {
    loadRequestForOthersModalData();
    showModal('requestForOthersModal');
}

function showManualOnboardModal() {
    showModal('manualOnboardModal');
}

function showNewAppRequestModal() {
    showModal('appRequestModal');
}

// Applications Page Functions
function loadApplicationsPage() {
    console.log('Applications page loaded');
}

function requestCloudAccess(provider) {
    alert(`Cloud access request for ${provider.toUpperCase()} will be available in future releases.`);
}

function requestK8sAccess(cluster) {
    alert(`Kubernetes access request for ${cluster.toUpperCase()} will be available in future releases.`);
}

function requestGkeAccess() {
    alert('Google GKE access request will be available in future releases.');
}

function requestDbAccess(database) {
    alert(`Database access request for ${database} will be available in future releases.`);
}

function requestAppAccess(app) {
    alert(`Application access request for ${app} will be available in future releases.`);
}

function showProfile() {
    showModal('profileModal');
}

// Dummy functions for future implementation
function showResetPassword() {
    alert('Password reset functionality will be integrated with your IGA tool');
}

function showMFAReset() {
    alert('MFA reset functionality will be integrated with your IGA tool');
}

function showManager() {
    alert('Manager information will be loaded from your HR system');
}

function showPasswordReset() {
    alert('Password reset functionality will be integrated with your IGA tool');
}

// Data Loading Functions
async function loadAccounts() {
    try {
        const response = await fetch(`${API_BASE}/accounts`);
        accounts = await response.json();
        console.log('Loaded accounts:', Object.keys(accounts).length);
    } catch (error) {
        console.error('Error loading accounts:', error);
        // Fallback data
        accounts = {
            '332463837037': { id: '332463837037', name: 'Nykaa-fashion' }
        };
    }
}

async function loadPermissionSets() {
    try {
        const response = await fetch(`${API_BASE}/permission-sets`);
        permissionSets = await response.json();
        console.log('Loaded permission sets:', permissionSets.length);
    } catch (error) {
        console.error('Error loading permission sets:', error);
        // Fallback data
        permissionSets = [
            { name: 'ReadOnlyAccess', arn: 'arn:aws:iam::aws:policy/ReadOnlyAccess' },
            { name: 'PowerUserAccess', arn: 'arn:aws:iam::aws:policy/PowerUserAccess' }
        ];
    }
}

async function loadRequests() {
    try {
        const response = await fetch(`${API_BASE}/requests`);
        requests = await response.json();
        console.log('Loaded requests:', requests.length);
    } catch (error) {
        console.error('Error loading requests:', error);
        requests = [];
    }
}

// Dashboard Functions
function updateDashboard() {
    const activeAccess = requests.filter(r => r.status === 'approved' && new Date(r.expires_at) > new Date()).length;
    const pendingRequests = requests.filter(r => r.status === 'pending').length;
    const approvedThisMonth = requests.filter(r => {
        const requestDate = new Date(r.created_at);
        const now = new Date();
        return r.status === 'approved' && 
               requestDate.getMonth() === now.getMonth() && 
               requestDate.getFullYear() === now.getFullYear();
    }).length;
    
    document.getElementById('activeAccessCount').textContent = activeAccess;
    document.getElementById('pendingRequestsCount').textContent = pendingRequests;
    document.getElementById('approvedRequestsCount').textContent = approvedThisMonth;
    
    updateRecentActivity();
}

function updateRecentActivity() {
    const recentActivity = document.getElementById('recentActivity');
    const sortedRequests = requests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
    
    if (sortedRequests.length === 0) {
        recentActivity.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">No recent activity</p>';
        return;
    }
    
    recentActivity.innerHTML = sortedRequests.map(request => {
        const account = accounts[request.account_id];
        const iconClass = request.status === 'approved' ? 'success' : 
                         request.status === 'denied' ? 'danger' : 'warning';
        const icon = request.status === 'approved' ? 'check' : 
                    request.status === 'denied' ? 'times' : 'clock';
        
        return `
            <div class="activity-item">
                <div class="activity-icon ${iconClass}">
                    <i class="fas fa-${icon}"></i>
                </div>
                <div class="activity-content">
                    <p><strong>Access request ${request.status}</strong></p>
                    <p>${account ? account.name : 'Unknown Account'} - ${request.permission_set}</p>
                    <small>${formatDate(request.created_at)}</small>
                </div>
            </div>
        `;
    }).join('');
}

// Requests Page Functions
function loadRequestsPage() {
    const tbody = document.getElementById('requestsTableBody');
    
    if (requests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-secondary);">No requests found</td></tr>';
        return;
    }
    
    tbody.innerHTML = requests.map(request => {
        const account = accounts[request.account_id];
        const statusClass = `status-${request.status}`;
        
        return `
            <tr>
                <td>${request.id.substring(0, 8)}...</td>
                <td>${account ? account.name : 'Unknown'}</td>
                <td>${request.ai_generated ? 'AI Generated' : request.permission_set}</td>
                <td><span class="status-badge ${statusClass}">${request.status.toUpperCase()}</span></td>
                <td>${formatDate(request.created_at)}</td>
                <td>${formatDate(request.expires_at)}</td>
                <td>
                    <button class="btn-secondary" onclick="viewRequest('${request.id}')" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${request.status === 'pending' ? `
                    <button class="btn-secondary" onclick="modifyRequest('${request.id}')" title="Modify Request">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-primary" onclick="approveRequest('${request.id}')" title="Self Approve">
                        <i class="fas fa-check"></i>
                    </button>
                    ` : ''}
                    ${request.status === 'approved' ? `
                    <button class="btn-danger" onclick="revokeAccess('${request.id}')" title="Admin Revoke">
                        <i class="fas fa-ban"></i>
                    </button>
                    ` : ''}
                    ${isAdmin ? `
                    <button class="btn-danger" onclick="deleteRequest('${request.id}')" title="Admin Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

async function viewRequest(requestId) {
    try {
        const response = await fetch(`${API_BASE}/request/${requestId}`);
        const request = await response.json();
        
        let details = `Request Details:\n\nID: ${request.id}\nStatus: ${request.status.toUpperCase()}\nAccount: ${accounts[request.account_id]?.name || 'Unknown'}\nDuration: ${request.duration_hours} hours\nJustification: ${request.justification}\n\n`;
        
        if (request.ai_generated && request.ai_permissions) {
            // Show the actual policy that will be created
            const policy = {
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Action": request.ai_permissions.actions,
                    "Resource": request.ai_permissions.resources
                }]
            };
            
            // Add conditions if present (for tag-based access)
            if (request.ai_permissions.conditions) {
                policy.Statement[0].Condition = request.ai_permissions.conditions;
            }
            
            details += `AWS IAM Policy (This gets created in AWS):\n${JSON.stringify(policy, null, 2)}\n\n`;
            
            if (request.service_configs) {
                details += `Service Configurations:\n${JSON.stringify(request.service_configs, null, 2)}\n`;
            }
        } else {
            details += `Permission Set: ${request.permission_set}\n`;
        }
        
        if (request.permission_set_name) {
            details += `\nCreated Permission Set: ${request.permission_set_name}`;
        }
        
        // Show in console for full view
        console.log('=== FULL REQUEST DETAILS ===');
        console.log('Request:', request);
        if (request.ai_generated && request.ai_permissions) {
            const policy = {
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Action": request.ai_permissions.actions,
                    "Resource": request.ai_permissions.resources
                }]
            };
            if (request.ai_permissions.conditions) {
                policy.Statement[0].Condition = request.ai_permissions.conditions;
            }
            console.log('=== EXACT AWS POLICY ===');
            console.log(JSON.stringify(policy, null, 2));
        }
        console.log('=== END DETAILS ===');
        
        const policy = request.ai_permissions ? JSON.stringify({
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Action": request.ai_permissions.actions,
                "Resource": request.ai_permissions.resources,
                ...(request.ai_permissions.conditions && {"Condition": request.ai_permissions.conditions})
            }]
        }, null, 2) : 'No policy data';
        
        const modalHtml = `<div class="policy-modal-overlay" onclick="this.remove()" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;"><div class="policy-modal-content" onclick="event.stopPropagation()" style="background: var(--bg-primary); color: var(--text-primary); padding: 2rem; border-radius: 8px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: var(--shadow);"><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;"><h3 style="color: var(--text-primary); margin: 0;">AWS IAM Policy</h3><button onclick="this.closest('.policy-modal-overlay').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary); padding: 4px;">&times;</button></div><pre style="background: var(--bg-secondary); color: var(--text-primary); padding: 1rem; overflow-x: auto; font-size: 12px; border-radius: 4px; border: 1px solid var(--border-color);">${policy}</pre><div style="margin-top: 1rem; text-align: right;"><button onclick="this.closest('.policy-modal-overlay').remove()" style="padding: 8px 16px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button></div></div></div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (error) {
        console.error('Error viewing request:', error);
        alert('Error loading request details');
    }
}

function modifyRequest(requestId) {
    const additionalPermissions = prompt('Enter additional permissions (comma-separated):\n\nExample: s3:PutObject, lambda:InvokeFunction');
    
    if (!additionalPermissions) return;
    
    const permissions = additionalPermissions.split(',').map(p => p.trim());
    
    fetch(`${API_BASE}/request/${requestId}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additional_permissions: permissions })
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            alert('Error: ' + result.error);
        } else {
            alert('✅ Request modified successfully! Approvals have been reset.');
            loadRequests();
            updateDashboard();
        }
    })
    .catch(error => {
        console.error('Error modifying request:', error);
        alert('Error modifying request');
    });
}

function approveRequest(requestId) {
    if (!confirm('Are you sure you want to approve this request?')) return;
    
    fetch(`${API_BASE}/approve/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approver_role: 'self' })
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            alert('Error: ' + result.error);
        } else {
            alert(`✅ ${result.message}`);
            loadRequests();
            updateDashboard();
        }
    })
    .catch(error => {
        console.error('Error approving request:', error);
        alert('Error approving request');
    });
}

function revokeAccess(requestId) {
    const reason = prompt('⚠️ ADMIN REVOKE\n\nEnter reason for revoking access (required):');
    
    if (!reason) {
        alert('Revocation reason is required');
        return;
    }
    
    if (!confirm(`❌ Are you sure you want to REVOKE access?\n\nThis will immediately remove AWS permissions and delete the permission set.\n\nReason: ${reason}`)) {
        return;
    }
    
    fetch(`${API_BASE}/request/${requestId}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason })
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            alert('❌ Revocation Error: ' + result.error);
        } else {
            alert(`❌ ${result.message}`);
            loadRequests();
            updateDashboard();
        }
    })
    .catch(error => {
        console.error('Error revoking access:', error);
        alert('❌ Error revoking access');
    });
}

function deleteRequest(requestId) {
    if (!confirm('⚠️ ADMIN DELETE\n\nAre you sure you want to DELETE this request?\n\nThis action cannot be undone and will permanently remove the request from the system.')) {
        return;
    }
    
    fetch(`${API_BASE}/request/${requestId}/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            alert('❌ Delete Error: ' + result.error);
        } else {
            alert(`✅ ${result.message}`);
            loadRequests();
            updateDashboard();
        }
    })
    .catch(error => {
        console.error('Error deleting request:', error);
        alert('❌ Error deleting request');
    });
}

// Accounts Page Functions
function loadAccountsPage() {
    const grid = document.getElementById('accountsGrid');
    
    if (Object.keys(accounts).length === 0) {
        grid.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">No accounts found</p>';
        return;
    }
    
    grid.innerHTML = Object.values(accounts).map(account => `
        <div class="account-card">
            <div class="account-header">
                <h3>${account.name}</h3>
            </div>
            <p><strong>Account ID:</strong> ${account.id}</p>
            <div style="margin-top: 1rem;">
                <button class="btn-primary" onclick="requestAccessForAccount('${account.id}')">
                    <i class="fas fa-plus"></i> Request Access
                </button>
            </div>
        </div>
    `).join('');
}

function requestAccessForAccount(accountId) {
    // Pre-select the account in the modal
    loadRequestModalData();
    document.getElementById('requestAccount').value = accountId;
    showModal('newRequestModal');
}

// Request Modal Functions
function loadRequestModalData() {
    // Load accounts
    const accountSelect = document.getElementById('requestAccount');
    accountSelect.innerHTML = '<option value="">Select Account</option>' +
        Object.values(accounts).map(account => 
            `<option value="${account.id}">${account.name} (${account.id})</option>`
        ).join('');
    
    // Load permission sets
    const permissionSetSelect = document.getElementById('requestPermissionSet');
    permissionSetSelect.innerHTML = '<option value="">Select Permission Set</option>' +
        permissionSets.map(ps => 
            `<option value="${ps.arn}">${ps.name}</option>`
        ).join('');
    
    // Setup duration change handler
    const durationSelect = document.getElementById('requestDuration');
    if (durationSelect) {
        durationSelect.onchange = function() {
            if (this.value === 'custom') {
                showDateModal();
            }
        };
    }
    
    // Setup AWS services change handler
    const servicesSelect = document.getElementById('awsServices');
    if (servicesSelect) {
        servicesSelect.addEventListener('change', function() {
            updateServiceConfigs();
        });
    }
    
    // Set default date/time values
    const now = new Date();
    const startTime = new Date(now.getTime() + 5 * 60000); // 5 minutes from now
    const endTime = new Date(startTime.getTime() + 8 * 60 * 60 * 1000); // 8 hours later
    
    document.getElementById('startDateTime').value = formatDateTimeLocal(startTime);
    document.getElementById('endDateTime').value = formatDateTimeLocal(endTime);
}

function showDateModal() {
    const modal = document.getElementById('dateRangeModal');
    if (modal) {
        modal.style.display = 'block';
        
        const now = new Date();
        const minDate = new Date(now.getTime() + 5 * 60000);
        const defaultEnd = new Date(minDate.getTime() + 8 * 60 * 60 * 1000);
        
        const startInput = document.getElementById('startDateTime');
        const endInput = document.getElementById('endDateTime');
        
        if (startInput && endInput) {
            startInput.value = formatDateTimeLocal(minDate);
            endInput.value = formatDateTimeLocal(defaultEnd);
        }
    }
}

function closeDateModal() {
    const modal = document.getElementById('dateRangeModal');
    if (modal) {
        modal.style.display = 'none';
    }
    document.getElementById('requestDuration').value = '8';
}

function applyCustomDates() {
    const startDate = new Date(document.getElementById('startDateTime').value);
    const endDate = new Date(document.getElementById('endDateTime').value);
    const now = new Date();
    
    // Validation
    if (startDate <= now) {
        alert('Start date must be in the future');
        return;
    }
    
    if (endDate <= startDate) {
        alert('End date must be after start date');
        return;
    }
    
    const durationMs = endDate.getTime() - startDate.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);
    const maxHours = 5 * 24; // 5 days
    
    if (durationHours > maxHours) {
        alert(`Maximum duration is 5 days (120 hours). Selected duration: ${Math.round(durationHours)} hours`);
        return;
    }
    
    // Update the select with custom option
    const durationSelect = document.getElementById('requestDuration');
    const customOption = durationSelect.querySelector('option[value="custom"]');
    customOption.textContent = `Custom (${Math.round(durationHours)}h)`;
    customOption.setAttribute('data-hours', Math.round(durationHours));
    customOption.setAttribute('data-start', startDate.toISOString());
    customOption.setAttribute('data-end', endDate.toISOString());
    
    // Store custom duration data
    window.customDuration = {
        hours: Math.round(durationHours),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
    };
    
    closeDateModal();
}

function formatDateTimeLocal(date) {
    // Ensure we have a valid Date object
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        console.error('Invalid date provided to formatDateTimeLocal:', date);
        return '';
    }
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    const formatted = `${year}-${month}-${day}T${hours}:${minutes}`;
    console.log('Formatted date:', date, '->', formatted);
    return formatted;
}

function updateServiceConfigs() {
    const servicesSelect = document.getElementById('awsServices');
    const configsContainer = document.getElementById('serviceConfigs');
    
    if (!servicesSelect || !configsContainer) return;
    
    const selectedServices = Array.from(servicesSelect.selectedOptions).map(option => option.value);
    
    // Clear existing configs
    configsContainer.innerHTML = '';
    
    // Service configuration templates
    const serviceConfigs = {
        ec2: {
            title: 'EC2 Configuration',
            icon: 'EC2',
            fields: [
                { id: 'ec2Tags', label: 'Instance Tags', placeholder: 'Environment=prod,Team=backend', required: true, help: 'Comma-separated key=value pairs' },
                { id: 'ec2Actions', label: 'Actions', placeholder: 'describe,start,stop', required: false, help: 'Specific EC2 actions (optional)' }
            ]
        },
        s3: {
            title: 'S3 Configuration',
            icon: 'S3',
            fields: [
                { id: 's3Bucket', label: 'Bucket Name', placeholder: 'my-app-bucket', required: true, help: 'Exact S3 bucket name' },
                { id: 's3Prefix', label: 'Object Prefix', placeholder: 'logs/', required: false, help: 'Limit access to specific path (optional)' }
            ]
        },
        secretsmanager: {
            title: 'Secrets Manager Configuration',
            icon: 'SM',
            fields: [
                { id: 'secretName', label: 'Secret Name', placeholder: 'MyApp-Database-Password', required: true, help: 'Exact secret name (required for security)' }
            ]
        },
        lambda: {
            title: 'Lambda Configuration',
            icon: 'λ',
            fields: [
                { id: 'lambdaFunction', label: 'Function Name', placeholder: 'my-function-name', required: true, help: 'Exact Lambda function name' },
                { id: 'lambdaActions', label: 'Actions', placeholder: 'invoke,get', required: false, help: 'Specific Lambda actions (optional)' }
            ]
        },
        rds: {
            title: 'RDS Configuration',
            icon: 'RDS',
            fields: [
                { id: 'rdsInstance', label: 'DB Instance ID', placeholder: 'my-database', required: false, help: 'Specific RDS instance (optional)' }
            ]
        },
        cloudwatch: {
            title: 'CloudWatch Configuration',
            icon: 'CW',
            fields: [
                { id: 'logGroup', label: 'Log Group', placeholder: '/aws/lambda/my-function', required: false, help: 'Specific log group (optional)' }
            ]
        }
    };
    
    // Generate config sections for selected services
    selectedServices.forEach(service => {
        const config = serviceConfigs[service];
        if (!config) return;
        
        const configDiv = document.createElement('div');
        configDiv.className = 'service-config';
        configDiv.innerHTML = `
            <h4>
                <span class="service-icon">${config.icon}</span>
                ${config.title}
            </h4>
            ${config.fields.map(field => `
                <div class="form-group">
                    <label>${field.label} ${field.required ? '<span class="required">*</span>' : ''}</label>
                    <input type="text" id="${field.id}" placeholder="${field.placeholder}" ${field.required ? 'required' : ''}>
                    <small>${field.help}</small>
                </div>
            `).join('')}
        `;
        
        configsContainer.appendChild(configDiv);
    });
    
    // Show/hide the configs container
    configsContainer.style.display = selectedServices.length > 0 ? 'block' : 'none';
}

function switchAccessType(type) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(type === 'existing' ? 'existingPermissionsTab' : 'aiCopilotTab').classList.add('active');
}

function detectAnomalousActivity(userEmail, requestData) {
    const anomalies = [];
    
    // Check for unusual time
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
        anomalies.push('Request made outside business hours');
    }
    
    // Check for high-risk permissions
    if (requestData.ai_permissions && requestData.ai_permissions.actions) {
        const sensitiveActions = requestData.ai_permissions.actions.filter(action => 
            action.includes('Admin') || action.includes('Full') || action.includes('*')
        );
        if (sensitiveActions.length > 0) {
            anomalies.push('High-risk permissions requested');
        }
    }
    
    // Check for unusual account access
    const accountName = accounts[requestData.account_id]?.name || '';
    if (accountName.toLowerCase().includes('prod')) {
        anomalies.push('Production account access requested');
    }
    
    // Check for multiple requests in short time
    const recentRequests = requests.filter(r => 
        r.user_email === userEmail && 
        new Date(r.created_at) > new Date(Date.now() - 30 * 60 * 1000)
    );
    if (recentRequests.length > 2) {
        anomalies.push('Multiple requests in 30 minutes');
    }
    
    if (anomalies.length > 0) {
        notifyAdminOfAnomaly(userEmail, anomalies, requestData);
    }
}

function notifyAdminOfAnomaly(userEmail, anomalies, requestData) {
    const alertData = {
        timestamp: new Date().toISOString(),
        user: userEmail,
        anomalies: anomalies,
        request_details: {
            account: accounts[requestData.account_id]?.name,
            justification: requestData.justification,
            ip_address: 'Unknown' // Would be captured from request
        },
        risk_level: anomalies.length > 2 ? 'HIGH' : 'MEDIUM'
    };
    
    // Send to admin (in production, this would be real notification)
    console.warn('🚨 SECURITY ALERT:', alertData);
    
    // Store in audit log
    fetch(`${API_BASE}/security/anomaly`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData)
    }).catch(err => console.error('Failed to log anomaly:', err));
}

function calculateRiskScore(permissions, useCase) {
    let risk = 0;
    const highRiskActions = ['Delete', 'Create', 'Admin', 'Terminate', '*'];
    risk += permissions.actions.filter(action => 
        highRiskActions.some(risky => action.includes(risky))
    ).length * 2;
    
    const hour = new Date().getHours();
    if (hour < 9 || hour > 17) risk += 1;
    if (useCase.length < 20) risk += 1;
    if (permissions.actions.length > 10) risk += 1;
    
    return Math.min(risk, 10);
}

async function generateAIPermissions() {
    const useCase = document.getElementById('aiUseCase').value;
    if (!useCase) {
        alert('Please describe what you need to do');
        return;
    }
    
    // Simple validation - AI only responds to AWS access requests
    const useCaseLower = useCase.toLowerCase();
    
    // Check if request contains AWS services or access keywords
    const awsKeywords = ['aws', 'ec2', 's3', 'lambda', 'iam', 'cloudformation', 'rds', 'dynamodb', 'vpc', 'cloudwatch', 'access', 'permission'];
    const hasAwsContext = awsKeywords.some(keyword => useCaseLower.includes(keyword));
    
    if (!hasAwsContext) {
        alert('AI only generates AWS access permissions. Please specify your AWS access requirements.');
        return;
    }
    
    // Check for non-AWS requests
    const nonAwsKeywords = ['azure', 'gcp', 'google cloud', 'kubernetes', 'k8s', 'database', 'mysql', 'postgres', 'mongodb', 'jenkins', 'grafana', 'sonar', 'jira', 'splunk', 'servicenow'];
    
    const foundNonAws = nonAwsKeywords.find(keyword => useCaseLower.includes(keyword));
    if (foundNonAws) {
        alert(`❌ AI Access Denied\n\nAI only generates AWS permissions.\n\nDetected: ${foundNonAws}\n\nFor non-AWS access, use the Applications page.`);
        return;
    }
    
    const button = event.target;
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    button.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/generate-permissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ use_case: useCase })
        });
        
        const permissions = await response.json();
        
        if (permissions.error) {
            if (permissions.suggestion === 'use_existing_permission_sets') {
                // Show read-only access guidance
                const useExisting = confirm(permissions.error + '\n\nWould you like to switch to existing permission sets tab?');
                if (useExisting) {
                    switchAccessType('existing');
                }
            } else {
                alert('Error: ' + permissions.error);
            }
            return;
        }
        
        // AI Risk Assessment and Anomaly Detection
        const riskScore = calculateRiskScore(permissions, useCase);
        if (riskScore > 7) {
            alert(`⚠️ AI Risk Assessment: HIGH RISK (${riskScore}/10)\n\nThis request requires manual review and approval.`);
            // Trigger anomaly detection
            detectAnomalousActivity(localStorage.getItem('userEmail'), {
                ai_permissions: permissions,
                account_id: document.getElementById('requestAccount').value,
                justification: useCase
            });
        } else if (riskScore > 4) {
            alert(`⚠️ AI Risk Assessment: MEDIUM RISK (${riskScore}/10)\n\nPlease ensure your justification is detailed.`);
        }
        
        // Check for restricted permissions
        const restrictedActions = permissions.actions.filter(action => 
            action.includes('Delete') || 
            action.includes('Create') || 
            action.includes('Admin') ||
            action.includes('RunInstances') ||
            action.includes('TerminateInstances')
        );
        
        if (restrictedActions.length > 0) {
            alert(`⚠️ Restricted permissions detected:\n\n${restrictedActions.join('\n')}\n\nYou are not authorized for these permissions. Please ask for read/list and limited write permissions only.\n\nFor resource creation/deletion, please connect with DevOps team with proper JIRA ticket and approvals.`);
            return;
        }
        
        // Auto-select services based on detected permissions
        const servicesSelect = document.getElementById('awsServices');
        if (servicesSelect && permissions.actions) {
            const autoServices = [];
            
            if (permissions.actions.some(action => action.includes('ec2:') || action.includes('ssm:'))) {
                autoServices.push('ec2');
            }
            if (permissions.actions.some(action => action.includes('s3:'))) {
                autoServices.push('s3');
            }
            if (permissions.actions.some(action => action.includes('lambda:'))) {
                autoServices.push('lambda');
            }
            if (permissions.actions.some(action => action.includes('rds:'))) {
                autoServices.push('rds');
            }
            if (permissions.actions.some(action => action.includes('logs:'))) {
                autoServices.push('cloudwatch');
            }
            if (permissions.actions.some(action => action.includes('secretsmanager:'))) {
                autoServices.push('secretsmanager');
            }
            
            if (autoServices.length > 0) {
                Array.from(servicesSelect.options).forEach(option => {
                    option.selected = autoServices.includes(option.value);
                });
                updateServiceConfigs();
                
                setTimeout(() => {
                    alert(`💡 Detected services: ${autoServices.join(', ')}\n\nPlease configure the services below with specific resource details.`);
                }, 500);
            }
        }
        
        // Display permissions
        const preview = document.getElementById('aiPermissionsPreview');
        const content = document.getElementById('aiPermissionsContent');
        
        content.innerHTML = `
            <p><strong>Description:</strong> ${permissions.description}</p>
            <p><strong>Actions:</strong></p>
            <ul>
                ${permissions.actions.map(action => `<li class="permission-item">${action}</li>`).join('')}
            </ul>
            <p><strong>Resources:</strong> ${JSON.stringify(permissions.resources)}</p>
        `;
        
        preview.style.display = 'block';
        
        // Store permissions for form submission
        window.currentAIPermissions = permissions;
        
        // Log AI usage for security monitoring
        fetch(`${API_BASE}/security/ai-usage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_email: localStorage.getItem('userEmail'),
                use_case: useCase,
                generated_actions: permissions.actions,
                timestamp: new Date().toISOString(),
                risk_score: riskScore
            })
        }).catch(err => console.error('Failed to log AI usage:', err));
        
    } catch (error) {
        console.error('Error generating permissions:', error);
        alert('Error generating permissions. Please try again.');
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

async function handleNewRequest(e) {
    e.preventDefault();
    console.log('Form submitted');
    
    // Check if user is logged in
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
        alert('Please login first');
        return;
    }
    
    const durationValue = document.getElementById('requestDuration').value;
    let durationHours;
    let customDates = null;
    
    if (durationValue === 'custom' && window.customDuration) {
        durationHours = window.customDuration.hours;
        customDates = {
            start: window.customDuration.startDate,
            end: window.customDuration.endDate
        };
    } else {
        durationHours = parseInt(durationValue);
    }
    
    const formData = {
        user_email: userEmail,
        account_id: document.getElementById('requestAccount').value,
        duration_hours: durationHours,
        justification: document.getElementById('requestJustification').value
    };
    
    if (customDates) {
        formData.custom_start_date = customDates.start;
        formData.custom_end_date = customDates.end;
    }
    
    console.log('Form data:', formData);
    
    // Validate required fields
    if (!formData.account_id) {
        alert('Please select an account');
        return;
    }
    
    if (!formData.justification) {
        alert('Please provide business justification');
        return;
    }
    
    // Check if AI or existing permission set
    const activeTab = document.querySelector('.tab-btn.active').textContent;
    console.log('Active tab:', activeTab);
    
    if (activeTab.includes('AI')) {
        if (!window.currentAIPermissions) {
            alert('Please generate permissions first');
            return;
        }
        formData.use_case = document.getElementById('aiUseCase').value;
        
        // Validate and collect service-specific configurations
        const servicesSelect = document.getElementById('awsServices');
        const selectedServices = Array.from(servicesSelect.selectedOptions).map(option => option.value);
        
        if (selectedServices.length === 0) {
            // Auto-select services based on AI permissions if none selected
            if (window.currentAIPermissions && window.currentAIPermissions.actions) {
                const actions = window.currentAIPermissions.actions;
                const autoServices = [];
                
                if (actions.some(a => a.includes('ec2:') || a.includes('ssm:'))) autoServices.push('ec2');
                if (actions.some(a => a.includes('s3:'))) autoServices.push('s3');
                if (actions.some(a => a.includes('lambda:'))) autoServices.push('lambda');
                if (actions.some(a => a.includes('rds:'))) autoServices.push('rds');
                if (actions.some(a => a.includes('logs:'))) autoServices.push('cloudwatch');
                if (actions.some(a => a.includes('secretsmanager:'))) autoServices.push('secretsmanager');
                
                if (autoServices.length > 0) {
                    formData.aws_services = autoServices;
                    formData.service_configs = {};
                } else {
                    alert('Please select at least one AWS service');
                    return;
                }
            } else {
                alert('Please select at least one AWS service');
                return;
            }
        } else {
            formData.aws_services = selectedServices;
        }
        
        // Collect service configurations
        if (selectedServices.length > 0) {
            const serviceConfigs = {};
            let hasRequiredFields = true;
            
            selectedServices.forEach(service => {
                const configs = {};
                
                // Service-specific validation and collection
                if (service === 'ec2') {
                    const tags = document.getElementById('ec2Tags')?.value;
                    configs.tags = tags || '';
                    configs.actions = document.getElementById('ec2Actions')?.value || 'describe';
                }
                
                if (service === 's3') {
                    const bucket = document.getElementById('s3Bucket')?.value;
                    configs.bucket = bucket || '';
                    configs.prefix = document.getElementById('s3Prefix')?.value || '';
                }
                
                if (service === 'secretsmanager') {
                    const secretName = document.getElementById('secretName')?.value;
                    if (!secretName) {
                        alert('Secret name is required for Secrets Manager access');
                        hasRequiredFields = false;
                        return;
                    }
                    configs.secret_name = secretName;
                }
                
                if (service === 'lambda') {
                    const functionName = document.getElementById('lambdaFunction')?.value;
                    if (!functionName) {
                        alert('Lambda function name is required');
                        hasRequiredFields = false;
                        return;
                    }
                    configs.function_name = functionName;
                    configs.actions = document.getElementById('lambdaActions')?.value || 'invoke';
                }
                
                if (service === 'rds') {
                    configs.instance_id = document.getElementById('rdsInstance')?.value || '';
                }
                
                if (service === 'cloudwatch') {
                    configs.log_group = document.getElementById('logGroup')?.value || '';
                }
                
                serviceConfigs[service] = configs;
            });
            
            if (!hasRequiredFields) {
                return;
            }
            
            formData.aws_services = selectedServices;
            formData.service_configs = serviceConfigs;
        }
        
    } else {
        formData.permission_set = document.getElementById('requestPermissionSet').value;
        if (!formData.permission_set) {
            alert('Please select a permission set');
            return;
        }
    }
    
    console.log('Final form data:', formData);
    
    try {
        const response = await fetch(`${API_BASE}/request-access`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.error) {
            alert('Error: ' + result.error);
            return;
        }
        
        alert(`✅ Request submitted successfully!\n\nRequest ID: ${result.request_id}\n\nYour request is now pending approval.`);
        
        closeModal();
        
        // Refresh data
        await loadRequests();
        updateDashboard();
        
        // Clear form
        document.getElementById('newRequestForm').reset();
        window.currentAIPermissions = null;
        document.getElementById('aiPermissionsPreview').style.display = 'none';
        
    } catch (error) {
        console.error('Error submitting request:', error);
        alert('Error submitting request. Please try again.');
    }
}

// Debug Functions
async function testConnection() {
    try {
        console.log('Testing connection to backend...');
        const response = await fetch(`${API_BASE}/accounts`);
        const data = await response.json();
        console.log('Backend response:', data);
        alert(`✅ Backend connection successful!\n\nFound ${Object.keys(data).length} accounts`);
    } catch (error) {
        console.error('Backend connection failed:', error);
        alert(`❌ Backend connection failed:\n\n${error.message}`);
    }
}

// Admin Functions
function loadAdminPage() {
    if (!isAdmin) {
        alert('Access denied. Admin privileges required.');
        return;
    }
    
    loadAdminDashboard();
}

function loadAdminDashboard() {
    updateAdminDashboard();
    setTimeout(loadCharts, 500);
}

function loadUsersManagement() {
    loadUsersTable();
}

function loadAuditLogs() {
    loadAuditLogsTable();
}

function updateAdminDashboard() {
    const allUsers = new Set(requests.map(r => r.user_email));
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // New users (first request in last 30 days)
    const newUsers = new Set();
    const userFirstRequest = {};
    
    requests.forEach(r => {
        const requestDate = new Date(r.created_at);
        if (!userFirstRequest[r.user_email] || requestDate < new Date(userFirstRequest[r.user_email])) {
            userFirstRequest[r.user_email] = r.created_at;
        }
    });
    
    Object.entries(userFirstRequest).forEach(([email, firstDate]) => {
        if (new Date(firstDate) >= thirtyDaysAgo) {
            newUsers.add(email);
        }
    });
    
    // Repeated users (more than 3 requests)
    const userRequestCounts = {};
    requests.forEach(r => {
        userRequestCounts[r.user_email] = (userRequestCounts[r.user_email] || 0) + 1;
    });
    const repeatedUsers = Object.values(userRequestCounts).filter(count => count > 3).length;
    
    // Exceptional users (admin permissions or high-risk access)
    const exceptionalUsers = new Set();
    requests.forEach(r => {
        if (r.permission_set && r.permission_set.includes('Admin')) {
            exceptionalUsers.add(r.user_email);
        }
    });
    
    const pendingApprovals = requests.filter(r => r.status === 'pending').length;
    
    const newUsersEl = document.getElementById('newUsersCount');
    const repeatedUsersEl = document.getElementById('repeatedUsersCount');
    const exceptionalUsersEl = document.getElementById('exceptionalUsersCount');
    const pendingApprovalsEl = document.getElementById('pendingApprovalsCount');
    
    if (newUsersEl) newUsersEl.textContent = newUsers.size;
    if (repeatedUsersEl) repeatedUsersEl.textContent = repeatedUsers;
    if (exceptionalUsersEl) exceptionalUsersEl.textContent = exceptionalUsers.size;
    if (pendingApprovalsEl) pendingApprovalsEl.textContent = pendingApprovals;
}

function loadCharts() {
    loadUserActivityChart();
    loadRequestTypesChart();
}

function loadUserActivityChart() {
    const ctx = document.getElementById('userActivityChart');
    if (!ctx) return;
    
    const data = {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
            label: 'Requests',
            data: [12, 19, 8, 15, 22, 3, 7],
            borderColor: '#FF6B9D',
            backgroundColor: 'rgba(255, 107, 157, 0.1)',
            tension: 0.4
        }]
    };
    
    new Chart(ctx, {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function loadRequestTypesChart() {
    const ctx = document.getElementById('requestTypesChart');
    if (!ctx) return;
    
    const data = {
        labels: ['AWS', 'Applications', 'Databases', 'Kubernetes'],
        datasets: [{
            data: [45, 25, 20, 10],
            backgroundColor: ['#FF6B9D', '#4A90E2', '#28a745', '#ffc107']
        }]
    };
    
    new Chart(ctx, {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

function loadUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    const users = [
        {
            email: 'satish.korra@nykaa.com',
            source: 'Google Workspace',
            status: 'Active',
            mfa: true,
            lastLogin: '2024-01-15 10:30',
            requestCount: 5
        }
    ];
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.email}</td>
            <td>${user.source}</td>
            <td><span class="status-badge status-approved">${user.status}</span></td>
            <td>${user.mfa ? '✅ Enabled' : '❌ Disabled'}</td>
            <td>${user.lastLogin}</td>
            <td>${user.requestCount}</td>
            <td>
                <button class="btn-secondary" onclick="editUser('${user.email}')">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function loadAuditLogsTable() {
    const tbody = document.getElementById('auditLogsTableBody');
    if (!tbody) return;
    
    const auditLogs = [
        {
            timestamp: '2024-01-15 10:30:15',
            user: 'satish.korra@nykaa.com',
            event: 'Access Request',
            resource: 'AWS Account',
            ip: '192.168.1.100',
            status: 'Success'
        }
    ];
    
    tbody.innerHTML = auditLogs.map(log => `
        <tr>
            <td>${log.timestamp}</td>
            <td>${log.user}</td>
            <td>${log.event}</td>
            <td>${log.resource}</td>
            <td>${log.ip}</td>
            <td><span class="status-badge status-approved">${log.status}</span></td>
        </tr>
    `).join('');
}

// User Management Functions
function syncUsers() {
    alert('🔄 Syncing users from identity providers...');
}

function editUser(email) {
    alert(`Edit user: ${email}`);
}

function generateTempPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('onboardPassword').value = password;
}

// Integration Functions
function configureIntegration(provider) {
    alert(`Configure ${provider} integration`);
}

function filterAuditLogs() {
    alert('Filter audit logs');
}

function loadRequestForOthersModalData() {
    const accountSelect = document.getElementById('otherRequestAccount');
    if (accountSelect) {
        accountSelect.innerHTML = '<option value="">Select Account</option>' +
            Object.values(accounts).map(account => 
                `<option value="${account.id}">${account.name} (${account.id})</option>`
            ).join('');
    }
}

// Form Handlers
function handleRequestForOthers(e) {
    e.preventDefault();
    alert('Request for others submitted');
    closeModal();
}

function handleManualOnboard(e) {
    e.preventDefault();
    alert('Manual onboarding initiated');
    closeModal();
}

function handleAppRequest(e) {
    e.preventDefault();
    alert('Application access request submitted');
    closeModal();
}

function updateSpecificAppOptions() {
    const appType = document.getElementById('appType').value;
    const specificAppSelect = document.getElementById('specificApp');
    
    const appOptions = {
        cloud: [
            { value: 'aws', text: 'Amazon Web Services' },
            { value: 'azure', text: 'Microsoft Azure' },
            { value: 'gcp', text: 'Google Cloud Platform' }
        ],
        kubernetes: [
            { value: 'eks', text: 'Amazon EKS' },
            { value: 'aks', text: 'Azure AKS' },
            { value: 'gke', text: 'Google GKE' }
        ],
        database: [
            { value: 'mysql', text: 'MySQL' },
            { value: 'postgres', text: 'PostgreSQL' },
            { value: 'mongodb', text: 'MongoDB' },
            { value: 'rds', text: 'Amazon RDS' }
        ],
        application: [
            { value: 'jenkins', text: 'Jenkins' },
            { value: 'grafana', text: 'Grafana' },
            { value: 'sonar', text: 'SonarQube' }
        ],
        ticketing: [
            { value: 'jira', text: 'JIRA' },
            { value: 'splunk', text: 'Splunk' },
            { value: 'servicenow', text: 'ServiceNow' }
        ]
    };
    
    specificAppSelect.innerHTML = '<option value="">Select Application</option>';
    
    if (appOptions[appType]) {
        specificAppSelect.innerHTML += appOptions[appType]
            .map(app => `<option value="${app.value}">${app.text}</option>`)
            .join('');
    }
}

function exportAuditLog() {
    const auditData = requests.map(r => ({
        request_id: r.id,
        user_email: r.user_email,
        account_id: r.account_id,
        status: r.status,
        created_at: r.created_at,
        expires_at: r.expires_at,
        justification: r.justification
    }));
    
    const blob = new Blob([JSON.stringify(auditData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jit-audit-log-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function cleanupOldRequests() {
    if (!confirm('🧹 This will delete all requests older than 3 days with inactive status.\n\nContinue?')) {
        return;
    }
    
    fetch(`${API_BASE}/cleanup/old-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(result => {
        alert(`✅ ${result.message}`);
        loadRequests();
        updateDashboard();
        if (isAdmin) updateAdminDashboard();
    })
    .catch(error => {
        console.error('Error cleaning up requests:', error);
        alert('❌ Error cleaning up requests');
    });
}

function revokeAllExpired() {
    if (!confirm('⚠️ This will revoke ALL expired access grants immediately.\n\nContinue?')) {
        return;
    }
    
    fetch(`${API_BASE}/cleanup/expired`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(result => {
        alert(`✅ ${result.message}`);
        loadRequests();
        updateDashboard();
        if (isAdmin) updateAdminDashboard();
    })
    .catch(error => {
        console.error('Error revoking expired access:', error);
        alert('❌ Error revoking expired access');
    });
}

function refreshRequests() {
    loadRequests().then(() => {
        updateDashboard();
        if (document.getElementById('requestsPage').classList.contains('active')) {
            loadRequestsPage();
        }
        alert('✅ Requests refreshed successfully!');
    }).catch(error => {
        console.error('Error refreshing requests:', error);
        alert('❌ Error refreshing requests');
    });
}

// Utility Functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}