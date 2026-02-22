
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Layout from './components/Layout';
import { generateRoast } from './services/geminiService';
import { auth, db, functions } from './services/firebaseClient';
import { updateProfile as authUpdateProfile } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import {
  ensureProfile,
  getOrCreateChat,
  createRoom,
  getRoomDetails,
  addRoomMembers,
  removeRoomMember,
  updateRoomAdmin,
  updateRoomName,
  uploadProfilePhoto,
  getUserAvatarUrl,
  uploadGroupAvatar,
  subscribeMessages,
  subscribeToChatDoc,
  subscribeToUserChats,
  createMessage,
  addMessageReaction,
  setTyping,
  subscribeTyping,
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
  deleteMessage as deleteMessageBackend,
  setChatClearedForMe,
  getChatClearedAt,
  addMessageDeletedForMe,
  getMessagesDeletedForMe,
  markChatRead,
  getChatMute,
  setChatMute,
  getChatRoastsEnabled,
  setChatRoastsEnabled,
  uploadChatFile,
  createCall,
  updateCallStatus,
  subscribeToCallStatus,
  subscribeToIncomingCalls,
} from './services/backend';
import { User, ActiveRoom, Message } from './types';
import { registerForPushNotifications, isPushSupported } from './services/pushNotifications';
import { playMessageNotificationSound, playVibeCelebrationSound, unlockAudioOnFirstInteraction } from './services/messageNotificationSound';
import confetti from 'canvas-confetti';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import JitsiCallView from './components/JitsiCallView';
import { useUserContext } from './contexts/UserContext';
import { useAuth } from './context/AuthContext';

/** Toggle to show audio/video call icons. Set true when calls are ready. */
const CALLS_ENABLED = false;

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
  isRoom: boolean;
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

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

// Expanded emoji list with "sexy", party, and classic vibes
const QUICK_EMOJIS = [
  "🔥", "😂", "💀", "🌶️", "🥃", "🙌", "💯", "🤡", 
  "🫦", "💋", "💃", "🕺", "🥂", "🍹", "🍺", "🍾", 
  "🍒", "🍓", "🍑", "🍆", "💦", "👅", "💄", "👠", 
  "🕶️", "✨", "🌟", "🔞", "⛓️", "😈", "🖤", "❤️‍🔥", 
  "🤣", "🤩", "😍", "🥳", "😎", "🧐", "🙄", "🥵", 
  "🥶", "🤯", "🥺", "🤝", "🤙", "👊", "🧿", "🇮🇳"
];

