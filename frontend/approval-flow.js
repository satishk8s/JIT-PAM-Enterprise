// Approval Flow Visualization

function renderApprovalFlow(request) {
    const steps = buildApprovalSteps(request);
    
    return `
        <div class="approval-flow-container">
            <div class="approval-flow-header">
                <h3><i class="fas fa-route"></i> Approval Workflow</h3>
                <span style="color: var(--text-secondary); font-size: 12px;">Request ID: ${request.id}</span>
            </div>
            <div class="approval-flow-timeline">
                ${steps.map((step, index) => `
                    ${renderFlowStep(step)}
                    ${index < steps.length - 1 ? renderFlowArrow(steps[index + 1].state) : ''}
                `).join('')}
            </div>
        </div>
    `;
}

function buildApprovalSteps(request) {
    const status = (request.status || 'pending').toLowerCase();
    const now = new Date();
    
    // Step 1: Request Raised
    const step1 = {
        name: 'Request Raised',
        icon: '📝',
        state: 'approved',
        actor: request.user_email || request.requester || 'User',
        timestamp: formatTimestamp(request.created_at || request.requestedAt)
    };
    
    // Step 2: Manager Approval
    const step2 = {
        name: 'Manager Approval',
        icon: '👤',
        state: status === 'pending' ? 'pending' : (status === 'denied' ? 'denied' : 'approved'),
        actor: request.manager || 'Manager',
        timestamp: formatTimestamp(request.approved_at || request.managerApprovedAt)
    };
    
    // Step 3: Security Approval (if required)
    const step3 = {
        name: 'Security Approval',
        icon: '🛡️',
        state: status === 'pending' ? 'inactive' : (status === 'denied' ? 'denied' : 'approved'),
        actor: 'Security Team',
        timestamp: formatTimestamp(request.securityApprovedAt)
    };
    
    // Step 4: System Grant
    const step4 = {
        name: 'System Grant',
        icon: '⚙️',
        state: status === 'approved' || status === 'ongoing' ? 'approved' : 'inactive',
        actor: 'Automated',
        timestamp: formatTimestamp(request.granted_at || request.grantedAt)
    };
    
    // Step 5: Access Active
    const isActive = status === 'ongoing' || (status === 'approved' && request.expires_at && new Date(request.expires_at) > now);
    const step5 = {
        name: 'Access Active',
        icon: '✅',
        state: isActive ? 'active' : (status === 'expired' ? 'approved' : 'inactive'),
        actor: 'System',
        timestamp: formatTimestamp(request.started_at || request.startedAt),
        countdown: isActive ? calculateTimeRemaining(request.expires_at || request.expiresAt) : null
    };
    
    // Step 6: Expired
    const step6 = {
        name: 'Expired',
        icon: '⏰',
        state: status === 'expired' ? 'approved' : 'inactive',
        actor: 'Auto-Revoked',
        timestamp: formatTimestamp(request.expired_at || request.expiredAt)
    };
    
    return [step1, step2, step3, step4, step5, step6];
}

function formatTimestamp(timestamp) {
    if (!timestamp) return null;
    try {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    } catch (e) {
        return timestamp;
    }
}

function renderFlowStep(step) {
    const statusText = {
        'approved': 'Approved',
        'pending': 'Pending',
        'active': 'Active',
        'denied': 'Denied',
        'inactive': 'Not Reached'
    }[step.state];
    
    return `
        <div class="flow-step">
            <div class="flow-step-card ${step.state}">
                <div class="flow-step-icon">${step.icon}</div>
                <div class="flow-step-name">${step.name}</div>
                <span class="flow-step-status ${step.state}">${statusText}</span>
                <div class="flow-step-actor">${step.actor}</div>
                ${step.timestamp ? `<div class="flow-step-time">${step.timestamp}</div>` : ''}
                ${step.countdown ? `<div class="flow-countdown">⏱️ ${step.countdown}</div>` : ''}
                ${renderTooltip(step)}
            </div>
        </div>
    `;
}

