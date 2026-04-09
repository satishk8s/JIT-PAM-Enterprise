import os
import io
import csv
import json
import uuid
import sqlite3
import re
import boto3
from botocore.exceptions import BotoCoreError, ClientError
from datetime import datetime
from persistence import NpamxStore

AUDIT_DIR = os.path.join(os.path.dirname(__file__), 'audit')
AUDIT_FILE = os.path.join(AUDIT_DIR, 'db_queries.log')
APP_ACTIVITY_FILE = os.path.join(AUDIT_DIR, 'app_activity.log')
NPAMX_DB_PATH = os.getenv('NPAMX_DB_PATH') or os.path.join(os.path.dirname(__file__), 'data', 'npamx.db')
APP_SETTINGS_PATH = os.getenv('APP_SETTINGS_PATH') or os.path.join(os.path.dirname(__file__), 'data', 'app_settings.json')
STORE = NpamxStore(NPAMX_DB_PATH)


def _ensure_audit_dir():
    os.makedirs(AUDIT_DIR, exist_ok=True)


def _load_audit_export_settings():
    try:
        if not os.path.exists(APP_SETTINGS_PATH):
            return {}
        with open(APP_SETTINGS_PATH, 'r', encoding='utf-8') as fh:
            payload = json.load(fh) or {}
        settings = payload.get('settings') if isinstance(payload, dict) else {}
        return settings if isinstance(settings, dict) else {}
    except Exception:
        return {}


def _audit_export_target():
    settings = _load_audit_export_settings()
    return _audit_export_target_from_settings(settings)


def _audit_export_target_from_settings(settings):
    source = settings if isinstance(settings, dict) else {}
    bucket = str(settings.get('audit_logs_bucket') or '').strip()
    prefix = str(settings.get('audit_logs_prefix') or 'npamx/audit').strip().strip('/')
    auto_export = str(settings.get('audit_logs_auto_export') or '').strip().lower() in ('1', 'true', 'yes', 'on')
    return bucket, prefix, auto_export


