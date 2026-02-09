// Structured Request Flow - Step by step UI (not AI-driven)
// AI only for help/guidance

let currentRequestType = null; // 'cloud', 'vm', 'db', 'storage'
let currentProvider = null; // 'aws', 'gcp', 'azure', 'oracle'
let currentStep = 1;
let requestData = {
    type: null,
    provider: null,
    region: null,
    services: [],
    resources: {},
    actions: [],
    justification: null
};

// Show new request modal
function showNewRequestModal() {
    const modal = document.getElementById('newRequestModal');
    if (modal) {
        modal.style.display = 'flex';
        resetRequestFlow();
    }
}

function closeNewRequestModal() {
    const modal = document.getElementById('newRequestModal');
    if (modal) {
        modal.style.display = 'none';
        resetRequestFlow();
    }
}

// Reset request flow
function resetRequestFlow() {
    currentRequestType = null;
    currentProvider = null;
    currentStep = 1;
    requestData = {
        type: null,
        provider: null,
        account_id: null,
        permission_set: null,
        permission_set_name: null,
        use_custom_permissions: false,
        region: null,
        services: [],
        resources: {},
        actions: [],
        justification: null,
        duration_hours: 8
    };
    
    // Reset tabs - show type tabs, hide panels
    const typeTabs = document.querySelector('.request-type-tabs');
    if (typeTabs) typeTabs.style.display = 'flex';
    
    // Reset tab buttons
    document.querySelectorAll('.request-type-tab').forEach(tab => tab.classList.remove('active'));
    
    // Hide ALL panels first
    document.querySelectorAll('.request-type-panel').forEach(panel => {
        panel.classList.remove('active');
        panel.style.display = 'none';
    });
    
    // Show first tab and panel
    const firstTab = document.querySelector('.request-type-tab');
    if (firstTab) {
        firstTab.classList.add('active');
    }
    const firstPanel = document.getElementById('cloudAccessTab');
    if (firstPanel) {
        firstPanel.classList.add('active');
        firstPanel.style.display = 'block';
    }
    
    // Hide flow steps if exists
    const flowSteps = document.getElementById('requestFlowSteps');
    if (flowSteps) {
        flowSteps.style.display = 'none';
        flowSteps.remove(); // Remove it completely
    }
    
    // Clear any flow content in the content area
    const contentArea = document.querySelector('.request-type-content');
    if (contentArea) {
        // Restore original panels if they were replaced
        const existingPanels = contentArea.querySelectorAll('.request-type-panel');
        if (existingPanels.length === 0) {
            // Panels were replaced, need to restore them
            console.log('Panels were replaced, need to restore');
        }
    }
}

