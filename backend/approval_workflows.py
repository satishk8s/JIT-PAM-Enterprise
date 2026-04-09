import json
import os
import re
import uuid
from datetime import datetime


DATA_DIR = os.getenv('NPAMX_DATA_DIR') or os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(DATA_DIR, exist_ok=True)
APPROVAL_WORKFLOWS_PATH = os.getenv('APPROVAL_WORKFLOWS_PATH') or os.path.join(DATA_DIR, 'approval_workflows.json')
DEFAULT_APPROVERS_PATH = os.getenv('DEFAULT_APPROVERS_PATH') or os.path.join(DATA_DIR, 'approval_workflow_default_approvers.json')

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
SUPPORTED_SERVICE_TYPES = ('database', 'cloud', 's3', 'instances', 'storage', 'workloads')
SUPPORTED_APPROVAL_MODES = ('any_one',)
SUPPORTED_ACCESS_LEVELS = ('read_only', 'read_limited_write', 'read_full_write', 'admin')
SUPPORTED_ENVIRONMENTS = ('prod', 'nonprod', 'sandbox')
ALIASED_APPROVER_TYPES = {
    'primary': 'primary',
    'manager': 'primary',
    'secondary': 'secondary',
    'security_lead': 'security_lead',
    'secops_lead': 'security_lead',
    'db_owner': 'db_owner',
    'ciso': 'security_lead',
}


def _now():
    return datetime.utcnow().isoformat(timespec='seconds')


def _slug(value):
    raw = str(value or '').strip().lower()
    raw = re.sub(r'[^a-z0-9]+', '_', raw)
    return raw.strip('_')


def _clean_string_list(value):
    if not isinstance(value, list):
        return []
    out = []
    seen = set()
    for item in value:
        cleaned = str(item or '').strip()
        key = cleaned.lower()
        if not cleaned or key in seen:
            continue
        seen.add(key)
        out.append(cleaned)
    return out


def _clean_lower_list(value):
    return [item.lower() for item in _clean_string_list(value)]


def _is_valid_email(value):
    return bool(EMAIL_RE.match(str(value or '').strip()))


def _is_self_approval_type(value):
    return str(value or '').strip().lower() in ('self', 'self_approval', 'requester', 'requestor')


def _workflow_contact(value):
    return str(value or '').strip().lower()


def _canonical_approver_type(value):
    raw = str(value or '').strip().lower() or 'approver'
    if _is_self_approval_type(raw):
        return 'self'
    return ALIASED_APPROVER_TYPES.get(raw, raw)


def _resolve_stage_primary_email(workflow, stage, requester=''):
    approver_type = _canonical_approver_type(stage.get('approver_type'))
    requester_email = _workflow_contact(requester)
    if approver_type == 'self' and requester_email:
        return requester_email

    contacts = workflow.get('approver_contacts') if isinstance(workflow.get('approver_contacts'), dict) else {}
    if approver_type in ('primary', 'secondary', 'security_lead', 'db_owner'):
        return _workflow_contact(contacts.get(approver_type))

    return _workflow_contact(stage.get('primary_email'))


def _normalize_default_approvers(raw):
    payload = raw if isinstance(raw, dict) else {}
    contacts = payload.get('approver_contacts') if isinstance(payload.get('approver_contacts'), dict) else payload
    return {
        'secondary': _workflow_contact(
            contacts.get('secondary')
            or contacts.get('devops_lead')
            or contacts.get('devops_lead_email')
        ),
        'db_owner': _workflow_contact(
            contacts.get('db_owner')
            or contacts.get('db_owner_email')
        ),
        'security_lead': _workflow_contact(
            contacts.get('security_lead')
            or contacts.get('secops_lead')
            or contacts.get('secops_lead_email')
        ),
    }


def load_default_approvers():
    if not os.path.exists(DEFAULT_APPROVERS_PATH):
        return _normalize_default_approvers({})
    try:
        with open(DEFAULT_APPROVERS_PATH, 'r', encoding='utf-8') as fh:
            payload = json.load(fh) or {}
        return _normalize_default_approvers(payload)
    except Exception:
        return _normalize_default_approvers({})


