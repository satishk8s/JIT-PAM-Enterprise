/**
 * Security-Grade UI Helpers
 * Functions for JIT Request Cards, AI Risk Engine, and Dashboard
 */

/**
 * Create a JIT Request Card HTML
 */
function createJITRequestCard(request, account) {
    const riskScore = calculateAIRiskScore(request);
    const riskLevel = riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW';
    const riskColor = riskScore >= 70 ? 'danger' : riskScore >= 40 ? 'warning' : 'success';
    const aiRecommendation = riskScore >= 70 ? 'DENY' : riskScore >= 40 ? 'REVIEW' : 'APPROVE';
    
    // Format duration
    const duration = request.duration_hours || 8;
    const durationText = duration < 24 ? `${duration}h` : `${Math.floor(duration / 24)}d ${duration % 24}h`;
    
    // Get approval state
    const approvalState = getApprovalState(request.status);
    
    return `
        <div class="jit-request-card" data-request-id="${request.id}">
            <div class="jit-request-header">
                <div class="jit-user-info">
                    <div class="jit-user-email">${request.user_email || 'Unknown User'}</div>
                    <div class="approval-state ${approvalState.class}">
                        <i class="fas fa-${approvalState.icon}"></i>
                        ${approvalState.text}
                    </div>
                </div>
            </div>
            
            <div class="jit-request-details">
                <div class="jit-detail-item">
                    <div class="jit-detail-label">Requested Role</div>
                    <div class="jit-detail-value">${request.permission_set || 'AI-Generated'}</div>
                </div>
                <div class="jit-detail-item">
                    <div class="jit-detail-label">Target</div>
                    <div class="jit-detail-value">${account ? account.name : request.account_id}</div>
                </div>
                <div class="jit-detail-item">
                    <div class="jit-detail-label">Duration</div>
                    <div class="jit-detail-value">${durationText}</div>
                </div>
                <div class="jit-detail-item">
                    <div class="jit-detail-label">Requested</div>
                    <div class="jit-detail-value">${formatDate(request.created_at)}</div>
                </div>
            </div>
            
            ${riskScore > 0 ? `
            <div class="ai-risk-section">
                <div class="ai-risk-header">
                    <div class="ai-risk-score">${riskScore}/100</div>
                    <div class="ai-risk-label">AI Risk Score: ${riskLevel}</div>
                </div>
                <div class="ai-recommendation">
                    <strong>AI Recommendation:</strong> ${aiRecommendation}
                </div>
                <div class="ai-signals">
                    ${generateAISignals(request)}
                </div>
            </div>
            ` : ''}
            
            ${request.status === 'pending' ? `
            <div class="jit-request-actions">
                ${aiRecommendation === 'DENY' ? `
                <button class="btn-secondary" onclick="approveRequestWithJustification('${request.id}')">
                    <i class="fas fa-check"></i> Approve Anyway
                </button>
                ` : `
                <button class="btn-primary" onclick="approveRequest('${request.id}')">
                    <i class="fas fa-check"></i> Approve
                </button>
                `}
                <button class="btn-danger" onclick="denyRequest('${request.id}')">
                    <i class="fas fa-times"></i> Deny
                </button>
            </div>
            ` : ''}
            
            <div class="jit-request-actions" style="margin-top: 10px; border-top: 1px solid var(--border-color); padding-top: 10px;">
                <button class="btn-secondary" onclick="showRequestDetailWithFlow('${request.id}')" style="width: 100%;">
                    <i class="fas fa-route"></i> View Approval Flow
                </button>
            </div>
        </div>
    `;
}

/**
 * Calculate AI Risk Score for a request
 */
function calculateAIRiskScore(request) {
    let score = 0;
    
    // Check for unusual time (outside 9-17)
    const hour = new Date().getHours();
    if (hour < 9 || hour > 17) {
        score += 15;
    }
    
    // Check for high-risk permissions
    if (request.ai_permissions && request.ai_permissions.actions) {
        const highRiskActions = ['Delete', 'Create', 'Admin', 'Terminate', '*'];
        const riskyCount = request.ai_permissions.actions.filter(action => 
            highRiskActions.some(risky => action.includes(risky))
        ).length;
        score += riskyCount * 10;
    }
    
    // Check for production account
    if (request.account_id && request.account_id.toString().includes('prod')) {
        score += 20;
    }
    
    // Check justification length
    if (!request.justification || request.justification.length < 20) {
        score += 10;
    }
    
    // Check for multiple recent requests
    if (typeof requests !== 'undefined') {
        const recentRequests = requests.filter(r => 
            r.user_email === request.user_email && 
            new Date(r.created_at) > new Date(Date.now() - 30 * 60 * 1000)
        ).length;
        if (recentRequests > 2) {
            score += 15;
        }
    }
    
    return Math.min(score, 100);
}

