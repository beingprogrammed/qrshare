#!/usr/bin/env python3
import http.server
import socketserver
import os
import socket
import ssl

HTTP_PORT = 8080
HTTPS_PORT = 8443
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public')

class QRShareHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Override path resolution to serve files out of the 'public/' subdirectory
        # without changing the server's working directory.
        path = super().translate_path(path)
        rel_path = os.path.relpath(path, os.getcwd())
        return os.path.join(PUBLIC_DIR, rel_path)

    def log_message(self, format, *args):
        # Custom logging format
        print(f"[Request] {self.address_string()} - {format%args}")

def get_local_ips():
    # Helper to find IPv4 addresses on the network interfaces
    ips = []
    try:
        # Standard way to get host IP
        hostname = socket.gethostname()
        ips.append(socket.gethostbyname(hostname))
    except Exception:
        pass
    
    # Alternative socket trick to get outbound IP
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        outbound_ip = s.getsockname()[0]
        if outbound_ip not in ips:
            ips.append(outbound_ip)
        s.close()
    except Exception:
        pass
        
    return [ip for ip in ips if ip and ip != "127.0.0.1"]

def print_local_urls(port, is_https):
    protocol = "https" if is_https else "http"
    print("\n======================================================")
    print("QRShare Server (Python) is active!")
    print(f"Local Access:  {protocol}://localhost:{port}")
    
    for ip in get_local_ips():
        print(f"Network Scan:  {protocol}://{ip}:{port}")
    print("======================================================\n")

def run():
    ssl_key = os.path.join(os.path.dirname(__file__), 'key.pem')
    ssl_cert = os.path.join(os.path.dirname(__file__), 'cert.pem')
    
    has_ssl = os.path.exists(ssl_key) and os.path.exists(ssl_cert)
    
    handler = QRShareHTTPRequestHandler
    
    # Add mapping for .js files to ensure correct MIME type is served (sometimes Windows registers it wrong)
    handler.extensions_map.update({
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
    })

    if has_ssl:
        port = HTTPS_PORT
        print_local_urls(port, True)
        print("Serving securely over HTTPS. Scan from mobile devices is supported.")
        
        # In Python 3.7+, we use SSLContext for creating secure sockets
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=ssl_cert, keyfile=ssl_key)
        
        with socketserver.TCPServer(("0.0.0.0", port), handler) as httpd:
            httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\nServer stopped.")
    else:
        port = HTTP_PORT
        print_local_urls(port, False)
        print("WARNING: Camera access requires HTTPS on mobile devices.")
        print("Generate a self-signed SSL cert in this folder (key.pem & cert.pem) to enable HTTPS.")
        print("Run the following command to generate it:")
        print(f"  openssl req -subj '/CN=localhost' -x509 -newkey rsa:4000 -nodes -keyout key.pem -out cert.pem -days 365")
        
        with socketserver.TCPServer(("0.0.0.0", port), handler) as httpd:
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\nServer stopped.")

if __name__ == '__main__':
    run()
