# Firebase Setup Guide

Follow these steps to connect Bakchod to Firebase.

## 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Add project** (or use an existing project)
3. Follow the setup wizard

## 2. Enable Authentication

1. In Firebase Console, go to **Build** → **Authentication**
2. Click **Get started**
3. Under **Sign-in method**, enable **Email/Password**

## 3. Create Firestore Database

1. Go to **Build** → **Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** (for development) or **Production mode**
4. Select a location

## 4. Get Your Config

1. Go to **Project settings** (gear icon)
2. Under **Your apps**, click the web icon `</>` to add a web app
3. Register your app (e.g. "Bakchod")
4. Copy the `firebaseConfig` object

## 5. Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your Firebase config in `.env`:
   ```
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
   VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
   ```

## 6. Deploy Firestore Rules & Indexes

1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Initialize: `firebase init` (select Firestore)
4. Deploy rules: `firebase deploy --only firestore`

Or manually in the console:
- **Firestore** → **Rules** → paste contents of `firestore.rules`
- **Firestore** → **Indexes** → create composite index:
  - Collection: `chats`
  - Fields: `participants` (Ascending), `lastMessageAt` (Descending)

## 7. Run the App

```bash
npm run dev
```

Open http://localhost:5173, sign up with an email/password, and start messaging!
