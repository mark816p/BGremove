import imglyRemoveBackground from 'https://esm.sh/@imgly/background-removal@1.4.5';

// Configuration for @imgly/background-removal
const config = {
    publicPath: 'https://unpkg.com/@imgly/background-removal-data@1.4.5/dist/',
    output: { format: 'image/png' }
};

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const workspace = document.getElementById('workspace');
const statusContainer = document.getElementById('statusContainer');
const progressBar = document.getElementById('progressBar');
const statusText = document.getElementById('statusText');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const displayCanvas = document.getElementById('displayCanvas');
const brushCursor = document.getElementById('brushCursor');
const canvasWrapper = document.getElementById('canvasWrapper');
const heroSection = document.querySelector('.hero-section');

// Toolbar Elements
const tabRemoved = document.getElementById('tabRemoved');
const tabOriginal = document.getElementById('tabOriginal');
const btnErase = document.getElementById('btnErase');
const btnRestore = document.getElementById('btnRestore');
const brushSizeInput = document.getElementById('brushSize');
const brushToolsContainer = document.getElementById('brushToolsContainer');
const btnNewImage = document.getElementById('btnNewImage');
const btnDownload = document.getElementById('btnDownload');
const magicEdgeToggle = document.getElementById('magicEdgeToggle');

// State
let originalImage = null; // Stored as a downscaled Canvas if large
let originalImageData = null; 
let workingCanvas = document.createElement('canvas');
let workingCtx = workingCanvas.getContext('2d');
let brushCanvas = document.createElement('canvas');
let brushCtx = brushCanvas.getContext('2d');
let displayCtx = displayCanvas.getContext('2d');

let currentFileName = "image.png";

let samWorker = null;
let samReady = false;
let samEmbedReady = false;

if (window.Worker) {
    samWorker = new Worker('sam-worker.js', { type: 'module' });
    samWorker.onmessage = (e) => {
        const data = e.data;
        if (data.type === 'status' || data.type === 'progress') {
            samStatus.textContent = data.message || `(Loading: ${Math.round(data.progress * 100)}%)`;
        } else if (data.type === 'ready') {
            samReady = true;
            samStatus.textContent = '';
        } else if (data.type === 'embed_ready') {
            samEmbedReady = true;
            samStatus.textContent = '';
        } else if (data.type === 'segment_result') {
            applySamMask(data.mask, data.width, data.height);
        } else if (data.type === 'error') {
            console.error('SAM Error:', data.error);
            samStatus.textContent = '(Error)';
        }
    };
    samWorker.postMessage({ type: 'init' });
}

let isDrawing = false;
let lastX = 0;
let lastY = 0;
let samPending = false;
let currentTool = 'erase'; 
let currentMode = 'removed'; 
let brushSize = 50;

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

// Service Worker Registration for Offline Support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.error('ServiceWorker registration failed: ', err);
        });
    });
}

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

// Upload Event Listeners
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
        handleFile(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
    fileInput.value = ''; 
});

btnNewImage.addEventListener('click', () => {
    fileInput.click();
});

// Core File Handling
const handleFile = (file) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) return;

    currentFileName = file.name;
    
    heroSection.style.display = 'none';
    dropZone.style.display = 'none';
    workspace.style.display = 'none';
    statusContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.classList.remove('indeterminate');
    statusText.textContent = 'Initializing image...';

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        originalImage = img; // Store full resolution original
        processImage(file);
    };
    img.src = objectUrl;
};

// Background Removal Process
const processImage = async (file) => {
    try {
        const runConfig = {
            ...config,
            progress: (key, current, total) => {
                if (key.startsWith('fetch:')) {
                    const p = Math.round((current / total) * 100);
                    statusText.textContent = `Downloading AI models: ${p}%`;
                    progressBar.style.width = `${p}%`;
                } else if (key === 'compute:inference') {
                    statusText.textContent = `Removing background (This may take a moment)...`;
                    progressBar.style.width = '100%';
                    progressBar.classList.add('indeterminate');
                }
            }
        };

        const resultBlob = await imglyRemoveBackground(file, runConfig);
        
        const resultUrl = URL.createObjectURL(resultBlob);
        const foregroundImg = new Image();
        foregroundImg.onload = () => {
            URL.revokeObjectURL(resultUrl);
            setupCanvases(foregroundImg);
        };
        foregroundImg.src = resultUrl;
    } catch (error) {
        console.error("Error processing image:", error);
        statusText.textContent = "Error processing image. The image might be too complex or your device ran out of memory. Try a smaller image.";
        setTimeout(() => {
            resetToUpload();
        }, 5000);
    }
};