def _put_csv_object(bucket, key, fieldnames, row):
    sio = io.StringIO()
    writer = csv.DictWriter(sio, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerow(row)
    boto3.client('s3').put_object(
        Bucket=bucket,
        Key=key,
        Body=sio.getvalue().encode('utf-8'),
        ContentType='text/csv',
    )


def _put_csv_rows_object(bucket, key, fieldnames, rows):
    sio = io.StringIO()
    writer = csv.DictWriter(sio, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)
    boto3.client('s3').put_object(
        Bucket=bucket,
        Key=key,
        Body=sio.getvalue().encode('utf-8'),
        ContentType='text/csv',
    )


def _put_json_object(bucket, key, payload):
    body = json.dumps(payload or {}, separators=(',', ':'), ensure_ascii=True, default=str)
    boto3.client('s3').put_object(
        Bucket=bucket,
        Key=key,
        Body=body.encode('utf-8'),
        ContentType='application/json',
    )


def _dated_s3_key(prefix, category, family, timestamp, filename):
    ts = timestamp if isinstance(timestamp, datetime) else datetime.utcnow()
    root = '/'.join([
        part for part in (
            str(prefix or '').strip().strip('/'),
            str(category or '').strip().strip('/'),
            str(family or '').strip().strip('/'),
        ) if part
    ])
    return f"{root}/{ts.strftime('%Y/%m/%d')}/{filename}"


def _ticket_archive_prefix(prefix):
    root = str(prefix or 'npamx/audit').strip().strip('/')
    return f"{root}/request-tickets"


def _s3_safe_segment(value, default='unknown'):
    raw = str(value or '').strip().lower()
    if not raw:
        return default
    raw = raw.replace('@', '_at_')
    raw = re.sub(r'[^a-z0-9._-]+', '-', raw)
    raw = re.sub(r'-{2,}', '-', raw).strip('-.')
    return raw or default


def _ticket_archive_owner(ticket):
    if not isinstance(ticket, dict):
        return 'unknown'
    return (
        str(ticket.get('beneficiary_email') or '').strip().lower()
        or str(ticket.get('raised_by_email') or '').strip().lower()
        or 'unknown'
    )


def _ticket_archive_flat_row(ticket):
    payload = ticket.get('payload') if isinstance(ticket.get('payload'), dict) else {}
    return {
        'request_id': str(ticket.get('request_id') or '').strip(),
        'category': str(ticket.get('category') or '').strip(),
        'request_type': str(ticket.get('request_type') or '').strip(),
        'raised_by_email': str(ticket.get('raised_by_email') or '').strip(),
        'beneficiary_email': str(ticket.get('beneficiary_email') or '').strip(),
        'account_id': str(ticket.get('account_id') or '').strip(),
        'resource_target': str(ticket.get('resource_target') or '').strip(),
        'requested_actions': str(ticket.get('requested_actions') or '').strip(),
        'request_reason': str(ticket.get('request_reason') or '').strip(),
        'status': str(ticket.get('status') or '').strip(),
        'approval_workflow_name': str(ticket.get('approval_workflow_name') or '').strip(),
        'approver_emails': str(ticket.get('approver_emails') or '').strip(),
        'approved_by': str(ticket.get('approved_by') or '').strip(),
        'declined_by': str(ticket.get('declined_by') or '').strip(),
        'decline_reason': str(ticket.get('decline_reason') or '').strip(),
        'requested_at': str(ticket.get('requested_at') or '').strip(),
        'decision_at': str(ticket.get('decision_at') or '').strip(),
        'expires_at': str(ticket.get('expires_at') or '').strip(),
        'deleted_at': str(ticket.get('deleted_at') or '').strip(),
        'deleted_by': str(ticket.get('deleted_by') or '').strip(),
        'payload_json': json.dumps(payload, separators=(',', ':'), ensure_ascii=True, default=str),
    }


def _read_tsv_log_rows(local_path, columns):
    rows = []
    if not os.path.exists(local_path):
        return rows
    with open(local_path, 'r', encoding='utf-8') as fh:
        for raw_line in fh:
            line = str(raw_line or '').rstrip('\n')
            if not line.strip():
                continue
            parts = line.split('\t')
            row = {}
            for idx, column in enumerate(columns):
                row[column] = parts[idx] if idx < len(parts) else ''
            rows.append(row)
    return rows


def _mirror_event_to_s3(event_type, row):
    bucket, prefix, auto_export = _audit_export_target()
    if not bucket or not auto_export:
        return
    ts = str(row.get('ts') or datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'))
    safe_ts = ts.replace(':', '').replace('-', '').replace('T', '_').replace('Z', '')
    key = _dated_s3_key(prefix, 'events', event_type, datetime.utcnow(), f'{safe_ts}_{uuid.uuid4().hex[:8]}.csv')
    _put_csv_object(bucket, key, list(row.keys()), row)


def export_full_audit_snapshot_to_s3():
    bucket, prefix, _auto_export = _audit_export_target()
    if not bucket:
        raise RuntimeError('Audit log bucket is not configured.')

    rows = []
    with sqlite3.connect(NPAMX_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        for row in conn.execute(
            """
            SELECT ts, user_email, request_id, role, action, allowed, rows_returned, error, query, payload_json
            FROM audit_logs
            ORDER BY ts DESC
            """
        ):
            rows.append({
                'timestamp': row['ts'],
                'user_email': row['user_email'],
                'request_id': row['request_id'],
                'role': row['role'],
                'action': row['action'],
                'allowed': row['allowed'],
                'rows_returned': row['rows_returned'],
                'error': row['error'],
                'query': row['query'],
                'payload_json': row['payload_json'],
            })

    if not rows:
        rows.append({
            'timestamp': '',
            'user_email': '',
            'request_id': '',
            'role': '',
            'action': '',
            'allowed': '',
            'rows_returned': '',
            'error': '',
            'query': '',
            'payload_json': '',
        })

    now = datetime.utcnow()
    key = _dated_s3_key(prefix, 'snapshots', 'audit_logs', now, f'audit_logs_{now.strftime("%Y%m%d_%H%M%S")}.csv')
    _put_csv_rows_object(bucket, key, list(rows[0].keys()), rows)

    uploaded = [key]
    extra_exports = (
        ('pam_actions.log', 'pam_actions', ['timestamp', 'actor_email', 'action', 'request_id', 'ip', 'details']),
        ('db_queries.log', 'db_queries', ['timestamp', 'user_email', 'request_id', 'role', 'allowed', 'rows_returned', 'error', 'query']),
        (
            'app_activity.log',
            'app_activity',
            ['timestamp', 'user_email', 'auth_type', 'is_admin', 'action', 'http_method', 'path', 'status_code', 'request_id', 'ip', 'details'],
        ),
    )
    for local_name, family, columns in extra_exports:
        local_path = os.path.join(AUDIT_DIR, local_name)
        parsed_rows = _read_tsv_log_rows(local_path, columns)
        if not parsed_rows:
            continue
        local_key = _dated_s3_key(prefix, 'snapshots', family, now, f'{family}_{now.strftime("%Y%m%d_%H%M%S")}.csv')
        _put_csv_rows_object(bucket, local_key, columns, parsed_rows)
        uploaded.append(local_key)
    return {
        'bucket': bucket,
        'prefix': prefix,
        'uploaded_keys': uploaded,
        'row_count': max(0, len(rows) - 1) if rows and not rows[0].get('timestamp') else len(rows),
    }


def test_audit_export_target(settings_override=None):
    bucket, prefix, _auto_export = _audit_export_target_from_settings(
        settings_override if isinstance(settings_override, dict) else _load_audit_export_settings()
    )
    if not bucket:
        raise RuntimeError('Audit log bucket is not configured.')

    s3 = boto3.client('s3')
    checks = []

    try:
        s3.head_bucket(Bucket=bucket)
        checks.append({
            'name': 'Bucket access',
            'status': 'success',
            'message': f'Bucket {bucket} is reachable from NPAMX.',
        })
    except ClientError as exc:
        raise RuntimeError(f'Failed to access bucket {bucket}: {exc}') from exc
    except BotoCoreError as exc:
        raise RuntimeError(f'Failed to reach S3 bucket {bucket}: {exc}') from exc

    probe_key = _dated_s3_key(prefix, 'probes', 'connectivity', datetime.utcnow(), f'npamx_probe_{uuid.uuid4().hex[:8]}.csv')
    body = 'timestamp,status\n' + datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ') + ',ok\n'
    try:
        s3.put_object(
            Bucket=bucket,
            Key=probe_key,
            Body=body.encode('utf-8'),
            ContentType='text/csv',
        )
        checks.append({
            'name': 'CSV write probe',
            'status': 'success',
            'message': f'Wrote probe object to s3://{bucket}/{probe_key}',
        })
    except ClientError as exc:
        raise RuntimeError(f'Bucket access works, but CSV upload failed for s3://{bucket}/{probe_key}: {exc}') from exc
    except BotoCoreError as exc:
        raise RuntimeError(f'Bucket access works, but CSV upload failed for s3://{bucket}/{probe_key}: {exc}') from exc

    try:
        s3.delete_object(Bucket=bucket, Key=probe_key)
        checks.append({
            'name': 'Probe cleanup',
            'status': 'success',
            'message': 'Deleted temporary probe object.',
        })
    except Exception:
        checks.append({
            'name': 'Probe cleanup',
            'status': 'warning',
            'message': f'Probe object remained at s3://{bucket}/{probe_key}. Delete it manually if required.',
        })

    return {
        'bucket': bucket,
        'prefix': prefix,
        'probe_key': probe_key,
        'checks': checks,
    }


def archive_request_ticket_to_s3(ticket, *, event='updated', write_event=True):
    bucket, prefix, _auto_export = _audit_export_target()
    if not bucket:
        return None
    ticket_row = _ticket_archive_flat_row(ticket or {})
    request_id = ticket_row.get('request_id') or uuid.uuid4().hex
    owner_email = _ticket_archive_owner(ticket or {})
    owner_segment = _s3_safe_segment(owner_email, 'unknown-user')
    ticket_prefix = _ticket_archive_prefix(prefix)
    latest_key = f"{ticket_prefix}/users/{owner_segment}/requests/{request_id}/latest.json"
    payload = dict(ticket_row)
    payload.update({
        'archive_owner_email': owner_email,
        'archive_event': str(event or 'updated').strip() or 'updated',
        'archived_at': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
    })
    _put_json_object(bucket, latest_key, payload)
    event_key = ''
    if write_event:
        ts = datetime.utcnow()
        stamp = ts.strftime('%Y%m%d_%H%M%S')
        event_key = _dated_s3_key(
            ticket_prefix,
            'users',
            f"{owner_segment}/events",
            ts,
            f"{stamp}_{request_id}_{_s3_safe_segment(event, 'updated')}.json",
        )
        _put_json_object(bucket, event_key, payload)
    return {
        'bucket': bucket,
        'prefix': ticket_prefix,
        'latest_key': latest_key,
        'event_key': event_key,
        'owner_email': owner_email,
    }


def backfill_request_tickets_to_s3():
    bucket, prefix, _auto_export = _audit_export_target()
    if not bucket:
        raise RuntimeError('Audit log bucket is not configured.')

    all_rows = []
    offset = 0
    page_size = 1000
    while True:
        rows, total = STORE.list_request_tickets(limit=page_size, offset=offset)
        if not rows:
            break
        all_rows.extend(rows)
        offset += len(rows)
        if offset >= total:
            break

    ticket_prefix = _ticket_archive_prefix(prefix)
    for row in all_rows:
        archive_request_ticket_to_s3(row, event='backfill', write_event=False)

    now = datetime.utcnow()
    flat_rows = [_ticket_archive_flat_row(row) for row in all_rows]
    if not flat_rows:
        flat_rows = [_ticket_archive_flat_row({})]
    current_key = f"{ticket_prefix}/snapshots/current/request_tickets_current.csv"
    dated_key = _dated_s3_key(ticket_prefix, 'snapshots', 'request_tickets', now, f"request_tickets_{now.strftime('%Y%m%d_%H%M%S')}.csv")
    _put_csv_rows_object(bucket, current_key, list(flat_rows[0].keys()), flat_rows)
    _put_csv_rows_object(bucket, dated_key, list(flat_rows[0].keys()), flat_rows)
    return {
        'bucket': bucket,
        'prefix': ticket_prefix,
        'ticket_count': len(all_rows),
        'uploaded_keys': [current_key, dated_key],
    }


def log_db_query(user_email, request_id, role, query, allowed, rows_returned=None, error=None):
    """
    Append audit log entry. Immutable append-only.
    """
    _ensure_audit_dir()
    ts = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    rows = str(rows_returned) if rows_returned is not None else '-'
    err = (error or '').replace('\t', ' ').replace('\n', ' ')
    # Tab-separated for easy parsing
    line = f"{ts}\t{user_email}\t{request_id}\t{role}\t{allowed}\t{rows}\t{err}\t{query[:500]}\n"
    with open(AUDIT_FILE, 'a', encoding='utf-8') as f:
        f.write(line)

    # Also persist to SQLite (best-effort).
    try:
        STORE.insert_audit_log(
            ts=ts,
            user_email=user_email,
            request_id=request_id,
            role=role,
            action="db_query",
            allowed=bool(allowed),
            rows_returned=int(rows_returned) if rows_returned is not None else None,
            error=error,
            query=query,
            payload={},
        )
    except Exception:
        pass
    try:
        _mirror_event_to_s3('db_query', {
            'ts': ts,
            'user_email': user_email,
            'request_id': request_id or '',
            'role': role or '',
            'action': 'db_query',
            'allowed': bool(allowed),
            'rows_returned': rows_returned if rows_returned is not None else '',
            'error': error or '',
            'query': query,
            'payload_json': json.dumps({}, separators=(',', ':')),
        })
    except Exception:
        pass


def log_pam_action(actor_email, action, request_id=None, details=None, ip=None):
    """
    Audit log for PAM-sensitive actions: approve, deny, revoke, admin changes.
    actor_email: who performed the action; details: dict (no secrets).
    """
    _ensure_audit_dir()
    ts = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    pam_file = os.path.join(AUDIT_DIR, 'pam_actions.log')
    rid = str(request_id or '').replace('\t', ' ')
    act = str(actor_email or '').replace('\t', ' ')
    action_s = str(action or '').replace('\t', ' ')
    ip_s = str(ip or '').replace('\t', ' ')
    payload = dict(details or {}) if isinstance(details, dict) else {}
    if ip:
        payload.setdefault('ip', str(ip))
    det = json.dumps(payload, default=str)[:500] if payload else ''
    line = f"{ts}\t{act}\t{action_s}\t{rid}\t{ip_s}\t{det}\n"
    try:
        with open(pam_file, 'a', encoding='utf-8') as f:
            f.write(line)
    except Exception:
        pass


def log_app_activity(
    user_email,
    action,
    *,
    http_method='',
    path='',
    status_code=None,
    request_id=None,
    auth_type='',
    is_admin=False,
    ip=None,
    details=None,
    error=None,
    allowed=None,
):
    """
    Audit log for authenticated NPAMX application activity.
    This is broader than PAM-only actions and is intended for SIEM export.
    """
    _ensure_audit_dir()
    ts = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    actor = str(user_email or '').replace('\t', ' ')
    action_s = str(action or '').replace('\t', ' ')
    method_s = str(http_method or '').replace('\t', ' ')
    path_s = str(path or '').replace('\t', ' ')
    status_s = '' if status_code is None else str(status_code)
    rid = str(request_id or '').replace('\t', ' ')
    auth_s = str(auth_type or '').replace('\t', ' ')
    admin_s = 'true' if bool(is_admin) else 'false'
    ip_s = str(ip or '').replace('\t', ' ')
    payload = dict(details or {}) if isinstance(details, dict) else {}
    payload.update({
        'http_method': method_s,
        'path': path_s,
        'status_code': status_s,
        'auth_type': auth_s,
        'is_admin': bool(is_admin),
    })
    if ip:
        payload.setdefault('ip', str(ip))
    if error:
        payload['error'] = str(error)
    details_s = json.dumps(payload, default=str, separators=(',', ':'))[:1000] if payload else ''
    line = f"{ts}\t{actor}\t{auth_s}\t{admin_s}\t{action_s}\t{method_s}\t{path_s}\t{status_s}\t{rid}\t{ip_s}\t{details_s}\n"
    try:
        with open(APP_ACTIVITY_FILE, 'a', encoding='utf-8') as f:
            f.write(line)
    except Exception:
        pass
    try:
        STORE.insert_audit_log(
            ts=ts,
            user_email=actor,
            request_id=rid or None,
            role='admin' if is_admin else auth_s,
            action=action_s or 'app_activity',
            allowed=(bool(allowed) if allowed is not None else (False if error else True)),
            rows_returned=None,
            error=str(error or ''),
            query='',
            payload=payload,
        )
    except Exception:
        pass
    try:
        _mirror_event_to_s3('app_activity', {
            'ts': ts,
            'user_email': actor,
            'request_id': rid,
            'role': 'admin' if is_admin else auth_s,
            'action': action_s or 'app_activity',
            'allowed': bool(allowed) if allowed is not None else (False if error else True),
            'rows_returned': '',
            'error': str(error or ''),
            'query': '',
            'payload_json': json.dumps(payload, default=str, separators=(',', ':')),
        })
    except Exception:
        pass
    try:
        STORE.insert_audit_log(
            ts=ts,
            user_email=act,
            request_id=rid or None,
            role='',
            action=action_s,
            allowed=True,
            rows_returned=None,
            error=None,
            query='',
            payload=payload,
        )
    except Exception:
        pass
    try:
        _mirror_event_to_s3('pam_action', {
            'ts': ts,
            'user_email': act,
            'request_id': rid,
            'role': '',
            'action': action_s,
            'allowed': True,
            'rows_returned': '',
            'error': '',
            'query': '',
            'payload_json': json.dumps(payload, default=str, separators=(',', ':')),
        })
    except Exception:
        pass
