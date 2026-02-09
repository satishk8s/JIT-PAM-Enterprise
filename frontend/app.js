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
    'satish@nykaa.com',
    'admin@nykaa.com',
    'security@nykaa.com'
];

// API Base URL - use /api when on port 80 (nginx proxy), else hostname:5000
// Override: set window.API_BASE before app.js loads
const API_BASE = (typeof window !== 'undefined' && window.API_BASE)
  ? window.API_BASE
  : ((!window.location.port || window.location.port === '80' || window.location.port === '443')
      ? '/api'
      : `${(window.location.protocol || 'http:')}//${window.location.hostname}:5000/api`);

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    // Hide AI assistant on login page (must run first)
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    if (isLoggedIn !== 'true') {
        document.body.classList.add('login-page');
        const copilotBtn = document.getElementById('securityCopilotButton');
        const copilotPopup = document.getElementById('securityCopilotPopup');
        const unifiedBtn = document.getElementById('unifiedAssistantButton');
        const unifiedPopup = document.getElementById('unifiedAssistantPopup');
        if (copilotBtn) copilotBtn.style.display = 'none';
        if (copilotPopup) copilotPopup.style.display = 'none';
        if (unifiedBtn) unifiedBtn.remove();
        if (unifiedPopup) unifiedPopup.remove();
    } else {
        document.body.classList.remove('login-page');
    }
    
    // Check if user is logged in (in production, check JWT token)
    if (isLoggedIn === 'true') {
        showMainApp();
        // If URL has #admin, navigate to admin panel (admin users only)
        if (window.location.hash === '#admin' && localStorage.getItem('isAdmin') === 'true') {
            setTimeout(function() { showPage('admin'); }, 100);
        }
    }
    
    // Load theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    
    // Setup event listeners
    setupEventListeners();
});

function setupEventListeners() {
    // Username/Password form
    const usernamePasswordForm = document.getElementById('usernamePasswordForm');
    if (usernamePasswordForm) {
        usernamePasswordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            if (username && password) {
                // Show MFA verification
                showMFAVerification();
            }
        });
    }
    
    // Email/OTP form - both submit and button call handleEmailOTPContinue
    const emailOTPForm = document.getElementById('emailOTPForm');
    if (emailOTPForm) {
        emailOTPForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleEmailOTPContinue();
            return false;
        });
    }
    
    // OTP Verify form
    const otpVerifyForm = document.getElementById('otpVerifyForm');
    if (otpVerifyForm) {
        otpVerifyForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const otp = document.getElementById('otp1').value +
                       document.getElementById('otp2').value +
                       document.getElementById('otp3').value +
                       document.getElementById('otp4').value +
                       document.getElementById('otp5').value +
                       document.getElementById('otp6').value;
            
            if (otp.length === 6) {
                // Simulate successful login
                const email = document.getElementById('emailOTP').value;
                isAdmin = ADMIN_USERS.includes(email.toLowerCase());
                currentUser = {
                    email: email,
                    name: email.split('@')[0],
                    isAdmin: isAdmin
                };
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userEmail', email);
        localStorage.setItem('userName', email.split('@')[0].replace(/\./g, ' '));
        localStorage.setItem('isAdmin', isAdmin.toString());
        localStorage.setItem('userRole', isAdmin ? 'admin' : 'user');
                showMainApp();
            }
        });
    }
    
    // MFA form
    const mfaForm = document.getElementById('mfaForm');
    if (mfaForm) {
        mfaForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const mfaCode = document.getElementById('mfaCode').value;
            
            if (mfaCode && mfaCode.length === 6) {
                // Simulate successful login
                const username = document.getElementById('username').value;
                const email = username.includes('@') ? username : username + '@nykaa.com';
                isAdmin = ADMIN_USERS.includes(email.toLowerCase());
                currentUser = {
                    email: email,
                    name: username,
                    isAdmin: isAdmin
                };
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userEmail', email);
        localStorage.setItem('userName', email.split('@')[0].replace(/\./g, ' '));
        localStorage.setItem('isAdmin', isAdmin.toString());
        localStorage.setItem('userRole', isAdmin ? 'admin' : 'user');
                showMainApp();
            } else {
                alert('❌ Invalid MFA code. Please enter 6 digits.');
            }
        });
    }
    
    // OTP input auto-focus
    setupOTPInputs();
    
    // New request form
    document.getElementById('newRequestForm').addEventListener('submit', handleNewRequest);
    
    // Close modal on overlay click
    document.getElementById('modalOverlay').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal();
        }
    });
    
    // Prevent modal from closing when clicking inside modal content
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });
    
    // Close modals with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
    
    // Setup form handlers after DOM loads
    setTimeout(() => {
        setupOTPInputs();
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

// Quick login for testing (bypasses OTP/MFA)
function quickLoginAsUser(email) {
    const normalizedEmail = (email || 'user@nykaa.com').toLowerCase().trim();
    isAdmin = ADMIN_USERS.includes(normalizedEmail);
    currentUser = {
        email: normalizedEmail,
        name: normalizedEmail.split('@')[0],
        isAdmin: isAdmin
    };
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('userEmail', normalizedEmail);
    localStorage.setItem('userName', normalizedEmail.split('@')[0].replace(/\./g, ' '));
    localStorage.setItem('isAdmin', isAdmin.toString());
    localStorage.setItem('userRole', isAdmin ? 'admin' : 'user');
    showMainApp();
}

// Login Flow Functions
function showDefaultLogin() {
    document.getElementById('emailOTPView').style.display = 'block';
    document.getElementById('passwordLoginView').style.display = 'none';
    document.getElementById('otpVerifyView').style.display = 'none';
    document.getElementById('mfaView').style.display = 'none';
}

function showSSOLogin() {
    alert('Google SSO integration coming soon.\n\nYou will be redirected to Google login.');
}

function showUsernamePasswordLogin() {
    document.getElementById('emailOTPView').style.display = 'none';
    document.getElementById('passwordLoginView').style.display = 'block';
    document.getElementById('otpVerifyView').style.display = 'none';
    document.getElementById('mfaView').style.display = 'none';
}

function handleEmailOTPContinue() {
    const emailInput = document.getElementById('emailOTP');
    const email = emailInput ? emailInput.value.trim() : '';
    if (email) {
        showOTPVerification();
    } else {
        alert('Please enter your email address.');
    }
}

function showOTPVerification() {
    const email = document.getElementById('emailOTP').value;
    const otpEmailEl = document.getElementById('otpEmail');
    if (otpEmailEl) otpEmailEl.textContent = email;
    document.getElementById('emailOTPView').style.display = 'none';
    document.getElementById('passwordLoginView').style.display = 'none';
    document.getElementById('otpVerifyView').style.display = 'block';
    document.getElementById('mfaView').style.display = 'none';
}

function showMFAVerification() {
    document.getElementById('emailOTPView').style.display = 'none';
    document.getElementById('passwordLoginView').style.display = 'none';
    document.getElementById('otpVerifyView').style.display = 'none';
    document.getElementById('mfaView').style.display = 'block';
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
        localStorage.setItem('userName', email.split('@')[0].replace(/\./g, ' '));
        localStorage.setItem('isAdmin', isAdmin.toString());
        localStorage.setItem('userRole', isAdmin ? 'admin' : 'user');
        showMainApp();
    }
}

function logout() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    localStorage.removeItem('isAdmin');
    currentUser = null;
    isAdmin = false;
    document.body.classList.add('login-page');
    document.body.classList.remove('user-is-admin');
    document.getElementById('loginPage').style.display = 'block';
    document.getElementById('mainApp').style.display = 'none';
}

