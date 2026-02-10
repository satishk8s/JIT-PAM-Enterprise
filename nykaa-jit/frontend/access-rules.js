/**
 * Access Rules Management
 */

async function loadAccessRules() {
    console.log('🔄 Loading access rules...');
    try {
        const response = await fetch('http://127.0.0.1:5000/api/admin/access-rules');
        const data = await response.json();
        console.log('✅ Access rules loaded:', data);
        
        displayAccessRules(data.rules || []);
    } catch (error) {
        console.error('❌ Error loading access rules:', error);
    }
}

function displayAccessRules(rules) {
    console.log('📋 Displaying', rules.length, 'access rules');
    const container = document.getElementById('accessRulesList');
    if (!container) {
        console.error('❌ accessRulesList element not found');
        return;
    }
    
    if (rules.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); padding: 20px; text-align: center;">No access rules created yet. Use AI to generate rules.</p>';
        return;
    }
    
    const html = rules.map(rule => `
        <div class="rule-card" style="padding: 16px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="flex: 1;">
                    <h4 style="margin: 0 0 8px 0; color: var(--text-primary); font-size: 14px;">${rule.name}</h4>
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: var(--text-secondary);">${rule.description}</p>
                    <div style="font-size: 11px;">
                        <span style="background: #1976d2; color: #fff; padding: 2px 8px; border-radius: 4px; margin-right: 8px;">
                            <i class="fas fa-users"></i> ${rule.groups.length} group(s)
                        </span>
                        <span style="background: #d32f2f; color: #fff; padding: 2px 8px; border-radius: 4px; margin-right: 8px;">
                            <i class="fas fa-ban"></i> ${rule.denied_services.length} denied
                        </span>
                        <span style="background: #7b1fa2; color: #fff; padding: 2px 8px; border-radius: 4px;">
                            <i class="fas fa-${rule.method === 'AI' ? 'robot' : 'code'}"></i> ${rule.method || 'AI'}
                        </span>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="viewAccessRule('${rule.id}')" class="btn-secondary" style="padding: 6px 12px; font-size: 12px;">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button onclick="deleteAccessRule('${rule.id}')" class="btn-secondary" style="padding: 6px 12px; font-size: 12px; color: #f44336;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    
    console.log('📝 Generated HTML length:', html.length);
    container.innerHTML = html;
    console.log('✅ HTML set to container');
}

async function viewAccessRule(ruleId) {
    try {
        const response = await fetch(`http://127.0.0.1:5000/api/admin/access-rules/${ruleId}`);
        const rule = await response.json();
        
        // Get group names
        const groupsResponse = await fetch('http://127.0.0.1:5000/api/admin/groups');
        const groupsData = await groupsResponse.json();
        const allGroups = groupsData.groups || [];
        
        const groupNames = rule.groups.map(gid => {
            const group = allGroups.find(g => g.id === gid);
            return group ? group.name : gid;
        });
        
        showAccessRuleModal(rule, groupNames);
    } catch (error) {
        console.error('Error viewing rule:', error);
        alert('Failed to load rule details');
    }
}

function showAccessRuleModal(rule, groupNames) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    
    modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 20px; max-width: 600px; width: 90%; max-height: 85vh; overflow: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px;">
                <h3 style="margin: 0; color: var(--text-primary);"><i class="fas fa-shield-alt"></i> ${rule.name}</h3>
                <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">&times;</button>
            </div>
            
            <div style="margin-bottom: 20px;">
                <p style="color: var(--text-secondary); font-size: 13px; line-height: 1.6;">${rule.description}</p>
                <div style="margin-top: 10px; padding: 10px; background: var(--bg-secondary); border-radius: 6px; font-size: 12px;">
                    <div style="color: var(--text-secondary);"><i class="fas fa-user"></i> Created by: <strong style="color: var(--text-primary);">${rule.created_by || 'System'}</strong></div>
                    <div style="color: var(--text-secondary); margin-top: 4px;"><i class="fas fa-${rule.method === 'AI' ? 'robot' : 'code'}"></i> Method: <strong style="color: var(--text-primary);">${rule.method || 'AI'}</strong></div>
                    ${rule.created_at ? `<div style="color: var(--text-secondary); margin-top: 4px;"><i class="fas fa-clock"></i> Created: <strong style="color: var(--text-primary);">${new Date(rule.created_at).toLocaleString()}</strong></div>` : ''}
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0; font-size: 13px; color: var(--text-primary);">Affected Groups</h4>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${groupNames.map(name => `
                        <span style="background: #1976d2; color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 12px;">
                            <i class="fas fa-users"></i> ${name}
                        </span>
                    `).join('')}
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0; font-size: 13px; color: var(--text-primary);">Allowed Services</h4>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${rule.allowed_services.map(service => `
                        <span style="background: #2e7d32; color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 12px;">
                            <i class="fas fa-check"></i> ${service.toUpperCase()}
                        </span>
                    `).join('')}
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0; font-size: 13px; color: var(--text-primary);">Denied Services</h4>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${rule.denied_services.map(service => `
                        <span style="background: #d32f2f; color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 12px;">
                            <i class="fas fa-ban"></i> ${service.toUpperCase()}
                        </span>
                    `).join('')}
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="this.closest('div[style*=fixed]').remove()" class="btn-primary">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

async function deleteAccessRule(ruleId) {
    if (!confirm('Delete this access rule?')) return;
    
    try {
        const response = await fetch(`http://127.0.0.1:5000/api/admin/access-rules/${ruleId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.error) {
            alert('Error: ' + data.error);
            return;
        }
        
        alert('✅ Access rule deleted');
        loadAccessRules();
    } catch (error) {
        alert('Failed to delete rule: ' + error.message);
    }
}
