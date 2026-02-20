import { useState, useRef, useEffect } from 'react';
import MessageInput from './MessageInput';
import './ChatView.css';

function formatMessageTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ChatView({ chat, messages, currentUserId, onSendMessage }) {
  const messagesEndRef = useRef(null);
  const [inputValue, setInputValue] = useState('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (text && chat) {
      onSendMessage(chat.id, text);
      setInputValue('');
    }
  };

  if (!chat) {
    return (
      <div className="chat-view empty">
        <div className="empty-state">
          <div className="empty-icon">💬</div>
          <h2>Bakchod</h2>
          <p>Send and receive messages without keeping your phone online.</p>
          <p className="empty-hint">Select a chat or start a new one to begin messaging</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-view">
      <div className="chat-header">
        <div className="chat-header-back">←</div>
        <div className="chat-header-avatar">
          {chat.otherUser?.photoURL ? (
            <img src={chat.otherUser.photoURL} alt={chat.otherUser.displayName} />
          ) : (
            <span>{chat.otherUser?.displayName?.charAt(0) || '?'}</span>
          )}
        </div>
        <div className="chat-header-info">
          <h3>{chat.otherUser?.displayName || 'Unknown'}</h3>
          <span className="chat-status">online</span>
        </div>
        <div className="chat-header-actions">
          <button className="icon-btn" aria-label="Video call">📹</button>
          <button className="icon-btn" aria-label="Voice call">📞</button>
          <button className="icon-btn" aria-label="Menu">⋮</button>
        </div>
      </div>

      <div className="chat-messages">
        <div className="chat-bg-pattern" />
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.senderId === currentUserId ? 'sent' : 'received'}`}
          >
            <div className="message-bubble">
              <p>{msg.text}</p>
              <span className="message-time">{formatMessageTime(msg.createdAt)}</span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <MessageInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
      />
    </div>
  );
}

export default ChatView;