const setupCanvases = (foregroundImg) => {
    const w = originalImage.width;
    const h = originalImage.height;
    
    displayCanvas.width = w;
    displayCanvas.height = h;
    workingCanvas.width = w;
    workingCanvas.height = h;
    brushCanvas.width = w;
    brushCanvas.height = h;

    // Cache original image pixel data for Magic Edge tool
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = w;
    tmpCanvas.height = h;
    const tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true });
    tmpCtx.drawImage(originalImage, 0, 0);
    originalImageData = tmpCtx.getImageData(0, 0, w, h);

    // Initialize working canvas with the AI result
    workingCtx.clearRect(0, 0, w, h);
    workingCtx.drawImage(foregroundImg, 0, 0);

    renderDisplay();

    statusContainer.style.display = 'none';
    workspace.style.display = 'flex';
    
    // Send original image data to SAM worker for embedding
    if (samWorker) {
        samEmbedReady = false;
        samStatus.textContent = '(Preparing Magic Brush...)';
        samWorker.postMessage({ type: 'embed', image: originalImageData });
    }
    
    setMode('removed');
    setTool('erase');
    updateBrushSize();
};

const resetToUpload = () => {
    heroSection.style.display = 'block';
    dropZone.style.display = 'block';
    workspace.style.display = 'none';
    statusContainer.style.display = 'none';
};

// Workspace UI Logic
tabRemoved.addEventListener('click', () => setMode('removed'));
tabOriginal.addEventListener('click', () => setMode('original'));

btnErase.addEventListener('click', () => setTool('erase'));
btnRestore.addEventListener('click', () => setTool('restore'));

brushSizeInput.addEventListener('input', updateBrushSize);

function setMode(mode) {
    currentMode = mode;
    if (mode === 'removed') {
        tabRemoved.classList.add('active');
        tabOriginal.classList.remove('active');
        brushToolsContainer.style.display = 'flex';
        canvasWrapper.classList.add('transparent-bg');
    } else {
        tabOriginal.classList.add('active');
        tabRemoved.classList.remove('active');
        brushToolsContainer.style.display = 'none';
        canvasWrapper.classList.remove('transparent-bg');
        brushCursor.style.display = 'none';
    }
    renderDisplay();
}

function setTool(tool) {
    currentTool = tool;
    if (tool === 'erase') {
        btnErase.classList.add('active');
        btnRestore.classList.remove('active');
    } else {
        btnRestore.classList.add('active');
        btnErase.classList.remove('active');
    }
}

function updateBrushSize() {
    if (!originalImage) return;
    const val = parseInt(brushSizeInput.value, 10);
    const maxBrush = originalImage.width * 0.15; 
    const minBrush = originalImage.width * 0.01; 
    brushSize = minBrush + (val / 100) * (maxBrush - minBrush);
    updateCursorStyle();
}

function updateCursorStyle(e) {
    if (currentMode === 'original') return;
    
    const rect = displayCanvas.getBoundingClientRect();
    const scale = rect.width / displayCanvas.width;
    const cursorSize = brushSize * scale * 2; // radius to diameter
    
    brushCursor.style.width = `${cursorSize}px`;
    brushCursor.style.height = `${cursorSize}px`;
    
    if (e) {
        const wrapperRect = canvasWrapper.getBoundingClientRect();
        let clientX = e.clientX;
        let clientY = e.clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }
        brushCursor.style.left = `${clientX - wrapperRect.left}px`;
        brushCursor.style.top = `${clientY - wrapperRect.top}px`;
    }
}

// Canvas Interaction Logic
function getMousePos(e) {
    const rect = displayCanvas.getBoundingClientRect();
    const scaleX = displayCanvas.width / rect.width;
    const scaleY = displayCanvas.height / rect.height;
    
    let clientX = e.clientX;
    let clientY = e.clientY;
    
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    }

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

const startDrawing = (e) => {
    if (currentMode === 'original') return;
    
    const pos = getMousePos(e);
    
    if (magicEdgeToggle && magicEdgeToggle.checked) {
        if (samEmbedReady && !samPending) {
            samPending = true;
            samStatus.textContent = '(Processing...)';
            // Send exact image coordinates to SAM
            samWorker.postMessage({ type: 'segment', point: { x: Math.floor(pos.x), y: Math.floor(pos.y) } });
        }
        return; // Skip normal drawing
    }
    
    isDrawing = true;
    lastX = pos.x;
    lastY = pos.y;
    draw(e);
};

const stopDrawing = () => {
    isDrawing = false;
};

