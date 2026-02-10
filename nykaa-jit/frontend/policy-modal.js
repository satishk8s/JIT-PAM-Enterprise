// Policy Configuration Modal

let currentModalType = null;

function openPolicyModal(type) {
    currentModalType = type;
    const modal = document.getElementById('policyConfigModal');
    const title = document.getElementById('policyModalTitle');
    const content = document.getElementById('policyModalContent');
    
    const configs = {
        jit: {
            title: '⏱️ JIT Flow Configuration',
            content: `
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <div class="modern-toggle-card">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h4 style="margin: 0 0 5px 0;">Enable JIT for Production</h4>
                                <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">Require time-limited access for production accounts</p>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="modern-toggle-card">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h4 style="margin: 0 0 5px 0;">Enable JIT for Non-Production</h4>
                                <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">Apply JIT to dev/staging environments</p>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="modern-select-card">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Default JIT Duration</label>
                        <select style="width: 100%; padding: 12px; border: 2px solid var(--border-color); border-radius: 8px; font-size: 14px;">
                            <option>4 hours</option>
                            <option selected>8 hours</option>
                            <option>24 hours</option>
                        </select>
                    </div>
                    
                    <div class="modern-select-card">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Maximum JIT Duration</label>
                        <select style="width: 100%; padding: 12px; border: 2px solid var(--border-color); border-radius: 8px; font-size: 14px;">
                            <option>24 hours</option>
                            <option>72 hours</option>
                            <option selected>120 hours (5 days)</option>
                        </select>
                    </div>
                    
                    <div class="modern-toggle-card">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h4 style="margin: 0 0 5px 0;">Auto-revoke on expiry</h4>
                                <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">Automatically remove access when time expires</p>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="modern-toggle-card">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h4 style="margin: 0 0 5px 0;">Send expiry reminders</h4>
                                <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">Notify users 1 hour before access expires</p>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" checked>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            `
        },
        approval: {
            title: '✅ Approval Workflow Builder',
            content: `
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <div style="display: flex; gap: 10px; border-bottom: 2px solid var(--border-color); padding-bottom: 10px;">
                        <button class="workflow-tab active" onclick="switchWorkflowTab('cloud')">Cloud Access</button>
                        <button class="workflow-tab" onclick="switchWorkflowTab('instances')">Instances</button>
                        <button class="workflow-tab" onclick="switchWorkflowTab('s3')">S3 Buckets</button>
                        <button class="workflow-tab" onclick="switchWorkflowTab('database')">Database</button>
                    </div>
                    
                    <div id="workflowCloudTab" class="workflow-content">
                        <h4 style="margin: 0 0 15px 0;">Cloud Access Approval Flow</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                            <div>
                                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Access Type</label>
                                <select class="workflow-select">
                                    <option>Read Only</option>
                                    <option>Read & Write</option>
                                </select>
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Environment</label>
                                <select class="workflow-select">
                                    <option>Production</option>
                                    <option>Non-Production</option>
                                    <option>Sandbox</option>
                                </select>
                            </div>
                        </div>
                        <div style="margin-top: 20px;">
                            <label style="display: block; margin-bottom: 12px; font-weight: 600;">Approval Chain (Drag to reorder)</label>
                            <div class="approval-chain">
                                <div class="approval-step" draggable="true">⚡ Self Approval</div>
                                <div class="approval-step" draggable="true">👤 Manager</div>
                                <div class="approval-step" draggable="true">👨‍💼 Team Lead</div>
                                <div class="approval-step" draggable="true">🔧 DevOps Lead</div>
                                <div class="approval-step" draggable="true">🛡️ Security Lead</div>
                                <div class="approval-step" draggable="true">👔 CISO</div>
                                <div class="approval-step" draggable="true">⭐ Staff Engineer</div>
                            </div>
                            <button class="btn-secondary" style="margin-top: 10px;" onclick="alert('Add custom approver')">+ Add Approver</button>
                        </div>
                    </div>
                    
                    <div id="workflowInstancesTab" class="workflow-content" style="display: none;">
                        <h4 style="margin: 0 0 15px 0;">Instance Access Approval Flow</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                            <div>
                                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Access Level</label>
                                <select class="workflow-select">
                                    <option>Non-Sudo</option>
                                    <option>Sudo</option>
                                </select>
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Environment</label>
                                <select class="workflow-select">
                                    <option>Production</option>
                                    <option>Non-Production</option>
                                    <option>Sandbox</option>
                                </select>
                            </div>
                        </div>
                        <div style="margin-top: 20px;">
                            <label style="display: block; margin-bottom: 12px; font-weight: 600;">Approval Chain</label>
                            <div class="approval-chain">
                                <div class="approval-step" draggable="true">👤 Manager</div>
                                <div class="approval-step" draggable="true">🔧 DevOps Lead</div>
                            </div>
                        </div>
                    </div>
                    
                    <div id="workflowS3Tab" class="workflow-content" style="display: none;">
                        <h4 style="margin: 0 0 15px 0;">S3 Bucket Access Approval Flow</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                            <div>
                                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Permission Type</label>
                                <select class="workflow-select">
                                    <option>View Only</option>
                                    <option>Download</option>
                                    <option>Upload</option>
                                    <option>Full Access</option>
                                </select>
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Environment</label>
                                <select class="workflow-select">
                                    <option>Production</option>
                                    <option>Non-Production</option>
                                    <option>Sandbox</option>
                                </select>
                            </div>
                        </div>
                        <div style="margin-top: 20px;">
                            <label style="display: block; margin-bottom: 12px; font-weight: 600;">Approval Chain</label>
                            <div class="approval-chain">
                                <div class="approval-step" draggable="true">👤 Manager</div>
                                <div class="approval-step" draggable="true">🛡️ Security Lead</div>
                            </div>
                        </div>
                    </div>
                    
                    <div id="workflowDatabaseTab" class="workflow-content" style="display: none;">
                        <h4 style="margin: 0 0 15px 0;">Database Access Approval Flow</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                            <div>
                                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Database Type</label>
                                <select class="workflow-select">
                                    <option>Production DB</option>
                                    <option>Non-Production DB</option>
                                </select>
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Access Level</label>
                                <select class="workflow-select">
                                    <option>Read Only</option>
                                    <option>Read & Write</option>
                                </select>
                            </div>
                        </div>
                        <div style="margin-top: 20px;">
                            <label style="display: block; margin-bottom: 12px; font-weight: 600;">Approval Chain</label>
                            <div class="approval-chain">
                                <div class="approval-step" draggable="true">👤 Manager</div>
                                <div class="approval-step" draggable="true">🔧 DevOps Lead</div>
                                <div class="approval-step" draggable="true">🛡️ Security Lead</div>
                            </div>
                        </div>
                    </div>
                </div>
            `
        },
        tagging: {
            title: '🏷️ Account Tagging',
            content: `
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <p style="color: var(--text-secondary); margin: 0;">Tag accounts with environment to control policy enforcement</p>
                    <button class="btn-primary" onclick="alert('Sync from AWS OU')"><i class="fas fa-sync"></i> Auto-Sync from AWS OU</button>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="background: var(--bg-secondary);">
                                <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--border-color);">Account ID</th>
                                <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--border-color);">Name</th>
                                <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--border-color);">Environment</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom: 1px solid var(--border-color);">
                                <td style="padding: 12px;">123456789012</td>
                                <td style="padding: 12px;">Production</td>
                                <td style="padding: 12px;">
                                    <select style="padding: 6px; border: 1px solid var(--border-color); border-radius: 4px;">
                                        <option selected>Production</option>
                                        <option>Non-Production</option>
                                        <option>Sandbox</option>
                                    </select>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `
        },
        restricted: {
            title: '🚫 Restricted Actions Control',
            content: `
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <h4 style="margin: 0;">Delete Operations</h4>
                    <div class="modern-toggle-card">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h4 style="margin: 0 0 5px 0;">Non-Production</h4>
                                <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">Allow delete in dev/staging</p>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" id="modalAllowDeleteNonProd">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="modern-toggle-card">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h4 style="margin: 0 0 5px 0;">Production</h4>
                                <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">Requires multi-level approval</p>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" id="modalAllowDeleteProd">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <h4 style="margin: 0;">Create Operations</h4>
                    <div class="modern-toggle-card">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h4 style="margin: 0 0 5px 0;">Non-Production</h4>
                                <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">Allow resource creation</p>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" id="modalAllowCreateNonProd">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="modern-toggle-card">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h4 style="margin: 0 0 5px 0;">Production</h4>
                                <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">Requires DevOps approval</p>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" id="modalAllowCreateProd">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <h4 style="margin: 0;">Admin Operations</h4>
                    <div class="modern-toggle-card">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h4 style="margin: 0 0 5px 0;">Non-Production</h4>
                                <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">Allow admin access</p>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" id="modalAllowAdminNonProd">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="modern-toggle-card">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h4 style="margin: 0 0 5px 0;">Production</h4>
                                <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">Requires CISO approval</p>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" id="modalAllowAdminProd">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="modern-toggle-card">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h4 style="margin: 0 0 5px 0;">Sandbox</h4>
                                <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">Allow admin in sandbox</p>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" id="modalAllowAdminSandbox">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            `
        }
    };
    
    const config = configs[type];
    title.innerHTML = config.title;
    content.innerHTML = config.content;
    modal.style.display = 'flex';
    
    // Load current settings for restricted actions
    if (type === 'restricted') {
        setTimeout(() => loadRestrictedSettings(), 100);
    }
}

