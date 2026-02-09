/**
 * User Portal - Access Request & AI Assistant
 * Runs after app.js on user-portal.html
 */
(function() {
    // Auth check - redirect to user login if not authenticated
    if (localStorage.getItem('isLoggedIn') !== 'true') {
        window.location.href = 'user-login.html';
        return;
    }

    // Set user as non-admin for user portal
    localStorage.setItem('isAdmin', 'false');
    if (typeof isAdmin !== 'undefined') isAdmin = false;

    document.addEventListener('DOMContentLoaded', function() {
        // Update user name in header
        const userEmail = localStorage.getItem('userEmail') || 'User';
        const nameEl = document.getElementById('userPortalName');
        if (nameEl) nameEl.textContent = userEmail.split('@')[0];

        // Init AI Assistant (floating button)
        setTimeout(function() {
            if (typeof initUnifiedAssistant === 'function') initUnifiedAssistant();
        }, 300);
    });
})();

function showUserPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(pageId + 'Page');
    if (page) page.classList.add('active');
    if (pageId === 'requests' && typeof loadRequestsPage === 'function') loadRequestsPage();
}

function toggleUserProfileMenu() {
    const menu = document.getElementById('userProfileMenu');
    if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function userLogout() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('isAdmin');
    window.location.href = 'user-login.html';
}

// Close profile menu when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.profile-dropdown')) {
        const menu = document.getElementById('userProfileMenu');
        if (menu) menu.style.display = 'none';
    }
});
