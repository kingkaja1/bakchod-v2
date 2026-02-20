# Fix 400 & "Missing or insufficient permissions" Errors

## 1. Enable Email/Password Authentication (fixes 400)

1. Go to [Firebase Console](https://console.firebase.google.com) → your project **bakchod-75967**
2. **Build** → **Authentication** → **Sign-in method**
3. Click **Email/Password**
4. Turn **Enable** ON
5. Click **Save**

> **Note:** If you're getting 400 on sign-in, you may need to **Sign up** first (create an account) before signing in.

---

## 2. Set Firestore Rules for bakchod-db (fixes "Missing or insufficient permissions")

You have a **named database** (`bakchod-db`). Rules must be set for that database:

1. Go to **Build** → **Firestore Database**
2. In the top bar, open the **database dropdown** and select **bakchod-db** (not "default")
3. Click the **Rules** tab
4. Replace the rules with the contents of `firestore.rules` in this project, or copy:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == userId;
      allow update: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/contacts/{contactId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /profiles/{profileId} {
      allow read, write: if request.auth != null && request.auth.uid == profileId;
    }
    match /chats/{chatId} {
      allow read, update, delete: if request.auth != null && (
        ('participants' in resource.data && request.auth.uid in resource.data.participants) ||
        ('participantIds' in resource.data && request.auth.uid in resource.data.participantIds) ||
        ('ownerId' in resource.data && resource.data.ownerId == request.auth.uid)
      );
      allow create: if request.auth != null && (
        ('participants' in request.resource.data && request.auth.uid in request.resource.data.participants) ||
        ('participantIds' in request.resource.data && request.auth.uid in request.resource.data.participantIds) ||
        ('ownerId' in request.resource.data && request.resource.data.ownerId == request.auth.uid)
      );
    }
    match /chats/{chatId}/messages/{messageId} {
      allow read, create: if request.auth != null && (
        ('participants' in get(/databases/$(database)/documents/chats/$(chatId)).data && request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.participants) ||
        ('participantIds' in get(/databases/$(database)/documents/chats/$(chatId)).data && request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.participantIds) ||
        ('ownerId' in get(/databases/$(database)/documents/chats/$(chatId)).data && get(/databases/$(database)/documents/chats/$(chatId)).data.ownerId == request.auth.uid)
      );
    }
    match /invites/{inviteId} {
      allow read, create: if request.auth != null;
      allow update: if request.auth != null;
    }
  }
}
```

5. Click **Publish**

---

## 3. Create Firestore Index (for chat list)

1. Still in **Firestore** with **bakchod-db** selected
2. Go to **Indexes** tab
3. Click **Create index**
4. Collection ID: `chats`
5. Add fields:
   - `participants` → Ascending
   - `lastMessageAt` → Descending
6. Click **Create**

---

## Quick checklist

- [ ] Email/Password auth enabled
- [ ] Firestore rules published for **bakchod-db**
- [ ] Composite index created for `chats`
- [ ] Use **Sign up** first if you don't have an account yet
