# Add this to your existing app.py

from ai_permission_generator import AIPermissionGenerator

@app.route('/api/request-ai-access', methods=['POST'])
def request_ai_access():
    """New endpoint for AI-powered access requests"""
    data = request.json
    
    try:
        ai_generator = AIPermissionGenerator()
        
        # Generate permissions from user description
        permissions_data = ai_generator.generate_permissions_from_description(
            data['description'], 
            CONFIG['accounts'][data['account_id']]['type']
        )
        
        # Create dynamic permission set
        result = ai_generator.create_dynamic_permission_set(
            CONFIG['sso_instance_arn'], 
            permissions_data
        )
        
        if result['success']:
            # Create access request
            request_id = str(uuid.uuid4())
            access_request = {
                'id': request_id,
                'user_email': data['user_email'],
                'account_id': data['account_id'],
                'permission_set': result['permission_set_arn'],
                'permission_set_name': result['name'],
                'duration_hours': data['duration_hours'],
                'justification': f"AI-Generated: {data['description']}",
                'ai_generated': True,
                'risk_level': result['risk_level'],
                'original_description': data['description'],
                'status': 'pending',
                'created_at': datetime.now().isoformat()
            }
            
            # Determine approval workflow based on risk
            account = CONFIG['accounts'][data['account_id']]
            if account['type'] == 'prod' or result['risk_level'] == 'high':
                access_request['approval_required'] = ['manager', 'security']
            elif result['risk_level'] == 'medium':
                access_request['approval_required'] = ['manager']
            else:
                access_request['approval_required'] = ['admin']
            
            requests_db[request_id] = access_request
            
            return jsonify({
                'request_id': request_id,
                'status': 'submitted',
                'generated_permissions': permissions_data,
                'risk_level': result['risk_level'],
                'permission_set_name': result['name']
            })
        else:
            return jsonify({'error': result['error']}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/preview-ai-permissions', methods=['POST'])
def preview_ai_permissions():
    """Preview what permissions AI would generate"""
    data = request.json
    
    try:
        ai_generator = AIPermissionGenerator()
        permissions_data = ai_generator.generate_permissions_from_description(data['description'])
        policy_document = ai_generator.create_iam_policy_document(permissions_data)
        
        return jsonify({
            'permissions': permissions_data,
            'policy_document': policy_document,
            'risk_assessment': permissions_data['risk_level']
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500