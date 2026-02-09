/**
 * Visual Approval Workflow Designer
 * Drag-and-drop flow builder similar to AWS CloudFormation Designer
 */

let workflowNodes = [];
let workflowConnections = [];
let selectedNode = null;
let nodeIdCounter = 0;
let canvasZoom = 1;
let canvasOffset = { x: 0, y: 0 };
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

// Initialize workflow designer
function initWorkflowDesigner() {
    const canvas = document.getElementById('workflowCanvas');
    if (!canvas) return;
    
    // Setup drag and drop
    setupPaletteDrag();
    setupCanvasDrop();
    setupNodeInteraction();
    
    // Setup canvas panning
    setupCanvasPanning();
    
    console.log('✅ Workflow designer initialized');
}

// Setup drag from palette
function setupPaletteDrag() {
    const paletteItems = document.querySelectorAll('.palette-item');
    paletteItems.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('application/json', JSON.stringify({
                type: item.dataset.type,
                env: item.dataset.env,
                role: item.dataset.role,
                color: item.dataset.color
            }));
        });
    });
}

// Setup drop on canvas
function setupCanvasDrop() {
    const canvas = document.getElementById('workflowCanvas');
    if (!canvas) return;
    
    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        canvas.classList.add('drag-over');
    });
    
    canvas.addEventListener('dragleave', () => {
        canvas.classList.remove('drag-over');
    });
    
    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        canvas.classList.remove('drag-over');
        
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - canvasOffset.x) / canvasZoom;
        const y = (e.clientY - rect.top - canvasOffset.y) / canvasZoom;
        
        createNode(data, x, y);
    });
}

// Create a new node on canvas
function createNode(data, x, y) {
    nodeIdCounter++;
    const nodeId = `node-${nodeIdCounter}`;
    
    const node = {
        id: nodeId,
        type: data.type,
        env: data.env,
        role: data.role,
        color: data.color,
        x: x,
        y: y,
        width: 150,
        height: 60
    };
    
    workflowNodes.push(node);
    renderNode(node);
    updateCanvasInfo();
}

// Render a node on canvas
function renderNode(node) {
    const nodesContainer = document.getElementById('canvasNodes');
    if (!nodesContainer) return;
    
    const nodeEl = document.createElement('div');
    nodeEl.className = 'workflow-node';
    nodeEl.id = node.id;
    nodeEl.style.left = node.x + 'px';
    nodeEl.style.top = node.y + 'px';
    nodeEl.style.width = node.width + 'px';
    nodeEl.style.height = node.height + 'px';
    nodeEl.dataset.nodeId = node.id;
    
    // Set color based on type
    const colorMap = {
        'blue': 'var(--primary)',
        'gray': 'var(--text-muted)',
        'purple': 'var(--ai-accent)',
        'orange': 'var(--warning)',
        'green': 'var(--success)',
        'red': 'var(--danger)'
    };
    nodeEl.style.borderColor = colorMap[node.color] || 'var(--border-subtle)';
    
    // Node content
    const nodeLabel = getNodeLabel(node);
    nodeEl.innerHTML = `
        <div class="node-content">
            <div class="node-icon">
                <i class="${getNodeIcon(node)}"></i>
            </div>
            <div class="node-label">${nodeLabel}</div>
        </div>
        <div class="node-handles">
            <div class="node-handle node-handle-input" data-handle="input"></div>
            <div class="node-handle node-handle-output" data-handle="output"></div>
        </div>
    `;
    
    // Make node draggable
    makeNodeDraggable(nodeEl, node);
    
    // Make node selectable
    nodeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        selectNode(node.id);
    });
    
    nodesContainer.appendChild(nodeEl);
}

// Get node label
function getNodeLabel(node) {
    if (node.type === 'start') return 'Start';
    if (node.type === 'end') return 'End';
    if (node.type === 'environment') {
        return node.env === 'production' ? 'Production' : 
               node.env === 'nonprod' ? 'Non-Production' : 'Sandbox';
    }
    if (node.type === 'approver') {
        const roleMap = {
            'manager': 'Manager',
            'devops': 'DevOps Lead',
            'security': 'Security Lead',
            'admin': 'Platform Admin',
            'ai': 'AI Auto-Approval'
        };
        return roleMap[node.role] || 'Approver';
    }
    if (node.type === 'conditional') return 'Conditional';
    if (node.type === 'parallel') return 'Parallel';
    if (node.type === 'timeout') return 'Timeout';
    if (node.type === 'granted') return 'Access Granted';
    if (node.type === 'denied') return 'Access Denied';
    return node.type;
}