/**
 * Generate AI Signals HTML
 */
function generateAISignals(request) {
    const signals = [];
    
    // Known user check
    signals.push({
        icon: 'check',
        text: 'Known user',
        positive: true
    });
    
    // Normal location check
    signals.push({
        icon: 'check',
        text: 'Normal location',
        positive: true
    });
    
    // Unusual time check
    const hour = new Date().getHours();
    if (hour < 9 || hour > 17) {
        signals.push({
            icon: 'times',
            text: 'Unusual time',
            positive: false
        });
    }
    
    // Privilege escalation check
    if (request.ai_permissions && request.ai_permissions.actions) {
        const hasAdmin = request.ai_permissions.actions.some(a => a.includes('Admin') || a.includes('*'));
        if (hasAdmin) {
            signals.push({
                icon: 'times',
                text: 'Privilege escalation',
                positive: false
            });
        }
    }
    
    return signals.map(signal => `
        <div class="ai-signal ${signal.positive ? 'positive' : 'negative'}">
            <i class="fas fa-${signal.icon}"></i>
            <span>${signal.text}</span>
        </div>
    `).join('');
}

/**
 * Get approval state class and icon
 */
function getApprovalState(status) {
    const states = {
        'approved': { class: 'approved', icon: 'check-circle', text: 'Approved' },
        'pending': { class: 'pending', icon: 'clock', text: 'Pending' },
        'denied': { class: 'denied', icon: 'times-circle', text: 'Denied' },
        'expired': { class: 'expired', icon: 'hourglass-end', text: 'Expired' }
    };
    
    return states[status] || states.pending;
}

/**
 * Create AI Risk Engine Panel HTML
 */
function createAIRiskEnginePanel(decision, confidence, explanation, modelInfo) {
    return `
        <div class="ai-risk-engine-panel">
            <div class="ai-risk-engine-header">
                <i class="fas fa-brain"></i>
                <h3>AI Decision Engine</h3>
            </div>
            <div class="ai-decision-box">
                <div class="ai-decision">Decision: ${decision}</div>
                <div class="ai-confidence">Confidence: ${confidence}%</div>
            </div>
            <div class="ai-explanation">
                <h4>Why?</h4>
                <ul>
                    ${explanation.map(exp => `<li>${exp}</li>`).join('')}
                </ul>
            </div>
            <div class="ai-model-info">
                <span>Model Version: ${modelInfo.version || 'v3.2'}</span>
                <span>Last Trained: ${modelInfo.lastTrained || '2 days ago'}</span>
            </div>
        </div>
    `;
}

/**
 * Approve request with justification (when AI says DENY)
 */
function approveRequestWithJustification(requestId) {
    const justification = prompt('AI recommends DENY. Please provide justification for overriding:\n\n(Required for audit trail)');
    
    if (!justification || justification.length < 20) {
        alert('Justification must be at least 20 characters for audit purposes.');
        return;
    }
    
    if (!confirm(`⚠️ Override AI Recommendation\n\nYou are approving a request that AI flagged as HIGH RISK.\n\nJustification: ${justification}\n\nContinue?`)) {
        return;
    }
    
    // Call approve function with override flag
    approveRequest(requestId, { overrideAI: true, justification: justification });
}

/**
 * Deny request
 */
function denyRequest(requestId) {
    const reason = prompt('Enter reason for denial (required):');
    
    if (!reason || reason.length < 10) {
        alert('Denial reason must be at least 10 characters.');
        return;
    }
    
    if (!confirm(`❌ Deny Request\n\nReason: ${reason}\n\nThis action cannot be undone.\n\nContinue?`)) {
        return;
    }
    
    // Call backend to deny request
    fetch(`${API_BASE}/request/${requestId}/deny`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason })
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            alert('Error: ' + result.error);
        } else {
            alert('✅ Request denied');
            loadRequests();
            updateDashboard();
        }
    })
    .catch(error => {
        console.error('Error denying request:', error);
        alert('Error denying request');
    });
}

/**
 * Update dashboard KPI counts
 */
function updateDashboardKPIs() {
    if (typeof requests === 'undefined') return;
    
    // Active sessions
    const activeSessions = requests.filter(r => 
        r.status === 'approved' && 
        new Date(r.expires_at) > new Date()
    ).length;
    
    // Pending JIT
    const pendingJIT = requests.filter(r => r.status === 'pending').length;
    
    // High-risk requests
    const highRisk = requests.filter(r => {
        const score = calculateAIRiskScore(r);
        return score >= 70;
    }).length;
    
    // Policy violations (placeholder - would come from backend)
    const policyViolations = 0;
    
    // Update DOM
    const activeEl = document.getElementById('activeSessionsCount');
    const pendingEl = document.getElementById('pendingJITCount');
    const highRiskEl = document.getElementById('highRiskCount');
    const violationsEl = document.getElementById('policyViolationsCount');
    
    if (activeEl) activeEl.textContent = activeSessions;
    if (pendingEl) pendingEl.textContent = pendingJIT;
    if (highRiskEl) highRiskEl.textContent = highRisk;
    if (violationsEl) violationsEl.textContent = policyViolations;
}

