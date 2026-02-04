// Fix for unified assistant initialization
// This ensures the assistant is enabled on the requests page

// Override the initUnifiedAssistant function if it exists
if (typeof initUnifiedAssistant !== 'undefined') {
    const originalInit = initUnifiedAssistant;
    window.initUnifiedAssistant = function() {
        // Only show on requests page
        const currentPage = document.querySelector('.page.active');
        const isRequestsPage = currentPage && currentPage.id === 'requestsPage';
        
        if (!isRequestsPage) {
            // Remove if exists and not on requests page
            const button = document.getElementById('unifiedAssistantButton');
            const popup = document.getElementById('unifiedAssistantPopup');
            if (button) button.remove();
            if (popup) popup.remove();
            return;
        }
        
        // Create UI if on requests page and doesn't exist
        if (!document.getElementById('unifiedAssistantButton') && typeof createUnifiedAssistantUI === 'function') {
            createUnifiedAssistantUI();
        }
    };
}

// Also initialize when page changes
if (typeof showPage !== 'undefined') {
    const originalShowPage = showPage;
    window.showPage = function(pageId) {
        originalShowPage.apply(this, arguments);
        
        // Initialize unified assistant if on requests page
        if (pageId === 'requests') {
            setTimeout(() => {
                if (typeof initUnifiedAssistant === 'function') {
                    initUnifiedAssistant();
                }
            }, 100);
        } else {
            // Remove if not on requests page
            const button = document.getElementById('unifiedAssistantButton');
            const popup = document.getElementById('unifiedAssistantPopup');
            if (button) button.remove();
            if (popup) popup.remove();
        }
    };
}



