# ⚡ Deploying QRShare using the Vercel Web Dashboard

Deploying QRShare to Vercel via their web-based dashboard is extremely simple. Vercel automatically manages secure HTTPS (SSL) certificates for all deployments. This satisfies the browser's security requirements for mobile camera access (`getUserMedia`) instantly and with zero configuration.

Here are the two easiest ways to deploy QRShare using Vercel's web interface:

---

## 💻 Method 1: Import GitHub Repository (Recommended)
Since we have already pushed your local code to your GitHub repository ([beingprogrammed/qrshare](https://github.com/beingprogrammed/qrshare)), you can link it directly in Vercel's web app. This enables automatic updates: whenever you push new changes to GitHub, Vercel will rebuild and update your site.

1. **Open the Vercel Dashboard:**
   Go to [vercel.com](https://vercel.com) and log in.
2. **Import the Project:**
   - Click the **Add New...** button in the top right corner and select **Project**.
   - Under the **Import Git Repository** list, find your `qrshare` repository and click **Import**.
3. **Configure the Project Settings:**
   - Vercel will auto-detect the project layout.
   - Since we configured a [vercel.json](file:///home/walker/qrshare/vercel.json) file in the root of the repository, Vercel will automatically read it and route all web requests directly to the `public/` directory.
   - You can leave all fields (Build Command, Output Directory) at their default settings.
4. **Deploy:**
   - Click the **Deploy** button.
   - Within 30 seconds, Vercel will create your deployment and provide you with a live secure URL (e.g., `https://qrshare.vercel.app`).

---

## 📂 Method 2: Instant Folder Drag & Drop (No Git Required)
If you want to deploy a quick clone without linking it to Git, you can upload the folder directly using Vercel's visual web dashboard.

1. **Prepare the Upload Folder:**
   Locate your project directory on your computer. We will only upload the [public/](file:///home/walker/qrshare/public/) folder. This contains the browser code ([index.html](file:///home/walker/qrshare/public/index.html), [style.css](file:///home/walker/qrshare/public/style.css), [app.js](file:///home/walker/qrshare/public/app.js), and the libraries) and places it directly at the root level of your website.
2. **Navigate to the Drag & Drop Deployer:**
   Go to [vercel.com/new](https://vercel.com/new) in your web browser.
3. **Upload the Folder:**
   - Scroll down to the bottom of the page to find the section: **"Deploy a static site by dragging & dropping a folder."**
   - Drag the **`public`** folder from your file manager and drop it onto the upload area.
4. **Deploy:**
   - Vercel will upload the files and instantly publish the site!
   - This bypasses the need for the [vercel.json](file:///home/walker/qrshare/vercel.json) configuration, as the HTML/CSS/JS files are already uploaded at the top root directory level.

---

## ⚙️ How Vercel Routes Your Request
If you deploy using **Method 1 (GitHub Import)**, Vercel will read the [vercel.json](file:///home/walker/qrshare/vercel.json) in the project root:

```json
{
  "version": 2,
  "cleanUrls": true,
  "rewrites": [
    { "source": "/(.*)", "destination": "/public/$1" }
  ]
}
```
This tells Vercel's servers to map all request traffic entering your site's root domain into the `public/` subfolder, keeping the URL paths clean (e.g. mapping `https://your-domain.vercel.app/app.js` to serve [public/app.js](file:///home/walker/qrshare/public/app.js)).

---

## 📱 Using the Deployed Site on Mobile Devices
Once your deployment is live on Vercel:
1. Open the Vercel-provided URL (e.g. `https://qrshare-yourname.vercel.app`) on both your host computer and your phone.
2. Select a file on your computer to generate the QR code sequence.
3. Tap **Access Camera** on your phone.
4. Allow browser camera permissions when prompted.
5. Point the phone camera at the screen to scan the animation sequence. Your phone will download the reassembled file as soon as the progress bar reaches 100%!

