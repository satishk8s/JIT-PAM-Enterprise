// EC2 Instances Management

let selectedInstances = [];
let currentAccount = '';
let allInstancesData = [];

// Load accounts for dropdown and approved instances
async function loadInstances() {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/accounts');
        const accounts = await response.json();
        
        const accountSelect = document.getElementById('instanceAccountSelect');
        accountSelect.innerHTML = '<option value="">-- Select Account --</option>' + 
            Object.values(accounts).map(acc => 
                `<option value="${acc.id}">${acc.name} (${acc.id})</option>`
            ).join('');
        
        // Load approved instances
        refreshApprovedInstances();
            
    } catch (error) {
        console.error('Error loading accounts:', error);
    }
}

function refreshInstancesPage() {
    refreshApprovedInstances();
    loadInstancesByAccount();
}

// Load instances by selected account
async function loadInstancesByAccount() {
    const accountId = document.getElementById('instanceAccountSelect').value;
    
    if (!accountId) {
        document.getElementById('instancesTableBody').innerHTML = `
            <tr><td colspan="5" style="text-align: center; padding: 40px; color: #999;">
                Select an account to view instances
            </td></tr>`;
        document.getElementById('requestAccessBtn').disabled = true;
        return;
    }
    
    currentAccount = accountId;
    selectedInstances = [];
    document.getElementById('selectAllInstances').checked = false;
    
    try {
        const response = await fetch(`http://127.0.0.1:5000/api/instances?account_id=${accountId}`);
        const data = await response.json();
        
        allInstancesData = data.instances || [];
        renderInstances(allInstancesData);
            
    } catch (error) {
        console.error('Error loading instances:', error);
        document.getElementById('instancesTableBody').innerHTML = `
            <tr><td colspan="5" style="text-align: center; padding: 40px; color: #f44336;">
                Error loading instances: ${error.message}
            </td></tr>`;
    }
}

