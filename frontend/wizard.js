let selectedResources = {}; // {service: [{id, name}]}
let selectedService = '';
let selectedCloudProvider = '';
let availableServices = [];

// Load wizard state on page load
function loadWizardState() {
    const saved = localStorage.getItem('wizardState');
    if (saved) {
        try {
            const state = JSON.parse(saved);
            if (state.accountId) {
                const accountSelect = document.getElementById('requestAccount');
                if (accountSelect) accountSelect.value = state.accountId;
            }
            if (state.selectedResources) {
                selectedResources = state.selectedResources;
                updateSelectedResourcesPanel();
            }
        } catch (e) {
            console.error('Failed to load wizard state:', e);
        }
    }
}

// Save wizard state
function saveWizardState() {
    const accountId = document.getElementById('requestAccount')?.value;
    localStorage.setItem('wizardState', JSON.stringify({
        accountId: accountId,
        selectedResources: selectedResources,
        timestamp: Date.now()
    }));
}

// Clear wizard state
function clearWizardState() {
    localStorage.removeItem('wizardState');
    selectedResources = {};
    const accountSelect = document.getElementById('requestAccount');
    if (accountSelect) accountSelect.value = '';
    document.getElementById('requestStep1').style.display = 'block';
    document.getElementById('requestStep2AWS').style.display = 'none';
    document.getElementById('aiCopilotSection').style.display = 'none';
    updateSelectedResourcesPanel();
}

// Reset wizard when navigating away
function resetWizardOnNavigation() {
    clearWizardState();
    resetAIChat();
}
const wizardLicenseFeatures = {
    s3: true,
    terminal: true,
    database: false,
    container: false
};

function selectCloudProvider(provider) {
    selectedCloudProvider = provider;
    document.getElementById('requestStep1').style.display = 'none';
    
    if (provider === 'aws') {
        document.getElementById('requestStep2AWS').style.display = 'block';
        // Load accounts into dropdown
        loadAccountsDropdown();
    } else {
        alert(`${provider.toUpperCase()} integration coming soon!`);
        backToStep1();
    }
}

async function loadAccountsDropdown() {
    const accountSelect = document.getElementById('requestAccount');
    if (!accountSelect) return;
    
    try {
        const response = await fetch('http://127.0.0.1:5000/api/accounts');
        const accounts = await response.json();
        
        accountSelect.innerHTML = '<option value="">Select Account</option>' +
            Object.values(accounts).map(account => 
                `<option value="${account.id}">${account.name} (${account.id})</option>`
            ).join('');
    } catch (error) {
        console.error('Error loading accounts:', error);
        accountSelect.innerHTML = '<option value="">Error loading accounts</option>';
    }
}

function showAccessType(type) {
    const existingBtn = document.getElementById('existingPermSetBtn');
    const customBtn = document.getElementById('customAccessBtn');
    const existingSection = document.getElementById('existingPermSetSection');
    const resourceSection = document.getElementById('resourceExplorerSection');
    
    if (type === 'existing') {
        existingBtn.style.cssText = 'flex: 1; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none;';
        customBtn.style.cssText = 'flex: 1;';
        existingSection.style.display = 'block';
        resourceSection.style.display = 'none';
    } else {
        customBtn.style.cssText = 'flex: 1; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none;';
        existingBtn.style.cssText = 'flex: 1;';
        existingSection.style.display = 'none';
        resourceSection.style.display = 'block';
        fetchAWSResources();
    }
}

async function loadPermissionSetsDropdown() {
    const accountId = document.getElementById('requestAccount').value;
    if (!accountId) {
        document.getElementById('permissionSetsGroup').style.display = 'none';
        document.getElementById('regionSelectionGroup').style.display = 'none';
        document.getElementById('resourceExplorerSection').style.display = 'none';
        return;
    }
    
    document.getElementById('permissionSetsGroup').style.display = 'block';
    document.getElementById('regionSelectionGroup').style.display = 'block';
    showAccessType('custom');
    
    // Load regions for the account
    loadRegionsForAccount(accountId);
    
    try {
        const response = await fetch('http://127.0.0.1:5000/api/permission-sets');
        const permissionSets = await response.json();
        
        const select = document.getElementById('requestPermissionSet');
        select.innerHTML = '<option value="">Select a permission set</option>' +
            permissionSets.map(ps => 
                `<option value="${ps.arn}">${ps.name}</option>`
            ).join('');
    } catch (error) {
        console.error('Error loading permission sets:', error);
    }
}

let selectedRegion = 'ap-south-1';

