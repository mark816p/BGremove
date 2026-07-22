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
    
    heroSection.style.display = 'none';
    dropZone.style.display = 'none';
    workspace.style.display = 'none';
    statusContainer.style.display = 'block';
    progressBar.style.width = '0%';
    statusText.textContent = 'Initializing image...';

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        
        // Downscale large images to prevent WebGL context loss/OOM during inference
        const maxDim = 1600;
        let scale = 1;
        if (img.width > maxDim || img.height > maxDim) {
            scale = maxDim / Math.max(img.width, img.height);
        }
        
        originalImage = document.createElement('canvas');
        originalImage.width = Math.floor(img.width * scale);
        originalImage.height = Math.floor(img.height * scale);
        const ctx = originalImage.getContext('2d');
        ctx.drawImage(img, 0, 0, originalImage.width, originalImage.height);
        
        originalImage.toBlob((blob) => {
            processImage(blob);
        }, 'image/png');
    };
    img.src = objectUrl;
};

// Background Removal Process
const processImage = async (blob) => {
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

        const resultBlob = await imglyRemoveBackground(blob, runConfig);
        
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
    statusContainer.style.display = 'none';
    workspace.style.display = 'flex';

    const w = originalImage.width;
    const h = originalImage.height;
    
    displayCanvas.width = w;
    displayCanvas.height = h;
    workingCanvas.width = w;
    workingCanvas.height = h;
    brushCanvas.width = w;
    brushCanvas.height = h;

    // Cache original image pixel data for Magic Edge tool
    const tmpCtx = originalImage.getContext('2d', { willReadFrequently: true });
    originalImageData = tmpCtx.getImageData(0, 0, w, h);

    // Initialize working canvas with the AI result
    workingCtx.clearRect(0, 0, w, h);
    workingCtx.drawImage(foregroundImg, 0, 0);

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

const applyMagicEdgeLocal = (centerX, centerY, radius, toolType, workingImgData, startX, startY, w, h) => {
    if (!originalImageData) return;
    
    const cX = Math.floor(centerX);
    const cY = Math.floor(centerY);
    
    if (cX < 0 || cX >= originalImageData.width || cY < 0 || cY >= originalImageData.height) return;
    
    const centerIdx = (cY * originalImageData.width + cX) * 4;
    const cr = originalImageData.data[centerIdx];
    const cg = originalImageData.data[centerIdx+1];
    const cb = originalImageData.data[centerIdx+2];

    const rSq = radius * radius;
    const tolerance = 60; 
    
    // Local bounding box for this specific circle
    const localStartX = Math.max(startX, Math.floor(centerX - radius));
    const localStartY = Math.max(startY, Math.floor(centerY - radius));
    const localEndX = Math.min(startX + w, Math.ceil(centerX + radius));
    const localEndY = Math.min(startY + h, Math.ceil(centerY + radius));
    
    for (let absY = localStartY; absY < localEndY; absY++) {
        for (let absX = localStartX; absX < localEndX; absX++) {
            const dx = absX - centerX;
            const dy = absY - centerY;
            
            if (dx*dx + dy*dy <= rSq) {
                const origIdx = (absY * originalImageData.width + absX) * 4;
                const pr = originalImageData.data[origIdx];
                const pg = originalImageData.data[origIdx+1];
                const pb = originalImageData.data[origIdx+2];
                const pa = originalImageData.data[origIdx+3];
                
                const colorDist = Math.abs(pr - cr) + Math.abs(pg - cg) + Math.abs(pb - cb);
                
                if (colorDist < tolerance) {
                    const localIdx = ((absY - startY) * w + (absX - startX)) * 4;
                    if (toolType === 'erase') {
                        workingImgData.data[localIdx + 3] = 0;
                    } else {
                        workingImgData.data[localIdx] = pr;
                        workingImgData.data[localIdx+1] = pg;
                        workingImgData.data[localIdx+2] = pb;
                        workingImgData.data[localIdx+3] = pa;
                    }
                }
            }
        }
    }
};

const draw = (e) => {
    updateCursorStyle(e);
    if (!isDrawing || currentMode === 'original') return;
    e.preventDefault(); 
    
    const curPos = getMousePos(e);
    
    if (magicEdgeToggle && magicEdgeToggle.checked) {
        // Find bounding box for the entire stroke segment
        const minX = Math.min(lastPos.x, curPos.x);
        const maxX = Math.max(lastPos.x, curPos.x);
        const minY = Math.min(lastPos.y, curPos.y);
        const maxY = Math.max(lastPos.y, curPos.y);

        const startX = Math.floor(Math.max(0, minX - brushSize));
        const startY = Math.floor(Math.max(0, minY - brushSize));
        const endX = Math.ceil(Math.min(workingCanvas.width, maxX + brushSize));
        const endY = Math.ceil(Math.min(workingCanvas.height, maxY + brushSize));

        const w = endX - startX;
        const h = endY - startY;

        if (w > 0 && h > 0) {
            const workingImgData = workingCtx.getImageData(startX, startY, w, h);
            
            const dx = curPos.x - lastPos.x;
            const dy = curPos.y - lastPos.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const step = Math.max(1, brushSize / 4); 
            const steps = Math.max(1, Math.floor(dist / step));
            
            for (let i = 1; i <= steps; i++) {
                const ix = lastPos.x + dx * (i / steps);
                const iy = lastPos.y + dy * (i / steps);
                applyMagicEdgeLocal(ix, iy, brushSize, currentTool, workingImgData, startX, startY, w, h);
            }
            
            workingCtx.putImageData(workingImgData, startX, startY);
        }
    } else {
        if (currentTool === 'erase') {
            workingCtx.globalCompositeOperation = 'destination-out';
            workingCtx.lineWidth = brushSize * 2;
            workingCtx.lineCap = 'round';
            workingCtx.lineJoin = 'round';
            workingCtx.beginPath();
            workingCtx.moveTo(lastPos.x, lastPos.y);
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
            brushCtx.moveTo(lastPos.x, lastPos.y);
            brushCtx.lineTo(curPos.x, curPos.y);
            brushCtx.stroke();
            
            brushCtx.globalCompositeOperation = 'source-in';
            brushCtx.drawImage(originalImage, 0, 0);
            
            workingCtx.globalCompositeOperation = 'source-over';
            workingCtx.drawImage(brushCanvas, 0, 0);
        }
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