def save_default_approvers(raw):
    contacts = _normalize_default_approvers(raw)
    payload = {'approver_contacts': contacts, 'updated_at': _now()}
    with open(DEFAULT_APPROVERS_PATH, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh, indent=2, sort_keys=True)
    return contacts


def load_workflows():
    if not os.path.exists(APPROVAL_WORKFLOWS_PATH):
        return []
    try:
        with open(APPROVAL_WORKFLOWS_PATH, 'r', encoding='utf-8') as fh:
            payload = json.load(fh) or {}
        rows = payload.get('workflows') if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            merged, changed = merge_default_workflows([])
            if changed:
                save_workflows(merged)
            return merged
        normalized = [normalize_workflow(row) for row in rows if isinstance(row, dict)]
        merged, changed = merge_default_workflows(normalized)
        if changed:
            save_workflows(merged)
        return merged
    except Exception:
        merged, _ = merge_default_workflows([])
        return merged


def save_workflows(workflows):
    rows = [normalize_workflow(item) for item in (workflows or []) if isinstance(item, dict)]
    payload = {'workflows': rows, 'updated_at': _now()}
    with open(APPROVAL_WORKFLOWS_PATH, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh, indent=2, sort_keys=True)
    return rows


def normalize_workflow(raw):
    workflow = dict(raw or {})
    conditions = workflow.get('conditions') if isinstance(workflow.get('conditions'), dict) else {}
    stages = workflow.get('stages') if isinstance(workflow.get('stages'), list) else []
    approver_contacts_raw = workflow.get('approver_contacts') if isinstance(workflow.get('approver_contacts'), dict) else {}
    default_contacts = load_default_approvers()
    approver_contacts = {
        'primary': _workflow_contact(
            approver_contacts_raw.get('primary')
            or workflow.get('primary_email')
        ),
        'secondary': _workflow_contact(
            approver_contacts_raw.get('secondary')
            or workflow.get('secondary_email')
            or default_contacts.get('secondary')
        ),
        'db_owner': _workflow_contact(
            approver_contacts_raw.get('db_owner')
            or workflow.get('db_owner_email')
            or default_contacts.get('db_owner')
        ),
        'security_lead': _workflow_contact(
            approver_contacts_raw.get('security_lead')
            or workflow.get('security_lead_email')
            or default_contacts.get('security_lead')
        ),
    }

    normalized_stages = []
    for idx, stage in enumerate(stages):
        if not isinstance(stage, dict):
            continue
        approver_type = _canonical_approver_type(stage.get('approver_type'))
        primary_email = _workflow_contact(stage.get('primary_email'))
        if _is_self_approval_type(approver_type) and not primary_email:
            primary_email = 'self'
        fallback_email = _workflow_contact(stage.get('fallback_email'))
        fallback_reason = str(stage.get('fallback_reason') or '').strip()
        normalized_stages.append({
            'id': str(stage.get('id') or f"stage_{idx + 1}_{uuid.uuid4().hex[:8]}").strip(),
            'name': str(stage.get('name') or f'Stage {idx + 1}').strip(),
            'approver_type': approver_type,
            'primary_email': primary_email,
            'fallback_email': fallback_email,
            'fallback_reason': fallback_reason,
            'approval_mode': str(stage.get('approval_mode') or 'any_one').strip().lower() or 'any_one',
        })

    return {
        'id': str(workflow.get('id') or uuid.uuid4().hex).strip(),
        'name': str(workflow.get('name') or '').strip(),
        'description': str(workflow.get('description') or '').strip(),
        'service_type': str(workflow.get('service_type') or '').strip().lower(),
        'enabled': bool(workflow.get('enabled', True)),
        'priority': int(workflow.get('priority') or 100),
        'created_at': str(workflow.get('created_at') or _now()).strip(),
        'updated_at': str(workflow.get('updated_at') or _now()).strip(),
        'created_by': _workflow_contact(workflow.get('created_by')),
        'updated_by': _workflow_contact(workflow.get('updated_by')),
        'approver_contacts': approver_contacts,
        'primary_email': approver_contacts['primary'],
        'secondary_email': approver_contacts['secondary'],
        'db_owner_email': approver_contacts['db_owner'],
        'security_lead_email': approver_contacts['security_lead'],
        'linked_role_ids': _clean_string_list(workflow.get('linked_role_ids') or workflow.get('iam_role_ids')),
        'conditions': {
            'account_ids': _clean_string_list(conditions.get('account_ids')),
            'environments': [item for item in _clean_lower_list(conditions.get('environments')) if item in SUPPORTED_ENVIRONMENTS],
            'data_classifications': _clean_lower_list(conditions.get('data_classifications')),
            'access_levels': [item for item in _clean_lower_list(conditions.get('access_levels')) if item in SUPPORTED_ACCESS_LEVELS],
            'pii_only': True if conditions.get('pii_only') is True else False,
            'non_pii_only': True if conditions.get('non_pii_only') is True else False,
        },
        'pending_request_expiry_hours': max(1, min(168, int(workflow.get('pending_request_expiry_hours') or workflow.get('pendingRequestExpiryHours') or 12))),
        'stages': normalized_stages,
    }


