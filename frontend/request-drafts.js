/**
 * Request Drafts Manager
 * Saves incomplete access requests so users can resume later
 */

function saveRequestDraft(draftName) {
    const accountId = document.getElementById('requestAccount')?.value;
    const duration = document.getElementById('requestDuration')?.value;
    const justification = document.getElementById('requestJustification')?.value;
    const useCase = document.getElementById('aiCopilotUseCase')?.value;
    
    if (!accountId || Object.keys(selectedResources).length === 0) {
        alert('⚠️ Please select account and resources first');
        return;
    }
    
    const draft = {
        id: Date.now(),
        name: draftName || `Draft ${new Date().toLocaleString()}`,
        accountId: accountId,
        selectedResources: selectedResources,
        duration: duration,
        justification: justification,
        useCase: useCase,
        conversationId: currentConversationId,
        conversationHistory: conversationHistory,
        timestamp: new Date().toISOString()
    };
    
    const drafts = JSON.parse(localStorage.getItem('requestDrafts') || '[]');
    drafts.unshift(draft);
    localStorage.setItem('requestDrafts', JSON.stringify(drafts.slice(0, 20))); // Keep last 20
    
    alert('✅ Request draft saved!');
}

function loadRequestDrafts() {
    const drafts = JSON.parse(localStorage.getItem('requestDrafts') || '[]');
    
    if (drafts.length === 0) {
        alert('No saved request drafts');
        return;
    }
    
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 20px; max-width: 700px; width: 90%; max-height: 80vh; overflow: auto; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px;">
                <h3 style="margin: 0; color: var(--text-primary); font-size: 18px; font-weight: 600;"><i class="fas fa-save"></i> Saved Request Drafts</h3>
                <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);"">&times;</button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                ${drafts.map(draft => {
                    const resourceCount = Object.values(draft.selectedResources).reduce((sum, arr) => sum + arr.length, 0);
                    const serviceNames = Object.keys(draft.selectedResources).join(', ');
                    return `
                        <div style="padding: 16px; background: var(--bg-secondary); border-radius: 8px; cursor: pointer; border: 1px solid var(--border-color); transition: all 0.2s;" 
                             onmouseover="this.style.borderColor='#667eea'" 
                             onmouseout="this.style.borderColor='var(--border-color)'"
                             onclick="loadRequestDraft(${draft.id})">
                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                                <div style="font-size: 14px; color: var(--text-primary); font-weight: 600;">${draft.name}</div>
                                <button onclick="event.stopPropagation(); deleteRequestDraft(${draft.id})" 
                                        style="background: none; border: none; color: #f44336; cursor: pointer; font-size: 16px; padding: 0 8px;"
                                        title="Delete draft">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">
                                <i class="fas fa-server"></i> Account: ${draft.accountId}
                            </div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">
                                <i class="fas fa-cubes"></i> ${resourceCount} resources from ${serviceNames}
                            </div>
                            ${draft.useCase ? `<div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;"><i class="fas fa-comment"></i> "${draft.useCase.substring(0, 50)}${draft.useCase.length > 50 ? '...' : ''}"</div>` : ''}
                            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 8px;">
                                <i class="fas fa-clock"></i> ${new Date(draft.timestamp).toLocaleString()}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function loadRequestDraft(draftId) {
    const drafts = JSON.parse(localStorage.getItem('requestDrafts') || '[]');
    const draft = drafts.find(d => d.id === draftId);
    
    if (!draft) {
        alert('Draft not found');
        return;
    }
    
    // Close modal
    document.querySelectorAll('div[style*="fixed"]').forEach(m => m.remove());
    
    // Restore account selection
    const accountSelect = document.getElementById('requestAccount');
    if (accountSelect) {
        accountSelect.value = draft.accountId;
        loadPermissionSetsDropdown(); // Trigger resource loading
    }
    
    // Restore selected resources
    selectedResources = draft.selectedResources;
    
    // Restore form fields
    if (draft.duration) {
        const durationInput = document.getElementById('requestDuration');
        if (durationInput) durationInput.value = draft.duration;
    }
    
    if (draft.justification) {
        const justificationInput = document.getElementById('requestJustification');
        if (justificationInput) justificationInput.value = draft.justification;
    }
    
    if (draft.useCase) {
        const useCaseInput = document.getElementById('aiCopilotUseCase');
        if (useCaseInput) useCaseInput.value = draft.useCase;
    }
    
    // Restore conversation if exists
    if (draft.conversationId) {
        currentConversationId = draft.conversationId;
    }
    
    if (draft.conversationHistory) {
        conversationHistory = draft.conversationHistory;
    }
    
    // Update UI
    updateSelectedResourcesPanel();
    
    // Show success message
    alert('✅ Draft loaded! Continue where you left off.');
    
    // Navigate to request page
    showPage('request');
}

function deleteRequestDraft(draftId) {
    if (!confirm('Delete this draft?')) return;
    
    const drafts = JSON.parse(localStorage.getItem('requestDrafts') || '[]');
    const filtered = drafts.filter(d => d.id !== draftId);
    localStorage.setItem('requestDrafts', JSON.stringify(filtered));
    
    // Reload drafts modal
    document.querySelectorAll('div[style*="fixed"]').forEach(m => m.remove());
    loadRequestDrafts();
}

function autoSaveRequestDraft() {
    const accountId = document.getElementById('requestAccount')?.value;
    
    if (accountId && Object.keys(selectedResources).length > 0) {
        saveRequestDraft('Auto-save ' + new Date().toLocaleTimeString());
    }
}

// Auto-save every 2 minutes
setInterval(autoSaveRequestDraft, 2 * 60 * 1000);
