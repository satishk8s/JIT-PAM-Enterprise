# Guardrails Redesign Implementation Plan

## ✅ What's Ready

### Files Created
1. **frontend/guardrails-redesign.js** - New guardrails management logic
2. **frontend/guardrails-redesign.css** - Styling for new UI
3. **GUARDRAILS_REDESIGN_PLAN.md** - This document

### New Structure
- **My Guardrails** - User-created guardrails with AI/Manual tags
- **Default Guardrails** - Pre-configured with toggle ON/OFF + account selection
- **Create Guardrails** - Manual form or AI assistant

---

## 🔒 Security Integration - CRITICAL

### All AIs MUST Respect Guardrails

**Current Status:**
- ✅ AWS Permissions AI already checks guardrails via `conversation_manager.py`
- ✅ Help Assistant has basic security (no AWS operations)
- ⚠️ Need to ensure guardrails are enforced EVERYWHERE

### Where Guardrails Are Checked

#### 1. AWS Permissions Generator AI
**File:** `backend/conversation_manager.py`
**Line:** ~140 (loads guardrails)
```python
guardrails = ConversationManager._load_guardrails()
guardrails_text = ConversationManager._format_guardrails_for_prompt(guardrails)
```

**System Prompt Includes:**
- Service restrictions (blocked services)
- Delete restrictions (by environment)
- Create restrictions (by environment)

**Enforcement:** AI is instructed to refuse blocked operations