const draw = (e) => {
    updateCursorStyle(e);
    if (!isDrawing || currentMode === 'original') return;
    e.preventDefault(); 
    
    if (magicEdgeToggle && magicEdgeToggle.checked) return; // Skip normal drawing in AI mode
    
    const curPos = getMousePos(e);
    
    // Normal Brush Logic
    if (currentTool === 'erase') {
        workingCtx.globalCompositeOperation = 'destination-out';
        workingCtx.lineWidth = brushSize * 2;
        workingCtx.lineCap = 'round';
        workingCtx.lineJoin = 'round';
        workingCtx.beginPath();
        workingCtx.moveTo(lastX, lastY);
        workingCtx.lineTo(curPos.x, curPos.y);
        workingCtx.stroke();
    } else if (currentTool === 'restore') {
        brushCanvas.width = workingCanvas.width; 
        brushCanvas.height = workingCanvas.height;
        brushCtx.globalCompositeOperation = 'source-over';
        brushCtx.clearRect(0, 0, brushCanvas.width, brushCanvas.height);
        
        brushCtx.lineWidth = brushSize * 2;
        brushCtx.lineCap = 'round';
        brushCtx.lineJoin = 'round';
        brushCtx.beginPath();
        brushCtx.moveTo(lastX, lastY);
        brushCtx.lineTo(curPos.x, curPos.y);
        brushCtx.stroke();
        
        brushCtx.globalCompositeOperation = 'source-in';
        brushCtx.drawImage(originalImage, 0, 0);
        
        workingCtx.globalCompositeOperation = 'source-over';
        workingCtx.drawImage(brushCanvas, 0, 0);
    }
    
    lastX = curPos.x;
    lastY = curPos.y;
    renderDisplay();
};

function applySamMask(maskData, width, height) {
    samPending = false;
    samStatus.textContent = '';
    
    const workingImageData = workingCtx.getImageData(0, 0, width, height);
    const wData = workingImageData.data;
    
    for (let i = 0; i < maskData.length; i++) {
        if (maskData[i] > 0) { // Logit > 0 means foreground
            const pixelIdx = i * 4;
            if (currentTool === 'erase') {
                wData[pixelIdx + 3] = 0;
            } else {
                wData[pixelIdx] = originalImageData.data[pixelIdx];
                wData[pixelIdx + 1] = originalImageData.data[pixelIdx + 1];
                wData[pixelIdx + 2] = originalImageData.data[pixelIdx + 2];
                wData[pixelIdx + 3] = originalImageData.data[pixelIdx + 3];
            }
        }
    }
    workingCtx.putImageData(workingImageData, 0, 0);
    renderDisplay();
}

function renderDisplay() {
    displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    if (currentMode === 'original') {
        displayCtx.drawImage(originalImage, 0, 0);
    } else {
        displayCtx.drawImage(workingCanvas, 0, 0);
    }
}

// Event Listeners for Canvas
canvasWrapper.addEventListener('mousedown', startDrawing);
canvasWrapper.addEventListener('mousemove', (e) => {
    if (currentMode !== 'original') {
        brushCursor.style.display = 'block';
    }
    draw(e);
});
canvasWrapper.addEventListener('mouseup', stopDrawing);
canvasWrapper.addEventListener('mouseleave', () => {
    stopDrawing();
    brushCursor.style.display = 'none';
});

canvasWrapper.addEventListener('touchstart', startDrawing, {passive: false});
canvasWrapper.addEventListener('touchmove', draw, {passive: false});
canvasWrapper.addEventListener('touchend', stopDrawing);
canvasWrapper.addEventListener('touchcancel', stopDrawing);

// Download Logic
btnDownload.addEventListener('click', () => {
    const newFileName = currentFileName.replace(/\.[^/.]+$/, "") + "-no-bg.png";
    
    workingCanvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = newFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100); // Give browser time to start download
    }, 'image/png');
});

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
    if (workspace.style.display === 'none') return; // Only active when editing
    
    switch (e.key.toLowerCase()) {
        case 'e':
            setTool('erase');
            break;
        case 'r':
            setTool('restore');
            break;
        case 'm':
            if (magicEdgeToggle) {
                magicEdgeToggle.checked = !magicEdgeToggle.checked;
            }
            break;
        case '[':
            brushSizeInput.value = Math.max(parseInt(brushSizeInput.min, 10), parseInt(brushSizeInput.value, 10) - 5);
            updateBrushSize();
            break;
        case ']':
            brushSizeInput.value = Math.min(parseInt(brushSizeInput.max, 10), parseInt(brushSizeInput.value, 10) + 5);
            updateBrushSize();
            break;
    }
});
