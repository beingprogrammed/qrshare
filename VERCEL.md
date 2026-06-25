# ⚡ Deploying QRShare to Vercel

Deploying QRShare to Vercel is a highly recommended deployment strategy. Because Vercel automatically provisions and manages Let's Encrypt secure SSL certificates (HTTPS) for all deployments out-of-the-box, **you do not need to generate self-signed certificates or deal with browser security warning exemptions**. 

Once deployed, you can access the application on your mobile devices securely via `https://your-project.vercel.app` and scan immediately.

---

## 🔍 Vercel Routing Configuration

To make deployment seamless, a [vercel.json](file:///home/walker/qrshare/vercel.json) file has been configured in the project root:

```json
{
  "version": 2,
  "cleanUrls": true,
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/public/$1"
    }
  ]
}
```

This configuration intercepts incoming root domain requests and rewrites them into the `public/` directory (e.g. mapping `https://your-domain.vercel.app/app.js` to serve [public/app.js](file:///home/walker/qrshare/public/app.js) automatically). This keeps your deployed URLs clean and lets you keep the local web server scripts in the root directory.

---

## 🚀 Deployment Methods

Choose one of the two standard deployment methods below:

### Method 1: Git Integration (Recommended)
This is the easiest way to deploy. Any time you push changes to your Git repository, Vercel will automatically redeploy the site.

1. **Initialize Git Repository locally:**
   ```bash
   cd qrshare
   git init
   git add .
   git commit -m "Initial commit of QRShare"
   ```
2. **Push to GitHub / GitLab / Bitbucket:**
   Create a new repository on your Git platform of choice, add it as a remote, and push your code:
   ```bash
   git remote add origin https://github.com/yourusername/qrshare.git
   git branch -M main
   git push -u origin main
   ```
3. **Import to Vercel:**
   - Log in to your [Vercel Dashboard](https://vercel.com/dashboard).
   - Click **Add New** ➔ **Project**.
   - Import your Git repository.
   - In the **Configure Project** window, you can leave the defaults since [vercel.json](file:///home/walker/qrshare/vercel.json) handles folder mapping automatically.
   - Click **Deploy**.

---

### Method 2: Vercel CLI (Command Line)
If you prefer not to use Git, you can deploy directly from your local terminal using the Vercel Command Line Interface.

1. **Install Vercel CLI globally:**
   ```bash
   npm install -g vercel
   ```
2. **Authenticate with Vercel:**
   ```bash
   vercel login
   ```
3. **Trigger Deployment:**
   From the root of your `qrshare` folder, run:
   ```bash
   vercel
   ```
   - **Set Up and Deploy?** Yes
   - **Which scope?** (Select your account)
   - **Link to existing project?** No
   - **Project Name:** `qrshare`
   - **In which directory is your code located?** `./` (Press enter)
   - **Want to override settings?** No (The CLI will automatically read [vercel.json](file:///home/walker/qrshare/vercel.json))
4. **Deploy to Production:**
   Once the preview deployment completes, push it to production:
   ```bash
   vercel --prod
   ```

---

## ⚙️ Alternative: Config via Dashboard Settings

If you prefer to deploy without using the [vercel.json](file:///home/walker/qrshare/vercel.json) rewrite file, you can delete `vercel.json` and configure the subdirectory directly in the Vercel Dashboard:

1. Go to your Vercel Project ➔ **Settings** ➔ **General**.
2. Locate the **Root Directory** setting.
3. Set the Root Directory value to `public`.
4. Click **Save** and redeploy. 
*(This instructs Vercel to treat the `public/` directory as the build root, ignoring the server scripts in the parent directory).*

---

## 📱 Mobile Scanning & Camera Permissions

Once your deployment is live on Vercel:
1. Open the Vercel-provided URL (e.g. `https://qrshare.vercel.app`) on both the sending and receiving devices.
2. Select a file on the sender device.
3. Click **Access Camera** on the receiving device.
4. Accept the browser permission prompt to allow camera access.
5. The scanning viewport will open and you can begin transferring files!