function showMainApp() {
    document.body.classList.remove('login-page');
    const loginPage = document.getElementById('loginPage');
    const mainApp = document.getElementById('mainApp');
    if (loginPage) loginPage.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';
    
    // Show AI assistant (was hidden on login page)
    const copilotBtn = document.getElementById('securityCopilotButton');
    if (copilotBtn) copilotBtn.style.display = '';
    
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
    
    // User portal: skip admin-specific setup
    if (window.USER_PORTAL) {
        if (typeof loadAccounts === 'function') loadAccounts();
        if (typeof loadPermissionSets === 'function') loadPermissionSets();
        if (typeof loadRequests === 'function') loadRequests();
        if (typeof loadRequestsPage === 'function') loadRequestsPage();
        return;
    }
    
    // Update UI based on admin status (run twice to ensure it applies after DOM ready)
    updateUIForRole();
    setTimeout(updateUIForRole, 150);
    
    // Load initial data
    loadAccounts();
    loadPermissionSets();
    loadRequests();
    if (document.getElementById('activeSessionsCount')) updateDashboard();
    
    // Load policy settings for admin toggles
    if (isAdmin && typeof loadPolicySettings === 'function') {
        loadPolicySettings();
    }
}

function updateUIForRole() {
    const userName = document.getElementById('userName');
    if (userName && currentUser) {
        userName.innerHTML = isAdmin
            ? '<i class="fas fa-crown" style="color: #F59E0B; margin-right: 4px;"></i>' + currentUser.name + ' <span class="admin-badge">(Admin)</span>'
            : currentUser.name;
    }
    
    // Directly show/hide admin-only elements via inline styles (reliable, bypasses CSS cache)
    document.querySelectorAll('.admin-only-nav').forEach(function(el) {
        if (isAdmin) {
            var disp = el.classList.contains('nav-item') ? 'flex' : el.classList.contains('nav-category') ? 'block' : 'inline-flex';
            el.style.setProperty('display', disp, 'important');
        } else {
            el.style.setProperty('display', 'none', 'important');
        }
    });
    
    if (isAdmin) {
        document.body.classList.add('user-is-admin');
        addAdminNavigation();
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const dashPage = document.getElementById('dashboardPage');
        if (dashPage) dashPage.classList.add('active');
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
        const dashNav = document.querySelector('.sidebar-nav .nav-item[onclick*="dashboard"]');
        if (dashNav) dashNav.classList.add('active');
    } else {
        document.body.classList.remove('user-is-admin');
        // Normal user: show My Requests as default (no Dashboard)
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const reqPage = document.getElementById('requestsPage');
        if (reqPage) reqPage.classList.add('active');
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
        const requestsNav = document.querySelector('.sidebar-nav .nav-item[onclick*="requests"]');
        if (requestsNav) requestsNav.classList.add('active');
        currentRequestsCategory = 'cloud';
        currentRequestsStatus = 'pending';
        currentFilter = 'pending';
        document.querySelectorAll('.requests-status-btn').forEach(b => {
            b.classList.remove('requests-status-glow');
            if (b.dataset.category === 'cloud' && b.dataset.status === 'pending') b.classList.add('requests-status-glow');
        });
        if (typeof loadRequestsPage === 'function') loadRequestsPage();
    }
}

