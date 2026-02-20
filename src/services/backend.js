import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  onSnapshot,
  setDoc,
  writeBatch,
  deleteDoc,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { auth, db, storage, functions } from './firebaseClient';

export async function logout() {
  return signOut(auth);
}

export async function ensureProfile(input) {
  const refDoc = doc(db, 'profiles', input.userId);
  const existing = await getDoc(refDoc);
  if (existing.exists()) {
    const existingData = existing.data();
    if (input.phoneNormalized && existingData.phoneNormalized !== input.phoneNormalized) {
      await updateDoc(refDoc, {
        phoneNormalized: input.phoneNormalized,
        updatedAt: serverTimestamp(),
      });
    }
    return { $id: existing.id, ...existing.data() };
  }
  await setDoc(refDoc, {
    userId: input.userId,
    displayName: input.displayName,
    preferredLanguage: input.preferredLanguage,
    avatarUrl: input.avatarUrl || '',
    phoneNormalized: input.phoneNormalized || '',
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  const created = await getDoc(refDoc);
  return { $id: created.id, ...created.data() };
}

export function subscribeCurrentUser(uid, callback) {
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback({ $id: snap.id, ...snap.data() });
  });
}

export async function updateUserProfileCallable(input) {
  try {
    const fn = httpsCallable(functions, 'updateUserProfile');
    const result = await fn(input);
    return result?.data || {};
  } catch {
    return {};
  }
}

export async function syncContactsCallable(contacts, options = {}) {
  try {
    const fn = httpsCallable(functions, 'syncContacts');
    const result = await fn({
      contacts,
      replace: !!options.replace,
      source: options.source || 'web',
    });
    return result?.data || { contacts: [] };
  } catch {
    return { contacts: [] };
  }
}

export async function blockUserCallable(targetUserId) {
  try {
    const fn = httpsCallable(functions, 'blockUser');
    const result = await fn({ targetUserId });
    return result?.data || {};
  } catch (err) {
    throw err;
  }
}

export async function unblockUserCallable(targetUserId) {
  try {
    const fn = httpsCallable(functions, 'unblockUser');
    const result = await fn({ targetUserId });
    return result?.data || {};
  } catch (err) {
    throw err;
  }
}