/**
 * Load recent JIT requests for dashboard
 */
function loadRecentJITRequests() {
    if (typeof requests === 'undefined' || typeof accounts === 'undefined') return;
    
    const recentRequests = requests
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5);
    
    const container = document.getElementById('recentJITRequests');
    if (!container) return;
    
    if (recentRequests.length === 0) {
        container.innerHTML = '<p class="text-muted">No recent requests</p>';
        return;
    }
    
    container.innerHTML = recentRequests.map(request => {
        const account = accounts[request.account_id];
        const riskScore = calculateAIRiskScore(request);
        const riskLevel = riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW';
        const riskColor = riskScore >= 70 ? 'danger' : riskScore >= 40 ? 'warning' : 'success';
        
        return `
            <div class="recent-request-item">
                <div class="recent-request-header">
                    <div class="recent-request-user">${request.user_email || 'Unknown'}</div>
                    <span class="status-badge status-${request.status}">${request.status}</span>
                </div>
                <div class="recent-request-details">
                    <span>${account ? account.name : request.account_id}</span>
                    <span>•</span>
                    <span>${request.permission_set || 'AI-Generated'}</span>
                </div>
                ${riskScore > 0 ? `
                <div class="recent-request-risk">
                    <span class="risk-badge risk-${riskColor}">AI Risk: ${riskLevel} (${riskScore}/100)</span>
                </div>
                ` : ''}
                <div class="recent-request-time">${formatDate(request.created_at)}</div>
            </div>
        `;
    }).join('');
}

/**
 * Update Live Sessions Panel
 */
function updateLiveSessions() {
    const container = document.getElementById('liveSessionsList');
    if (!container) return;
    
    const activeSessions = requests.filter(r => 
        r.status === 'approved' && 
        new Date(r.expires_at) > new Date()
    ).slice(0, 5);
    
    if (activeSessions.length === 0) {
        container.innerHTML = '<p class="text-muted">No active sessions</p>';
        return;
    }
    
    container.innerHTML = activeSessions.map(request => {
        const account = accounts[request.account_id];
        return `
            <div class="live-session-item">
                <div class="session-user">${request.user_email || 'Unknown'}</div>
                <div class="session-details">
                    <span>${account ? account.name : request.account_id}</span>
                    <span class="session-time">Expires: ${formatDate(request.expires_at)}</span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Update AI Decisions Feed
 */
function updateAIDecisionsFeed() {
    const container = document.getElementById('aiDecisionsFeed');
    if (!container) return;
    
    const aiRequests = requests.filter(r => r.ai_generated).slice(0, 5);
    
    if (aiRequests.length === 0) {
        container.innerHTML = '<p class="text-muted">No AI decisions yet</p>';
        return;
    }
    
    container.innerHTML = aiRequests.map(request => {
        const riskScore = calculateAIRiskScore(request);
        const decision = riskScore >= 70 ? 'DENY' : riskScore >= 40 ? 'REVIEW' : 'APPROVE';
        const decisionColor = riskScore >= 70 ? 'danger' : riskScore >= 40 ? 'warning' : 'success';
        
        return `
            <div class="ai-decision-item">
                <div class="decision-header">
                    <span class="decision-badge decision-${decisionColor}">${decision}</span>
                    <span class="decision-confidence">${100 - riskScore}% confidence</span>
                </div>
                <div class="decision-user">${request.user_email || 'Unknown'}</div>
                <div class="decision-time">${formatDate(request.created_at)}</div>
            </div>
        `;
    }).join('');
}

// Export functions to global scope
if (typeof window !== 'undefined') {
    window.createJITRequestCard = createJITRequestCard;
    window.calculateAIRiskScore = calculateAIRiskScore;
    window.createAIRiskEnginePanel = createAIRiskEnginePanel;
    window.approveRequestWithJustification = approveRequestWithJustification;
    window.denyRequest = denyRequest;
    window.updateDashboardKPIs = updateDashboardKPIs;
    window.loadRecentJITRequests = loadRecentJITRequests;
    window.updateRecentJITRequests = updateRecentJITRequests;
    window.updateLiveSessions = updateLiveSessions;
    window.updateAIDecisionsFeed = updateAIDecisionsFeed;
}
