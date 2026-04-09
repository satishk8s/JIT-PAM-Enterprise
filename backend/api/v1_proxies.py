"""
Register /api/v1/* routes that delegate to existing app view functions.
Keeps legacy /api/... working; v1 is an alias for cutover.
"""
from __future__ import annotations


def register_v1_proxies(app):
    """Add versioned API routes that call existing handlers. Call after all views are registered."""
    # Auth / Profile
    _add(app, "/api/v1/auth/login", ["GET"], "saml_login")
    _add(app, "/api/v1/auth/saml/acs", ["POST"], "saml_acs")
    _add(app, "/api/v1/auth/saml/complete", ["GET"], "saml_complete")
    _add(app, "/api/v1/profile/me", ["GET"], "saml_profile")

    # Dashboard / My Requests
    _add(app, "/api/v1/requests", ["GET"], "get_requests")
    _add(app, "/api/v1/requests/<request_id>", ["GET"], "get_request_details", ["request_id"])
    _add(app, "/api/v1/requests/<request_id>/approve", ["POST"], "approve_request", ["request_id"])
    _add(app, "/api/v1/requests/<request_id>/deny", ["POST"], "deny_request", ["request_id"])
    _add(app, "/api/v1/requests/<request_id>/revoke", ["POST"], "revoke_access", ["request_id"])
    _add(app, "/api/v1/requests/<request_id>/modify", ["POST"], "modify_request", ["request_id"])
    _add(app, "/api/v1/requests/<request_id>/delete", ["DELETE"], "delete_request", ["request_id"])
    _add(app, "/api/v1/databases/requests", ["GET"], "get_database_requests")
    _add(app, "/api/v1/databases/requests/bulk-delete", ["POST"], "bulk_delete_database_requests")

    # Catalog
    _add(app, "/api/v1/catalog/accounts", ["GET"], "get_accounts")
    _add(app, "/api/v1/catalog/permission-sets", ["GET"], "get_permission_sets")

    # DB request / access
    _add(app, "/api/v1/databases/request-access", ["POST"], "request_database_access")
    _add(app, "/api/v1/databases/approved", ["GET"], "get_approved_databases")
    _add(app, "/api/v1/db-access/<request_id>/credentials", ["GET"], "get_database_request_credentials", ["request_id"])
    _add(app, "/api/v1/databases/request/<request_id>/activate", ["POST"], "activate_database_request", ["request_id"])
    _add(app, "/api/v1/databases/request/<request_id>/delete", ["DELETE"], "delete_database_request", ["request_id"])
    _add(app, "/api/v1/databases/request/<request_id>/update-duration", ["POST"], "update_database_request_duration", ["request_id"])

    # Admin Identity Center
    _add(app, "/api/v1/admin/identity-center/users", ["GET"], "list_identity_center_users")
    _add(app, "/api/v1/admin/identity-center/users/search", ["GET"], "search_identity_center_users")
    _add(app, "/api/v1/admin/identity-center/groups", ["GET"], "list_identity_center_groups")
    _add(app, "/api/v1/admin/identity-center/groups/search", ["GET"], "search_identity_center_groups")
    _add(app, "/api/v1/admin/identity-center/permission-sets", ["GET"], "list_identity_center_permission_sets")
    _add(app, "/api/v1/admin/identity-center/org-hierarchy", ["GET"], "list_identity_center_org_hierarchy")
    _add(app, "/api/v1/admin/pam-admins", ["GET"], "get_pam_admins")
    _add(app, "/api/v1/admin/pam-admins", ["POST"], "add_pam_admin")
    _add(app, "/api/v1/admin/db-governance/summary", ["GET"], "get_admin_db_governance_summary")
    _add(app, "/api/v1/admin/db-governance/accounts", ["GET"], "get_admin_db_governance_accounts")
    _add(app, "/api/v1/admin/db-governance/databases", ["GET"], "get_admin_db_governance_databases")
    _add(app, "/api/v1/admin/db-governance/findings", ["GET"], "get_admin_db_governance_findings")
    _add(app, "/api/v1/admin/db-governance/scan-status", ["GET"], "get_admin_db_governance_scan_status")

    # Admin features & guardrails
    _add(app, "/api/v1/admin/features", ["GET"], "get_admin_features")
    _add(app, "/api/v1/admin/features", ["POST"], "save_admin_features")
    _add(app, "/api/v1/admin/guardrails", ["GET"], "get_guardrails")

    # Health
    _add(app, "/api/v1/health", ["GET"], "health")


def _add(app, path, methods, view_name, url_param_names=None):
    """Register a v1 route that delegates to an existing view by name."""
    url_param_names = url_param_names or []
    view_func = app.view_functions.get(view_name)
    if not view_func:
        return
    endpoint = "v1_" + view_name
    if url_param_names:

        def _proxy(**kwargs):
            args = [kwargs.get(k) for k in url_param_names]
            return view_func(*args)

        _proxy.__name__ = endpoint
        app.add_url_rule(path, endpoint=endpoint, view_func=_proxy, methods=methods)
    else:

        def _proxy():
            return view_func()

        _proxy.__name__ = endpoint
        app.add_url_rule(path, endpoint=endpoint, view_func=_proxy, methods=methods)
