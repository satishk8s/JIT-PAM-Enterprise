// Upload functionality
function openUploadModal() {
  if (!currentPermissions.can_upload) {
    alert('You do not have upload permissions');
    return;
  }
  document.getElementById('uploadModal').classList.add('show');
}

function closeUploadModal() {
  document.getElementById('uploadModal').classList.remove('show');
  document.getElementById('uploadProgress').style.display = 'none';
  document.getElementById('uploadArea').style.display = 'block';
  document.getElementById('fileInput').value = '';
}

function handleFileSelection(event) {
  const files = event.target.files;
  if (files.length > 0) {
    uploadFiles(files);
  }
}

async function uploadFiles(files) {
  if (!currentPermissions.can_upload) {
    alert('You do not have upload permissions');
    return;
  }

  document.getElementById('uploadArea').style.display = 'none';
  document.getElementById('uploadProgress').style.display = 'block';

  const totalFiles = files.length;
  let uploadedFiles = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const key = currentPrefix + file.name;

    try {
      document.getElementById('progressText').textContent = `Uploading ${file.name} (${i + 1}/${totalFiles})...`;
      
      // Get presigned URL
      const uploadData = await api(`/api/s3/presign-upload/${currentBucket}`, 'POST', {
        key: key,
        content_type: file.type || 'application/octet-stream'
      });

      // Upload file
      const uploadResponse = await fetch(uploadData.url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream'
        }
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed for ${file.name}`);
      }

      uploadedFiles++;
      const progress = (uploadedFiles / totalFiles) * 100;
      document.getElementById('progressFill').style.width = progress + '%';

    } catch (e) {
      alert(`Upload failed for ${file.name}: ${e.message}`);
      break;
    }
  }

  if (uploadedFiles === totalFiles) {
    document.getElementById('progressText').textContent = 'Upload completed successfully!';
    setTimeout(() => {
      closeUploadModal();
      loadBucketContents();
    }, 2000);
  }
}

// Drag and drop
const uploadArea = document.getElementById('uploadArea');

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = 'var(--primary-color)';
  uploadArea.style.background = 'var(--bg-secondary)';
});

uploadArea.addEventListener('dragleave', (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = 'var(--border-color)';
  uploadArea.style.background = 'transparent';
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = 'var(--border-color)';
  uploadArea.style.background = 'transparent';
  
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    uploadFiles(files);
  }
});