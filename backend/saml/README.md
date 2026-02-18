# SAML / AWS IAM Identity Center

## IdP metadata (required)

The file **`idp_metadata.xml`** in this folder must be the **IdP metadata from AWS IAM Identity Center**. The placeholder in the repo is not valid for real SSO.

### Using the metadata you downloaded from AWS

1. In AWS IAM Identity Center: **Applications** → your application → **Application metadata**.
2. Download or copy the **IdP metadata** (the XML that describes the Identity Center IdP).
3. If you saved it to your **Downloads** folder (e.g. `metadata.xml` or similar):
   - Copy that file from Downloads to this folder.
   - Replace the contents of **`idp_metadata.xml`** with it, or overwrite `idp_metadata.xml` with the downloaded file (and rename to `idp_metadata.xml` if needed).

Example (on your machine):

```bash
# From your project root, e.g. JIT-PAM-Enterprise
cp ~/Downloads/metadata.xml backend/saml/idp_metadata.xml
# or, if the downloaded file is already named idp_metadata.xml:
cp ~/Downloads/idp_metadata.xml backend/saml/
```

4. Do **not** commit private keys or certificates. Only the IdP metadata XML is committed; see `.gitignore` in this folder.

### AWS application settings

- **Application ACS URL:** `http://52.66.172.182/saml/acs` (or your server URL + `/saml/acs`)
- **Audience (SP entity ID):** `pam-flask-app`

---

## Fix: 405 Not Allowed on /saml/acs

**405** means the request reached nginx but the HTTP method was not allowed. For SAML, AWS Identity Center **POSTs** the assertion to `/saml/acs`. If you get 405:

1. **Nginx must proxy `/saml/` to Flask** (not only `/api/`). If you only proxy `/api`, then `POST /saml/acs` is handled by nginx’s default and can return 405.

2. Add a `location` for `/saml/` in your nginx server block (same host as the app), e.g.:

```nginx
# Proxy SAML endpoints to Flask (AWS POSTs to /saml/acs)
location /saml/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Content-Type $content_type;
    proxy_pass_request_body on;
    proxy_pass_request_headers on;
}

# If you already have this, keep it for /api and /login
location /api/ {
    proxy_pass http://127.0.0.1:5000;
    # ... same headers as above ...
}
location = /login {
    proxy_pass http://127.0.0.1:5000;
    # ... same headers ...
}
```

3. Reload nginx: `sudo nginx -t && sudo systemctl reload nginx`.

4. **Do not** test `/saml/acs` by opening it in the browser (that sends GET). The IdP sends POST after sign-in; you can test the full flow via “Login with SSO” from the app.

---

## Fix: "No access" when signing in from Identity Center

If users see:

**"An error occurred while signing in to Custom SAML 2.0 application – No access – Confirm with your administrator that you have access to Custom SAML 2.0 application and that your primary email address is assigned in IAM Identity Center."**

then the user is **not assigned** to the SAML application in IAM Identity Center. Assign them (or a group they belong to):

1. In **AWS Console** → **IAM Identity Center** (or **AWS SSO**).
2. Go to **Applications** → select your **Custom SAML 2.0** application (the one used for PAM).
3. Open the **Assign users or groups** (or **Assign users**) tab.
4. Click **Assign users** (or **Add user/group**).
5. Select the **users** and/or **groups** who should be able to sign in to PAM (e.g. your user, or a group like "PAM-Users").
6. Save.

Also ensure the user has a **primary email** set in the Identity Center identity store (Users → user → primary email). Without it, IdC can show "No access".
