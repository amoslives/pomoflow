# Hosting Pomodoro Focus on a Cloudflare Subdomain via GitHub

This guide walks you step-by-step through deploying this Pomodoro Focus applet to a custom subdomain of your main domain on Cloudflare (e.g. `pomo.yourdomain.com` or `focus.yourdomain.com`), synchronized with your GitHub repository and backed by Cloudflare KV for cross-device task sync.

---

## 🏗️ Architecture Overview

```text
[ GitHub Repository ]
        │  (git push / CI/CD)
        ▼
[ Cloudflare Pages ] ─── Built with Vite (`dist`)
        │
   ┌────┴──────────────────────────┐
   ▼                               ▼
[ Edge Static CDN ]        [ Pages Functions ]
(pomo.yourdomain.com)      (/api/tasks)
                                   │
                                   ▼
                         [ Cloudflare KV Namespace ]
                                (TASKS_KV)
                                   │
                        (Syncs tasks across all computers!)
```

---

## 📋 Prerequisites

1. Your main domain (e.g. `yourdomain.com`) is already active in your Cloudflare account.
2. A GitHub account with a repository for this project.

---

## Step 1: Push Your Code to GitHub

If you haven't already pushed this project to a GitHub repository:

1. Create a new repository on [GitHub](https://github.com/new) (e.g. `pomodoro-focus`).
2. In your local terminal, initialize and push your codebase:

```bash
git init
git add .
git commit -m "Initial commit of Pomodoro Focus applet"
git branch -M main
git remote add origin https://github.com/<your-username>/pomodoro-focus.git
git push -u origin main
```

---

## Step 2: Create a Cloudflare KV Namespace for Tasks

Cloudflare KV stores and replicates your synced tasks across Cloudflare's global edge network.

1. Log into your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left navigation sidebar, navigate to **Storage & Databases** > **KV**.
3. Click **Create Namespace**.
4. Enter the Namespace Name:
   ```text
   TASKS_KV
   ```
5. Click **Add**.

---

## Step 3: Create the Cloudflare Pages Project

1. In the Cloudflare Dashboard left sidebar, navigate to **Workers & Pages**.
2. Click **Create application** > select the **Pages** tab > click **Connect to Git**.
3. Authorize GitHub (if not already done) and select your `pomodoro-focus` repository.
4. Click **Begin setup**.
5. Configure the build settings:
   - **Project name**: `pomodoro-focus` (or your preferred name)
   - **Production branch**: `main`
   - **Framework preset**: `Vite`
   - **Build command**:
     ```bash
     npm run build
     ```
   - **Build output directory**:
     ```text
     dist
     ```
   - **Root directory**: `/` (leave empty)
6. Expand **Environment variables** (optional, recommended for build consistency):
   - Variable name: `NODE_VERSION`
   - Value: `20`
7. Click **Save and Deploy**. Cloudflare Pages will build and deploy your static site.

---

## Step 4: Bind the KV Namespace to Pages Functions

This connects the serverless API function at `/functions/api/tasks.ts` to your `TASKS_KV` database.

1. In your Cloudflare Dashboard, go to **Workers & Pages** > select your `pomodoro-focus` Pages project.
2. Click on the **Settings** tab.
3. In the sub-navigation on the left, click **Functions**.
4. Scroll down to **KV namespace bindings** and click **Add binding**:
   - **Variable name**: `TASKS_KV` *(must be exact)*
   - **KV namespace**: Select the `TASKS_KV` namespace you created in Step 2.
5. If prompted, repeat for both **Production** and **Preview** environments.
6. Click **Save**.
7. *(Important)* Go to the **Deployments** tab, click the three dots (`...`) on your latest deployment, and click **Retry deployment** (or push a new commit to `main`). This binds the KV variable to the live Pages function.

---

## Step 5: Add Your Custom Subdomain

Since your primary domain is already managed on Cloudflare, DNS configuration is automatic.

1. In your Pages project, click on the **Custom domains** tab.
2. Click **Set up a custom domain**.
3. Enter your desired subdomain:
   ```text
   pomo.yourdomain.com
   ```
   *(or `focus.yourdomain.com`, `timer.yourdomain.com`, etc.)*
4. Click **Continue**.
5. Cloudflare will automatically detect your zone and display the DNS record to be created (a `CNAME` pointing to `pomodoro-focus.pages.dev` with orange cloud proxy enabled).
6. Click **Activate domain**.
7. Cloudflare will automatically provision a free SSL/TLS certificate. Within 1–2 minutes, your status will turn green (**Active**).

---

## Step 6: Verify and Test Cross-Computer Sync

1. Visit your new subdomain: `https://pomo.yourdomain.com`.
2. Look at the **Tasks** section:
   - Click the **`[Cloudflare Sync]`** button in the header.
   - Click **Generate Random Key** (or enter a custom passphrase like `focus-work`).
   - Click **Copy Link** (e.g. `https://pomo.yourdomain.com/?sync=focus-work`).
3. Add a few tasks on your first computer.
4. On your second computer or phone:
   - Paste the link: `https://pomo.yourdomain.com/?sync=focus-work`.
   - Your tasks will immediately load from Cloudflare KV!
5. Whenever you check off, edit, or add a task on either device, changes sync automatically across Cloudflare's global edge.

---

## 🔄 Ongoing Updates & CI/CD Workflow

Because Cloudflare Pages is connected directly to your GitHub repository:

- Any code changes you make locally can simply be committed and pushed:
  ```bash
  git add .
  git commit -m "Update feature"
  git push
  ```
- Cloudflare Pages will automatically trigger a new build and deploy the update live to `pomo.yourdomain.com` in seconds.

---

## 🛠️ Troubleshooting & FAQ

### 1. `TASKS_KV not found` warning in network response
- Verify that under **Project Settings** > **Functions** > **KV namespace bindings**, the variable name is uppercase: `TASKS_KV`.
- After adding a binding, trigger a redeployment from the **Deployments** tab.

### 2. YouTube audio doesn't start automatically
- Modern mobile and desktop browsers (Chrome/Safari) require at least one user click/tap on the page before playing audio. Clicking the **Play** button on the bottom player starts playback immediately.

### 3. How to backup or export tasks
- You can query your tasks directly via curl or browser at:
  ```bash
  curl "https://pomo.yourdomain.com/api/tasks?key=YOUR_SYNC_KEY"
  ```
