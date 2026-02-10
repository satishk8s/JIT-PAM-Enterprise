// Prefix-based permissions functionality

function togglePrefixInput() {
  const accessLevel = document.getElementById("access_level").value;
  const prefixInput = document.getElementById("perm_prefix");
  
  if (accessLevel === "prefix") {
    prefixInput.style.display = "inline-block";
    prefixInput.required = true;
  } else {
    prefixInput.style.display = "none";
    prefixInput.required = false;
    prefixInput.value = "";
  }
}

// Override the existing saveBucketPerms function
async function saveBucketPerms() {
  const username = document.getElementById("perm_user").value;
  const bucket = document.getElementById("perm_bucket").value.trim();
  const accessLevel = document.getElementById("access_level").value;
  const prefix = accessLevel === "prefix" ? document.getElementById("perm_prefix").value.trim() : "";
  const can_read = document.getElementById("perm_read").checked ? 1 : 0;
  const can_upload = document.getElementById("perm_upload").checked ? 1 : 0;
  const can_download = document.getElementById("perm_download").checked ? 1 : 0;
  const can_delete = document.getElementById("perm_delete").checked ? 1 : 0;

  if (!username || !bucket) {
    document.getElementById("permMsg").textContent = "Please select a user and bucket name.";
    document.getElementById("permMsg").style.color = "red";
    return;
  }

  if (accessLevel === "prefix" && !prefix) {
    document.getElementById("permMsg").textContent = "Please enter a folder path for specific folder access.";
    document.getElementById("permMsg").style.color = "red";
    return;
  }

  try {
    const res = await api("/api/admin/set-bucket-perms", "POST", {
      username, 
      bucket_name: bucket,
      prefix_path: prefix,
      can_read, 
      can_upload, 
      can_download, 
      can_delete
    });

    document.getElementById("permMsg").textContent = res.message || "Permissions updated successfully.";
    document.getElementById("permMsg").style.color = "green";
    
    // Clear form
    document.getElementById("perm_bucket").value = "";
    document.getElementById("perm_prefix").value = "";
    document.getElementById("access_level").value = "bucket";
    document.getElementById("perm_read").checked = false;
    document.getElementById("perm_upload").checked = false;
    document.getElementById("perm_download").checked = false;
    document.getElementById("perm_delete").checked = false;
    togglePrefixInput();
    
    // Refresh permissions table
    await loadBucketPermissions();
  } catch (e) {
    document.getElementById("permMsg").textContent = "Error: " + e.message;
    document.getElementById("permMsg").style.color = "red";
  }
}

// Function to load current permissions (called from admin-v2.js)
window.loadCurrentPerms = async function() {
  await loadBucketPermissions();
}