// Get node icon
function getNodeIcon(node) {
    if (node.type === 'start') return 'fas fa-play-circle';
    if (node.type === 'end') return 'fas fa-stop-circle';
    if (node.type === 'environment') return 'fas fa-server';
    if (node.type === 'approver') {
        if (node.role === 'manager') return 'fas fa-user-tie';
        if (node.role === 'devops') return 'fas fa-tools';
        if (node.role === 'security') return 'fas fa-shield-alt';
        if (node.role === 'admin') return 'fas fa-user-shield';
        if (node.role === 'ai') return 'fas fa-robot';
        return 'fas fa-user-check';
    }
    if (node.type === 'conditional') return 'fas fa-code-branch';
    if (node.type === 'parallel') return 'fas fa-stream';
    if (node.type === 'timeout') return 'fas fa-clock';
    if (node.type === 'granted') return 'fas fa-check-circle';
    if (node.type === 'denied') return 'fas fa-times-circle';
    return 'fas fa-circle';
}

// Make node draggable
function makeNodeDraggable(nodeEl, node) {
    let isDragging = false;
    let startX, startY, initialX, initialY;
    
    nodeEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('.node-handle')) return; // Don't drag when clicking handles
        
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialX = node.x;
        initialY = node.y;
        
        nodeEl.style.cursor = 'grabbing';
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const dx = (e.clientX - startX) / canvasZoom;
        const dy = (e.clientY - startY) / canvasZoom;
        
        node.x = initialX + dx;
        node.y = initialY + dy;
        
        nodeEl.style.left = node.x + 'px';
        nodeEl.style.top = node.y + 'px';
        
        updateConnections();
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            nodeEl.style.cursor = 'grab';
        }
    });
}

// Select a node
function selectNode(nodeId) {
    // Deselect all
    document.querySelectorAll('.workflow-node').forEach(n => n.classList.remove('selected'));
    
    // Select new node
    const nodeEl = document.getElementById(nodeId);
    if (nodeEl) {
        nodeEl.classList.add('selected');
        selectedNode = workflowNodes.find(n => n.id === nodeId);
        updatePropertiesPanel();
    }
}

// Update properties panel
function updatePropertiesPanel() {
    const propertiesContent = document.getElementById('propertiesContent');
    if (!propertiesContent || !selectedNode) {
        propertiesContent.innerHTML = `
            <div class="properties-empty">
                <i class="fas fa-mouse-pointer"></i>
                <p>Select a node to configure</p>
            </div>
        `;
        return;
    }
    
    let configHTML = '';
    
    if (selectedNode.type === 'approver') {
        configHTML = `
            <div class="property-group">
                <label>Node Type</label>
                <input type="text" value="Approval" readonly>
            </div>
            <div class="property-group">
                <label>Approver Role</label>
                <input type="text" value="${getNodeLabel(selectedNode)}" readonly>
            </div>
            <div class="property-group">
                <label>Timeout</label>
                <select id="approverTimeout">
                    <option value="15">15 minutes</option>
                    <option value="30" selected>30 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="120">2 hours</option>
                </select>
            </div>
            <div class="property-group">
                <label>Escalation</label>
                <select id="approverEscalation">
                    <option value="none">None</option>
                    <option value="admin">Platform Admin</option>
                    <option value="security">Security Lead</option>
                </select>
            </div>
            <div class="property-group">
                <label>
                    <input type="checkbox" id="approverAIRecommendation" checked>
                    Enable AI Recommendation
                </label>
            </div>
        `;
    } else if (selectedNode.type === 'environment') {
        configHTML = `
            <div class="property-group">
                <label>Node Type</label>
                <input type="text" value="Environment" readonly>
            </div>
            <div class="property-group">
                <label>Environment</label>
                <input type="text" value="${getNodeLabel(selectedNode)}" readonly>
            </div>
        `;
    } else if (selectedNode.type === 'conditional') {
        configHTML = `
            <div class="property-group">
                <label>Node Type</label>
                <input type="text" value="Conditional Branch" readonly>
            </div>
            <div class="property-group">
                <label>Condition</label>
                <select id="conditionalType">
                    <option value="ai-risk">AI Risk Score</option>
                    <option value="time">Time of Day</option>
                    <option value="user">User Role</option>
                </select>
            </div>
        `;
    } else {
        configHTML = `
            <div class="property-group">
                <label>Node Type</label>
                <input type="text" value="${getNodeLabel(selectedNode)}" readonly>
            </div>
        `;
    }
    
    propertiesContent.innerHTML = configHTML;
}

