#!/bin/bash
# Script to generate self-signed SSL certificates for local HTTPS server

set -e

echo "=========================================================="
echo "Generating self-signed SSL certificate for QRShare..."
echo "=========================================================="

if [ -f "key.pem" ] && [ -f "cert.pem" ]; then
    echo "SSL certificates already exist (key.pem & cert.pem)."
    read -p "Do you want to overwrite them? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted. Keeping existing certificates."
        exit 0
    fi
fi

# Run OpenSSL command to create private key and certificate
# Uses /CN=localhost which is the standard name for local certificates
openssl req -subj '/CN=localhost' -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365

echo ""
echo "=========================================================="
echo "SUCCESS: Certificate files created!"
echo "- Private Key: key.pem"
echo "- Certificate: cert.pem"
echo ""
echo "Now start the server using either:"
echo "- Node.js: npm start  (or node server.js)"
echo "- Python:  python3 server.py"
echo ""
echo "Both servers will automatically detect the certificates"
echo "and run securely over HTTPS."
echo "=========================================================="
