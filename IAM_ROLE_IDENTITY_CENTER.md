# IAM Role for PAM – Identity Center (Management Account)

Use an **IAM role** so the PAM app can call AWS Identity Center (users, groups, permission sets) and create/assign permission sets **without storing access keys** on the EC2.

---

## Option A: PAM EC2 in **management account**

Attach an instance profile to the PAM EC2 with the role below. The app will use the instance role automatically (no `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`).

---

## Option B: PAM EC2 in **member account** (e.g. POC)

1. **In management account:** Create a role (e.g. `PAMIdentityCenterRole`) with the policy below and a **trust policy** that allows the POC account (or the PAM EC2 role) to assume it.
2. **In POC account:** Give the PAM EC2 instance profile permission to `sts:AssumeRole` on that management-account role.
3. **In the app:** Either use AWS SDK default chain (if you configure the app to assume that role), or set `AWS_ROLE_ARN` and use a bootstrap that assumes the role and exports credentials. (Implementation detail: app can call `sts.assume_role()` and set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` in the process environment for the rest of the run.)

---

## Required permissions (management account)

Create an IAM policy (e.g. `PAM-IdentityCenter-Policy`) with the following. Attach it to the role used by PAM (instance profile in management account, or the role that PAM assumes in the management account).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "IdentityStoreListUsersGroups",
      "Effect": "Allow",
      "Action": [
        "identitystore:ListUsers",
        "identitystore:ListUsersPages",
        "identitystore:DescribeUser",
        "identitystore:ListGroups",
        "identitystore:ListGroupsPages",
        "identitystore:DescribeGroup",
        "identitystore:ListGroupMemberships",
        "identitystore:ListGroupMembershipsForMember"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SSOAdminPermissionSets",
      "Effect": "Allow",
      "Action": [
        "sso:ListPermissionSets",
        "sso:DescribePermissionSet",
        "sso:CreatePermissionSet",
        "sso:DeletePermissionSet",
        "sso:UpdatePermissionSet",
        "sso:PutInlinePolicyToPermissionSet",
        "sso:GetInlinePolicyForPermissionSet",
        "sso:ListManagedPoliciesInPermissionSet",
        "sso:AttachManagedPolicyToPermissionSet",
        "sso:DetachManagedPolicyFromPermissionSet",
        "sso:ListPermissionSetProvisioningStatuses",
        "sso:GetPermissionSetProvisioningStatus",
        "sso:ProvisionPermissionSet",
        "sso:DescribePermissionSetProvisioningStatus"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SSOAdminAccountAssignments",
      "Effect": "Allow",
      "Action": [
        "sso:CreateAccountAssignment",
        "sso:DeleteAccountAssignment",
        "sso:ListAccountAssignments",
        "sso:ListAccountAssignmentCreationStatus",
        "sso:ListAccountAssignmentDeletionStatus",
        "sso:DescribeAccountAssignmentCreationStatus",
        "sso:DescribeAccountAssignmentDeletionStatus"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SSOAdminInstance",
      "Effect": "Allow",
      "Action": [
        "sso-instance:GetInstanceAccessControlAttributeConfiguration",
        "sso-instance:ListInstances"
      ],
      "Resource": "*"
    },
    {
      "Sid": "OrganizationsListAccounts",
      "Effect": "Allow",
      "Action": [
        "organizations:ListAccounts",
        "organizations:DescribeOrganization"
      ],
      "Resource": "*"
    },
    {
      "Sid": "RDSDescribeForDBList",
      "Effect": "Allow",
      "Action": [
        "rds:DescribeDBInstances",
        "rds:ListTagsForResource"
      ],
      "Resource": "*"
    },
    {
      "Sid": "STSCallerIdentity",
      "Effect": "Allow",
      "Action": "sts:GetCallerIdentity",
      "Resource": "*"
    }
  ]
}
```

**Note:** API names use the `sso` and `sso-instance` prefixes as in IAM; the same operations are exposed as `sso-admin` in the AWS CLI (`aws sso-admin ...`). The SDK uses the same permissions.

---

## Steps (summary)

### 1. Create the policy in management account

- IAM → Policies → Create policy → JSON → paste the policy above → Name: `PAM-IdentityCenter-Policy`.

### 2. Create the role in management account

- IAM → Roles → Create role.
- **Option A (PAM in management account):** Trusted entity: **AWS service** → EC2. Attach `PAM-IdentityCenter-Policy`. Name e.g. `PAM-IdentityCenter-Role`. Then EC2 → your PAM instance → Actions → Security → Modify IAM role → select this role.
- **Option B (PAM in POC account):** Trusted entity: **Another AWS account** → POC account ID `867625663987`. Use the trust policy below (restricts to role `ssm-role`). Attach `PAM-IdentityCenter-Policy`. Name e.g. `PAMIdentityCenterRole`. Note the role ARN (e.g. `arn:aws:iam::MANAGEMENT_ACCOUNT_ID:role/PAMIdentityCenterRole`).

#### Trust relationship for management account role (Option B)

When creating the role in the **management account**, set this **Trust relationship** so only the PAM EC2 role in POC can assume it (POC role: `arn:aws:iam::867625663987:role/ssm-role`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::867625663987:role/ssm-role"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

After creating the role, IAM → Roles → **PAMIdentityCenterRole** → Trust relationships → Edit → paste the above.

### 3. If using Option B (cross-account)

In **POC account** (867625663987), ensure the PAM EC2 instance profile role **ssm-role** can assume the management role. Add this inline policy or a dedicated policy to **ssm-role**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::MANAGEMENT_ACCOUNT_ID:role/PAMIdentityCenterRole"
    }
  ]
}
```

Replace `MANAGEMENT_ACCOUNT_ID` with your management account ID.

Then the PAM application must assume this role (e.g. on startup) and use the returned temporary credentials for all Identity Center and SSO-admin calls. Until that is implemented, you can still use **temporary credentials** (access key, secret key, session token) from your SSO login and set them in the environment on the PAM EC2 for testing.

---

## Config (Identity Center)

Ensure the app has:

- **Identity Store ID** – e.g. `d-9f677136b2` (from Identity Center → Settings).
- **SSO Instance ARN** – e.g. `arn:aws:sso:::instance/ssoins-65955f0870d9f06f`.

Set via environment or config so the app can call Identity Store and SSO-admin APIs in the correct instance.

---

## Testing without a role (temporary)

For one-off testing you can use your own SSO credentials on the PAM server:

1. Log in via AWS SSO: `aws sso login --profile YourProfile`.
2. Export temporary credentials (or use credential process in `~/.aws/config`):
   - From the SSO profile, run:
     ```bash
     export AWS_ACCESS_KEY_ID=...
     export AWS_SECRET_ACCESS_KEY=...
     export AWS_SESSION_TOKEN=...
     ```
   (or use `aws configure export-credentials` and source the env file).
3. Start the PAM app in that shell so it uses these credentials. The app uses the default boto3 credential chain (env vars, then instance profile, etc.).

For a permanent setup, use **Option A** or **Option B** above so the EC2 uses an IAM role and you do not need to paste credentials.
