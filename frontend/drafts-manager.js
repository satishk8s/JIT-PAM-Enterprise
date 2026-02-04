// Drafts Manager - Manage saved request drafts

function showGeneratedPolicyModal() {
    if (!currentGeneratedPolicy) {
        alert('No policy generated yet. Use GovernAIX to generate permissions.');
        return;
    }
    
    const modal = document.createElement('div');
    modal.id = 'generatedPolicyModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 0; max-width: 700px; width: 90%; max-height: 85vh; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
            <div style="padding: 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; color: var(--text-primary); font-size: 16px; font-weight: 600;"><i class="fas fa-file-code"></i> Generated IAM Policy</h3>
                <button onclick="closeGeneratedPolicyModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">&times;</button>
            </div>
            <div style="padding: 20px; overflow: auto; max-height: calc(85vh - 140px);">
                <pre style="background: var(--bg-secondary); padding: 20px; border-radius: 8px; overflow: auto; color: var(--text-primary); font-size: 13px; line-height: 1.6; margin: 0; border: 1px solid var(--border-color);">${JSON.stringify(currentGeneratedPolicy, null, 2)}</pre>
            </div>
            <div style="padding: 20px; border-top: 1px solid var(--border-color); display: flex; gap: 10px;">
                <button onclick="copyPolicyToClipboard()" class="btn-secondary" style="flex: 1; padding: 10px; border-radius: 8px;"><i class="fas fa-copy"></i> Copy</button>
                <button onclick="closeGeneratedPolicyModal()" class="btn-primary" style="flex: 1; padding: 10px; border-radius: 8px;">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeGeneratedPolicyModal() {
    const modal = document.getElementById('generatedPolicyModal');
    if (modal) modal.remove();
}

function showDraftsModal() {
    const drafts = JSON.parse(localStorage.getItem('policyDrafts') || '[]');
    
    if (drafts.length === 0) {
        alert('No saved drafts');
        return;
    }
    
    const modal = document.createElement('div');
    modal.id = 'draftsModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 0; max-width: 900px; width: 90%; max-height: 85vh; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
            <div style="padding: 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <h3 style="margin: 0; color: var(--text-primary); font-size: 16px; font-weight: 600;">
                        <i class="fas fa-folder-open"></i> Saved Drafts
                    </h3>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); cursor: pointer;">
                        <input type="checkbox" id="selectAllDrafts" onchange="toggleSelectAllDrafts()" style="cursor: pointer;">
                        Select All
                    </label>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button onclick="deleteSelectedDrafts()" class="btn-danger" style="padding: 8px 16px; font-size: 13px;">
                        <i class="fas fa-trash"></i> Delete Selected
                    </button>
                    <button onclick="closeDraftsModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">&times;</button>
                </div>
            </div>
            <div style="padding: 20px; overflow: auto; max-height: calc(85vh - 140px);">
                <div id="draftsListContainer">
                    ${drafts.map((draft, index) => `
                        <div class="draft-item" data-draft-id="${draft.id}" style="padding: 15px; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 10px; border: 1px solid var(--border-color); display: flex; gap: 15px; align-items: start;">
                            <input type="checkbox" class="draft-checkbox" data-draft-id="${draft.id}" style="margin-top: 5px; cursor: pointer;">
                            <div style="flex: 1; cursor: pointer;" onclick="continueEditingDraft(${draft.id})">
                                <div style="font-size: 13px; color: var(--text-primary); font-weight: 600; margin-bottom: 5px;">${draft.description}</div>
                                <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">
                                    ${draft.policy.Statement[0].Action.length} actions • ${new Date(draft.timestamp).toLocaleString()}
                                </div>
                                <div style="font-size: 11px; color: var(--text-secondary); background: var(--bg-primary); padding: 8px; border-radius: 4px; max-height: 60px; overflow: hidden;">
                                    ${draft.policy.Statement[0].Action.slice(0, 5).join(', ')}${draft.policy.Statement[0].Action.length > 5 ? '...' : ''}
                                </div>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                <button onclick="continueEditingDraft(${draft.id})" class="btn-primary" style="padding: 6px 12px; font-size: 12px; white-space: nowrap;">
                                    <i class="fas fa-edit"></i> Continue
                                </button>
                                <button onclick="deleteSingleDraft(${draft.id})" class="btn-danger" style="padding: 6px 12px; font-size: 12px;">
                                    <i class="fas fa-trash"></i> Delete
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeDraftsModal() {
    const modal = document.getElementById('draftsModal');
    if (modal) modal.remove();
}

function toggleSelectAllDrafts() {
    const selectAll = document.getElementById('selectAllDrafts');
    const checkboxes = document.querySelectorAll('.draft-checkbox');
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
}

function deleteSelectedDrafts() {
    const checkboxes = document.querySelectorAll('.draft-checkbox:checked');
    if (checkboxes.length === 0) {
        alert('Please select drafts to delete');
        return;
    }
    
    if (!confirm(`Delete ${checkboxes.length} selected draft(s)?`)) {
        return;
    }
    
    const drafts = JSON.parse(localStorage.getItem('policyDrafts') || '[]');
    const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.dataset.draftId));
    const remainingDrafts = drafts.filter(d => !selectedIds.includes(d.id));
    
    localStorage.setItem('policyDrafts', JSON.stringify(remainingDrafts));
    
    closeDraftsModal();
    alert(`✅ Deleted ${checkboxes.length} draft(s)`);
}

function deleteSingleDraft(draftId) {
    if (!confirm('Delete this draft?')) {
        return;
    }
    
    const drafts = JSON.parse(localStorage.getItem('policyDrafts') || '[]');
    const remainingDrafts = drafts.filter(d => d.id !== draftId);
    
    localStorage.setItem('policyDrafts', JSON.stringify(remainingDrafts));
    
    closeDraftsModal();
    showDraftsModal();
}

function continueEditingDraft(draftId) {
    const drafts = JSON.parse(localStorage.getItem('policyDrafts') || '[]');
    const draft = drafts.find(d => d.id === draftId);
    
    if (!draft) {
        alert('Draft not found');
        return;
    }
    
    // Load draft data into wizard
    window.currentAIPermissions = {
        actions: draft.policy.Statement[0].Action,
        resources: draft.policy.Statement[0].Resource,
        description: draft.description
    };
    aiUnderstanding = window.currentAIPermissions;
    
    // Close modal and show new request page
    closeDraftsModal();
    showNewRequestPage();
    
    // Restore AI chat area with draft info
    const chatArea = document.getElementById('aiChatArea');
    if (chatArea) {
        chatArea.innerHTML = `
            <div style="margin-bottom: 12px; display: flex; justify-content: flex-start;">
                <div style="max-width: 70%; padding: 10px 14px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; border-radius: 12px 12px 12px 4px; font-size: 13px;">
                    📂 Loaded draft: ${draft.description}
                </div>
            </div>
        `;
        chatArea.style.display = 'block';
    }
    
    // Show permissions preview
    const previewPanel = document.getElementById('selectedResourcesPanel');
    if (previewPanel) {
        previewPanel.innerHTML = `
            <div style="background: var(--bg-secondary); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                <strong style="font-size: 13px; color: #11998e; display: block; margin-bottom: 8px;">📋 Draft Permissions</strong>
                <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">${draft.description}</div>
                <div style="background: var(--bg-primary); border-radius: 6px; padding: 10px; max-height: 200px; overflow-y: auto;">
                    ${draft.policy.Statement[0].Action.map(action => `<div style="font-size: 11px; color: var(--text-primary); padding: 2px 0;">• ${action}</div>`).join('')}
                </div>
                <div style="margin-top: 8px; font-size: 11px; color: var(--text-secondary); font-style: italic;">💬 Continue chat to modify or submit</div>
            </div>
        `;
    }
    
    // Show AI Copilot section
    const aiSection = document.getElementById('aiCopilotSection');
    if (aiSection) aiSection.style.display = 'block';
    
    alert('✅ Draft loaded! Continue editing or submit the request.');
}