function addAdminNavigation() {
    if (window.USER_PORTAL) return;
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

function toggleSidebar(e) {
    if (e) e.stopPropagation();
    const layout = document.querySelector('.app-layout');
    const sidebar = document.getElementById('mainSidebar');
    const toggle = document.getElementById('sidebarToggle');
    const label = document.getElementById('sidebarToggleLabel');
    const icon = document.getElementById('sidebarToggleIcon');
    const main = document.querySelector('.app-main');
    const container = document.querySelector('.app-container');
    if (!sidebar || !toggle) return;
    const collapsed = !layout.classList.contains('sidebar-collapsed');
    layout.classList.toggle('sidebar-collapsed', collapsed);
    sidebar.classList.toggle('sidebar-collapsed', collapsed);
    if (main) main.classList.toggle('main-expanded', collapsed);
    if (container) container.classList.toggle('sidebar-collapsed', collapsed);
    toggle.title = collapsed ? 'Expand sidebar (>>)' : 'Collapse sidebar (<<)';
    if (icon) icon.className = collapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
    if (label) label.textContent = collapsed ? '>>' : '<<';
    localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
}

document.addEventListener('DOMContentLoaded', function() {
    const collapsed = localStorage.getItem('sidebarCollapsed') === '1';
    const layout = document.querySelector('.app-layout');
    const sidebar = document.getElementById('mainSidebar');
    const toggle = document.getElementById('sidebarToggle');
    const label = document.getElementById('sidebarToggleLabel');
    const icon = document.getElementById('sidebarToggleIcon');
    const main = document.querySelector('.app-main');
    const container = document.querySelector('.app-container');
    if (collapsed && layout && sidebar && main) {
        layout.classList.add('sidebar-collapsed');
        sidebar.classList.add('sidebar-collapsed');
        main.classList.add('main-expanded');
        if (container) container.classList.add('sidebar-collapsed');
        if (toggle) toggle.title = 'Expand sidebar (>>)';
        if (icon) icon.className = 'fas fa-chevron-right';
        if (label) label.textContent = '>>';
    }
});

// Theme Management
function toggleTheme() {
    var actualTheme = document.documentElement.getAttribute('data-theme') || 'light';
    var newTheme = actualTheme === 'light' ? 'dark' : 'light';
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
    
    // Show selected page (skip if page was removed, e.g. azure/oracle in trimmed nykaa-jit)
    const pageEl = document.getElementById(pageId + 'Page');
    if (pageEl) pageEl.classList.add('active');
    
    // Update sidebar nav items
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        item.classList.remove('active');
    });
    if (event && event.target) {
        const navItem = event.target.closest('.nav-item');
        if (navItem) {
            navItem.classList.add('active');
        }
    }
    
    // Load page-specific data
    if (pageId === 'accounts') {
        loadAccountsPage();
    } else if (pageId === 'requests') {
        currentRequestsCategory = 'cloud';
        currentRequestsStatus = 'pending';
        currentFilter = 'pending';
        filterRequestsByCategory('cloud', 'pending');
        // Initialize unified assistant for requests page
        setTimeout(() => {
            if (typeof initUnifiedAssistant === 'function') {
                initUnifiedAssistant();
            }
        }, 100);
    } else if (pageId === 'applications') {
        loadApplicationsPage();
    } else if (pageId === 'admin') {
        loadAdminPage();
    } else if (pageId === 'instances') {
        loadInstances();
    } else if (pageId === 'terminal') {
        if (typeof initTerminalPage === 'function') {
            initTerminalPage();
        } else if (typeof refreshApprovedInstances === 'function') {
            refreshApprovedInstances();
        }
    } else if (pageId === 's3') {
        loadS3Buckets();
    } else if (pageId === 'databases') {
        if (typeof loadDatabases === 'function') {
            loadDatabases();
        }
    } else if (pageId === 'dashboard') {
        updateDashboard();
    } else if (pageId === 'workflow') {
        // Initialize workflow designer
        setTimeout(() => {
            if (typeof initWorkflowDesigner === 'function') {
                initWorkflowDesigner();
            }
        }, 100);
    }
    
    // Remove unified assistant if not on requests page
    if (pageId !== 'requests') {
        const button = document.getElementById('unifiedAssistantButton');
        const popup = document.getElementById('unifiedAssistantPopup');
        if (button) button.remove();
        if (popup) popup.remove();
    }

    // Hide Security Copilot on databases page (per user requirement)
    const copilotBtn = document.getElementById('securityCopilotButton');
    const copilotPopup = document.getElementById('securityCopilotPopup');
    if (copilotBtn) copilotBtn.style.display = pageId === 'databases' ? 'none' : '';
    if (copilotPopup) copilotPopup.classList.remove('show');
}

