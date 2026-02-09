// Visual Approval Flow Builder

let flowNodes = [];
let flowConnections = [];
let selectedNode = null;
let draggedNode = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

// Initialize flow builder
function initFlowBuilder() {
    const container = document.getElementById('flowBuilderContainer');
    if (!container) return;
    
    container.innerHTML = `
        <div class="flow-toolbar">
            <button class="flow-toolbar-btn" onclick="clearFlow()">
                <i class="fas fa-trash"></i> Clear
            </button>
            <button class="flow-toolbar-btn" onclick="validateFlow()">
                <i class="fas fa-check-circle"></i> Validate
            </button>
            <button class="flow-toolbar-btn primary" onclick="saveFlow()">
                <i class="fas fa-save"></i> Save Workflow
            </button>
        </div>
        <div class="flow-builder-container">
            <div class="flow-palette">
                <h3><i class="fas fa-th-large"></i> Components</h3>
                ${renderPalette()}
            </div>
            <div class="flow-canvas" id="flowCanvas">
                <div class="flow-canvas-grid"></div>
                <div class="flow-canvas-content" id="flowCanvasContent">
                    <div class="flow-empty-state">
                        <i class="fas fa-project-diagram"></i>
                        <p>Drag components from the left to build your approval workflow</p>
                    </div>
                </div>
                <svg style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;">
                    <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                            <polygon points="0 0, 10 3, 0 6" fill="#38BDF8" />
                        </marker>
                    </defs>
                    <g id="flowConnections"></g>
                </svg>
            </div>
            <div class="flow-properties" id="flowProperties">
                <h3><i class="fas fa-cog"></i> Properties</h3>
                <p style="color: var(--text-secondary); font-size: 13px;">Select a node to configure its properties</p>
            </div>
        </div>
    `;
    
    setupDragAndDrop();
}

// Render component palette
function renderPalette() {
    const categories = [
        {
            title: 'Flow Control',
            icon: 'fa-play-circle',
            items: [
                { id: 'start', label: 'Start', icon: getIcon('workflow', 'start'), type: 'start' },
                { id: 'end', label: 'End', icon: getIcon('workflow', 'end'), type: 'end' }
            ]
        },
        {
            title: 'Environment',
            icon: 'fa-server',
            items: [
                { id: 'prod', label: 'Production', icon: getIcon('security', 'shield'), type: 'environment' },
                { id: 'nonprod', label: 'Non-Production', icon: getIcon('security', 'server'), type: 'environment' },
                { id: 'sandbox', label: 'Sandbox', icon: getIcon('security', 'server'), type: 'environment' }
            ]
        },
        {
            title: 'Approvers',
            icon: 'fa-users',
            items: [
                { id: 'manager', label: 'Manager', icon: getIcon('security', 'userTie'), type: 'approval' },
                { id: 'devops', label: 'DevOps Lead', icon: getIcon('security', 'gear'), type: 'approval' },
                { id: 'security', label: 'Security Lead', icon: getIcon('security', 'shield'), type: 'approval' },
                { id: 'admin', label: 'Platform Admin', icon: getIcon('security', 'user'), type: 'approval' },
                { id: 'ai', label: 'AI Auto-Approval', icon: getIcon('security', 'brain'), type: 'approval' }
            ]
        },
        {
            title: 'Conditions',
            icon: 'fa-code-branch',
            items: [
                { id: 'conditional', label: 'Conditional', icon: getIcon('workflow', 'conditional'), type: 'conditional' },
                { id: 'parallel', label: 'Parallel Approval', icon: getIcon('workflow', 'conditional'), type: 'conditional' },
                { id: 'timeout', label: 'Timeout', icon: getIcon('security', 'lock'), type: 'conditional' }
            ]
        },
        {
            title: 'Outcomes',
            icon: 'fa-check-circle',
            items: [
                { id: 'granted', label: 'Access Granted', icon: getIcon('workflow', 'check'), type: 'granted' },
                { id: 'denied', label: 'Access Denied', icon: getIcon('workflow', 'times'), type: 'denied' }
            ]
        }
    ];
    
    return categories.map(cat => `
        <div class="palette-category">
            <div class="palette-category-title">
                <i class="fas ${cat.icon}"></i>
                ${cat.title}
            </div>
            <div class="palette-items">
                ${cat.items.map(item => `
                    <div class="palette-item" draggable="true" 
                         data-node-type="${item.type}" 
                         data-node-id="${item.id}" 
                         data-node-label="${item.label}"
                         data-node-icon='${item.icon}'>
                        <span class="palette-item-icon">${item.icon}</span>
                        <span class="palette-item-label">${item.label}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// Setup drag and drop
function setupDragAndDrop() {
    const paletteItems = document.querySelectorAll('.palette-item');
    const canvas = document.getElementById('flowCanvasContent');
    
    paletteItems.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('nodeType', item.dataset.nodeType);
            e.dataTransfer.setData('nodeId', item.dataset.nodeId);
            e.dataTransfer.setData('nodeLabel', item.dataset.nodeLabel);
            e.dataTransfer.setData('nodeIcon', item.dataset.nodeIcon);
        });
    });
    
    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    
    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        const nodeType = e.dataTransfer.getData('nodeType');
        const nodeId = e.dataTransfer.getData('nodeId');
        const nodeLabel = e.dataTransfer.getData('nodeLabel');
        const nodeIcon = e.dataTransfer.getData('nodeIcon');
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        addNode(nodeType, nodeId, nodeLabel, x, y, nodeIcon);
    });
}