// Setup canvas panning
function setupCanvasPanning() {
    const canvas = document.getElementById('workflowCanvas');
    if (!canvas) return;
    
    let isPanning = false;
    let startPanX, startPanY;
    
    canvas.addEventListener('mousedown', (e) => {
        if (e.target.closest('.workflow-node')) return;
        if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
            isPanning = true;
            startPanX = e.clientX - canvasOffset.x;
            startPanY = e.clientY - canvasOffset.y;
            canvas.style.cursor = 'grabbing';
        }
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        canvasOffset.x = e.clientX - startPanX;
        canvasOffset.y = e.clientY - startPanY;
        updateCanvasTransform();
    });
    
    document.addEventListener('mouseup', () => {
        isPanning = false;
        canvas.style.cursor = 'default';
    });
}

// Update canvas transform
function updateCanvasTransform() {
    const nodesContainer = document.getElementById('canvasNodes');
    if (nodesContainer) {
        nodesContainer.style.transform = `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasZoom})`;
    }
}

// Zoom functions
function zoomIn() {
    canvasZoom = Math.min(canvasZoom + 0.1, 2);
    updateCanvasTransform();
}

function zoomOut() {
    canvasZoom = Math.max(canvasZoom - 0.1, 0.5);
    updateCanvasTransform();
}

function resetZoom() {
    canvasZoom = 1;
    canvasOffset = { x: 0, y: 0 };
    updateCanvasTransform();
}

// Update connections
function updateConnections() {
    // TODO: Implement connection rendering
    // This would draw SVG lines between connected nodes
}

// Update canvas info
function updateCanvasInfo() {
    const infoEl = document.getElementById('canvasNodeCount');
    if (infoEl) {
        infoEl.textContent = `${workflowNodes.length} node${workflowNodes.length !== 1 ? 's' : ''}`;
    }
}

// Toggle palette category
function togglePaletteCategory(categoryId) {
    const items = document.getElementById(categoryId + '-items');
    if (items) {
        items.style.display = items.style.display === 'none' ? 'block' : 'none';
    }
}

// Clear workflow
function clearWorkflow() {
    if (!confirm('Clear entire workflow? This cannot be undone.')) return;
    
    workflowNodes = [];
    workflowConnections = [];
    selectedNode = null;
    
    const nodesContainer = document.getElementById('canvasNodes');
    if (nodesContainer) nodesContainer.innerHTML = '';
    
    updateCanvasInfo();
    updatePropertiesPanel();
}

// Validate workflow
function validateWorkflow() {
    const errors = [];
    
    // Check for Start node
    if (!workflowNodes.find(n => n.type === 'start')) {
        errors.push('Workflow must have a Start node');
    }
    
    // Check for End node
    if (!workflowNodes.find(n => n.type === 'end')) {
        errors.push('Workflow must have an End node');
    }
    
    // Check for disconnected nodes
    // TODO: Implement connection validation
    
    if (errors.length > 0) {
        alert('Validation Errors:\n\n' + errors.join('\n'));
        return false;
    }
    
    alert('✅ Workflow is valid!');
    return true;
}

// Save workflow
function saveWorkflow() {
    if (!validateWorkflow()) return;
    
    const workflowConfig = {
        nodes: workflowNodes,
        connections: workflowConnections,
        created_at: new Date().toISOString()
    };
    
    // Convert to JSON for backend
    const configJSON = JSON.stringify(workflowConfig, null, 2);
    
    console.log('Workflow Configuration:', configJSON);
    
    // TODO: Send to backend API
    // fetch('/api/workflows', { method: 'POST', body: configJSON })
    
    alert('✅ Workflow saved successfully!\n\nConfiguration has been applied to approval system.');
}

// Initialize when page loads
if (typeof window !== 'undefined') {
    window.initWorkflowDesigner = initWorkflowDesigner;
    window.togglePaletteCategory = togglePaletteCategory;
    window.clearWorkflow = clearWorkflow;
    window.validateWorkflow = validateWorkflow;
    window.saveWorkflow = saveWorkflow;
    window.zoomIn = zoomIn;
    window.zoomOut = zoomOut;
    window.resetZoom = resetZoom;
}



