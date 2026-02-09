/**
 * CRITICAL FIX: Force Admin Panel to Always Be Visible
 * This script ensures the Admin Panel link is always visible in the sidebar
 */

(function() {
    'use strict';
    
    function forceAdminNavVisible() {
        const adminNavItem = document.getElementById('adminNavItem');
        if (adminNavItem) {
            adminNavItem.style.setProperty('display', 'flex', 'important');
            adminNavItem.style.setProperty('visibility', 'visible', 'important');
            adminNavItem.style.setProperty('opacity', '1', 'important');
            adminNavItem.style.setProperty('height', 'auto', 'important');
            adminNavItem.style.setProperty('min-height', '44px', 'important');
            console.log('✅ Admin Panel FORCED to be visible');
            return true;
        }
        return false;
    }
    
    // Force immediately
    forceAdminNavVisible();
    
    // Force on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            forceAdminNavVisible();
            setInterval(forceAdminNavVisible, 500);
        });
    } else {
        forceAdminNavVisible();
        setInterval(forceAdminNavVisible, 500);
    }
    
    // Force when main app shows
    const observer = new MutationObserver(function(mutations) {
        const mainApp = document.getElementById('mainApp');
        if (mainApp && mainApp.style.display !== 'none') {
            forceAdminNavVisible();
        }
    });
    
    const mainApp = document.getElementById('mainApp');
    if (mainApp) {
        observer.observe(mainApp, { attributes: true, attributeFilter: ['style'] });
    }
    
    // Override any function that might hide it
    const originalShowMainApp = window.showMainApp;
    if (typeof originalShowMainApp === 'function') {
        window.showMainApp = function() {
            originalShowMainApp.apply(this, arguments);
            setTimeout(forceAdminNavVisible, 50);
            setTimeout(forceAdminNavVisible, 200);
            setTimeout(forceAdminNavVisible, 500);
        };
    }
    
    // Also override updateUIForRole if it exists
    const originalUpdateUIForRole = window.updateUIForRole;
    if (typeof originalUpdateUIForRole === 'function') {
        window.updateUIForRole = function() {
            originalUpdateUIForRole.apply(this, arguments);
            setTimeout(forceAdminNavVisible, 50);
            setTimeout(forceAdminNavVisible, 200);
        };
    }
    
    console.log('🔧 Admin Panel visibility fix loaded');
})();



