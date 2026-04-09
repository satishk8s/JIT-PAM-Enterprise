# RDS Proxy IAM Runbook for NPAMX

This document captures the final working model for NPAMX database access through Amazon RDS Proxy with IAM authentication.

## Final Working Design

NPAMX database flow:

1. user raises database access request
2. approval workflow is evaluated
3. approved request is activated
4. Vault creates a JIT database user in MySQL
5. NPAMX creates an IAM Identity Center permission set with `rds-db:connect`
6. user signs in with Identity Center / permission set credentials
7. user generates an IAM auth token locally
8. user connects to the RDS Proxy endpoint using:
   - proxy endpoint
   - JIT DB username
   - IAM auth token as password

## Important Decision

The working pattern is:

- Vault creates IAM-authenticated DB users
- user connects through RDS Proxy using IAM token

This is different from:

- Vault creates password users and user connects through password auth

For the NPAMX proxy flow, the user should get:

- DB username
- proxy endpoint
- port
- token command
- MySQL/DBeaver/Workbench instructions

They should not get a Vault DB password for the proxy IAM path.

## AWS Console Setup

## 1. Enable IAM DB Authentication on RDS

In the RDS console:

- open the DB instance
- `Modify`
- enable `IAM DB authentication`
- apply changes

## 2. Create the RDS Proxy

In the RDS console:

- `RDS -> Proxies -> Create proxy`

Use:

- engine family: `MYSQL`
- target DB: your RDS instance
- same VPC as the DB
- private subnets
- security group allowing intended clients

Final working proxy mode:

- `DefaultAuthScheme = IAM_AUTH`
- `Auth = []`

This means the proxy is configured for end-to-end IAM auth, not Secrets Manager-based DB auth entries.

You can verify:

```bash
aws rds describe-db-proxies \
  --db-proxy-name npamx-proxy \
  --region ap-south-1 \
  --query 'DBProxies[0].{DefaultAuthScheme:DefaultAuthScheme,Auth:Auth,RoleArn:RoleArn}'
```

Expected:

- `DefaultAuthScheme` is `IAM_AUTH`
- `Auth` is empty

## 3. Security Groups

If end users connect over VPN:

- proxy SG inbound `3306` from VPN/client network
- proxy SG outbound `3306` to DB SG
- DB SG inbound `3306` from proxy SG

If PAM EC2 should also test proxy connectivity:

- proxy SG inbound `3306` from PAM EC2 SG

## Database User Setup

Vault must create MySQL users as IAM-authenticated users:

```sql
CREATE USER 'd-satish-korra-7718'@'%' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS';
GRANT SELECT, SHOW VIEW ON mydb.* TO 'd-satish-korra-7718'@'%';
```

Validation:

```sql
SHOW CREATE USER 'd-satish-korra-7718'@'%';
SHOW GRANTS FOR 'd-satish-korra-7718'@'%';
```

Expected:

- `AWSAuthenticationPlugin`
- exact DB grants for the approved access level

## IAM Permissions Required

End-to-end IAM auth requires **two different `rds-db:connect` permissions**.

## 1. User-side permission

The Identity Center permission set / resulting SSO role must allow `rds-db:connect` to the **proxy resource id**:

```text
arn:aws:rds-db:ap-south-1:<ACCOUNT_ID>:dbuser:prx-<PROXY_RESOURCE_ID>/<DB_USERNAME>
```

Example:

```text
arn:aws:rds-db:ap-south-1:867625663987:dbuser:prx-0a33160941fc73412/d-satish-korra-7718
```

## 2. Proxy-role permission

The RDS Proxy IAM role must allow `rds-db:connect` to the **DB instance resource id**:

```text
arn:aws:rds-db:ap-south-1:<ACCOUNT_ID>:dbuser:<DBI_RESOURCE_ID>/<DB_USERNAME>
```

Example:

```text
arn:aws:rds-db:ap-south-1:867625663987:dbuser:db-GJ2NUQ3VSGCKPYKVBCLNDOXJ3A/d-satish-korra-7718
```

