/**
 * Organization Users & Groups Management
 */

// Show create group modal
function showCreateOrgGroupModal() {
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    
    modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 20px; max-width: 500px; width: 90%;">
            <h3 style="margin: 0 0 20px 0; color: var(--text-primary);">Create Organization Group</h3>
            <form id="createOrgGroupForm">
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; color: var(--text-primary);">Group Name *</label>
                    <input type="text" id="orgGroupName" required placeholder="e.g., Networking Team" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; color: var(--text-primary);">Description</label>
                    <textarea id="orgGroupDesc" rows="3" placeholder="Optional description" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);"></textarea>
                </div>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button type="button" onclick="this.closest('div[style*=fixed]').remove()" class="btn-secondary">Cancel</button>
                    <button type="submit" class="btn-primary">Create Group</button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('createOrgGroupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('orgGroupName').value;
        const description = document.getElementById('orgGroupDesc').value;
        
        try {
            const response = await fetch('http://127.0.0.1:5000/api/admin/groups', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({name, description})
            });
            
            const data = await response.json();
            
            if (data.error) {
                alert('Error: ' + data.error);
                return;
            }
            
            alert('✅ Group created: ' + name);
            modal.remove();
            loadOrgGroups();
        } catch (error) {
            alert('Failed to create group: ' + error.message);
        }
    });
}

// Show create user modal
function showCreateOrgUserModal() {
    // First load groups
    fetch('http://127.0.0.1:5000/api/admin/groups')
        .then(r => r.json())
        .then(data => {
            const groups = data.groups || [];
            
            const modal = document.createElement('div');
            modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;';
            
            modal.innerHTML = `
                <div style="background: var(--bg-primary); border-radius: 12px; padding: 20px; max-width: 500px; width: 90%;">
                    <h3 style="margin: 0 0 20px 0; color: var(--text-primary);">Create Organization User</h3>
                    <form id="createOrgUserForm">
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; color: var(--text-primary);">Name *</label>
                            <input type="text" id="orgUserName" required placeholder="e.g., John Doe" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
                        </div>
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; color: var(--text-primary);">Email *</label>
                            <input type="email" id="orgUserEmail" required placeholder="e.g., john.doe@company.com" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
                        </div>
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; color: var(--text-primary);">Group *</label>
                            <select id="orgUserGroup" required style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary);">
                                <option value="">Select Group</option>
                                ${groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
                            </select>
                        </div>
                        <div style="display: flex; gap: 10px; justify-content: flex-end;">
                            <button type="button" onclick="this.closest('div[style*=fixed]').remove()" class="btn-secondary">Cancel</button>
                            <button type="submit" class="btn-primary">Create User</button>
                        </div>
                    </form>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            document.getElementById('createOrgUserForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const name = document.getElementById('orgUserName').value;
                const email = document.getElementById('orgUserEmail').value;
                const group_id = document.getElementById('orgUserGroup').value;
                
                try {
                    const response = await fetch('http://127.0.0.1:5000/api/admin/org-users', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({name, email, group_id})
                    });
                    
                    const data = await response.json();
                    
                    if (data.error) {
                        alert('Error: ' + data.error);
                        return;
                    }
                    
                    alert('✅ User created: ' + name);
                    modal.remove();
                    loadOrgUsers();
                } catch (error) {
                    alert('Failed to create user: ' + error.message);
                }
            });
        });
}

// Load organization groups
async function loadOrgGroups() {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/admin/groups');
        const data = await response.json();
        
        const container = document.getElementById('orgGroupsList');
        if (!container) return;
        
        const groups = data.groups || [];
        
        if (groups.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); padding: 20px; text-align: center;">No groups created yet</p>';
            return;
        }
        
        container.innerHTML = groups.map(group => `
            <div style="padding: 15px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <h4 style="margin: 0 0 5px 0; color: var(--text-primary);">${group.name}</h4>
                        <p style="margin: 0; font-size: 12px; color: var(--text-secondary);">${group.description || 'No description'}</p>
                        <p style="margin: 5px 0 0 0; font-size: 11px; color: var(--text-secondary);">
                            <i class="fas fa-users"></i> ${group.members.length} member(s)
                        </p>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading groups:', error);
    }
}

// Load organization users
async function loadOrgUsers() {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/admin/org-users');
        const data = await response.json();
        
        const container = document.getElementById('orgUsersList');
        if (!container) return;
        
        const users = data.users || [];
        
        // Also load groups to show group names
        const groupsResponse = await fetch('http://127.0.0.1:5000/api/admin/groups');
        const groupsData = await groupsResponse.json();
        const groups = groupsData.groups || [];
        
        if (users.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); padding: 20px; text-align: center;">No users created yet</p>';
            return;
        }
        
        container.innerHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: var(--bg-secondary); border-bottom: 2px solid var(--border-color);">
                        <th style="padding: 10px; text-align: left; color: var(--text-primary);">Name</th>
                        <th style="padding: 10px; text-align: left; color: var(--text-primary);">Email</th>
                        <th style="padding: 10px; text-align: left; color: var(--text-primary);">Group</th>
                        <th style="padding: 10px; text-align: left; color: var(--text-primary);">Created</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(user => {
                        const group = groups.find(g => g.id === user.group_id);
                        const groupName = group ? group.name : user.group_id;
                        const createdDate = new Date(user.created_at).toLocaleDateString();
                        
                        return `
                            <tr style="border-bottom: 1px solid var(--border-color);">
                                <td style="padding: 10px; color: var(--text-primary);">${user.name}</td>
                                <td style="padding: 10px; color: var(--text-primary);">${user.email}</td>
                                <td style="padding: 10px; color: var(--text-primary);">${groupName}</td>
                                <td style="padding: 10px; color: var(--text-secondary); font-size: 12px;">${createdDate}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
        
    } catch (error) {
        console.error('Error loading users:', error);
    }
}
