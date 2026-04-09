#!/usr/bin/env python3
"""
Delete stale IAM Identity Center JIT permission sets.

Stale = permission set name starts with "JIT-" and has no account assignments.
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


def _aws_region() -> str:
    return (
        str(os.getenv("IDENTITY_CENTER_REGION") or "").strip()
        or str(os.getenv("SSO_REGION") or "").strip()
        or str(os.getenv("AWS_REGION") or "").strip()
        or "ap-south-1"
    )


def _assumed_creds(role_arn: str, session_name: str) -> dict[str, str]:
    sts = boto3.client("sts", region_name=_aws_region(), config=Config(connect_timeout=5, read_timeout=15))
    resp = sts.assume_role(RoleArn=role_arn, RoleSessionName=session_name)
    creds = (resp.get("Credentials") or {})
    return {
        "aws_access_key_id": str(creds.get("AccessKeyId") or ""),
        "aws_secret_access_key": str(creds.get("SecretAccessKey") or ""),
        "aws_session_token": str(creds.get("SessionToken") or ""),
    }


def _sso_admin_client(region: str, role_arn: str, session_name: str):
    kwargs: dict[str, Any] = {
        "region_name": region,
        "config": Config(connect_timeout=5, read_timeout=30),
    }
    if role_arn:
        kwargs.update(_assumed_creds(role_arn, session_name))
    return boto3.client("sso-admin", **kwargs)


def _resolve_instance_arn(sso_admin, provided_instance_arn: str) -> str:
    instance_arn = str(provided_instance_arn or "").strip() or str(os.getenv("SSO_INSTANCE_ARN") or "").strip()
    if instance_arn:
        return instance_arn
    resp = sso_admin.list_instances()
    instances = resp.get("Instances") or []
    if not instances:
        raise RuntimeError("No IAM Identity Center instance found.")
    return str((instances[0] or {}).get("InstanceArn") or "").strip()


def _list_permission_set_arns(sso_admin, instance_arn: str) -> list[str]:
    arns: list[str] = []
    next_token = None
    while True:
        kwargs = {"InstanceArn": instance_arn}
        if next_token:
            kwargs["NextToken"] = next_token
        page = sso_admin.list_permission_sets(**kwargs)
        arns.extend([str(v or "").strip() for v in (page.get("PermissionSets") or []) if str(v or "").strip()])
        next_token = page.get("NextToken")
        if not next_token:
            break
    return sorted(set(arns))


def _permission_set_name(sso_admin, instance_arn: str, permission_set_arn: str) -> str:
    det = sso_admin.describe_permission_set(
        InstanceArn=instance_arn,
        PermissionSetArn=permission_set_arn,
    )
    ps = det.get("PermissionSet") or {}
    return str(ps.get("Name") or permission_set_arn.rsplit("/", 1)[-1]).strip()


def _provisioned_accounts(sso_admin, instance_arn: str, permission_set_arn: str) -> list[str]:
    account_ids: list[str] = []
    next_token = None
    while True:
        kwargs = {
            "InstanceArn": instance_arn,
            "PermissionSetArn": permission_set_arn,
            "ProvisioningStatus": "LATEST_PERMISSION_SET_PROVISIONED",
        }
        if next_token:
            kwargs["NextToken"] = next_token
        resp = sso_admin.list_accounts_for_provisioned_permission_set(**kwargs)
        account_ids.extend([str(v or "").strip() for v in (resp.get("AccountIds") or []) if str(v or "").strip()])
        next_token = resp.get("NextToken")
        if not next_token:
            break
    return sorted(set(account_ids))


def _preflight_required_permissions(sso_admin, instance_arn: str, permission_set_arn: str):
    """
    Fail fast if required API permission for safe stale detection is missing.
    We require ListAccountsForProvisionedPermissionSet so we only delete sets that are truly not in use.
    """
    try:
        _provisioned_accounts(sso_admin, instance_arn, permission_set_arn)
    except ClientError as exc:
        code = str((exc.response or {}).get("Error", {}).get("Code") or "").strip()
        if code == "AccessDeniedException":
            raise RuntimeError(
                "Missing required IAM Identity Center permission on assumed role: "
                "sso:ListAccountsForProvisionedPermissionSet. "
                "Grant it before running cleanup so stale detection remains safe."
            ) from exc
        raise


def _has_assignments(sso_admin, instance_arn: str, permission_set_arn: str, account_id: str) -> bool:
    next_token = None
    while True:
        kwargs = {
            "InstanceArn": instance_arn,
            "AccountId": account_id,
            "PermissionSetArn": permission_set_arn,
            "MaxResults": 100,
        }
        if next_token:
            kwargs["NextToken"] = next_token
        resp = sso_admin.list_account_assignments(**kwargs)
        if resp.get("AccountAssignments"):
            return True
        next_token = resp.get("NextToken")
        if not next_token:
            break
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Delete stale JIT IAM Identity Center permission sets.")
    parser.add_argument("--region", default=_aws_region(), help="Identity Center region (default from env/AWS_REGION)")
    parser.add_argument("--instance-arn", default="", help="Identity Center instance ARN")
    parser.add_argument("--assume-role-arn", default=os.getenv("IDC_ASSUME_ROLE_ARN", ""), help="Optional role to assume")
    parser.add_argument("--assume-role-session-name", default="npamx-jit-cleanup", help="STS session name")
    parser.add_argument("--dry-run", action="store_true", help="Only report stale sets; do not delete")
    args = parser.parse_args()

    sso_admin = _sso_admin_client(args.region, args.assume_role_arn, args.assume_role_session_name)
    instance_arn = _resolve_instance_arn(sso_admin, args.instance_arn)

    all_arns = _list_permission_set_arns(sso_admin, instance_arn)
    stale_sets: list[tuple[str, str]] = []
    jit_sets: list[tuple[str, str]] = []
    skipped = 0
    errors = 0

    for arn in all_arns:
        try:
            name = _permission_set_name(sso_admin, instance_arn, arn)
            if name.upper().startswith("JIT-"):
                jit_sets.append((name, arn))
            else:
                skipped += 1
        except Exception as exc:
            errors += 1
            print(f"[ERROR] inspect {arn}: {exc}", flush=True)

    if jit_sets:
        # Preflight permission check once; prevents noisy per-ARN failures and unsafe deletes.
        _preflight_required_permissions(sso_admin, instance_arn, jit_sets[0][1])

    for name, arn in jit_sets:
        try:
            accounts = _provisioned_accounts(sso_admin, instance_arn, arn)
            assigned = False
            for account_id in accounts:
                if _has_assignments(sso_admin, instance_arn, arn, account_id):
                    assigned = True
                    break
            if not assigned:
                stale_sets.append((name, arn))
        except Exception as exc:
            errors += 1
            print(f"[ERROR] inspect {arn}: {exc}", flush=True)

    deleted = 0
    if stale_sets and not args.dry_run:
        for name, arn in stale_sets:
            try:
                sso_admin.delete_permission_set(InstanceArn=instance_arn, PermissionSetArn=arn)
                deleted += 1
                print(f"[DELETED] {name} | {arn}", flush=True)
            except Exception as exc:
                errors += 1
                print(f"[ERROR] delete {name} | {arn}: {exc}", flush=True)

    print(
        f"[SUMMARY] total={len(all_arns)} skipped_non_jit={skipped} stale={len(stale_sets)} "
        f"deleted={deleted} dry_run={bool(args.dry_run)} errors={errors}",
        flush=True,
    )
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
