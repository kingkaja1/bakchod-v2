import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import './ChatList.css';

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 172800000) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function ChatList({ chats, currentUser, activeChatId, onSelectChat, onNewChat }) {
  const { logout } = useAuth();
  const [search, setSearch] = useState('');

  const filteredChats = useMemo(() => {
    if (!search.trim()) return chats;
    const term = search.toLowerCase();
    return chats.filter((chat) => {
      const other = chat.otherUser;
      return other?.displayName?.toLowerCase().includes(term) || other?.email?.toLowerCase().includes(term);
    });
  }, [chats, search]);

  return (
    <div className="chat-list">
      <div className="chat-list-header">
        <div className="chat-list-avatar">
          <span>{currentUser?.displayName?.charAt(0) || 'Me'}</span>
        </div>
        <div className="chat-list-actions">
          <button className="icon-btn" aria-label="Status">○</button>
          <button className="icon-btn" aria-label="New chat" onClick={onNewChat}>+</button>
          <button className="icon-btn" aria-label="Logout" onClick={logout} title="Logout">⎋</button>
        </div>
      </div>
      <div className="chat-list-search">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          placeholder="Search or start new chat"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="chat-list-items">
        {filteredChats.map((chat) => (
          <div
            key={chat.id}
            className={`chat-item ${activeChatId === chat.id ? 'active' : ''}`}
            onClick={() => onSelectChat(chat.id)}
          >
            <div className="chat-item-avatar">
              {chat.otherUser?.photoURL ? (
                <img src={chat.otherUser.photoURL} alt={chat.otherUser.displayName} />
              ) : (
                <span>{chat.otherUser?.displayName?.charAt(0) || '?'}</span>
              )}
            </div>
            <div className="chat-item-content">
              <div className="chat-item-top">
                <span className="chat-item-name">{chat.otherUser?.displayName || 'Unknown'}</span>
                <span className="chat-item-time">{formatTime(chat.lastMessageAt)}</span>
              </div>
              <div className="chat-item-preview">
                {chat.lastMessage?.text || 'No messages yet'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ChatList;
