import { User, ActiveRoom } from './types';

export const MOCK_USERS: User[] = [
  { id: '1', name: 'YOU', avatar: 'https://picsum.photos/seed/you/200', status: 'online' },
  { id: '2', name: 'RAHUL', avatar: 'https://picsum.photos/seed/rahul/200', status: 'vibing' },
  { id: '3', name: 'PRIYA', avatar: 'https://picsum.photos/seed/priya/200', status: 'offline' },
  { id: '4', name: 'GANG', avatar: 'https://picsum.photos/seed/gang/200', status: 'online' },
  { id: '5', name: 'ADITI', avatar: 'https://picsum.photos/seed/aditi/200', status: 'online' },
];

export const MOCK_ROOMS: ActiveRoom[] = [
  {
    id: 'r1',
    name: 'THE BOYS 🍻',
    membersCount: 8,
    lastMessage: 'Shots on me tonight? 🥃',
    lastSender: 'Vicky',
    isLive: true,
    avatar: 'https://picsum.photos/seed/boys/200',
  },
  {
    id: 'r2',
    name: 'Late Night Legends',
    membersCount: 4,
    lastMessage: 'Who is up for some FIFA? 🎮',
    lastSender: 'Kabir',
    isLive: false,
    avatar: 'https://picsum.photos/seed/legends/200',
  },
  {
    id: 'r3',
    name: 'Work Sucks 💼',
    membersCount: 12,
    lastMessage: 'Meeting at 9am tomorrow...',
    lastSender: 'Amit',
    isLive: false,
    avatar: 'https://picsum.photos/seed/work/200',
  }
];