def validate_workflow_payload(raw):
    workflow = normalize_workflow(raw)
    errors = []

    if not workflow['name']:
        errors.append('Workflow name is required.')
    if workflow['service_type'] not in SUPPORTED_SERVICE_TYPES:
        errors.append('Service type is required and must be supported.')
    if not workflow['stages']:
        errors.append('At least one approval stage is required.')

    for idx, stage in enumerate(workflow['stages'], start=1):
        if not stage['name']:
            errors.append(f'Stage {idx} name is required.')
        approver_type = _canonical_approver_type(stage['approver_type'])
        primary_email = _resolve_stage_primary_email(workflow, stage)
        database_requester_stage = (
            workflow['service_type'] == 'database'
            and approver_type == 'primary'
            and not primary_email
        )
        database_placeholder_stage = (
            workflow['service_type'] == 'database'
            and approver_type in ('secondary', 'security_lead', 'db_owner')
            and not primary_email
        )
        requires_email = (
            not _is_self_approval_type(approver_type)
            and not database_requester_stage
            and not database_placeholder_stage
        )
        if requires_email and (not primary_email or not _is_valid_email(primary_email)):
            errors.append(f'Stage {idx} requires a valid primary approver email.')
        if stage['fallback_email']:
            if not _is_valid_email(stage['fallback_email']):
                errors.append(f'Stage {idx} fallback approver email is invalid.')
            if not stage['fallback_reason']:
                errors.append(f'Stage {idx} fallback reason is required when fallback approver is provided.')
            if stage['fallback_email'] == primary_email:
                errors.append(f'Stage {idx} fallback approver must be different from the primary approver.')
        if stage['approval_mode'] not in SUPPORTED_APPROVAL_MODES:
            errors.append(f'Stage {idx} approval mode is unsupported.')

    if workflow['service_type'] == 'database':
        access_levels = list((workflow.get('conditions') or {}).get('access_levels') or [])
        has_self_stage = any(_is_self_approval_type(stage.get('approver_type')) for stage in workflow['stages'])
        if bool((workflow.get('conditions') or {}).get('pii_only')) and bool((workflow.get('conditions') or {}).get('non_pii_only')):
            errors.append('Database workflow cannot be both PII-only and Non-PII-only.')
        if has_self_stage:
            disallowed = [item for item in access_levels if item != 'read_only']
            if not access_levels:
                errors.append('Database workflows with Self approval must explicitly restrict Access Levels to Read Only.')
            elif disallowed:
                errors.append('Database workflows with Self approval can only use Access Level "Read Only". Create a separate manager workflow for write/admin access.')

    pending_expiry = int(workflow.get('pending_request_expiry_hours') or 0)
    if pending_expiry < 1 or pending_expiry > 168:
        errors.append('Pending request expiry must be between 1 and 168 hours.')

    return workflow, errors


