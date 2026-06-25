/**
 * QRShare - Offline File Transfer via QR Codes
 * Core Application Logic
 */

// --- Global Constants & State ---
const MAGIC_PREFIX = "QS";
const PROTOCOL_VERSION = "1";
const DEFAULT_CHUNK_SIZE = 250;
const DEFAULT_FPS = 10;

// State objects
const senderState = {
  file: null,
  rawBuffer: null,
  dataBuffer: null,
  isCompressed: true,
  chunkSize: DEFAULT_CHUNK_SIZE,
  fps: DEFAULT_FPS,
  fileId: "",
  chunks: [],
  preRenderedCanvases: [], // Cache for pre-rendered offscreen canvases
  totalChunks: 0,
  metadataFrame: "",
  timeoutId: null, // timeout identifier for adaptive playback
  activeIndex: 0,
  isPlaying: false,
  loopCount: 1
};

const receiverState = {
  activeFileId: null,
  totalChunks: 0,
  chunks: [], // Array of base64 strings
  metadata: null,
  stream: null,
  animationFrameId: null,
  cameras: [],
  selectedCameraId: null,
  scannedCount: 0,
  isComplete: false
};

// --- DOM Element Selectors ---
const DOM = {
  // Navigation
  tabs: document.querySelectorAll('.tab-btn'),
  sections: document.querySelectorAll('.section-content'),
  accordionHeader: document.getElementById('accordionHeader'),
  accordionInfo: document.getElementById('infoAccordion'),

  // Send Screen
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('fileInput'),
  sendConfigPanel: document.getElementById('sendConfigPanel'),
  cfgFileName: document.getElementById('cfgFileName'),
  cfgFileSize: document.getElementById('cfgFileSize'),
  cfgFileType: document.getElementById('cfgFileType'),
  changeFileBtn: document.getElementById('changeFileBtn'),
  inputFps: document.getElementById('inputFps'),
  valFps: document.getElementById('valFps'),
  inputChunkSize: document.getElementById('inputChunkSize'),
  valChunkSize: document.getElementById('valChunkSize'),
  inputCompress: document.getElementById('inputCompress'),
  startSendBtn: document.getElementById('startSendBtn'),

  // Loading Overlay
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingStatusText: document.getElementById('loadingStatusText'),
  loadingProgressBar: document.getElementById('loadingProgressBar'),
  loadingPercentageText: document.getElementById('loadingPercentageText'),

  // Active Send Screen
  activeSendScreen: document.getElementById('activeSendScreen'),
  activeSendTitle: document.getElementById('activeSendTitle'),
  sendLoopIndicator: document.getElementById('sendLoopIndicator'),
  qrCanvas: document.getElementById('qrCanvas'),
  qrBorder: document.getElementById('qrBorder'),
  qrSyncIndicator: document.getElementById('qrSyncIndicator'),
  prevChunkBtn: document.getElementById('prevChunkBtn'),
  nextChunkBtn: document.getElementById('nextChunkBtn'),
  playPauseBtn: document.getElementById('playPauseBtn'),
  playPauseIcon: document.getElementById('playPauseIcon'),
  txtSendProgress: document.getElementById('txtSendProgress'),
  sendProgressSlider: document.getElementById('sendProgressSlider'),
  stopSendBtn: document.getElementById('stopSendBtn'),
  statSendChunkSize: document.getElementById('statSendChunkSize'),
  statSendTotalBytes: document.getElementById('statSendTotalBytes'),
  statSendSpeed: document.getElementById('statSendSpeed'),
  statSendEstTime: document.getElementById('statSendEstTime'),

  // Receive Screen
  receiveStartScreen: document.getElementById('receiveStartScreen'),
  startCameraBtn: document.getElementById('startCameraBtn'),
  activeReceiveScreen: document.getElementById('activeReceiveScreen'),
  activeReceiveTitle: document.getElementById('activeReceiveTitle'),
  cameraStatus: document.getElementById('cameraStatus'),
  webcamVideo: document.getElementById('webcamVideo'),
  cameraSelect: document.getElementById('cameraSelect'),
  scannerFeedback: document.getElementById('scannerFeedback'),
  txtReceiveProgress: document.getElementById('txtReceiveProgress'),
  receiveProgressBar: document.getElementById('receiveProgressBar'),
  chunkGrid: document.getElementById('chunkGrid'),
  statRecvSize: document.getElementById('statRecvSize'),
  statRecvChunks: document.getElementById('statRecvChunks'),
  statRecvMissing: document.getElementById('statRecvMissing'),
  statRecvFileId: document.getElementById('statRecvFileId'),
  stopCameraBtn: document.getElementById('stopCameraBtn'),

  // Success Screen
  recvSuccessScreen: document.getElementById('recvSuccessScreen'),
  successFileName: document.getElementById('successFileName'),
  successFileSize: document.getElementById('successFileSize'),
  successFileType: document.getElementById('successFileType'),
  successFileHash: document.getElementById('successFileHash'),
  downloadFileBtn: document.getElementById('downloadFileBtn'),
  resetRecvBtn: document.getElementById('resetRecvBtn')
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initDragAndDrop();
  initSendControls();
  initReceiveControls();
});

