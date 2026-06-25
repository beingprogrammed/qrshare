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
  intervalId: null,
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
  sendProgressBar: document.getElementById('sendProgressBar'),
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
      DOM.startSendBtn.disabled = false;
      DOM.startSendBtn.textContent = "Generate QR Sequence & Start";
    }
  });

  // Playback Control Triggers
  DOM.prevChunkBtn.addEventListener('click', () => {
    senderState.activeIndex = (senderState.activeIndex - 1 + senderState.chunks.length) % senderState.chunks.length;
    renderSenderFrame();
  });

  DOM.nextChunkBtn.addEventListener('click', () => {
    senderState.activeIndex = (senderState.activeIndex + 1) % senderState.chunks.length;
    if (senderState.activeIndex === 0) {
      senderState.loopCount++;
      DOM.sendLoopIndicator.textContent = `Loop ${senderState.loopCount}`;
    }
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
async function prepareAndStartTransmission() {
  const file = senderState.file;
  senderState.isCompressed = DOM.inputCompress.checked;
  senderState.chunkSize = parseInt(DOM.inputChunkSize.value);
  senderState.fps = parseInt(DOM.inputFps.value);
  senderState.fileId = generateFileId();
  senderState.loopCount = 1;
  DOM.sendLoopIndicator.textContent = `Loop 1`;

  // Read file contents
  const reader = new FileReader();
  const fileDataPromise = new Promise((resolve, reject) => {
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
  });
  reader.readAsArrayBuffer(file);
  senderState.rawBuffer = await fileDataPromise;

  // Compress if checked
  if (senderState.isCompressed) {
    senderState.dataBuffer = await compressBuffer(senderState.rawBuffer);
  } else {
    senderState.dataBuffer = senderState.rawBuffer;
  }

  // Calculate stats
  const totalRawBytes = senderState.rawBuffer.byteLength;
  const totalDataBytes = senderState.dataBuffer.byteLength;
  const dataChunksCount = Math.ceil(totalDataBytes / senderState.chunkSize);
  const totalChunks = dataChunksCount + 1; // +1 for the Metadata Chunk

  senderState.chunks = [];

  // 1. Create Metadata Chunk (Index 0)
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
  
  // Format: QS|Version|FileID|Flags|TotalChunks|Index|Base64Payload|Checksum
  const metaFlag = senderState.isCompressed ? "1" : "0";
  const metaFrameText = `${MAGIC_PREFIX}|${PROTOCOL_VERSION}|${senderState.fileId}|${metaFlag}|${totalChunks}|0|${metadataBase64}|${metaChecksum}`;
  senderState.chunks.push(metaFrameText);

  // 2. Create Data Chunks (Index 1 to N)
  for (let i = 0; i < dataChunksCount; i++) {
    const startByte = i * senderState.chunkSize;
    const endByte = Math.min(startByte + senderState.chunkSize, totalDataBytes);
    const slicedBytes = senderState.dataBuffer.subarray(startByte, endByte);
    const chunkBase64 = bytesToBase64(slicedBytes);
    const chunkChecksum = adler32(chunkBase64).toString(16).padStart(8, '0');
    const index = i + 1;
    
    const dataFrameText = `${MAGIC_PREFIX}|${PROTOCOL_VERSION}|${senderState.fileId}|${metaFlag}|${totalChunks}|${index}|${chunkBase64}|${chunkChecksum}`;
    senderState.chunks.push(dataFrameText);
  }

  // Update UI Info
  DOM.activeSendTitle.textContent = file.name;
  DOM.statSendChunkSize.textContent = `${senderState.chunkSize} B`;
  DOM.statSendTotalBytes.textContent = formatBytes(totalRawBytes);
  DOM.statSendSpeed.textContent = `${senderState.fps} FPS`;
  
  const totalSeconds = Math.ceil(totalChunks / senderState.fps);
  DOM.statSendEstTime.textContent = `${totalSeconds}s`;

  // Transition UI to sender screen
  DOM.sendConfigPanel.classList.add('hidden');
  DOM.activeSendScreen.classList.remove('hidden');

  // Launch Playback
  senderState.activeIndex = 0;
  playSending();
}

/**
 * Render current active frame to the canvas
 */
function renderSenderFrame() {
  const frameText = senderState.chunks[senderState.activeIndex];
  
  // Render using local QRCode library
  QRCode.toCanvas(DOM.qrCanvas, frameText, {
    width: 280,
    margin: 1,
    color: {
      dark: '#000000',
      light: '#ffffff'
    },
    errorCorrectionLevel: 'L' // Low is highly recommended for speed and detail density
  }, (err) => {
    if (err) {
      console.error("QR Code rendering error:", err);
    }
  });

  // Cycle corners / sync indicator colors to show active frame change clearly
  const colors = ['#00f2fe', '#4facfe', '#b156ff', '#10b981', '#f59e0b', '#ef4444'];
  const activeColor = colors[senderState.activeIndex % colors.length];
  DOM.qrSyncIndicator.style.backgroundColor = activeColor;
  DOM.qrBorder.style.boxShadow = `0 10px 40px rgba(0, 0, 0, 0.4), 0 0 15px ${activeColor}55`;

  // Update progress info
  const currNum = senderState.activeIndex + 1;
  const totalNum = senderState.chunks.length;
  DOM.txtSendProgress.textContent = `Frame ${currNum} / ${totalNum}`;
  DOM.sendProgressBar.style.width = `${(currNum / totalNum) * 100}%`;
}

function playSending() {
  if (senderState.isPlaying) return;
  senderState.isPlaying = true;

  // Toggle SVG icon to Pause
  DOM.playPauseIcon.innerHTML = `
    <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
    <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
  `;

  renderSenderFrame();

  const intervalMs = 1000 / senderState.fps;
  senderState.intervalId = setInterval(() => {
    senderState.activeIndex = (senderState.activeIndex + 1) % senderState.chunks.length;
    
    // Check if looped
    if (senderState.activeIndex === 0) {
      senderState.loopCount++;
      DOM.sendLoopIndicator.textContent = `Loop ${senderState.loopCount}`;
    }
    
    renderSenderFrame();
  }, intervalMs);
}

function pauseSending() {
  if (!senderState.isPlaying) return;
  senderState.isPlaying = false;
  
  if (senderState.intervalId) {
    clearInterval(senderState.intervalId);
    senderState.intervalId = null;
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
    
    // Start scan canvas loop
    if (receiverState.animationFrameId) {
      cancelAnimationFrame(receiverState.animationFrameId);
    }
    receiverState.animationFrameId = requestAnimationFrame(scanVideoFrame);
  } catch (err) {
    console.error("Error starting camera stream:", err);
    DOM.cameraStatus.textContent = "Error";
    DOM.cameraStatus.className = "badge";
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
  
  DOM.chunkGrid.innerHTML = '<div class="chunk-grid-placeholder">Waiting to scan first QR code...</div>';
}

/**
 * Scan video canvas frames continuously for QR Codes
 */
const capCanvas = document.createElement('canvas');
const capCtx = capCanvas.getContext('2d', { willReadFrequently: true });

function scanVideoFrame() {
  const video = DOM.webcamVideo;
  
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
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
  
  if (parts.length !== 8) return; // not our QR code
  if (parts[0] !== MAGIC_PREFIX || parts[1] !== PROTOCOL_VERSION) return; // version mismatch

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
