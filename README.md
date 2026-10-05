# Kaamzo — Local Work & Worker Hiring Platform

Kaamzo connects customers with trusted local workers (electricians, plumbers, masons, painters, cleaners, carpenters, and more) across India, featuring Video KYC verification, instant booking, worker dashboards, and an Admin review portal.

---

## 🚀 Quick Start (Local Development)

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run locally**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

3. **Build for production**:
   ```bash
   npm run build
   ```

---

## ⚡ Vercel Deployment Guide

### Option 1: Deploy with Vercel CLI
```bash
npm install -g vercel
vercel
```

### Option 2: Deploy via GitHub & Vercel Dashboard
1. Push this repository to GitHub.
2. Import the repository in [Vercel Dashboard](https://vercel.com/new).
3. Under **Project Settings → Environment Variables**, add your Firebase keys:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
4. Click **Deploy**. Vercel will automatically build the project with `npm run build` and publish the `dist` directory.

---

## 🔥 Firebase Configuration & Firestore Rules

### 1. Enable Firebase Authentication
1. Go to **Firebase Console → Authentication → Sign-in method**.
2. Enable **Google** (for Google SSO sign-in).
3. Enable **Phone** (for real SMS OTP verification).

### 2. Configure Cloud Firestore Rules
1. Go to **Firebase Console → Firestore Database → Rules**.
2. Paste the contents of [`firestore.rules`](./firestore.rules) and click **Publish**.

---

## 🔑 Admin Portal Access
- **Keyboard Shortcut**: Press `Ctrl + 4` (or `Cmd + 4` on macOS) on any page to open the Secret Admin KYC Portal.
- **Alternative**: Click the **Admin Gateway** link in the footer.