// Add node to canvas
function addNode(type, id, label, x, y, icon) {
    const node = {
        id: `node_${Date.now()}`,
        type: type,
        nodeId: id,
        label: label,
        icon: icon || '',
        x: x,
        y: y,
        config: {
            timeout: 30,
            escalation: '',
            aiEnabled: false
        }
    };
    
    flowNodes.push(node);
    renderCanvas();
    
    // Remove empty state
    const emptyState = document.querySelector('.flow-empty-state');
    if (emptyState) emptyState.remove();
}

// Render canvas
function renderCanvas() {
    const canvas = document.getElementById('flowCanvasContent');
    const existingNodes = canvas.querySelectorAll('.flow-node');
    existingNodes.forEach(n => n.remove());
    
    flowNodes.forEach(node => {
        const nodeEl = document.createElement('div');
        nodeEl.className = `flow-node ${node.type}`;
        nodeEl.id = node.id;
        nodeEl.style.left = node.x + 'px';
        nodeEl.style.top = node.y + 'px';
        nodeEl.innerHTML = `
            <button class="flow-node-delete" onclick="deleteNode('${node.id}')">
                <i class="fas fa-times"></i>
            </button>
            <div class="flow-node-header">
                <span class="flow-node-icon">${node.icon || ''}</span>
                <div>
                    <div class="flow-node-title">${node.label}</div>
                    <div class="flow-node-subtitle">${node.type}</div>
                </div>
            </div>
        `;
        
        nodeEl.addEventListener('click', () => selectNode(node.id));
        nodeEl.addEventListener('mousedown', (e) => startDrag(e, node.id));
        
        canvas.appendChild(nodeEl);
    });
}

// Select node
function selectNode(nodeId) {
    selectedNode = flowNodes.find(n => n.id === nodeId);
    
    document.querySelectorAll('.flow-node').forEach(n => n.classList.remove('selected'));
    document.getElementById(nodeId)?.classList.add('selected');
    
    renderProperties();
}

// Render properties panel
function renderProperties() {
    const panel = document.getElementById('flowProperties');
    
    if (!selectedNode) {
        panel.innerHTML = `
            <h3><i class="fas fa-cog"></i> Properties</h3>
            <p style="color: var(--text-secondary); font-size: 13px;">Select a node to configure its properties</p>
        `;
        return;
    }
    
    panel.innerHTML = `
        <h3><i class="fas fa-cog"></i> Properties</h3>
        <div class="flow-property-group">
            <label class="flow-property-label">Node Type</label>
            <input type="text" class="flow-property-input" value="${selectedNode.type}" readonly>
        </div>
        <div class="flow-property-group">
            <label class="flow-property-label">Label</label>
            <input type="text" class="flow-property-input" value="${selectedNode.label}" onchange="updateNodeLabel(this.value)">
        </div>
        ${selectedNode.type === 'approval' ? `
            <div class="flow-property-group">
                <label class="flow-property-label">Timeout (minutes)</label>
                <input type="number" class="flow-property-input" value="${selectedNode.config.timeout}" onchange="updateNodeConfig('timeout', this.value)">
            </div>
            <div class="flow-property-group">
                <label class="flow-property-label">Escalation To</label>
                <select class="flow-property-select" onchange="updateNodeConfig('escalation', this.value)">
                    <option value="">None</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Platform Admin</option>
                </select>
            </div>
            <div class="flow-property-group">
                <label class="flow-property-label">
                    <input type="checkbox" ${selectedNode.config.aiEnabled ? 'checked' : ''} onchange="updateNodeConfig('aiEnabled', this.checked)">
                    Enable AI Recommendation
                </label>
            </div>
        ` : ''}
        <div class="flow-ai-suggestion">
            <i class="fas fa-lightbulb flow-ai-suggestion-icon"></i>
            <strong>AI Suggestion:</strong> ${getAISuggestion(selectedNode)}
        </div>
    `;
}

