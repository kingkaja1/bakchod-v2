
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Layout from './components/Layout';
import StoryBar from './components/StoryBar';
import { MOCK_ROOMS } from './constants';
import { generateRoast } from './services/geminiService';
import { auth, db, functions } from './services/firebaseClient';
import { httpsCallable } from 'firebase/functions';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import {
  ensureProfile,
  getOrCreateChat,
  subscribeMessages,
  subscribeToUserChats,
  createMessage,
  logout,
  createInvite,
  listInvitesForUser,
  updateInviteStatus,
  subscribeInvites,
  syncContactsCallable,
  updateUserProfileCallable,
  blockUserCallable,
  unblockUserCallable,
  searchUsersByDisplayName,
  addContactToBackend,
} from './services/backend';
import { User, ActiveRoom, Message } from './types';
import { useUserContext } from './contexts/UserContext';
import { useAuth } from './context/AuthContext';

type TabType = 'party' | 'hotline' | 'bot' | 'me';
type CallMode = 'audio' | 'video' | null;
type AuthStatus = 'checking' | 'authed' | 'unauth';

interface CallHistoryItem {
  id: string;
  name: string;
  avatar: string;
  type: CallMode;
  timestamp: string;
  isMissed: boolean;
  contactId: string;
}

type InviteModalProps = {
  isOpen: boolean;
  inviteTargetType: 'userId' | 'phone';
  setInviteTargetType: (value: 'userId' | 'phone') => void;
  inviteTargetValue: string;
  setInviteTargetValue: (value: string) => void;
  inviteNote: string;
  setInviteNote: (value: string) => void;
  inviteError: string | null;
  inviteStatus: 'idle' | 'sending' | 'sent' | 'error';
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
};

const InviteModal: React.FC<InviteModalProps> = ({
  isOpen,
  inviteTargetType,
  setInviteTargetType,
  inviteTargetValue,
  setInviteTargetValue,
  inviteNote,
  setInviteNote,
  inviteError,
  inviteStatus,
  onClose,
  onSubmit,
}) => {
  if (!isOpen) return null;
  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-md glass-card rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-party text-accent-red uppercase tracking-widest">Invite a Bakchod</h3>
          <button onClick={onClose} className="text-accent-red">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-500">Invite By</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setInviteTargetType('userId')}
                className={`py-2 rounded-xl text-[10px] font-party uppercase tracking-widest border ${
                  inviteTargetType === 'userId'
                    ? 'bg-accent-red/20 border-accent-red text-accent-red'
                    : 'bg-white/5 border-white/10 text-gray-400'
                }`}
              >
                User ID
              </button>
              <button
                type="button"
                onClick={() => setInviteTargetType('phone')}
                className={`py-2 rounded-xl text-[10px] font-party uppercase tracking-widest border ${
                  inviteTargetType === 'phone'
                    ? 'bg-accent-red/20 border-accent-red text-accent-red'
                    : 'bg-white/5 border-white/10 text-gray-400'
                }`}
              >
                Phone
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-500">
              {inviteTargetType === 'userId' ? 'User ID' : 'Mobile Number'}
            </label>
            <input
              value={inviteTargetValue}
              onChange={(e) => setInviteTargetValue(e.target.value)}
              placeholder={inviteTargetType === 'userId' ? 'e.g., 6987...a61c' : '+91 98765 43210'}
              className="w-full bg-accent-red/5 border border-accent-red/30 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent-red/30"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-500">Note (optional)</label>
            <input
              value={inviteNote}
              onChange={(e) => setInviteNote(e.target.value)}
              placeholder="Join the tribe!"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent-red/30"
            />
          </div>

          {inviteError && <div className="text-[10px] text-vibrant-pink uppercase tracking-widest">{inviteError}</div>}
          {inviteStatus === 'sent' && <div className="text-[10px] text-green-500 uppercase tracking-widest">Invite sent!</div>}

          <button
            type="submit"
            disabled={inviteStatus === 'sending'}
            className="w-full py-3 bg-accent-red text-white font-party text-xs uppercase tracking-[0.2em] rounded-2xl shadow-[0_10px_30px_rgba(255,0,60,0.3)] active:scale-95 transition-all disabled:opacity-50"
          >
            {inviteStatus === 'sending' ? 'Sending...' : 'Send Invite'}
          </button>
        </form>
      </div>
    </div>
  );
};

type ContactInviteModalProps = {
  contact: User | null;
  onClose: () => void;
  onRefresh: () => void;
  onSendSms: () => void;
  onSendWhatsApp: () => void;
};

const ContactInviteModal: React.FC<ContactInviteModalProps> = ({
  contact,
  onClose,
  onRefresh,
  onSendSms,
  onSendWhatsApp,
}) => {
  if (!contact) return null;
  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-md glass-card rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-party text-accent-red uppercase tracking-widest">Contact Not On Bakchod</h3>
          <button onClick={onClose} className="text-accent-red">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <p className="text-xs text-white/80 mb-1">{contact.name}</p>
        <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-5">{contact.phone || 'No mobile number'}</p>
        <p className="text-[11px] text-white/70 mb-5">Send signup link now. After they sign up, tap refresh. Chat/video will unlock only after user is matched.</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onSendSms} className="py-3 bg-accent-red text-white text-[10px] font-bold uppercase rounded-xl">
            Send SMS
          </button>
          <button onClick={onSendWhatsApp} className="py-3 bg-green-600 text-white text-[10px] font-bold uppercase rounded-xl">
            Send WhatsApp
          </button>
          <button onClick={onRefresh} className="py-3 bg-white/10 text-white text-[10px] font-bold uppercase rounded-xl">
            Refresh Status
          </button>
          <button onClick={onClose} className="col-span-2 py-3 bg-white/5 text-gray-300 text-[10px] font-bold uppercase rounded-xl border border-white/10">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Expanded emoji list with "sexy", party, and classic vibes
const QUICK_EMOJIS = [
  "🔥", "😂", "💀", "🌶️", "🥃", "🙌", "💯", "🤡", 
  "🫦", "💋", "💃", "🕺", "🥂", "🍹", "🍺", "🍾", 
  "🍒", "🍓", "🍑", "🍆", "💦", "👅", "💄", "👠", 
  "🕶️", "✨", "🌟", "🔞", "⛓️", "😈", "🖤", "❤️‍🔥", 
  "🤣", "🤩", "😍", "🥳", "😎", "🧐", "🙄", "🥵", 
  "🥶", "🤯", "🥺", "🤝", "🤙", "👊", "🧿", "🇮🇳"
];