def upsert_workflow(raw, actor_email=''):
    workflow, errors = validate_workflow_payload(raw)
    if errors:
        raise ValueError('; '.join(errors))

    actor = str(actor_email or '').strip().lower()
    existing = load_workflows()
    updated = []
    found = False
    for item in existing:
        if item.get('id') == workflow['id']:
            workflow['created_at'] = item.get('created_at') or workflow['created_at']
            workflow['created_by'] = item.get('created_by') or actor
            found = True
        updated.append(item)

    workflow['updated_at'] = _now()
    workflow['updated_by'] = actor
    if not found:
        workflow['created_at'] = workflow['updated_at']
        workflow['created_by'] = actor
        updated.append(workflow)
    else:
        updated = [workflow if item.get('id') == workflow['id'] else item for item in updated]

    updated = save_workflows(updated)
    return next((item for item in updated if item.get('id') == workflow['id']), workflow)


def delete_workflow(workflow_id):
    target = str(workflow_id or '').strip()
    workflows = load_workflows()
    kept = [item for item in workflows if item.get('id') != target]
    if len(kept) == len(workflows):
        return False
    save_workflows(kept)
    return True


def resolve_workflow(request_context):
    ctx = dict(request_context or {})
    service_type = str(ctx.get('service_type') or '').strip().lower()
    account_id = str(ctx.get('account_id') or '').strip()
    environment = str(ctx.get('environment') or '').strip().lower()
    data_classification = str(ctx.get('data_classification') or '').strip().lower()
    access_level = str(ctx.get('access_level') or '').strip().lower()
    linked_role_id = str(ctx.get('iam_role_template_id') or ctx.get('linked_role_id') or ctx.get('role_id') or '').strip()
    is_pii = bool(ctx.get('is_pii'))

    matches = []
    for workflow in load_workflows():
        if not workflow.get('enabled'):
            continue
        if workflow.get('service_type') != service_type:
            continue

        cond = workflow.get('conditions') or {}
        account_ids = cond.get('account_ids') or []
        environments = cond.get('environments') or []
        classifications = cond.get('data_classifications') or []
        access_levels = cond.get('access_levels') or []
        linked_role_ids = workflow.get('linked_role_ids') or []
        pii_only = bool(cond.get('pii_only'))
        non_pii_only = bool(cond.get('non_pii_only'))

        if account_ids and account_id not in account_ids:
            continue
        if environments and environment not in environments:
            continue
        if classifications and data_classification not in classifications:
            continue
        if access_levels and access_level not in access_levels:
            continue
        if linked_role_ids and linked_role_id not in linked_role_ids:
            continue
        if pii_only and not is_pii:
            continue
        if non_pii_only and is_pii:
            continue

        specificity = 0
        specificity += len(account_ids)
        specificity += len(environments)
        specificity += len(classifications)
        specificity += len(access_levels)
        specificity += len(linked_role_ids)
        specificity += 1 if pii_only else 0
        specificity += 1 if non_pii_only else 0
        matches.append((int(workflow.get('priority') or 100), specificity, workflow))

    if not matches:
        return None

    matches.sort(key=lambda item: (item[0], -item[1], item[2].get('updated_at') or '' ))
    return matches[0][2]


def build_runtime_state(workflow, requester_email=''):
    item = normalize_workflow(workflow)
    requester = _workflow_contact(requester_email)
    stages = []
    for stage in item.get('stages', []):
        approver_type = _canonical_approver_type(stage.get('approver_type') or 'approver')
        primary_email = _resolve_stage_primary_email(item, stage, requester=requester)
        approvers = [{
            'email': primary_email,
            'kind': 'primary',
            'status': 'pending',
            'fallback_reason': '',
        }]
        if stage.get('fallback_email'):
            approvers.append({
                'email': stage['fallback_email'],
                'kind': 'fallback',
                'status': 'pending',
                'fallback_reason': stage.get('fallback_reason') or '',
            })
        stages.append({
            'id': stage['id'],
            'name': stage['name'],
            'approver_type': approver_type,
            'approval_mode': stage.get('approval_mode') or 'any_one',
            'status': 'pending',
            'decision': '',
            'decided_by': '',
            'decided_at': '',
            'approvers': approvers,
        })

    return {
        'workflow_id': item['id'],
        'workflow_name': item['name'],
        'service_type': item['service_type'],
        'status': 'pending',
        'current_stage_index': 0,
        'resolved_at': _now(),
        'stages': stages,
    }


