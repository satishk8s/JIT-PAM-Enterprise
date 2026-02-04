// Policy Toggle Management

function updateDeletePolicy() {
    const allowDeleteNonProd = document.getElementById('allowDeleteNonProd').checked;
    const allowDeleteProd = document.getElementById('allowDeleteProd').checked;
    
    console.log('Updating delete policy:', { allowDeleteNonProd, allowDeleteProd });
    
    fetch('http://127.0.0.1:5000/api/admin/delete-permissions-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            allowDeleteNonProd: allowDeleteNonProd,
            allowDeleteProd: allowDeleteProd
        })
    })
    .then(res => res.json())
    .then(data => {
        console.log('Delete policy updated:', data);
        // Reload settings to confirm
        setTimeout(loadPolicySettings, 100);
    })
    .catch(err => console.error('Error updating delete policy:', err));
}

function updateCreatePolicy() {
    const allowCreateNonProd = document.getElementById('allowCreateNonProd').checked;
    const allowCreateProd = document.getElementById('allowCreateProd').checked;
    
    console.log('Updating create policy:', { allowCreateNonProd, allowCreateProd });
    
    fetch('http://127.0.0.1:5000/api/admin/create-permissions-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            allowCreateNonProd: allowCreateNonProd,
            allowCreateProd: allowCreateProd
        })
    })
    .then(res => res.json())
    .then(data => {
        console.log('Create policy updated:', data);
        // Reload settings to confirm
        setTimeout(loadPolicySettings, 100);
    })
    .catch(err => console.error('Error updating create policy:', err));
}

function updateAdminPolicy() {
    const allowAdminNonProd = document.getElementById('allowAdminNonProd').checked;
    const allowAdminProd = document.getElementById('allowAdminProd').checked;
    const allowAdminSandbox = document.getElementById('allowAdminSandbox').checked;
    
    console.log('Updating admin policy:', { allowAdminNonProd, allowAdminProd, allowAdminSandbox });
    
    fetch('http://127.0.0.1:5000/api/admin/admin-permissions-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            allowAdminNonProd: allowAdminNonProd,
            allowAdminProd: allowAdminProd,
            allowAdminSandbox: allowAdminSandbox
        })
    })
    .then(res => res.json())
    .then(data => {
        console.log('Admin policy updated:', data);
        // Reload settings to confirm
        setTimeout(loadPolicySettings, 100);
    })
    .catch(err => console.error('Error updating admin policy:', err));
}

// Load current policy settings on page load
function loadPolicySettings() {
    console.log('Loading policy settings...');
    fetch('http://127.0.0.1:5000/api/admin/policy-settings')
    .then(res => res.json())
    .then(data => {
        console.log('Policy settings loaded:', data);
        const deleteNonProd = document.getElementById('allowDeleteNonProd');
        const deleteProd = document.getElementById('allowDeleteProd');
        const createNonProd = document.getElementById('allowCreateNonProd');
        const createProd = document.getElementById('allowCreateProd');
        const adminNonProd = document.getElementById('allowAdminNonProd');
        const adminProd = document.getElementById('allowAdminProd');
        const adminSandbox = document.getElementById('allowAdminSandbox');
        
        if (deleteNonProd) deleteNonProd.checked = data.allowDeleteNonProd !== false;
        if (deleteProd) deleteProd.checked = data.allowDeleteProd === true;
        if (createNonProd) createNonProd.checked = data.allowCreateNonProd === true;
        if (createProd) createProd.checked = data.allowCreateProd === true;
        if (adminNonProd) adminNonProd.checked = data.allowAdminNonProd === true;
        if (adminProd) adminProd.checked = data.allowAdminProd === true;
        if (adminSandbox) adminSandbox.checked = data.allowAdminSandbox !== false;
        
        console.log('Toggles updated');
    })
    .catch(err => console.error('Error loading policy settings:', err));
}
