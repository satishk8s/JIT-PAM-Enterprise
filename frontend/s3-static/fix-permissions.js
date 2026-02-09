// Fix for permission update issue
async function saveBucketPerms() {
  const username = document.getElementById("perm_user").value;
  const bucket = document.getElementById("perm_bucket").value.trim();
  const can_read = document.getElementById("perm_read").checked ? 1 : 0;
  const can_upload = document.getElementById("perm_upload").checked ? 1 : 0;
  const can_download = document.getElementById("perm_download").checked ? 1 : 0;
  const can_delete = document.getElementById("perm_delete").checked ? 1 : 0;

  if (!username || !bucket) {
    document.getElementById("permMsg").textContent = "Please select a user and bucket name.";
    document.getElementById("permMsg").style.color = "red";
    return;
  }

  try {
    const res = await api("/api/admin/set-bucket-perms", "POST", {
      username, bucket_name: bucket,
      can_read, can_upload, can_download, can_delete
    });

    document.getElementById("permMsg").textContent = res.message || "Permissions updated successfully.";
    document.getElementById("permMsg").style.color = "green";
    
    // Clear form
    document.getElementById("perm_bucket").value = "";
    document.getElementById("perm_read").checked = false;
    document.getElementById("perm_upload").checked = false;
    document.getElementById("perm_download").checked = false;
    document.getElementById("perm_delete").checked = false;
    
    // Refresh permissions table
    await loadCurrentPerms();
  } catch (e) {
    document.getElementById("permMsg").textContent = "Error: " + e.message;
    document.getElementById("permMsg").style.color = "red";
  }
}