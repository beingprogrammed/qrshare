# 🚀 QRShare - Offline File Transfer via QR Codes

QRShare is a client-side web application designed to transfer files between two devices using **only QR codes**. The sending device compresses the file, chunks it, and displays an animated loop of QR codes. The receiving device uses its camera to scan these QR codes in any order, verifies their integrity, decompresses the payload, and reassembles the file.

Everything runs **entirely inside the browser**—no data is ever sent to a server. The app is fully self-contained and works completely offline!

---

## ✨ Features

- **💡 Zero Dependencies:** Built with pure vanilla HTML5, CSS3, and JavaScript. Zero NPM dependencies or complex compilation pipelines.
- **⚡ Native Gzip Compression:** Uses the browser's native `CompressionStream` API to shrink files before sharing, resulting in fewer QR codes and faster transfer times.
- **🎯 Order-Independent Scanning:** Scans are processed out-of-order! If the camera misses a frame, it will catch it on the next loop.
- **🧩 Defragmentation Map:** Displays a real-time graphical block-grid of received and missing chunks (similar to a classic disk defragmenter) so you can track progress.
- **🎛️ Dual-Device Controls:** Fully adjustable speed (FPS), data density (chunk size), and a visual synchronization flash corner to optimize camera capture.
- **🔊 Synth Audio Feedback:** Synthesizes sound effects (Web Audio API) for scanning successes, duplicates, and completion without loading large external sound files.
- **⚙️ Self-Hosting HTTPS Server:** Built-in lightweight HTTPS servers (both Node.js and Python) to satisfy browser security requirements for mobile camera access.

---

## 🛠️ Getting Started

### 1. Generate SSL Certificates (Required for Mobile Camera Access)
Modern web browsers block access to the camera (`getUserMedia`) on mobile devices unless the page is loaded over a secure context (**HTTPS**). To enable this, you must generate a self-signed SSL certificate before starting the server.

Open your terminal, navigate to the `qrshare` folder, and run:
```bash
./generate_certs.sh
```
*Note: If on Windows or without bash, you can run:*
```bash
openssl req -subj '/CN=localhost' -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365
```

### 2. Start the Server
You can run the server using either **Node.js** or **Python**. Both will automatically detect your `key.pem` and `cert.pem` files and run over HTTPS.

#### Option A: Node.js (Recommended)
```bash
# Start the server (runs on HTTPS port 8443)
npm start

# Or directly:
node server.js
```

#### Option B: Python 3
```bash
python3 server.py
```

### 3. Open the Web App
When the server starts, it prints out links in your terminal:
- **Local Access:** Open `https://localhost:8443` on the host machine.
- **Network Scan:** Open the printed network IP (e.g., `https://192.168.1.52:8443`) on the receiving device (phone/tablet).

---

## ⚠️ Browser Security Warnings (Self-Signed Certificates)

Since the SSL certificate is self-signed (created by you locally), your browser will display a warning when you open the page (e.g., `"Your connection is not private"` or `"Warning: Potential Security Risk Ahead"`).

**This is normal and safe for local development. To bypass it:**
1. Click on **Advanced** or **More Information**.
2. Click **Proceed to [IP Address] (unsafe)** or **Accept the Risk and Continue**.
3. Grant camera permission when prompted, and start scanning!

---

## 📐 How the Protocol Works

When a file is loaded, QRShare formats data into structured text payloads:

`QS|Version|FileID|Flags|TotalChunks|Index|Base64Payload|Checksum`

- **`QS`**: Magic prefix signature.
- **`Version`**: Current protocol version (`1`).
- **`FileID`**: A random 4-character identifier generated per file. Helps the receiver know when a new file starts.
- **`Flags`**: Bitmask (e.g. `1` indicates Gzip compressed, `0` indicates raw uncompressed).
- **`TotalChunks`**: The total count of chunks, including the metadata chunk.
- **`Index`**: The current chunk position:
  - **`Index 0`**: Special Metadata Chunk (JSON structure containing file name, raw size, mime-type, compressed size).
  - **`Index 1 to N`**: File data slices.
- **`Base64Payload`**: Raw chunk bytes converted to alphanumeric text.
- **`Checksum`**: Hex representation of the Adler-32 hash of the `Base64Payload` (used to verify block integrity).

---

## 🛡️ Best Practices for Fast Sharing

1. **Keep it Small:** QR codes are best for smaller payloads. Text files, PDFs, contact cards, keys, and small images (under 1 MB) transfer very quickly.
2. **Adjust Speed (FPS):** Set the speed depending on the receiving device's camera. 10 FPS is a good default. Newer phones can easily scan up to 15-20 FPS.
3. **Adjust Chunk Size:** Default is 250 bytes. If you have a high-resolution screen and camera, you can increase this to 400-500 bytes to reduce the total number of QR codes. If scanning is failing to lock, decrease the chunk size.
4. **Use Low Error Correction:** The QR sequence generators use **Level L** (Low ~7% recovery). This maximizes data space inside each code, resulting in larger blocks that scan much faster.