export async function createRoom(params) {
  const { name, ownerId, participantIds, participantData } = params;
  const uniqueIds = [...new Set([ownerId, ...(participantIds || [])])];
  const created = await addDoc(collection(db, 'chats'), {
    ownerId,
    name,
    isRoom: true,
    type: 'room',
    participantIds: uniqueIds,
    participantData: participantData || {},
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  const snap = await getDoc(doc(db, 'chats', created.id));
  return { $id: snap.id, ...snap.data() };
}

export async function getOrCreateChat(params) {
  if (!params.isRoom && !params.externalId.startsWith('r-')) {
    const participantIds = [params.userId, params.externalId].sort();
    const chatId = `direct_${participantIds[0]}_${participantIds[1]}`;
    const chatRef = doc(db, 'chats', chatId);
    const participantData = {
      [params.userId]: { displayName: params.currentUserDisplayName || 'Unknown' },
      [params.externalId]: { displayName: params.name || 'Unknown' },
    };
    await setDoc(
      chatRef,
      {
        ownerId: params.userId,
        externalId: params.externalId,
        name: params.name,
        isRoom: false,
        type: 'direct',
        participantIds,
        participantData,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
    const snap = await getDoc(chatRef);
    return { $id: snap.id, ...snap.data() };
  }

  const existing = await getDocs(
    query(
      collection(db, 'chats'),
      where('ownerId', '==', params.userId),
      where('externalId', '==', params.externalId),
      limit(1)
    )
  );
  if (!existing.empty) return { $id: existing.docs[0].id, ...existing.docs[0].data() };

  const created = await addDoc(collection(db, 'chats'), {
    ownerId: params.userId,
    externalId: params.externalId,
    name: params.name,
    isRoom: params.isRoom,
    type: params.isRoom ? 'room' : 'local',
    participantIds: [params.userId],
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return { $id: created.id, ownerId: params.userId, externalId: params.externalId, name: params.name, isRoom: params.isRoom };
}

export function subscribeMessages(chatId, callback) {
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(200)
  );
  return onSnapshot(q, (snapshot) => {
    callback({
      documents: snapshot.docs.map((docSnap) => ({
        $id: docSnap.id,
        ...docSnap.data(),
      })),
    });
  });
}

export async function createMessage(input) {
  const chatRef = doc(db, 'chats', input.chatId);
  const chatSnap = await getDoc(chatRef);
  const chatData = chatSnap.exists() ? chatSnap.data() : {};
  const participantIds = chatData.participantIds || [];
  const existingUnread = chatData.unreadCounts || {};

  const batch = writeBatch(db);
  const messagesRef = collection(db, 'chats', input.chatId, 'messages');
  const messageRef = doc(messagesRef);
  const msgData = {
    senderId: input.userId,
    userId: input.userId,
    role: input.role,
    content: input.content,
    language: input.language,
    type: input.type,
    imageUrl: input.imageUrl || null,
    senderDisplayName: input.senderDisplayName || null,
    createdAt: serverTimestamp(),
  };
  if (input.replyTo) {
    msgData.replyTo = input.replyTo;
  }
  batch.set(messageRef, msgData);
  const updateData = {
    lastMessage: input.content,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.lastSenderDisplayName) {
    updateData.lastSender = input.userId;
    updateData.lastSenderDisplayName = input.lastSenderDisplayName;
  }
  // Bump unread count for all participants except sender
  participantIds.forEach((uid) => {
    if (uid && uid !== input.userId) {
      updateData[`unreadCounts.${uid}`] = (existingUnread[uid] ?? 0) + 1;
    }
  });
  batch.update(chatRef, updateData);
  await batch.commit();
}

/** Upload a file (image, video, or doc) for a chat message. Returns the download URL. */
export async function uploadChatFile(chatId, userId, file) {
  const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const path = `chatMedia/${chatId}/${userId}_${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' });
  return getDownloadURL(storageRef);
}

/** Delete a single message. Only the sender or chat participants can delete. */
export async function deleteMessage(chatId, messageId) {
  const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
  await deleteDoc(msgRef);
}

/** Clear all messages in a chat. Leaves the chat doc intact. */
export async function clearChat(chatId) {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const snapshot = await getDocs(query(messagesRef, limit(500)));
  const batchSize = 500;
  if (snapshot.empty) return;
  let batch = writeBatch(db);
  let count = 0;
  for (const docSnap of snapshot.docs) {
    batch.delete(docSnap.ref);
    count++;
    if (count === batchSize) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
  const chatRef = doc(db, 'chats', chatId);
  const chatSnap = await getDoc(chatRef);
  const chatData = chatSnap.exists() ? chatSnap.data() : {};
  const participantIds = chatData.participantIds || [];
  const unreadCounts = {};
  participantIds.forEach((uid) => {
    if (uid) unreadCounts[uid] = 0;
  });
  await updateDoc(chatRef, {
    lastMessage: null,
    lastMessageAt: null,
    lastSender: null,
    lastSenderDisplayName: null,
    unreadCounts,
    updatedAt: serverTimestamp(),
  });
}

/** Mark a chat as read for a user (reset unread count). */
export async function markChatRead(chatId, userId) {
  const chatRef = doc(db, 'chats', chatId);
  const snap = await getDoc(chatRef);
  if (!snap.exists()) return;
  const data = snap.data();
  const unreadCounts = { ...(data.unreadCounts || {}) };
  unreadCounts[userId] = 0;
  await updateDoc(chatRef, {
    unreadCounts,
    updatedAt: serverTimestamp(),
  });
}

export async function addMessageReaction(chatId, messageId, userId, emoji) {
  const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
  const snap = await getDoc(msgRef);
  if (!snap.exists()) return;
  const reactions = { ...(snap.data().reactions || {}) };
  if (emoji) {
    reactions[userId] = emoji;
  } else {
    delete reactions[userId];
  }
  await updateDoc(msgRef, { reactions });
}

export async function setTyping(chatId, userId, displayName, isTyping) {
  const typingRef = doc(db, 'chats', chatId, 'typing', userId);
  if (isTyping) {
    await setDoc(typingRef, { displayName, at: serverTimestamp() }, { merge: true });
  } else {
    try {
      await deleteDoc(typingRef);
    } catch {
      // doc may not exist
    }
  }
}

export function subscribeTyping(chatId, callback) {
  const typingRef = collection(db, 'chats', chatId, 'typing');
  return onSnapshot(typingRef, (snapshot) => {
    const now = Date.now();
    const typers = snapshot.docs
      .map((d) => ({ userId: d.id, ...d.data() }))
      .filter((t) => t.userId && t.at && (now - (t.at?.toMillis?.() || 0)) < 5000);
    callback(typers);
  });
}

export async function createInvite(input) {
  return addDoc(collection(db, 'invites'), {
    inviterUserId: input.inviterUserId,
    targetType: input.targetType,
    targetValue: input.targetValue,
    note: input.note || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
}

export async function listInvitesForUser(userId) {
  const snapshot = await getDocs(
    query(
      collection(db, 'invites'),
      where('targetType', '==', 'userId'),
      where('targetValue', '==', userId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
      limit(100)
    )
  );
  return {
    documents: snapshot.docs.map((docSnap) => ({
      $id: docSnap.id,
      ...docSnap.data(),
    })),
  };
}

export async function updateInviteStatus(inviteId, status) {
  return updateDoc(doc(db, 'invites', inviteId), { status });
}

export function subscribeInvites(userId, callback) {
  if (!userId || !db) {
    callback({ docs: [] });
    return () => {};
  }
  const q = query(
    collection(db, 'invites'),
    where('targetType', '==', 'userId'),
    where('targetValue', '==', userId),
    limit(100)
  );
  return onSnapshot(q, callback);
}

export async function generateRoastWithFunction(context) {
  try {
    const fn = httpsCallable(functions, 'generateRoast');
    const result = await fn({ context });
    return result?.data || {};
  } catch {
    return {};
  }
}

export function subscribeToUserChats(userId, callback) {
  if (!userId || !db) {
    callback([]);
    return () => {};
  }
  try {
    const chatsRef = collection(db, 'chats');
    const q = query(
      chatsRef,
      where('participantIds', 'array-contains', userId),
      limit(100)
    );
    return onSnapshot(q, (snapshot) => {
    const chats = snapshot.docs.map((docSnap) => ({
      $id: docSnap.id,
      ...docSnap.data(),
    }));
    chats.sort((a, b) => {
      const aTime = a.updatedAt?.toMillis?.() || a.lastMessageAt?.toMillis?.() || 0;
      const bTime = b.updatedAt?.toMillis?.() || b.lastMessageAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
    callback(chats);
  });
  } catch (err) {
    console.warn('subscribeToUserChats failed:', err);
    callback([]);
    return () => {};
  }
}

export async function addContactToBackend(userId, contact) {
  const contactRef = doc(db, 'users', userId, 'contacts', contact.id);
  await setDoc(
    contactRef,
    {
      name: contact.name,
      matchedUserId: contact.id,
      isOnApp: true,
    },
    { merge: true }
  );
}

export async function searchUsersByDisplayName(searchTerm, currentUserId) {
  if (!searchTerm || !searchTerm.trim()) return [];
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);
  const term = searchTerm.toLowerCase();
  return snapshot.docs
    .filter((docSnap) => docSnap.id !== currentUserId)
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter(
      (u) =>
        u.displayName?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term)
    );
}
