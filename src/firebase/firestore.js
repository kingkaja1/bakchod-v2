import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from './config';

// Create or get existing chat between two users
export async function getOrCreateChat(currentUserId, currentUserData, otherUserId, otherUserData) {
  const chatsRef = collection(db, 'chats');
  const q = query(
    chatsRef,
    where('participants', 'array-contains', currentUserId)
  );
  const snapshot = await getDocs(q);
  
  const existingChat = snapshot.docs.find((docSnap) => {
    const data = docSnap.data();
    return data.participants.includes(otherUserId) && data.participants.length === 2;
  });

  if (existingChat) {
    return { id: existingChat.id, ...existingChat.data() };
  }

  const now = serverTimestamp();
  const chatRef = await addDoc(chatsRef, {
    participants: [currentUserId, otherUserId],
    participantData: {
      [currentUserId]: currentUserData,
      [otherUserId]: otherUserData,
    },
    lastMessage: null,
    lastMessageAt: now,
    createdAt: now,
  });

  return {
    id: chatRef.id,
    participants: [currentUserId, otherUserId],
    participantData: {
      [currentUserId]: currentUserData,
      [otherUserId]: otherUserData,
    },
  };
}

// Subscribe to user's chats (real-time)
export function subscribeToChats(userId, callback) {
  const chatsRef = collection(db, 'chats');
  const q = query(
    chatsRef,
    where('participants', 'array-contains', userId),
    orderBy('lastMessageAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const chats = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    callback(chats);
  });
}

// Subscribe to messages in a chat (real-time)
export function subscribeToMessages(chatId, callback) {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    callback(messages);
  });
}

// Send a message
export async function sendMessage(chatId, senderId, text) {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const chatRef = doc(db, 'chats', chatId);

  const batch = writeBatch(db);

  const messageRef = doc(messagesRef);
  batch.set(messageRef, {
    text,
    senderId,
    createdAt: serverTimestamp(),
  });

  batch.update(chatRef, {
    lastMessage: { text, senderId },
    lastMessageAt: serverTimestamp(),
  });

  await batch.commit();
}

// Search users by display name or email
export async function searchUsers(searchTerm, currentUserId) {
  if (!searchTerm || !searchTerm.trim()) return [];

  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);

  const term = searchTerm.toLowerCase();
  const users = snapshot.docs
    .filter((docSnap) => docSnap.id !== currentUserId)
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter(
      (u) =>
        (u.displayName?.toLowerCase().includes(term) ||
          u.email?.toLowerCase().includes(term))
    );

  return users;
}
