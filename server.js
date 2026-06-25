const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const HTTP_PORT = 8080;
const HTTPS_PORT = 8443;
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME types lookup table
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Common request handler to serve static assets from the public directory
function requestHandler(req, res) {
  console.log(`${req.method} ${req.url}`);
  
  // Normalize url path
  let safeUrl = req.url.split('?')[0];
  if (safeUrl === '/') {
    safeUrl = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safeUrl);
  
  // Prevent directory traversal attacks
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Access Denied');
    return;
  }

  // Read file and serve
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain');
        res.end('404 Not Found');
      } else {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
        res.end(`Server Error: ${err.code}`);
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.end(data);
  });
}

// Function to print local IP addresses for convenience
function printLocalIpAddresses(port, isHttps) {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const protocol = isHttps ? 'https' : 'http';

  console.log(`\n======================================================`);
  console.log(`QRShare Server is active!`);
  console.log(`Local Access:  ${protocol}://localhost:${port}`);
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-ipv4 and internal loopback addresses
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`Network Scan:  ${protocol}://${net.address}:${port}`);
      }
    }
  }
  console.log(`======================================================\n`);
}

// Check for SSL credentials
const sslKeyPath = path.join(__dirname, 'key.pem');
const sslCertPath = path.join(__dirname, 'cert.pem');

let hasSsl = false;
let sslOptions = {};

try {
  if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
    sslOptions = {
      key: fs.readFileSync(sslKeyPath),
      cert: fs.readFileSync(sslCertPath)
    };
    hasSsl = true;
  }
} catch (err) {
  console.warn("Failed checking for SSL certificates, falling back to HTTP:", err.message);
}

if (hasSsl) {
  // Launch secure HTTPS server (needed for mobile camera permissions)
  const httpsServer = https.createServer(sslOptions, requestHandler);
  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    printLocalIpAddresses(HTTPS_PORT, true);
    console.log("Serving securely over HTTPS. Scan from mobile devices is supported.");
  });

  // Redirect HTTP to HTTPS
  http.createServer((req, res) => {
    res.writeHead(301, { "Location": "https://" + req.headers['host'].replace(HTTP_PORT, HTTPS_PORT) + req.url });
    res.end();
  }).listen(HTTP_PORT);
} else {
  // Launch normal HTTP server
  const httpServer = http.createServer(requestHandler);
  httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    printLocalIpAddresses(HTTP_PORT, false);
    console.log(`WARNING: Camera access requires HTTPS on mobile devices.`);
    console.log(`Generate a self-signed SSL cert in this folder (key.pem & cert.pem) to enable HTTPS.`);
    console.log(`Run the following command to generate it:`);
    console.log(`  openssl req -subj '/CN=localhost' -x509 -newkey rsa:4000 -nodes -keyout key.pem -out cert.pem -days 365`);
  });
}
