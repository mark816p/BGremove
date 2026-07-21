import imglyRemoveBackground from 'https://esm.sh/@imgly/background-removal@1.4.5';

// Configuration for @imgly/background-removal
const config = {
    publicPath: 'https://unpkg.com/@imgly/background-removal-data@1.4.5/dist/'
};

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const gallery = document.getElementById('gallery');
const statusContainer = document.getElementById('statusContainer');
const progressBar = document.getElementById('progressBar');
const statusText = document.getElementById('statusText');
const actionsBar = document.getElementById('actionsBar');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const processedCountSpan = document.getElementById('processedCount');
const totalCountSpan = document.getElementById('totalCount');
const themeToggleBtn = document.getElementById('themeToggleBtn');

// State
let filesQueue = [];
let processedFiles = [];
let isProcessing = false;

// Theme Initialization
const initTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedTheme === 'dark' || (!savedTheme && systemPrefersDark);
    
    if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.querySelector('.icon-moon').style.display = 'none';
        document.querySelector('.icon-sun').style.display = 'block';
    } else {
        document.documentElement.removeAttribute('data-theme');
        document.querySelector('.icon-moon').style.display = 'block';
        document.querySelector('.icon-sun').style.display = 'none';
    }
};
initTheme();

themeToggleBtn.addEventListener('click', () => {
    const isDark = document.documentElement.hasAttribute('data-theme');
    if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        document.querySelector('.icon-moon').style.display = 'block';
        document.querySelector('.icon-sun').style.display = 'none';
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        document.querySelector('.icon-moon').style.display = 'none';
        document.querySelector('.icon-sun').style.display = 'block';
    }
});

// Hardware Spec Check
const checkHardware = () => {
    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 4;
    
    if (cores < 4 || memory < 4) {
        document.getElementById('hardwareWarning').style.display = 'block';
    }
};
checkHardware();

// Drag and Drop Events
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFiles(e.target.files);
    }
    fileInput.value = ''; // Reset for consecutive uploads
});

// File Handling
const handleFiles = (files) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const newFiles = Array.from(files).filter(file => validTypes.includes(file.type));
    
    if (newFiles.length === 0) return;

    // Add to queue
    newFiles.forEach((file, index) => {
        const id = Date.now().toString() + index;
        filesQueue.push({ file, id });
        createGalleryItem(file, id);
    });

    updateCounters();
    
    if (!isProcessing) {
        processQueue();
    }
};

const updateCounters = () => {
    const total = processedFiles.length + filesQueue.length + (isProcessing ? 1 : 0);
    totalCountSpan.textContent = total;
    processedCountSpan.textContent = processedFiles.length;
    
    if (total > 0) {
        actionsBar.style.display = 'flex';
    }
    
    downloadAllBtn.disabled = processedFiles.length === 0;
};

// UI Creators
const createGalleryItem = (file, id) => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.id = `card-${id}`;

    const originalUrl = URL.createObjectURL(file);

    card.innerHTML = `
        <div class="image-comparison transparent-bg">
            <img src="${originalUrl}" alt="Original" class="img-original">
            <div class="processing-overlay" id="overlay-${id}">
                <div class="spinner"></div>
                <div style="margin-top: 8px; font-size: 0.875rem;">Removing bg...</div>
            </div>
            <!-- Result image will go here -->
        </div>
        <div class="item-actions">
            <span class="item-name" title="${file.name}">${file.name}</span>
            <button class="btn btn-primary btn-sm" id="download-${id}" disabled>
                Download
            </button>
        </div>
    `;
    gallery.appendChild(card);
};

// Processing Loop
const processQueue = async () => {
    if (filesQueue.length === 0) {
        isProcessing = false;
        statusContainer.style.display = 'none';
        return;
    }

    isProcessing = true;
    statusContainer.style.display = 'block';
    updateCounters();

    const currentItem = filesQueue.shift();
    const { file, id } = currentItem;

    try {
        // Update status UI
        const totalImages = processedFiles.length + filesQueue.length + 1;
        const currentNum = processedFiles.length + 1;
        statusText.textContent = `Processing image ${currentNum} of ${totalImages}: ${file.name}`;
        progressBar.style.width = `0%`; // Reset bar for this image's specific progress

        // Configuration with REAL progress callback
        const runConfig = {
            ...config,
            progress: (key, current, total) => {
                let p = 0;
                if (key === 'compute:inference') {
                    p = Math.round((current / total) * 100);
                    statusText.textContent = `Processing image ${currentNum} of ${totalImages} (Inference: ${p}%)`;
                } else if (key.startsWith('fetch:')) {
                    p = Math.round((current / total) * 100);
                    statusText.textContent = `Downloading AI models... ${p}%`;
                }
                progressBar.style.width = `${p}%`;
                
                const overlayText = document.querySelector(`#overlay-${id} div:last-child`);
                if (overlayText) overlayText.textContent = `${p}%`;
            }
        };

        // Pass the raw FILE object directly, NOT an Object URL, to prevent CORS/blob resolution issues
        const imageBlob = await imglyRemoveBackground(file, runConfig);
        const resultUrl = URL.createObjectURL(imageBlob);

        // Update UI for success
        const comparisonDiv = document.querySelector(`#card-${id} .image-comparison`);
        const overlay = document.getElementById(`overlay-${id}`);
        
        // Remove overlay
        if (overlay) overlay.remove();

        // Create result image on top
        const resultImg = document.createElement('img');
        resultImg.src = resultUrl;
        resultImg.className = 'img-result';
        resultImg.alt = 'Removed Background';
        comparisonDiv.appendChild(resultImg);

        // Enable download button
        const downloadBtn = document.getElementById(`download-${id}`);
        downloadBtn.disabled = false;
        
        const newFileName = file.name.replace(/\.[^/.]+$/, "") + "-no-bg.png";
        
        downloadBtn.addEventListener('click', () => {
            const a = document.createElement('a');
            a.href = resultUrl;
            a.download = newFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });

        // Add to processed array
        processedFiles.push({
            name: newFileName,
            blob: imageBlob,
            url: resultUrl
        });

    } catch (error) {
        console.error("Error processing image:", error);
        const overlay = document.getElementById(`overlay-${id}`);
        if (overlay) overlay.innerHTML = `<div style="color: #ef4444;">Error processing</div>`;
    }

    // Process next
    updateCounters();
    processQueue();
};

// Download All function
downloadAllBtn.addEventListener('click', async () => {
    if (processedFiles.length === 0) return;
    
    downloadAllBtn.disabled = true;
    const originalText = downloadAllBtn.innerHTML;
    downloadAllBtn.textContent = 'Zipping...';

    const zip = new JSZip();
    
    processedFiles.forEach(file => {
        zip.file(file.name, file.blob);
    });

    try {
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = "Removed_Backgrounds.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error("Failed to generate zip", err);
        alert("Failed to create ZIP file");
    } finally {
        downloadAllBtn.innerHTML = originalText;
        downloadAllBtn.disabled = false;
    }
});