function renderFlowArrow(nextState) {
    return `<div class="flow-arrow ${nextState}">→</div>`;
}

function renderTooltip(step) {
    if (step.state === 'inactive') return '';
    
    return `
        <div class="flow-step-tooltip">
            <strong>${step.name}</strong><br>
            Status: ${step.state}<br>
            ${step.actor ? `Actor: ${step.actor}<br>` : ''}
            ${step.timestamp ? `Time: ${step.timestamp}` : 'Waiting...'}
        </div>
    `;
}

function calculateTimeRemaining(expiresAt) {
    if (!expiresAt) return 'N/A';
    
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry - now;
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m remaining`;
}

// Show approval flow in request detail modal
function showRequestDetailWithFlow(requestId) {
    const request = getRequestById(requestId);
    if (!request) return;
    
    const modal = document.getElementById('requestDetailModal');
    if (!modal) {
        createRequestDetailModal();
    }
    
    const modalContent = document.getElementById('requestDetailContent');
    modalContent.innerHTML = `
        <div style="padding: 20px;">
            <h2 style="margin-bottom: 20px; color: var(--text-primary);">Request Details</h2>
            
            ${renderApprovalFlow(request)}
            
            <div style="margin-top: 30px; padding: 20px; background: var(--bg-secondary); border-radius: 8px;">
                <h4 style="margin-bottom: 15px; color: var(--text-primary);">Request Information</h4>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                    <div>
                        <strong style="color: var(--text-secondary);">Requester:</strong>
                        <div style="color: var(--text-primary);">${request.user_email || 'Unknown'}</div>
                    </div>
                    <div>
                        <strong style="color: var(--text-secondary);">Account:</strong>
                        <div style="color: var(--text-primary);">${request.account_id || 'N/A'}</div>
                    </div>
                    <div>
                        <strong style="color: var(--text-secondary);">Permission Set:</strong>
                        <div style="color: var(--text-primary);">${request.permission_set || 'AI-Generated'}</div>
                    </div>
                    <div>
                        <strong style="color: var(--text-secondary);">Duration:</strong>
                        <div style="color: var(--text-primary);">${request.duration_hours || 8} hours</div>
                    </div>
                    <div>
                        <strong style="color: var(--text-secondary);">Status:</strong>
                        <div style="color: var(--text-primary); text-transform: capitalize;">${request.status}</div>
                    </div>
                    <div>
                        <strong style="color: var(--text-secondary);">Requested At:</strong>
                        <div style="color: var(--text-primary);">${formatTimestamp(request.created_at)}</div>
                    </div>
                </div>
                <div style="margin-top: 15px;">
                    <strong style="color: var(--text-secondary);">Justification:</strong>
                    <div style="color: var(--text-primary); margin-top: 5px;">${request.justification || 'No justification provided'}</div>
                </div>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

function createRequestDetailModal() {
    const modal = document.createElement('div');
    modal.id = 'requestDetailModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 1200px; width: 90%;">
            <button class="modal-close-btn" onclick="closeRequestDetailModal()">
                <i class="fas fa-times"></i>
            </button>
            <div id="requestDetailContent"></div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeRequestDetailModal() {
    const modal = document.getElementById('requestDetailModal');
    if (modal) modal.style.display = 'none';
}

function getRequestById(requestId) {
    // Get from existing requests array
    if (typeof requests !== 'undefined') {
        return requests.find(r => r.id === requestId);
    }
    if (typeof window.allRequests !== 'undefined') {
        return window.allRequests.find(r => r.id === requestId);
    }
    return null;
}

// Update countdown timers every minute
setInterval(() => {
    const activeFlows = document.querySelectorAll('.flow-countdown');
    activeFlows.forEach(countdown => {
        const card = countdown.closest('.flow-step-card');
        const request = getRequestById(card.dataset.requestId);
        if (request && request.expiresAt) {
            countdown.textContent = '⏱️ ' + calculateTimeRemaining(request.expiresAt);
        }
    });
}, 60000);