async function loadRegionsForAccount(accountId) {
    const regionSelect = document.getElementById('regionSelect');
    if (!regionSelect) return;
    
    // Common AWS regions
    const regions = [
        { id: 'ap-south-1', name: 'Asia Pacific (Mumbai)' },
        { id: 'us-east-1', name: 'US East (N. Virginia)' },
        { id: 'us-west-2', name: 'US West (Oregon)' },
        { id: 'eu-west-1', name: 'Europe (Ireland)' },
        { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' }
    ];
    
    regionSelect.innerHTML = regions.map(r => 
        `<option value="${r.id}" ${r.id === 'ap-south-1' ? 'selected' : ''}>${r.name}</option>`
    ).join('');
    
    selectedRegion = 'ap-south-1';
}

function handleRegionChange() {
    selectedRegion = document.getElementById('regionSelect').value;
    console.log('Region changed to:', selectedRegion);
    // Clear resources when region changes
    selectedResources = {};
    updateSelectedResourcesPanel();
    document.getElementById('resourceExplorerSection').style.display = 'none';
}

function handlePermissionSetSelection() {
    const permissionSet = document.getElementById('requestPermissionSet').value;
    if (permissionSet) {
        document.getElementById('aiCopilotSection').style.display = 'none';
    }
}

function backToStep1() {
    if (window.currentCloudAccessPage) {
        showPage(window.currentCloudAccessPage);
        window.currentCloudAccessPage = null;
        return;
    }
    document.getElementById('requestStep1').style.display = 'block';
    document.getElementById('requestStep2AWS').style.display = 'none';
    selectedCloudProvider = '';
    clearWizardState();
}

async function fetchAWSResources() {
    const accountId = document.getElementById('requestAccount').value;
    const region = selectedRegion || 'ap-south-1';
    
    if (!accountId) {
        document.getElementById('resourceExplorerSection').style.display = 'none';
        return;
    }
    
    document.getElementById('resourceExplorerSection').style.display = 'block';
    document.getElementById('resourceExplorerLoading').style.display = 'block';
    document.getElementById('awsServicesList').style.display = 'none';
    
    try {
        // Call discover-services API to get real services from account
        const response = await fetch(`http://127.0.0.1:5000/api/discover-services?account_id=${accountId}`);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Map discovered services with license features
        availableServices = data.services.map(service => ({
            id: service.id,
            name: service.name,
            icon: getServiceIcon(service.id),
            licensed: isServiceLicensed(service.id)
        }));
        
        console.log(`✅ Discovered ${availableServices.length} services with resources`);
        displayAWSServices();
    } catch (error) {
        console.error('Error discovering services:', error);
        alert('Failed to discover AWS services: ' + error.message);
    } finally {
        document.getElementById('resourceExplorerLoading').style.display = 'none';
    }
}

function getServiceIcon(serviceId) {
    const iconMap = {
        'ec2': 'server',
        's3': 'hdd',
        'rds': 'database',
        'lambda': 'bolt',
        'dynamodb': 'table',
        'ecs': 'cube',
        'eks': 'dharmachakra',
        'secretsmanager': 'key',
        'logs': 'chart-line',
        'elasticloadbalancing': 'balance-scale',
        'sns': 'bell',
        'sqs': 'envelope',
        'kms': 'lock',
        'iam': 'user-shield',
        'cloudfront': 'globe',
        'apigateway': 'door-open'
    };
    return iconMap[serviceId] || 'cube';
}

function isServiceLicensed(serviceId) {
    const licensedMap = {
        'ec2': wizardLicenseFeatures.terminal,
        's3': wizardLicenseFeatures.s3,
        'rds': wizardLicenseFeatures.database,
        'ecs': wizardLicenseFeatures.container,
        'eks': wizardLicenseFeatures.container
    };
    return licensedMap[serviceId] !== undefined ? licensedMap[serviceId] : true;
}

function displayAWSServices() {
    const servicesList = document.getElementById('awsServicesList');
    servicesList.innerHTML = availableServices.map(service => {
        const accessNote = getServiceAccessNote(service);
        return `
            <div class="service-checkbox-card" id="service-${service.id}">
                <input type="checkbox" id="check-${service.id}" onchange="handleServiceCheck('${service.id}')">
                <label for="check-${service.id}">
                    <i class="fas fa-${service.icon}"></i> ${service.name}
                    ${accessNote ? `<br><small style="color: var(--text-secondary); font-size: 11px;">${accessNote}</small>` : ''}
                </label>
            </div>
        `;
    }).join('');
    servicesList.style.display = 'grid';
}

function getServiceAccessNote(service) {
    if (service.id === 's3' && service.licensed) {
        return '✓ S3 Explorer or Console';
    } else if (service.id === 'ec2' && service.licensed) {
        return '✓ Terminal or Session Manager';
    } else if (service.id === 'rds' && service.licensed) {
        return '✓ Database Tool or Console';
    } else if (service.id === 'ecs' && service.licensed) {
        return '✓ Container Access or Console';
    } else if (!service.licensed) {
        return '⚠ Console access only';
    }
    return '';
}

function toggleServiceSelection(serviceId) {
    const checkbox = document.getElementById(`check-${serviceId}`);
    checkbox.checked = !checkbox.checked;
    handleServiceCheck(serviceId);
}

function handleServiceCheck(serviceId) {
    const checkbox = document.getElementById(`check-${serviceId}`);
    const card = document.getElementById(`service-${serviceId}`);
    
    if (checkbox.checked) {
        card.classList.add('selected');
        loadResourcesForService(serviceId);
    } else {
        card.classList.remove('selected');
        delete selectedResources[serviceId];
        updateMyResourcesDisplay();
        updateSelectedResourcesPanel();
    }
}

async function loadResourcesForService(serviceId) {
    const accountId = document.getElementById('requestAccount').value;
    document.getElementById('myResourcesSection').style.display = 'block';
    
    try {
        const response = await fetch(`http://127.0.0.1:5000/api/resources/${serviceId}?account_id=${accountId}`);
        const data = await response.json();
        
        if (data.resources && data.resources.length > 0) {
            if (!selectedResources[serviceId]) {
                selectedResources[serviceId] = [];
            }
            // Store resources for this service
            window.serviceResources = window.serviceResources || {};
            window.serviceResources[serviceId] = data.resources;
            updateMyResourcesDisplay();
        }
    } catch (error) {
        console.error('Error loading resources:', error);
    }
}

function updateMyResourcesDisplay() {
    const myResourcesList = document.getElementById('myResourcesList');
    const selectedServices = Object.keys(selectedResources);
    
    if (selectedServices.length === 0) {
        myResourcesList.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px;">Select services to view resources</p>';
        document.getElementById('myResourcesSection').style.display = 'none';
        return;
    }
    
    document.getElementById('myResourcesSection').style.display = 'block';
    
    myResourcesList.innerHTML = selectedServices.map(serviceId => {
        const service = availableServices.find(s => s.id === serviceId);
        const resources = window.serviceResources?.[serviceId] || [];
        const selectedIds = selectedResources[serviceId].map(r => r.id);
        
        return `
            <div style="margin-bottom: 15px;">
                <strong style="font-size: 13px; color: #667eea; font-family: 'Inter', sans-serif;">
                    <i class="fas fa-${service.icon}"></i> ${service.name}
                </strong>
                <div style="margin-top: 8px; padding-left: 10px;">
                    ${resources.map((resource, idx) => `
                        <label style="display: block; font-size: 12px; color: var(--text-secondary); cursor: pointer; margin-bottom: 4px;">
                            <input type="checkbox" id="res_${serviceId}_${idx}" ${selectedIds.includes(resource.id) ? 'checked' : ''} onchange="toggleSingleResource('${serviceId}', '${resource.id}', '${resource.name.replace(/'/g, "\\'")}')"; event.stopPropagation();" style="margin-right: 6px;">
                            ${resource.name} ${resource.type ? `(${resource.type})` : ''} ${resource.state ? `- ${resource.state}` : ''}
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
    
    updateSelectedResourcesPanel();
}

function toggleSingleResource(serviceId, resourceId, resourceName) {
    if (!selectedResources[serviceId]) {
        selectedResources[serviceId] = [];
    }
    
    const index = selectedResources[serviceId].findIndex(r => r.id === resourceId);
    if (index > -1) {
        selectedResources[serviceId].splice(index, 1);
        if (selectedResources[serviceId].length === 0) {
            delete selectedResources[serviceId];
            const serviceCheckbox = document.getElementById(`check-${serviceId}`);
            if (serviceCheckbox) serviceCheckbox.checked = false;
            const serviceCard = document.getElementById(`service-${serviceId}`);
            if (serviceCard) serviceCard.classList.remove('selected');
        }
    } else {
        selectedResources[serviceId].push({ id: resourceId, name: resourceName });
    }
    
    updateSelectedResourcesPanel();
}

async function loadServiceResources() {
    const service = document.getElementById('awsServiceSelect').value;
    const accountId = document.getElementById('requestAccount').value;
    
    if (!service) {
        document.getElementById('resourcesGroup').style.display = 'none';
        return;
    }
    
    if (!accountId) {
        alert('Please select an account first');
        return;
    }
    
    selectedService = service;
    document.getElementById('resourcesGroup').style.display = 'block';
    const resourcesList = document.getElementById('resourcesList');
    resourcesList.innerHTML = '<p style="color: #999; font-size: 13px;">Loading resources...</p>';
    
    try {
        const url = `http://127.0.0.1:5000/api/resources/${service}?account_id=${accountId}`;
        console.log('Fetching:', url);
        const response = await fetch(url);
        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.resources && data.resources.length > 0) {
            const currentSelections = selectedResources[service] || [];
            const selectedIds = currentSelections.map(r => r.id);
            
            resourcesList.innerHTML = data.resources.map(resource => {
                const isChecked = selectedIds.includes(resource.id) ? 'checked' : '';
                return `
                    <label style="display: block; padding: 2px 0; cursor: pointer; font-size: 13px;">
                        <input type="checkbox" value="${resource.id}" data-name="${resource.name || 'No name'}" onchange="toggleResourceSelection()" ${isChecked} style="margin-right: 8px;">
                        <span style="color: #666;">${resource.id}</span> <span style="color: #999;">- ${resource.name || 'No name'}</span>
                    </label>
                `;
            }).join('');
        } else {
            resourcesList.innerHTML = '<p style="color: #999; font-size: 13px;">No resources found</p>';
        }
    } catch (error) {
        resourcesList.innerHTML = `<p style="color: #f44336; font-size: 13px;">Error: ${error.message}</p>`;
        console.error('Error loading resources:', error);
    }
}

function toggleResourceSelection() {
    const checkboxes = document.querySelectorAll('#resourcesList input[type="checkbox"]:checked');
    const currentServiceResources = Array.from(checkboxes).map(cb => ({
        id: cb.value,
        name: cb.getAttribute('data-name')
    }));
    
    if (currentServiceResources.length > 0) {
        selectedResources[selectedService] = currentServiceResources;
    } else {
        delete selectedResources[selectedService];
    }
    
    updateSelectedResourcesPanel();
    
    const totalSelected = Object.values(selectedResources).reduce((sum, arr) => sum + arr.length, 0);
    document.getElementById('selectResourcesBtn').disabled = totalSelected === 0;
}

function updateSelectedResourcesPanel() {
    const panel = document.getElementById('selectedResourcesPanel');
    if (!panel) return;
    
    const services = Object.keys(selectedResources);
    if (services.length === 0) {
        panel.innerHTML = '<p style="color: #999; font-size: 12px;">No resources selected</p>';
        // Hide AI Copilot
        const aiSection = document.getElementById('aiCopilotSection');
        if (aiSection) aiSection.style.display = 'none';
        return;
    }
    
    // Show AI Copilot when resources are selected
    const aiSection = document.getElementById('aiCopilotSection');
    if (aiSection) aiSection.style.display = 'block';
    
    panel.innerHTML = services.map(service => {
        const resources = selectedResources[service];
        return `
            <div style="margin-bottom: 12px;">
                <strong style="font-size: 12px; color: #4A90E2; text-transform: uppercase;">${service}</strong>
                ${resources.map(r => `
                    <div style="font-size: 11px; color: #666; padding: 2px 0 2px 12px;">
                        • ${r.id} ${r.name !== 'No name' ? '(' + r.name + ')' : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');
}

function showTagsModal() {
    const tag = prompt('Add tag (format: key=value)\nExample: user=email@example.com', 'user=');
    if (tag !== null) {
        showAIModal(tag);
    }
}

function showAIModal(tag) {
    const actions = prompt('What do you need to perform on these resources?\nExample: start, stop, read logs, connect via SSH');
    if (actions) {
        generatePermissions(tag, actions);
    }
}

let currentConversationId = null;
let aiUnderstanding = null;
let chatExpiryTimer = null;

async function chatWithAI() {
    const useCase = document.getElementById('aiCopilotUseCase').value;
    const accountId = document.getElementById('requestAccount').value;
    
    if (!accountId) {
        alert('Please select an account first');
        return;
    }
    
    const selectedServices = Object.keys(selectedResources);
    if (selectedServices.length === 0) {
        alert('Please select at least one service');
        return;
    }
    
    if (!useCase.trim()) {
        alert('Please describe what you want to do');
        return;
    }
    
    let fullUseCase = useCase;
    
    const chatBtn = document.getElementById('chatWithAIBtn');
    chatBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI thinking...';
    chatBtn.disabled = true;
    
    try {
        const userEmail = localStorage.getItem('currentUserEmail') || 'satish.korra@nykaa.com';
        const response = await fetch('http://127.0.0.1:5000/api/generate-permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                use_case: fullUseCase,
                account_id: accountId,
                region: selectedRegion || 'ap-south-1',
                conversation_id: currentConversationId,
                user_email: userEmail,
                selected_resources: selectedResources
            })
        });
        
        const data = await response.json();
        console.log('Parsed data:', data);
        console.log('Question:', data.question);
        console.log('Grouped actions:', data.grouped_actions);
        
        // Update actions preview - INLINE VERSION
        if (data.grouped_actions) {
            console.log('✅ Showing actions preview');
            const previewDiv = document.getElementById('aiPermissionsPreview');
            if (previewDiv) {
                const isReview = data.ready && data.question && data.question.toLowerCase().includes('review');
                let html = `<h4 style="margin-top: 0; color: #00a1c9;">${isReview ? '📋 Policy Review' : '⚡ Building Policy...'}</h4>`;
                
                if (isReview) {
                    html += `<div style="background: rgba(255,193,7,0.1); border-left: 3px solid #ffc107; padding: 8px 10px; margin-bottom: 15px; border-radius: 3px; font-size: 12px; color: #ffc107;">Review the actions below. Reply 'approve' to generate.</div>`;
                }
                
                const actionExplanations = {
                    'DescribeInstances': 'View instance details and status',
                    'CreateImage': 'Create AMI (Amazon Machine Image) from instance',
                    'DescribeVolumes': 'View EBS volume details',
                    'CreateSnapshot': 'Create snapshot backup from volume',
                    'DescribeSnapshots': 'View snapshot details',
                    'CreateVolume': 'Create new EBS volume',
                    'StartInstances': 'Start stopped instances',
                    'StopInstances': 'Stop running instances',
                    'TerminateInstances': 'Permanently delete instances',
                    'DeleteSnapshot': 'Delete snapshot',
                    'DeleteVolume': 'Delete EBS volume'
                };
                
                let totalActions = 0;
                for (const [service, serviceData] of Object.entries(data.grouped_actions)) {
                    const actions = serviceData.actions || [];
                    const resources = serviceData.resources || [];
                    totalActions += actions.length;
                    html += `<div style="margin-bottom: 15px;"><div style="color: #888; font-size: 12px; margin-bottom: 5px; font-weight: 600;">${service.toUpperCase()} (${actions.length})</div>`;
                    actions.forEach(action => {
                        const actionName = action.split(':')[1];
                        const explanation = actionExplanations[actionName] || 'AWS action';
                        const isDestructive = ['Delete', 'Terminate'].some(w => actionName.includes(w));
                        const isCreate = ['Create', 'Run'].some(w => actionName.includes(w));
                        const borderColor = isDestructive ? '#ff5252' : isCreate ? '#4caf50' : '#00a1c9';
                        html += `<div style="padding: 8px 12px; background: rgba(0,161,201,0.05); border-left: 3px solid ${borderColor}; margin-bottom: 6px; border-radius: 3px;">`;
                        html += `<div style="color: #fff; font-size: 13px; font-weight: 500;">${action}</div>`;
                        html += `<div style="color: #aaa; font-size: 11px; margin-top: 3px;">${explanation}</div>`;
                        html += `</div>`;
                    });
                    if (resources.length > 0) {
                        html += `<div style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px; font-size: 10px; color: #888;"><strong>Resources:</strong><br>${resources.map(r => r.replace('arn:aws:', '')).join('<br>')}</div>`;
                    }
                    html += `</div>`;
                }
                html += `<div style="margin-top: 15px; padding: 10px; background: rgba(0,161,201,0.1); border-radius: 5px; text-align: center; font-size: 12px; color: #00a1c9;">Total: ${totalActions} actions</div>`;
                
                // ALWAYS store when grouped_actions exists
                window.currentAIPermissions = data;
                
                if (data.ready) {
                    html += `<button onclick="showFullPolicyModal()" style="width: 100%; margin-top: 10px; padding: 10px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;"><i class="fas fa-file-code"></i> View Full Policy JSON</button>`;
                }
                
                previewDiv.innerHTML = html;
                previewDiv.style.display = 'block';
            } else {
                console.error('❌ aiPermissionsPreview div not found');
            }
        }
        
        if (data.redirect_to_terminal) {
            const message = data.message || 'Please use Instances page for terminal access';
            conversationHistory.push({user: useCase, ai: message});
            
            const chatArea = document.getElementById('aiChatArea');
            chatArea.innerHTML += `
                <div style="margin-bottom: 12px; display: flex; justify-content: flex-end;">
                    <div style="max-width: 70%; padding: 10px 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px 12px 4px 12px; font-size: 13px;">${useCase}</div>
                </div>
                <div style="margin-bottom: 12px; display: flex; justify-content: flex-start;">
                    <div style="max-width: 70%; padding: 10px 14px; background: #ff9800; color: white; border-radius: 12px 12px 12px 4px; font-size: 13px;">
                        ${message}
                        <button onclick="showPage('instances')" style="margin-top: 10px; padding: 8px 16px; background: white; color: #ff9800; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; width: 100%;">
                            <i class="fas fa-server"></i> Go to Instances Page
                        </button>
                    </div>
                </div>
            `;
            chatArea.style.display = 'block';
            document.getElementById('aiCopilotUseCase').value = '';
            return;
        }
        
        if (data.needs_clarification) {
            const question = data.question || 'Please provide more details';
            conversationHistory.push({user: useCase, ai: question});
            currentConversationId = data.conversation_id;
            startChatExpiryTimer();
            
            const chatArea = document.getElementById('aiChatArea');
            chatArea.innerHTML += `
                <div style="margin-bottom: 12px; display: flex; justify-content: flex-end;">
                    <div style="max-width: 70%; padding: 10px 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px 12px 4px 12px; font-size: 13px;">${useCase}</div>
                </div>
                <div style="margin-bottom: 12px; display: flex; justify-content: flex-start;">
                    <div style="max-width: 70%; padding: 10px 14px; background: var(--bg-secondary); color: var(--text-primary); border-radius: 12px 12px 12px 4px; font-size: 13px; border: 1px solid var(--border-color);">${question}</div>
                </div>
            `;
            chatArea.style.display = 'block';
            document.getElementById('aiCopilotUseCase').value = '';
            document.getElementById('aiCopilotUseCase').placeholder = 'Type your answer or click "Create Policy" below...';
            document.getElementById('createPolicyBtn').style.display = 'block';
        } else if (data.error) {
            conversationHistory.push({user: useCase, ai: data.error});
            currentConversationId = null;
            const chatArea = document.getElementById('aiChatArea');
            chatArea.innerHTML += `
                <div style="margin-bottom: 12px; display: flex; justify-content: flex-end;">
                    <div style="max-width: 70%; padding: 10px 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px 12px 4px 12px; font-size: 13px;">${useCase}</div>
                </div>
                <div style="margin-bottom: 12px; display: flex; justify-content: flex-start;">
                    <div style="max-width: 70%; padding: 10px 14px; background: #f44336; color: white; border-radius: 12px 12px 12px 4px; font-size: 13px;">${data.error}</div>
                </div>
            `;
            chatArea.style.display = 'block';
            alert('Error: ' + data.error);
        } else if (data.actions) {
            conversationHistory.push({user: useCase, ai: data.description});
            clearTimeout(chatExpiryTimer);
            console.log('Backend response:', data);
            console.log('Resources from backend:', data.resources);
            aiUnderstanding = data;
            
            const chatArea = document.getElementById('aiChatArea');
            chatArea.innerHTML += `
                <div style="margin-bottom: 12px; display: flex; justify-content: flex-end;">
                    <div style="max-width: 70%; padding: 10px 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px 12px 4px 12px; font-size: 13px;">${useCase}</div>
                </div>
                <div style="margin-bottom: 12px; display: flex; justify-content: flex-start;">
                    <div style="max-width: 70%; padding: 10px 14px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; border-radius: 12px 12px 12px 4px; font-size: 13px;">✅ Got it! I'll generate ${data.description}</div>
                </div>
            `;
            
            // Show permissions preview in right panel
            const previewPanel = document.getElementById('selectedResourcesPanel');
            if (previewPanel) {
                previewPanel.innerHTML = `
                    <div style="background: var(--bg-secondary); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                        <strong style="font-size: 13px; color: #11998e; display: block; margin-bottom: 8px;">📋 AI Generated Permissions</strong>
                        <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">${data.description}</div>
                        <div style="background: var(--bg-primary); border-radius: 6px; padding: 10px; max-height: 200px; overflow-y: auto;">
                            ${data.actions.map(action => `<div style="font-size: 11px; color: var(--text-primary); padding: 2px 0;">• ${action}</div>`).join('')}
                        </div>
                        <div style="margin-top: 8px; font-size: 11px; color: var(--text-secondary); font-style: italic;">💬 Review and continue chat to add/modify</div>
                    </div>
                `;
            }
            
            // Show chat area
            chatArea.style.display = 'block';
            
            // Show generate button but keep chat active
            document.getElementById('generatePermissionsBtn').style.display = 'inline-block';
            document.getElementById('aiCopilotUseCase').value = '';
            document.getElementById('aiCopilotUseCase').placeholder = 'Add more services or continue chat...';
        }
    } catch (error) {
        console.error('Error:', error);
        const chatArea = document.getElementById('aiChatArea');
        chatArea.innerHTML += `
            <div style="margin-bottom: 12px; display: flex; justify-content: flex-end;">
                <div style="max-width: 70%; padding: 10px 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px 12px 4px 12px; font-size: 13px;">${useCase}</div>
            </div>
            <div style="margin-bottom: 12px; display: flex; justify-content: flex-start;">
                <div style="max-width: 70%; padding: 10px 14px; background: #f44336; color: white; border-radius: 12px 12px 12px 4px; font-size: 13px;">Failed to chat with AI</div>
            </div>
        `;
        chatArea.style.display = 'block';
        alert('Failed to chat with AI');
    } finally {
        chatBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        chatBtn.disabled = false;
    }
}

function generateAICopilotPermissions() {
    if (!aiUnderstanding) {
        alert('Please chat with AI first');
        return;
    }
    
    window.currentAIPermissions = aiUnderstanding;
    
    const policy = {
        Version: '2012-10-17',
        Statement: [{
            Effect: 'Allow',
            Action: aiUnderstanding.actions,
            Resource: aiUnderstanding.resources
        }]
    };
    
    saveDraft(policy, aiUnderstanding.description);
    showPolicyModal(policy);
}

let currentGeneratedPolicy = null;

function showPolicyModal(policy) {
    // Store policy globally
    currentGeneratedPolicy = policy;
    updatePolicyPage(policy);
    
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 0; max-width: 700px; width: 90%; max-height: 85vh; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
            <div style="padding: 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; color: var(--text-primary); font-size: 16px; font-weight: 600;"><i class="fas fa-file-code"></i> IAM Policy JSON</h3>
                <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">&times;</button>
            </div>
            <div style="padding: 20px; overflow: auto; max-height: calc(85vh - 140px);">
                <pre style="background: var(--bg-secondary); padding: 20px; border-radius: 8px; overflow: auto; color: var(--text-primary); font-size: 13px; line-height: 1.6; margin: 0; border: 1px solid var(--border-color);">${JSON.stringify(policy, null, 2)}</pre>
            </div>
            <div style="padding: 20px; border-top: 1px solid var(--border-color); display: flex; gap: 10px; flex-wrap: wrap;">
                <button onclick="copyPolicyToClipboard()" class="btn-secondary" style="flex: 1; min-width: 100px; padding: 10px; border-radius: 8px;"><i class="fas fa-copy"></i> Copy</button>
                <button onclick="loadDrafts()" class="btn-secondary" style="flex: 1; min-width: 100px; padding: 10px; border-radius: 8px;"><i class="fas fa-history"></i> Drafts</button>
                <button onclick="showPage('policy'); this.closest('div[style*=fixed]').remove()" class="btn-secondary" style="flex: 1; min-width: 100px; padding: 10px; border-radius: 8px;"><i class="fas fa-file-code"></i> Policy Tab</button>
                <button onclick="this.closest('div[style*=fixed]').remove()" class="btn-primary" style="flex: 1; min-width: 120px; padding: 10px; border-radius: 8px;"><i class="fas fa-comments"></i> Continue Chat</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function updatePolicyPage(policy) {
    const policyContent = document.getElementById('policyContent');
    if (policyContent) {
        policyContent.innerHTML = `
            <div style="background: var(--bg-secondary); border: 1.5px solid var(--border-color); border-radius: 12px; padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0; color: var(--text-primary); font-size: 16px;"><i class="fas fa-check-circle" style="color: #38ef7d;"></i> Generated IAM Policy</h3>
                    <button onclick="copyPolicyToClipboard()" class="btn-secondary" style="padding: 8px 16px; font-size: 13px;"><i class="fas fa-copy"></i> Copy</button>
                </div>
                <pre style="background: var(--bg-primary); padding: 20px; border-radius: 8px; overflow: auto; color: var(--text-primary); font-size: 13px; line-height: 1.6; margin: 0; border: 1px solid var(--border-color); max-height: 500px;">${JSON.stringify(policy, null, 2)}</pre>
                <div style="margin-top: 15px; padding: 12px; background: #e7f3ff; border: 1px solid #4A90E2; border-radius: 8px; font-size: 13px;">
                    <strong>💡 Tip:</strong> If you encounter access errors, visit the <a href="#" onclick="showPage('troubleshoot'); return false;" style="color: #667eea; text-decoration: underline;">Troubleshooting</a> tab to get AI-powered help.
                </div>
            </div>
        `;
    }
}

function copyPolicyToClipboard() {
    if (currentGeneratedPolicy) {
        navigator.clipboard.writeText(JSON.stringify(currentGeneratedPolicy, null, 2));
        alert('✅ Policy copied to clipboard!');
    }
}

async function generatePermissions(tag, actions) {
    const allResources = Object.entries(selectedResources).map(([service, resources]) => {
        return `${service}: ${resources.map(r => r.id).join(', ')}`;
    }).join(' | ');
    const useCase = `I need to ${actions} on these resources: ${allResources}. Tag: ${tag}`;
    
    try {
        const response = await fetch('/api/generate-permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ use_case: useCase })
        });
        
        const data = await response.json();
        
        if (data.error) {
            alert('Error: ' + data.error);
        } else if (data.permissions || data.actions) {
            window.currentAIPermissions = data;
            document.getElementById('aiPermissionsContent').textContent = JSON.stringify(data, null, 2);
            document.getElementById('aiPermissionsPreview').style.display = 'block';
            alert('✅ Permissions generated! You can now submit the request.');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to generate permissions');
    }
}


// Request for Others wizard functions
let othersSelectedResources = {};
let othersSelectedCloudProvider = '';
let othersEmailList = [];

// Email tag handling
document.addEventListener('DOMContentLoaded', function() {
    const emailInput = document.getElementById('othersEmailInput');
    if (emailInput) {
        emailInput.addEventListener('keydown', function(e) {
            if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                const email = this.value.trim();
                if (email && email.includes('@')) {
                    addOthersEmailTag(email);
                    this.value = '';
                }
            }
        });
    }
});

function addOthersEmailTag(email) {
    if (!othersEmailList.includes(email)) {
        othersEmailList.push(email);
        const tag = document.createElement('span');
        tag.style.cssText = 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; display: flex; align-items: center; gap: 5px;';
        tag.innerHTML = `${email} <i class="fas fa-times" style="cursor: pointer;" onclick="removeOthersEmailTag('${email}')"></i>`;
        document.getElementById('othersEmailTags').appendChild(tag);
    }
}

function removeOthersEmailTag(email) {
    othersEmailList = othersEmailList.filter(e => e !== email);
    const tags = document.getElementById('othersEmailTags');
    Array.from(tags.children).forEach(tag => {
        if (tag.textContent.includes(email)) {
            tag.remove();
        }
    });
}

function selectCloudProviderForOthers(provider) {
    othersSelectedCloudProvider = provider;
    if (provider === 'aws') {
        document.getElementById('othersStep1').style.display = 'none';
        document.getElementById('othersStep2AWS').style.display = 'block';
        loadAccountsForOthers();
    } else {
        alert(`${provider.toUpperCase()} integration coming soon`);
    }
}

function backToOthersStep1() {
    if (window.currentCloudAccessPage) {
        showPage(window.currentCloudAccessPage);
        window.currentCloudAccessPage = null;
        return;
    }
    document.getElementById('othersStep1').style.display = 'block';
    document.getElementById('othersStep2AWS').style.display = 'none';
    othersSelectedResources = {};
}

function loadAccountsForOthers() {
    const select = document.getElementById('othersRequestAccount');
    select.innerHTML = '<option value="">Select Account</option>';
    
    fetch('/api/accounts')
        .then(res => res.json())
        .then(accounts => {
            accounts.forEach(acc => {
                const option = document.createElement('option');
                option.value = acc.id;
                option.textContent = `${acc.name} (${acc.id})`;
                select.appendChild(option);
            });
        });
}

async function fetchAWSResourcesForOthers() {
    const accountId = document.getElementById('othersRequestAccount').value;
    if (!accountId) return;
    
    document.getElementById('othersResourceExplorerSection').style.display = 'block';
    document.getElementById('othersResourceExplorerLoading').style.display = 'block';
    document.getElementById('othersAWSServicesList').style.display = 'none';
    
    try {
        const response = await fetch(`http://127.0.0.1:5000/api/discover-services?account_id=${accountId}`);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        availableServices = data.services.map(service => ({
            id: service.id,
            name: service.name,
            icon: getServiceIcon(service.id),
            licensed: isServiceLicensed(service.id)
        }));
        
        displayAWSServicesForOthers();
    } catch (error) {
        console.error('Error discovering services:', error);
        alert('Failed to discover AWS services: ' + error.message);
    } finally {
        document.getElementById('othersResourceExplorerLoading').style.display = 'none';
        document.getElementById('othersAWSServicesList').style.display = 'block';
    }
}

function displayAWSServicesForOthers() {
    const container = document.getElementById('othersAWSServicesList');
    container.innerHTML = '';
    
    availableServices.forEach(service => {
        const card = document.createElement('div');
        card.className = 'service-checkbox-card';
        card.innerHTML = `
            <input type="checkbox" id="others-service-${service.id}" onchange="handleOthersServiceCheck('${service.id}')">
            <label for="others-service-${service.id}">
                <i class="${service.icon}" style="font-size: 24px; color: ${service.color};"></i>
                <div>
                    <strong>${service.name}</strong>
                    <small>${service.description}</small>
                    <small style="color: #667eea;">${getServiceAccessNote(service.id)}</small>
                </div>
            </label>
        `;
        container.appendChild(card);
    });
}

function handleOthersServiceCheck(serviceId) {
    const checkbox = document.getElementById(`others-service-${serviceId}`);
    if (checkbox.checked) {
        loadResourcesForOthersService(serviceId);
    } else {
        delete othersSelectedResources[serviceId];
        updateOthersSelectedResourcesPanel();
    }
}

function loadResourcesForOthersService(serviceId) {
    const accountId = document.getElementById('othersRequestAccount').value;
    
    fetch(`/api/resources/${serviceId}?account=${accountId}`)
        .then(res => res.json())
        .then(resources => {
            if (!othersSelectedResources[serviceId]) {
                othersSelectedResources[serviceId] = [];
            }
            
            const service = availableServices.find(s => s.id === serviceId);
            const resourceList = document.getElementById('othersMyResourcesList');
            
            resources.forEach(resource => {
                const item = document.createElement('div');
                item.className = 'resource-item';
                item.innerHTML = `
                    <input type="checkbox" id="others-res-${serviceId}-${resource.id}" 
                           onchange="toggleOthersResourceSelection('${serviceId}', '${resource.id}', '${resource.name}')">
                    <label for="others-res-${serviceId}-${resource.id}">${resource.name}</label>
                `;
                resourceList.appendChild(item);
            });
            
            document.getElementById('othersMyResourcesSection').style.display = 'block';
        });
}

function toggleOthersResourceSelection(serviceId, resourceId, resourceName) {
    if (!othersSelectedResources[serviceId]) {
        othersSelectedResources[serviceId] = [];
    }
    
    const index = othersSelectedResources[serviceId].findIndex(r => r.id === resourceId);
    if (index > -1) {
        othersSelectedResources[serviceId].splice(index, 1);
    } else {
        othersSelectedResources[serviceId].push({ id: resourceId, name: resourceName });
    }
    
    updateOthersSelectedResourcesPanel();
}

function updateOthersSelectedResourcesPanel() {
    const panel = document.getElementById('othersSelectedResourcesPanel');
    
    if (Object.keys(othersSelectedResources).length === 0) {
        panel.innerHTML = '<p style="color: var(--text-secondary); font-size: 12px;">No resources selected</p>';
        return;
    }
    
    let html = '';
    for (const [serviceId, resources] of Object.entries(othersSelectedResources)) {
        if (resources.length > 0) {
            const service = availableServices.find(s => s.id === serviceId);
            html += `<div style="margin-bottom: 12px;">
                <strong style="font-size: 12px; color: var(--text-primary);">${service.name}</strong>
                <ul style="margin: 4px 0 0 0; padding-left: 16px; font-size: 11px; color: var(--text-secondary);">`;
            resources.forEach(r => {
                html += `<li>${r.name}</li>`;
            });
            html += `</ul></div>`;
        }
    }
    
    panel.innerHTML = html;
}

// Form submission
document.getElementById('requestForOthersForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const emails = document.getElementById('othersEmails').value;
    const account = document.getElementById('othersRequestAccount').value;
    const duration = document.getElementById('othersRequestDuration').value;
    const justification = document.getElementById('othersRequestJustification').value;
    
    const requestData = {
        emails: othersEmailList,
        account: account,
        resources: othersSelectedResources,
        duration: duration,
        justification: justification
    };
    
    fetch('/api/request-for-others', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
    })
    .then(res => res.json())
    .then(data => {
        alert('Request submitted successfully!');
        cancelRequestForOthers();
    })
    .catch(err => {
        alert('Error submitting request');
    });
});