function loadRestrictedSettings() {
    fetch('http://127.0.0.1:5000/api/admin/policy-settings')
    .then(res => res.json())
    .then(data => {
        document.getElementById('modalAllowDeleteNonProd').checked = data.allowDeleteNonProd !== false;
        document.getElementById('modalAllowDeleteProd').checked = data.allowDeleteProd === true;
        document.getElementById('modalAllowCreateNonProd').checked = data.allowCreateNonProd === true;
        document.getElementById('modalAllowCreateProd').checked = data.allowCreateProd === true;
        document.getElementById('modalAllowAdminNonProd').checked = data.allowAdminNonProd === true;
        document.getElementById('modalAllowAdminProd').checked = data.allowAdminProd === true;
        document.getElementById('modalAllowAdminSandbox').checked = data.allowAdminSandbox !== false;
    })
    .catch(err => console.error('Error loading settings:', err));
}

function closePolicyModal() {
    document.getElementById('policyConfigModal').style.display = 'none';
}

async function savePolicyConfig() {
    if (currentModalType === 'restricted') {
        const deleteNonProd = document.getElementById('modalAllowDeleteNonProd').checked;
        const deleteProd = document.getElementById('modalAllowDeleteProd').checked;
        const createNonProd = document.getElementById('modalAllowCreateNonProd').checked;
        const createProd = document.getElementById('modalAllowCreateProd').checked;
        const adminNonProd = document.getElementById('modalAllowAdminNonProd').checked;
        const adminProd = document.getElementById('modalAllowAdminProd').checked;
        const adminSandbox = document.getElementById('modalAllowAdminSandbox').checked;
        
        try {
            // Save delete policy
            await fetch('http://127.0.0.1:5000/api/admin/delete-permissions-policy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    allowDeleteNonProd: deleteNonProd,
                    allowDeleteProd: deleteProd
                })
            });
            
            // Save create policy
            await fetch('http://127.0.0.1:5000/api/admin/create-permissions-policy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    allowCreateNonProd: createNonProd,
                    allowCreateProd: createProd
                })
            });
            
            // Save admin policy
            await fetch('http://127.0.0.1:5000/api/admin/admin-permissions-policy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    allowAdminNonProd: adminNonProd,
                    allowAdminProd: adminProd,
                    allowAdminSandbox: adminSandbox
                })
            });
            
            alert('✅ Restricted actions configuration saved successfully!');
            closePolicyModal();
            // Reload main page settings if they exist
            if (typeof loadPolicySettings === 'function') {
                loadPolicySettings();
            }
        } catch (error) {
            console.error('Error saving config:', error);
            alert('❌ Failed to save configuration');
        }
    } else {
        alert('✅ Configuration saved successfully!');
        closePolicyModal();
    }
}