def workflow_requires_requester_primary_email(workflow):
    item = normalize_workflow(workflow)
    for stage in item.get('stages', []):
        approver_type = _canonical_approver_type(stage.get('approver_type') or 'approver')
        if approver_type != 'primary':
            continue
        if not _resolve_stage_primary_email(item, stage):
            return True
    return False


def workflow_missing_required_contacts(workflow, requester_email=''):
    item = normalize_workflow(workflow)
    requester = _workflow_contact(requester_email)
    missing = []
    for idx, stage in enumerate(item.get('stages', []), start=1):
        approver_type = _canonical_approver_type(stage.get('approver_type') or 'approver')
        if _is_self_approval_type(approver_type):
            continue
        primary_email = _resolve_stage_primary_email(item, stage, requester=requester)
        database_requester_stage = (
            item.get('service_type') == 'database'
            and approver_type == 'primary'
            and not primary_email
        )
        if database_requester_stage or primary_email:
            continue
        label = {
            'primary': 'Primary approver / RM email',
            'secondary': 'Secondary approver / DevOps lead email',
            'db_owner': 'DB owner email',
            'security_lead': 'Security lead email',
        }.get(approver_type, f'Stage {idx} approver email')
        if label not in missing:
            missing.append(label)
    return missing


def _default_workflow_definitions():
    return [
        {
            'id': 'sys_db_nonprod_read_only',
            'name': 'System Default · NonProd Read Only',
            'description': 'Fallback workflow for non-production database read-only requests.',
            'service_type': 'database',
            'enabled': True,
            'priority': 900,
            'pending_request_expiry_hours': 12,
            'linked_role_ids': ['sys_db_read_only'],
            'conditions': {
                'environments': ['nonprod', 'sandbox'],
                'access_levels': ['read_only'],
            },
            'stages': [
                {'name': 'Self Approval', 'approver_type': 'self', 'approval_mode': 'any_one'}
            ],
        },
        {
            'id': 'sys_db_nonprod_limited_write',
            'name': 'System Default · NonProd Limited Write',
            'description': 'Fallback workflow for non-production limited-write database requests.',
            'service_type': 'database',
            'enabled': True,
            'priority': 900,
            'pending_request_expiry_hours': 12,
            'linked_role_ids': ['sys_db_limited_write'],
            'conditions': {
                'environments': ['nonprod', 'sandbox'],
                'access_levels': ['read_limited_write'],
            },
            'stages': [
                {'name': 'Reporting Manager Approval', 'approver_type': 'primary', 'approval_mode': 'any_one'}
            ],
        },
        {
            'id': 'sys_db_nonprod_admin',
            'name': 'System Default · NonProd Admin',
            'description': 'Fallback workflow for non-production admin database requests. Secondary approver is intended for the DevOps lead.',
            'service_type': 'database',
            'enabled': True,
            'priority': 900,
            'pending_request_expiry_hours': 12,
            'linked_role_ids': ['sys_db_full_admin'],
            'conditions': {
                'environments': ['nonprod', 'sandbox'],
                'access_levels': ['admin'],
            },
            'stages': [
                {'name': 'Reporting Manager Approval', 'approver_type': 'primary', 'approval_mode': 'any_one'},
                {'name': 'DevOps Lead Approval', 'approver_type': 'secondary', 'approval_mode': 'any_one'},
            ],
        },
        {
            'id': 'dwh_nonprod_read_only',
            'name': 'System Default · DWH NonProd Read Only',
            'description': 'Fallback workflow for non-production Redshift / DWH read-only requests.',
            'service_type': 'database',
            'enabled': True,
            'priority': 905,
            'pending_request_expiry_hours': 12,
            'linked_role_ids': ['dwh_read_only'],
            'conditions': {
                'environments': ['nonprod', 'sandbox'],
                'access_levels': ['read_only'],
            },
            'stages': [
                {'name': 'Self Approval', 'approver_type': 'self', 'approval_mode': 'any_one'}
            ],
        },
        {
            'id': 'dwh_nonprod_limited_write',
            'name': 'System Default · DWH NonProd Limited Write',
            'description': 'Fallback workflow for non-production Redshift / DWH limited-write requests.',
            'service_type': 'database',
            'enabled': True,
            'priority': 905,
            'pending_request_expiry_hours': 12,
            'linked_role_ids': ['dwh_limited_write'],
            'conditions': {
                'environments': ['nonprod', 'sandbox'],
                'access_levels': ['read_limited_write'],
            },
            'stages': [
                {'name': 'Reporting Manager Approval', 'approver_type': 'primary', 'approval_mode': 'any_one'}
            ],
        },
        {
            'id': 'dwh_nonprod_admin',
            'name': 'System Default · DWH NonProd Admin',
            'description': 'Fallback workflow for non-production Redshift / DWH admin requests. Secondary approver is intended for the DevOps lead.',
            'service_type': 'database',
            'enabled': True,
            'priority': 905,
            'pending_request_expiry_hours': 12,
            'linked_role_ids': ['dwh_full_admin'],
            'conditions': {
                'environments': ['nonprod', 'sandbox'],
                'access_levels': ['admin'],
            },
            'stages': [
                {'name': 'Reporting Manager Approval', 'approver_type': 'primary', 'approval_mode': 'any_one'},
                {'name': 'DevOps Lead Approval', 'approver_type': 'secondary', 'approval_mode': 'any_one'},
            ],
        },
        {
            'id': 'sys_db_prod_non_pii_read',
            'name': 'System Default · Prod Non-PII Read',
            'description': 'Fallback workflow for production non-PII read-only database requests.',
            'service_type': 'database',
            'enabled': True,
            'priority': 900,
            'pending_request_expiry_hours': 12,
            'linked_role_ids': ['sys_db_read_only'],
            'conditions': {
                'environments': ['prod'],
                'access_levels': ['read_only'],
                'non_pii_only': True,
            },
            'stages': [
                {'name': 'Reporting Manager Approval', 'approver_type': 'primary', 'approval_mode': 'any_one'}
            ],
        },
        {
            'id': 'sys_db_prod_pii_read',
            'name': 'System Default · Prod PII Read',
            'description': 'Fallback workflow for production PII read-only database requests.',
            'service_type': 'database',
            'enabled': True,
            'priority': 900,
            'pending_request_expiry_hours': 12,
            'linked_role_ids': ['sys_db_read_only'],
            'conditions': {
                'environments': ['prod'],
                'access_levels': ['read_only'],
                'pii_only': True,
            },
            'stages': [
                {'name': 'Reporting Manager Approval', 'approver_type': 'primary', 'approval_mode': 'any_one'},
                {'name': 'Security Lead Approval', 'approver_type': 'security_lead', 'approval_mode': 'any_one'},
            ],
        },
        {
            'id': 'sys_db_prod_non_pii_limited_write',
            'name': 'System Default · Prod Non-PII Limited Write',
            'description': 'Fallback workflow for production non-PII limited-write database requests.',
            'service_type': 'database',
            'enabled': True,
            'priority': 900,
            'pending_request_expiry_hours': 12,
            'linked_role_ids': ['sys_db_limited_write'],
            'conditions': {
                'environments': ['prod'],
                'access_levels': ['read_limited_write'],
                'non_pii_only': True,
            },
            'stages': [
                {'name': 'Reporting Manager Approval', 'approver_type': 'primary', 'approval_mode': 'any_one'},
                {'name': 'Security Lead Approval', 'approver_type': 'security_lead', 'approval_mode': 'any_one'},
            ],
        },
        {
            'id': 'dwh_prod_non_pii_read',
            'name': 'System Default · DWH Prod Non-PII Read',
            'description': 'Fallback workflow for production Redshift / DWH read-only requests.',
            'service_type': 'database',
            'enabled': True,
            'priority': 905,
            'pending_request_expiry_hours': 12,
            'linked_role_ids': ['dwh_read_only'],
            'conditions': {
                'environments': ['prod'],
                'access_levels': ['read_only'],
                'non_pii_only': True,
            },
            'stages': [
                {'name': 'Reporting Manager Approval', 'approver_type': 'primary', 'approval_mode': 'any_one'}
            ],
        },
        {
            'id': 'dwh_prod_pii_read',
            'name': 'System Default · DWH Prod PII Read',
            'description': 'Fallback workflow for production Redshift / DWH PII read-only requests.',
            'service_type': 'database',
            'enabled': True,
            'priority': 905,
            'pending_request_expiry_hours': 12,
            'linked_role_ids': ['dwh_read_only'],
            'conditions': {
                'environments': ['prod'],
                'access_levels': ['read_only'],
                'pii_only': True,
            },
            'stages': [
                {'name': 'Reporting Manager Approval', 'approver_type': 'primary', 'approval_mode': 'any_one'},
                {'name': 'Security Lead Approval', 'approver_type': 'security_lead', 'approval_mode': 'any_one'},
            ],
        },
        {
            'id': 'dwh_prod_non_pii_limited_write',
            'name': 'System Default · DWH Prod Non-PII Limited Write',
            'description': 'Fallback workflow for production Redshift / DWH limited-write requests.',
            'service_type': 'database',
            'enabled': True,
            'priority': 905,
            'pending_request_expiry_hours': 12,
            'linked_role_ids': ['dwh_limited_write'],
            'conditions': {
                'environments': ['prod'],
                'access_levels': ['read_limited_write'],
                'non_pii_only': True,
            },
            'stages': [
                {'name': 'Reporting Manager Approval', 'approver_type': 'primary', 'approval_mode': 'any_one'},
                {'name': 'Security Lead Approval', 'approver_type': 'security_lead', 'approval_mode': 'any_one'},
            ],
        },
    ]


