// Feature Management Functions

// Store enabled features
let enabledFeatures = {
    s3: true,
    terminal: true,
    database: false,
    container: false,
    secrets: false,
    analytics: false
};

// License features
const licenseFeatures = {
    s3: true,
    terminal: true,
    database: false,
    container: false,
    secrets: false,
    analytics: false
};

function toggleFeature(featureName, enabled) {
    // Check if feature is in license
    if (!licenseFeatures[featureName] && enabled) {
        // Feature not in license
        document.getElementById(`feature${featureName.charAt(0).toUpperCase() + featureName.slice(1)}`).checked = false;
        
        alert(`📋 Feature Request Submitted\n\n"${getFeatureDisplayName(featureName)}" is not included in your current license.\n\n✅ We've received your request!\n\nNext Steps:\n1. If not in your license: Contact sales@company.com\n2. If already purchased: Feature will be enabled within 5 minutes\n\nThank you!`);
        
        // Send request to backend
        fetch('http://127.0.0.1:5000/api/admin/request-feature', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                feature: featureName,
                requested_at: new Date().toISOString()
            })
        }).catch(err => console.error('Error:', err));
        
        return;
    }
    
    // Feature is in license, toggle it
    enabledFeatures[featureName] = enabled;
    
    if (enabled) {
        alert(`✅ ${getFeatureDisplayName(featureName)} Enabled\n\nUsers can now access this feature.\nIt will appear in their navigation menu within 5 minutes.`);
    } else {
        alert(`⚠️ ${getFeatureDisplayName(featureName)} Disabled\n\nUsers will no longer see this feature in their navigation menu.`);
    }
    
    // Update backend
    fetch('http://127.0.0.1:5000/api/admin/toggle-feature', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            feature: featureName,
            enabled: enabled
        })
    }).catch(err => console.error('Error:', err));
}

function getFeatureDisplayName(featureName) {
    const names = {
        s3: 'S3 Explorer',
        terminal: 'Instance Terminal Access',
        database: 'Database Access Management',
        container: 'Container Access Management',
        secrets: 'Secrets Manager Access',
        analytics: 'Advanced Analytics'
    };
    return names[featureName] || featureName;
}