const VIBE_CELEBRATIONS: { id: string; label: string; emoji: string }[] = [
  { id: 'baby', label: 'Birth / Baby Shower', emoji: '👶' },
  { id: 'adoption', label: 'Adoption', emoji: '🏠' },
  { id: 'birthday', label: 'Birthday', emoji: '🎂' },
  { id: 'milestone', label: 'Milestone Birthday', emoji: '🍾' },
  { id: 'graduation', label: 'Graduation', emoji: '🎓' },
  { id: 'first-day-school', label: 'First Day of School', emoji: '🎒' },
  { id: 'proposal', label: 'Proposal / Engagement', emoji: '💍' },
  { id: 'wedding', label: 'Wedding', emoji: '👰' },
  { id: 'anniversary', label: 'Anniversary', emoji: '🌹' },
  { id: 'housewarming', label: 'Moving / Housewarming', emoji: '🏡' },
  { id: 'renovation', label: 'Renovation', emoji: '🛠️' },
  { id: 'new-job', label: 'New Job / Promotion', emoji: '💼' },
  { id: 'retirement', label: 'Retirement', emoji: '🏝️' },
  { id: 'recovery', label: 'Recovery / Get Well', emoji: '🩹' },
  { id: 'fitness', label: 'Fitness Milestone', emoji: '🏅' },
  { id: 'festival', label: 'Religious Festival', emoji: '🪔' },
  { id: 'spiritual', label: 'Spiritual Milestone', emoji: '🕊️' },
  { id: 'party', label: 'Party & Success', emoji: '🎉' },
  { id: 'congrats', label: 'Congratulations', emoji: '🎊' },
  { id: 'love', label: 'Love you', emoji: '❤️' },
  { id: 'hug', label: 'Hug', emoji: '🫂' },
  { id: 'thank-you', label: 'Thank you', emoji: '🙏' },
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
  const [rooms, setRooms] = useState<ActiveRoom[]>([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [tribeMemberSearch, setTribeMemberSearch] = useState("");
  const [tribeSearchedUsers, setTribeSearchedUsers] = useState<Array<{ id: string; displayName?: string; email?: string }>>([]);
  const [tribeCreateLoading, setTribeCreateLoading] = useState(false);
  const [tribeCreateError, setTribeCreateError] = useState<string | null>(null);
  
  // Call History State
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([
    { id: 'h1', name: 'RAHUL', avatar: 'https://picsum.photos/seed/rahul/200', type: 'video', timestamp: 'Yesterday, 11:45 PM', isMissed: false, contactId: '2', isRoom: false },
    { id: 'h2', name: 'PRIYA', avatar: 'https://picsum.photos/seed/priya/200', type: 'audio', timestamp: 'Today, 2:15 AM', isMissed: true, contactId: '3', isRoom: false },
    { id: 'h3', name: 'THE BOYS 🍻', avatar: 'https://picsum.photos/seed/boys/200', type: 'video', timestamp: '2 days ago', isMissed: false, contactId: 'r1', isRoom: true },
    { id: 'h4', name: 'RAHUL', avatar: 'https://picsum.photos/seed/rahul/200', type: 'audio', timestamp: 'Last Monday', isMissed: false, contactId: '2', isRoom: false },
  ]);

  // User Profile State
  const [userAvatar, setUserAvatar] = useState('https://picsum.photos/seed/me/200');
  const [displayName, setDisplayName] = useState('Bakchod King');
  
  // Chat History State
  const [chatMessages, setChatMessages] = useState<Record<string, Message[]>>({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showVibePicker, setShowVibePicker] = useState(false);
  const [celebrationEffect, setCelebrationEffect] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [typingIndicators, setTypingIndicators] = useState<Array<{ userId: string; displayName?: string }>>([]);
  const [messageContextMenu, setMessageContextMenu] = useState<{ msg: Message; x: number; y: number } | null>(null);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [groupInfoData, setGroupInfoData] = useState<{ $id: string; name: string; ownerId: string; participantIds: string[]; participantData: Record<string, { displayName?: string }>; adminIds: string[]; avatarUrl?: string | null } | null>(null);
  const [groupInfoLoading, setGroupInfoLoading] = useState(false);
  const [groupAddMemberOpen, setGroupAddMemberOpen] = useState(false);
  const [groupNameEdit, setGroupNameEdit] = useState<string | null>(null);
  const [groupNameEditValue, setGroupNameEditValue] = useState('');
  const [chatLastReadAt, setChatLastReadAt] = useState<Record<string, Record<string, Date>>>({});
  const [chatClearedAt, setChatClearedAt] = useState<Record<string, number | null>>({});
  const [messagesDeletedForMe, setMessagesDeletedForMe] = useState<Record<string, Set<string>>>({});
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [mutedChats, setMutedChats] = useState<Record<string, boolean>>({});
  const [roastsEnabledChats, setRoastsEnabledChats] = useState<Record<string, boolean>>({});
  const [avatarPreview, setAvatarPreview] = useState<{ url: string; name?: string } | null>(null);
  const groupAvatarInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingUnsubRef = useRef<(() => void) | null>(null);
  const chatDocUnsubRef = useRef<(() => void) | null>(null);
  
  // Call States
  const [isCalling, setIsCalling] = useState(false);
  const [callMode, setCallMode] = useState<CallMode>(null);
  const [activeCallDoc, setActiveCallDoc] = useState<{ $id: string; roomName: string; fromDisplayName?: string; mode: 'audio' | 'video'; status: string } | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ $id: string; fromDisplayName?: string; mode: string; roomName: string } | null>(null);
  const [callDeclined, setCallDeclined] = useState(false);
  const [outgoingCallId, setOutgoingCallId] = useState<string | null>(null);
  const callStatusUnsubRef = useRef<(() => void) | null>(null);
  const incomingCallsUnsubRef = useRef<(() => void) | null>(null);
  
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
  const chatAttachRef = useRef<HTMLInputElement>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const activeChatUnsubscribeRef = useRef<null | (() => void)>(null);
  const voiceRecorderRef = useRef<{ recorder: MediaRecorder; chunks: Blob[] } | null>(null);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const initialSnapshotHandledRef = useRef(false);
  const mutedChatsRef = useRef<Record<string, boolean>>({});
  const chatClearedAtRef = useRef<Record<string, number | null>>({});
  const messagesDeletedForMeRef = useRef<Record<string, Set<string>>>({});
  useEffect(() => { mutedChatsRef.current = mutedChats; }, [mutedChats]);
  useEffect(() => { chatClearedAtRef.current = chatClearedAt; }, [chatClearedAt]);
  useEffect(() => { messagesDeletedForMeRef.current = messagesDeletedForMe; }, [messagesDeletedForMe]);
  useEffect(() => { unlockAudioOnFirstInteraction(); }, []);

  // AI Content State
  const [currentRoast, setCurrentRoast] = useState("Type something to get roasted! 🌶️");
  const displayRoast = useMemo(() => {
    if (!activeChat || roastsEnabledChats[activeChat.id] === false) return 'Roasts disabled for this chat';
    const msgs = chatMessages[activeChat.id] || [];
    const last = [...msgs].reverse().find((m) => m.type === 'roast');
    return last?.text || currentRoast;
  }, [activeChat, chatMessages, currentRoast, roastsEnabledChats]);
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
    const unsubscribe = subscribeInvites(currentUserId, () => {
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
      setRecentChats(chats);
    });
    return () => unsubscribe();
  }, [currentUserId]);

  // Prefetch avatars for visible users (chats, contacts, group)
  useEffect(() => {
    const uids = new Set<string>();
    recentChats.forEach((c) => c.participantIds?.forEach((p) => uids.add(p)));
    contacts.forEach((c) => {
      if (c.appUserId) uids.add(c.appUserId);
      if (c.onBakchod && c.id && !c.id.startsWith('c-') && !c.id.startsWith('phone:')) uids.add(c.id);
    });
    if (groupInfoData?.participantIds) groupInfoData.participantIds.forEach((p) => uids.add(p));
    uids.delete(currentUserId || '');
    const toFetch = [...uids].filter((uid) => !userAvatarCache[uid]);
    if (toFetch.length === 0) return;
    let cancelled = false;
    toFetch.forEach(async (uid) => {
      const url = await getUserAvatarUrl(uid);
      if (!cancelled && url) setUserAvatarCache((prev) => ({ ...prev, [uid]: url }));
    });
    return () => { cancelled = true; };
  }, [recentChats, contacts, groupInfoData, currentUserId]);

  // Preload messagesDeletedForMe for chat list (so we can hide "deleted for me" previews)
  useEffect(() => {
    if (!currentUserId || recentChats.length === 0) return;
    let cancelled = false;
    const load = async () => {
      const updates: Record<string, Set<string>> = {};
      await Promise.all(
        recentChats.map(async (c) => {
          const chatKey = c.isRoom ? c.$id : (c.participantIds?.find((p) => p !== currentUserId) || c.externalId || c.$id);
          if (!chatKey) return;
          try {
            const ids = await getMessagesDeletedForMe(c.$id, currentUserId);
            if (!cancelled && ids?.length) updates[chatKey] = new Set(ids);
          } catch {
            // ignore
          }
        })
      );
      if (!cancelled && Object.keys(updates).length > 0) {
        setMessagesDeletedForMe((prev) => {
          const next = { ...prev };
          Object.entries(updates).forEach(([k, v]) => {
            const existing = next[k];
            next[k] = existing ? new Set([...existing, ...v]) : v;
          });
          return next;
        });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [currentUserId, recentChats]);

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

  // Populate avatar cache from search results (they include photoURL)
  useEffect(() => {
    const updates: Record<string, string> = {};
    [...searchedUsers, ...tribeSearchedUsers].forEach((u) => { if (u.id && (u as any).photoURL) updates[u.id] = (u as any).photoURL; });
    if (Object.keys(updates).length > 0) setUserAvatarCache((prev) => ({ ...prev, ...updates }));
  }, [searchedUsers, tribeSearchedUsers]);

  useEffect(() => {
    if ((!isCreatingGroup && !groupAddMemberOpen) || !tribeMemberSearch.trim() || !currentUserId) {
      setTribeSearchedUsers([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await searchUsersByDisplayName(tribeMemberSearch, currentUserId);
        setTribeSearchedUsers(results);
      } catch {
        setTribeSearchedUsers([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [tribeMemberSearch, isCreatingGroup, groupAddMemberOpen, currentUserId]);

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
    const fromRecent = recentChats
      .filter((c) => c.isRoom)
      .map((c) => ({
        id: c.$id,
        name: c.name || 'Tribe',
        membersCount: c.participantIds?.length || 0,
        lastMessage: c.lastMessage || '',
        lastSender: (c as any).lastSenderDisplayName || '',
        isLive: false,
        avatar: (c as any).avatarUrl || `https://picsum.photos/seed/${encodeURIComponent(c.name || c.$id)}/200`,
      }));
    const fromState = rooms.filter(
      (r) => !recentChats.some((c) => c.$id === r.id)
    );
    const combined = [...fromRecent, ...fromState];
    return combined.filter(
      (room) =>
        room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        room.lastSender.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, activeTab, rooms, recentChats]);

  const filteredCalls = useMemo(() => {
    if (activeTab !== 'hotline') return callHistory;
    return callHistory.filter(call => 
      call.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, activeTab, callHistory]);

  // AI Interaction - in chat: saves roast to Firestore so both users see it; in Bot tab: local only
  const handleBotAction = async (topic: string, firestoreChatId?: string) => {
    if (isLoadingRoast || !topic.trim()) return;
    setIsLoadingRoast(true);
    const roast = await generateRoast(topic);
    setCurrentRoast(roast);
    if (firestoreChatId) {
      try {
        await createMessage({
          chatId: firestoreChatId,
          userId: 'ecstasy-bot',
          role: 'bot',
          content: roast,
          type: 'roast',
          senderDisplayName: 'ECSTASY BOT',
          lastSenderDisplayName: 'ECSTASY BOT',
        });
      } catch (err) {
        console.error('Failed to save roast message:', err);
      }
    }
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

  const handleClearChat = async () => {
    if (!activeChat || !currentUserId) return;
    const fid = chatDocIds[activeChat.id] || (activeChat.isRoom ? activeChat.id : null);
    if (!fid) {
      window.alert('Chat not loaded yet. Wait a moment and try again.');
      return;
    }
    if (!window.confirm(`Clear chat for you only? Messages will remain for others.`)) return;
    setChatMenuOpen(false);
    try {
      await setChatClearedForMe(fid, currentUserId);
      const now = Date.now();
      setChatClearedAt((prev) => ({ ...prev, [activeChat.id]: now }));
      chatClearedAtRef.current = { ...chatClearedAtRef.current, [activeChat.id]: now };
      setChatMessages((prev) => ({ ...prev, [activeChat.id]: [] }));
    } catch (err: any) {
      const msg = err?.message || 'Failed to clear chat.';
      const code = err?.code || err?.name || '';
      console.error('Clear chat error:', code, msg, err);
      window.alert(code === 'permission-denied' || msg.includes('permission')
        ? 'Permission denied. Make sure you are in this chat and try again. If it persists, sign out and sign back in.'
        : msg);
    }
  };

  const handleDeleteForEveryone = async (msg: Message) => {
    if (!activeChat || !currentUserId) return;
    const fid = chatDocIds[activeChat.id] || (activeChat.isRoom ? activeChat.id : null);
    if (!fid) return;
    setMessageContextMenu(null);
    if (!window.confirm('Delete this message for everyone?')) return;
    try {
      await deleteMessageBackend(fid, msg.id);
      setChatMessages((prev) => ({
        ...prev,
        [activeChat.id]: (prev[activeChat.id] || []).filter((m) => m.id !== msg.id),
      }));
    } catch (err: any) {
      window.alert(err?.message || 'Failed to delete message.');
    }
  };

  const handleDeleteForMe = async (msg: Message) => {
    if (!activeChat || !currentUserId) return;
    const fid = chatDocIds[activeChat.id] || (activeChat.isRoom ? activeChat.id : null);
    if (!fid) return;
    setMessageContextMenu(null);
    try {
      await addMessageDeletedForMe(fid, currentUserId, msg.id);
      const newSet = new Set([...(messagesDeletedForMe[activeChat.id] || []), msg.id]);
      setMessagesDeletedForMe((prev) => ({ ...prev, [activeChat.id]: newSet }));
      messagesDeletedForMeRef.current = { ...messagesDeletedForMeRef.current, [activeChat.id]: newSet };
      setChatMessages((prev) => ({
        ...prev,
        [activeChat.id]: (prev[activeChat.id] || []).filter((m) => m.id !== msg.id),
      }));
    } catch (err: any) {
      window.alert(err?.message || 'Failed to remove message.');
    }
  };

  const loadChatFromBackend = async (chatId: string, name: string, isRoom: boolean) => {
    if (!currentUserId) return;
    const firestoreChatId = isRoom ? chatId : (await getOrCreateChat({
      userId: currentUserId,
      externalId: chatId,
      name,
      isRoom,
      currentUserDisplayName: displayName,
    })).$id;
    setChatDocIds(prev => ({ ...prev, [chatId]: firestoreChatId }));

    if (activeChatUnsubscribeRef.current) {
      activeChatUnsubscribeRef.current();
      activeChatUnsubscribeRef.current = null;
    }
    seenMessageIdsRef.current = new Set();
    initialSnapshotHandledRef.current = false;
    const subscriptionTime = Date.now();

    const toDate = (value: any) => {
      if (!value) return new Date();
      if (typeof value?.toDate === "function") return value.toDate();
      if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
      return new Date(value);
    };
    let participantData: Record<string, { displayName?: string }> = {};
    try {
      const chatSnap = await getDoc(doc(db, 'chats', firestoreChatId));
      if (chatSnap.exists()) participantData = chatSnap.data().participantData || {};
    } catch {
      // ignore
    }
    void markChatRead(firestoreChatId, currentUserId);
    try {
      const [clearedAt, deletedIds] = await Promise.all([
        getChatClearedAt(firestoreChatId, currentUserId),
        getMessagesDeletedForMe(firestoreChatId, currentUserId),
      ]);
      setChatClearedAt((prev) => ({ ...prev, [chatId]: clearedAt }));
      setMessagesDeletedForMe((prev) => ({ ...prev, [chatId]: new Set(deletedIds || []) }));
      chatClearedAtRef.current = { ...chatClearedAtRef.current, [chatId]: clearedAt };
      messagesDeletedForMeRef.current = { ...messagesDeletedForMeRef.current, [chatId]: new Set(deletedIds || []) };
    } catch {
      // ignore
    }
    activeChatUnsubscribeRef.current = subscribeMessages(firestoreChatId, (payload) => {
      const mapped: Message[] = payload.documents.map((doc: any) => {
        const sid = doc.senderId || doc.userId;
        const senderName = doc.role === 'bot' ? 'ECSTASY BOT' : (doc.senderDisplayName || participantData[sid]?.displayName || (sid === currentUserId ? displayName : 'Unknown'));
        const createdAt = toDate(doc.createdAt);
        return {
          id: doc.$id,
          senderId: sid,
          senderName,
          text: doc.content,
          timestamp: createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: doc.type || 'text',
          imageUrl: doc.imageUrl || undefined,
          audioUrl: doc.audioUrl || undefined,
          replyTo: doc.replyTo || undefined,
          reactions: doc.reactions || {},
          createdAt,
        };
      });
      const seen = seenMessageIdsRef.current;
      const isInitialLoad = !initialSnapshotHandledRef.current;
      if (payload.documents.length > 0 && !initialSnapshotHandledRef.current) initialSnapshotHandledRef.current = true;
      const createdAfterSubscribe = (d: any) => toDate(d.createdAt).getTime() > subscriptionTime - 2000;
      const newFromOther = payload.documents.filter((d: any) => {
        const sid = d.senderId || d.userId;
        const fromOther = sid !== currentUserId && sid !== 'ecstasy-bot';
        return !seen.has(d.$id) && fromOther && createdAfterSubscribe(d);
      });
      const hasNewFromOther = newFromOther.length > 0;
      if (!isInitialLoad && hasNewFromOther && !mutedChatsRef.current[chatId]) {
        playMessageNotificationSound();
      }
      if (!isInitialLoad && hasNewFromOther) {
        const vibeMatches = newFromOther.filter((d: any) =>
          VIBE_CELEBRATIONS.some((v) => d.content === `${v.emoji} ${v.label}`)
        );
        const latestVibe = vibeMatches[vibeMatches.length - 1];
        if (latestVibe) {
          const item = VIBE_CELEBRATIONS.find((v) => latestVibe.content === `${v.emoji} ${v.label}`);
          if (item) setCelebrationEffect(item.emoji);
        }
      }
      payload.documents.forEach((d: any) => seen.add(d.$id));
      const clearedAt = chatClearedAtRef.current[chatId];
      const deletedSet = messagesDeletedForMeRef.current[chatId];
      const filtered = mapped.filter((m) => {
        if (clearedAt != null && m.createdAt && m.createdAt.getTime() <= clearedAt) return false;
        if (deletedSet?.has(m.id)) return false;
        return true;
      });
      setChatMessages(prev => ({ ...prev, [chatId]: filtered }));
    });
    if (chatDocUnsubRef.current) chatDocUnsubRef.current();
    chatDocUnsubRef.current = subscribeToChatDoc(firestoreChatId, (chatData: any) => {
      const lastReadAt = chatData.lastReadAt || {};
      const byUser: Record<string, Date> = {};
      Object.keys(lastReadAt).forEach((uid) => {
        const v = lastReadAt[uid];
        if (v) byUser[uid] = toDate(v);
      });
      setChatLastReadAt(prev => ({ ...prev, [chatId]: byUser }));
    });
    if (isRoom) {
      getRoomDetails(firestoreChatId).then((data) => {
        if (data) setGroupInfoData((prev) => (prev?.$id === data.$id ? prev : data));
      }).catch(() => {});
    }
    getChatMute(currentUserId, firestoreChatId).then((muted) => {
      setMutedChats((prev) => ({ ...prev, [chatId]: muted }));
    }).catch(() => {});
    getChatRoastsEnabled(currentUserId, firestoreChatId).then((enabled) => {
      setRoastsEnabledChats((prev) => ({ ...prev, [chatId]: enabled }));
    }).catch(() => {});
    if (typingUnsubRef.current) typingUnsubRef.current();
    typingUnsubRef.current = subscribeTyping(firestoreChatId, (typers) => {
      setTypingIndicators(typers.filter((t) => t.userId !== currentUserId));
    });
  };

  useEffect(() => {
    if (activeChat) return;
    setCelebrationEffect(null);
    if (activeChatUnsubscribeRef.current) {
      activeChatUnsubscribeRef.current();
      activeChatUnsubscribeRef.current = null;
    }
    if (chatDocUnsubRef.current) {
      chatDocUnsubRef.current();
      chatDocUnsubRef.current = null;
    }
    if (typingUnsubRef.current) {
      typingUnsubRef.current();
      typingUnsubRef.current = null;
    }
    setTypingIndicators([]);
  }, [activeChat]);

  useEffect(() => () => {
    if (activeChatUnsubscribeRef.current) {
      activeChatUnsubscribeRef.current();
      activeChatUnsubscribeRef.current = null;
    }
    if (chatDocUnsubRef.current) {
      chatDocUnsubRef.current();
      chatDocUnsubRef.current = null;
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (typingUnsubRef.current) typingUnsubRef.current();
  }, []);

  useEffect(() => {
    if (!currentUserId || activeCallDoc) return;
    incomingCallsUnsubRef.current = subscribeToIncomingCalls(currentUserId, (calls) => {
      const first = calls[0];
      setIncomingCall(first ? { $id: first.$id, fromDisplayName: first.fromDisplayName, mode: first.mode || 'video', roomName: first.roomName } : null);
    });
    return () => {
      if (incomingCallsUnsubRef.current) { incomingCallsUnsubRef.current(); incomingCallsUnsubRef.current = null; }
    };
  }, [currentUserId, activeCallDoc]);

  useEffect(() => {
    if (!activeChat || !currentUserId) return;
    const fid = chatDocIds[activeChat.id] || (activeChat.isRoom ? activeChat.id : null);
    if (!fid) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (chatInput.trim()) {
      void setTyping(fid, currentUserId, displayName || 'You', true);
      typingTimeoutRef.current = setTimeout(() => {
        void setTyping(fid, currentUserId, displayName || 'You', false);
        typingTimeoutRef.current = null;
      }, 3000);
    } else {
      void setTyping(fid, currentUserId, displayName || 'You', false);
    }
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [chatInput, activeChat, currentUserId, displayName, chatDocIds]);


  useEffect(() => {
    if (!celebrationEffect) return;
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    playVibeCelebrationSound();
    const duration = 3000;
    const end = Date.now() + duration;
    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 },
        colors: ['#ff003c', '#ff00a0', '#ffeb3b', '#76ff03'],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 },
        colors: ['#ff003c', '#ff00a0', '#ffeb3b', '#76ff03'],
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
    const t = setTimeout(() => setCelebrationEffect(null), 10000);
    return () => { clearTimeout(t); };
  }, [celebrationEffect]);

  const handleSendMessage = async (text: string, type: 'text' | 'image' | 'video' | 'file' | 'audio' | 'roast' = 'text', options?: { imageUrl?: string; fileName?: string; audioUrl?: string }) => {
    const mediaUrl = options?.imageUrl ?? options?.audioUrl;
    const hasContent = (text && text.trim()) || mediaUrl;
    if (!hasContent || !activeChat) return;
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

    const contentLabel = mediaUrl
      ? (type === 'image' ? 'Photo' : type === 'video' ? 'Video' : type === 'file' ? (options?.fileName || 'File') : type === 'audio' ? 'Voice message' : text)
      : text;
    const now = new Date();
    const userMsg: Message = {
      id: Date.now().toString(),
      senderId: currentUserId || 'local',
      senderName: displayName || 'YOU',
      text: contentLabel,
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type,
      ...(options?.imageUrl && { imageUrl: options.imageUrl }),
      ...(options?.audioUrl && { audioUrl: options.audioUrl }),
      ...(mediaUrl && type !== 'audio' && { imageUrl: mediaUrl }),
      replyTo: replyToMessage ? { messageId: replyToMessage.id, text: replyToMessage.text, senderName: replyToMessage.senderName } : undefined,
      createdAt: now,
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
          content: contentLabel,
          language: preferredLanguage,
          type,
          imageUrl: options?.imageUrl || (type !== 'audio' ? mediaUrl : undefined) || undefined,
          audioUrl: options?.audioUrl || undefined,
          senderDisplayName: displayName || 'You',
          lastSenderDisplayName: activeChat.isRoom ? (displayName || 'You') : undefined,
          replyTo: replyToMessage ? { messageId: replyToMessage.id, text: replyToMessage.text.slice(0, 100), senderName: replyToMessage.senderName } : undefined,
        });
        setReplyToMessage(null);
        if (activeChat && chatDocIds[activeChat.id]) {
          void setTyping(chatDocIds[activeChat.id], currentUserId!, displayName || 'You', false);
        }
        if (type === 'text' && roastsEnabledChats[activeChat.id] !== false) {
          handleBotAction(text, chatDoc.$id);
        }
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
  };

  const handleSendVibe = (item: typeof VIBE_CELEBRATIONS[0]) => {
    setCelebrationEffect(item.emoji);
    setShowVibePicker(false);
    setShowEmojiPicker(false);
    handleSendMessage(`${item.emoji} ${item.label}`);
  };

  const toggleVoiceRecording = async () => {
    if (!activeChat || !currentUserId) return;
    if (isRecordingVoice && voiceRecorderRef.current) {
      const { recorder, chunks } = voiceRecorderRef.current;
      recorder.stop();
      voiceRecorderRef.current = null;
      setIsRecordingVoice(false);
      stream?.getTracks().forEach((t) => t.stop());
      setStream(null);
      if (chunks.length === 0) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      const file = new File([blob], `voice_${Date.now()}.webm`, { type: blob.type });
      const firestoreChatId = chatDocIds[activeChat.id] ?? (await getOrCreateChat({ userId: currentUserId, externalId: activeChat.id, name: activeChat.name, isRoom: activeChat.isRoom, currentUserDisplayName: displayName })).$id;
      if (!chatDocIds[activeChat.id]) setChatDocIds(prev => ({ ...prev, [activeChat.id]: firestoreChatId }));
      setIsUploadingMedia(true);
      try {
        const url = await uploadChatFile(firestoreChatId, currentUserId, file);
        await handleSendMessage('Voice message', 'audio', { audioUrl: url });
      } catch (err: any) {
        window.alert(err?.message || 'Failed to send voice message.');
      } finally {
        setIsUploadingMedia(false);
      }
      return;
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(mediaStream);
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(mediaStream, { mimeType: mime });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.start(200);
      voiceRecorderRef.current = { recorder, chunks };
      setIsRecordingVoice(true);
    } catch (err: any) {
      window.alert(err?.message || 'Microphone access needed for voice messages.');
    }
  };

  const [profilePicUploading, setProfilePicUploading] = useState(false);
  const [userAvatarCache, setUserAvatarCache] = useState<Record<string, string>>({});
  const getAvatarUrl = (uid: string) =>
    uid === currentUserId ? userAvatar : (userAvatarCache[uid] || `https://picsum.photos/seed/${encodeURIComponent(uid)}/200`);
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!currentUserId) {
      window.alert('Please sign in to update your profile photo.');
      return;
    }
    if (!file) return;
    setProfilePicUploading(true);
    try {
      const url = await uploadProfilePhoto(currentUserId, file);
      setUserAvatar(url);
      setUserAvatarCache((prev) => ({ ...prev, [currentUserId]: url }));
      if (auth.currentUser) {
        await authUpdateProfile(auth.currentUser, { photoURL: url });
      }
      try {
        await updateUserProfileCallable({ displayName: displayName || 'You', photoURL: url });
      } catch {
        // Cloud Function may not be deployed
      }
    } catch (err: any) {
      const code = err?.code || err?.message || '';
      const msg = err?.message || 'Unknown error';
      console.error('Profile photo upload failed:', { code, msg, err });
      window.alert(`Failed to update profile photo: ${msg}${code ? ` (${code})` : ''}`);
    } finally {
      setProfilePicUploading(false);
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
    setReplyToMessage(null);
    setMessageContextMenu(null);
    setChatMenuOpen(false);
    if (currentUserId) {
      loadChatFromBackend(item.id, item.name, isRoom).catch(err => console.error("Load chat error:", err));
    } else if (!chatMessages[item.id]) {
      handleBotAction(`new chat with ${item.name}`);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !currentUserId) return;
    setTribeCreateError(null);
    setTribeCreateLoading(true);
    try {
      const participantIds = selectedMembers.filter((id) => id && id !== currentUserId);
      const participantData: Record<string, { displayName: string }> = {
        [currentUserId]: { displayName: displayName || 'You' },
      };
      contacts.forEach((c) => {
        const uid = c.appUserId || (c.onBakchod ? c.id : null);
        if (uid && participantIds.includes(uid)) participantData[uid] = { displayName: c.name };
      });
      tribeSearchedUsers.forEach((u) => {
        if (participantIds.includes(u.id)) participantData[u.id] = { displayName: u.displayName || u.email || 'Unknown' };
      });
      const chat = await createRoom({
        name: newGroupName.trim(),
        ownerId: currentUserId,
        participantIds,
        participantData,
      });
      const newRoom: ActiveRoom = {
        id: chat.$id,
        name: newGroupName.trim(),
        membersCount: participantIds.length + 1,
        lastMessage: 'Tribe created! Let the bakchodi begin.',
        lastSender: 'YOU',
        isLive: false,
        avatar: `https://picsum.photos/seed/${encodeURIComponent(newGroupName)}/200`,
      };
      setRooms((prev) => [newRoom, ...prev.filter((r) => r.id !== chat.$id)]);
      setIsCreatingGroup(false);
      setNewGroupName('');
      setSelectedMembers([]);
      setTribeMemberSearch('');
      setTribeSearchedUsers([]);
      selectChat(newRoom, true);
    } catch (err: any) {
      const msg = err?.message || err?.code || 'Failed to create tribe. Please try again.';
      setTribeCreateError(msg);
      console.error('Create tribe error:', err);
    } finally {
      setTribeCreateLoading(false);
    }
  };

  const toggleMemberSelection = (id: string) => {
    setSelectedMembers(prev => 
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const startCall = async (mode: CallMode, contactOverride?: { id: string, name: string, avatar: string, isRoom: boolean }) => {
    const target = contactOverride || activeChat;
    if (!target || !currentUserId) return;

    let targetParticipantIds: string[] = [];
    if (target.isRoom) {
      const fid = chatDocIds[target.id] || target.id;
      try {
        const chatSnap = await getDoc(doc(db, 'chats', fid));
        const pids = chatSnap.exists() ? (chatSnap.data().participantIds || []) : [];
        targetParticipantIds = pids.filter((id: string) => id !== currentUserId);
      } catch {
        targetParticipantIds = [];
      }
    } else {
      const peerUid = contacts.find((c) => c.id === target.id || c.appUserId === target.id)?.appUserId || target.id;
      if (!peerUid || peerUid === currentUserId) {
        window.alert('Cannot call: contact must be on Bakchod and different from you.');
        return;
      }
      targetParticipantIds = [peerUid];
    }
    if (targetParticipantIds.length === 0 && target.isRoom) {
      window.alert('No other participants in this tribe.');
      return;
    }

    setCallDeclined(false);
    setIsCalling(true);
    setCallMode(mode);
    setIsCameraOff(mode === 'audio');

    const newHistoryItem: CallHistoryItem = {
      id: `h-${Date.now()}`,
      name: target.name,
      avatar: target.avatar,
      type: mode,
      timestamp: 'Just now',
      isMissed: false,
      contactId: target.id,
      isRoom: target.isRoom ?? false,
    };
    setCallHistory(prev => [newHistoryItem, ...prev]);
    if (!activeChat) setActiveChat({ id: target.id, name: target.name, avatar: target.avatar, isRoom: target.isRoom });

    try {
      const { callId, roomName } = await createCall({
        fromUserId: currentUserId,
        fromDisplayName: displayName || 'You',
        targetParticipantIds,
        targetChatId: target.isRoom ? target.id : undefined,
        isRoom: target.isRoom,
        mode: mode || 'video',
      });
      setOutgoingCallId(callId);
      if (callStatusUnsubRef.current) callStatusUnsubRef.current();
      callStatusUnsubRef.current = subscribeToCallStatus(callId, (doc) => {
        if (doc.status === 'accepted') {
          setActiveCallDoc({ $id: callId, roomName: doc.roomName || roomName, fromDisplayName: target.name, mode: mode || 'video', status: 'accepted' });
        } else if (doc.status === 'declined') {
          setCallDeclined(true);
          setIsCalling(false);
          setCallMode(null);
          setOutgoingCallId(null);
          if (callStatusUnsubRef.current) { callStatusUnsubRef.current(); callStatusUnsubRef.current = null; }
        }
      });
    } catch (err: any) {
      window.alert(err?.message || 'Failed to start call.');
      setIsCalling(false);
      setCallMode(null);
    }
  };

  const handleEndCall = async () => {
    const callId = activeCallDoc?.$id || outgoingCallId;
    if (callId) {
      try { await updateCallStatus(callId, activeCallDoc ? 'ended' : 'cancelled'); } catch {}
    }
    setActiveCallDoc(null);
    setOutgoingCallId(null);
    if (callStatusUnsubRef.current) { callStatusUnsubRef.current(); callStatusUnsubRef.current = null; }
    setCallEnded(true);
    setIsCalling(false);
    setCallMode(null);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setTimeout(() => setCallEnded(false), 2000);
  };

  const handleAcceptCall = async () => {
    if (!incomingCall || !currentUserId) return;
    const callId = incomingCall.$id;
    const mode = (incomingCall.mode as 'audio' | 'video') || 'video';
    try {
      await updateCallStatus(callId, 'accepted');
      setActiveCallDoc({ $id: callId, roomName: incomingCall.roomName, fromDisplayName: incomingCall.fromDisplayName, mode, status: 'accepted' });
      setIncomingCall(null);
      setIsCalling(true);
      setCallMode(mode);
    } catch (err: any) {
      window.alert(err?.message || 'Failed to accept.');
    }
  };

  const handleDeclineCall = async () => {
    if (!incomingCall) return;
    try { await updateCallStatus(incomingCall.$id, 'declined'); } catch {}
    setIncomingCall(null);
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
                    <div className="size-10 rounded-full bg-center bg-cover border border-white/10 overflow-hidden shrink-0" style={{ backgroundImage: `url(${contact.appUserId ? getAvatarUrl(contact.appUserId) : contact.avatar})` }} />
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
          <div
            onClick={() => setAvatarPreview({ url: userAvatar, name: displayName })}
            className="size-16 rounded-full border-2 border-accent-red p-1 shrink-0 cursor-pointer block overflow-hidden"
          >
            <img src={userAvatar} className="w-full h-full rounded-full object-cover" alt="avatar" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-white">{displayName}</p>
            <p className="text-[10px] text-accent-red font-bold uppercase tracking-widest">Level 99 Legend</p>
            <label className={`mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${profilePicUploading ? 'opacity-50' : 'bg-white/10 hover:bg-white/15 text-white'}`}>
              <input type="file" className="sr-only" accept="image/*" onChange={handleAvatarChange} disabled={profilePicUploading} />
              {profilePicUploading ? 'Uploading...' : 'Change photo'}
            </label>
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
            <button onClick={() => { setIsCreatingGroup(false); setTribeCreateError(null); setTribeMemberSearch(''); setTribeSearchedUsers([]); }} className="text-accent-red">
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
              <input
                value={tribeMemberSearch}
                onChange={(e) => setTribeMemberSearch(e.target.value)}
                placeholder="Search registered users..."
                className="w-full bg-accent-red/5 border-2 border-accent-red/30 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-red/20 transition-all"
              />
              <div className="grid grid-cols-1 gap-2 max-h-[320px] overflow-y-auto no-scrollbar pb-10">
                {tribeMemberSearch.trim() ? (
                  tribeSearchedUsers.length === 0 ? (
                    <div className="p-4 text-[10px] uppercase tracking-widest text-gray-500 bg-white/5 border border-white/10 rounded-xl">
                      No users found. Try a different search.
                    </div>
                  ) : (
                    tribeSearchedUsers.map((u) => (
                      <div
                        key={u.id}
                        onClick={() => toggleMemberSelection(u.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${selectedMembers.includes(u.id) ? 'bg-accent-red/10 border-accent-red' : 'bg-white/5 border-white/5'}`}
                      >
                        <div className="size-10 rounded-lg bg-cover border border-white/10" style={{ backgroundImage: `url(https://picsum.photos/seed/${encodeURIComponent(u.id)}/200)` }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold text-white truncate">{u.displayName || u.email || 'Unknown'}</p>
                          {u.email && <p className="text-[9px] text-gray-500 truncate">{u.email}</p>}
                        </div>
                        <div className={`size-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedMembers.includes(u.id) ? 'bg-accent-red border-accent-red' : 'border-white/20'}`}>
                          {selectedMembers.includes(u.id) && <span className="material-symbols-outlined text-white text-[12px] font-bold">check</span>}
                        </div>
                      </div>
                    ))
                  )
                ) : (
                  (() => {
                    const registeredContacts = contacts.filter((c) => c.onBakchod && (c.appUserId || c.id));
                    return registeredContacts.length === 0 ? (
                      <div className="p-4 text-[10px] uppercase tracking-widest text-gray-500 bg-white/5 border border-white/10 rounded-xl">
                        No registered contacts yet. Add contacts from chat or search above.
                      </div>
                    ) : (
                      registeredContacts.map((user) => {
                        const uid = user.appUserId || user.id;
                        return (
                          <div
                            key={uid}
                            onClick={() => toggleMemberSelection(uid)}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${selectedMembers.includes(uid) ? 'bg-accent-red/10 border-accent-red' : 'bg-white/5 border-white/5'}`}
                          >
                            <div className="size-10 rounded-lg bg-cover border border-white/10" style={{ backgroundImage: `url(${user.avatar})` }} />
                            <p className="text-[12px] font-bold text-white flex-1">{user.name}</p>
                            <div className={`size-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedMembers.includes(uid) ? 'bg-accent-red border-accent-red' : 'border-white/20'}`}>
                              {selectedMembers.includes(uid) && <span className="material-symbols-outlined text-white text-[12px] font-bold">check</span>}
                            </div>
                          </div>
                        );
                      })
                    );
                  })()
                )}
              </div>
            </div>
          </div>

          <div className="mt-auto p-6 bg-night-black border-t border-white/5 space-y-2">
            {tribeCreateError && (
              <p className="text-[10px] text-vibrant-pink uppercase tracking-wider">{tribeCreateError}</p>
            )}
            <button 
              type="button"
              disabled={!newGroupName.trim() || tribeCreateLoading}
              onClick={() => void handleCreateGroup()}
              className="w-full py-4 bg-accent-red text-white font-party text-xs uppercase tracking-[0.2em] rounded-2xl shadow-[0_10px_30px_rgba(255,0,60,0.3)] disabled:opacity-30 disabled:grayscale transition-all active:scale-95"
            >
              {tribeCreateLoading ? 'Creating...' : 'Assemble Tribe'}
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
      const messagesLoaded = activeChat.id in chatMessages;
      const rawMessages = chatMessages[activeChat.id] || [];
      const chatSearch = (chatSearchQuery || '').trim().toLowerCase();
      const messages = (chatSearch
        ? rawMessages.filter((m) => (m.text || '').toLowerCase().includes(chatSearch))
        : rawMessages).filter((m) => m.type !== 'roast');
      const lastReadByChat = chatLastReadAt[activeChat.id] || {};
      const otherUserIds = activeChat.isRoom
        ? (groupInfoData?.participantIds || []).filter((id) => id !== currentUserId)
        : Object.keys(lastReadByChat).filter((id) => id !== currentUserId);
      const isRead = (msg: Message) => {
        if (msg.senderId !== currentUserId || !msg.createdAt) return false;
        return otherUserIds.some((uid) => {
          const t = lastReadByChat[uid];
          return t && t.getTime() >= msg.createdAt!.getTime();
        });
      };
      return (
        <div className="flex-1 flex flex-col h-full bg-night-black border-2 border-accent-red rounded-xl shadow-[0_0_20px_rgba(255,0,60,0.3)] overflow-hidden">
          {/* Contact Header */}
          <div className="flex items-center gap-2 p-3 border-b border-accent-red/30 bg-night-panel/30 flex-wrap">
            <button onClick={() => {
              if (activeChat && currentUserId && (chatDocIds[activeChat.id] || (activeChat.isRoom && activeChat.id))) {
                const fid = chatDocIds[activeChat.id] || activeChat.id;
                void setTyping(fid, currentUserId, displayName || 'You', false);
              }
              setActiveChat(null);
            }} className="p-1 text-white/40 hover:text-white shrink-0">
              <span className="material-symbols-outlined text-xl">chevron_left</span>
            </button>
            <div
              className="size-10 rounded-full bg-center bg-cover border border-accent-red/20 shrink-0 cursor-pointer overflow-hidden"
              style={{ backgroundImage: `url(${activeChat.isRoom ? activeChat.avatar : getAvatarUrl(activeChat.id)})` }}
              onClick={() => setAvatarPreview({ url: activeChat.isRoom ? activeChat.avatar : getAvatarUrl(activeChat.id), name: activeChat.name })}
            />
            <div className="flex-1 min-w-0">
              <h2
                className={`text-sm font-bold text-white truncate ${activeChat.isRoom ? 'cursor-pointer' : ''}`}
                onClick={activeChat.isRoom ? async () => {
                  setGroupInfoOpen(true);
                  setGroupInfoLoading(true);
                  const fid = chatDocIds[activeChat.id] || activeChat.id;
                  try {
                    const data = await getRoomDetails(fid);
                    if (data) setGroupInfoData(data);
                    else setGroupInfoData(null);
                  } catch { setGroupInfoData(null); }
                  finally { setGroupInfoLoading(false); }
                } : undefined}
              >
                {activeChat.name}
              </h2>
              <p className="text-[10px] text-accent-red uppercase font-bold tracking-tighter">
                {isCalling
                  ? (callMode === 'video' ? 'Video Calling...' : 'Voice Calling...')
                  : activeChat.isRoom
                    ? 'Tribe Chat'
                    : (() => {
                        const lastReadByChat = chatLastReadAt[activeChat.id] || {};
                        const otherIds = Object.keys(lastReadByChat).filter((id) => id !== currentUserId);
                        const lastSeen = otherIds.length ? lastReadByChat[otherIds[0]] : null;
                        if (lastSeen) {
                          const sec = (Date.now() - lastSeen.getTime()) / 1000;
                          if (sec < 60) return 'Last seen just now';
                          if (sec < 3600) return `Last seen ${Math.floor(sec / 60)}m ago`;
                          if (sec < 86400) return `Last seen ${Math.floor(sec / 3600)}h ago`;
                          return `Last seen ${lastSeen.toLocaleDateString()}`;
                        }
                        return 'Active Now';
                      })()}
              </p>
            </div>
            {/* Voice & Video - hidden until CALLS_ENABLED */}
            {CALLS_ENABLED && !isCalling && (
              <div className="flex gap-1.5 shrink-0" role="group" aria-label="Call options">
                <button type="button" onClick={() => startCall('audio')} className="size-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-95" title={activeChat.isRoom ? 'Voice call tribe' : 'Voice call'}>
                  <span className="material-symbols-outlined text-lg">call</span>
                </button>
                <button type="button" onClick={() => startCall('video')} className="size-9 rounded-full bg-accent-red/20 flex items-center justify-center text-accent-red hover:bg-accent-red hover:text-white transition-all active:scale-95" title={activeChat.isRoom ? 'Video call tribe' : 'Video call'}>
                  <span className="material-symbols-outlined text-lg">videocam</span>
                </button>
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
            <div className="flex items-center gap-1 min-w-0">
              <input
                type="text"
                placeholder="Search..."
                value={chatSearchQuery}
                onChange={(e) => setChatSearchQuery(e.target.value)}
                className="w-20 min-w-0 flex-1 max-w-[100px] bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-accent-red/50"
              />
            </div>
            <div className="relative">
              <button onClick={() => setChatMenuOpen((o) => !o)} className="p-1 text-white/40 hover:text-white" title="Chat options">
                <span className="material-symbols-outlined text-lg">more_vert</span>
              </button>
              {chatMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setChatMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-night-panel border border-accent-red/30 rounded-xl shadow-xl py-1 min-w-[160px]">
                    <button
                      onClick={async () => {
                        const fid = chatDocIds[activeChat.id] || (activeChat.isRoom ? activeChat.id : null);
                        if (!fid || !currentUserId) return;
                        const next = !mutedChats[activeChat.id];
                        try {
                          await setChatMute(currentUserId, fid, next);
                          setMutedChats((prev) => ({ ...prev, [activeChat.id]: next }));
                        } catch { /* ignore */ }
                        setChatMenuOpen(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-[11px] font-bold text-white hover:bg-accent-red/20 flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base">{mutedChats[activeChat.id] ? 'notifications_off' : 'notifications'}</span>
                      {mutedChats[activeChat.id] ? 'Unmute' : 'Mute'} notifications
                    </button>
                    <button
                      onClick={async () => {
                        const fid = chatDocIds[activeChat.id] || (activeChat.isRoom ? activeChat.id : null);
                        if (!fid || !currentUserId) return;
                        const next = roastsEnabledChats[activeChat.id] === false;
                        try {
                          await setChatRoastsEnabled(currentUserId, fid, next);
                          setRoastsEnabledChats((prev) => ({ ...prev, [activeChat.id]: next }));
                        } catch { /* ignore */ }
                        setChatMenuOpen(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-[11px] font-bold text-white hover:bg-accent-red/20 flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base">local_fire_department</span>
                      {roastsEnabledChats[activeChat.id] === false ? 'Enable' : 'Disable'} roasts
                    </button>
                    <button onClick={handleClearChat} className="w-full px-4 py-2.5 text-left text-[11px] font-bold text-white hover:bg-accent-red/20 flex items-center gap-2">
                      <span className="material-symbols-outlined text-base">delete_sweep</span>
                      Clear chat (for me only)
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 p-3 overflow-y-auto no-scrollbar space-y-3 relative">
            {callDeclined ? (
              <div className="py-6 text-center">
                <p className="text-vibrant-pink text-[11px] font-bold uppercase">Call declined</p>
              </div>
            ) : isCalling && callMode === 'video' && !activeCallDoc ? (
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
                  <div className="absolute bottom-1.5 left-1.5 px-1 bg-accent-red text-[8px] rounded uppercase font-bold">Ringing...</div>
                </div>
              </div>
            ) : isCalling && callMode === 'audio' && !activeCallDoc ? (
              <div className="flex flex-col items-center justify-center py-8 bg-accent-red/5 rounded-xl border border-accent-red/10 mb-4 sticky top-0 z-20">
                <div className="size-20 rounded-full border-2 border-accent-red p-1 animate-vibe mb-4">
                  <img src={activeChat.avatar} className="w-full h-full rounded-full object-cover shadow-[0_0_20px_rgba(255,0,60,0.4)]" alt="avatar" />
                </div>
                <p className="text-accent-red text-[10px] font-bold uppercase tracking-widest animate-pulse">Ringing...</p>
              </div>
            ) : null}

            {/* Chat Log */}
            <div className="space-y-4">
              {messages.length === 0 && !isCalling && (
                <div className="text-center py-10 opacity-20">
                  {chatSearch ? (
                    <><span className="material-symbols-outlined text-5xl mb-2">search_off</span><p className="text-[10px] font-party uppercase">No messages match &quot;{chatSearchQuery}&quot;</p></>
                  ) : (
                    <><span className="material-symbols-outlined text-5xl mb-2">chat_bubble</span><p className="text-[10px] font-party uppercase">No messages yet. Say something!</p></>
                  )}
                </div>
              )}
              {messages.map((msg, idx) => {
                const prevDate = messages[idx - 1]?.createdAt;
                const currDate = msg.createdAt;
                const showDateSep = !prevDate || !currDate || prevDate.toDateString() !== currDate.toDateString();
                const dateLabel = currDate ? (currDate.toDateString() === new Date().toDateString() ? 'Today' : currDate.toDateString() === new Date(Date.now() - 864e5).toDateString() ? 'Yesterday' : currDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })) : '';
                const firestoreChatId = chatDocIds[activeChat.id] || (activeChat.isRoom ? activeChat.id : null);
                return (
                  <React.Fragment key={msg.id}>
                    {showDateSep && dateLabel && (
                      <div className="flex justify-center py-2">
                        <span className="text-[9px] text-gray-500 bg-white/5 px-3 py-1 rounded-full uppercase tracking-widest">{dateLabel}</span>
                      </div>
                    )}
                    <div
                      className={`flex flex-col ${msg.senderId === currentUserId ? 'items-end' : 'items-start'} group`}
                      onContextMenu={(e) => { e.preventDefault(); setMessageContextMenu({ msg, x: Math.min(e.clientX, window.innerWidth - 160), y: e.clientY }); }}
                    >
                      {activeChat.isRoom && msg.type !== 'roast' && (
                        <span className={`text-[10px] font-bold text-accent-red/80 mb-0.5 px-1 ${msg.senderId === currentUserId ? 'text-right' : 'text-left'}`}>
                          {msg.senderId === currentUserId ? 'You' : (msg.senderName || 'Unknown')}
                        </span>
                      )}
                      {msg.type === 'roast' && (
                        <span className="text-[10px] font-bold text-accent-red/80 mb-0.5 px-1 text-left">
                          ECSTASY BOT
                        </span>
                      )}
                      <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-[13px] leading-snug relative ${msg.type === 'roast' ? 'bg-accent-red/10 text-accent-red rounded-tl-none border-l-4 border-accent-red' : msg.senderId === currentUserId ? 'bg-accent-red text-white rounded-tr-none shadow-lg' : 'bg-white/5 text-white/80 rounded-tl-none border border-white/10'}`}>
                        {msg.replyTo && (
                          <div className={`mb-1.5 pl-2 border-l-2 ${msg.senderId === currentUserId ? 'border-white/40' : 'border-accent-red/40'}`}>
                            <p className="text-[9px] font-bold opacity-90">{msg.replyTo.senderName}</p>
                            <p className="text-[9px] opacity-75 truncate max-w-[200px]">{msg.replyTo.text}</p>
                          </div>
                        )}
                        {msg.type === 'image' && msg.imageUrl && (
                          <div className="mb-1.5">
                            <img src={msg.imageUrl} alt={msg.text || 'Image'} className="max-w-full max-h-[280px] rounded-xl object-contain" loading="lazy" />
                            {msg.text && msg.text !== 'Photo' && <p className="text-[10px] mt-1 opacity-90">{msg.text}</p>}
                          </div>
                        )}
                        {msg.type === 'video' && msg.imageUrl && (
                          <div className="mb-1.5">
                            <video src={msg.imageUrl} controls className="max-w-full max-h-[280px] rounded-xl" />
                            {msg.text && msg.text !== 'Video' && <p className="text-[10px] mt-1 opacity-90">{msg.text}</p>}
                          </div>
                        )}
                        {msg.type === 'file' && msg.imageUrl && (
                          <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[11px] underline break-all">
                            <span className="material-symbols-outlined text-base">description</span>
                            {msg.text && msg.text !== 'File' ? msg.text : 'File'}
                          </a>
                        )}
                        {msg.type === 'audio' && (msg.audioUrl || msg.imageUrl) && (
                          <div className="flex items-center gap-2">
                            <audio src={msg.audioUrl || msg.imageUrl} controls className="max-w-full h-8 min-w-[180px]" />
                          </div>
                        )}
                        {msg.type !== 'image' && msg.type !== 'video' && (msg.type !== 'file' || !msg.imageUrl) && msg.type !== 'audio' && msg.text}
                        {Object.keys(msg.reactions || {}).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {Object.entries(
                              Object.entries(msg.reactions || {}).reduce<Record<string, number>>((acc, [, emoji]) => {
                                acc[emoji] = (acc[emoji] || 0) + 1;
                                return acc;
                              }, {})
                            ).map(([emoji, count]) => (
                              <span key={emoji} className="text-xs bg-white/10 px-1.5 py-0.5 rounded-full" title={`${count} reaction${count > 1 ? 's' : ''}`}>{emoji} {count > 1 ? count : ''}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 px-1">
                        <span className="text-[10px] text-gray-600">{msg.timestamp}</span>
                        {msg.senderId === currentUserId && (
                          <span className="text-[10px] flex items-center" title={isRead(msg) ? 'Read' : 'Sent'}>
                            {isRead(msg) ? (
                              <span className="text-blue-400" aria-label="Read"><span className="material-symbols-outlined text-sm">done_all</span></span>
                            ) : (
                              <span className="text-gray-500" aria-label="Sent"><span className="material-symbols-outlined text-sm">done</span></span>
                            )}
                          </span>
                        )}
                        {firestoreChatId && (
                          <>
                            <button type="button" onClick={(e) => { e.stopPropagation(); const rect = (e.target as HTMLElement).getBoundingClientRect(); setMessageContextMenu({ msg, x: Math.min(rect.left, window.innerWidth - 160), y: rect.bottom + 4 }); }} className="p-0.5 rounded hover:bg-white/10 text-white/50 hover:text-accent-red opacity-60 hover:opacity-100" title="Message options">
                              <span className="material-symbols-outlined text-sm">more_horiz</span>
                            </button>
                            <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
                              {REACTION_EMOJIS.map((emoji) => (
                                <button key={emoji} onClick={() => void addMessageReaction(firestoreChatId, msg.id, currentUserId!, (msg.reactions || {})[currentUserId!] === emoji ? '' : emoji)} className="text-xs hover:scale-125 transition-transform" title="React">{emoji}</button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              {typingIndicators.length > 0 && (
                <div className="flex items-center gap-2 text-[10px] text-accent-red/80 animate-pulse">
                  <span className="flex gap-1"><span className="w-1 h-1 rounded-full bg-accent-red animate-bounce" /><span className="w-1 h-1 rounded-full bg-accent-red animate-bounce [animation-delay:0.2s]" /><span className="w-1 h-1 rounded-full bg-accent-red animate-bounce [animation-delay:0.4s]" /></span>
                  {typingIndicators.map((t) => t.displayName).filter(Boolean).join(', ')} typing...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Sticky Roast Insight */}
            <div className="sticky bottom-0 pt-2 pointer-events-none">
                <div className="glass-card rounded-xl p-3 border-l-4 border-accent-red pointer-events-auto shadow-[0_-5px_30px_rgba(0,0,0,0.6)]">
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="material-symbols-outlined text-accent-red text-base">smart_toy</span>
                        <span className="text-accent-red text-[10px] font-bold uppercase tracking-wider">ECSTASY BOT BURN</span>
                        {isLoadingRoast && <div className="ml-auto flex gap-1"><div className="size-1 rounded-full bg-accent-red animate-bounce" /><div className="size-1 rounded-full bg-accent-red animate-bounce [animation-delay:0.2s]" /><div className="size-1 rounded-full bg-accent-red animate-bounce [animation-delay:0.4s]" /></div>}
                    </div>
                    <p className="text-accent-red text-[13px] italic leading-tight">"{isLoadingRoast ? "Analyzing your bakchodi..." : displayRoast}"</p>
                </div>
            </div>
          </div>

          <div className="p-3 bg-night-black border-t border-accent-red/30 space-y-2">
            {replyToMessage && (
              <div className="flex items-center justify-between bg-accent-red/10 border border-accent-red/30 rounded-xl px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold text-accent-red uppercase">Replying to {replyToMessage.senderName}</p>
                  <p className="text-[10px] text-white/80 truncate">{replyToMessage.text.slice(0, 50)}{replyToMessage.text.length > 50 ? '...' : ''}</p>
                </div>
                <button type="button" onClick={() => setReplyToMessage(null)} className="text-accent-red p-1 hover:bg-accent-red/20 rounded-full">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
            )}
            {showEmojiPicker && (
              <div className="bg-night-panel border-2 border-accent-red rounded-2xl overflow-hidden animate-in slide-in-from-bottom-2 shadow-[0_0_30px_rgba(255,0,60,0.4)]">
                <div className="p-1 max-h-[320px] overflow-hidden [&_.EmojiPickerReact]:!shadow-none [&_.EmojiPickerReact]:!bg-transparent">
                  <EmojiPicker
                    theme={Theme.DARK}
                    width="100%"
                    height={320}
                    searchPlaceHolder="Search emoji"
                    onEmojiClick={(data) => setChatInput((prev) => prev + data.emoji)}
                    emojiStyle="native"
                    previewConfig={{ showPreview: false }}
                  />
                </div>
                <div className="p-2 border-t border-white/5">
                  <button onClick={() => setShowEmojiPicker(false)} className="w-full py-1.5 text-[10px] text-accent-red font-bold uppercase tracking-widest">Close</button>
                </div>
              </div>
            )}
            <input ref={chatAttachRef} type="file" accept="image/*,video/*,*/*" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file || !activeChat || !currentUserId) return;
              const firestoreChatId = chatDocIds[activeChat.id] ?? (await getOrCreateChat({ userId: currentUserId, externalId: activeChat.id, name: activeChat.name, isRoom: activeChat.isRoom, currentUserDisplayName: displayName })).$id;
              if (!chatDocIds[activeChat.id]) setChatDocIds(prev => ({ ...prev, [activeChat.id]: firestoreChatId }));
              setIsUploadingMedia(true);
              try {
                const url = await uploadChatFile(firestoreChatId, currentUserId, file);
                const isImage = (file.type || '').startsWith('image/');
                const isVideo = (file.type || '').startsWith('video/');
                const kind: 'image' | 'video' | 'file' = isImage ? 'image' : isVideo ? 'video' : 'file';
                await handleSendMessage(kind === 'file' ? file.name : '', kind, { imageUrl: url, fileName: file.name });
              } catch (err: any) {
                window.alert(err?.message || 'Upload failed.');
              } finally {
                setIsUploadingMedia(false);
              }
            }} />
            <form onSubmit={(e) => { e.preventDefault(); if (chatInput.trim()) { handleSendMessage(chatInput); setChatInput(""); } }} className="flex items-center gap-2 bg-accent-red/5 border-2 border-accent-red rounded-xl px-3 h-11 group focus-within:ring-2 focus:ring-accent-red/30 transition-all">
              <button type="button" onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowVibePicker(false); }} className={`text-accent-red/60 hover:text-accent-red transition-colors ${showEmojiPicker ? 'text-accent-red' : ''}`}>
                <span className="material-symbols-outlined text-xl">mood</span>
              </button>
              <button type="button" onClick={() => chatAttachRef.current?.click()} disabled={isUploadingMedia} className="text-accent-red/60 hover:text-accent-red disabled:opacity-50 transition-colors" title="Attach photo, video or file">
                <span className="material-symbols-outlined text-xl">{isUploadingMedia ? 'hourglass_empty' : 'attach_file'}</span>
              </button>
              <button type="button" onClick={toggleVoiceRecording} disabled={isUploadingMedia} className={`transition-colors ${isRecordingVoice ? 'text-accent-red animate-pulse' : 'text-accent-red/60 hover:text-accent-red'} disabled:opacity-50`} title={isRecordingVoice ? 'Stop and send' : 'Voice message'}>
                <span className="material-symbols-outlined text-xl">{isRecordingVoice ? 'stop_circle' : 'mic'}</span>
              </button>
              <input 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Say something savage..." 
                className="bg-transparent border-none focus:outline-none focus:ring-0 text-sm flex-1 text-white h-full p-0 placeholder:text-gray-500 font-bold min-w-0" 
              />
              <button type="submit" disabled={!chatInput.trim()} className="text-accent-red disabled:opacity-30 hover:scale-110 active:scale-90 transition-transform drop-shadow-[0_0_5px_rgba(255,0,60,0.5)] shrink-0">
                <span className="material-symbols-outlined text-2xl font-bold">send</span>
              </button>
              <button type="button" onClick={() => { setShowVibePicker(!showVibePicker); setShowEmojiPicker(false); }} className={`shrink-0 transition-colors ${showVibePicker ? 'text-accent-red' : 'text-accent-red/60 hover:text-accent-red'}`} title="Vibe">
                <span className="material-symbols-outlined text-xl">celebration</span>
              </button>
            </form>
            {/* Vibe picker - inline under form, only when open */}
            {showVibePicker && (
              <div className="bg-night-panel border-2 border-accent-red rounded-xl p-2 mt-1.5 shadow-[0_0_20px_rgba(255,0,60,0.3)]">
                <div className="grid grid-cols-5 gap-1.5 max-h-[160px] overflow-y-auto no-scrollbar">
                  {VIBE_CELEBRATIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSendVibe(item)}
                      className="flex flex-col items-center gap-0.5 p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-accent-red/20 hover:border-accent-red/50 transition-all active:scale-95"
                    >
                      <span className="text-lg">{item.emoji}</span>
                      <span className="text-[8px] font-bold text-white/90 truncate w-full text-center">{item.label}</span>
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setShowVibePicker(false)} className="mt-1.5 w-full py-1 text-[9px] text-accent-red font-bold uppercase tracking-widest">
                  Close
                </button>
              </div>
            )}
            {/* Full-screen celebration: strong border glow + confetti + emoji float */}
            {celebrationEffect && (
              <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden" aria-hidden>
                {/* Strong vibrant red border with pulsing glow */}
                <div
                  className="absolute inset-0 rounded-[3rem] border-4 border-accent-red"
                  style={{ animation: 'vibeBorderGlow 1.2s ease-in-out infinite' }}
                />
                {/* Emojis floating up - polished with varied sizes and drift */}
                {Array.from({ length: 40 }).map((_, i) => {
                  const x = 3 + (i % 11) * 8.5 + (i % 2) * 2;
                  const duration = 5 + (i % 5) * 0.6;
                  const delay = (i * 0.35) % 9;
                  const size = 10 + (i % 4) * 3;
                  return (
                    <div
                      key={i}
                      className="absolute bottom-0 left-0 text-center origin-center"
                      style={{
                        left: `${x}%`,
                        fontSize: size,
                        filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.6)) drop-shadow(0 0 12px rgba(255,0,60,0.3))',
                        animation: `emojiFloatUp ${duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite`,
                        animationDelay: `${delay}s`,
                      }}
                    >
                      {celebrationEffect}
                    </div>
                  );
                })}
              </div>
            )}
            {messageContextMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMessageContextMenu(null)} />
                <div className="fixed z-50 bg-night-panel border border-accent-red/30 rounded-xl shadow-xl py-1 min-w-[140px]" style={{ left: Math.min(messageContextMenu.x, window.innerWidth - 150), top: messageContextMenu.y + 140 > window.innerHeight ? messageContextMenu.y - 130 : messageContextMenu.y + 4 }}>
                  <button onClick={() => { setReplyToMessage(messageContextMenu.msg); setMessageContextMenu(null); }} className="w-full px-4 py-2 text-left text-[11px] font-bold text-white hover:bg-accent-red/20 flex items-center gap-2">
                    <span className="material-symbols-outlined text-base">reply</span> Reply
                  </button>
                  <button onClick={() => { navigator.clipboard?.writeText(messageContextMenu.msg.text); setMessageContextMenu(null); }} className="w-full px-4 py-2 text-left text-[11px] font-bold text-white hover:bg-accent-red/20 flex items-center gap-2">
                    <span className="material-symbols-outlined text-base">content_copy</span> Copy
                  </button>
                  {messageContextMenu.msg.senderId === currentUserId ? (
                    <>
                      <button onClick={() => handleDeleteForEveryone(messageContextMenu.msg)} className="w-full px-4 py-2 text-left text-[11px] font-bold text-vibrant-pink hover:bg-accent-red/20 flex items-center gap-2">
                        <span className="material-symbols-outlined text-base">delete_forever</span> Delete for everyone
                      </button>
                      <button onClick={() => handleDeleteForMe(messageContextMenu.msg)} className="w-full px-4 py-2 text-left text-[11px] font-bold text-white hover:bg-accent-red/20 flex items-center gap-2">
                        <span className="material-symbols-outlined text-base">delete</span> Delete for me
                      </button>
                    </>
                  ) : (
                    <button onClick={() => handleDeleteForMe(messageContextMenu.msg)} className="w-full px-4 py-2 text-left text-[11px] font-bold text-white hover:bg-accent-red/20 flex items-center gap-2">
                      <span className="material-symbols-outlined text-base">delete</span> Delete for me
                    </button>
                  )}
                  <div className="border-t border-white/10 my-1" />
                  <div className="px-3 py-1.5 flex gap-1">
                    {REACTION_EMOJIS.map((emoji) => (
                      <button key={emoji} onClick={() => { const fid = chatDocIds[activeChat!.id] || (activeChat!.isRoom ? activeChat!.id : null); if (fid) void addMessageReaction(fid, messageContextMenu.msg.id, currentUserId!, (messageContextMenu.msg.reactions || {})[currentUserId!] === emoji ? '' : emoji); setMessageContextMenu(null); }} className="text-lg hover:scale-125 transition-transform">{emoji}</button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Group Info Panel - WhatsApp-style */}
            {activeChat.isRoom && groupInfoOpen && (
              <div className="absolute inset-0 z-50 bg-night-black animate-in slide-in-from-right duration-300 flex flex-col">
                <div className="flex items-center gap-3 p-4 border-b border-white/5 bg-night-panel/50">
                  <button onClick={() => { setGroupInfoOpen(false); setGroupAddMemberOpen(false); }} className="text-accent-red p-1 rounded-full hover:bg-accent-red/10">
                    <span className="material-symbols-outlined">arrow_back</span>
                  </button>
                  <h2 className="text-sm font-party text-white uppercase tracking-widest">Group Info</h2>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar p-4">
                  {groupInfoLoading ? (
                    <div className="flex justify-center py-12"><div className="size-8 rounded-full border-2 border-accent-red border-t-transparent animate-spin" /></div>
                  ) : groupInfoData ? (
                    <>
                      <div className="flex flex-col items-center py-6 border-b border-white/5">
                        <input ref={groupAvatarInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file || !currentUserId || !groupInfoData) return;
                          try {
                            const url = await uploadGroupAvatar(groupInfoData.$id, currentUserId, file);
                            setGroupInfoData(prev => prev ? { ...prev, avatarUrl: url } : null);
                            setActiveChat(prev => prev && prev.id === groupInfoData.$id ? { ...prev, avatar: url } : prev);
                            setRooms(prev => prev.map(r => r.id === groupInfoData.$id ? { ...r, avatar: url } : r));
                          } catch (err: any) { window.alert(err?.message || 'Failed'); }
                        }} />
                        <div
                          onClick={() => (groupInfoData.participantIds || []).includes(currentUserId || '') && groupAvatarInputRef.current?.click()}
                          className={`relative ${(groupInfoData.participantIds || []).includes(currentUserId || '') ? 'cursor-pointer group' : ''}`}
                        >
                          <div className="size-20 rounded-full bg-center bg-cover border-2 border-accent-red/30 mb-3 overflow-hidden shrink-0" style={{ backgroundImage: `url(${groupInfoData.avatarUrl || activeChat.avatar})` }} />
                          {(groupInfoData.participantIds || []).includes(currentUserId || '') && (
                            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="material-symbols-outlined text-white text-2xl">add_a_photo</span>
                            </div>
                          )}
                        </div>
                        {groupNameEdit === groupInfoData.$id ? (
                          <div className="flex items-center gap-2 w-full max-w-[220px] mt-1">
                            <input
                              type="text"
                              value={groupNameEditValue}
                              onChange={(e) => setGroupNameEditValue(e.target.value)}
                              className="flex-1 bg-white/10 border border-accent-red/30 rounded-lg px-3 py-1.5 text-sm text-white font-bold focus:outline-none focus:ring-2 focus:ring-accent-red/50"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); document.getElementById('group-name-save')?.click(); }
                                if (e.key === 'Escape') { setGroupNameEdit(null); setGroupNameEditValue(''); }
                              }}
                              autoFocus
                            />
                            <button id="group-name-save" onClick={async () => {
                              const val = groupNameEditValue.trim();
                              if (!val || !currentUserId || !groupInfoData) return;
                              try {
                                await updateRoomName(groupInfoData.$id, currentUserId, val);
                                setGroupInfoData(prev => prev ? { ...prev, name: val } : null);
                                setActiveChat(prev => prev && prev.id === groupInfoData.$id ? { ...prev, name: val } : prev);
                                setRooms(prev => prev.map(r => r.id === groupInfoData.$id ? { ...r, name: val } : r));
                                setRecentChats(prev => prev.map(c => c.$id === groupInfoData.$id ? { ...c, name: val } : c));
                              } catch (err: any) { window.alert(err?.message || 'Failed'); }
                              setGroupNameEdit(null);
                              setGroupNameEditValue('');
                            }} className="px-3 py-1 bg-accent-red text-white text-[10px] font-bold rounded-lg">Save</button>
                            <button onClick={() => { setGroupNameEdit(null); setGroupNameEditValue(''); }} className="px-3 py-1 bg-white/10 text-white text-[10px] font-bold rounded-lg">Cancel</button>
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              if ((groupInfoData.participantIds || []).includes(currentUserId || '')) {
                                setGroupNameEditValue(groupInfoData.name);
                                setGroupNameEdit(groupInfoData.$id);
                              }
                            }}
                            className={`${(groupInfoData.participantIds || []).includes(currentUserId || '') ? 'cursor-pointer group/edit' : ''}`}
                          >
                            <p className="text-base font-bold text-white">{groupInfoData.name}</p>
                            {(groupInfoData.participantIds || []).includes(currentUserId || '') && (
                              <span className="text-[9px] text-accent-red/70 opacity-0 group-hover/edit:opacity-100">Tap to edit</span>
                            )}
                          </div>
                        )}
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">{groupInfoData.participantIds?.length || 0} participants</p>
                      </div>
                      <div className="py-4">
                        <div className="flex justify-between items-center mb-3">
                          <p className="text-[10px] font-party tracking-[0.2em] text-accent-red uppercase">Participants</p>
                          {(groupInfoData.adminIds || []).includes(currentUserId || '') && (
                            <button onClick={() => setGroupAddMemberOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-red/20 border border-accent-red/40 rounded-full text-accent-red text-[10px] font-bold uppercase">
                              <span className="material-symbols-outlined text-sm">person_add</span> Add
                            </button>
                          )}
                        </div>
                        <div className="space-y-2">
                          {groupInfoData.participantIds?.map((uid) => {
                            const name = groupInfoData.participantData?.[uid]?.displayName || (uid === currentUserId ? (displayName || 'You') : 'Unknown');
                            const isAdmin = (groupInfoData.adminIds || []).includes(uid);
                            const isOwner = groupInfoData.ownerId === uid;
                            const isMe = uid === currentUserId;
                            const iAmAdmin = (groupInfoData.adminIds || []).includes(currentUserId || '');
                            const canRemove = iAmAdmin && !isOwner && !isMe;
                            const canMakeAdmin = iAmAdmin && !isAdmin && !isOwner && !isMe;
                            const canDemoteAdmin = iAmAdmin && groupInfoData.ownerId === currentUserId && isAdmin && !isOwner;
                            return (
                              <div key={uid} className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/[0.07]">
                                <div className="size-10 rounded-full bg-center bg-cover border border-accent-red/20 shrink-0 overflow-hidden cursor-pointer" style={{ backgroundImage: `url(${getAvatarUrl(uid)})` }} onClick={() => setAvatarPreview({ url: getAvatarUrl(uid), name })} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12px] font-bold text-white truncate">{name}{isMe ? ' (You)' : ''}</p>
                                  <div className="flex gap-1.5 mt-0.5">
                                    {isOwner && <span className="text-[8px] bg-accent-red/30 text-accent-red px-1.5 py-0.5 rounded uppercase font-bold">Creator</span>}
                                    {isAdmin && !isOwner && <span className="text-[8px] bg-accent-red/20 text-accent-red px-1.5 py-0.5 rounded uppercase font-bold">Admin</span>}
                                  </div>
                                </div>
                                {!isMe && (canRemove || canMakeAdmin || canDemoteAdmin) && (
                                  <div className="flex gap-1 shrink-0">
                                    {canMakeAdmin && (
                                      <button onClick={async () => {
                                        if (!currentUserId || !groupInfoData) return;
                                        try {
                                          await updateRoomAdmin(groupInfoData.$id, currentUserId, uid, true);
                                          setGroupInfoData(prev => prev ? { ...prev, adminIds: [...(prev.adminIds || []), uid] } : null);
                                        } catch (e: any) { window.alert(e?.message || 'Failed'); }
                                      }} className="p-1.5 rounded-full bg-accent-red/20 text-accent-red hover:bg-accent-red/30" title="Make admin">
                                        <span className="material-symbols-outlined text-base">admin_panel_settings</span>
                                      </button>
                                    )}
                                    {canDemoteAdmin && (
                                      <button onClick={async () => {
                                        if (!currentUserId || !groupInfoData) return;
                                        try {
                                          await updateRoomAdmin(groupInfoData.$id, currentUserId, uid, false);
                                          setGroupInfoData(prev => prev ? { ...prev, adminIds: (prev.adminIds || []).filter(id => id !== uid) } : null);
                                        } catch (e: any) { window.alert(e?.message || 'Failed'); }
                                      }} className="p-1.5 rounded-full bg-white/10 text-gray-400 hover:bg-white/20" title="Remove as admin">
                                        <span className="material-symbols-outlined text-base">remove_moderator</span>
                                      </button>
                                    )}
                                    {canRemove && (
                                      <button onClick={async () => {
                                        if (!currentUserId || !groupInfoData || !window.confirm(`Remove ${name} from group?`)) return;
                                        try {
                                          await removeRoomMember(groupInfoData.$id, currentUserId, uid);
                                          setGroupInfoData(prev => {
                                            if (!prev) return null;
                                            const pd = { ...prev.participantData }; delete pd[uid];
                                            return { ...prev, participantIds: (prev.participantIds || []).filter(id => id !== uid), participantData: pd };
                                          });
                                          const rc = recentChats.find(c => c.$id === groupInfoData.$id);
                                          if (rc) setRecentChats(prev => prev.map(c => c.$id === groupInfoData.$id ? { ...c, participantIds: (c.participantIds || []).filter(id => id !== uid) } : c));
                                        } catch (e: any) { window.alert(e?.message || 'Failed'); }
                                      }} className="p-1.5 rounded-full bg-vibrant-pink/20 text-vibrant-pink hover:bg-vibrant-pink/30" title="Remove from group">
                                        <span className="material-symbols-outlined text-base">person_remove</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Add member modal */}
                      {groupAddMemberOpen && (
                        <div className="fixed inset-0 z-[60] bg-black/80 flex flex-col">
                          <div className="flex items-center gap-3 p-4 border-b border-white/5 bg-night-panel">
                            <button onClick={() => setGroupAddMemberOpen(false)} className="text-accent-red p-1"><span className="material-symbols-outlined">arrow_back</span></button>
                            <h3 className="text-sm font-bold text-white">Add participants</h3>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4">
                            <input value={tribeMemberSearch} onChange={(e) => setTribeMemberSearch(e.target.value)} placeholder="Search by name or email..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 mb-4" />
                            <div className="space-y-2">
                              {tribeSearchedUsers.filter(u => !groupInfoData!.participantIds?.includes(u.id)).map((u) => (
                                <div key={u.id} className="flex items-center gap-4 py-3 px-3 rounded-xl border border-white/5 hover:bg-white/5">
                                  <div className="size-10 rounded-full bg-center bg-cover border border-accent-red/20 overflow-hidden shrink-0" style={{ backgroundImage: `url(${getAvatarUrl(u.id)})` }} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-white truncate">{u.displayName || u.email || 'Unknown'}</p>
                                    {u.email && <p className="text-[10px] text-gray-500 truncate">{u.email}</p>}
                                  </div>
                                  <button onClick={async () => {
                                    if (!currentUserId || !groupInfoData) return;
                                    try {
                                      await addRoomMembers(groupInfoData.$id, currentUserId, [u.id], { [u.id]: { displayName: u.displayName || u.email || 'Unknown' } });
                                      setGroupInfoData(prev => prev ? { ...prev, participantIds: [...(prev.participantIds || []), u.id], participantData: { ...prev.participantData, [u.id]: { displayName: u.displayName || u.email || 'Unknown' } } } : null);
                                      setGroupAddMemberOpen(false);
                                      setTribeMemberSearch('');
                                      setTribeSearchedUsers([]);
                                    } catch (e: any) { window.alert(e?.message || 'Failed'); }
                                  }} className="px-4 py-2 bg-accent-red/20 border border-accent-red/40 rounded-full text-accent-red text-[10px] font-bold uppercase">Add</button>
                                </div>
                              ))}
                              {tribeMemberSearch.trim() && tribeSearchedUsers.length === 0 && !userSearchLoading && (
                                <p className="text-[10px] text-gray-500 py-4 text-center">No users found. Try a different search.</p>
                              )}
                              {!tribeMemberSearch.trim() && (
                                <p className="text-[10px] text-gray-500 py-4 text-center">Search for users to add.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-center text-gray-500 text-sm py-8">Could not load group info.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'party':
        return (
          <div className="flex flex-col">
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
            {recentChats.filter((c) => !c.isRoom).length > 0 && !searchQuery.trim() && (
              <div className="px-6 py-3 border-b border-white/5">
                <p className="text-[10px] font-party tracking-[0.2em] text-accent-red uppercase mb-2">Direct Chats</p>
                {recentChats.filter((c) => !c.isRoom).map((chat) => {
                  const otherId = chat.participantIds?.find((p) => p !== currentUserId) || chat.externalId || '';
                  const otherDisplayName = chat.participantData?.[otherId]?.displayName || chat.name || 'Unknown';
                  const lastMsgId = (chat as any).lastMessageId;
                  const deletedSet = messagesDeletedForMe[otherId];
                  const isLastDeleted = lastMsgId && deletedSet?.has(lastMsgId);
                  const previewText = chat.lastMessage ? (isLastDeleted ? 'Message deleted' : chat.lastMessage) : '';
                  const chatUser: User = {
                    id: otherId,
                    name: otherDisplayName.toUpperCase(),
                    avatar: getAvatarUrl(otherId),
                    status: 'online',
                    onBakchod: true,
                    appUserId: otherId,
                  };
                  return (
                    <div
                      key={chat.$id}
                      className="flex items-center gap-3 py-2.5 px-3 rounded-xl border border-white/5 hover:bg-white/5 group transition-colors mb-2 relative"
                    >
                      <div
                        className="flex flex-1 min-w-0 items-center gap-3 cursor-pointer"
                        onClick={() => selectChat(chatUser, false)}
                      >
                        <div className="relative shrink-0" onClick={(e) => { e.stopPropagation(); setAvatarPreview({ url: getAvatarUrl(otherId), name: otherDisplayName }); }}>
                          <div className="size-10 rounded-full bg-center bg-cover border border-accent-red/20 group-hover:border-accent-red/50 transition-all overflow-hidden shrink-0 cursor-pointer" style={{ backgroundImage: `url(${getAvatarUrl(otherId)})` }} />
                          {((chat as any).unreadCounts?.[currentUserId ?? ''] ?? 0) > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-accent-red text-white text-[10px] font-bold">
                              {Math.min((chat as any).unreadCounts?.[currentUserId ?? ''] ?? 0, 99)}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold text-white truncate">{otherDisplayName}</p>
                          {previewText && <p className={`text-[9px] truncate ${isLastDeleted ? 'text-gray-600 italic' : 'text-gray-500'}`}>{previewText}</p>}
                        </div>
                        <span className="material-symbols-outlined text-accent-red/60 text-lg shrink-0">chevron_right</span>
                      </div>
                      {CALLS_ENABLED && (
                        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => startCall('audio', { id: otherId, name: otherDisplayName, avatar: getAvatarUrl(otherId), isRoom: false })} className="size-8 rounded-full bg-white/10 flex items-center justify-center text-accent-red hover:bg-accent-red hover:text-white transition-all" title="Voice call">
                            <span className="material-symbols-outlined text-base">call</span>
                          </button>
                          <button type="button" onClick={() => startCall('video', { id: otherId, name: otherDisplayName, avatar: getAvatarUrl(otherId), isRoom: false })} className="size-8 rounded-full bg-accent-red/20 flex items-center justify-center text-accent-red hover:bg-accent-red hover:text-white transition-all" title="Video call">
                            <span className="material-symbols-outlined text-base">videocam</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="px-6 pt-4 pb-2 flex justify-between items-center">
              <p className="text-[10px] font-party tracking-[0.2em] text-accent-red uppercase">Tribes</p>
              <button onClick={() => setIsCreatingGroup(true)} className="flex items-center gap-1.5 px-3 py-1 bg-accent-red/10 border border-accent-red/20 rounded-full text-accent-red hover:bg-accent-red hover:text-white transition-all active:scale-95">
                <span className="material-symbols-outlined text-sm font-bold">group_add</span>
                <span className="text-[8px] font-black uppercase tracking-tighter">Create Tribe</span>
              </button>
            </div>
            {filteredRooms.map((room) => {
              const roomChat = recentChats.find((c) => c.isRoom && c.$id === room.id);
              const unread = roomChat ? ((roomChat as any).unreadCounts?.[currentUserId ?? ''] ?? 0) : 0;
              const lastMsgId = roomChat ? (roomChat as any).lastMessageId : null;
              const roomDeletedSet = messagesDeletedForMe[room.id];
              const isRoomLastDeleted = lastMsgId && roomDeletedSet?.has(lastMsgId);
              const roomPreview = room.lastMessage ? (isRoomLastDeleted ? 'Message deleted' : `${room.lastSender}: ${room.lastMessage}`) : '';
              return (
                <div key={room.id} className="flex items-center gap-3 px-6 py-3.5 border-b border-white/5 hover:bg-white/5 group transition-colors relative">
                  <div
                    className="flex flex-1 min-w-0 items-center gap-4 cursor-pointer"
                    onClick={() => selectChat(room, true)}
                  >
                    <div className="relative shrink-0" onClick={(e) => { e.stopPropagation(); setAvatarPreview({ url: room.avatar, name: room.name }); }}>
                      <div className="size-11 rounded-full bg-center bg-cover border border-white/10 group-hover:border-accent-red/50 transition-all group-hover:shadow-[0_0_15px_rgba(255,0,60,0.2)] overflow-hidden shrink-0 cursor-pointer" style={{ backgroundImage: `url(${room.avatar})` }} />
                      {unread > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-accent-red text-white text-[10px] font-bold">
                          {Math.min(unread, 99)}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center"><p className="text-[12px] font-bold text-white truncate">{room.name}</p>{room.isLive && <span className="text-accent-red text-[8px] font-black animate-pulse">LIVE</span>}</div>
                      {roomPreview && <p className={`text-[10px] truncate mt-1 ${isRoomLastDeleted ? 'text-gray-600 italic' : 'text-gray-500'}`}>{isRoomLastDeleted ? roomPreview : <><span className="text-accent-red/70 font-bold">{room.lastSender}:</span> {room.lastMessage}</>}</p>}
                    </div>
                  </div>
                  {CALLS_ENABLED && (
                    <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => startCall('audio', { id: room.id, name: room.name, avatar: room.avatar, isRoom: true })} className="size-8 rounded-full bg-white/10 flex items-center justify-center text-accent-red hover:bg-accent-red hover:text-white transition-all" title="Voice call tribe">
                        <span className="material-symbols-outlined text-base">call</span>
                      </button>
                      <button type="button" onClick={() => startCall('video', { id: room.id, name: room.name, avatar: room.avatar, isRoom: true })} className="size-8 rounded-full bg-accent-red/20 flex items-center justify-center text-accent-red hover:bg-accent-red hover:text-white transition-all" title="Video call tribe">
                        <span className="material-symbols-outlined text-base">videocam</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
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
                <div className="size-24 rounded-full border-4 border-accent-red p-1 mb-4 shadow-[0_0_30px_rgba(255,0,60,0.3)] cursor-pointer" onClick={() => setAvatarPreview({ url: contact.contactId?.startsWith('r-') ? contact.avatar : getAvatarUrl(contact.contactId), name: contact.name })}>
                  <img src={contact.contactId?.startsWith('r-') ? contact.avatar : getAvatarUrl(contact.contactId)} className="w-full h-full rounded-full object-cover" alt="avatar" />
                </div>
                <h3 className="text-xl font-party text-white tracking-widest neon-text mb-1 uppercase">{contact.name}</h3>
                <p className="text-[10px] text-accent-red font-bold uppercase tracking-[0.2em] mb-6">Elite Bakchod Legend</p>
                
                <div className={`grid gap-4 w-full ${CALLS_ENABLED ? 'grid-cols-3' : 'grid-cols-1 max-w-[140px] mx-auto'}`}>
                  {CALLS_ENABLED && (
                    <>
                      <button onClick={() => startCall('audio', { id: contact.contactId, name: contact.name, avatar: contact.contactId?.startsWith('r-') ? contact.avatar : getAvatarUrl(contact.contactId), isRoom: contact.isRoom ?? contact.contactId.startsWith('r-') })} className="flex flex-col items-center gap-2 group">
                        <div className="size-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-accent-red group-hover:bg-accent-red group-hover:text-white transition-all shadow-lg active:scale-95">
                          <span className="material-symbols-outlined">call</span>
                        </div>
                        <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Voice</span>
                      </button>
                      <button onClick={() => startCall('video', { id: contact.contactId, name: contact.name, avatar: contact.contactId?.startsWith('r-') ? contact.avatar : getAvatarUrl(contact.contactId), isRoom: contact.isRoom ?? contact.contactId.startsWith('r-') })} className="flex flex-col items-center gap-2 group">
                        <div className="size-12 rounded-2xl bg-accent-red/10 border border-accent-red/20 flex items-center justify-center text-accent-red group-hover:bg-accent-red group-hover:text-white transition-all shadow-[0_0_15px_rgba(255,0,60,0.2)] active:scale-95">
                          <span className="material-symbols-outlined">videocam</span>
                        </div>
                        <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Video</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => contact && addContactFromDetails(contact.contactId, contact.name, contact.contactId?.startsWith('r-') ? contact.avatar : getAvatarUrl(contact.contactId))}
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
                  {CALLS_ENABLED && (
                    <div className="flex gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); startCall('audio', { id: call.contactId, name: call.name, avatar: call.avatar, isRoom: call.isRoom ?? call.contactId.startsWith('r-') }); }}
                        className="size-9 rounded-full bg-white/5 flex items-center justify-center text-accent-red hover:bg-accent-red hover:text-white transition-all active:scale-90"
                      >
                        <span className="material-symbols-outlined text-base">call</span>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); startCall('video', { id: call.contactId, name: call.name, avatar: call.avatar, isRoom: call.isRoom ?? call.contactId.startsWith('r-') }); }}
                        className="size-9 rounded-full bg-accent-red/10 flex items-center justify-center text-accent-red hover:bg-accent-red hover:text-white transition-all active:scale-90"
                      >
                        <span className="material-symbols-outlined text-base">videocam</span>
                      </button>
                    </div>
                  )}
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
            <div
              onClick={() => setAvatarPreview({ url: userAvatar, name: displayName })}
              className="group relative cursor-pointer inline-block"
            >
              <div className="size-24 rounded-full border-4 border-accent-red p-1 mb-4 overflow-hidden shadow-[0_0_40px_rgba(255,0,60,0.5)] transition-transform group-hover:scale-105 active:scale-95 mx-auto">
                <img src={userAvatar} alt="me" className="w-full h-full rounded-full object-cover" />
              </div>
              <div className="absolute inset-0 top-0 left-1/2 -translate-x-1/2 size-24 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <span className="material-symbols-outlined text-white text-3xl">visibility</span>
              </div>
            </div>
            <p className="text-base font-party text-white uppercase tracking-widest">{displayName}</p>
            <div className="mt-3 px-4 py-1.5 bg-accent-red/10 border border-accent-red/20 rounded-full">
                <p className="text-[11px] text-accent-red uppercase font-black tracking-widest">Level 99 Legend</p>
            </div>
            <label className={`mt-6 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${profilePicUploading ? 'opacity-50 cursor-not-allowed' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'}`}>
              <input type="file" className="sr-only" accept="image/*" onChange={handleAvatarChange} disabled={profilePicUploading} />
              {profilePicUploading ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-sm">edit</span>}
              {profilePicUploading ? 'Uploading...' : 'Update Profile Pic'}
            </label>
            {isPushSupported() && currentUserId && (
              <button
                onClick={async () => {
                  const ok = await registerForPushNotifications(currentUserId);
                  window.alert(ok ? 'Push notifications enabled!' : 'Could not enable. Check permission and VAPID key.');
                }}
                className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-accent-red/10 border border-accent-red/30 rounded-xl text-[12px] font-bold text-accent-red hover:bg-accent-red/20 transition-all"
              >
                <span className="material-symbols-outlined text-sm">notifications</span>
                Enable push notifications
              </button>
            )}
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
      {activeCallDoc?.status === 'accepted' && (
        <div className="fixed inset-0 z-[90] bg-black flex flex-col">
          <div className="flex-1 min-h-0 p-4">
            <JitsiCallView
              roomName={activeCallDoc.roomName}
              displayName={displayName || 'You'}
              mode={activeCallDoc.mode}
              onEnd={handleEndCall}
              className="h-full"
            />
          </div>
          <div className="p-4 flex justify-center">
            <button onClick={handleEndCall} className="px-8 py-3 bg-vibrant-pink rounded-full text-white text-sm font-bold uppercase shadow-lg hover:bg-accent-red transition-colors">
              End Call
            </button>
          </div>
        </div>
      )}
      {avatarPreview && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setAvatarPreview(null)}
        >
          <button onClick={() => setAvatarPreview(null)} className="absolute top-4 right-4 size-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 z-10">
            <span className="material-symbols-outlined">close</span>
          </button>
          <div className="flex flex-col items-center max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
            <img src={avatarPreview.url} alt={avatarPreview.name || 'Profile'} className="max-w-full max-h-[85vh] w-auto h-auto object-contain rounded-2xl shadow-2xl" />
            {avatarPreview.name && <p className="mt-3 text-white text-sm font-bold uppercase tracking-widest">{avatarPreview.name}</p>}
          </div>
        </div>
      )}
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
      {incomingCall && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="w-full max-w-sm glass-card rounded-2xl border-2 border-accent-red p-6 text-center">
            <div className="size-20 rounded-full bg-accent-red/20 border-2 border-accent-red flex items-center justify-center mx-auto mb-4 animate-pulse">
              <span className="material-symbols-outlined text-accent-red text-4xl">{incomingCall.mode === 'audio' ? 'call' : 'videocam'}</span>
            </div>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Incoming {incomingCall.mode === 'audio' ? 'voice' : 'video'} call</p>
            <p className="text-lg font-bold text-white mb-6">{incomingCall.fromDisplayName || 'Someone'}</p>
            <div className="flex gap-4 justify-center">
              <button onClick={handleDeclineCall} className="size-14 rounded-full bg-vibrant-pink flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform">
                <span className="material-symbols-outlined text-2xl">call_end</span>
              </button>
              <button onClick={handleAcceptCall} className="size-14 rounded-full bg-green-600 flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform">
                <span className="material-symbols-outlined text-2xl">{incomingCall.mode === 'audio' ? 'call' : 'videocam'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
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

      {/* Mini Nav - compact when chat open */}
      <nav className={`sticky bottom-0 left-0 right-0 bg-night-black border-t border-white/5 flex items-center justify-center gap-12 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] transition-all ${activeChat ? 'h-11 px-4 py-1.5' : 'h-20 px-8 pb-5'}`}>
        <div onClick={() => {setActiveTab('party'); setActiveChat(null); setIsCalling(false); setIsCreatingGroup(false); setIsSettingsOpen(false); setActiveHistoryContactId(null);}} className={`flex flex-col items-center cursor-pointer transition-all active:text-vibrant-pink ${activeTab === 'party' && !activeChat && !isCreatingGroup && !isSettingsOpen ? 'text-vibrant-pink scale-110 shadow-[0_0_15px_rgba(255,0,160,0.3)]' : 'text-accent-red hover:text-vibrant-pink/80'} ${activeChat ? 'gap-0.5' : 'gap-1.5'}`} title="Party">
          <span className={`material-symbols-outlined font-bold ${activeChat ? 'text-lg' : 'text-2xl'}`}>nightlife</span>
          {!activeChat && <span className="text-[10px] font-bold font-party uppercase tracking-tight">Party</span>}
        </div>
        <div onClick={() => {setActiveTab('me'); setActiveChat(null); setIsCalling(false); setIsCreatingGroup(false); setIsSettingsOpen(true); setActiveHistoryContactId(null);}} className={`flex flex-col items-center cursor-pointer group transition-all active:text-vibrant-pink ${activeTab === 'me' ? 'text-vibrant-pink scale-110 shadow-[0_0_15px_rgba(255,0,160,0.3)]' : 'text-accent-red'} ${activeChat ? 'gap-0.5' : 'gap-1.5'}`} title="Me">
          <div className={`rounded-full border-2 overflow-hidden flex items-center justify-center shrink-0 transition-all active:border-vibrant-pink ${activeTab === 'me' ? 'border-vibrant-pink shadow-sm' : 'border-accent-red group-hover:border-vibrant-pink/50'} ${activeChat ? 'size-5' : 'size-6'}`}>
            <img src={userAvatar || 'https://picsum.photos/seed/me/200'} alt="Me" className="w-full h-full object-cover" />
          </div>
          {!activeChat && <span className="text-[10px] font-bold font-party uppercase tracking-tight">Me</span>}
        </div>
      </nav>
    </Layout>
  );
};

export default App;
