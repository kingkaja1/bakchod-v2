/**
 * Firebase Cloud Messaging (FCM) for push notifications.
 *
 * Setup:
 * 1. Add VITE_FIREBASE_VAPID_KEY to .env (Firebase Console > Project Settings > Cloud Messaging > Web Push certificates)
 * 2. Create public/firebase-messaging-sw.js (see Firebase docs)
 * 3. Deploy Cloud Functions to send notifications on new messages/calls
 *
 * This module registers the FCM token with the user doc so Cloud Functions can target them.
 */

import { getApp } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export async function registerForPushNotifications(userId: string): Promise<boolean> {
  if (!VAPID_KEY || !userId) return false;
  try {
    const supported = await isSupported();
    if (!supported) return false;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;
    const messaging = getMessaging(getApp());
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) return false;
    await updateDoc(doc(db, 'users', userId), {
      fcmToken: token,
      fcmTokenUpdatedAt: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    console.warn('FCM registration failed:', err);
    return false;
  }
}

export function isPushSupported(): boolean {
  return typeof Notification !== 'undefined' && !!VAPID_KEY;
}