// Admin Tab Navigation
function showAdminTab(tabId, event) {
    // Hide all admin tabs
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.style.display = 'none';
        tab.classList.remove('active');
    });
    
    // Map tab IDs (Dashboard moved to main page)
    const tabMap = {
        'users': 'adminUsersTab',
        'policies': 'adminPoliciesTab',
        'features': 'adminFeaturesTab',
        'security': 'adminSecurityTab',
        'integrations': 'adminIntegrationsTab'
    };
    
    // Show selected tab
    const targetTab = document.getElementById(tabMap[tabId]);
    if (targetTab) {
        targetTab.style.display = 'block';
        targetTab.classList.add('active');
        console.log('✅ Showing admin tab:', tabId, targetTab);
    } else {
        console.error('❌ Admin tab not found:', tabId, tabMap[tabId]);
    }
    
    // Update tab buttons
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (event && event.target) {
        const btn = event.target.closest('.admin-tab-btn');
        if (btn) btn.classList.add('active');
    } else {
        // Fallback: find button by tabId
        const btn = document.querySelector(`.admin-tab-btn[onclick*="'${tabId}'"]`);
        if (btn) btn.classList.add('active');
    }
    
    // Load tab-specific data
    if (tabId === 'users') {
        if (typeof loadUsersManagement === 'function') loadUsersManagement();
    } else if (tabId === 'policies') {
        if (typeof initPolicyConfig === 'function') initPolicyConfig();
        // Always reload policy settings when showing policies tab
        setTimeout(() => {
            if (typeof loadPolicySettings === 'function') loadPolicySettings();
        }, 100);
        if (typeof loadAccountsForTagging === 'function') loadAccountsForTagging();
    } else if (tabId === 'features') {
        // Features tab - already rendered
    } else if (tabId === 'security') {
        // Ensure security section is visible by default
        setTimeout(() => {
            const secSection = document.getElementById('securitySection');
            if (secSection) secSection.style.display = 'block';
            const guarSection = document.getElementById('guardrailsSection');
            if (guarSection) guarSection.style.display = 'none';
            const auditSection = document.getElementById('auditSection');
            if (auditSection) auditSection.style.display = 'none';
        }, 10);
        if (typeof loadAuditLogs === 'function') loadAuditLogs();
    } else if (tabId === 'integrations') {
        // Integrations tab - already rendered
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

function startNewRequestForCloud(cloud, type) {
    window.currentCloudAccessPage = cloud; // For Back button to return to cloud page
    if (type === 'myself') {
        showNewRequestPage(cloud);
    } else {
        showRequestForOthersWithCloud(cloud);
    }
}

function showNewRequestPage(cloudProvider) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('newRequestPage').classList.add('active');
    if (cloudProvider && cloudProvider === 'aws') {
        // Skip cloud selection - go directly to AWS step
        if (typeof selectCloudProvider === 'function') {
            selectCloudProvider('aws');
        } else {
            document.getElementById('requestStep1').style.display = 'none';
            document.getElementById('requestStep2AWS').style.display = 'block';
            if (typeof loadAccountsDropdown === 'function') loadAccountsDropdown();
        }
    } else if (cloudProvider) {
        document.getElementById('requestStep1').style.display = 'block';
        document.getElementById('requestStep2AWS').style.display = 'none';
        alert(`${cloudProvider.toUpperCase()} integration coming soon!`);
    } else {
        window.currentCloudAccessPage = null;
        document.getElementById('requestStep1').style.display = 'block';
        document.getElementById('requestStep2AWS').style.display = 'none';
    }
    loadRequestModalData();
}

function showRequestForOthersWithCloud(cloudProvider) {
    const page = document.getElementById('requestForOthersPage');
    if (!page) {
        alert('ERROR: requestForOthersPage not found!');
        return;
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    page.classList.add('active');
    if (cloudProvider === 'aws') {
        if (typeof selectCloudProviderForOthers === 'function') {
            selectCloudProviderForOthers('aws');
        } else {
            document.getElementById('othersStep1').style.display = 'none';
            document.getElementById('othersStep2AWS').style.display = 'block';
            if (typeof loadAccountsForOthers === 'function') loadAccountsForOthers();
        }
    } else {
        window.currentCloudAccessPage = null;
        document.getElementById('othersStep1').style.display = 'block';
        document.getElementById('othersStep2AWS').style.display = 'none';
        if (cloudProvider) alert(`${cloudProvider.toUpperCase()} integration coming soon!`);
    }
}

function cancelNewRequest() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('requestsPage').classList.add('active');
    document.getElementById('newRequestForm').reset();
    document.getElementById('resourcesGroup').style.display = 'none';
    document.getElementById('aiPermissionsPreview').style.display = 'none';
    window.currentAIPermissions = null;
    selectedResources = [];
    selectedService = '';
}