For PAM-managed usernames, the proxy role can use a controlled wildcard:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rds-db:connect"
      ],
      "Resource": [
        "arn:aws:rds-db:ap-south-1:867625663987:dbuser:db-GJ2NUQ3VSGCKPYKVBCLNDOXJ3A/d-*"
      ]
    }
  ]
}
```

## Important Lesson

Do not try to rewrite the proxy role policy per request. That causes:

- IAM propagation delay
- policy churn
- race conditions

The stable model is:

- proxy role uses a controlled prefix wildcard
- user role stays exact per request

## Commands We Used to Debug

## 1. Check proxy mode

```bash
aws rds describe-db-proxies --db-proxy-name npamx-proxy --region ap-south-1
aws rds describe-db-proxy-targets --db-proxy-name npamx-proxy --region ap-south-1
```

## 2. Check DB resource id

```bash
aws rds describe-db-instances \
  --db-instance-identifier database-1 \
  --region ap-south-1 \
  --query 'DBInstances[0].DbiResourceId' \
  --output text
```

## 3. Check proxy role policy

```bash
aws iam list-attached-role-policies --role-name rds-proxy-role-1773681880071
aws iam get-policy --policy-arn arn:aws:iam::867625663987:policy/service-role/rds-proxy-policy-1773681880071
aws iam get-policy-version \
  --policy-arn arn:aws:iam::867625663987:policy/service-role/rds-proxy-policy-1773681880071 \
  --version-id v1
```

## 4. Check SSO role inline policy

```bash
aws iam get-role-policy \
  --role-name AWSReservedSSO_JIT-satish-korra-867625663987_102ef50fe15d628b \
  --policy-name AwsSSOInlinePolicy
```

This is how we proved the bad case:

- wrong user-side ARN used `db-...`

Final correct user-side ARN must use:

- `prx-...`

## User Connection Commands

## Generate token

```bash
export LIBMYSQL_ENABLE_CLEARTEXT_PLUGIN=1
export AWS_REGION=ap-south-1
export RDSHOST=npamx-proxy.proxy-cjqnggjluhbw.ap-south-1.rds.amazonaws.com
export DBUSER=d-satish-korra-7718

TOKEN="$(aws rds generate-db-auth-token \
  --hostname "$RDSHOST" \
  --port 3306 \
  --region "$AWS_REGION" \
  --username "$DBUSER")"

echo "${#TOKEN}"
```

## Connect with MySQL CLI

```bash
MYSQL_PWD="$TOKEN" mysql \
  --host "$RDSHOST" \
  --port 3306 \
  --user "$DBUSER" \
  --enable-cleartext-plugin \
  --ssl-mode=REQUIRED \
  --protocol=TCP
```

If `echo "${#TOKEN}"` is large, token generation is fine.

## Common Problems

### 1. `mysql_clear_password` plugin error

Example:

- `Authentication plugin 'mysql_clear_password' cannot be loaded`

Fix:

```bash
export LIBMYSQL_ENABLE_CLEARTEXT_PLUGIN=1
```

and use:

```bash
--enable-cleartext-plugin
--ssl-mode=REQUIRED
```

### 2. `Access denied ... using password: NO`

This can still happen even when the token is present.

Typical causes:

- DB user is not IAM-authenticated
- user-side permission uses `db-...` instead of `prx-...`
- proxy role policy is missing `rds-db:connect` for the DB user
- username in policy does not exactly match the actual generated username

### 3. Proxy is still using Secrets Manager-backed auth

Check:

```bash
aws rds describe-db-proxies \
  --db-proxy-name npamx-proxy \
  --region ap-south-1 \
  --query 'DBProxies[0].{DefaultAuthScheme:DefaultAuthScheme,Auth:Auth}'
```

Bad for this flow:

- `DefaultAuthScheme = IAM_AUTH`
- `Auth` contains Secrets entries

Working for this flow:

- `DefaultAuthScheme = IAM_AUTH`
- `Auth = []`

### 4. PAM shows proxy endpoint but wrong user policy still gets created

Check the resulting SSO role inline policy.

If it contains:

```text
dbuser:db-...
```

instead of:

```text
dbuser:prx-...
```

then the running PAM image is stale or the request was created before the patch.

Raise a fresh request after deploying the corrected image.

## Read-Only Validation Example

These queries should work:

```sql
USE mydb;
SHOW TABLES;
SHOW FULL TABLES;
SHOW CREATE TABLE test;
DESCRIBE test;
SELECT * FROM test LIMIT 5;
SHOW GRANTS FOR CURRENT_USER;
```

These should fail for read-only:

```sql
INSERT INTO test (id, name) VALUES (2, 'blocked');
UPDATE test SET name = 'blocked-update' WHERE id = 1;
DELETE FROM test WHERE id = 1;
CREATE TABLE test_block(id int);
ALTER TABLE test ADD COLUMN temp_col int;
DROP TABLE test;
```

Expected failure:

- `ERROR 1142 (42000)`

That confirms the final read-only IAM + RDS Proxy model is enforced correctly.
