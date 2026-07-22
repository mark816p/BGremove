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

// State
let originalImage = null; 
let workingCanvas = document.createElement('canvas');
let workingCtx = workingCanvas.getContext('2d');
let brushCanvas = document.createElement('canvas');
let brushCtx = brushCanvas.getContext('2d');
let displayCtx = displayCanvas.getContext('2d');

let currentFileName = '';
let isDrawing = false;
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
    
    // UI Transitions
    heroSection.style.display = 'none';
    dropZone.style.display = 'none';
    workspace.style.display = 'none';
    statusContainer.style.display = 'block';
    progressBar.style.width = '0%';
    statusText.textContent = 'Initializing...';

    const objectUrl = URL.createObjectURL(file);
    originalImage = new Image();
    originalImage.onload = () => {
        URL.revokeObjectURL(objectUrl);
        processImage(file);
    };
    originalImage.src = objectUrl;
};

// Background Removal Process
const processImage = async (file) => {
    try {
        const runConfig = {
            ...config,
            progress: (key, current, total) => {
                let p = 0;
                if (key === 'compute:inference') {
                    p = Math.round((current / total) * 100);
                    statusText.textContent = `Removing background: ${p}%`;
                } else if (key.startsWith('fetch:')) {
                    p = Math.round((current / total) * 100);
                    statusText.textContent = `Downloading AI models: ${p}%`;
                }
                progressBar.style.width = `${p}%`;
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
        statusText.textContent = "Error processing image. Please try another one.";
        setTimeout(() => {
            resetToUpload();
        }, 3000);
    }
};

const setupCanvases = (foregroundImg) => {
    statusContainer.style.display = 'none';
    workspace.style.display = 'flex';

    // Set internal canvas dimensions
    const w = originalImage.width;
    const h = originalImage.height;
    
    displayCanvas.width = w;
    displayCanvas.height = h;
    workingCanvas.width = w;
    workingCanvas.height = h;
    brushCanvas.width = w;
    brushCanvas.height = h;

    // Initialize working canvas with the AI result
    workingCtx.clearRect(0, 0, w, h);
    workingCtx.drawImage(foregroundImg, 0, 0);

    // Initial State
    setMode('removed');
    setTool('erase');
    updateBrushSize();
    renderDisplay();
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
    const maxBrush = originalImage.width * 0.2; // max 20% of image width
    const minBrush = originalImage.width * 0.005; // min 0.5%
    brushSize = minBrush + (val / 100) * (maxBrush - minBrush);
    
    updateCursorStyle();
}

function updateCursorStyle(e) {
    if (currentMode === 'original') return;
    
    // Calculate scaled brush size for screen
    const rect = displayCanvas.getBoundingClientRect();
    const scale = rect.width / displayCanvas.width;
    const cursorSize = brushSize * scale;
    
    brushCursor.style.width = `${cursorSize}px`;
    brushCursor.style.height = `${cursorSize}px`;
    
    if (e) {
        const wrapperRect = canvasWrapper.getBoundingClientRect();
        brushCursor.style.left = `${e.clientX - wrapperRect.left}px`;
        brushCursor.style.top = `${e.clientY - wrapperRect.top}px`;
    }
}

// Canvas Interaction Logic
let lastPos = {x: 0, y: 0};

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
    isDrawing = true;
    lastPos = getMousePos(e);
    draw(e);
};

const stopDrawing = () => {
    isDrawing = false;
};

const draw = (e) => {
    updateCursorStyle(e);
    if (!isDrawing || currentMode === 'original') return;
    e.preventDefault(); 
    
    const curPos = getMousePos(e);
    
    if (currentTool === 'erase') {
        workingCtx.globalCompositeOperation = 'destination-out';
        workingCtx.lineWidth = brushSize;
        workingCtx.lineCap = 'round';
        workingCtx.lineJoin = 'round';
        workingCtx.beginPath();
        workingCtx.moveTo(lastPos.x, lastPos.y);
        workingCtx.lineTo(curPos.x, curPos.y);
        workingCtx.stroke();
    } else if (currentTool === 'restore') {
        // Draw stroke on brush canvas
        brushCtx.globalCompositeOperation = 'source-over';
        brushCtx.clearRect(0, 0, brushCanvas.width, brushCanvas.height);
        
        brushCtx.lineWidth = brushSize;
        brushCtx.lineCap = 'round';
        brushCtx.lineJoin = 'round';
        brushCtx.beginPath();
        brushCtx.moveTo(lastPos.x, lastPos.y);
        brushCtx.lineTo(curPos.x, curPos.y);
        brushCtx.stroke();
        
        // Fill stroke with original image pixels
        brushCtx.globalCompositeOperation = 'source-in';
        brushCtx.drawImage(originalImage, 0, 0);
        
        // Apply back to working canvas
        workingCtx.globalCompositeOperation = 'source-over';
        workingCtx.drawImage(brushCanvas, 0, 0);
    }
    
    lastPos = curPos;
    renderDisplay();
};

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
    const dataUrl = workingCanvas.toDataURL('image/png');
    
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = newFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});