function switchWorkflowTab(tab) {
    document.querySelectorAll('.workflow-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.workflow-content').forEach(c => c.style.display = 'none');
    
    event.target.classList.add('active');
    document.getElementById('workflow' + tab.charAt(0).toUpperCase() + tab.slice(1) + 'Tab').style.display = 'block';
}

// Drag and drop for approval steps
document.addEventListener('DOMContentLoaded', function() {
    let draggedElement = null;
    
    document.addEventListener('dragstart', function(e) {
        if (e.target.classList.contains('approval-step')) {
            draggedElement = e.target;
            e.target.style.opacity = '0.5';
        }
    });
    
    document.addEventListener('dragend', function(e) {
        if (e.target.classList.contains('approval-step')) {
            e.target.style.opacity = '1';
        }
    });
    
    document.addEventListener('dragover', function(e) {
        e.preventDefault();
    });
    
    document.addEventListener('drop', function(e) {
        e.preventDefault();
        if (e.target.classList.contains('approval-step') && draggedElement) {
            const chain = e.target.parentElement;
            const allSteps = [...chain.children];
            const draggedIndex = allSteps.indexOf(draggedElement);
            const targetIndex = allSteps.indexOf(e.target);
            
            if (draggedIndex < targetIndex) {
                e.target.after(draggedElement);
            } else {
                e.target.before(draggedElement);
            }
        }
    });
});