function showRequestForOthersModal() {
    const page = document.getElementById('requestForOthersPage');
    if (!page) {
        alert('ERROR: requestForOthersPage not found!');
        return;
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    page.classList.add('active');
    document.getElementById('othersStep1').style.display = 'block';
    document.getElementById('othersStep2AWS').style.display = 'none';
    if (typeof loadAccountsForOthers === 'function') loadAccountsForOthers();
}

function cancelRequestForOthers() {
    showPage('requests');
    document.getElementById('othersStep1').style.display = 'block';
    document.getElementById('othersStep2AWS').style.display = 'none';
}

function closeRequestForOthersModal() {
    cancelRequestForOthers();
    // Clear form
    document.getElementById('requestForOthersForm').reset();
    selectedEmails = [];
    renderEmailTags();
    otherCurrentAIPermissions = null;
    const preview = document.getElementById('otherAiPermissionsPreview');
    if (preview) preview.style.display = 'none';
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
    // Update new KPI cards
    const activeSessions = requests.filter(r => r.status === 'approved' && new Date(r.expires_at) > new Date()).length;
    const pendingApprovals = requests.filter(r => r.status === 'pending').length;
    const highRiskRequests = requests.filter(r => {
        if (typeof calculateAIRiskScore === 'function') {
            return calculateAIRiskScore(r) >= 70;
        }
        return false;
    }).length;
    const policyViolations = 0; // TODO: Calculate from audit logs
    
    const activeSessionsEl = document.getElementById('activeSessionsCount');
    const pendingApprovalsEl = document.getElementById('pendingApprovalsCount');
    const highRiskRequestsEl = document.getElementById('highRiskRequestsCount');
    const policyViolationsEl = document.getElementById('policyViolationsCount');
    
    if (activeSessionsEl) activeSessionsEl.textContent = activeSessions;
    if (pendingApprovalsEl) pendingApprovalsEl.textContent = pendingApprovals;
    if (highRiskRequestsEl) highRiskRequestsEl.textContent = highRiskRequests;
    if (policyViolationsEl) policyViolationsEl.textContent = policyViolations;
    
    // Update old IDs for backward compatibility
    const activeAccessEl = document.getElementById('activeAccessCount');
    const pendingRequestsEl = document.getElementById('pendingRequestsCount');
    const approvedRequestsEl = document.getElementById('approvedRequestsCount');
    
    if (activeAccessEl) activeAccessEl.textContent = activeSessions;
    if (pendingRequestsEl) pendingRequestsEl.textContent = pendingApprovals;
    if (approvedRequestsEl) {
        const approvedThisMonth = requests.filter(r => {
            const requestDate = new Date(r.created_at);
            const now = new Date();
            return r.status === 'approved' && 
                   requestDate.getMonth() === now.getMonth() && 
                   requestDate.getFullYear() === now.getFullYear();
        }).length;
        approvedRequestsEl.textContent = approvedThisMonth;
    }
    
    // Update recent activity (old function)
    updateRecentActivity();
    
    // Update admin metrics (merged from admin dashboard)
    if (typeof updateAdminDashboard === 'function') updateAdminDashboard();
    
    // Load charts (destroy existing first to avoid duplicates)
    if (document.getElementById('userActivityChart')) {
        setTimeout(loadCharts, 300);
    }
    
    // Update dashboard panels
    if (typeof updateRecentJITRequests === 'function') updateRecentJITRequests();
    if (typeof updateLiveSessions === 'function') updateLiveSessions();
    if (typeof updateAIDecisionsFeed === 'function') updateAIDecisionsFeed();
}

function updateRecentActivity() {
    const recentActivity = document.getElementById('recentActivity');
    if (!recentActivity) return;
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
let currentFilter = 'all';
let currentRequestsCategory = 'cloud';
let currentRequestsStatus = 'pending';

function filterRequestsByCategory(category, status) {
    currentRequestsCategory = category;
    currentRequestsStatus = status;

    // Update button glow - remove from all, add to active
    document.querySelectorAll('.requests-status-btn').forEach(btn => {
        btn.classList.remove('requests-status-glow');
        if (btn.dataset.category === category && btn.dataset.status === status) {
            btn.classList.add('requests-status-glow');
        }
    });

    if (category === 'cloud') {
        // Map to legacy filter: pending, in_progress->approved, completed->approved, denied
        currentFilter = status === 'pending' ? 'pending' : status === 'denied' ? 'denied' : 'approved';
        loadRequestsPage();
    } else if (category === 'databases' && typeof filterDbRequests === 'function') {
        filterDbRequests(status);
    } else if (category === 'storage') {
        loadStorageRequests();
    } else if (category === 'workloads') {
        loadWorkloadsRequests();
    }
}

function loadStorageRequests() {
    const list = document.getElementById('storageRequestsList');
    if (!list) return;
    list.innerHTML = '<div class="requests-empty">No storage requests</div>';
}

function loadWorkloadsRequests() {
    const list = document.getElementById('workloadsRequestsList');
    if (!list) return;
    list.innerHTML = '<div class="requests-empty">No workload requests</div>';
}

function filterRequests(filter) {
    currentFilter = filter;
    if (event && event.target) {
        event.target.classList.add('active');
    }
    loadRequestsPage();
}

function loadRequestsPage() {
    const grid = document.getElementById('requestsGrid');
    
    let filteredRequests = requests;
    if (currentFilter !== 'all') {
        filteredRequests = requests.filter(r => r.status === currentFilter);
    }
    
    if (filteredRequests.length === 0) {
        grid.innerHTML = '<div class="empty-state"><p class="text-muted">No requests found</p></div>';
        return;
    }
    
    // Use security-grade JIT request card helper if available
    if (typeof createJITRequestCard === 'function') {
        grid.innerHTML = filteredRequests.map(request => {
            const account = accounts[request.account_id];
            return createJITRequestCard(request, account);
        }).join('');
    } else {
        // Fallback to basic cards if helper not available
        grid.innerHTML = filteredRequests.map(request => {
            const account = accounts[request.account_id];
            const statusClass = `status-${request.status}`;
            
            return `
                <div class="jit-request-card">
                    <div class="jit-request-header">
                        <div class="jit-user-info">
                            <div class="jit-user-email">${request.user_email || 'Unknown User'}</div>
                            <span class="status-badge ${statusClass}">${request.status}</span>
                        </div>
                    </div>
                    
                    <div class="jit-request-details">
                        <div class="jit-detail-item">
                            <div class="jit-detail-label">Requested Role</div>
                            <div class="jit-detail-value">${request.ai_generated ? 'AI Generated' : request.permission_set || 'Custom'}</div>
                        </div>
                        <div class="jit-detail-item">
                            <div class="jit-detail-label">Target</div>
                            <div class="jit-detail-value">${account ? account.name : request.account_id}</div>
                        </div>
                        <div class="jit-detail-item">
                            <div class="jit-detail-label">Duration</div>
                            <div class="jit-detail-value">${request.duration_hours || 8}h</div>
                        </div>
                    </div>
                    
                    ${request.status === 'pending' ? `
                    <div class="jit-request-actions">
                        <button class="btn-primary" onclick="approveRequest('${request.id}')">
                            <i class="fas fa-check"></i> Approve
                        </button>
                        <button class="btn-danger" onclick="denyRequest('${request.id}')">
                            <i class="fas fa-times"></i> Deny
                        </button>
                    </div>
                    ` : ''}
                    
                    <div class="jit-request-actions" style="margin-top: 10px; border-top: 1px solid var(--border-subtle); padding-top: 10px;">
                        <button class="btn-secondary" onclick="viewRequest('${request.id}')" style="width: 100%;">
                            <i class="fas fa-eye"></i> View Details
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Load database requests into My Requests page
    if (typeof loadDbRequests === 'function') {
        loadDbRequests();
    }
    // Load storage and workloads (placeholders for now)
    loadStorageRequests();
    loadWorkloadsRequests();
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

function toggleCloudProvider(provider) {
    const providerMap = {
        'aws': 'awsAccounts',
        'gcp': 'gcpProjects',
        'azure': 'azureSubscriptions',
        'oracle': 'oracleCompartments'
    };
    
    const elementId = providerMap[provider];
    const element = document.getElementById(elementId);
    const button = element.previousElementSibling;
    
    if (element.style.display === 'none') {
        element.style.display = 'block';
        button.classList.add('active');
        
        if (provider === 'aws') {
            loadAwsAccounts();
        }
    } else {
        element.style.display = 'none';
        button.classList.remove('active');
    }
}

function loadAwsAccounts() {
    const grid = document.getElementById('awsAccountsGrid');
    
    if (Object.keys(accounts).length === 0) {
        grid.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">No accounts found</p>';
        return;
    }
    
    grid.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Account Name</th>
                    <th>Account ID</th>
                    <th>Region</th>
                </tr>
            </thead>
            <tbody>
                ${Object.values(accounts).map(account => `
                    <tr>
                        <td><strong>${account.name}</strong></td>
                        <td>${account.id}</td>
                        <td>ap-south-1</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
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

let startCalendar, endCalendar;

function showDateModal() {
    const modal = document.getElementById('dateRangeModal');
    if (modal) {
        modal.style.display = 'block';
        
        if (!startCalendar) {
            const startInput = document.getElementById('startDateTime');
            const endInput = document.getElementById('endDateTime');
            if (startInput && endInput) {
                startCalendar = new CalendarPopup(startInput);
                endCalendar = new CalendarPopup(endInput);
            }
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

function formatDateTimeLocal(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return '';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function applyCustomDates() {
    const startValue = document.getElementById('startDateTime').value;
    const endValue = document.getElementById('endDateTime').value;
    
    if (!startValue || !endValue) {
        alert('Please select both start and end dates');
        return;
    }
    
    // Parse calendar format: YYYY-MM-DD HH:mm AM/PM
    const parseDateTime = (str) => {
        const parts = str.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) (AM|PM)/);
        if (!parts) return null;
        
        let hours = parseInt(parts[4]);
        const minutes = parseInt(parts[5]);
        const ampm = parts[6];
        
        if (ampm === 'PM' && hours !== 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        
        return new Date(parts[1], parts[2] - 1, parts[3], hours, minutes);
    };
    
    const startDate = parseDateTime(startValue);
    const endDate = parseDateTime(endValue);
    
    if (!startDate || !endDate) {
        alert('Invalid date format');
        return;
    }
    
    const now = new Date();
    
    if (endDate <= startDate) {
        alert('End date must be after start date');
        return;
    }
    
    const durationMs = endDate.getTime() - startDate.getTime();
    const durationHours = Math.round(durationMs / (1000 * 60 * 60));
    const maxHours = 5 * 24;
    
    if (durationHours > maxHours) {
        alert(`Maximum duration is 5 days (120 hours). Selected duration: ${durationHours} hours`);
        return;
    }
    
    const durationSelect = document.getElementById('requestDuration');
    const customOption = durationSelect.querySelector('option[value="custom"]');
    customOption.textContent = `Custom (${durationHours}h)`;
    
    window.customDuration = {
        hours: durationHours,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
    };
    
    alert(`✅ Custom dates set: ${durationHours} hours\nFrom: ${startDate.toLocaleString()}\nTo: ${endDate.toLocaleString()}`);
    
    closeDateModal();
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
    
    // Clear previous messages
    const existingMsg = document.getElementById('intentMessage');
    if (existingMsg) existingMsg.remove();
    
    // Backend will handle all validation - just send the request
    
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
            // Show inline message instead of alert
            if (permissions.intent_analysis) {
                showIntentMessage(permissions.intent_analysis, permissions.suggestion);
            } else if (permissions.suggestion === 'use_existing_permission_sets') {
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
    
    // Check if AI permissions were generated
    if (window.currentAIPermissions) {
        formData.use_case = `Access to ${selectedService} resources: ${selectedResources.map(r => r.id).join(', ')}`;
        
        formData.aws_services = [selectedService];
        formData.service_configs = {};
        
        if (false) {
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
        alert('Please complete the wizard: Select service → Select resources → Add tags → Generate permissions');
        return;
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
        
        cancelNewRequest();
        
        // Refresh data
        await loadRequests();
        updateDashboard();
        
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

// Admin Functions (Dashboard merged into main page)
function loadAdminPage() {
    showAdminTab('users');
    if (typeof loadUsersManagement === 'function') loadUsersManagement();
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
    if (window.userActivityChartInstance) {
        window.userActivityChartInstance.destroy();
        window.userActivityChartInstance = null;
    }
    if (window.requestTypesChartInstance) {
        window.requestTypesChartInstance.destroy();
        window.requestTypesChartInstance = null;
    }
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
    
    window.userActivityChartInstance = new Chart(ctx, {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: true,
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
    
    window.requestTypesChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: true,
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
function showCloudOnboarding() {
    showModal('cloudOnboardingModal');
}

function onboardCloud(provider) {
    closeModal();
    alert(`${provider.toUpperCase()} onboarding will be available soon.\n\nYou'll be able to connect your ${provider.toUpperCase()} accounts and sync them automatically.`);
}

function showIntegrationTab(tabName) {
    document.querySelectorAll('.integration-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.integration-tab-content').forEach(content => content.classList.remove('active'));
    const btn = event?.target?.closest('.integration-tab-btn');
    if (btn) btn.classList.add('active');
    const tabEl = document.getElementById(tabName + 'IntegrationTab');
    if (tabEl) tabEl.classList.add('active');
}

function showIntentMessage(intentAnalysis, suggestion) {
    const aiCopilotTab = document.getElementById('aiCopilotTab');
    const useCaseTextarea = document.getElementById('aiUseCase');
    
    let messageHtml = '';
    
    if (suggestion === 'create_jira_ticket') {
        messageHtml = `
            <div id="intentMessage" style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 1rem; margin: 1rem 0; border-radius: 4px;">
                <div style="display: flex; align-items: start; gap: 0.5rem;">
                    <i class="fas fa-exclamation-triangle" style="color: #856404; margin-top: 2px;"></i>
                    <div style="color: #856404; font-size: 0.9rem;">
                        <strong>Infrastructure Request Detected</strong><br>
                        This system provides temporary ACCESS to existing resources only.<br>
                        For new resource creation, please create a JIRA ticket for DevOps/Platform team.<br><br>
                        <strong>Detected:</strong> ${intentAnalysis.intents.join(', ')} - ${intentAnalysis.resources.join(', ')}<br><br>
                        <strong>To request access:</strong> Specify existing resource name (e.g., "access bucket: my-existing-bucket")
                    </div>
                </div>
            </div>
        `;
    } else if (suggestion === 'manager_approval_required') {
        messageHtml = `
            <div id="intentMessage" style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 1rem; margin: 1rem 0; border-radius: 4px;">
                <div style="display: flex; align-items: start; gap: 0.5rem;">
                    <i class="fas fa-ban" style="color: #721c24; margin-top: 2px;"></i>
                    <div style="color: #721c24; font-size: 0.9rem;">
                        <strong>Destructive Operation Detected</strong><br>
                        DELETE/CLEANUP operations require manager approval and proper justification.<br><br>
                        <strong>Detected:</strong> ${intentAnalysis.intents.join(', ')}<br><br>
                        <strong>Alternative:</strong> Request READ-ONLY access first to review data
                    </div>
                </div>
            </div>
        `;
    }
    
    useCaseTextarea.insertAdjacentHTML('afterend', messageHtml);
}

function configureIntegration(provider) {
    alert(`Configure ${provider} integration`);
}

function showAdminIntegrationCategory(category) {
    document.querySelectorAll('.admin-integration-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.admin-integration-category').forEach(el => el.classList.remove('active'));
    const btn = event?.target?.closest('.admin-integration-tab-btn');
    if (btn) btn.classList.add('active');
    const el = document.getElementById('adminIntegration' + category.charAt(0).toUpperCase() + category.slice(1));
    if (el) el.classList.add('active');
}

function filterAuditLogs() {
    alert('Filter audit logs');
}

function loadRequestForOthersModalData() {
    // Load accounts
    const accountSelect = document.getElementById('otherRequestAccount');
    if (accountSelect) {
        accountSelect.innerHTML = '<option value="">Select Account</option>' +
            Object.values(accounts).map(account => 
                `<option value="${account.id}">${account.name} (${account.id})</option>`
            ).join('');
    }
    
    // Load permission sets
    const permissionSetSelect = document.getElementById('otherRequestPermissionSet');
    if (permissionSetSelect) {
        permissionSetSelect.innerHTML = '<option value="">Select Permission Set</option>' +
            permissionSets.map(ps => 
                `<option value="${ps.arn}">${ps.name}</option>`
            ).join('');
    }
    
    // Setup email tags functionality
    setupEmailTags();
}

let selectedEmails = [];

function setupEmailTags() {
    const emailInput = document.getElementById('requesterEmail');
    const emailTags = document.getElementById('emailTags');
    
    if (!emailInput || !emailTags) return;
    
    emailInput.addEventListener('keydown', function(e) {
        if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault();
            addEmailTag(this.value.trim());
            this.value = '';
        } else if (e.key === 'Backspace' && this.value === '' && selectedEmails.length > 0) {
            removeEmailTag(selectedEmails.length - 1);
        }
    });
    
    emailInput.addEventListener('blur', function() {
        if (this.value.trim()) {
            addEmailTag(this.value.trim());
            this.value = '';
        }
    });
}

function addEmailTag(email) {
    if (!email || !isValidEmail(email) || selectedEmails.includes(email)) {
        return;
    }
    
    selectedEmails.push(email);
    renderEmailTags();
}

function removeEmailTag(index) {
    selectedEmails.splice(index, 1);
    renderEmailTags();
}

function renderEmailTags() {
    const emailTags = document.getElementById('emailTags');
    if (!emailTags) return;
    
    emailTags.innerHTML = selectedEmails.map((email, index) => `
        <span class="email-tag">
            ${email}
            <button type="button" class="email-tag-remove" onclick="removeEmailTag(${index})">&times;</button>
        </span>
    `).join('');
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function switchOtherAccessType(type) {
    // Update tab buttons
    document.querySelectorAll('#requestForOthersModal .tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('#requestForOthersModal .tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(type === 'existing' ? 'otherExistingPermissionsTab' : 'otherAiCopilotTab').classList.add('active');
}

let otherCurrentAIPermissions = null;

async function generateOtherAIPermissions() {
    const useCase = document.getElementById('otherAiUseCase').value;
    if (!useCase) {
        alert('Please describe what users need to do');
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
            alert('Error: ' + permissions.error);
            return;
        }
        
        // Display permissions
        const preview = document.getElementById('otherAiPermissionsPreview');
        const content = document.getElementById('otherAiPermissionsContent');
        
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
        otherCurrentAIPermissions = permissions;
        
    } catch (error) {
        console.error('Error generating permissions:', error);
        alert('Error generating permissions. Please try again.');
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

// Form Handlers
async function handleRequestForOthers(e) {
    e.preventDefault();
    
    // Add current input value to emails if any
    const currentInput = document.getElementById('requesterEmail').value.trim();
    if (currentInput && isValidEmail(currentInput) && !selectedEmails.includes(currentInput)) {
        selectedEmails.push(currentInput);
    }
    
    if (selectedEmails.length === 0) {
        alert('Please add at least one email address');
        return;
    }
    
    const account_id = document.getElementById('otherRequestAccount').value;
    const duration_hours = parseInt(document.getElementById('otherRequestDuration').value);
    const justification = document.getElementById('otherRequestJustification').value;
    
    // Check if AI or existing permission set
    const activeTab = document.querySelector('#requestForOthersModal .tab-btn.active').textContent;
    let permission_set = null;
    let use_case = null;
    
    if (activeTab.includes('AI')) {
        if (!otherCurrentAIPermissions) {
            alert('Please generate permissions first');
            return;
        }
        use_case = document.getElementById('otherAiUseCase').value;
    } else {
        permission_set = document.getElementById('otherRequestPermissionSet').value;
        if (!permission_set) {
            alert('Please select a permission set');
            return;
        }
    }
    
    // Validate required fields
    if (!account_id || !justification) {
        alert('Please fill in all required fields');
        return;
    }
    
    try {
        const results = [];
        
        // Submit request for each email
        for (const email of selectedEmails) {
            const formData = {
                user_email: email,
                account_id: account_id,
                duration_hours: duration_hours,
                justification: justification,
                requested_by: localStorage.getItem('userEmail')
            };
            
            // Add AI or existing permission set data
            if (use_case) {
                formData.use_case = use_case;
                formData.ai_generated = true;
            } else {
                formData.permission_set = permission_set;
                formData.ai_generated = false;
            }
            
            const response = await fetch(`${API_BASE}/request-for-others`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            results.push({ email, result });
        }
        
        // Show results
        const successful = results.filter(r => !r.result.error);
        const failed = results.filter(r => r.result.error);
        
        let message = `✅ Requests submitted for ${successful.length} user(s):\n`;
        successful.forEach(r => {
            message += `• ${r.email}: ${r.result.request_id}\n`;
        });
        
        if (failed.length > 0) {
            message += `\n❌ Failed for ${failed.length} user(s):\n`;
            failed.forEach(r => {
                message += `• ${r.email}: ${r.result.error}\n`;
            });
        }
        
        alert(message);
        closeRequestForOthersModal();
        
        // Refresh data
        await loadRequests();
        updateDashboard();
        
        // Clear form
        document.getElementById('requestForOthersForm').reset();
        selectedEmails = [];
        renderEmailTags();
        otherCurrentAIPermissions = null;
        document.getElementById('otherAiPermissionsPreview').style.display = 'none';
        
    } catch (error) {
        console.error('Error submitting request:', error);
        alert('Error submitting request. Please try again.');
    }
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
    location.reload();
}

// Request Dropdown Toggle
function toggleRequestDropdown() {
    const menu = document.getElementById('requestDropdownMenu');
    menu.classList.toggle('show');
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
    const dropdown = document.querySelector('.request-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        const menu = document.getElementById('requestDropdownMenu');
        if (menu) menu.classList.remove('show');
    }
});

// OTP Input Auto-Focus
function setupOTPInputs() {
    const otpInputs = document.querySelectorAll('.otp-input');
    if (!otpInputs.length) return;
    otpInputs.forEach((input, index) => {
        input.addEventListener('input', function() {
            if (this.value.length === 1 && index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
        });
        
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Backspace' && this.value === '' && index > 0) {
                otpInputs[index - 1].focus();
            }
        });
        
        input.addEventListener('paste', function(e) {
            e.preventDefault();
            const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
            pasted.split('').forEach((char, i) => {
                if (otpInputs[i]) {
                    otpInputs[i].value = char;
                }
            });
            if (otpInputs[pasted.length - 1]) otpInputs[pasted.length - 1].focus();
        });
    });
}

// Utility Functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}