// --- Helper Functions ---

/**
 * Custom Adler32 checksum algorithm (very fast, pure JS)
 * Computes a hash of the given string to ensure chunk transmission integrity.
 */
function adler32(data) {
  let a = 1, b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data.charCodeAt(i)) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * Format bytes to readable size
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Convert a Uint8Array into a Base64 string in chunks to prevent stack overflow.
 */
function bytesToBase64(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

/**
 * Convert a Base64 string back into a Uint8Array.
 */
function base64ToBytes(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Compress Uint8Array using browser's built-in CompressionStream
 */
async function compressBuffer(bytes) {
  if (typeof CompressionStream === 'undefined') {
    console.warn("CompressionStream is not supported. Sending uncompressed data.");
    return bytes;
  }
  try {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      }
    }).pipeThrough(new CompressionStream('gzip'));
    const response = new Response(stream);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (err) {
    console.error("Compression error:", err);
    return bytes;
  }
}

/**
 * Decompress Uint8Array using browser's built-in DecompressionStream
 */
async function decompressBuffer(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error("DecompressionStream is not supported in this browser.");
  }
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  }).pipeThrough(new DecompressionStream('gzip'));
  const response = new Response(stream);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Synthesize dynamic audio beep feedback using Web Audio API
 */
function playBeep(type = 'normal') {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'normal') {
      // Short high pitch beep for scanning a chunk
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.08);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.08);
    } else if (type === 'success') {
      // Beautiful sci-fi double beep chime for success
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.12);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.12);

      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
        gain2.gain.setValueAtTime(0.06, audioCtx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.2);
        osc2.start(audioCtx.currentTime);
        osc2.stop(audioCtx.currentTime + 0.2);
      }, 100);
    } else if (type === 'duplicate') {
      // Tiny subtle tick for scanning an already processed chunk
      osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
      gainNode.gain.setValueAtTime(0.015, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.03);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.03);
    }
  } catch (err) {
    // Silently ignore if audio context blocked or unsupported
  }
}

/**
 * Generate a cryptographically random short string for File ID
 */
function generateFileId() {
  const arr = new Uint8Array(2);
  window.crypto.getRandomValues(arr);
  return bytesToBase64(arr).substring(0, 4).replace(/[^a-zA-Z0-9]/g, 'x');
}

// --- Navigation & Accordion ---
function initNavigation() {
  DOM.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-target');
      
      // Stop operations in both modes
      stopSending();
      stopReceiverCamera();
      
      // Toggle tabs
      DOM.tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Toggle sections
      DOM.sections.forEach(s => s.classList.remove('active'));
      document.getElementById(target).classList.add('active');
    });
  });

  DOM.accordionHeader.addEventListener('click', () => {
    DOM.accordionInfo.classList.toggle('open');
  });
}

// --- Drag & Drop Core ---
function initDragAndDrop() {
  const preventDefaults = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    DOM.dropzone.addEventListener(eventName, preventDefaults, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    DOM.dropzone.addEventListener(eventName, () => {
      DOM.dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    DOM.dropzone.addEventListener(eventName, () => {
      DOM.dropzone.classList.remove('dragover');
    }, false);
  });

  DOM.dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleFileSelected(files[0]);
    }
  });

  DOM.dropzone.addEventListener('click', () => {
    DOM.fileInput.click();
  });

  DOM.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });
}

function handleFileSelected(file) {
  senderState.file = file;
  
  DOM.cfgFileName.textContent = file.name;
  DOM.cfgFileSize.textContent = formatBytes(file.size);
  DOM.cfgFileType.textContent = file.type || "unknown binary mimetype";
  
  // Dynamic label warning / optimization details based on file size
  const compressCheckbox = DOM.inputCompress;
  const compressLabel = compressCheckbox.parentElement;
  
  // Clean up any old warnings
  const oldWarning = document.getElementById('largeFileWarning');
  if (oldWarning) oldWarning.remove();
  
  if (file.size >= 10 * 1024 * 1024) { // >= 10 MB
    compressCheckbox.checked = false;
    compressCheckbox.disabled = true;
    
    const warning = document.createElement('div');
    warning.id = 'largeFileWarning';
    warning.style.color = 'var(--color-warning)';
    warning.style.fontSize = '11px';
    warning.style.marginTop = '6px';
    warning.textContent = '⚠️ Gzip compression disabled for large files (>=10MB) to prevent browser freeze. File will be read dynamically from local storage.';
    compressLabel.parentElement.appendChild(warning);
  } else if (file.size >= 500 * 1024) { // >= 500 KB
    compressCheckbox.checked = true;
    compressCheckbox.disabled = false;
    
    const warning = document.createElement('div');
    warning.id = 'largeFileWarning';
    warning.style.color = 'var(--color-primary)';
    warning.style.fontSize = '11px';
    warning.style.marginTop = '6px';
    warning.textContent = '⚡ File >=500KB will be read dynamically from local storage to prevent browser memory issues (no pre-render delay).';
    compressLabel.parentElement.appendChild(warning);
  } else {
    compressCheckbox.checked = true;
    compressCheckbox.disabled = false;
  }
  
  // Show config panel, hide dropzone
  DOM.dropzone.classList.add('hidden');
  DOM.sendConfigPanel.classList.remove('hidden');
}

