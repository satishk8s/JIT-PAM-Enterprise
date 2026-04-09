#!/usr/bin/env python3
"""
Apply all 15 security/crash fixes (BUG-1–4, SEC-1–10, MED-1–3) to the codebase.
Run from project root: python3 apply_security_fixes.py
Or: python3 apply_security_fixes.py /path/to/project
"""
import os
import re
import sys

PROJECT_ROOT = os.path.abspath(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else os.getcwd()))
BACKEND = os.path.join(PROJECT_ROOT, 'backend')
FRONTEND = os.path.join(PROJECT_ROOT, 'frontend')


def patch(path, *replacements, all_occurrences=False):
    """Apply (old_str, new_str) replacements. If all_occurrences, replace every match; else first only."""
    filepath = os.path.join(PROJECT_ROOT, path)
    if not os.path.isfile(filepath):
        print(f"[SKIP] {path} not found")
        return
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
    orig = content
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new) if all_occurrences else content.replace(old, new, 1)
            print(f"[OK] {path}: applied fix")
        else:
            print(f"[??] {path}: pattern not found (may already be fixed)")
    if content != orig:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)


def main():
    print(f"Applying fixes to: {PROJECT_ROOT}\n")

    # --- backend/app.py ---

    # BUG-4: timezone import
    patch('backend/app.py',
          ('from datetime import datetime, timedelta\n', 'from datetime import datetime, timedelta, timezone\n'))

    # MED-1: greedy regex -> brace-counting fallback (only replace the fallback block)
    old_regex = """        # Extract JSON from response
        json_match = re.search(r'\\{[^}]*\\}', ai_response, re.DOTALL)
        if json_match:
            ai_permissions = json.loads(json_match.group())"""
    new_regex = """        # Extract JSON: prefer object with "actions"/"resources", then balanced-brace fallback
        ai_permissions = None
        idx = 0
        while True:
            pos = ai_response.find('"actions"', idx)
            if pos < 0:
                break
            start = ai_response.rfind('{', 0, pos)
            if start < 0:
                idx = pos + 1
                continue
            depth = 0
            end = -1
            for i in range(start, len(ai_response)):
                if ai_response[i] == '{':
                    depth += 1
                elif ai_response[i] == '}':
                    depth -= 1
                    if depth == 0:
                        end = i
                        break
            if end > start:
                try:
                    candidate = json.loads(ai_response[start:end + 1])
                    if isinstance(candidate.get('actions'), list) and isinstance(candidate.get('resources'), (list, str)):
                        ai_permissions = candidate
                        break
                except (json.JSONDecodeError, TypeError):
                    pass
            idx = pos + 1
        if not ai_permissions:
            start = ai_response.find('{')
            if start >= 0:
                depth = 0
                for i in range(start, len(ai_response)):
                    if ai_response[i] == '{':
                        depth += 1
                    elif ai_response[i] == '}':
                        depth -= 1
                        if depth == 0:
                            try:
                                ai_permissions = json.loads(ai_response[start:i + 1])
                            except (json.JSONDecodeError, TypeError):
                                pass
                            break
        if ai_permissions:"""
    patch('backend/app.py', (old_regex, new_regex))

    # SEC-1 & SEC-2: generate_fallback_permissions
    patch('backend/app.py', ("'ssm:SendCommand',\n                ", ''))
    patch('backend/app.py', ("'lambda:InvokeFunction', ", ''))

    # SEC-1 & SEC-2: enhance_permissions_with_services (EC2 SSM block)
    patch('backend/app.py',
          ("            enhanced_actions.extend([\n                'ssm:StartSession',\n                'ssm:DescribeInstanceInformation',\n                'ssm:SendCommand',\n                'ssm:GetCommandInvocation'\n            ])",
           "            enhanced_actions.extend([\n                'ssm:StartSession',\n                'ssm:DescribeInstanceInformation',\n                'ssm:GetCommandInvocation'\n            ])"))

    # SEC-2: lambda in enhance_permissions (InvokeFunction -> ListFunctions, GetFunctionUrlConfig)
    patch('backend/app.py',
          ("                enhanced_actions.extend([\n                    'lambda:GetFunction',\n                    'lambda:InvokeFunction'\n                ])",
           "                enhanced_actions.extend([\n                    'lambda:GetFunction',\n                    'lambda:ListFunctions',\n                    'lambda:GetFunctionUrlConfig'\n                ])"))

    # SEC-4: S3 bucket validation (reject * and invalid chars)
    patch('backend/app.py',
          ("        elif service == 's3':\n            bucket_name = config.get('bucket')\n            if bucket_name:",
           "        elif service == 's3':\n            bucket_name = str(config.get('bucket') or '').strip()\n            if bucket_name and '*' not in bucket_name and re.match(r'^[a-zA-Z0-9._-]{1,255}$', bucket_name):"))

    # SEC-4: Secrets Manager secret_name validation
    patch('backend/app.py',
          ("        elif service == 'secretsmanager':\n            secret_name = config.get('secret_name')\n            if secret_name:",
           "        elif service == 'secretsmanager':\n            secret_name = str(config.get('secret_name') or '').strip()\n            if secret_name and '*' not in secret_name and re.match(r'^[a-zA-Z0-9/_+=.@-]{1,512}$', secret_name):"))

    # SEC-10: SessionDuration from request
    patch('backend/app.py',
          ('def create_custom_permission_set(name, permissions_data):\n    """Create a new permission set with AI-generated permissions"""\n    try:\n        sso_admin = _sso_admin_client()\n        \n        # Create permission set\n        response = sso_admin.create_permission_set(\n            InstanceArn=CONFIG[\'sso_instance_arn\'],\n            Name=name,\n            Description=permissions_data.get(\'description\', \'AI-generated permission set\'),\n            SessionDuration=\'PT8H\'\n        )',
           'def create_custom_permission_set(name, permissions_data, duration_hours=None):\n    """Create permission set. SessionDuration from duration_hours (1-12, default 8)."""\n    try:\n        sso_admin = _sso_admin_client()\n        hours = 8\n        if duration_hours is not None:\n            try:\n                hours = max(1, min(12, int(duration_hours)))\n            except (TypeError, ValueError):\n                pass\n        session_duration = f\'PT{hours}H\'\n        response = sso_admin.create_permission_set(\n            InstanceArn=CONFIG[\'sso_instance_arn\'],\n            Name=name,\n            Description=permissions_data.get(\'description\', \'AI-generated permission set\'),\n            SessionDuration=session_duration\n        )'))

    # SEC-5: debug endpoint always return 404 (disable user enumeration)
    patch('backend/app.py',
          ('@app.route(\'/api/debug/find-user/<email>\', methods=[\'GET\'])\ndef debug_find_user(email):\n    if os.environ.get(\'FLASK_ENV\', \'\').lower() == \'production\' or os.environ.get(\'DISABLE_DEBUG_ROUTES\', \'\').strip() in (\'1\', \'true\', \'yes\'):\n        return jsonify({\'error\': \'Not Found\'}), 404\n    try:',
           '@app.route(\'/api/debug/find-user/<email>\', methods=[\'GET\'])\ndef debug_find_user(email):\n    return jsonify({\'error\': \'Not Found\'}), 404\n    try:'))

    # BUG-4: timezone-aware datetime comparison
    patch('backend/app.py',
          ('        # Validate start date is in future\n        if start_date <= datetime.now():',
           '        now_utc = datetime.now(timezone.utc)\n        if start_date.tzinfo:\n            start_date = start_date.astimezone(timezone.utc)\n        else:\n            start_date = start_date.replace(tzinfo=timezone.utc)\n        if start_date <= now_utc:'))

    # SEC-3: validate permission_set ARN
    patch('backend/app.py',
          ("    else:\n        # Existing permission set\n        access_request['permission_set'] = data['permission_set']\n        access_request['ai_generated'] = False",
           "    else:\n        submitted_arn = str(data.get('permission_set') or '').strip()\n        allowed_arns = {str(ps.get('arn') or '').strip() for ps in (CONFIG.get('permission_sets') or []) if isinstance(ps, dict) and ps.get('arn')}\n        allowed_arns.update(str(ps) for ps in (CONFIG.get('permission_sets') or []) if isinstance(ps, str))\n        if not submitted_arn or (allowed_arns and submitted_arn not in allowed_arns):\n            return jsonify({'error': 'Invalid or disallowed permission set. Choose from the list.'}), 400\n        access_request['permission_set'] = submitted_arn\n        access_request['ai_generated'] = False"))

    # BUG-1: ps_name before ai_generated block
    patch('backend/app.py',
          ('    if required_approvals.issubset(received_approvals):\n        # Create AI permission set if needed\n        if access_request.get(\'ai_generated\'):',
           '    if required_approvals.issubset(received_approvals):\n        ps_name = access_request.get(\'permission_set_name\') or access_request.get(\'permission_set\') or \'\'\n        # Create AI permission set if needed\n        if access_request.get(\'ai_generated\'):'))

    # BUG-3: Add _ensure_account_config_key helper before grant_access, then safe lookup in revoke and grant
    helper = '''
def _ensure_account_config_key(account_id):
    account_id = str(account_id or '').strip()
    if not account_id:
        return account_id
    if account_id in CONFIG.get('accounts', {}):
        return account_id
    for key, info in CONFIG.get('accounts', {}).items():
        if str(info.get('id') or '').strip() == account_id:
            return key
    CONFIG.setdefault('accounts', {})[account_id] = {'id': account_id, 'name': f'Account-{account_id}', 'environment': 'nonprod'}
    return account_id

'''
    patch('backend/app.py', ('def grant_access(access_request):', helper + 'def grant_access(access_request):'))

    # BUG-3: safe account lookup in both revoke and grant (replace all occurrences)
    safe_lookup = """        account_key = _ensure_account_config_key(access_request.get('account_id'))
        account_meta = (CONFIG.get('accounts') or {}).get(account_key)
        if not account_meta:
            return jsonify({'error': 'Account not found or not configured.'}), 400
        account_id = str(account_meta.get('id') or account_key).strip()
        permission_set_arn = access_request['permission_set']"""
    filepath = os.path.join(PROJECT_ROOT, 'backend/app.py')
    if os.path.isfile(filepath):
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            c = f.read()
        old = "        account_id = CONFIG['accounts'][access_request['account_id']]['id']\n        permission_set_arn = access_request['permission_set']"
        if old in c:
            c = c.replace(old, safe_lookup)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(c)
            print("[OK] backend/app.py: BUG-3 safe account lookup (all occurrences)")
        else:
            print("[??] backend/app.py: BUG-3 pattern not found")

    # BUG-2: approval_required in request_for_others
    patch('backend/app.py',
          ("            'permission_set': 'ReadOnlyAccess',\n            'ai_generated': False\n        }",
           "            'permission_set': 'ReadOnlyAccess',\n            'ai_generated': False,\n            'approval_required': ['manager'],\n        }"))

    # Call create_custom_permission_set with duration_hours
    patch('backend/app.py',
          ('            ps_result = create_custom_permission_set(ps_name, access_request[\'ai_permissions\'])',
           '            dur = access_request.get(\'duration_hours\', 8)\n            ps_result = create_custom_permission_set(ps_name, access_request[\'ai_permissions\'], duration_hours=dur)'))

    # --- backend/production_app.py ---
    patch('backend/production_app.py', ('from datetime import datetime, timedelta\n', 'from datetime import datetime, timedelta, timezone\n'))
    patch('backend/production_app.py',
          ('        if start_date <= datetime.now():',
           '        now_utc = datetime.now(timezone.utc)\n        if start_date.tzinfo:\n            start_date = start_date.astimezone(timezone.utc)\n        else:\n            start_date = start_date.replace(tzinfo=timezone.utc)\n        if start_date <= now_utc:'))
    patch('backend/production_app.py',
          ('if __name__ == \'__main__\':\n    app.run(debug=True, port=5001)',
           'if __name__ == \'__main__\':\n    import os\n    debug = os.environ.get(\'FLASK_ENV\', \'\').lower() != \'production\' and os.environ.get(\'FLASK_DEBUG\', \'\').lower() in (\'1\', \'true\', \'yes\')\n    app.run(debug=debug, port=int(os.environ.get(\'PORT\', 5001)))'))

    # --- scheduler.py ---
    patch('scheduler.py',
          ("# Configuration\nAPI_BASE = 'http://localhost:5000/api'\nCONFIG = {\n    'sso_instance_arn': 'arn:aws:sso:::instance/ssoins-65955f0870d9f06f',\n    'identity_store_id': 'd-9f677136b2'\n}",
           "# Configuration from env\nAPI_BASE = os.environ.get('JIT_SCHEDULER_API_BASE', 'http://localhost:5000/api').rstrip('/')\nSCHEDULER_API_KEY = os.environ.get('JIT_SCHEDULER_API_KEY', '').strip()"))
    patch('scheduler.py',
          ('def get_all_requests():\n    """Get all requests from the API"""\n    try:\n        response = requests.get(f\'{API_BASE}/requests\')',
           'def get_all_requests():\n    """Get all requests from the API"""\n    try:\n        headers = {}\n        if SCHEDULER_API_KEY:\n            headers[\'X-API-Key\'] = SCHEDULER_API_KEY\n        response = requests.get(f\'{API_BASE}/requests\', headers=headers, timeout=30)'))
    patch('scheduler.py',
          ('                try:\n                    # Call revoke API\n                    response = requests.post(\n                        f"{API_BASE}/request/{request[\'id\']}/revoke",\n                        json={\'reason\': \'Automatic expiration - JIT access expired\'}\n                    )',
           '                try:\n                    headers = {\'Content-Type\': \'application/json\'}\n                    if SCHEDULER_API_KEY:\n                        headers[\'X-API-Key\'] = SCHEDULER_API_KEY\n                    response = requests.post(\n                        f"{API_BASE}/request/{request[\'id\']}/revoke",\n                        json={\'reason\': \'Automatic expiration - JIT access expired\'},\n                        headers=headers,\n                        timeout=30\n                    )'))
    patch('scheduler.py',
          ('            try:\n                response = requests.delete(f"{API_BASE}/request/{request[\'id\']}/delete")',
           '            try:\n                headers = {}\n                if SCHEDULER_API_KEY:\n                    headers[\'X-API-Key\'] = SCHEDULER_API_KEY\n                response = requests.delete(f"{API_BASE}/request/{request[\'id\']}/delete", headers=headers, timeout=30)'))

    # --- frontend/app.js: remove ADMIN_USERS and use backend for admin ---
    patch('frontend/app.js',
          ("const ADMIN_USERS = [\n    'admin@example.com',\n    'security@example.com'\n];\nconst DEV_DUMMY_OTP = '123456';",
           "// Admin status from backend /api/admin/check-pam-admin only; no hardcoded list"))
    patch('frontend/app.js',
          ('        isAdmin = ADMIN_USERS.includes(email.toLowerCase());',
           '        isAdmin = false; // set by setPamAdminFromApi() after login'))

    # --- frontend/index.html ---
    patch('frontend/index.html',
          ('<p id="devOtpHint" class="dev-hint" style="display: none;">Dev OTP: 123456</p>',
           '<!-- OTP from email only; no dev value in source -->'))

    print("\nDone. Re-run Claude CLI verification on this folder.")


if __name__ == '__main__':
    main()