// Show request type tab
function showRequestTypeTab(type) {
    console.log('showRequestTypeTab called with type:', type);
    currentRequestType = type;
    
    // Update tabs
    document.querySelectorAll('.request-type-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Find and activate the clicked tab
    const tabs = document.querySelectorAll('.request-type-tab');
    tabs.forEach(tab => {
        if (tab.getAttribute('data-type') === type) {
            tab.classList.add('active');
        }
    });
    
    // Hide ALL panels first
    document.querySelectorAll('.request-type-panel').forEach(panel => {
        panel.classList.remove('active');
        panel.style.display = 'none';
        console.log('Hiding panel:', panel.id);
    });
    
    // Show selected panel
    const selectedPanel = document.getElementById(type + 'AccessTab');
    if (selectedPanel) {
        selectedPanel.classList.add('active');
        selectedPanel.style.display = 'block';
        console.log('Showing panel:', selectedPanel.id);
    } else {
        console.error('Panel not found:', type + 'AccessTab');
    }
    
    // Hide flow steps if showing
    const flowSteps = document.getElementById('requestFlowSteps');
    if (flowSteps) {
        flowSteps.style.display = 'none';
        console.log('Hiding flow steps');
    }
    
    // Reset provider selection
    currentProvider = null;
    requestData.provider = null;
}

// Create flow steps HTML structure
function createFlowStepsHTML() {
    return `
        <div id="requestFlowSteps" style="display: block !important; visibility: visible !important;">
            <div class="flow-steps-indicator">
                <div class="flow-step" data-step="1">
                    <div class="flow-step-number">1</div>
                    <div class="flow-step-label">Account</div>
                </div>
                <div class="flow-step" data-step="2">
                    <div class="flow-step-number">2</div>
                    <div class="flow-step-label">Region</div>
                </div>
                <div class="flow-step" data-step="3">
                    <div class="flow-step-number">3</div>
                    <div class="flow-step-label">Services</div>
                </div>
                <div class="flow-step" data-step="4">
                    <div class="flow-step-number">4</div>
                    <div class="flow-step-label">Resources</div>
                </div>
                <div class="flow-step" data-step="5">
                    <div class="flow-step-number">5</div>
                    <div class="flow-step-label">Review</div>
                </div>
            </div>
            <div id="requestFlowContent" class="request-flow-content"></div>
            <div class="request-flow-nav">
                <button class="btn-secondary" onclick="goToPreviousStep()" id="prevStepBtn" style="display: none;">
                    <i class="fas fa-arrow-left"></i> Previous
                </button>
                <button class="btn-primary" onclick="goToNextStep()" id="nextStepBtn">
                    Next <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        </div>
    `;
}

// Select cloud provider
function selectCloudProvider(provider) {
    console.log('selectCloudProvider called with:', provider);
    currentProvider = provider;
    requestData.type = 'cloud';
    requestData.provider = provider;
    
    const typeTabs = document.querySelector('.request-type-tabs');
    if (typeTabs) typeTabs.style.display = 'none';
    
    document.querySelectorAll('.request-type-panel').forEach(panel => {
        panel.style.display = 'none';
        panel.classList.remove('active');
    });
    
    const contentArea = document.querySelector('.request-type-content');
    if (!contentArea) {
        console.error('Content area not found!');
        return;
    }
    
    console.log('Creating flow HTML...');
    contentArea.innerHTML = createFlowStepsHTML();
    
    setTimeout(() => {
        console.log('Calling loadStep(1)...');
        loadStep(1);
    }, 100);
}

// Select VM type
function selectVMType(vmType) {
    currentProvider = vmType;
    requestData.type = 'vm';
    requestData.provider = vmType;
    
    // Hide type tabs and content, show flow steps
    document.querySelector('.request-type-tabs').style.display = 'none';
    document.querySelectorAll('.request-type-panel').forEach(panel => panel.style.display = 'none');
    
    // Create flow steps if not exists
    let flowSteps = document.getElementById('requestFlowSteps');
    if (!flowSteps) {
        const contentArea = document.querySelector('.request-type-content');
        contentArea.innerHTML = createFlowStepsHTML();
    } else {
        flowSteps.style.display = 'block';
    }
    
    // Load step 1: Account selection
    loadStep(1);
}

// Select DB platform
function selectDBPlatform(dbPlatform) {
    currentProvider = dbPlatform;
    requestData.type = 'db';
    requestData.provider = dbPlatform;
    
    // Hide type tabs and content, show flow steps
    document.querySelector('.request-type-tabs').style.display = 'none';
    document.querySelectorAll('.request-type-panel').forEach(panel => panel.style.display = 'none');
    
    // Create flow steps if not exists
    let flowSteps = document.getElementById('requestFlowSteps');
    if (!flowSteps) {
        const contentArea = document.querySelector('.request-type-content');
        contentArea.innerHTML = createFlowStepsHTML();
    } else {
        flowSteps.style.display = 'block';
    }
    
    // Load step 1: Account selection
    loadStep(1);
}

// Select storage type
function selectStorageType(storageType) {
    currentProvider = storageType;
    requestData.type = 'storage';
    requestData.provider = storageType;
    
    // Hide type tabs and content, show flow steps
    document.querySelector('.request-type-tabs').style.display = 'none';
    document.querySelectorAll('.request-type-panel').forEach(panel => panel.style.display = 'none');
    
    // Create flow steps if not exists
    let flowSteps = document.getElementById('requestFlowSteps');
    if (!flowSteps) {
        const contentArea = document.querySelector('.request-type-content');
        contentArea.innerHTML = createFlowStepsHTML();
    } else {
        flowSteps.style.display = 'block';
    }
    
    // Load step 1: Account selection
    loadStep(1);
}

// Load step content
function loadStep(step) {
    currentStep = step;
    
    // Update step indicators
    const flowSteps = document.querySelectorAll('.flow-step');
    flowSteps.forEach((stepEl, index) => {
        stepEl.classList.remove('active', 'completed');
        if (index + 1 < step) {
            stepEl.classList.add('completed');
        } else if (index + 1 === step) {
            stepEl.classList.add('active');
        }
    });
    
    // Show/hide navigation buttons
    const prevBtn = document.getElementById('prevStepBtn');
    const nextBtn = document.getElementById('nextStepBtn');
    
    if (step > 1) {
        if (prevBtn) prevBtn.style.display = 'block';
    } else {
        if (prevBtn) prevBtn.style.display = 'none';
    }
    
    if (step === 5) {
        if (nextBtn) {
            nextBtn.innerHTML = '<i class="fas fa-check"></i> Submit Request';
            nextBtn.onclick = submitRequest;
        }
    } else {
        if (nextBtn) {
            nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
            nextBtn.onclick = goToNextStep;
        }
    }
    
    // Load step content
    console.log('📍 Loading step:', step);
    if (step === 1) {
        console.log('✅ Calling loadAccountStep');
        loadAccountStep();
    } else if (step === 2) {
        loadRegionStep();
    } else if (step === 3) {
        loadServicesStep();
    } else if (step === 4) {
        loadResourcesStep();
    } else if (step === 5) {
        loadReviewStep();
    }
}

// Load account step (Step 1: Account selection only)
function loadAccountStep() {
    console.log('🎯 loadAccountStep STARTED');
    const contentDiv = document.getElementById('requestFlowContent');
    console.log('📦 contentDiv found:', !!contentDiv);
    if (!contentDiv) {
        console.error('❌ contentDiv is null!');
        return;
    }
    console.log('✅ Setting innerHTML');
    
    const selectedAccount = requestData.account_id;
    
    contentDiv.innerHTML = `
        <div class="step-content" style="display: block !important; visibility: visible !important; min-height: 300px; background: var(--bg-secondary); padding: 20px;">
            <h4 style="color: var(--text-primary); font-size: 24px; margin-bottom: 20px;">Select AWS Account</h4>
            <p style="color: var(--text-primary); margin-bottom: 20px;">Choose the AWS account you need access to</p>
            <div class="accounts-grid" style="display: grid !important; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                <button class="account-card ${selectedAccount === '332463837037' ? 'selected' : ''}" onclick="selectAccount('332463837037', 'Current Account')" style="display: block !important; padding: 30px; border: 3px solid ${selectedAccount === '332463837037' ? '#22C55E' : '#667eea'}; border-radius: 12px; background: ${selectedAccount === '332463837037' ? '#e8f5e9' : 'var(--bg-tertiary)'}; cursor: pointer; font-size: 16px; position: relative;">
                    ${selectedAccount === '332463837037' ? '<div style="position: absolute; top: 10px; right: 10px; background: #22C55E; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;"><i class="fas fa-check"></i> Selected</div>' : ''}
                    <i class="fas fa-building" style="font-size: 32px; color: #667eea; display: block; margin-bottom: 10px;"></i>
                    <div class="account-name" style="font-weight: 500; font-size: 18px; color: var(--text-primary); margin: 10px 0;">Current Account</div>
                    <div class="account-id" style="color: var(--text-secondary); font-size: 14px;">332463837037</div>
                    <span class="env-badge nonprod" style="display: inline-block; margin-top: 10px; padding: 6px 12px; background: #e3f2fd; color: #1976d2; border-radius: 4px; font-size: 12px;">NON-PROD</span>
                </button>
                <button class="account-card ${selectedAccount === '867625663987' ? 'selected' : ''}" onclick="selectAccount('867625663987', 'POC-Account-867625663987')" style="display: block !important; padding: 30px; border: 3px solid ${selectedAccount === '867625663987' ? '#22C55E' : '#667eea'}; border-radius: 12px; background: ${selectedAccount === '867625663987' ? '#e8f5e9' : 'var(--bg-tertiary)'}; cursor: pointer; font-size: 16px; position: relative;">
                    ${selectedAccount === '867625663987' ? '<div style="position: absolute; top: 10px; right: 10px; background: #22C55E; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;"><i class="fas fa-check"></i> Selected</div>' : ''}
                    <i class="fas fa-building" style="font-size: 32px; color: #667eea; display: block; margin-bottom: 10px;"></i>
                    <div class="account-name" style="font-weight: 500; font-size: 18px; color: var(--text-primary); margin: 10px 0;">POC-Account-867625663987</div>
                    <div class="account-id" style="color: var(--text-secondary); font-size: 14px;">867625663987</div>
                    <span class="env-badge nonprod" style="display: inline-block; margin-top: 10px; padding: 6px 12px; background: #e3f2fd; color: #1976d2; border-radius: 4px; font-size: 12px;">NON-PROD</span>
                </button>
            </div>
        </div>
    `;
    console.log('✅ innerHTML set, HTML length:', contentDiv.innerHTML.length);
}

// Select account
function selectAccount(accountId, accountName) {
    requestData.account_id = accountId;
    requestData.account_name = accountName;
    // Re-render to show selected state
    loadAccountStep();
    // Auto-advance to next step after selection
    setTimeout(() => {
        goToNextStep();
    }, 300);
}

// Dummy functions for compatibility
function selectPermissionSet() {}
function selectCustomPermissions() {}

// Load region step
function loadRegionStep() {
    const contentDiv = document.getElementById('requestFlowContent');
    
    let regions = [];
    if (requestData.provider === 'aws' || requestData.provider === 'ec2' || requestData.provider === 's3') {
        regions = [
            { id: 'us-east-1', name: 'US East (N. Virginia)' },
            { id: 'us-west-2', name: 'US West (Oregon)' },
            { id: 'eu-west-1', name: 'Europe (Ireland)' },
            { id: 'ap-south-1', name: 'Asia Pacific (Mumbai)' },
            { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' }
        ];
    } else if (requestData.provider === 'gcp' || requestData.provider === 'gce' || requestData.provider === 'gcs') {
        regions = [
            { id: 'us-central1', name: 'US Central (Iowa)' },
            { id: 'us-east1', name: 'US East (South Carolina)' },
            { id: 'europe-west1', name: 'Europe (Belgium)' },
            { id: 'asia-south1', name: 'Asia South (Mumbai)' }
        ];
    } else if (requestData.provider === 'azure' || requestData.provider === 'azure-vm' || requestData.provider === 'azure-blob') {
        regions = [
            { id: 'eastus', name: 'East US' },
            { id: 'westus2', name: 'West US 2' },
            { id: 'westeurope', name: 'West Europe' },
            { id: 'southeastasia', name: 'Southeast Asia' }
        ];
    } else if (requestData.provider === 'oracle' || requestData.provider === 'oracle-vm' || requestData.provider === 'oracle-storage') {
        regions = [
            { id: 'us-ashburn-1', name: 'US East (Ashburn)' },
            { id: 'us-phoenix-1', name: 'US West (Phoenix)' },
            { id: 'eu-frankfurt-1', name: 'Europe (Frankfurt)' },
            { id: 'ap-mumbai-1', name: 'Asia Pacific (Mumbai)' }
        ];
    }
    
    contentDiv.innerHTML = `
        <div class="step-content" style="display: block !important; visibility: visible !important; min-height: 300px; background: var(--bg-secondary); padding: 20px;">
            <h4 style="color: var(--text-primary); font-size: 24px; margin-bottom: 20px;">Select Region</h4>
            <p style="color: var(--text-primary); margin-bottom: 20px;">Choose the region for ${requestData.provider.toUpperCase()}</p>
            <div class="regions-grid" style="display: grid !important; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                ${regions.map(region => `
                    <button class="region-card" onclick="selectRegion('${region.id}', '${region.name}')" style="display: block !important; padding: 30px; border: 2px solid #667eea; border-radius: 12px; background: var(--bg-tertiary); cursor: pointer; text-align: center;">
                        <i class="fas fa-globe" style="font-size: 32px; color: #667eea; display: block; margin-bottom: 10px;"></i>
                        <div class="region-name" style="font-weight: 500; font-size: 18px; color: var(--text-primary); margin-bottom: 5px;">${region.name}</div>
                        <div class="region-id" style="color: var(--text-secondary); font-size: 14px;">${region.id}</div>
                    </button>
                `).join('')}
            </div>
        </div>
    `;
}

// Select region
function selectRegion(regionId, regionName) {
    requestData.region = regionId;
    loadStep(3);
}

// Load services step
function loadServicesStep() {
    const contentDiv = document.getElementById('requestFlowContent');
    
    let services = [];
    
    if (requestData.type === 'cloud' && requestData.provider === 'aws') {
        services = [
            { id: 'ec2', name: 'EC2', description: 'Virtual servers' },
            { id: 's3', name: 'S3', description: 'Object storage' },
            { id: 'lambda', name: 'Lambda', description: 'Serverless functions' },
            { id: 'rds', name: 'RDS', description: 'Managed databases' },
            { id: 'dynamodb', name: 'DynamoDB', description: 'NoSQL database' },
            { id: 'kms', name: 'KMS', description: 'Key management' },
            { id: 'secretsmanager', name: 'Secrets Manager', description: 'Secrets storage' },
            { id: 'iam', name: 'IAM', description: 'Identity & access' },
            { id: 'cloudwatch', name: 'CloudWatch', description: 'Monitoring' }
        ];
    } else if (requestData.type === 'vm') {
        loadStep(4);
        return;
    } else if (requestData.type === 'db') {
        loadStep(4);
        return;
    } else if (requestData.type === 'storage') {
        loadStep(4);
        return;
    }
    
    contentDiv.innerHTML = `
        <div class="step-content" style="display: block !important; visibility: visible !important; min-height: 300px; background: var(--bg-secondary); padding: 20px;">
            <h4 style="color: var(--text-primary); font-size: 24px; margin-bottom: 20px;">Select Services</h4>
            <p style="color: var(--text-primary); margin-bottom: 20px;">Choose the AWS services you need access to</p>
            <div class="services-grid" style="display: grid !important; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                ${services.map(service => `
                    <button class="service-card" onclick="selectService('${service.id}', '${service.name}')" style="display: block !important; padding: 20px; border: 2px solid #667eea; border-radius: 12px; background: var(--bg-tertiary); cursor: pointer; text-align: center;">
                        ${getIcon("providers", "aws")}
                        <div class="service-name" style="font-weight: 500; font-size: 16px; color: var(--text-primary); margin-bottom: 5px;">${service.name}</div>
                        <div class="service-desc" style="color: var(--text-secondary); font-size: 12px;">${service.description}</div>
                    </button>
                `).join('')}
            </div>
            <div class="selected-services" id="selectedServicesList" style="margin-top: 20px; display: none;">
                <h5 style="color: var(--text-primary);">Selected Services:</h5>
                <div id="selectedServicesTags"></div>
            </div>
        </div>
    `;
}

// Select service
function selectService(serviceId, serviceName) {
    if (!requestData.services.includes(serviceId)) {
        requestData.services.push(serviceId);
    }
    
    // Update UI
    const selectedList = document.getElementById('selectedServicesList');
    const selectedTags = document.getElementById('selectedServicesTags');
    
    if (selectedList && selectedTags) {
        selectedList.style.display = 'block';
        selectedTags.innerHTML = requestData.services.map(svc => `
            <span class="service-tag">
                ${svc}
                <button onclick="removeService('${svc}')"><i class="fas fa-times"></i></button>
            </span>
        `).join('');
    }
}

// Remove service
function removeService(serviceId) {
    requestData.services = requestData.services.filter(s => s !== serviceId);
    
    const selectedTags = document.getElementById('selectedServicesTags');
    if (selectedTags) {
        if (requestData.services.length === 0) {
            document.getElementById('selectedServicesList').style.display = 'none';
        } else {
            selectedTags.innerHTML = requestData.services.map(svc => `
                <span class="service-tag">
                    ${svc}
                    <button onclick="removeService('${svc}')"><i class="fas fa-times"></i></button>
                </span>
            `).join('');
        }
    }
}

// Load resources step
function loadResourcesStep() {
    const contentDiv = document.getElementById('requestFlowContent');
    
    contentDiv.innerHTML = `
        <div class="step-content" style="display: block !important; visibility: visible !important; min-height: 300px; background: var(--bg-secondary); padding: 20px;">
            <h4 style="color: var(--text-primary); font-size: 24px; margin-bottom: 20px;">Select Resources</h4>
            <p style="color: var(--text-primary); margin-bottom: 20px;">Loading resources from AWS...</p>
            <div id="resourcesContainer" style="color: var(--text-primary);">
                <div style="text-align: center; padding: 40px;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 32px; color: #667eea;"></i>
                    <p style="margin-top: 15px;">Fetching resources...</p>
                </div>
            </div>
        </div>
    `;
    
    // Fetch resources after rendering
    setTimeout(() => {
        fetchResourcesForServices();
    }, 100);
}

// Fetch resources for selected services
async function fetchResourcesForServices() {
    const container = document.getElementById('resourcesContainer');
    
    if (requestData.services.length === 0 && requestData.type !== 'vm' && requestData.type !== 'db' && requestData.type !== 'storage') {
        container.innerHTML = '<p>Please select services first.</p>';
        return;
    }
    
    // Get account ID (should be selected earlier, for now use default)
    const accountId = requestData.account_id || '332463837037';
    
    try {
        // For each service, fetch resources
        for (const service of requestData.services) {
            const response = await fetch(`http://127.0.0.1:5000/api/resources/${requestData.provider}/${requestData.region}/${service}?account_id=${accountId}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                displayResources(service, data.resources || []);
            } else {
                // If API fails, show manual input
                displayResourceManualInput(service);
            }
        }
    } catch (error) {
        console.error('Error fetching resources:', error);
        // Show manual input as fallback
        if (requestData.services.length > 0) {
            displayResourceManualInput(requestData.services[0]);
        } else {
            displayResourceManualInput('default');
        }
    }
}

// Display resources
function displayResources(service, resources) {
    const container = document.getElementById('resourcesContainer');
    
    if (!container) return;
    
    // Clear loading spinner on first call
    if (container.innerHTML.includes('fa-spinner')) {
        container.innerHTML = '';
    }
    
    if (!requestData.resources[service]) {
        requestData.resources[service] = [];
    }
    
    let html = `<div class="service-resources-section" style="margin-bottom: 20px; padding: 15px; background: #f9f9f9; border-radius: 8px;">
        <h5 style="color: var(--text-primary); margin-bottom: 15px;">${getIcon("providers", "aws")} ${service.toUpperCase()} Resources</h5>
        <div class="resources-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px;">`;
    
    if (resources.length === 0) {
        html += '<p style="color: var(--text-primary);">No resources found. Please specify manually:</p>';
        html += `<input type="text" id="resourceInput_${service}" placeholder="Enter resource name/ID" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; margin-top: 10px;">
        <button class="btn-secondary" onclick="addManualResource('${service}')" style="margin-top: 10px;">Add Resource</button>`;
    } else {
        resources.forEach(resource => {
            const isSelected = requestData.resources[service]?.some(r => r.id === (resource.id || resource.arn));
            html += `
                <button class="resource-card" onclick="selectResource('${service}', '${resource.id || resource.arn}', '${resource.name || resource.id}')" style="padding: 15px; border: 2px solid ${isSelected ? '#22C55E' : '#667eea'}; border-radius: 8px; background: ${isSelected ? '#e8f5e9' : 'white'}; cursor: pointer; text-align: left; position: relative;">
                    ${isSelected ? '<div style="position: absolute; top: 5px; right: 5px; background: #22C55E; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;"><i class="fas fa-check"></i></div>' : ''}
                    <i class="fas fa-cube" style="color: #667eea; margin-bottom: 8px;"></i>
                    <div style="font-weight: 500; color: var(--text-primary); font-size: 14px;">${resource.name || resource.id}</div>
                    <div style="color: var(--text-secondary); font-size: 12px; margin-top: 4px;">${resource.id || resource.arn}</div>
                </button>
            `;
        });
        html += '</div>';
        html += `<div style="margin-top: 12px;">
            <input type="text" id="resourceInput_${service}" placeholder="Or enter resource name/ID manually" style="width: calc(100% - 120px); padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
            <button class="btn-secondary" onclick="addManualResource('${service}')" style="margin-left: 10px;">Add</button>
        </div>`;
    }
    
    html += `</div>`;
    
    // Show selected resources
    if (requestData.resources[service] && requestData.resources[service].length > 0) {
        html += `<div style="margin-top: 10px; padding: 10px; background: #e8f5e9; border-radius: 8px;">
            <strong style="color: var(--text-primary);">Selected (${requestData.resources[service].length}):</strong>
            <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px;">
            ${requestData.resources[service].map(res => `
                <span style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: var(--bg-secondary); border: 1px solid #22C55E; border-radius: 16px; font-size: 12px; color: var(--text-primary);">
                    ${res.name || res.id}
                    <button onclick="removeResource('${service}', '${res.id}')" style="background: none; border: none; color: #EF4444; cursor: pointer; padding: 0; font-size: 14px;"><i class="fas fa-times"></i></button>
                </span>
            `).join('')}
            </div>
        </div>`;
    }
    
    container.innerHTML += html;
}

// Display manual resource input
function displayResourceManualInput(service) {
    const container = document.getElementById('resourcesContainer');
    container.innerHTML = `
        <div class="service-resources-section">
            <h5>${getIcon("providers", "aws")} ${service.toUpperCase()} Resources</h5>
            <p>Please specify the resource name or ID:</p>
            <input type="text" id="resourceInput_${service}" placeholder="Enter resource name/ID" class="resource-input">
            <button class="btn-secondary" onclick="addManualResource('${service}')">Add Resource</button>
            <div class="selected-resources" id="selectedResources_${service}" style="margin-top: 12px; display: none;">
                <strong>Selected:</strong>
                <div id="selectedResourcesTags_${service}"></div>
            </div>
        </div>
    `;
}

// Select resource
function selectResource(service, resourceId, resourceName) {
    if (!requestData.resources[service]) {
        requestData.resources[service] = [];
    }
    
    // Check if already selected
    if (!requestData.resources[service].some(r => r.id === resourceId)) {
        requestData.resources[service].push({
            id: resourceId,
            name: resourceName
        });
        
        updateSelectedResources(service);
    }
}

// Add manual resource
function addManualResource(service) {
    const input = document.getElementById(`resourceInput_${service}`);
    if (!input || !input.value.trim()) return;
    
    const resourceId = input.value.trim();
    selectResource(service, resourceId, resourceId);
    input.value = '';
}

// Update selected resources display
function updateSelectedResources(service) {
    const selectedDiv = document.getElementById(`selectedResources_${service}`);
    const tagsDiv = document.getElementById(`selectedResourcesTags_${service}`);
    
    if (selectedDiv && tagsDiv && requestData.resources[service]) {
        if (requestData.resources[service].length > 0) {
            selectedDiv.style.display = 'block';
            tagsDiv.innerHTML = requestData.resources[service].map(res => `
                <span class="resource-tag">
                    ${res.name || res.id}
                    <button onclick="removeResource('${service}', '${res.id}')"><i class="fas fa-times"></i></button>
                </span>
            `).join('');
        }
    }
}

// Remove resource
function removeResource(service, resourceId) {
    if (requestData.resources[service]) {
        requestData.resources[service] = requestData.resources[service].filter(r => r.id !== resourceId);
        updateSelectedResources(service);
    }
}

// Load review step
function loadReviewStep() {
    const contentDiv = document.getElementById('requestFlowContent');
    
    // Ask for actions and justification
    contentDiv.innerHTML = `
        <div class="step-content">
            <h4>Actions & Justification</h4>
            
            ${requestData.permission_set ? `
                <div class="form-group">
                    <label>Business Justification *</label>
                    <textarea id="requestJustification" placeholder="Explain why you need this access..." rows="4" required></textarea>
                    <small>Required for approval process</small>
                </div>
            ` : `
                <div class="form-group">
                    <label>What actions do you need? *</label>
                    <textarea id="requestActions" placeholder="e.g., read, write, delete, or specific actions like s3:GetObject, ec2:DescribeInstances" rows="3" required></textarea>
                    <small>Describe the specific actions you need to perform</small>
                </div>
                
                <div class="form-group">
                    <label>Business Justification *</label>
                    <textarea id="requestJustification" placeholder="Explain why you need this access..." rows="4" required></textarea>
                    <small>Required for approval process</small>
                </div>
            `}
            
            <div class="form-group">
                <label>Duration</label>
                <select id="requestDuration">
                    <option value="1">1 hour</option>
                    <option value="4">4 hours</option>
                    <option value="8" selected>8 hours</option>
                    <option value="24">24 hours (1 day)</option>
                    <option value="72">72 hours (3 days)</option>
                    <option value="120">120 hours (5 days)</option>
                </select>
            </div>
            
            <div class="request-summary">
                <h5>Request Summary</h5>
                <div class="summary-item"><strong>Type:</strong> ${requestData.type}</div>
                <div class="summary-item"><strong>Provider:</strong> ${requestData.provider}</div>
                ${requestData.account_id ? `<div class="summary-item"><strong>Account:</strong> ${requestData.account_id}</div>` : ''}
                ${requestData.permission_set ? `<div class="summary-item"><strong>Permission Set:</strong> ${requestData.permission_set_name || requestData.permission_set}</div>` : ''}
                ${requestData.region ? `<div class="summary-item"><strong>Region:</strong> ${requestData.region}</div>` : ''}
                ${requestData.services.length > 0 ? `<div class="summary-item"><strong>Services:</strong> ${requestData.services.join(', ')}</div>` : ''}
                ${Object.keys(requestData.resources).length > 0 ? `<div class="summary-item"><strong>Resources:</strong> ${Object.keys(requestData.resources).length} service(s) with ${Object.values(requestData.resources).flat().length} resource(s)</div>` : ''}
            </div>
        </div>
    `;
}

// Navigation
function goToNextStep() {
    // Validate current step
    if (currentStep === 1) {
        if (!requestData.account_id) {
            alert('Please select an account');
            return;
        }
        // Always go to region step after account selection
        loadStep(2);
        return;
    }
    if (currentStep === 2 && !requestData.region) {
        alert('Please select a region');
        return;
    }
    if (currentStep === 3 && requestData.services.length === 0 && requestData.type === 'cloud') {
        alert('Please select at least one service');
        return;
    }
    if (currentStep === 4) {
        // Collect resources from textareas
        let hasResources = false;
        requestData.services.forEach(service => {
            const textarea = document.getElementById(`resources_${service}`);
            if (textarea && textarea.value.trim()) {
                const resourceLines = textarea.value.trim().split('\n').filter(line => line.trim());
                if (resourceLines.length > 0) {
                    if (!requestData.resources[service]) {
                        requestData.resources[service] = [];
                    }
                    resourceLines.forEach(line => {
                        requestData.resources[service].push({ id: line.trim(), name: line.trim() });
                    });
                    hasResources = true;
                }
            }
        });
        
        if (!hasResources) {
            alert('Please enter at least one resource for the selected services');
            return;
        }
    }
    
    loadStep(currentStep + 1);
}

function goToPreviousStep() {
    if (currentStep > 1) {
        loadStep(currentStep - 1);
    }
}

// Submit request
async function submitRequest() {
    const actions = document.getElementById('requestActions')?.value;
    const justification = document.getElementById('requestJustification')?.value;
    const duration = document.getElementById('requestDuration')?.value;
    
    if (!actions || !justification) {
        alert('Please fill in all required fields');
        return;
    }
    
    requestData.actions = actions.split(',').map(a => a.trim());
    requestData.justification = justification;
    requestData.duration_hours = parseInt(duration);
    
    // Generate policy with explicit ARNs (no "*")
    const policy = generatePolicyWithExplicitARNs();
    
    // Show policy in floating bubble
    showPolicyBubble(policy);
}

// Generate policy with explicit ARNs
function generatePolicyWithExplicitARNs() {
    const statements = [];
    
    if (requestData.type === 'cloud' && requestData.services.length > 0) {
        // For each service, create statement with explicit resource ARNs
        for (const service of requestData.services) {
            const resources = requestData.resources[service] || [];
            if (resources.length === 0) continue;
            
            // Build resource ARNs
            const resourceArns = resources.map(res => {
                return buildResourceARN(requestData.provider, requestData.region, service, res.id);
            });
            
            statements.push({
                Sid: service.toUpperCase().replace(/-/g, ''),
                Effect: 'Allow',
                Action: requestData.actions.map(action => {
                    // Ensure action includes service prefix
                    if (!action.includes(':')) {
                        return `${service}:${action}`;
                    }
                    return action;
                }),
                Resource: resourceArns // Explicit ARNs, NO "*"
            });
        }
    } else {
        // For VM/DB/Storage
        const service = requestData.provider;
        const resources = Object.values(requestData.resources).flat();
        
        if (resources.length > 0) {
            const resourceArns = resources.map(res => {
                return buildResourceARN(requestData.provider, requestData.region, service, res.id);
            });
            
            statements.push({
                Effect: 'Allow',
                Action: requestData.actions,
                Resource: resourceArns // Explicit ARNs, NO "*"
            });
        }
    }
    
    return {
        Version: '2012-10-17',
        Statement: statements
    };
}

// Build resource ARN
function buildResourceARN(provider, region, service, resourceId) {
    // This would need account ID - get from CONFIG or request
    const accountId = '332463837037'; // Default, should come from selected account
    
    if (provider === 'aws' || provider === 'ec2' || provider === 's3') {
        if (service === 's3') {
            return `arn:aws:s3:::${resourceId}`;
        } else if (service === 'ec2') {
            return `arn:aws:ec2:${region}:${accountId}:instance/${resourceId}`;
        } else if (service === 'lambda') {
            return `arn:aws:lambda:${region}:${accountId}:function:${resourceId}`;
        } else if (service === 'rds') {
            return `arn:aws:rds:${region}:${accountId}:db:${resourceId}`;
        } else if (service === 'dynamodb') {
            return `arn:aws:dynamodb:${region}:${accountId}:table/${resourceId}`;
        } else if (service === 'kms') {
            return `arn:aws:kms:${region}:${accountId}:key/${resourceId}`;
        } else if (service === 'secretsmanager') {
            return `arn:aws:secretsmanager:${region}:${accountId}:secret:${resourceId}`;
        }
    }
    
    // Fallback - but should never use "*"
    return `arn:aws:${service}:${region}:${accountId}:${resourceId}`;
}

// Show policy in floating bubble
function showPolicyBubble(policy) {
    // Remove existing bubble
    const existing = document.getElementById('policyFloatingBubble');
    if (existing) existing.remove();
    
    const bubble = document.createElement('div');
    bubble.id = 'policyFloatingBubble';
    bubble.className = 'policy-floating-bubble';
    bubble.innerHTML = `
        <div class="policy-bubble-header">
            <h4><i class="fas fa-file-code"></i> Generated Policy</h4>
            <button onclick="closePolicyBubble()"><i class="fas fa-times"></i></button>
        </div>
        <div class="policy-bubble-content">
            <pre>${JSON.stringify(policy, null, 2)}</pre>
        </div>
        <div class="policy-bubble-actions">
            <button class="btn-secondary" onclick="copyPolicy()">
                <i class="fas fa-copy"></i> Copy
            </button>
            <button class="btn-primary" onclick="proceedToApproval()">
                Next: Submit for Approval <i class="fas fa-arrow-right"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(bubble);
}

function closePolicyBubble() {
    const bubble = document.getElementById('policyFloatingBubble');
    if (bubble) bubble.remove();
}

function copyPolicy() {
    const bubble = document.getElementById('policyFloatingBubble');
    if (bubble) {
        const pre = bubble.querySelector('pre');
        if (pre) {
            navigator.clipboard.writeText(pre.textContent);
            alert('Policy copied to clipboard!');
        }
    }
}

async function proceedToApproval() {
    // Submit request to backend
    try {
        const requestBody = {
            user_email: localStorage.getItem('userEmail') || 'user@example.com',
            request_type: requestData.type,
            provider: requestData.provider,
            account_id: requestData.account_id || '332463837037',
            justification: requestData.justification,
            duration_hours: requestData.duration_hours
        };
        
        // If permission set is selected, use it
        if (requestData.permission_set) {
            requestBody.permission_set = requestData.permission_set;
            requestBody.permission_set_name = requestData.permission_set_name;
        } else {
            // For custom permissions, include policy details
            requestBody.region = requestData.region;
            requestBody.services = requestData.services;
            requestBody.resources = requestData.resources;
            requestBody.actions = requestData.actions;
            requestBody.policy = generatePolicyWithExplicitARNs();
        }
        
        const response = await fetch('http://127.0.0.1:5000/api/request-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        const result = await response.json();
        
        if (result.error) {
            alert('Error: ' + result.error);
        } else {
            alert('✅ Request submitted successfully!\n\nRequest ID: ' + result.request_id);
            closePolicyBubble();
            closeNewRequestModal();
            if (typeof loadRequestsPage === 'function') {
                loadRequestsPage();
            }
            updateRequestCounts();
        }
    } catch (error) {
        console.error('Error submitting request:', error);
        alert('Error submitting request: ' + error.message);
    }
}

// Filter requests by status
function filterRequestsByStatus(status) {
    currentFilter = status;
    
    // Update tab buttons
    document.querySelectorAll('.status-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.getAttribute('data-status') === status) {
            tab.classList.add('active');
        }
    });
    
    loadRequests();
}

// AI Help functions
function toggleRequestAIHelp() {
    const chat = document.getElementById('requestAIHelpChat');
    if (chat) {
        chat.style.display = chat.style.display === 'none' ? 'block' : 'none';
    }
}

async function sendAIHelpMessage() {
    const input = document.getElementById('aiHelpChatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Add user message
    addAIHelpMessage('user', message);
    input.value = '';
    
    // Show loading
    addAIHelpMessage('assistant', 'thinking', true);
    
    try {
        const response = await fetch('http://127.0.0.1:5000/api/unified-assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_message: message,
                user_email: localStorage.getItem('userEmail') || 'user@example.com'
            })
        });
        
        const data = await response.json();
        
        // Remove loading
        const messages = document.getElementById('aiHelpChatMessages');
        const loading = messages.querySelector('.loading');
        if (loading) loading.remove();
        
        if (data.ai_response) {
            addAIHelpMessage('assistant', data.ai_response);
        }
    } catch (error) {
        console.error('AI Help error:', error);
        const messages = document.getElementById('aiHelpChatMessages');
        const loading = messages.querySelector('.loading');
        if (loading) loading.remove();
        addAIHelpMessage('error', 'Error: ' + error.message);
    }
}

function addAIHelpMessage(role, content, isLoading = false) {
    const messagesDiv = document.getElementById('aiHelpChatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-help-message ${role} ${isLoading ? 'loading' : ''}`;
    
    if (role === 'user') {
        messageDiv.innerHTML = `<strong>You:</strong> ${escapeHtml(content)}`;
    } else if (role === 'assistant') {
        if (isLoading) {
            messageDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Thinking...';
        } else {
            messageDiv.innerHTML = `<strong>AI:</strong> ${escapeHtml(content).replace(/\n/g, '<br>')}`;
        }
    } else {
        messageDiv.innerHTML = `<span style="color: #c33;">${escapeHtml(content)}</span>`;
    }
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Update request counts (called from App.js)
function updateRequestCounts() {
    if (typeof requests === 'undefined') return;
    
    const pending = requests.filter(r => r.status === 'pending').length;
    const approved = requests.filter(r => r.status === 'approved').length;
    const denied = requests.filter(r => r.status === 'denied').length;
    const ongoing = requests.filter(r => r.status === 'approved' && new Date(r.expires_at) > new Date()).length;
    
    const pendingEl = document.getElementById('pendingCount');
    const approvedEl = document.getElementById('approvedCount');
    const deniedEl = document.getElementById('deniedCount');
    const ongoingEl = document.getElementById('ongoingCount');
    
    if (pendingEl) pendingEl.textContent = pending;
    if (approvedEl) approvedEl.textContent = approved;
    if (deniedEl) deniedEl.textContent = denied;
    if (ongoingEl) ongoingEl.textContent = ongoing;
}

// Call updateRequestCounts when requests are loaded
if (typeof loadRequestsPage === 'function') {
    const originalLoadRequestsPage = loadRequestsPage;
    loadRequestsPage = function() {
        originalLoadRequestsPage();
        setTimeout(updateRequestCounts, 100);
    };
}

// Make functions global for onclick handlers
// Make functions global for onclick handlers
window.selectAccount = selectAccount;
window.selectPermissionSet = selectPermissionSet;
window.selectCustomPermissions = selectCustomPermissions;
window.selectCloudProvider = selectCloudProvider;
window.selectVMType = selectVMType;
window.selectDBPlatform = selectDBPlatform;
window.selectStorageType = selectStorageType;
window.goToNextStep = goToNextStep;
window.goToPreviousStep = goToPreviousStep;
window.selectRegion = selectRegion;
window.selectService = selectService;
window.removeService = removeService;
window.selectResource = selectResource;
window.addManualResource = addManualResource;
window.removeResource = removeResource;
window.submitRequest = submitRequest;
window.sendAIHelpMessage = sendAIHelpMessage;
window.toggleRequestAIHelp = toggleRequestAIHelp;
window.showNewRequestModal = showNewRequestModal;
window.closeNewRequestModal = closeNewRequestModal;
window.showRequestTypeTab = showRequestTypeTab;

// Debug: Log when script loads
console.log('✅ structured-requests.js loaded');
console.log('Functions available:', {
    selectCloudProvider: typeof selectCloudProvider,
    showRequestTypeTab: typeof showRequestTypeTab,
    showNewRequestModal: typeof showNewRequestModal
});