function saveDraft(policy, description) {
    const drafts = JSON.parse(localStorage.getItem('policyDrafts') || '[]');
    drafts.unshift({
        id: Date.now(),
        policy: policy,
        description: description,
        timestamp: new Date().toISOString()
    });
    localStorage.setItem('policyDrafts', JSON.stringify(drafts.slice(0, 10)));
}

function loadDrafts() {
    const drafts = JSON.parse(localStorage.getItem('policyDrafts') || '[]');
    if (drafts.length === 0) {
        alert('No saved drafts');
        return;
    }
    
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 20px; max-width: 600px; width: 90%; max-height: 80vh; overflow: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: var(--text-primary); font-size: 16px;"><i class="fas fa-history"></i> Saved Drafts</h3>
                <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">&times;</button>
            </div>
            ${drafts.map(draft => `
                <div style="padding: 15px; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 10px; cursor: pointer; border: 1px solid var(--border-color);" onclick="loadDraftPolicy(${draft.id})">
                    <div style="font-size: 13px; color: var(--text-primary); font-weight: 600; margin-bottom: 5px;">${draft.description}</div>
                    <div style="font-size: 11px; color: var(--text-secondary);">${draft.policy.Statement[0].Action.length} actions • ${new Date(draft.timestamp).toLocaleString()}</div>
                </div>
            `).join('')}
        </div>
    `;
    document.body.appendChild(modal);
}

function loadDraftPolicy(draftId) {
    const drafts = JSON.parse(localStorage.getItem('policyDrafts') || '[]');
    const draft = drafts.find(d => d.id === draftId);
    if (draft) {
        window.currentAIPermissions = {
            actions: draft.policy.Statement[0].Action,
            resources: draft.policy.Statement[0].Resource,
            description: draft.description
        };
        aiUnderstanding = window.currentAIPermissions;
        document.querySelectorAll('div[style*="fixed"]').forEach(m => m.remove());
        alert('✅ Draft loaded! You can now submit the request.');
    }
}

function startChatExpiryTimer() {
    clearTimeout(chatExpiryTimer);
    chatExpiryTimer = setTimeout(() => {
        if (confirm('⏰ Chat session expiring in 30 seconds. Continue?')) {
            startChatExpiryTimer();
        } else {
            saveChatToDraft();
            resetAIChat();
            alert('💾 Chat saved to drafts. You can continue later.');
        }
    }, 4.5 * 60 * 1000);
}

function saveChatToDraft() {
    if (conversationHistory.length > 0) {
        const chatDrafts = JSON.parse(localStorage.getItem('chatDrafts') || '[]');
        chatDrafts.unshift({
            id: Date.now(),
            conversationId: currentConversationId,
            history: conversationHistory,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('chatDrafts', JSON.stringify(chatDrafts.slice(0, 5)));
    }
}

function resetAIChat() {
    clearTimeout(chatExpiryTimer);
    currentConversationId = null;
    aiUnderstanding = null;
    conversationHistory = [];
    const chatArea = document.getElementById('aiChatArea');
    if (chatArea) {
        chatArea.innerHTML = '';
        chatArea.style.display = 'none';
    }
    const useCaseInput = document.getElementById('aiCopilotUseCase');
    if (useCaseInput) {
        useCaseInput.value = '';
        useCaseInput.placeholder = 'Type your message...';
        useCaseInput.disabled = false;
    }
    const chatBtn = document.getElementById('chatWithAIBtn');
    if (chatBtn) chatBtn.style.display = 'inline-block';
    const genBtn = document.getElementById('generatePermissionsBtn');
    if (genBtn) genBtn.style.display = 'none';
}


async function submitAccessRequest(event) {
    event.preventDefault();
    
    if (!window.currentAIPermissions || !window.currentAIPermissions.grouped_actions) {
        alert('Please generate permissions first using NPAMX');
        return;
    }
    
    const accountId = document.getElementById('requestAccount').value;
    const duration = document.getElementById('requestDuration')?.value || 8;
    const justification = document.getElementById('requestJustification')?.value || 'AI-generated access request';
    const userEmail = localStorage.getItem('currentUserEmail') || 'satish.korra@nykaa.com';
    
    if (!accountId) {
        alert('Please select an account');
        return;
    }
    
    const chatTranscript = document.getElementById('aiChatArea')?.innerText || conversationHistory.map(h => `User: ${h.user}\nAI: ${h.ai}`).join('\n\n');
    
    try {
        const response = await fetch('http://127.0.0.1:5000/api/request-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_email: userEmail,
                account_id: accountId,
                duration_hours: parseInt(duration),
                justification: justification,
                use_case: aiUnderstanding.description,
                ai_permissions: {
                    actions: aiUnderstanding.actions,
                    resources: aiUnderstanding.resources,
                    description: aiUnderstanding.description
                },
                chat_transcript: chatTranscript
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert('✅ Access request submitted successfully!');
            cancelNewRequest();
            showPage('requests');
        } else {
            alert('❌ Error: ' + (result.error || 'Failed to submit request'));
        }
    } catch (error) {
        console.error('Error submitting request:', error);
        alert('❌ Failed to submit request');
    }
}


function viewChatTranscript(requestId) {
    fetch(`http://127.0.0.1:5000/api/request/${requestId}`)
        .then(res => res.json())
        .then(request => {
            if (!request.chat_transcript) {
                alert('No chat transcript available');
                return;
            }
            
            const modal = document.createElement('div');
            modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;';
            modal.innerHTML = `
                <div style="background: var(--bg-primary); border-radius: 12px; padding: 0; max-width: 700px; width: 90%; max-height: 85vh; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
                    <div style="padding: 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; color: var(--text-primary); font-size: 16px; font-weight: 600;"><i class="fas fa-comments"></i> AI Chat Transcript</h3>
                        <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">&times;</button>
                    </div>
                    <div style="padding: 20px; overflow: auto; max-height: calc(85vh - 140px);">
                        <pre style="background: var(--bg-secondary); padding: 20px; border-radius: 8px; overflow: auto; color: var(--text-primary); font-size: 13px; line-height: 1.6; margin: 0; border: 1px solid var(--border-color); white-space: pre-wrap;">${request.chat_transcript}</pre>
                    </div>
                    <div style="padding: 20px; border-top: 1px solid var(--border-color);">
                        <button onclick="this.closest('div[style*=fixed]').remove()" class="btn-primary" style="width: 100%; padding: 10px; border-radius: 8px;">Close</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        });
}
