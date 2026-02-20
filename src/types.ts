export interface User {
  id: string;
  name: string;
  avatar: string;
  status: 'online' | 'offline' | 'vibing';
  role?: string;
  phone?: string;
  onBakchod?: boolean;
  appUserId?: string | null;
}

export interface ReplyTo {
  messageId: string;
  text: string;
  senderName: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  type: 'text' | 'image' | 'video' | 'file' | 'roast';
  imageUrl?: string;
  replyTo?: ReplyTo;
  reactions?: Record<string, string>;
  createdAt?: Date;
}

export interface ActiveRoom {
  id: string;
  name: string;
  membersCount: number;
  lastMessage: string;
  lastSender: string;
  isLive: boolean;
  avatar: string;
}