// Render instances table
function renderInstances(instances) {
    const tbody = document.getElementById('instancesTableBody');
    
    if (instances.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="5" style="text-align: center; padding: 40px; color: #999;">
                No instances found in this account
            </td></tr>`;
        return;
    }
    
    tbody.innerHTML = instances.map(instance => {
        const stateColor = instance.state === 'running' ? '#28a745' : '#6c757d';
        
        return `
            <tr>
                <td><input type="checkbox" value="${instance.id}" data-name="${instance.name || 'No name'}" data-ip="${instance.private_ip || 'N/A'}" data-public-ip="${instance.public_ip || ''}" onchange="toggleInstanceSelection()"></td>
                <td><code style="font-size: 12px;">${instance.id}</code></td>
                <td>${instance.name || '-'}</td>
                <td>${instance.private_ip || 'N/A'}</td>
                <td><span style="color: ${stateColor}; font-weight: 600;">●</span> ${instance.state}</td>
            </tr>
        `;
    }).join('');
}

// Toggle select all
function toggleSelectAll() {
    const selectAll = document.getElementById('selectAllInstances').checked;
    document.querySelectorAll('#instancesTableBody input[type="checkbox"]').forEach(cb => {
        cb.checked = selectAll;
    });
    toggleInstanceSelection();
}

// Toggle instance selection
function toggleInstanceSelection() {
    const checkboxes = document.querySelectorAll('#instancesTableBody input[type="checkbox"]:checked');
    selectedInstances = Array.from(checkboxes).map(cb => ({
        id: cb.value,
        name: cb.getAttribute('data-name'),
        private_ip: cb.getAttribute('data-ip'),
        public_ip: cb.getAttribute('data-public-ip')
    }));
    
    document.getElementById('requestAccessBtn').disabled = selectedInstances.length === 0;
}

// Filter by state
function filterByState() {
    const stateFilter = document.getElementById('instanceStateFilter').value;
    
    if (!stateFilter) {
        renderInstances(allInstancesData);
        return;
    }
    
    const filtered = allInstancesData.filter(i => i.state === stateFilter);
    renderInstances(filtered);
}

// Show instance access request modal
function showInstanceAccessModal() {
    if (selectedInstances.length === 0) {
        alert('Please select at least one instance');
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';

    modal.innerHTML = `
        <div class="modal show" style="max-width: 550px; background: var(--bg-primary, white); color: var(--text-primary, #333); display: block;">
            <div class="modal-header">
                <h3><i class="fas fa-server"></i> Request EC2 Access</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>
            <div class="modal-body" style="padding: 20px;">
                <div class="form-group">
                    <label>Request For</label>
                    <select id="requestFor" onchange="toggleRequestForOthers()" style="width: 100%; padding: 8px; background: var(--bg-primary, white); color: var(--text-primary, #333); border: 1px solid var(--border-color, #ddd); border-radius: 4px;">
                        <option value="myself">Myself</option>
                        <option value="others">Others</option>
                    </select>
                </div>
                
                <div class="form-group" id="userEmailGroup">
                    <label>User Email</label>
                    <input type="email" id="userEmail" value="satish.korra@nykaa.com" readonly style="width: 100%; padding: 8px; background: var(--bg-secondary, #f5f5f5); color: var(--text-primary, #333); border: 1px solid var(--border-color, #ddd); border-radius: 4px;">
                </div>
                
                <div class="form-group" id="othersEmailGroup" style="display: none;">
                    <label>User Email(s)</label>
                    <input type="text" id="othersEmail" placeholder="user@nykaa.com" style="width: 100%; padding: 8px; background: var(--bg-primary, white); color: var(--text-primary, #333); border: 1px solid var(--border-color, #ddd); border-radius: 4px;">
                    <small style="color: #666; font-size: 11px;">Comma-separated for multiple users</small>
                </div>
                
                <div class="form-group">
                    <label>Selected Instances</label>
                    <div style="background: var(--bg-secondary, #f8f9fa); padding: 10px; border-radius: 4px; font-size: 12px; max-height: 100px; overflow-y: auto; color: var(--text-primary, #333);">
                        ${selectedInstances.map(i => `<div>• ${i.id} - ${i.name}</div>`).join('')}
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Duration *</label>
                    <select id="instanceDuration" style="width: 100%; padding: 8px; background: var(--bg-primary, white); color: var(--text-primary, #333); border: 1px solid var(--border-color, #ddd); border-radius: 4px;">
                        <option value="1">1 hour</option>
                        <option value="2" selected>2 hours</option>
                        <option value="4">4 hours</option>
                        <option value="8">8 hours</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label style="display: flex; align-items: center; justify-content: space-between;">
                        <span>Sudo Access</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="sudoAccess">
                            <span class="toggle-slider"></span>
                        </label>
                    </label>
                    <small style="color: #666; font-size: 11px;">Requires Security Lead approval</small>
                </div>
                
                <div class="form-group">
                    <label>Business Justification *</label>
                    <textarea id="instanceJustification" rows="3" style="width: 100%; padding: 8px; background: var(--bg-primary, white); color: var(--text-primary, #333); border: 1px solid var(--border-color, #ddd); border-radius: 4px;" placeholder="Explain why you need access..."></textarea>
                </div>
                
                <div class="modal-actions">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                    <button class="btn-primary" onclick="submitInstanceAccessRequest()">Submit Request</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// Toggle request for others
function toggleRequestForOthers() {
    const requestFor = document.getElementById('requestFor').value;
    if (requestFor === 'myself') {
        document.getElementById('userEmailGroup').style.display = 'block';
        document.getElementById('othersEmailGroup').style.display = 'none';
    } else {
        document.getElementById('userEmailGroup').style.display = 'none';
        document.getElementById('othersEmailGroup').style.display = 'block';
    }
}

// Submit instance access request
async function submitInstanceAccessRequest() {
    const requestFor = document.getElementById('requestFor').value;
    let userEmail = requestFor === 'myself' ? 
        (localStorage.getItem('userEmail') || 'satish@nykaa.com') : 
        document.getElementById('othersEmail').value;
    
    // Ensure email is never empty
    if (!userEmail || userEmail.trim() === '') {
        userEmail = 'satish@nykaa.com';
    }
    const duration = document.getElementById('instanceDuration').value;
    const sudoAccess = document.getElementById('sudoAccess').checked;
    const justification = document.getElementById('instanceJustification').value;
    
    if (!justification) {
        alert('Please provide justification');
        return;
    }
    
    if (requestFor === 'others' && !userEmail) {
        alert('Please provide user email');
        return;
    }
    
    try {
        const response = await fetch('http://127.0.0.1:5000/api/instances/request-access', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                instances: selectedInstances,
                account_id: currentAccount,
                user_email: userEmail,
                request_for: requestFor,
                duration_hours: parseInt(duration),
                sudo_access: sudoAccess,
                justification: justification
            })
        });
        
        const data = await response.json();
        
        // Close modal first
        const modal = document.querySelector('.modal-overlay');
        if (modal) modal.remove();
        
        // Then show message and refresh terminal if approved
        setTimeout(() => {
            if (data.status === 'pending') {
                alert(`⏳ Access request submitted!\n\nRequest ID: ${data.request_id}\n\nStatus: Pending Approval\n\n` + 
                      (sudoAccess ? 'Sudo access requires Manager + Security Lead approval' : 'Requires Manager approval') + 
                      '\n\nCheck "My Requests" tab for status updates.');
            } else if (data.status === 'approved') {
                alert(`✅ Access approved!\n\nRequest ID: ${data.request_id}\n\nGo to Terminal tab to connect.`);
                // Refresh terminal tab
                if (typeof refreshApprovedInstances === 'function') {
                    refreshApprovedInstances();
                }
            } else {
                alert('❌ Access request failed');
            }
        }, 100);
        
    } catch (error) {
        const modal = document.querySelector('.modal-overlay');
        if (modal) modal.remove();
        setTimeout(() => {
            alert('❌ Failed to submit request: ' + error.message);
        }, 100);
    }
}

