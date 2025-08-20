
    const GET_ENDPOINT = "https://prod-28.francecentral.logic.azure.com:443/workflows/16ab2c6b25e44fc5b856075ea9809d2e/triggers/When_a_HTTP_request_is_received/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=ugwjKNdOcOl86CAd7U1Z0IzlPO7YQfjerJEPAMVRX9U";
    const UPLOAD_ENDPOINT = "https://prod-03.francecentral.logic.azure.com:443/workflows/c0f9a1206223466e8ac7e5f1f3a16a0b/triggers/When_a_HTTP_request_is_received/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=wCr2JEfcm8qJ72dS3Oh1DT6gP2M9AUWMXppBWn4Hahg";
    const STORAGE_BASE = "https://storageblobdemovlin.blob.core.windows.net/"; // + filepath

    // ===== Elements =====
    const gallery = document.getElementById('gallery');
    const emptyState = document.getElementById('emptyState');
    const loadState = document.getElementById('loadState');
    const refreshBtn = document.getElementById('refreshBtn');

    const uploadForm = document.getElementById('uploadForm');
    const fileInput = document.getElementById('fileInput');
    const fileName = document.getElementById('fileName');
    const filenameInput = document.getElementById('filename');
    const progressBar = document.getElementById('progressBar');
    const statusEl = document.getElementById('status');
    const errorEl = document.getElementById('error');
    const resetBtn = document.getElementById('resetBtn');
    const dropzone = document.getElementById('dropzone');

    function setLoading(isLoading) {
      if (isLoading) {
        loadState.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px"><span class="spinner"></span> Loading…</span>';
      } else {
        loadState.textContent = '';
      }
    }

    function buildUrl(filepath) {
      if (!filepath) return null;
      // Ensure we don't duplicate slashes
      if (STORAGE_BASE.endsWith('/') && filepath.startsWith('/')) {
        return STORAGE_BASE + filepath.slice(1);
      }
      return STORAGE_BASE + filepath;
    }

    function normalizeList(data) {
      // Try to handle a few common shapes
      // Expected: array of objects with `filepath`
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.value)) return data.value;
      if (Array.isArray(data?.items)) return data.items;
      return [];
    }

    async function loadImages() {
      setLoading(true);
      emptyState.style.display = 'none';
      gallery.innerHTML = '';
      try {
        const res = await fetch(GET_ENDPOINT, { method: 'GET' });
        if (!res.ok) throw new Error('Failed to fetch images: ' + res.status + ' ' + res.statusText);
        const json = await res.json();
        const items = normalizeList(json);

        const mapped = items.map((item, idx) => {
          const fp = item.filepath || item.filePath || item.path || item.blobPath || item.key || '';
          const url = buildUrl(fp);
          let name = item.fileName || item.name || fp?.split('/').pop() || `image-${idx+1}`;
          return { url, name, raw: item };
        }).filter(x => !!x.url);

        if (!mapped.length) {
          emptyState.style.display = 'block';
          return;
        }

        // Render
        const frag = document.createDocumentFragment();
        mapped.forEach(({url, name}) => {
          const li = document.createElement('div');
          li.className = 'tile';
          li.setAttribute('role', 'listitem');

          const img = document.createElement('img');
          img.loading = 'lazy';
          img.alt = name;
          img.src = url;

          const meta = document.createElement('div');
          meta.className = 'meta';
          meta.textContent = name;

          li.appendChild(img);
          li.appendChild(meta);
          frag.appendChild(li);
        });
        gallery.appendChild(frag);
      } catch (err) {
        console.error(err);
        emptyState.style.display = 'block';
        emptyState.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;align-items:center;">\
          <div class="error">${(err && err.message) ? err.message : 'Unknown error loading images'}</div>\
          <div class="notice">If this is a CORS issue, enable cross-origin requests on your Logic App HTTP trigger.</div>\
        </div>`;
      } finally {
        setLoading(false);
      }
    }

    // Upload with progress using XHR to get onprogress updates
    function uploadWithProgress(formData) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', UPLOAD_ENDPOINT, true);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = pct + '%';
            statusEl.textContent = `Uploading… ${pct}%`;
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.responseText);
          } else {
            reject(new Error('Upload failed: ' + xhr.status + ' ' + xhr.statusText + '\n' + xhr.responseText));
          }
        };
        
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(formData);
      });
    }

    function resetUploadUI() {
      progressBar.style.width = '0%';
      statusEl.textContent = '';
      errorEl.textContent = '';
    }

    // ===== Event wiring =====
    refreshBtn.addEventListener('click', loadImages);

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }});

    ;['dragenter','dragover'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('dragover'); }));
    ;['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('dragover'); }));

    dropzone.addEventListener('drop', (e) => {
      const f = e.dataTransfer.files?.[0];
      if (f) handleFileSelection(f);
    });

    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      if (f) handleFileSelection(f);
    });

    function handleFileSelection(file) {
      // Ensure it's an image
      if (!file.type.startsWith('image/')) {
        errorEl.textContent = 'Please select an image file.';
        fileInput.value = '';
        fileName.textContent = 'No file selected';
        return;
      }
      errorEl.textContent = '';
      fileInput.files = new DataTransfer().files; // clear native (for UX consistency)
      // But keep a reference on the dropzone element
      dropzone._file = file;
      fileName.textContent = `${file.name} (${Math.round(file.size/1024)} KB)`;
      if (!filenameInput.value) filenameInput.value = file.name;
    }

    resetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      uploadForm.reset();
      dropzone._file = null;
      fileName.textContent = 'No file selected';
      resetUploadUI();
    });

    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      resetUploadUI();

      const userID = uploadForm.userID.value.trim();
      const userName = uploadForm.userName.value.trim();
      const chosenFile = dropzone._file; // from dropzone or click
      const filename = (uploadForm.filename.value || chosenFile?.name || '').trim();

      if (!userID || !userName) {
        errorEl.textContent = 'User ID and User Name are required.';
        return;
      }
      if (!chosenFile) {
        errorEl.textContent = 'Please choose an image to upload.';
        return;
      }
  
   const form = new FormData();
      form.append('userID', new Blob([userID], { type: 'text/plain' }));
      form.append('userName', new Blob([userName], { type: 'text/plain' })); 
      // you can leave this as string if the server accepts it
      if (filename) form.append('filename', new Blob([filename], { type: 'text/plain' }));

      // The file field key is often expected as "file" in Logic Apps; adjust if your flow uses a different name
      form.append('file', chosenFile, filename || chosenFile.name);

      try {
        await uploadWithProgress(form);
        statusEl.innerHTML = '<span class="success">Upload complete ✔</span>';
        // Reload images to reflect newly uploaded file (if listing endpoint shows it immediately)
        await loadImages();
      } catch (err) {
        console.error(err);
        errorEl.textContent = err?.message || 'Upload failed';
      }
    });

    // Initial load
    loadImages();
 
