# ✨ Yoselin's Cleaning Service

A full-stack Next.js web app with Firebase Gmail login, Firestore database, and real-time chat.

---

## 🚀 Setup Guide

### Step 1 — Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Add project"** → name it `yoselin-cleaning` → click through
3. Once created, click **"Web"** icon (`</>`) to register a web app
4. Name it anything (e.g. `yoselin-web`) and click **Register app**
5. Copy the `firebaseConfig` values — you'll need them next

---

### Step 2 — Enable Google Sign-In

1. In Firebase Console → **Authentication** → **Sign-in method**
2. Click **Google** → toggle **Enable** → add your support email → Save

---

### Step 3 — Create Firestore Database

1. In Firebase Console → **Firestore Database** → **Create database**
2. Choose **Start in test mode** for now → pick a region → Done
3. Go to **Rules** tab → replace everything with the contents of `firestore.rules` → Publish

---

### Step 4 — Set Up Environment Variables

1. Copy `.env.local.example` to `.env.local`:
   ```
   cp .env.local.example .env.local
   ```
2. Fill in your Firebase values from Step 1:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
   NEXT_PUBLIC_FIREBASE_APP_ID=1:123:web:abc
   NEXT_PUBLIC_ADMIN_EMAIL=pgyb41494@gmail.com
   ```

---

### Step 5 — Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

### Step 6 — Deploy to Vercel

1. Push this folder to a **new GitHub repo**
2. Go to [vercel.com](https://vercel.com) → Import that repo
3. **Before deploying**, go to **Environment Variables** in Vercel and add all the same variables from your `.env.local` file
4. Click **Deploy** ✅

> ⚠️ Never commit `.env.local` — it's already in `.gitignore`

---

## 📁 Project Structure

```
yoselin-cleaning/
├── app/
│   ├── page.js          ← Login (Gmail sign-in)
│   ├── admin/page.js    ← Admin dashboard (pgyb41494@gmail.com only)
│   ├── booking/page.js  ← 5-step booking form for customers
│   └── dashboard/page.js ← Customer portal (their requests + chat)
├── components/
│   └── ChatPanel.js     ← Real-time chat (used by both admin and customer)
├── lib/
│   └── firebase.js      ← Firebase config + helpers
├── firestore.rules      ← Security rules for Firestore
├── .env.local.example   ← Template for your secrets
└── .gitignore
```

---

## 🔐 How Login Works

| Who | How |
|-----|-----|
| **Admin** | Sign in with `pgyb41494@gmail.com` via Google → goes to `/admin` |
| **Customers** | Sign in with any Gmail → goes to `/dashboard` |

---

## 💬 Chat

- Real-time messages stored in Firestore (`chats/{requestId}/messages`)
- Admin opens chat from the request detail modal
- Customers open chat from their dashboard
- Both sides update instantly without refreshing