// Get AI suggestion
function getAISuggestion(node) {
    if (node.type === 'approval' && node.nodeId === 'security') {
        return 'Security approval recommended for production environments';
    }
    if (node.type === 'conditional') {
        return 'Parallel approvals can reduce access delay by 40%';
    }
    if (node.config.timeout > 60) {
        return 'Timeout too long for privileged access (recommended: 30 min)';
    }
    return 'Configuration looks good';
}

// Update node config
function updateNodeConfig(key, value) {
    if (selectedNode) {
        selectedNode.config[key] = value;
    }
}

// Update node label
function updateNodeLabel(label) {
    if (selectedNode) {
        selectedNode.label = label;
        renderCanvas();
    }
}

// Delete node
function deleteNode(nodeId) {
    flowNodes = flowNodes.filter(n => n.id !== nodeId);
    if (selectedNode?.id === nodeId) {
        selectedNode = null;
    }
    renderCanvas();
    renderProperties();
}

// Start drag
function startDrag(e, nodeId) {
    if (e.target.classList.contains('flow-node-delete')) return;
    
    isDragging = true;
    draggedNode = flowNodes.find(n => n.id === nodeId);
    const nodeEl = document.getElementById(nodeId);
    const rect = nodeEl.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
}

// On drag
function onDrag(e) {
    if (!isDragging || !draggedNode) return;
    
    const canvas = document.getElementById('flowCanvasContent');
    const rect = canvas.getBoundingClientRect();
    
    draggedNode.x = e.clientX - rect.left - dragOffset.x;
    draggedNode.y = e.clientY - rect.top - dragOffset.y;
    
    const nodeEl = document.getElementById(draggedNode.id);
    nodeEl.style.left = draggedNode.x + 'px';
    nodeEl.style.top = draggedNode.y + 'px';
}

// Stop drag
function stopDrag() {
    isDragging = false;
    draggedNode = null;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
}

// Validate flow
function validateFlow() {
    const errors = [];
    
    if (flowNodes.length === 0) {
        errors.push('Flow is empty');
    }
    
    const hasStart = flowNodes.some(n => n.type === 'start');
    const hasEnd = flowNodes.some(n => n.type === 'end');
    
    if (!hasStart) errors.push('Missing Start node');
    if (!hasEnd) errors.push('Missing End node');
    
    if (errors.length > 0) {
        alert('Validation Errors:\n' + errors.join('\n'));
        return false;
    }
    
    alert('✅ Flow validation passed!');
    return true;
}

// Save flow
function saveFlow() {
    if (!validateFlow()) return;
    
    const flowConfig = {
        nodes: flowNodes,
        connections: flowConnections,
        createdAt: new Date().toISOString()
    };
    
    console.log('Saving flow:', flowConfig);
    alert('✅ Approval workflow saved successfully!');
}

// Clear flow
function clearFlow() {
    if (!confirm('Clear entire workflow?')) return;
    
    flowNodes = [];
    flowConnections = [];
    selectedNode = null;
    
    const canvas = document.getElementById('flowCanvasContent');
    canvas.innerHTML = `
        <div class="flow-empty-state">
            <i class="fas fa-project-diagram"></i>
            <p>Drag components from the left to build your approval workflow</p>
        </div>
    `;
    
    renderProperties();
}