def merge_default_workflows(existing_workflows):
    existing = [normalize_workflow(item) for item in (existing_workflows or []) if isinstance(item, dict)]
    defaults = [normalize_workflow(item) for item in _default_workflow_definitions()]
    by_id = {str(item.get('id') or '').strip(): item for item in existing if str(item.get('id') or '').strip()}
    changed = False
    for default in defaults:
        workflow_id = str(default.get('id') or '').strip()
        if workflow_id in by_id:
            current = by_id[workflow_id]
            merged = normalize_workflow({
                **default,
                **current,
                'conditions': {
                    **(default.get('conditions') or {}),
                    **(current.get('conditions') or {}),
                },
                'approver_contacts': {
                    **(default.get('approver_contacts') or {}),
                    **(current.get('approver_contacts') or {}),
                },
                'stages': current.get('stages') or default.get('stages') or [],
            })
            if merged != current:
                by_id[workflow_id] = merged
                changed = True
            continue
        by_id[workflow_id] = default
        changed = True

    ordered = []
    seen = set()
    for default in defaults:
        workflow_id = str(default.get('id') or '').strip()
        if workflow_id and workflow_id in by_id and workflow_id not in seen:
            ordered.append(by_id[workflow_id])
            seen.add(workflow_id)
    for item in existing:
        workflow_id = str(item.get('id') or '').strip()
        if workflow_id and workflow_id not in seen:
            ordered.append(by_id.get(workflow_id, item))
            seen.add(workflow_id)
    return ordered, changed


def workflow_has_self_approval_stage(workflow):
    item = normalize_workflow(workflow)
    return any(_is_self_approval_type(stage.get('approver_type')) for stage in item.get('stages', []))


def current_stage(runtime_state):
    state = runtime_state if isinstance(runtime_state, dict) else {}
    stages = state.get('stages') if isinstance(state.get('stages'), list) else []
    idx = int(state.get('current_stage_index') or 0)
    if idx < 0 or idx >= len(stages):
        return None
    stage = stages[idx]
    return stage if isinstance(stage, dict) else None