// --- Send Section Controls ---
function initSendControls() {
  // Back out of file configuration
  DOM.changeFileBtn.addEventListener('click', () => {
    senderState.file = null;
    DOM.fileInput.value = "";
    DOM.sendConfigPanel.classList.add('hidden');
    DOM.dropzone.classList.remove('hidden');
  });

  // Slider change indicators
  DOM.inputFps.addEventListener('input', (e) => {
    senderState.fps = parseInt(e.target.value);
    DOM.valFps.textContent = `${senderState.fps} FPS`;
  });

  DOM.inputChunkSize.addEventListener('input', (e) => {
    senderState.chunkSize = parseInt(e.target.value);
    DOM.valChunkSize.textContent = `${senderState.chunkSize} bytes`;
  });

  // Start Transmission Button
  DOM.startSendBtn.addEventListener('click', async () => {
    if (!senderState.file) return;
    
    DOM.startSendBtn.disabled = true;
    DOM.startSendBtn.innerHTML = `
      <svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;margin-right:8px;animation: spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
      Preparing file...
    `;
    
    // Add simple spin style directly
    if (!document.getElementById('spinStyle')) {
      const style = document.createElement('style');
      style.id = 'spinStyle';
      style.innerHTML = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
      document.head.appendChild(style);
    }

    try {
      await prepareAndStartTransmission();
    } catch (err) {
      console.error(err);
      alert("Error reading file: " + err.message);
      DOM.loadingOverlay.classList.add('hidden');
      DOM.startSendBtn.disabled = false;
      DOM.startSendBtn.textContent = "Generate QR Sequence & Start";
    }
  });

  // Playback Control Triggers
  DOM.prevChunkBtn.addEventListener('click', () => {
    senderState.activeIndex = (senderState.activeIndex - 1 + senderState.totalChunks) % senderState.totalChunks;
    renderSenderFrame();
  });

  DOM.nextChunkBtn.addEventListener('click', () => {
    senderState.activeIndex = (senderState.activeIndex + 1) % senderState.totalChunks;
    if (senderState.activeIndex === 0) {
      senderState.loopCount++;
      DOM.sendLoopIndicator.textContent = `Loop ${senderState.loopCount}`;
    }
    renderSenderFrame();
  });

  // Progress Slider scrubbing
  DOM.sendProgressSlider.addEventListener('input', (e) => {
    const targetIndex = parseInt(e.target.value) - 1;
    senderState.activeIndex = targetIndex;
    renderSenderFrame();
  });

  DOM.playPauseBtn.addEventListener('click', () => {
    if (senderState.isPlaying) {
      pauseSending();
    } else {
      playSending();
    }
  });

  DOM.stopSendBtn.addEventListener('click', () => {
    stopSending();
    // Return to config screen
    DOM.activeSendScreen.classList.add('hidden');
    DOM.sendConfigPanel.classList.remove('hidden');
    DOM.startSendBtn.disabled = false;
    DOM.startSendBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;margin-right:8px;">
        <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>
      </svg>
      Generate QR Sequence & Start
    `;
  });
}

// --- Sender Implementation ---

/**
 * Prepares the file data, divides it into chunks, formats them, and launches the transmitter
 */
/**
 * Asynchronously generates the formatted frame text payload for a specific index.
 * Handles reading slices directly from disk (on-the-fly) to conserve RAM for larger files.
 */
async function getSenderFrameText(index) {
  if (index === 0) {
    return senderState.metadataFrame;
  }

  const dataIndex = index - 1;
  const startByte = dataIndex * senderState.chunkSize;
  let slicedBytes;

  if (senderState.dataBuffer) {
    // Read from the preloaded RAM buffer (compressed or raw)
    const endByte = Math.min(startByte + senderState.chunkSize, senderState.dataBuffer.byteLength);
    slicedBytes = senderState.dataBuffer.subarray(startByte, endByte);
  } else {
    // Read directly from disk using HTML5 File API (0 MB memory overhead)
    const endByte = Math.min(startByte + senderState.chunkSize, senderState.file.size);
    const blobSlice = senderState.file.slice(startByte, endByte);
    
    const arrayBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blobSlice);
    });
    slicedBytes = new Uint8Array(arrayBuffer);
  }

  const chunkBase64 = bytesToBase64(slicedBytes);
  const chunkChecksum = adler32(chunkBase64).toString(16).padStart(8, '0');
  const metaFlag = senderState.isCompressed ? "1" : "0";

  return `${MAGIC_PREFIX}|${PROTOCOL_VERSION}|${senderState.fileId}|${metaFlag}|${senderState.totalChunks}|${index}|${chunkBase64}|${chunkChecksum}`;
}

async function prepareAndStartTransmission() {
  const file = senderState.file;
  senderState.isCompressed = DOM.inputCompress.checked;
  senderState.chunkSize = parseInt(DOM.inputChunkSize.value);
  senderState.fps = parseInt(DOM.inputFps.value);
  senderState.fileId = generateFileId();
  senderState.loopCount = 1;
  DOM.sendLoopIndicator.textContent = `Loop 1`;

  // Display and initialize loading overlay progress
  DOM.loadingOverlay.classList.remove('hidden');
  DOM.loadingStatusText.textContent = "Initializing file transfer...";
  DOM.loadingProgressBar.style.width = '5%';
  DOM.loadingPercentageText.textContent = '5%';

  const totalRawBytes = file.size;
  let totalDataBytes = totalRawBytes;
  
  // File size optimization thresholds
  const PRE_RENDER_MAX_SIZE = 500 * 1024; // 500 KB
  const COMPRESS_MAX_SIZE = 10 * 1024 * 1024; // 10 MB

  // Auto-disable compression for large files to avoid browser freeze
  if (totalRawBytes >= COMPRESS_MAX_SIZE) {
    senderState.isCompressed = false;
    senderState.rawBuffer = null;
    senderState.dataBuffer = null;
  } else {
    // Read contents into memory
    DOM.loadingStatusText.textContent = "Reading file into memory...";
    DOM.loadingProgressBar.style.width = '15%';
    DOM.loadingPercentageText.textContent = '15%';
    await new Promise(resolve => setTimeout(resolve, 50)); // let UI render

    const reader = new FileReader();
    const fileDataPromise = new Promise((resolve, reject) => {
      reader.onload = () => resolve(new Uint8Array(reader.result));
      reader.onerror = () => reject(reader.error);
    });
    reader.readAsArrayBuffer(file);
    senderState.rawBuffer = await fileDataPromise;

    DOM.loadingProgressBar.style.width = '30%';
    DOM.loadingPercentageText.textContent = '30%';

    if (senderState.isCompressed) {
      DOM.loadingStatusText.textContent = "Compressing file (Gzip)...";
      DOM.loadingProgressBar.style.width = '40%';
      DOM.loadingPercentageText.textContent = '40%';
      await new Promise(resolve => setTimeout(resolve, 50));

      senderState.dataBuffer = await compressBuffer(senderState.rawBuffer);
      totalDataBytes = senderState.dataBuffer.byteLength;
    } else {
      senderState.dataBuffer = senderState.rawBuffer;
      totalDataBytes = senderState.rawBuffer.byteLength;
    }
  }

  // Calculate chunks count
  const dataChunksCount = Math.ceil(totalDataBytes / senderState.chunkSize);
  const totalChunks = dataChunksCount + 1; // +1 for metadata chunk
  senderState.totalChunks = totalChunks;

  // 1. Pre-calculate Metadata Frame (Index 0)
  const metadataObj = {
    name: file.name,
    size: totalRawBytes,
    type: file.type || "application/octet-stream",
    rawSize: totalRawBytes,
    compSize: totalDataBytes,
    isComp: senderState.isCompressed
  };
  const metadataStr = JSON.stringify(metadataObj);
  const metadataBase64 = btoa(unescape(encodeURIComponent(metadataStr))); // safe utf-8 base64
  const metaChecksum = adler32(metadataBase64).toString(16).padStart(8, '0');
  
  const metaFlag = senderState.isCompressed ? "1" : "0";
  senderState.metadataFrame = `${MAGIC_PREFIX}|${PROTOCOL_VERSION}|${senderState.fileId}|${metaFlag}|${totalChunks}|0|${metadataBase64}|${metaChecksum}`;

  // Reset indices array
  senderState.chunks = new Array(totalChunks).fill("");

  // Update UI Stats
  DOM.activeSendTitle.textContent = file.name;
  DOM.statSendChunkSize.textContent = `${senderState.chunkSize} B`;
  DOM.statSendTotalBytes.textContent = formatBytes(totalRawBytes);
  DOM.statSendSpeed.textContent = `${senderState.fps} FPS`;
  
  const totalSeconds = Math.ceil(totalChunks / senderState.fps);
  DOM.statSendEstTime.textContent = `${totalSeconds}s`;

  // Configure Progress Slider bounds
  DOM.sendProgressSlider.min = 1;
  DOM.sendProgressSlider.max = totalChunks;
  DOM.sendProgressSlider.value = 1;

  // Pre-render QR codes ONLY if file is small enough to fit in browser cache
  senderState.preRenderedCanvases = [];
  if (totalRawBytes < PRE_RENDER_MAX_SIZE) {
    DOM.loadingStatusText.textContent = "Pre-rendering QR Codes...";
    DOM.loadingProgressBar.style.width = '50%';
    DOM.loadingPercentageText.textContent = '50%';

    for (let i = 0; i < totalChunks; i++) {
      const percent = 50 + Math.floor((i / totalChunks) * 45); // Scale from 50% to 95%
      DOM.loadingProgressBar.style.width = `${percent}%`;
      DOM.loadingPercentageText.textContent = `${percent}%`;
      DOM.loadingStatusText.textContent = `Pre-rendering QR Codes (${i + 1}/${totalChunks})...`;
      
      await new Promise(resolve => setTimeout(resolve, 0));

      const frameText = await getSenderFrameText(i);
      const offscreen = document.createElement('canvas');
      await new Promise((resolve, reject) => {
        QRCode.toCanvas(offscreen, frameText, {
          width: 280,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
          errorCorrectionLevel: 'L'
        }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      senderState.preRenderedCanvases.push(offscreen);
    }
  } else {
    // Large files read on the fly
    DOM.loadingStatusText.textContent = "Configuring dynamic reader...";
    DOM.loadingProgressBar.style.width = '95%';
    DOM.loadingPercentageText.textContent = '95%';
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Visual success hold before transitioning
  DOM.loadingStatusText.textContent = "Ready!";
  DOM.loadingProgressBar.style.width = '100%';
  DOM.loadingPercentageText.textContent = '100%';
  await new Promise(resolve => setTimeout(resolve, 200));

  // Transition UI
  DOM.loadingOverlay.classList.add('hidden');
  DOM.sendConfigPanel.classList.add('hidden');
  DOM.activeSendScreen.classList.remove('hidden');

  // Start Playback
  senderState.activeIndex = 0;
  playSending();
}

/**
 * Renders the active frame to the visible canvas.
 * Draws from offscreen cache if available, or generates the frame on-the-fly.
 */
async function renderSenderFrame() {
  const isPreRendered = senderState.preRenderedCanvases.length > 0;
  
  if (isPreRendered) {
    const activeCanvas = senderState.preRenderedCanvases[senderState.activeIndex];
    if (!activeCanvas) return;
    const ctx = DOM.qrCanvas.getContext('2d');
    DOM.qrCanvas.width = activeCanvas.width;
    DOM.qrCanvas.height = activeCanvas.height;
    ctx.drawImage(activeCanvas, 0, 0);
  } else {
    // Generate QR code dynamically in real-time
    try {
      const frameText = await getSenderFrameText(senderState.activeIndex);
      await new Promise((resolve, reject) => {
        QRCode.toCanvas(DOM.qrCanvas, frameText, {
          width: 280,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
          errorCorrectionLevel: 'L'
        }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (err) {
      console.error("On-the-fly QR generation failed:", err);
    }
  }

  // Cycle sync colors / border glow
  const colors = ['#00f2fe', '#4facfe', '#b156ff', '#10b981', '#f59e0b', '#ef4444'];
  const activeColor = colors[senderState.activeIndex % colors.length];
  DOM.qrSyncIndicator.style.backgroundColor = activeColor;
  DOM.qrBorder.style.boxShadow = `0 10px 40px rgba(0, 0, 0, 0.4), 0 0 15px ${activeColor}55`;

  // Update progress info
  const currNum = senderState.activeIndex + 1;
  const totalNum = senderState.totalChunks;
  DOM.txtSendProgress.textContent = `Frame ${currNum} / ${totalNum}`;
  DOM.sendProgressSlider.value = currNum;
}

/**
 * Adaptive execution loop that runs frames at target FPS without overlapping.
 */
async function tickSender() {
  if (!senderState.isPlaying) return;

  const startTime = Date.now();
  await renderSenderFrame();

  // Increment index
  senderState.activeIndex = (senderState.activeIndex + 1) % senderState.totalChunks;
  if (senderState.activeIndex === 0) {
    senderState.loopCount++;
    DOM.sendLoopIndicator.textContent = `Loop ${senderState.loopCount}`;
  }

  // Calculate adaptive delay to keep frame rate stable
  const elapsed = Date.now() - startTime;
  const targetDelay = 1000 / senderState.fps;
  const remainingDelay = Math.max(0, targetDelay - elapsed);

  senderState.timeoutId = setTimeout(tickSender, remainingDelay);
}

function playSending() {
  if (senderState.isPlaying) return;
  senderState.isPlaying = true;

  // Toggle SVG icon to Pause
  DOM.playPauseIcon.innerHTML = `
    <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
    <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
  `;

  tickSender();
}

function pauseSending() {
  if (!senderState.isPlaying) return;
  senderState.isPlaying = false;
  
  if (senderState.timeoutId) {
    clearTimeout(senderState.timeoutId);
    senderState.timeoutId = null;
  }

  // Toggle SVG icon to Play
  DOM.playPauseIcon.innerHTML = `
    <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>
  `;
}

function stopSending() {
  pauseSending();
  senderState.activeIndex = 0;
  senderState.chunks = [];
  senderState.preRenderedCanvases = [];
  senderState.totalChunks = 0;
  senderState.metadataFrame = "";
  senderState.file = null;
  senderState.rawBuffer = null;
  senderState.dataBuffer = null;
}

// --- Receive Section Controls ---
function initReceiveControls() {
  // Start Camera Button Click
  DOM.startCameraBtn.addEventListener('click', () => {
    requestCameraAccess();
  });

  // Camera selection change
  DOM.cameraSelect.addEventListener('change', (e) => {
    receiverState.selectedCameraId = e.target.value;
    if (receiverState.stream) {
      // Restart camera with new source
      startReceiverCamera();
    }
  });

  // Cancel / Stop Camera click
  DOM.stopCameraBtn.addEventListener('click', () => {
    stopReceiverCamera();
    DOM.activeReceiveScreen.classList.add('hidden');
    DOM.receiveStartScreen.classList.remove('hidden');
  });

  // Reset / Scan another
  DOM.resetRecvBtn.addEventListener('click', () => {
    DOM.recvSuccessScreen.classList.add('hidden');
    DOM.receiveStartScreen.classList.remove('hidden');
    resetReceiverState();
  });

  // Download Trigger
  DOM.downloadFileBtn.addEventListener('click', () => {
    triggerFileDownload();
  });
}

// --- Receiver Implementation ---

async function requestCameraAccess() {
  DOM.startCameraBtn.disabled = true;
  DOM.startCameraBtn.innerHTML = `Connecting Camera...`;
  
  try {
    // Initial request to ask permissions
    const initStream = await navigator.mediaDevices.getUserMedia({ video: true });
    initStream.getTracks().forEach(track => track.stop()); // close immediately
    
    // List devices to fill select options
    await enumerateCameras();
    
    // Switch view and spin up camera
    DOM.receiveStartScreen.classList.add('hidden');
    DOM.activeReceiveScreen.classList.remove('hidden');
    DOM.startCameraBtn.disabled = false;
    DOM.startCameraBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;margin-right:8px;">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
      Access Camera & Start Scanning
    `;
    
    resetReceiverState();
    await startReceiverCamera();
  } catch (err) {
    console.error("Camera access failed:", err);
    alert("Camera access denied or unavailable. To receive files, camera permission is required.");
    DOM.startCameraBtn.disabled = false;
    DOM.startCameraBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;margin-right:8px;">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
      Access Camera & Start Scanning
    `;
  }
}

async function enumerateCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    receiverState.cameras = devices.filter(d => d.kind === 'videoinput');
    
    DOM.cameraSelect.innerHTML = '';
    
    if (receiverState.cameras.length === 0) {
      DOM.cameraSelect.innerHTML = '<option value="">No cameras found</option>';
      return;
    }

    receiverState.cameras.forEach((camera, index) => {
      const option = document.createElement('option');
      option.value = camera.deviceId;
      // Provide clean default label names if blank
      option.textContent = camera.label || `Camera ${index + 1} (${camera.deviceId.substring(0, 5)})`;
      
      // Auto pre-select environments/back camera for mobile
      if (!receiverState.selectedCameraId && camera.label.toLowerCase().includes('back')) {
        receiverState.selectedCameraId = camera.deviceId;
      }
      
      DOM.cameraSelect.appendChild(option);
    });

    if (receiverState.selectedCameraId) {
      DOM.cameraSelect.value = receiverState.selectedCameraId;
    } else {
      receiverState.selectedCameraId = receiverState.cameras[0].deviceId;
    }
  } catch (err) {
    console.error("Could not enumerate cameras:", err);
  }
}

async function startReceiverCamera() {
  if (receiverState.stream) {
    // stop current tracks first
    receiverState.stream.getTracks().forEach(track => track.stop());
  }

  const constraints = {
    audio: false,
    video: {
      deviceId: receiverState.selectedCameraId ? { exact: receiverState.selectedCameraId } : undefined,
      // Fallback request to environmental camera (back camera)
      facingMode: receiverState.selectedCameraId ? undefined : 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  try {
    receiverState.stream = await navigator.mediaDevices.getUserMedia(constraints);
    DOM.webcamVideo.srcObject = receiverState.stream;
    
    DOM.cameraStatus.textContent = "Active";
    DOM.cameraStatus.className = "badge badge-pulse";
    
    DOM.scannerFeedback.textContent = "Camera active. Point at sender QR Code...";
    DOM.scannerFeedback.style.color = "var(--color-primary)";

    // Start scan canvas loop
    if (receiverState.animationFrameId) {
      cancelAnimationFrame(receiverState.animationFrameId);
    }
    receiverState.animationFrameId = requestAnimationFrame(scanVideoFrame);
  } catch (err) {
    console.error("Error starting camera stream:", err);
    DOM.cameraStatus.textContent = "Error";
    DOM.cameraStatus.className = "badge";
    DOM.scannerFeedback.textContent = "Camera initialization failed.";
    DOM.scannerFeedback.style.color = "var(--color-danger)";
    alert("Unable to open selected camera source: " + err.message);
  }
}

function stopReceiverCamera() {
  if (receiverState.stream) {
    receiverState.stream.getTracks().forEach(track => track.stop());
    receiverState.stream = null;
  }
  
  if (receiverState.animationFrameId) {
    cancelAnimationFrame(receiverState.animationFrameId);
    receiverState.animationFrameId = null;
  }
  DOM.webcamVideo.srcObject = null;
}

function resetReceiverState() {
  receiverState.activeFileId = null;
  receiverState.totalChunks = 0;
  receiverState.chunks = [];
  receiverState.metadata = null;
  receiverState.scannedCount = 0;
  receiverState.isComplete = false;

  DOM.activeReceiveTitle.textContent = "Scanning for metadata...";
  DOM.txtReceiveProgress.textContent = "0 / ? (0%)";
  DOM.receiveProgressBar.style.width = "0%";
  
  DOM.statRecvSize.textContent = "-";
  DOM.statRecvChunks.textContent = "0 / 0";
  DOM.statRecvMissing.textContent = "-";
  DOM.statRecvFileId.textContent = "-";
  
  DOM.scannerFeedback.textContent = "Ready to scan...";
  DOM.scannerFeedback.style.color = "var(--color-primary)";

  DOM.chunkGrid.innerHTML = '<div class="chunk-grid-placeholder">Waiting to scan first QR code...</div>';
}

/**
 * Scan video canvas frames continuously for QR Codes
 */
const capCanvas = document.createElement('canvas');
const capCtx = capCanvas.getContext('2d', { willReadFrequently: true });

function scanVideoFrame() {
  const video = DOM.webcamVideo;
  
  if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
    try {
      // Fit canvas resolution to actual video source
      capCanvas.width = video.videoWidth;
      capCanvas.height = video.videoHeight;
      
      capCtx.drawImage(video, 0, 0, capCanvas.width, capCanvas.height);
      const imgData = capCtx.getImageData(0, 0, capCanvas.width, capCanvas.height);
      
      // Decode with local jsQR library
      const decoded = jsQR(imgData.data, imgData.width, imgData.height);
      
      if (decoded && decoded.data) {
        handleFrameScanned(decoded.data);
      }
    } catch (err) {
      console.error("Camera frame capture/decode crashed:", err);
    }
  }

  // Loop if not completed
  if (!receiverState.isComplete && receiverState.stream) {
    receiverState.animationFrameId = requestAnimationFrame(scanVideoFrame);
  }
}

/**
 * Process text string extracted from QR Code
 */
function handleFrameScanned(dataStr) {
  // Protocol: MAGIC|Version|FileID|Flags|TotalChunks|Index|Base64Payload|Checksum
  const parts = dataStr.split('|');
  
  if (parts.length !== 8 || parts[0] !== MAGIC_PREFIX || parts[1] !== PROTOCOL_VERSION) {
    DOM.scannerFeedback.textContent = "Scanning... Unrecognized QR Code.";
    DOM.scannerFeedback.style.color = "var(--color-warning)";
    return;
  }

  const fileId = parts[2];
  const isCompressed = parts[3] === "1";
  const totalChunks = parseInt(parts[4]);
  const index = parseInt(parts[5]);
  const base64Data = parts[6];
  const checksum = parts[7];

  // 1. Verify block integrity checksum
  const compChecksum = adler32(base64Data).toString(16).padStart(8, '0');
  if (compChecksum !== checksum) {
    console.warn(`Checksum mismatch on frame ${index}! Skipping.`);
    DOM.scannerFeedback.textContent = `Corrupted frame ${index} (checksum error).`;
    DOM.scannerFeedback.style.color = "var(--color-danger)";
    return;
  }

  // 2. Initialize a new session if File ID changed
  if (receiverState.activeFileId !== fileId) {
    receiverState.activeFileId = fileId;
    receiverState.totalChunks = totalChunks;
    receiverState.chunks = new Array(totalChunks).fill(null);
    receiverState.scannedCount = 0;
    receiverState.metadata = null;
    DOM.statRecvFileId.textContent = fileId;
    
    // Recreate graphical chunk map defragmentation cells
    DOM.chunkGrid.innerHTML = '';
    for (let i = 0; i < totalChunks; i++) {
      const cell = document.createElement('div');
      cell.classList.add('grid-cell');
      cell.id = `cell-${i}`;
      if (i === 0) {
        cell.classList.add('metadata-cell');
        cell.title = "Chunk 0: File Metadata";
      } else {
        cell.title = `Chunk ${i}`;
      }
      DOM.chunkGrid.appendChild(cell);
    }
  }

  // 3. Mark chunk as received if new
  if (receiverState.chunks[index] === null) {
    receiverState.chunks[index] = base64Data;
    receiverState.scannedCount++;

    // Mark visual cell in block grid
    const cell = document.getElementById(`cell-${index}`);
    if (cell) {
      cell.classList.add('filled');
    }

    // Update scanner feedback status
    const chunkName = index === 0 ? "Metadata (0)" : `Data (${index}/${totalChunks - 1})`;
    DOM.scannerFeedback.textContent = `Scanned Chunk ${chunkName} successfully!`;
    DOM.scannerFeedback.style.color = "var(--color-success)";

    // Play successful sweep/beep
    playBeep('normal');

    // Trigger haptic vibration feedback if available (e.g. mobile phones)
    if (navigator.vibrate) {
      navigator.vibrate(25);
    }

    // If Index 0, parse metadata JSON immediately
    if (index === 0) {
      try {
        // Safe decoding of UTF-8 strings
        const decodedStr = decodeURIComponent(escape(atob(base64Data)));
        receiverState.metadata = JSON.parse(decodedStr);
        
        // Update Metadata displays
        DOM.activeReceiveTitle.textContent = receiverState.metadata.name;
        DOM.statRecvSize.textContent = formatBytes(receiverState.metadata.size);
      } catch (err) {
        console.error("Metadata JSON parse failure:", err);
      }
    }

    // Update displays
    updateReceiverStats();

    // 4. Check if fully complete!
    checkCompleteness();
  } else {
    // Duplicate chunk scanned (already parsed in this loop)
    const chunkName = index === 0 ? "Metadata (0)" : `Data (${index}/${totalChunks - 1})`;
    DOM.scannerFeedback.textContent = `Duplicate Chunk ${chunkName} (waiting for new...)`;
    DOM.scannerFeedback.style.color = "var(--color-primary)";
    
    // Play very silent tick so user knows scanner is still responsive
    playBeep('duplicate');
  }
}

function updateReceiverStats() {
  const scanned = receiverState.scannedCount;
  const total = receiverState.totalChunks;
  const percent = Math.floor((scanned / total) * 100);
  
  DOM.txtReceiveProgress.textContent = `${scanned} / ${total} (${percent}%)`;
  DOM.receiveProgressBar.style.width = `${percent}%`;

  DOM.statRecvChunks.textContent = `${scanned} / ${total}`;
  DOM.statRecvMissing.textContent = `${total - scanned}`;
}

function checkCompleteness() {
  // Check if any element is still null in chunks array
  const hasNulls = receiverState.chunks.includes(null);
  
  if (!hasNulls && !receiverState.isComplete) {
    receiverState.isComplete = true;
    playBeep('success');
    
    // Stop video camera capture
    stopReceiverCamera();
    
    // Launch file assembly
    assembleAndDownload();
  }
}

/**
 * Merge raw Base64 data chunks, decompress, and transition to Success Screen
 */
async function assembleAndDownload() {
  try {
    DOM.activeReceiveTitle.textContent = "Assembling file...";
    
    const chunks = receiverState.chunks;
    const metadata = receiverState.metadata;
    const isCompressed = chunks[0] !== null && receiverState.chunks[0] !== null; // flags checked from chunk 0
    
    // We parsed flags from frame: parts[3] === "1"
    // Let's read it directly.
    const isComp = receiverState.metadata ? receiverState.metadata.isComp : false;

    // Concat data chunks (indices 1 to N)
    const dataChunks = [];
    let totalLength = 0;
    
    for (let i = 1; i < chunks.length; i++) {
      const bytes = base64ToBytes(chunks[i]);
      dataChunks.push(bytes);
      totalLength += bytes.length;
    }

    // Allocate continuous space
    const combinedBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunkBytes of dataChunks) {
      combinedBytes.set(chunkBytes, offset);
      offset += chunkBytes.length;
    }

    // Decompress if gzip flag set
    let finalBuffer;
    if (isComp) {
      finalBuffer = await decompressBuffer(combinedBytes);
    } else {
      finalBuffer = combinedBytes;
    }

    // Create File Blob
    const mimeType = metadata ? metadata.type : "application/octet-stream";
    const fileName = metadata ? metadata.name : "qrshare_file.bin";
    const fileBlob = new Blob([finalBuffer], { type: mimeType });

    // Store Blob for user manual download button
    receiverState.downloadUrl = URL.createObjectURL(fileBlob);
    receiverState.downloadName = fileName;

    // Verify Adler32 of raw buffer to show as unique checksum
    const rawDataString = bytesToBase64(finalBuffer);
    const integrityHash = adler32(rawDataString).toString(16).toUpperCase();

    // Show Success Panel
    DOM.successFileName.textContent = fileName;
    DOM.successFileSize.textContent = formatBytes(finalBuffer.byteLength);
    DOM.successFileType.textContent = mimeType;
    DOM.successFileHash.textContent = `ADLER32:${integrityHash}`;

    // Switch view
    DOM.activeReceiveScreen.classList.add('hidden');
    DOM.recvSuccessScreen.classList.remove('hidden');

    // Auto-trigger download
    triggerFileDownload();

  } catch (err) {
    console.error("Assembly failed:", err);
    alert("Error reconstructing file data: " + err.message + "\nCheck logs.");
    resetReceiverState();
    DOM.activeReceiveScreen.classList.add('hidden');
    DOM.receiveStartScreen.classList.remove('hidden');
  }
}

function triggerFileDownload() {
  if (receiverState.downloadUrl && receiverState.downloadName) {
    const a = document.createElement('a');
    a.href = receiverState.downloadUrl;
    a.download = receiverState.downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