// Load approved instances for terminal
async function refreshApprovedInstances() {
    console.log('🔄 Refreshing approved instances...');
    try {
        const userEmail = localStorage.getItem('userEmail') || 'satish.korra@nykaa.com';
        const response = await fetch(`http://127.0.0.1:5000/api/instances/approved?user_email=${encodeURIComponent(userEmail)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ Approved instances response:', data);
        console.log('📊 Number of instances:', data.instances ? data.instances.length : 0);
        
        // Update ALL tables with this ID (both in Instances page and Terminal page)
        const tbodies = document.querySelectorAll('#approvedInstancesTableBody');
        
        if (tbodies.length === 0) {
            console.error('❌ approvedInstancesTableBody element not found!');
            return;
        }
        
        const htmlContent = (!data.instances || data.instances.length === 0) ? `
            <tr><td colspan="5" style="text-align: center; padding: 40px; color: #999;">
                No approved instances. Request access from Instances page.
            </td></tr>` : 
            data.instances.map(inst => `
            <tr>
                <td><code style="font-size: 12px;">${inst.instance_id}</code></td>
                <td>${inst.instance_name || '-'}</td>
                <td>${inst.private_ip || 'N/A'}</td>
                <td>${new Date(inst.expires_at).toLocaleString()}</td>
                <td>
                    <button class="btn-primary btn-sm" onclick="connectToTerminal('${inst.instance_id}', '${inst.instance_name}', '${inst.public_ip || inst.private_ip}')">
                        <i class="fas fa-terminal"></i> Connect
                    </button>
                </td>
            </tr>
        `).join('');
        
        // Update all tables
        tbodies.forEach(tbody => {
            tbody.innerHTML = htmlContent;
        });
        
        console.log(`✅ Updated ${tbodies.length} table(s) with ${data.instances ? data.instances.length : 0} approved instances`);
        
    } catch (error) {
        console.error('❌ Error loading approved instances:', error);
        const isNetworkError = error.message === 'Failed to fetch' || error.name === 'TypeError';
        const msg = isNetworkError
            ? 'Backend not running. Start the backend (e.g. python app.py) and refresh.'
            : `Error: ${error.message}`;
        const tbodies = document.querySelectorAll('#approvedInstancesTableBody');
        tbodies.forEach(tbody => {
            tbody.innerHTML = `
                <tr><td colspan="5" style="text-align: center; padding: 40px; color: #f44336;">
                    ${msg}
                </td></tr>`;
        });
    }
}

// Connect to terminal
function connectToTerminal(instanceId, instanceName, privateIp) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.innerHTML = `
        <div class="modal show" style="max-width: 500px; background: var(--bg-primary, white); color: var(--text-primary, #333);">
            <div class="modal-header">
                <h3><i class="fas fa-terminal"></i> Connect to ${instanceName || instanceId}</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>
            <div class="modal-body" style="padding: 20px;">
                <p style="margin-bottom: 20px; color: var(--text-secondary);">Choose connection method:</p>
                
                <button class="btn-primary" style="width: 100%; margin-bottom: 15px; padding: 15px;" 
                    onclick="connectViaSSM('${instanceId}'); this.closest('.modal-overlay').remove();">
                    <i class="fas fa-aws" style="margin-right: 8px;"></i>
                    AWS Session Manager
                    <div style="font-size: 12px; margin-top: 5px; opacity: 0.8;">Opens in AWS Console</div>
                </button>
                
                <button class="btn-secondary" style="width: 100%; padding: 15px;" 
                    onclick="showSSHCredentialsModal('${instanceId}', '${instanceName}', '${privateIp}'); this.closest('.modal-overlay').remove();">
                    <i class="fas fa-terminal" style="margin-right: 8px;"></i>
                    SSH Terminal
                    <div style="font-size: 12px; margin-top: 5px; opacity: 0.8;">Browser-based SSH with credentials</div>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function showSSHCredentialsModal(instanceId, instanceName, privateIp) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.innerHTML = `
        <div class="modal show" style="max-width: 450px; background: var(--bg-primary, white); color: var(--text-primary, #333);">
            <div class="modal-header">
                <h3><i class="fas fa-key"></i> SSH Credentials</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>
            <div class="modal-body" style="padding: 20px;">
                <div style="background: var(--bg-secondary, #f5f5f5); padding: 12px; border-radius: 4px; margin-bottom: 20px;">
                    <div style="font-size: 12px; color: var(--text-secondary, #666);">Connecting to:</div>
                    <div style="font-weight: 600; margin-top: 4px;">${instanceName || instanceId}</div>
                    <div style="font-size: 12px; color: var(--text-secondary, #666); margin-top: 2px;">${privateIp}</div>
                </div>
                
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" id="sshUsername" placeholder="Enter username" 
                        style="width: 100%; padding: 10px; background: var(--bg-primary, white); color: var(--text-primary, #333); border: 1px solid var(--border-color, #ddd); border-radius: 4px;">
                </div>
                
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" id="sshPassword" placeholder="Enter password" 
                        style="width: 100%; padding: 10px; background: var(--bg-primary, white); color: var(--text-primary, #333); border: 1px solid var(--border-color, #ddd); border-radius: 4px;">
                </div>
                
                <div class="modal-actions" style="margin-top: 20px;">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                    <button class="btn-primary" onclick="connectInstanceWithCredentials('${instanceId}', '${instanceName}', '${privateIp}')">
                        <i class="fas fa-sign-in-alt"></i> Connect
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    // Focus username field
    setTimeout(() => document.getElementById('sshUsername').focus(), 100);
}

function connectInstanceWithCredentials(instanceId, instanceName, privateIp) {
    const username = document.getElementById('sshUsername').value;
    const password = document.getElementById('sshPassword').value;
    
    if (!username || !password) {
        alert('Please enter both username and password');
        return;
    }
    
    // Close credentials modal
    document.querySelector('.modal-overlay').remove();
    
    // Show terminal with credentials
    showEmbeddedTerminal(instanceId, instanceName, privateIp, username, password);
}

function connectViaSSM(instanceId) {
    window.open(`https://ap-south-1.console.aws.amazon.com/systems-manager/session-manager/${instanceId}?region=ap-south-1`, '_blank');
}

let terminalInstance = null;
let terminalSocket = null;
let commandBuffer = '';

function showEmbeddedTerminal(instanceId, instanceName, privateIp, username, password) {
    // Scroll to terminal section
    const terminalSection = document.getElementById('embeddedTerminalSection');
    if (!terminalSection) {
        // Create terminal section if it doesn't exist
        const section = document.createElement('div');
        section.id = 'embeddedTerminalSection';
        section.style.cssText = 'margin-top: 30px; padding: 20px; background: var(--bg-secondary); border-radius: 8px;';
        document.querySelector('#instancesPage .instances-container').appendChild(section);
    }
    
    showSSHTerminal(instanceId, instanceName, privateIp, username, password);
    document.getElementById('embeddedTerminalSection').scrollIntoView({ behavior: 'smooth' });
}

function showSSHTerminal(instanceId, instanceName, privateIp, username, password) {
    let terminalContainer = document.getElementById('embeddedTerminalSection');
    if (!terminalContainer) {
        terminalContainer = document.getElementById('terminalContainer');
    }
    terminalContainer.innerHTML = `
        <div style="background: #1e1e1e; border-radius: 6px; padding: 15px;">
            <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #444; color: #fff;">
                <strong>SSH Terminal:</strong> ${username}@${instanceName || instanceId} (${privateIp})
                <button onclick="disconnectTerminal()" style="float: right; background: #d32f2f; color: white; border: none; padding: 5px 15px; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-times"></i> Disconnect
                </button>
            </div>
            <div id="xterm-container" style="height: 500px;"></div>
        </div>
    `;
    
    commandBuffer = '';
    
    // Initialize xterm.js
    terminalInstance = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
            background: '#000000',
            foreground: '#ffffff'
        }
    });
    
    const fitAddon = new FitAddon.FitAddon();
    terminalInstance.loadAddon(fitAddon);
    terminalInstance.open(document.getElementById('xterm-container'));
    fitAddon.fit();
    
    // Connect WebSocket with credentials
    const wsUrl = `ws://127.0.0.1:5001/?host=${encodeURIComponent(privateIp)}&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    terminalSocket = new WebSocket(wsUrl);
    
    terminalSocket.onopen = () => {
        terminalInstance.writeln('\x1b[32mConnecting to ' + instanceName + '...\x1b[0m');
    };
    
    terminalSocket.onmessage = (event) => {
        terminalInstance.write(event.data);
    };
    
    terminalSocket.onerror = (error) => {
        terminalInstance.writeln('\x1b[31mConnection error. Please check credentials.\x1b[0m');
    };
    
    terminalSocket.onclose = () => {
        terminalInstance.writeln('\x1b[33m\r\nConnection closed\x1b[0m');
    };
    
    // Send input directly to WebSocket
    terminalInstance.onData(data => {
        if (terminalSocket && terminalSocket.readyState === WebSocket.OPEN) {
            terminalSocket.send(data);
        }
    });
}

function disconnectTerminal() {
    if (terminalSocket) {
        terminalSocket.close();
        terminalSocket = null;
    }
    if (terminalInstance) {
        terminalInstance.dispose();
        terminalInstance = null;
    }
    const embeddedTerminal = document.getElementById('embeddedTerminalSection');
    const terminalContainer = document.getElementById('terminalContainer');
    if (embeddedTerminal) embeddedTerminal.innerHTML = '';
    if (terminalContainer) terminalContainer.innerHTML = '';
}
