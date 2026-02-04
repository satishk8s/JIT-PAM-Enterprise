/**
 * Service Control Policy (SCP) Manager
 */

async function loadSCPs() {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/admin/scps');
        const data = await response.json();
        
        if (data.error) {
            alert('Error loading SCPs: ' + data.error);
            return;
        }
        
        displaySCPs(data.policies);
    } catch (error) {
        console.error('Error loading SCPs:', error);
        alert('Failed to load SCPs');
    }
}

function displaySCPs(policies) {
    const container = document.getElementById('scpList');
    if (!container) return;
    
    if (policies.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No SCPs found</p>';
        return;
    }
    
    container.innerHTML = policies.map(policy => `
        <div class="scp-card" style="padding: 15px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="flex: 1;">
                    <h4 style="margin: 0 0 5px 0; color: var(--text-primary);">${policy.name}</h4>
                    <p style="margin: 0; font-size: 12px; color: var(--text-secondary);">${policy.description || 'No description'}</p>
                    ${policy.aws_managed ? '<span style="font-size: 11px; color: #4A90E2;">AWS Managed</span>' : ''}
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="viewSCP('${policy.id}')" class="btn-secondary" style="padding: 6px 12px; font-size: 12px;">
                        <i class="fas fa-eye"></i> View
                    </button>
                    ${!policy.aws_managed ? `
                        <button onclick="editSCP('${policy.id}')" class="btn-secondary" style="padding: 6px 12px; font-size: 12px;">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button onclick="deleteSCP('${policy.id}')" class="btn-secondary" style="padding: 6px 12px; font-size: 12px; color: #f44336;">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

async function viewSCP(policyId) {
    try {
        const response = await fetch(`http://127.0.0.1:5000/api/admin/scps/${policyId}`);
        const data = await response.json();
        
        if (data.error) {
            alert('Error: ' + data.error);
            return;
        }
        
        showSCPModal(data, 'view');
    } catch (error) {
        console.error('Error viewing SCP:', error);
        alert('Failed to load SCP details');
    }
}

function showSCPModal(policy, mode) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    
    const readonly = mode === 'view';
    
    modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 20px; max-width: 800px; width: 90%; max-height: 85vh; overflow: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px;">
                <h3 style="margin: 0; color: var(--text-primary);"><i class="fas fa-shield-alt"></i> ${policy.name}</h3>
                <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">&times;</button>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 5px;">Policy Content (JSON)</label>
                <textarea id="scpContent" ${readonly ? 'readonly' : ''} style="width: 100%; height: 300px; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; font-family: monospace; font-size: 12px; background: var(--bg-secondary); color: var(--text-primary);">${JSON.stringify(policy.content, null, 2)}</textarea>
            </div>
            
            ${policy.targets && policy.targets.length > 0 ? `
                <div style="margin-bottom: 15px;">
                    <label style="display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 5px;">Attached To</label>
                    <div style="padding: 10px; background: var(--bg-secondary); border-radius: 8px;">
                        ${policy.targets.map(t => `<div style="font-size: 12px; color: var(--text-primary); margin-bottom: 4px;"><i class="fas fa-link"></i> ${t.name} (${t.type})</div>`).join('')}
                    </div>
                </div>
            ` : ''}
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                ${!readonly ? `<button onclick="saveSCP('${policy.id}')" class="btn-primary">Save Changes</button>` : ''}
                <button onclick="this.closest('div[style*=fixed]').remove()" class="btn-secondary">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function showCreateSCPModal() {
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    
    modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 20px; max-width: 800px; width: 90%; max-height: 85vh; overflow: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px;">
                <h3 style="margin: 0; color: var(--text-primary);"><i class="fas fa-plus-circle"></i> Create New SCP</h3>
                <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">&times;</button>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 5px;">Policy Name</label>
                <input type="text" id="newScpName" placeholder="e.g., DenyS3DeleteInProd" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary);">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 5px;">Description</label>
                <input type="text" id="newScpDescription" placeholder="Brief description" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary);">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 5px;">Policy Content (JSON)</label>
                <textarea id="newScpContent" style="width: 100%; height: 300px; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; font-family: monospace; font-size: 12px; background: var(--bg-secondary); color: var(--text-primary);">{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Action": ["s3:DeleteBucket"],
    "Resource": "*"
  }]
}</textarea>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="createNewSCP()" class="btn-primary">Create SCP</button>
                <button onclick="this.closest('div[style*=fixed]').remove()" class="btn-secondary">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

async function createNewSCP() {
    const name = document.getElementById('newScpName').value;
    const description = document.getElementById('newScpDescription').value;
    const content = document.getElementById('newScpContent').value;
    
    if (!name) {
        alert('Policy name is required');
        return;
    }
    
    try {
        const contentJson = JSON.parse(content);
        
        const response = await fetch('http://127.0.0.1:5000/api/admin/scps', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name: name,
                description: description,
                content: contentJson
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            alert('Error: ' + data.error);
            return;
        }
        
        alert('✅ ' + data.message);
        document.querySelectorAll('div[style*="fixed"]').forEach(m => m.remove());
        loadSCPs();
    } catch (error) {
        alert('Invalid JSON or request failed: ' + error.message);
    }
}

async function deleteSCP(policyId) {
    if (!confirm('Delete this SCP? This action cannot be undone.')) return;
    
    try {
        const response = await fetch(`http://127.0.0.1:5000/api/admin/scps/${policyId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.error) {
            alert('Error: ' + data.error);
            return;
        }
        
        alert('✅ ' + data.message);
        loadSCPs();
    } catch (error) {
        alert('Failed to delete SCP: ' + error.message);
    }
}