#### 2. Help Assistant
**File:** `backend/help_assistant.py`
**Current:** Basic prompt injection protection
**Needed:** Should NOT generate AWS permissions (already doesn't)

#### 3. Request Submission
**File:** `backend/app.py` - `/api/request-access`
**Current:** Checks access rules for group-based restrictions
**Needed:** Also check guardrails before allowing request

---

## 🎯 Integration Steps

### Step 1: Add New Backend Endpoints

Add to `backend/app.py`:

```python
@app.route('/api/admin/my-guardrails', methods=['GET'])
def get_my_guardrails():
    """Get user-created guardrails"""
    try:
        guardrails_path = os.path.join(os.path.dirname(__file__), 'my_guardrails.json')
        if os.path.exists(guardrails_path):
            with open(guardrails_path, 'r') as f:
                return jsonify(json.load(f))
        return jsonify({'guardrails': []})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/default-guardrails', methods=['GET', 'POST'])
def manage_default_guardrails():
    """Get or update default guardrails configuration"""
    try:
        config_path = os.path.join(os.path.dirname(__file__), 'default_guardrails.json')
        
        if request.method == 'GET':
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    return jsonify(json.load(f))
            # Return defaults
            return jsonify({
                'guardrails': [
                    {'id': 'default-1', 'name': 'Block KMS Key Deletion', 'enabled': True, 'accounts': []},
                    {'id': 'default-2', 'name': 'Block Production RDS Deletion', 'enabled': True, 'accounts': []},
                    # ... more defaults
                ]
            })
        
        elif request.method == 'POST':
            data = request.get_json()
            with open(config_path, 'w') as f:
                json.dump(data, f, indent=2)
            return jsonify({'status': 'success'})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/generate-guardrails-ai', methods=['POST'])
def generate_guardrails_ai():
    """AI assistant for creating guardrails"""
    try:
        data = request.get_json()
        conversation_id = data.get('conversation_id')
        user_message = data.get('user_message')
        
        # Use GuardrailsGenerator (already exists)
        result = GuardrailsGenerator.generate_guardrails(
            user_message, 
            None,  # mfa_token
            conversation_id, 
            user_message
        )
        
        return jsonify(result)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

### Step 2: Integrate into index.html

Replace guardrails section in `frontend/index.html`:

```html
<!-- Add CSS -->
<link rel="stylesheet" href="guardrails-redesign.css">

<!-- Add JS -->
<script src="guardrails-redesign.js"></script>

<!-- Replace guardrails section with new structure -->
<div id="guardrailsSection" style="display: none;">
    <!-- Tabs -->
    <div class="guardrail-tabs">
        <button class="guardrail-tab active" onclick="showGuardrailView('my')">
            My Guardrails
        </button>
        <button class="guardrail-tab" onclick="showGuardrailView('default')">
            Default Guardrails
        </button>
        <button class="guardrail-tab" onclick="showGuardrailView('create')">
            Create Guardrail
        </button>
    </div>
    
    <!-- My Guardrails View -->
    <div id="myGuardrailsView">
        <div id="myGuardrailsList"></div>
    </div>
    
    <!-- Default Guardrails View -->
    <div id="defaultGuardrailsView" style="display: none;">
        <div id="defaultGuardrailsList"></div>
    </div>
    
    <!-- Create Guardrails View -->
    <div id="createGuardrailsView" style="display: none;">
        <!-- Method selection cards -->
        <div class="create-method-cards">
            <div class="create-method-card" onclick="showCreateMethod('manual')">
                <i class="fas fa-edit"></i>
                <h4>Manual Creation</h4>
                <p>Create guardrail using form</p>
            </div>
            <div class="create-method-card" onclick="showCreateMethod('ai')">
                <i class="fas fa-robot"></i>
                <h4>AI Assistant</h4>
                <p>Chat with AI to create guardrail</p>
            </div>
        </div>
        
        <!-- Manual form -->
        <div id="manualCreateSection" style="display: none;">
            <!-- Form fields -->
        </div>
        
        <!-- AI chat -->
        <div id="aiCreateSection" style="display: none;">
            <div class="guardrail-ai-chat-container">
                <div id="guardrailAIChatMessages" class="guardrail-ai-chat-messages"></div>
                <div class="guardrail-ai-input-area">
                    <textarea id="guardrailAIInput" class="guardrail-ai-input" placeholder="Describe the guardrail you want to create..."></textarea>
                    <button onclick="sendGuardrailAIMessage()" class="guardrail-ai-send-btn">Send</button>
                </div>
            </div>
        </div>
    </div>
</div>
```

### Step 3: Ensure Guardrails Are Enforced

**In conversation_manager.py** (already done):
- Guardrails are loaded on every AI call
- System prompt includes guardrails
- AI is instructed to refuse blocked operations

**In app.py - request submission** (add check):
```python
@app.route('/api/request-access', methods=['POST'])
def request_access():
    # ... existing code ...
    
    # CHECK GUARDRAILS
    guardrails = ConversationManager._load_guardrails()
    
    # Check service restrictions
    for rule in guardrails.get('serviceRestrictions', []):
        if rule.get('action') == 'block':
            # Check if request involves blocked service
            # Block if match
            pass
    
    # Check delete restrictions
    # Check create restrictions
    # ... etc
```

---

## 🔐 Security Enforcement Flow

```
User Request
    ↓
1. Access Rules Check (group-based)
    ↓
2. Guardrails Check (service/operation restrictions)
    ↓
3. Policy Toggles Check (delete/create/admin)
    ↓
4. AI Generation (with guardrails in system prompt)
    ↓
5. Final Validation
    ↓
Approve/Reject
```

---

## 📋 Testing Checklist

### Guardrails UI
- [ ] My Guardrails tab shows user-created guardrails
- [ ] Default Guardrails tab shows 5 defaults with toggles
- [ ] Toggle ON/OFF works for each default guardrail
- [ ] Account selection shows all AWS accounts
- [ ] Select All / Deselect All buttons work
- [ ] Create Guardrail shows Manual/AI options
- [ ] Manual form creates guardrail
- [ ] AI assistant creates guardrail via chat

### Security Enforcement
- [ ] AWS Permissions AI refuses blocked services
- [ ] AWS Permissions AI refuses blocked delete operations
- [ ] AWS Permissions AI refuses blocked create operations
- [ ] Help Assistant doesn't generate AWS permissions
- [ ] Request submission checks guardrails
- [ ] Guardrails are loaded fresh on every request

### Integration
- [ ] All AIs respect Security tab settings
- [ ] Policy toggles work (delete/create/admin)
- [ ] Access rules work (group-based)
- [ ] Guardrails work (service/operation-based)
- [ ] Everything works together without conflicts

---

## ⚠️ Important Notes

1. **Don't Break Existing Functionality**
   - Current guardrails system works
   - New UI is additive, not replacement
   - Keep backward compatibility

2. **Guardrails Are Already Enforced**
   - `conversation_manager.py` loads guardrails
   - System prompt includes restrictions
   - AI refuses blocked operations

3. **New UI Enhances Management**
   - Easier to create guardrails
   - Better visibility (My/Default/Create)
   - Account-level control
   - AI-assisted creation

4. **Security Is Multi-Layered**
   - Access Rules (group-based)
   - Guardrails (service/operation-based)
   - Policy Toggles (delete/create/admin)
   - AI System Prompts (instruction-based)

---

## 🚀 Next Steps

1. **Add backend endpoints** (3 new routes)
2. **Integrate UI into index.html** (replace guardrails section)
3. **Test thoroughly** (use checklist above)
4. **Document for users** (how to use new UI)

---

**Status:** Ready for integration
**Risk:** Low (additive changes, existing system untouched)
**Benefit:** Better UX, easier guardrail management, AI-assisted creation
