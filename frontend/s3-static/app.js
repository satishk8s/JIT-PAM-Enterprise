function redirectByRole(role) {
  if (role === "admin") window.location.href = "/static/admin.html";
  else window.location.href = "/static/index.html";
}

async function api(url, method="GET", body) {
  const r = await fetch(url, {
    method,
    headers: {"Content-Type": "application/json"},
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined
  });
  if (r.status === 401) {
    window.location.href = "/static/login.html";
    return;
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({ detail: "Error" }));
    throw new Error(j.detail || "Error");
  }
  return r.json();
}

async function login() {
  const u = document.getElementById("username").value.trim();
  const p = document.getElementById("password").value;
  const msg = document.getElementById("msg1");
  
  try {
    const data = await api("/api/login", "POST", {username: u, password: p});
    if (data.password_reset_required) {
      window.location.href = "/static/reset.html";
      return;
    }
    if (data.mfa_required) {
      document.getElementById("step1").classList.add("hidden");
      document.getElementById("step2").classList.remove("hidden");
      await loadQR();
      return;
    }
    redirectByRole(data.role);
  } catch(e) {
    msg.textContent = e.message;
    msg.className = "error";
  }
}

async function loadQR() {
  const qrDiv = document.getElementById("qr");
  const note = document.getElementById("note");
  
  try {
    const data = await api("/api/mfa/setup");
    qrDiv.innerHTML = `<img src="${data.qr}" style="max-width:220px;">`;
    if (note) note.textContent = "Scan QR in Authenticator and enter 6-digit code.";
  } catch(e) {
    qrDiv.innerHTML = `<div class="error">Failed to load QR: ${e.message}</div>`;
  }
}

async function verify() {
  const code = document.getElementById("code").value.trim();
  const msg = document.getElementById("msg2");
  
  try {
    const data = await api("/api/mfa/verify", "POST", {code});
    redirectByRole(data.role);
  } catch(e) {
    msg.textContent = e.message;
    msg.className = "error";
  }
}

async function logout() {
  await api("/api/logout", "POST");
  window.location.href = "/static/login.html";
}

async function submitNewPassword() {
  const p1 = document.getElementById("newpass").value;
  const p2 = document.getElementById("newpass2").value;
  const msg = document.getElementById("resetMsg");
  
  if (p1 !== p2) {
    msg.textContent = "Passwords do not match";
    msg.className = "error";
    return;
  }
  if (p1.length < 8) {
    msg.textContent = "Password too short";
    msg.className = "error";
    return;
  }
  
  try {
    const data = await api("/api/user/set-password", "POST", {new_password: p1});
    if (data.mfa_required) {
      window.location.href = "/static/mfa.html";
      return;
    }
    window.location.href = "/static/login.html";
  } catch(e) {
    msg.textContent = e.message;
    msg.className = "error";
  }
}

window.login = login;
window.verify = verify;
window.logout = logout;
window.submitNewPassword = submitNewPassword;
window.loadQR = loadQR;