const App: React.FC = () => {
  const { appUser } = useUserContext();
  // Navigation & UI States
  const [ecstasyMode, setEcstasyMode] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('party');
  const [activeChat, setActiveChat] = useState<{ id: string; name: string; avatar: string; isRoom: boolean } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingCategory, setActiveSettingCategory] = useState<string | null>(null);
  const [activeHistoryContactId, setActiveHistoryContactId] = useState<string | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteTargetType, setInviteTargetType] = useState<'userId' | 'phone'>('userId');
  const [inviteTargetValue, setInviteTargetValue] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [invites, setInvites] = useState<Array<any>>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [authEmail, setAuthEmail] = useState('');
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [authLanguage, setAuthLanguage] = useState('English');
  const [authError, setAuthError] = useState<string | null>(null);
  const [inviteMode, setInviteMode] = useState(false);
  const [emailOtpStatus, setEmailOtpStatus] = useState<'idle' | 'sending' | 'sent' | 'verifying' | 'error'>('idle');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+91');
  const [otpCode, setOtpCode] = useState('');
  const [otpStatus, setOtpStatus] = useState<'idle' | 'sending' | 'sent' | 'verifying' | 'error'>('idle');
  const [otpConfirmation, setOtpConfirmation] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [preferredLanguage, setPreferredLanguage] = useState('English');
  const [chatDocIds, setChatDocIds] = useState<Record<string, string>>({});
  const [contacts, setContacts] = useState<User[]>([]);
  const [pendingInviteContact, setPendingInviteContact] = useState<User | null>(null);
  const [contactImportStatus, setContactImportStatus] = useState<'idle' | 'importing' | 'error' | 'done'>('idle');
  const [contactImportError, setContactImportError] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactAvatar, setNewContactAvatar] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  
  // Dynamic Content State
  const [rooms, setRooms] = useState<ActiveRoom[]>(MOCK_ROOMS);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  
  // Call History State
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([
    { id: 'h1', name: 'RAHUL', avatar: 'https://picsum.photos/seed/rahul/200', type: 'video', timestamp: 'Yesterday, 11:45 PM', isMissed: false, contactId: '2' },
    { id: 'h2', name: 'PRIYA', avatar: 'https://picsum.photos/seed/priya/200', type: 'audio', timestamp: 'Today, 2:15 AM', isMissed: true, contactId: '3' },
    { id: 'h3', name: 'THE BOYS 🍻', avatar: 'https://picsum.photos/seed/boys/200', type: 'video', timestamp: '2 days ago', isMissed: false, contactId: 'r1' },
    { id: 'h4', name: 'RAHUL', avatar: 'https://picsum.photos/seed/rahul/200', type: 'audio', timestamp: 'Last Monday', isMissed: false, contactId: '2' },
  ]);

  // User Profile State
  const [userAvatar, setUserAvatar] = useState('https://picsum.photos/seed/me/200');
  const [displayName, setDisplayName] = useState('Bakchod King');
  
  // Chat History State
  const [chatMessages, setChatMessages] = useState<Record<string, Message[]>>({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  // Call States
  const [isCalling, setIsCalling] = useState(false);
  const [callMode, setCallMode] = useState<CallMode>(null);
  
  // Input & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [searchedUsers, setSearchedUsers] = useState<Array<{ id: string; displayName?: string; email?: string }>>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [recentChats, setRecentChats] = useState<Array<{ $id: string; name?: string; externalId?: string; participantIds?: string[]; isRoom?: boolean; updatedAt?: any; lastMessage?: string }>>([]);
  
  // Call Controls State
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [callEnded, setCallEnded] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const activeChatUnsubscribeRef = useRef<null | (() => void)>(null);

  // AI Content State
  const [currentRoast, setCurrentRoast] = useState("Type something to get roasted! 🌶️");
  const [isLoadingRoast, setIsLoadingRoast] = useState(false);
  const contactPickerSupported = typeof navigator !== 'undefined' && !!(navigator as any).contacts?.select;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isInvite = params.get('invite') === '1';
    setInviteMode(isInvite);
    if (isInvite) {
      setAuthMethod('phone');
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setContacts([]);
      return;
    }
    const loadContactsFromBackend = async () => {
      try {
        const snap = await getDocs(collection(db, 'users', currentUserId, 'contacts'));
        const mapped: User[] = snap.docs.map((d) => {
          const data = d.data() as {
            name?: string;
            phone?: string;
            isOnApp?: boolean;
            matchedUserId?: string | null;
          };
          const name = String(data.name || 'CONTACT');
          const phone = String(data.phone || '');
          const matchedUserId = data.matchedUserId || null;
          const id = matchedUserId || d.id;
          return {
            id,
            name,
            avatar: `https://picsum.photos/seed/${encodeURIComponent(phone || name)}/200`,
            status: 'online',
            phone: phone || undefined,
            onBakchod: !!data.isOnApp,
            appUserId: matchedUserId,
          };
        });
        setContacts(mapped);
      } catch {
        setContacts([]);
      }
    };
    void loadContactsFromBackend();
  }, [currentUserId]);

  useEffect(() => {
    const unresolved = contacts.filter(c => c.phone && typeof c.onBakchod !== 'boolean');
    if (unresolved.length === 0) return;
    let cancelled = false;
    const hydrate = async () => {
      const resolved = await Promise.all(
        unresolved.map(async (contact) => {
          const status = await lookupBakchodUserByPhone(contact.phone);
          return { contactId: contact.id, onBakchod: status.onBakchod, appUserId: status.appUserId };
        })
      );
      if (cancelled) return;
      setContacts(prev => prev.map((c) => {
        const match = resolved.find(r => r.contactId === c.id);
        return match ? { ...c, onBakchod: match.onBakchod, appUserId: match.appUserId } : c;
      }));
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [contacts]);

  const { user: authUser, logout: authLogout } = useAuth();
  // Auth bootstrap - use our AuthContext user
  useEffect(() => {
    if (!authUser?.uid) return;
    let mounted = true;
    const init = async () => {
      try {
        const profile = await ensureProfile({
          userId: authUser.uid,
          displayName: authUser.displayName || "Bakchod King",
          preferredLanguage: "English",
          avatarUrl: userAvatar,
          phoneNormalized: "",
        });
        await updateUserProfileCallable({
          displayName: profile.displayName || authUser.displayName || "Bakchod King",
          photoURL: userAvatar,
          language: profile.preferredLanguage || "English",
        }).catch(() => undefined);
        if (!mounted) return;
        setCurrentUserId(authUser.uid);
        setDisplayName(profile.displayName || authUser.displayName || "Bakchod King");
        setPreferredLanguage(profile.preferredLanguage || "English");
        setAuthStatus('authed');
      } catch {
        if (!mounted) return;
        setAuthStatus('authed');
        setCurrentUserId(authUser.uid);
        setDisplayName(authUser.displayName || "Bakchod King");
      }
    };
    init();
    return () => { mounted = false; };
  }, [authUser?.uid]);

  // Load invites and subscribe for realtime updates
  useEffect(() => {
    if (authStatus !== 'authed' || !currentUserId) return;
    fetchInvites();
    const unsubscribe = subscribeInvites(() => {
      fetchInvites();
    });
    return () => {
      try {
        unsubscribe();
      } catch {
        // ignore
      }
    };
  }, [authStatus, currentUserId]);

  // Subscribe to user's chats (recent conversations)
  useEffect(() => {
    if (!currentUserId) {
      setRecentChats([]);
      return;
    }
    const unsubscribe = subscribeToUserChats(currentUserId, (chats) => {
      setRecentChats(chats.filter((c) => !c.isRoom));
    });
    return () => unsubscribe();
  }, [currentUserId]);

  // Search registered users by display name (Party tab)
  useEffect(() => {
    if (activeTab !== 'party' || !currentUserId) {
      setSearchedUsers([]);
      return;
    }
    if (!searchQuery.trim()) {
      setSearchedUsers([]);
      return;
    }
    const timer = setTimeout(async () => {
      setUserSearchLoading(true);
      try {
        const results = await searchUsersByDisplayName(searchQuery, currentUserId);
        setSearchedUsers(results);
      } catch {
        setSearchedUsers([]);
      } finally {
        setUserSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, activeTab, currentUserId]);

  useEffect(() => {
    if (!appUser) return;
    if (appUser.displayName) setDisplayName(appUser.displayName);
    if (typeof appUser.language === "string" && appUser.language) {
      setPreferredLanguage(appUser.language);
    }
    if (typeof appUser.photoURL === "string" && appUser.photoURL) {
      setUserAvatar(appUser.photoURL);
    }
  }, [appUser]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, activeChat]);

  // Handle Camera Stream
  useEffect(() => {
    async function startCamera() {
      if (isCalling && callMode === 'video' && !isCameraOff) {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user' }, 
            audio: true 
          });
          setStream(newStream);
          if (videoRef.current) {
            videoRef.current.srcObject = newStream;
          }
        } catch (err) {
          console.error("Camera access error:", err);
          setIsCameraOff(true);
        }
      } else {
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
          setStream(null);
        }
      }
    }
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isCalling, callMode, isCameraOff]);

  // Sync video element
  useEffect(() => {
    if (videoRef.current && stream && isCalling && callMode === 'video') {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isCalling, callMode]);

  // Filter Logic
  const filteredRooms = useMemo(() => {
    if (activeTab !== 'party') return rooms;
    return rooms.filter(room => 
      room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.lastSender.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, activeTab, rooms]);

  const filteredCalls = useMemo(() => {
    if (activeTab !== 'hotline') return callHistory;
    return callHistory.filter(call => 
      call.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, activeTab, callHistory]);

  const storyBarUsers = useMemo(() => {
    const fromChats: User[] = recentChats.map((chat) => {
      const otherId = chat.participantIds?.find((p) => p !== currentUserId) || chat.externalId || '';
      const otherDisplayName = chat.participantData?.[otherId]?.displayName || chat.name || 'Unknown';
      return {
        id: otherId,
        name: otherDisplayName.toUpperCase(),
        avatar: `https://picsum.photos/seed/${encodeURIComponent(otherId)}/200`,
        status: 'online' as const,
        onBakchod: true,
        appUserId: otherId,
      };
    });
    const chatIds = new Set(fromChats.map((u) => u.id));
    const fromContacts = contacts.filter((c) => !chatIds.has(c.id) && !chatIds.has(c.appUserId || ''));
    return [...fromChats, ...fromContacts];
  }, [recentChats, contacts, currentUserId]);

  // AI Interaction
  const handleBotAction = async (topic: string) => {
    if (isLoadingRoast || !topic.trim()) return;
    setIsLoadingRoast(true);
    const roast = await generateRoast(topic);
    setCurrentRoast(roast);
    setIsLoadingRoast(false);
  };

  const handleLogout = async () => {
    try {
      await logout();
      authLogout();
    } finally {
      setAuthStatus('unauth');
      setCurrentUserId(null);
      setContacts([]);
      setChatMessages({});
      setChatDocIds({});
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) return;
    setInviteError(null);
    if (!inviteTargetValue.trim()) {
      setInviteError('Please enter a user ID or phone number.');
      return;
    }
    if (inviteTargetType === 'phone' && !/^[0-9+()\\-\\s]{6,20}$/.test(inviteTargetValue)) {
      setInviteError('Enter a valid phone number.');
      return;
    }
    setInviteStatus('sending');
    try {
      await createInvite({
        inviterUserId: currentUserId,
        targetType: inviteTargetType,
        targetValue: inviteTargetValue.trim(),
        note: inviteNote.trim(),
      });
      setInviteStatus('sent');
      setInviteTargetValue('');
      setInviteNote('');
    } catch (err: any) {
      setInviteStatus('error');
      setInviteError(err?.message || 'Invite failed.');
    }
  };

  const fetchInvites = async () => {
    if (!currentUserId) return;
    setInvitesLoading(true);
    setInvitesError(null);
    try {
      const list = await listInvitesForUser(currentUserId);
      setInvites(list.documents || []);
    } catch (err: any) {
      setInvitesError(err?.message || 'Failed to load invites.');
    } finally {
      setInvitesLoading(false);
    }
  };

  const handleInviteDecision = async (inviteId: string, status: 'accepted' | 'declined') => {
    try {
      await updateInviteStatus(inviteId, status);
      setInvites(prev => prev.filter(invite => invite.$id !== inviteId));
    } catch (err: any) {
      setInvitesError(err?.message || 'Failed to update invite.');
    }
  };

  const handleBlockActiveChat = async () => {
    if (!activeChat || activeChat.isRoom || !currentUserId) return;
    if (!window.confirm(`Block ${activeChat.name}?`)) return;
    try {
      await blockUserCallable(activeChat.id);
      window.alert(`${activeChat.name} blocked.`);
    } catch (err: any) {
      window.alert(err?.message || "Failed to block user.");
    }
  };

  const handleUnblockActiveChat = async () => {
    if (!activeChat || activeChat.isRoom || !currentUserId) return;
    try {
      await unblockUserCallable(activeChat.id);
      window.alert(`${activeChat.name} unblocked.`);
    } catch (err: any) {
      window.alert(err?.message || "Failed to unblock user.");
    }
  };

  const loadChatFromBackend = async (chatId: string, name: string, isRoom: boolean) => {
    if (!currentUserId) return;
    const chatDoc = await getOrCreateChat({
      userId: currentUserId,
      externalId: chatId,
      name,
      isRoom,
      currentUserDisplayName: displayName,
    });
    setChatDocIds(prev => ({ ...prev, [chatId]: chatDoc.$id }));

    if (activeChatUnsubscribeRef.current) {
      activeChatUnsubscribeRef.current();
      activeChatUnsubscribeRef.current = null;
    }

    const toDate = (value: any) => {
      if (!value) return new Date();
      if (typeof value?.toDate === "function") return value.toDate();
      if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
      return new Date(value);
    };
    activeChatUnsubscribeRef.current = subscribeMessages(chatDoc.$id, (payload) => {
      const mapped: Message[] = payload.documents.map((doc: any) => ({
        id: doc.$id,
        senderId: doc.senderId || doc.userId,
        senderName: doc.role === 'bot' ? 'ECSTASY BOT' : displayName,
        text: doc.content,
        timestamp: toDate(doc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: doc.type || 'text',
        imageUrl: doc.imageUrl || undefined,
      }));
      setChatMessages(prev => ({ ...prev, [chatId]: mapped }));
    });
  };

  useEffect(() => {
    if (activeChat) return;
    if (activeChatUnsubscribeRef.current) {
      activeChatUnsubscribeRef.current();
      activeChatUnsubscribeRef.current = null;
    }
  }, [activeChat]);

  useEffect(() => () => {
    if (activeChatUnsubscribeRef.current) {
      activeChatUnsubscribeRef.current();
      activeChatUnsubscribeRef.current = null;
    }
  }, []);

  const handleSendMessage = async (text: string, type: 'text' | 'image' | 'roast' = 'text') => {
    if (!text.trim() || !activeChat) return;
    const selectedContact = contacts.find((c) => c.id === activeChat.id || c.appUserId === activeChat.id);
    if (
      !activeChat.isRoom &&
      (activeChat.id.startsWith('phone:') ||
        activeChat.id.startsWith('c-') ||
        (selectedContact && !selectedContact.onBakchod))
    ) {
      window.alert('This contact is not linked to a Bakchod user yet. Use Refresh Status after signup.');
      return;
    }
    if (!activeChat.isRoom) {
      const peerUid = selectedContact?.appUserId || activeChat.id;
      if (!peerUid || peerUid === currentUserId) {
        window.alert('Cannot send: invalid recipient mapping. Refresh contact status and try again.');
        return;
      }
      try {
        const peerSnap = await getDoc(doc(db, 'users', peerUid));
        if (!peerSnap.exists()) {
          window.alert('Recipient account not fully ready yet. Ask friend to login once, then tap Refresh Status.');
          return;
        }
      } catch {
        window.alert('Could not validate recipient. Please try again.');
        return;
      }
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      senderId: currentUserId || 'local',
      senderName: displayName || 'YOU',
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: type
    };

    setChatMessages(prev => ({
      ...prev,
      [activeChat.id]: [...(prev[activeChat.id] || []), userMsg]
    }));

    if (currentUserId) {
      try {
        const existingChatId = chatDocIds[activeChat.id];
        const chatDoc = existingChatId
          ? { $id: existingChatId }
          : await getOrCreateChat({
              userId: currentUserId,
              externalId: activeChat.id,
              name: activeChat.name,
              isRoom: activeChat.isRoom,
              currentUserDisplayName: displayName,
            });
        if (!existingChatId) {
          setChatDocIds(prev => ({ ...prev, [activeChat.id]: chatDoc.$id }));
        }
        await createMessage({
          chatId: chatDoc.$id,
          userId: currentUserId,
          role: 'user',
          content: text,
          language: preferredLanguage,
          type,
        });
      } catch (err) {
        setChatMessages(prev => ({
          ...prev,
          [activeChat.id]: (prev[activeChat.id] || []).filter((m) => m.id !== userMsg.id),
        }));
        window.alert('Message not delivered. Please refresh contact status and retry.');
        console.error("Failed to persist message:", err);
        return;
      }
    }

    if (type === 'text') {
      handleBotAction(text);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUserAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleEcstasy = useCallback(() => {
    setEcstasyMode(!ecstasyMode);
    if (!ecstasyMode) handleBotAction("late night vibing hard");
  }, [ecstasyMode]);

  const toggleFlip = () => {
    setIsFlipped(prev => !prev);
  };

  const isContactSaved = (id: string) => contacts.some(contact => contact.id === id);

  const addContact = (user: User) => {
    setContacts(prev => (prev.some(contact => contact.id === user.id) ? prev : [user, ...prev]));
  };

  const addContactFromDetails = (contactId: string, name: string, avatar: string) => {
    if (contactId.startsWith('r-')) return;
    addContact({ id: contactId, name, avatar, status: 'online' });
  };

  const normalizeImportedPhone = (raw?: string) => {
    if (!raw) return '';
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
    if (raw.startsWith('+')) return raw;
    return `+${digits}`;
  };

  const phoneLookupVariants = (raw?: string) => {
    const variants = new Set<string>();
    const normalized = normalizeImportedPhone(raw);
    const digits = (raw || '').replace(/\D/g, '');
    const normalizedDigits = normalized.replace(/\D/g, '');
    if (normalized) variants.add(normalized);
    if (digits) variants.add(digits);
    if (normalizedDigits) variants.add(normalizedDigits);
    if (digits.length === 10) {
      variants.add(`+91${digits}`);
      variants.add(`91${digits}`);
    }
    if (digits.length === 12 && digits.startsWith('91')) {
      variants.add(`+${digits}`);
      variants.add(digits.slice(2));
    }
    return Array.from(variants);
  };

  const updateContactAvailability = (contactId: string, onBakchod: boolean, appUserId?: string | null) => {
    setContacts(prev =>
      prev.map(c => (c.id === contactId ? { ...c, onBakchod, appUserId: appUserId || null } : c))
    );
  };

  const lookupBakchodUserByPhone = async (phone?: string) => {
    const variants = phoneLookupVariants(phone);
    if (variants.length === 0) return { onBakchod: false as const, appUserId: null as string | null };

    for (const value of variants) {
      const userSnap = await getDocs(
        query(collection(db, 'users'), where('phoneNormalized', '==', value), limit(1))
      );
      if (!userSnap.empty) {
        return { onBakchod: true as const, appUserId: userSnap.docs[0].id };
      }
      const profileSnap = await getDocs(
        query(collection(db, 'profiles'), where('phoneNormalized', '==', value), limit(1))
      );
      if (!profileSnap.empty) {
        return { onBakchod: true as const, appUserId: profileSnap.docs[0].id };
      }
    }
    return { onBakchod: false as const, appUserId: null as string | null };
  };

  const resolveContactAvailability = async (contact: User) => {
    if (!contact.phone) {
      updateContactAvailability(contact.id, false, null);
      return { onBakchod: false, appUserId: null as string | null };
    }
    const result = await lookupBakchodUserByPhone(contact.phone);
    updateContactAvailability(contact.id, result.onBakchod, result.appUserId);
    return result;
  };

  const openInviteViaSms = (contact: User) => {
    const normalizedPhone = normalizeImportedPhone(contact.phone);
    if (!normalizedPhone) {
      window.alert('No mobile number found for this contact.');
      return;
    }
    const text = encodeURIComponent('Join me on Bakchod app: https://bakchod.web.app/?invite=1');
    const url = `sms:${normalizedPhone}?body=${text}`;
    window.location.href = url;
  };

  const openInviteViaWhatsApp = (contact: User) => {
    const normalizedPhone = normalizeImportedPhone(contact.phone);
    if (!normalizedPhone) {
      window.alert('No mobile number found for this contact.');
      return;
    }
    const digits = normalizedPhone.replace(/\D/g, '');
    if (!digits) {
      window.alert('Invalid phone number for WhatsApp invite.');
      return;
    }
    const text = encodeURIComponent('Join me on Bakchod app: https://bakchod.web.app/?invite=1');
    window.location.href = `https://wa.me/${digits}?text=${text}`;
  };

  const handleSelectContact = async (contact: User) => {
    if (contact.appUserId) {
      const target: User = { ...contact, id: contact.appUserId, onBakchod: true };
      setPendingInviteContact(null);
      selectChat(target, false);
      return;
    }
    const status = await resolveContactAvailability(contact);
    if (!status.onBakchod) {
      const inviteContact = { ...contact, onBakchod: false, appUserId: null };
      setPendingInviteContact(inviteContact);
      return;
    }
    setPendingInviteContact(null);
    const target: User = {
      ...contact,
      id: status.appUserId || contact.id,
      onBakchod: true,
      appUserId: status.appUserId || contact.id,
    };
    selectChat(target, false);
  };

  const importContactsFromDevice = async () => {
    setContactImportError(null);
    setContactImportStatus('importing');
    try {
      const nav = navigator as Navigator & {
        contacts?: {
          select: (properties: string[], options?: { multiple?: boolean }) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
        };
      };

      if (!nav.contacts?.select) {
        setContactImportStatus('error');
        setContactImportError('Direct contact picker is not supported in this browser. Open in Chrome Android over HTTPS, or use Add Contact in Settings.');
        setIsSettingsOpen(true);
        setActiveSettingCategory('Contacts');
        return;
      }

      const picked = await nav.contacts.select(['name', 'tel'], { multiple: true });
      const mapped = picked
        .map((item, idx) => {
          const name = item.name?.[0]?.trim() || `CONTACT ${idx + 1}`;
          const phone = normalizeImportedPhone(item.tel?.[0]);
          if (!phone) return null;
          return {
            id: `phone:${phone}`,
            name: name.toUpperCase(),
            avatar: `https://picsum.photos/seed/${encodeURIComponent(phone)}/200`,
            status: 'online' as const,
            phone,
          } as User;
        })
        .filter((v): v is User => !!v);

      const imported: User[] = await Promise.all(
        mapped.map(async (contact) => {
          const status = await lookupBakchodUserByPhone(contact.phone);
          return {
            ...contact,
            onBakchod: status.onBakchod,
            appUserId: status.appUserId,
            id: status.appUserId || contact.id,
          };
        })
      );

      if (imported.length === 0) {
        throw new Error('No valid contacts were selected.');
      }

      const syncResult = await syncContactsCallable(
        imported.map((c) => ({ name: c.name, phone: c.phone || "", externalId: c.id })),
        { replace: false, source: "web_picker" }
      ).catch(() => ({ contacts: [] as Array<{ phoneNormalized: string; matchedUserId: string | null }> }));

      const syncByPhone = new Map<string, string | null>();
      (syncResult.contacts || []).forEach((c: { phoneNormalized: string; matchedUserId: string | null }) => {
        syncByPhone.set(c.phoneNormalized, c.matchedUserId);
      });

      setContacts(prev => {
        const byId = new Map(prev.map(contact => [contact.id, contact]));
        imported.forEach(contact => {
          const matchedUserId = contact.phone ? (syncByPhone.get(contact.phone) || null) : null;
          const resolvedId = matchedUserId || contact.id;
          byId.set(resolvedId, { ...contact, id: resolvedId, appUserId: matchedUserId, onBakchod: !!matchedUserId });
        });
        return Array.from(byId.values());
      });
      setContactImportStatus('done');
    } catch (err: any) {
      setContactImportStatus('error');
      setContactImportError(err?.message || 'Failed to import contacts.');
    }
  };

  const handleAddContactManual = () => {
    const name = newContactName.trim();
    if (!name) return;
    const avatar = newContactAvatar.trim() || `https://picsum.photos/seed/${encodeURIComponent(name)}/200`;
    const id = `c-${Date.now()}`;
    const phone = normalizeImportedPhone(newContactPhone.trim());
    const next: User = { id, name, avatar, status: 'online', phone: phone || undefined };
    addContact(next);
    if (phone) {
      void syncContactsCallable(
        [{ name: next.name, phone: phone, externalId: next.id }],
        { replace: false, source: "web_manual" }
      ).catch(() => undefined);
      void resolveContactAvailability(next).then((status) => {
        if (!status.onBakchod) {
          setPendingInviteContact({ ...next, onBakchod: false, appUserId: null });
        }
      });
    }
    setNewContactName('');
    setNewContactAvatar('');
    setNewContactPhone('');
  };

  const handleSelectSearchedUser = async (u: { id: string; displayName?: string; email?: string }) => {
    const userAsContact: User = {
      id: u.id,
      name: (u.displayName || u.email || 'Unknown').toUpperCase(),
      avatar: `https://picsum.photos/seed/${encodeURIComponent(u.id)}/200`,
      status: 'online',
      onBakchod: true,
      appUserId: u.id,
    };
    setPendingInviteContact(null);
    addContact(userAsContact);
    if (currentUserId) {
      try {
        await addContactToBackend(currentUserId, { id: u.id, name: userAsContact.name });
      } catch {
        // ignore - contact still works locally
      }
    }
    selectChat(userAsContact, false);
  };

  const selectChat = (item: User | ActiveRoom, isRoom: boolean) => {
    setActiveChat({ id: item.id, name: item.name, avatar: item.avatar, isRoom });
    setIsCalling(false);
    setCallMode(null);
    setChatInput("");
    setShowEmojiPicker(false);
    if (currentUserId) {
      loadChatFromBackend(item.id, item.name, isRoom).catch(err => console.error("Load chat error:", err));
    } else if (!chatMessages[item.id]) {
      handleBotAction(`new chat with ${item.name}`);
    }
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim() || selectedMembers.length === 0) return;
    
    const newRoom: ActiveRoom = {
      id: `r-${Date.now()}`,
      name: newGroupName,
      membersCount: selectedMembers.length + 1,
      lastMessage: 'Tribe created! Let the bakchodi begin.',
      lastSender: 'YOU',
      isLive: false,
      avatar: `https://picsum.photos/seed/${newGroupName}/200`
    };

    setRooms([newRoom, ...rooms]);
    setIsCreatingGroup(false);
    setNewGroupName("");
    setSelectedMembers([]);
    selectChat(newRoom, true);
  };

  const toggleMemberSelection = (id: string) => {
    setSelectedMembers(prev => 
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const startCall = (mode: CallMode, contactOverride?: { id: string, name: string, avatar: string, isRoom: boolean }) => {
    const target = contactOverride || activeChat;
    if (!target) return;

    setIsCalling(true);
    setCallMode(mode);
    setIsCameraOff(mode === 'audio');
    
    // Add to history
    const newHistoryItem: CallHistoryItem = {
      id: `h-${Date.now()}`,
      name: target.name,
      avatar: target.avatar,
      type: mode,
      timestamp: 'Just now',
      isMissed: false,
      contactId: target.id
    };
    setCallHistory(prev => [newHistoryItem, ...prev]);

    if (!activeChat) {
      setActiveChat({ id: target.id, name: target.name, avatar: target.avatar, isRoom: target.isRoom });
    }
  };

  const handleEndCall = () => {
    setCallEnded(true);
    setIsCalling(false);
    setCallMode(null);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setTimeout(() => setCallEnded(false), 2000);
  };

  const SettingsItem: React.FC<{ icon: string; title: string; subtitle?: string; onClick: () => void; isLast?: boolean }> = ({ icon, title, subtitle, onClick, isLast }) => (
    <div onClick={onClick} className={`flex items-center gap-4 py-4 px-2 hover:bg-white/5 cursor-pointer transition-all active:scale-[0.98] ${!isLast ? 'border-b border-white/5' : ''}`}>
      <div className="size-10 rounded-full bg-accent-red/10 flex items-center justify-center text-accent-red">
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-white leading-tight">{title}</p>
        {subtitle && <p className="text-[10px] text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <span className="material-symbols-outlined text-gray-700">chevron_right</span>
    </div>
  );

  // InviteModal moved to top-level component to avoid remount on every render.

  const renderSettings = () => {
    if (activeSettingCategory) {
      if (activeSettingCategory === 'Invites') {
        return (
          <div className="flex-1 flex flex-col bg-night-black animate-in slide-in-from-right duration-300 h-full relative">
            <div className="flex items-center gap-4 p-4 border-b border-white/5 bg-night-panel/50">
              <button onClick={() => setActiveSettingCategory(null)} className="text-accent-red p-1 rounded-full hover:bg-accent-red/10">
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <h2 className="text-sm font-party text-white uppercase tracking-widest">Invites</h2>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto no-scrollbar">
              {invitesLoading && (
                <div className="text-[10px] uppercase tracking-widest text-gray-500">Loading invites...</div>
              )}
              {invitesError && (
                <div className="text-[10px] uppercase tracking-widest text-vibrant-pink">{invitesError}</div>
              )}
              {!invitesLoading && invites.length === 0 && (
                <div className="text-[10px] uppercase tracking-widest text-gray-500">No pending invites.</div>
              )}
              {invites.map((invite) => (
                <div key={invite.$id} className="p-4 bg-white/5 rounded-2xl border border-white/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-gray-500">Invite</p>
                      <p className="text-sm text-white font-bold mt-1">
                        From: {invite.inviterUserId}
                      </p>
                      {invite.note && <p className="text-[10px] text-gray-500 mt-2">"{invite.note}"</p>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleInviteDecision(invite.$id, 'accepted')}
                        className="px-3 py-2 bg-green-600 text-white text-[10px] font-bold uppercase rounded-full"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleInviteDecision(invite.$id, 'declined')}
                        className="px-3 py-2 bg-white/10 text-white text-[10px] font-bold uppercase rounded-full"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }
      if (activeSettingCategory === 'Contacts') {
        const searchTerm = contactSearch.toLowerCase();
        const filteredContacts = contacts.filter(contact =>
          contact.name.toLowerCase().includes(searchTerm) ||
          (contact.phone ? contact.phone.toLowerCase().includes(searchTerm) : false)
        );
        return (
          <div className="flex-1 flex flex-col bg-night-black animate-in slide-in-from-right duration-300 h-full relative">
            <div className="flex items-center gap-4 p-4 border-b border-white/5 bg-night-panel/50">
              <button onClick={() => setActiveSettingCategory(null)} className="text-accent-red p-1 rounded-full hover:bg-accent-red/10">
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <h2 className="text-sm font-party text-white uppercase tracking-widest">Contacts</h2>
            </div>

            <div className="p-6 space-y-4 border-b border-white/5">
              <div className="space-y-2">
                <p className="text-[10px] text-accent-red font-bold uppercase tracking-widest px-1">Add Contact</p>
                <input
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="Name"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[12px] text-white focus:outline-none focus:ring-2 focus:ring-accent-red/20 transition-all font-bold"
                />
                <input
                  value={newContactAvatar}
                  onChange={(e) => setNewContactAvatar(e.target.value)}
                  placeholder="Avatar URL (optional)"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[12px] text-white focus:outline-none focus:ring-2 focus:ring-accent-red/20 transition-all font-bold"
                />
                <input
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  placeholder="Mobile number (optional)"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[12px] text-white focus:outline-none focus:ring-2 focus:ring-accent-red/20 transition-all font-bold"
                />
                <button
                  onClick={handleAddContactManual}
                  disabled={!newContactName.trim()}
                  className="w-full py-3 bg-accent-red text-white font-party text-xs uppercase tracking-[0.2em] rounded-2xl shadow-[0_10px_30px_rgba(255,0,60,0.3)] disabled:opacity-30 disabled:grayscale transition-all active:scale-95"
                >
                  Add Contact
                </button>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] text-accent-red font-bold uppercase tracking-widest px-1">Search</p>
                <input
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Search contacts..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[12px] text-white focus:outline-none focus:ring-2 focus:ring-accent-red/20 transition-all font-bold"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-3">
              {filteredContacts.length === 0 ? (
                <div className="p-4 text-[10px] uppercase tracking-widest text-gray-500 bg-white/5 border border-white/10 rounded-xl">
                  {contacts.length === 0 ? 'No contacts yet. Add from a chat, call history, or the form above.' : 'No matches.'}
                </div>
              ) : (
                filteredContacts.map(contact => (
                  <div
                    key={contact.id}
                    onClick={() => { setActiveSettingCategory(null); setIsSettingsOpen(false); void handleSelectContact(contact); }}
                    className="flex items-center gap-3 p-3 rounded-xl border bg-white/5 border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
                  >
                    <div className="size-10 rounded-lg bg-cover border border-white/10" style={{ backgroundImage: `url(${contact.avatar})` }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-white truncate">{contact.name}</p>
                      <p className="text-[9px] text-gray-500 uppercase tracking-widest">
                        {contact.phone ? contact.phone : 'Saved Contact'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      }
      return (
        <div className="flex-1 flex flex-col bg-night-black animate-in slide-in-from-right duration-300 h-full relative">
          <div className="flex items-center gap-4 p-4 border-b border-white/5 bg-night-panel/50">
            <button onClick={() => setActiveSettingCategory(null)} className="text-accent-red p-1 rounded-full hover:bg-accent-red/10">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h2 className="text-sm font-party text-white uppercase tracking-widest">{activeSettingCategory}</h2>
          </div>
          <div className="p-6 space-y-6 overflow-y-auto no-scrollbar">
            <div className="space-y-4">
              <div className="p-4 bg-white/5 rounded-2xl border-2 border-accent-red">
                <p className="text-[10px] text-accent-red font-bold uppercase tracking-[0.2em] mb-3">Tweak Options</p>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white font-bold">Ghost Mode</p>
                      <p className="text-[10px] text-gray-500">Hide your 'Scene Set' status</p>
                    </div>
                    <div className="size-6 rounded-full border-2 border-accent-red flex items-center justify-center cursor-pointer"><div className="size-3 rounded-full bg-vibrant-pink shadow-[0_0_10px_#ff00a0]" /></div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white font-bold">Savage Tones</p>
                      <p className="text-[10px] text-gray-500">Custom alert sounds for roasts</p>
                    </div>
                    <div className="size-6 rounded-full border-2 border-gray-700 cursor-pointer" />
                  </div>
                </div>
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-3">Theme Selection</p>
                <div className="grid grid-cols-2 gap-3">
                  <button className="py-3 bg-accent-red/20 border-2 border-accent-red rounded-xl text-[10px] font-party text-accent-red">Neon Red</button>
                  <button className="py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-party text-white/40">Vibe Purple</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col bg-night-black animate-in fade-in duration-300 h-full relative">
        <div className="flex items-center gap-4 p-4 border-b border-white/5 bg-night-panel/50">
          <button onClick={() => setIsSettingsOpen(false)} className="text-accent-red p-1 rounded-full hover:bg-accent-red/10">
            <span className="material-symbols-outlined">close</span>
          </button>
          <h2 className="text-sm font-party text-white uppercase tracking-widest">Settings HQ</h2>
        </div>

        <div className="p-4 flex items-center gap-4 bg-accent-red/5 border-b border-white/5">
          <div className="size-16 rounded-full border-2 border-accent-red p-1">
            <img src={userAvatar} className="w-full h-full rounded-full object-cover" alt="avatar" />
          </div>
          <div>
            <p className="text-base font-bold text-white">{displayName}</p>
            <p className="text-[10px] text-accent-red font-bold uppercase tracking-widest">Level 99 Legend</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-2">
          <SettingsItem icon="person" title="Account & Privacy" subtitle="Security, Scene Set, Change Number" onClick={() => setActiveSettingCategory('Account')} />
          <SettingsItem icon="contacts" title="Contacts" subtitle="Saved legends list" onClick={() => setActiveSettingCategory('Contacts')} />
          <SettingsItem icon="chat" title="Chat Vibes" subtitle="Themes, Wallpapers, Chat History" onClick={() => setActiveSettingCategory('Chats')} />
          <SettingsItem icon="notifications" title="Hulla Gulla" subtitle="Message & Group tones" onClick={() => setActiveSettingCategory('Notifications')} />
          <SettingsItem icon="data_usage" title="Data & Daaru" subtitle="Network usage, Auto-download" onClick={() => setActiveSettingCategory('Data')} />
          <SettingsItem icon="help" title="Tribe Help" subtitle="Help center, Contact us, Terms" onClick={() => setActiveSettingCategory('Help')} />
          <SettingsItem icon="mark_unread_chat_alt" title="Invites" subtitle="Accept or decline requests" onClick={() => setActiveSettingCategory('Invites')} />
          <SettingsItem icon="group" title="Invite a Bakchod" onClick={() => { setIsInviteOpen(true); setInviteStatus('idle'); setInviteError(null); }} />
          <SettingsItem icon="logout" title="Logout" onClick={handleLogout} isLast={true} />
        </div>
        
        <div className="p-8 text-center opacity-30">
          <p className="text-[10px] font-party text-accent-red tracking-widest uppercase">from</p>
          <p className="text-xs font-party text-white tracking-widest uppercase mt-1">META BAKCHOD</p>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (isSettingsOpen) return renderSettings();

    if (isCreatingGroup) {
      return (
        <div className="flex-1 flex flex-col bg-night-black animate-in slide-in-from-right duration-300">
          <div className="flex items-center gap-3 p-4 border-b border-white/5">
            <button onClick={() => setIsCreatingGroup(false)} className="text-accent-red">
              <span className="material-symbols-outlined">close</span>
            </button>
            <h2 className="text-sm font-party text-white uppercase tracking-widest">Create New Tribe</h2>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <p className="text-[10px] text-accent-red font-bold uppercase tracking-widest px-1">Tribe Name</p>
              <input 
                autoFocus
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g., Friday Night Chaos 🍻"
                className="w-full bg-accent-red/5 border-2 border-accent-red rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent-red/20 transition-all font-bold"
              />
            </div>

            <div className="space-y-3">
              <p className="text-[10px] text-accent-red font-bold uppercase tracking-widest px-1">Select Legends ({selectedMembers.length})</p>
              <div className="grid grid-cols-1 gap-2 max-h-[400px] overflow-y-auto no-scrollbar pb-10">
                {contacts.length === 0 ? (
                  <div className="p-4 text-[10px] uppercase tracking-widest text-gray-500 bg-white/5 border border-white/10 rounded-xl">
                    No contacts yet. Add from a chat or call history.
                  </div>
                ) : (
                  contacts.map(user => (
                    <div 
                      key={user.id} 
                      onClick={() => toggleMemberSelection(user.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${selectedMembers.includes(user.id) ? 'bg-accent-red/10 border-accent-red' : 'bg-white/5 border-white/5'}`}
                    >
                      <div className="size-10 rounded-lg bg-cover border border-white/10" style={{ backgroundImage: `url(${user.avatar})` }} />
                      <p className="text-[12px] font-bold text-white flex-1">{user.name}</p>
                      <div className={`size-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedMembers.includes(user.id) ? 'bg-accent-red border-accent-red' : 'border-white/20'}`}>
                        {selectedMembers.includes(user.id) && <span className="material-symbols-outlined text-white text-[12px] font-bold">check</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-auto p-6 bg-night-black border-t border-white/5">
            <button 
              disabled={!newGroupName.trim() || selectedMembers.length === 0}
              onClick={handleCreateGroup}
              className="w-full py-4 bg-accent-red text-white font-party text-xs uppercase tracking-[0.2em] rounded-2xl shadow-[0_10px_30px_rgba(255,0,60,0.3)] disabled:opacity-30 disabled:grayscale transition-all active:scale-95"
            >
              Assemble Tribe
            </button>
          </div>
        </div>
      );
    }

    if (callEnded) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="size-12 rounded-full bg-accent-red/20 flex items-center justify-center mb-3 animate-pulse">
            <span className="material-symbols-outlined text-accent-red text-xl">call_end</span>
          </div>
          <h2 className="text-base font-party text-white">Vibe Ended</h2>
          <button onClick={() => setCallEnded(false)} className="mt-4 px-6 py-2 bg-accent-red text-white text-[10px] font-bold rounded-full uppercase tracking-widest shadow-lg active:scale-95 transition-all">Back to Party</button>
        </div>
      );
    }

    if (activeChat) {
      const messages = chatMessages[activeChat.id] || [];
      return (
        <div className="flex-1 flex flex-col h-full bg-night-black">
          {/* Contact Header */}
          <div className="flex items-center gap-2 p-3 border-b border-white/5 bg-night-panel/30">
            <button onClick={() => setActiveChat(null)} className="p-1 text-white/40 hover:text-white">
              <span className="material-symbols-outlined text-xl">chevron_left</span>
            </button>
            <div className="size-8 rounded-lg bg-center bg-cover border border-accent-red/20" style={{ backgroundImage: `url(${activeChat.avatar})` }} />
            <div className="flex-1 min-w-0">
              <h2 className="text-[12px] font-bold text-white truncate">{activeChat.name}</h2>
              <p className="text-[8px] text-accent-red uppercase font-bold tracking-tighter">
                {isCalling ? (callMode === 'video' ? 'Video Calling...' : 'Voice Calling...') : activeChat.isRoom ? `${activeChat.id.startsWith('r-') ? 'New ' : ''}Tribe Chat` : 'Active Now'}
              </p>
            </div>
            {!isCalling && (
              <div className="flex gap-2">
                <button onClick={() => startCall('audio')} className="size-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all"><span className="material-symbols-outlined text-lg">call</span></button>
                <button onClick={() => startCall('video')} className="size-8 rounded-full bg-accent-red/10 flex items-center justify-center text-accent-red hover:bg-accent-red hover:text-white transition-all"><span className="material-symbols-outlined text-lg">videocam</span></button>
              </div>
            )}
            {!activeChat.isRoom && !isContactSaved(activeChat.id) && (
              <button
                onClick={() => addContact({ id: activeChat.id, name: activeChat.name, avatar: activeChat.avatar, status: 'online' })}
                className="size-8 rounded-full bg-white/5 flex items-center justify-center text-accent-red hover:bg-accent-red hover:text-white transition-all"
                title="Add contact"
              >
                <span className="material-symbols-outlined text-lg">person_add</span>
              </button>
            )}
            {!activeChat.isRoom && (
              <>
                <button onClick={handleBlockActiveChat} className="p-1 text-white/30 hover:text-vibrant-pink" title="Block user">
                  <span className="material-symbols-outlined text-lg">block</span>
                </button>
                <button onClick={handleUnblockActiveChat} className="p-1 text-white/30 hover:text-accent-red" title="Unblock user">
                  <span className="material-symbols-outlined text-lg">person_remove</span>
                </button>
              </>
            )}
          </div>

          <div className="flex-1 p-3 overflow-y-auto no-scrollbar space-y-3 relative">
            {isCalling && callMode === 'video' ? (
              <div className="grid grid-cols-2 gap-2 mb-4 sticky top-0 z-20">
                <div className="aspect-[4/5] bg-night-panel rounded-lg overflow-hidden border border-white/5 relative">
                  <img src={activeChat.avatar} className="w-full h-full object-cover grayscale opacity-30" alt="remote" />
                  <div className="absolute bottom-1.5 left-1.5 px-1 bg-black/50 text-[8px] rounded uppercase">{activeChat.name}</div>
                </div>
                <div className="aspect-[4/5] bg-black rounded-lg overflow-hidden border border-accent-red/20 relative shadow-2xl">
                  {isCameraOff ? (
                    <div className="w-full h-full flex items-center justify-center bg-gray-900">
                      <span className="material-symbols-outlined text-gray-700 text-3xl">videocam_off</span>
                    </div>
                  ) : (
                    <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover transition-transform duration-300 ${isFlipped ? 'scale-x-[-1]' : ''}`} />
                  )}
                  <div className="absolute bottom-1.5 left-1.5 px-1 bg-accent-red text-[8px] rounded uppercase font-bold">You (Live)</div>
                </div>
              </div>
            ) : isCalling && callMode === 'audio' ? (
              <div className="flex flex-col items-center justify-center py-8 bg-accent-red/5 rounded-xl border border-accent-red/10 mb-4 sticky top-0 z-20">
                <div className="size-20 rounded-full border-2 border-accent-red p-1 animate-vibe mb-4">
                  <img src={activeChat.avatar} className="w-full h-full rounded-full object-cover shadow-[0_0_20px_rgba(255,0,60,0.4)]" alt="avatar" />
                </div>
                <p className="text-accent-red text-[10px] font-bold uppercase tracking-widest animate-pulse">{activeChat.isRoom ? 'Tribe Connected...' : 'Voice Connected...'}</p>
              </div>
            ) : null}

            {/* Chat Log */}
            <div className="space-y-4">
              {messages.length === 0 && !isCalling && (
                <div className="text-center py-10 opacity-20"><span className="material-symbols-outlined text-5xl mb-2">chat_bubble</span><p className="text-[10px] font-party uppercase">No messages yet. Say something!</p></div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.senderId === '1' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-[11px] leading-snug ${msg.senderId === '1' ? 'bg-accent-red text-white rounded-tr-none shadow-lg' : 'bg-white/5 text-white/80 rounded-tl-none border border-white/10'}`}>
                    {msg.text}
                  </div>
                  <span className="text-[8px] text-gray-600 mt-1 px-1">{msg.timestamp}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Sticky Roast Insight */}
            <div className="sticky bottom-0 pt-2 pointer-events-none">
                <div className="glass-card rounded-xl p-3 border-l-4 border-accent-red pointer-events-auto shadow-[0_-5px_30px_rgba(0,0,0,0.6)]">
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="material-symbols-outlined text-accent-red text-base">smart_toy</span>
                        <span className="text-accent-red text-[9px] font-bold uppercase tracking-wider">ECSTASY BOT BURN</span>
                        {isLoadingRoast && <div className="ml-auto flex gap-1"><div className="size-1 rounded-full bg-accent-red animate-bounce" /><div className="size-1 rounded-full bg-accent-red animate-bounce [animation-delay:0.2s]" /><div className="size-1 rounded-full bg-accent-red animate-bounce [animation-delay:0.4s]" /></div>}
                    </div>
                    <p className="text-white text-[11px] italic leading-tight">"{isLoadingRoast ? "Analyzing your bakchodi..." : currentRoast}"</p>
                </div>
            </div>
          </div>

          <div className="p-3 bg-night-black border-t border-white/5 space-y-2">
            {showEmojiPicker && (
              <div className="bg-night-panel border-2 border-accent-red rounded-2xl p-2 animate-in slide-in-from-bottom-2 shadow-[0_0_30px_rgba(255,0,60,0.4)]">
                <div className="grid grid-cols-8 gap-2 max-h-[180px] overflow-y-auto no-scrollbar">
                  {QUICK_EMOJIS.map(emoji => (
                    <button 
                      key={emoji} 
                      onClick={() => { handleSendMessage(emoji); }} 
                      className="text-2xl hover:scale-125 transition-transform active:scale-90 flex items-center justify-center aspect-square"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-white/5 flex justify-center">
                    <button onClick={() => setShowEmojiPicker(false)} className="text-[10px] text-accent-red font-bold uppercase tracking-widest">Close Picker</button>
                </div>
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(chatInput); setChatInput(""); }} className="flex items-center gap-2 bg-accent-red/5 border-2 border-accent-red rounded-xl px-3 h-11 group focus-within:ring-2 focus:ring-accent-red/30 transition-all">
              <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`text-accent-red/60 hover:text-accent-red transition-colors ${showEmojiPicker ? 'text-accent-red' : ''}`}>
                <span className="material-symbols-outlined text-xl">mood</span>
              </button>
              <input 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Say something savage..." 
                className="bg-transparent border-none focus:outline-none focus:ring-0 text-[12px] flex-1 text-white h-full p-0 placeholder:text-gray-500 font-bold" 
              />
              <button type="submit" disabled={!chatInput.trim()} className="text-accent-red disabled:opacity-30 hover:scale-110 active:scale-90 transition-transform drop-shadow-[0_0_5px_rgba(255,0,60,0.5)]">
                <span className="material-symbols-outlined text-2xl font-bold">send</span>
              </button>
            </form>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'party':
        return (
          <div className="flex flex-col">
            <div className="px-6 pb-2 flex justify-between items-center">
              <h3 className="text-[10px] font-party tracking-[0.2em] text-accent-red uppercase">Vibing Now</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsCreatingGroup(true)} className="flex items-center gap-1.5 px-3 py-1 bg-accent-red/10 border border-accent-red/20 rounded-full text-accent-red hover:bg-accent-red hover:text-white transition-all active:scale-95 group">
                  <span className="material-symbols-outlined text-sm font-bold">group_add</span>
                  <span className="text-[8px] font-black uppercase tracking-tighter">Create Tribe</span>
                </button>
              </div>
            </div>
            {contactImportError && (
              <div className="px-6 pb-2 text-[10px] text-vibrant-pink uppercase tracking-widest">{contactImportError}</div>
            )}
            {searchQuery.trim() && (
              <div className="px-6 py-3 border-b border-white/5">
                <p className="text-[10px] font-party tracking-[0.2em] text-accent-red uppercase mb-3">Registered Users</p>
                {userSearchLoading ? (
                  <div className="flex items-center gap-2 py-4 text-gray-500">
                    <div className="size-4 rounded-full border-2 border-accent-red border-t-transparent animate-spin" />
                    <span className="text-[10px] uppercase tracking-widest">Searching...</span>
                  </div>
                ) : searchedUsers.length === 0 ? (
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest py-2">No users found</p>
                ) : (
                  <div className="space-y-2">
                    {searchedUsers.map((u) => (
                      <div
                        key={u.id}
                        onClick={() => handleSelectSearchedUser(u)}
                        className="flex items-center gap-4 py-2.5 px-3 rounded-xl border border-white/5 hover:bg-white/5 cursor-pointer group transition-colors"
                      >
                        <div className="size-10 rounded-full bg-cover border border-accent-red/20 group-hover:border-accent-red/50 transition-all" style={{ backgroundImage: `url(https://picsum.photos/seed/${encodeURIComponent(u.id)}/200)` }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold text-white truncate">{u.displayName || u.email || 'Unknown'}</p>
                          {u.email && <p className="text-[9px] text-gray-500 truncate">{u.email}</p>}
                        </div>
                        <span className="material-symbols-outlined text-accent-red/60 text-lg">chevron_right</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {recentChats.length > 0 && !searchQuery.trim() && (
              <div className="px-6 py-3 border-b border-white/5">
                {recentChats.map((chat) => {
                  const otherId = chat.participantIds?.find((p) => p !== currentUserId) || chat.externalId || '';
                  const otherDisplayName = chat.participantData?.[otherId]?.displayName || chat.name || 'Unknown';
                  const chatUser: User = {
                    id: otherId,
                    name: otherDisplayName.toUpperCase(),
                    avatar: `https://picsum.photos/seed/${encodeURIComponent(otherId)}/200`,
                    status: 'online',
                    onBakchod: true,
                    appUserId: otherId,
                  };
                  return (
                    <div
                      key={chat.$id}
                      onClick={() => selectChat(chatUser, false)}
                      className="flex items-center gap-4 py-2.5 px-3 rounded-xl border border-white/5 hover:bg-white/5 cursor-pointer group transition-colors mb-2"
                    >
                      <div className="size-10 rounded-full bg-cover border border-accent-red/20 group-hover:border-accent-red/50 transition-all" style={{ backgroundImage: `url(https://picsum.photos/seed/${encodeURIComponent(otherId)}/200)` }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-white truncate">{otherDisplayName}</p>
                        {chat.lastMessage && <p className="text-[9px] text-gray-500 truncate">{chat.lastMessage}</p>}
                      </div>
                      <span className="material-symbols-outlined text-accent-red/60 text-lg">chevron_right</span>
                    </div>
                  );
                })}
              </div>
            )}
            {filteredRooms.length > 0 && (searchQuery.trim() || recentChats.length > 0) && (
              <p className="px-6 pt-4 pb-2 text-[10px] font-party tracking-[0.2em] text-accent-red uppercase">Tribes</p>
            )}
            {filteredRooms.map((room) => (
              <div key={room.id} onClick={() => selectChat(room, true)} className="flex items-center gap-4 px-6 py-3.5 border-b border-white/5 hover:bg-white/5 cursor-pointer group transition-colors">
                <div className="size-11 rounded-lg bg-cover border border-white/10 group-hover:border-accent-red/50 transition-all group-hover:shadow-[0_0_15px_rgba(255,0,60,0.2)]" style={{ backgroundImage: `url(${room.avatar})` }} />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center"><p className="text-[12px] font-bold text-white truncate">{room.name}</p>{room.isLive && <span className="text-accent-red text-[8px] font-black animate-pulse">LIVE</span>}</div>
                  <p className="text-[10px] text-gray-500 truncate mt-1"><span className="text-accent-red/70 font-bold">{room.lastSender}:</span> {room.lastMessage}</p>
                </div>
              </div>
            ))}
          </div>
        );
      case 'hotline':
        if (activeHistoryContactId) {
          const contactLogs = callHistory.filter(h => h.contactId === activeHistoryContactId);
          const contact = contactLogs[0];
          const isSavedContact = !!contact && !contact.contactId.startsWith('r-') && isContactSaved(contact.contactId);
          return (
            <div className="flex flex-col h-full animate-in slide-in-from-right duration-300">
               <div className="flex items-center gap-4 p-4 border-b border-white/5 bg-night-panel/50">
                <button onClick={() => setActiveHistoryContactId(null)} className="text-accent-red p-1 rounded-full hover:bg-accent-red/10">
                  <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h2 className="text-sm font-party text-white uppercase tracking-widest">Contact Intel</h2>
              </div>
              <div className="flex flex-col items-center py-8 px-6 border-b border-white/5 bg-accent-red/5">
                <div className="size-24 rounded-full border-4 border-accent-red p-1 mb-4 shadow-[0_0_30px_rgba(255,0,60,0.3)]">
                  <img src={contact.avatar} className="w-full h-full rounded-full object-cover" alt="avatar" />
                </div>
                <h3 className="text-xl font-party text-white tracking-widest neon-text mb-1 uppercase">{contact.name}</h3>
                <p className="text-[10px] text-accent-red font-bold uppercase tracking-[0.2em] mb-6">Elite Bakchod Legend</p>
                
                <div className="grid grid-cols-3 gap-4 w-full">
                  <button onClick={() => startCall('audio', { id: contact.contactId, name: contact.name, avatar: contact.avatar, isRoom: contact.contactId.startsWith('r-') })} className="flex flex-col items-center gap-2 group">
                    <div className="size-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-accent-red group-hover:bg-accent-red group-hover:text-white transition-all shadow-lg active:scale-95">
                      <span className="material-symbols-outlined">call</span>
                    </div>
                    <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Voice</span>
                  </button>
                  <button onClick={() => startCall('video', { id: contact.contactId, name: contact.name, avatar: contact.avatar, isRoom: contact.contactId.startsWith('r-') })} className="flex flex-col items-center gap-2 group">
                    <div className="size-12 rounded-2xl bg-accent-red/10 border border-accent-red/20 flex items-center justify-center text-accent-red group-hover:bg-accent-red group-hover:text-white transition-all shadow-[0_0_15px_rgba(255,0,60,0.2)] active:scale-95">
                      <span className="material-symbols-outlined">videocam</span>
                    </div>
                    <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Video</span>
                  </button>
                  <button
                    onClick={() => contact && addContactFromDetails(contact.contactId, contact.name, contact.avatar)}
                    disabled={!contact || contact.contactId.startsWith('r-') || isSavedContact}
                    className="flex flex-col items-center gap-2 group disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="size-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-accent-red group-hover:bg-accent-red group-hover:text-white transition-all shadow-lg active:scale-95">
                      <span className="material-symbols-outlined">{isSavedContact ? 'check' : 'person_add'}</span>
                    </div>
                    <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                      {contact && contact.contactId.startsWith('r-') ? 'Group' : isSavedContact ? 'Saved' : 'Save Legend'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mb-2">History Log</p>
                {contactLogs.map((log, idx) => (
                  <div key={log.id} className={`flex items-start gap-4 ${idx !== contactLogs.length - 1 ? 'border-l border-white/10 ml-5 pl-8 pb-8 relative' : 'ml-5 pl-8 relative'}`}>
                    <div className={`absolute left-[-6px] top-1 size-3 rounded-full border-2 ${log.isMissed ? 'bg-vibrant-pink border-vibrant-pink' : 'bg-green-500 border-green-500'}`} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className={`text-[12px] font-bold ${log.isMissed ? 'text-vibrant-pink' : 'text-white'}`}>
                          {log.isMissed ? 'Missed ' : 'Incoming '}
                          {log.type === 'video' ? 'Video' : 'Audio'} Call
                        </p>
                        <p className="text-[9px] text-gray-600 font-bold uppercase tracking-tighter">{log.timestamp}</p>
                      </div>
                      <p className="text-[10px] text-gray-500 italic">"The party was lit, where were you?"</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        return (
          <div className="flex flex-col">
            <div className="px-6 pb-2 flex justify-between items-center">
              <h3 className="text-[10px] font-party tracking-[0.2em] text-accent-red uppercase">Call History</h3>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-gray-500">
                <span className="material-symbols-outlined text-sm font-bold">history</span>
                <span className="text-[8px] font-black uppercase tracking-tighter">Recent Logs</span>
              </div>
            </div>
            {filteredCalls.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-30">
                <span className="material-symbols-outlined text-5xl mb-4">call_end</span>
                <p className="text-[10px] font-party uppercase tracking-widest">No Recent Calls</p>
              </div>
            ) : (
              filteredCalls.map((call) => (
                <div key={call.id} onClick={() => setActiveHistoryContactId(call.contactId)} className="flex items-center gap-4 px-6 py-4 border-b border-white/5 hover:bg-white/5 transition-colors group cursor-pointer">
                  <div className="size-11 rounded-full border-2 border-accent-red/20 p-0.5 group-hover:border-accent-red transition-all">
                    <img src={call.avatar} className="w-full h-full rounded-full object-cover" alt="avatar" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-[12px] font-bold truncate ${call.isMissed ? 'text-vibrant-pink' : 'text-white'}`}>{call.name}</p>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`material-symbols-outlined text-[10px] ${call.isMissed ? 'text-vibrant-pink' : 'text-green-500'}`}>
                        {call.type === 'video' ? 'videocam' : 'call'}
                      </span>
                      <p className="text-[9px] text-gray-500 font-medium truncate uppercase tracking-tighter">{call.timestamp}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); startCall('audio', { id: call.contactId, name: call.name, avatar: call.avatar, isRoom: call.contactId.startsWith('r-') }); }}
                      className="size-9 rounded-full bg-white/5 flex items-center justify-center text-accent-red hover:bg-accent-red hover:text-white transition-all active:scale-90"
                    >
                      <span className="material-symbols-outlined text-base">call</span>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); startCall('video', { id: call.contactId, name: call.name, avatar: call.avatar, isRoom: call.contactId.startsWith('r-') }); }}
                      className="size-9 rounded-full bg-accent-red/10 flex items-center justify-center text-accent-red hover:bg-accent-red hover:text-white transition-all active:scale-90"
                    >
                      <span className="material-symbols-outlined text-base">videocam</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        );
      case 'bot':
        return (
          <div className="flex-1 flex flex-col px-6 py-4">
            <div className="text-center py-8">
              <div className="size-16 rounded-full bg-accent-red/10 border border-accent-red/30 flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(255,0,60,0.3)]">
                <span className="material-symbols-outlined text-accent-red text-3xl font-bold">smart_toy</span>
              </div>
              <h2 className="text-sm font-party text-accent-red uppercase tracking-widest neon-text">ECSTASY BOT</h2>
              <p className="text-gray-500 text-[10px] uppercase tracking-tighter mt-2">Sarcasm powered by Gemini Flash</p>
            </div>
            <div className="flex-1 glass-card rounded-2xl p-6 border border-accent-red/20 mb-4 flex flex-col shadow-2xl">
              <div className="bg-accent-red/10 p-5 rounded-xl border border-accent-red/10">
                <p className="text-accent-red text-[8px] font-bold uppercase mb-2 tracking-widest">THE BOT SAYS</p>
                <p className={`text-white text-sm font-medium leading-relaxed italic ${isLoadingRoast ? 'animate-pulse opacity-50' : ''}`}>
                  "{isLoadingRoast ? "Cookin' some fresh burns... 🌶️" : currentRoast}"
                </p>
              </div>
              <div className="mt-auto pt-8">
                <p className="text-center text-[10px] text-gray-600 uppercase font-bold mb-4 tracking-widest">Quick Roasts</p>
                <div className="flex flex-wrap gap-3 justify-center opacity-90">
                  {["Monday", "Woke Culture", "Engineers", "Influencers"].map(t => (
                    <button key={t} onClick={() => handleBotAction(`roast ${t}`)} className="bg-white/5 px-4 py-2 rounded-full text-[10px] font-bold text-white border border-white/5 hover:border-accent-red hover:bg-accent-red/10 transition-all">Roast {t}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      case 'me': 
        return (
          <div className="p-12 text-center flex flex-col items-center">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleAvatarChange}
            />
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="group relative cursor-pointer"
            >
              <div className="size-24 rounded-full border-4 border-accent-red p-1 mb-4 overflow-hidden shadow-[0_0_40px_rgba(255,0,60,0.5)] transition-transform group-hover:scale-105 active:scale-95">
                <img src={userAvatar} alt="me" className="w-full h-full rounded-full object-cover" />
              </div>
              <div className="absolute inset-0 size-24 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="material-symbols-outlined text-white text-3xl">add_a_photo</span>
              </div>
            </div>
            <p className="text-base font-party text-white uppercase tracking-widest">{displayName}</p>
            <div className="mt-3 px-4 py-1.5 bg-accent-red/10 border border-accent-red/20 rounded-full">
                <p className="text-[11px] text-accent-red uppercase font-black tracking-widest">Level 99 Legend</p>
            </div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[12px] font-bold text-white hover:bg-white/10 transition-all"
            >
              <span className="material-symbols-outlined text-sm">edit</span>
              Update Profile Pic
            </button>
          </div>
        );
      default: return null;
    }
  };

  if (authStatus !== 'authed') {
    return (
      <div className="min-h-screen w-full bg-night-black text-white flex items-center justify-center p-6">
        <div className="text-center">
          <div className="size-12 rounded-full border-2 border-accent-red animate-spin mx-auto mb-4 border-t-transparent" />
          <p className="text-[10px] uppercase tracking-widest text-gray-500">Loading party...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout ecstasyMode={ecstasyMode}>
      <InviteModal
        isOpen={isInviteOpen}
        inviteTargetType={inviteTargetType}
        setInviteTargetType={setInviteTargetType}
        inviteTargetValue={inviteTargetValue}
        setInviteTargetValue={setInviteTargetValue}
        inviteNote={inviteNote}
        setInviteNote={setInviteNote}
        inviteError={inviteError}
        inviteStatus={inviteStatus}
        onClose={() => setIsInviteOpen(false)}
        onSubmit={handleInviteSubmit}
      />
      <ContactInviteModal
        contact={pendingInviteContact}
        onClose={() => setPendingInviteContact(null)}
        onRefresh={() => {
          if (!pendingInviteContact) return;
          void handleSelectContact(pendingInviteContact);
        }}
        onSendSms={() => {
          if (!pendingInviteContact) return;
          openInviteViaSms(pendingInviteContact);
        }}
        onSendWhatsApp={() => {
          if (!pendingInviteContact) return;
          openInviteViaWhatsApp(pendingInviteContact);
        }}
      />
      {!activeChat && !isCreatingGroup && !isSettingsOpen && (
        <header className="flex items-center justify-between px-6 py-5 pb-2">
          <div className="flex items-center gap-3">
            <div onClick={toggleEcstasy} className={`size-8 rounded-full flex items-center justify-center cursor-pointer transition-all active:scale-90 ${ecstasyMode ? 'bg-white text-accent-red shadow-[0_0_15px_white]' : 'bg-accent-red text-white shadow-[0_0_15px_rgba(255,0,60,0.5)]'}`}>
              <span className="material-symbols-outlined text-base font-bold">{ecstasyMode ? 'bolt' : 'celebration'}</span>
            </div>
            <h1 className="text-base font-party text-accent-red tracking-widest neon-text">Bakchod</h1>
          </div>
          <div className="flex gap-3">
            <button onClick={() => {setActiveTab('bot'); setActiveChat(null); setIsCalling(false);}} className={`size-8 rounded-full flex items-center justify-center transition-all ${activeTab === 'bot' ? 'bg-vibrant-pink text-white shadow-lg' : 'bg-white/5 text-accent-red'}`}>
              <span className="material-symbols-outlined text-base">smart_toy</span>
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="size-8 rounded-full bg-white/5 flex items-center justify-center text-accent-red hover:bg-accent-red hover:text-white transition-all">
              <span className="material-symbols-outlined text-base">settings</span>
            </button>
          </div>
        </header>
      )}

      {!activeChat && !isCreatingGroup && !isSettingsOpen && (
        <div className="px-6 py-2">
          <form onSubmit={(e) => { e.preventDefault(); if (activeTab === 'bot') handleBotAction(searchQuery); }} className="flex h-10">
            <div className={`flex-1 flex items-center rounded-xl border-2 px-4 gap-3 transition-all border-accent-red bg-accent-red/5`}>
              <span className="material-symbols-outlined text-sm text-accent-red">{activeTab === 'bot' ? 'bolt' : 'search'}</span>
              <input 
                className="bg-transparent border-none focus:outline-none focus:ring-0 text-[11px] text-white flex-1 p-0 placeholder:text-gray-500 font-bold"
                placeholder={activeTab === 'bot' ? "Who or what should I roast?..." : activeTab === 'hotline' ? "Search call history..." : "Search tribes or legends..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {activeTab === 'bot' && searchQuery && <button type="submit" className="text-accent-red"><span className="material-symbols-outlined text-sm">arrow_forward</span></button>}
            </div>
          </form>
        </div>
      )}

      {!activeChat && !isCreatingGroup && !isSettingsOpen && (
        <StoryBar
          searchQuery={activeTab === 'party' || activeTab === 'hotline' ? searchQuery : ""}
          users={storyBarUsers}
          onSelectUser={(user) => { void handleSelectContact(user); }}
        />
      )}

      <main className={`flex-1 overflow-y-auto no-scrollbar ${!activeChat && !isSettingsOpen ? 'pb-28' : 'pb-0'}`}>
        {renderContent()}
      </main>

      {/* Mini Controls - Active call bar */}
      {isCalling && (
        <div className="absolute bottom-20 left-0 right-0 px-8 z-30 animate-in fade-in slide-in-from-bottom-8">
          <div className="glass-card rounded-full p-2 flex items-center justify-between border-white/10 shadow-2xl">
            <button onClick={() => setIsMuted(!isMuted)} className={`size-9 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-accent-red text-white shadow-lg' : 'bg-white/5 text-accent-red hover:bg-white/10'}`}>
              <span className="material-symbols-outlined text-base">{isMuted ? 'mic_off' : 'mic'}</span>
            </button>
            
            {callMode === 'audio' ? (
                <button onClick={() => startCall('video')} className="size-9 rounded-full bg-accent-red/20 text-accent-red flex items-center justify-center hover:bg-accent-red hover:text-white transition-all shadow-inner">
                    <span className="material-symbols-outlined text-base">videocam</span>
                </button>
            ) : (
                <button onClick={() => setIsCameraOff(!isCameraOff)} className={`size-9 rounded-full flex items-center justify-center transition-all ${isCameraOff ? 'bg-accent-red text-white' : 'bg-white/5 text-accent-red shadow-sm'}`}>
                    <span className="material-symbols-outlined text-base">{isCameraOff ? 'videocam_off' : 'videocam'}</span>
                </button>
            )}
            
            <button onClick={toggleEcstasy} className={`size-12 -mt-10 rounded-full flex items-center justify-center transition-all duration-300 ${ecstasyMode ? 'bg-white text-vibrant-pink shadow-[0_0_25px_white] scale-110' : 'bg-accent-red text-white shadow-[0_0_25px_rgba(255,0,60,0.7)]'}`}>
              <span className="material-symbols-outlined text-xl font-black">electric_bolt</span>
            </button>
            
            {callMode === 'video' ? (
                <button onClick={toggleFlip} className="size-9 rounded-full bg-white/5 flex items-center justify-center text-accent-red hover:bg-white/10 transition-all">
                    <span className="material-symbols-outlined text-base">flip_camera_ios</span>
                </button>
            ) : (
                <button className="size-9 rounded-full bg-white/5 flex items-center justify-center text-accent-red opacity-20"><span className="material-symbols-outlined text-base">person_add</span></button>
            )}
            
            <button onClick={handleEndCall} className="size-9 rounded-full bg-accent-red flex items-center justify-center text-white shadow-xl hover:bg-red-700 active:scale-90 transition-all">
              <span className="material-symbols-outlined text-base font-bold">call_end</span>
            </button>
          </div>
        </div>
      )}

      {/* Mini Nav */}
      <nav className="sticky bottom-0 left-0 right-0 h-20 bg-night-black border-t border-white/5 flex items-center justify-around px-8 pb-5 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <div onClick={() => {setActiveTab('party'); setActiveChat(null); setIsCalling(false); setIsCreatingGroup(false); setIsSettingsOpen(false); setActiveHistoryContactId(null);}} className={`flex flex-col items-center gap-1.5 cursor-pointer transition-all active:text-vibrant-pink ${activeTab === 'party' && !activeChat && !isCreatingGroup && !isSettingsOpen ? 'text-vibrant-pink scale-110 shadow-[0_0_15px_rgba(255,0,160,0.3)]' : 'text-accent-red hover:text-vibrant-pink/80'}`}>
          <span className="material-symbols-outlined text-2xl font-bold">nightlife</span>
          <span className="text-[10px] font-bold font-party uppercase tracking-tight">Party</span>
        </div>
        <div onClick={() => {setActiveTab('hotline'); setActiveChat(null); setIsCalling(false); setIsCreatingGroup(false); setIsSettingsOpen(false); setActiveHistoryContactId(null);}} className={`flex flex-col items-center gap-1.5 cursor-pointer transition-all active:text-vibrant-pink ${activeTab === 'hotline' && !activeChat && !isCreatingGroup && !isSettingsOpen ? 'text-vibrant-pink scale-110 shadow-[0_0_15px_rgba(255,0,160,0.3)]' : 'text-accent-red hover:text-vibrant-pink/80'}`}>
          <span className="material-symbols-outlined text-2xl font-bold">call</span>
          <span className="text-[10px] font-bold font-party uppercase tracking-tight">Hotline</span>
        </div>
        <div onClick={() => {setActiveTab('bot'); setActiveChat(null); setIsCalling(false); setIsCreatingGroup(false); setIsSettingsOpen(false); setActiveHistoryContactId(null);}} className={`flex flex-col items-center gap-1.5 cursor-pointer transition-all active:text-vibrant-pink ${activeTab === 'bot' ? 'text-vibrant-pink scale-110 shadow-[0_0_15px_rgba(255,0,160,0.3)]' : 'text-accent-red hover:text-vibrant-pink/80'}`}>
          <span className="material-symbols-outlined text-2xl font-bold">smart_toy</span>
          <span className="text-[10px] font-bold font-party uppercase tracking-tight">Bot</span>
        </div>
        <div onClick={() => {setActiveTab('me'); setActiveChat(null); setIsCalling(false); setIsCreatingGroup(false); setIsSettingsOpen(false); setActiveHistoryContactId(null);}} className={`flex flex-col items-center gap-1.5 cursor-pointer group transition-all active:text-vibrant-pink ${activeTab === 'me' ? 'text-vibrant-pink scale-110 shadow-[0_0_15px_rgba(255,0,160,0.3)]' : 'text-accent-red'}`}>
          <div className={`size-5.5 rounded-full border-2 bg-cover transition-all active:border-vibrant-pink ${activeTab === 'me' ? 'border-vibrant-pink shadow-sm' : 'border-accent-red group-hover:border-vibrant-pink/50'}`} style={{ backgroundImage: `url(${userAvatar})` }} />
          <span className="text-[10px] font-bold font-party uppercase tracking-tight">Me</span>
        </div>
      </nav>
    </Layout>
  );
};

export default App;
