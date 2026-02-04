// S3 Explorer Integration - Show metrics for admins, file browser for users
function loadS3Buckets() {
    const userRole = localStorage.getItem('userRole') || 'user';
    console.log('S3 Tab - userRole:', userRole);
    const container = document.getElementById('s3BucketsContainer');
    
    if (userRole === 'admin') {
        // Show S3 metrics and statistics for admins
        container.innerHTML = `
            <div style="padding: 20px;">
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px;">
                    <div class="card">
                        <div class="card-icon"><i class="fas fa-users"></i></div>
                        <div class="card-content">
                            <h3 id="s3ActiveUsers">0</h3>
                            <p>Active Users with S3 Access</p>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-icon"><i class="fas fa-bucket"></i></div>
                        <div class="card-content">
                            <h3 id="s3TotalBuckets">0</h3>
                            <p>Total S3 Buckets</p>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-icon"><i class="fas fa-key"></i></div>
                        <div class="card-content">
                            <h3 id="s3TotalPermissions">0</h3>
                            <p>Total Permissions Assigned</p>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-icon"><i class="fas fa-database"></i></div>
                        <div class="card-content">
                            <h3 id="s3TotalSize">0 GB</h3>
                            <p>Total Storage Used</p>
                        </div>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div style="background: var(--bg-primary); padding: 20px; border-radius: 8px; box-shadow: var(--shadow);">
                        <h3 style="margin-bottom: 15px;">Recent S3 Activity</h3>
                        <table class="instances-table">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Bucket</th>
                                    <th>Action</th>
                                    <th>Timestamp</th>
                                </tr>
                            </thead>
                            <tbody id="s3ActivityTable">
                                <tr>
                                    <td colspan="4" style="text-align: center; padding: 40px; color: #999;">No recent activity</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <div style="background: var(--bg-primary); padding: 20px; border-radius: 8px; box-shadow: var(--shadow);">
                        <h3 style="margin-bottom: 15px;">Bucket Permissions Overview</h3>
                        <table class="instances-table">
                            <thead>
                                <tr>
                                    <th>Bucket Name</th>
                                    <th>Users with Access</th>
                                    <th>Read</th>
                                    <th>Upload</th>
                                    <th>Download</th>
                                    <th>Delete</th>
                                </tr>
                            </thead>
                            <tbody id="s3BucketsOverview">
                                <tr>
                                    <td colspan="6" style="text-align: center; padding: 40px; color: #999;">Loading...</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        loadS3AdminMetrics();
    } else {
        // Show S3 file browser for normal users
        container.innerHTML = '<iframe src="http://127.0.0.1:8001" style="position: fixed; top: 60px; left: 260px; right: 0; bottom: 0; width: calc(100% - 260px); height: calc(100vh - 60px); border: none;"></iframe>';
    }
}

// Load S3 admin metrics
async function loadS3AdminMetrics() {
    try {
        const response = await fetch('http://127.0.0.1:8001/api/admin/bucket-permissions', {
            credentials: 'include'
        });
        const data = await response.json();
        
        // Calculate metrics
        const uniqueUsers = new Set(data.permissions.map(p => p.username)).size;
        const uniqueBuckets = new Set(data.permissions.map(p => p.bucket_name)).size;
        const totalPermissions = data.permissions.length;
        
        document.getElementById('s3ActiveUsers').textContent = uniqueUsers;
        document.getElementById('s3TotalBuckets').textContent = uniqueBuckets;
        document.getElementById('s3TotalPermissions').textContent = totalPermissions;
        
        // Load bucket overview
        const bucketMap = {};
        data.permissions.forEach(p => {
            if (!bucketMap[p.bucket_name]) {
                bucketMap[p.bucket_name] = { users: new Set(), read: 0, upload: 0, download: 0, delete: 0 };
            }
            bucketMap[p.bucket_name].users.add(p.username);
            if (p.can_read) bucketMap[p.bucket_name].read++;
            if (p.can_upload) bucketMap[p.bucket_name].upload++;
            if (p.can_download) bucketMap[p.bucket_name].download++;
            if (p.can_delete) bucketMap[p.bucket_name].delete++;
        });
        
        const tbody = document.getElementById('s3BucketsOverview');
        tbody.innerHTML = '';
        
        Object.keys(bucketMap).forEach(bucket => {
            const stats = bucketMap[bucket];
            tbody.innerHTML += `
                <tr>
                    <td><i class="fas fa-bucket" style="color: var(--primary-color); margin-right: 8px;"></i>${bucket}</td>
                    <td>${stats.users.size}</td>
                    <td>${stats.read}</td>
                    <td>${stats.upload}</td>
                    <td>${stats.download}</td>
                    <td>${stats.delete}</td>
                </tr>
            `;
        });
        
    } catch (error) {
        console.error('Failed to load S3 metrics:', error);
    }
}
