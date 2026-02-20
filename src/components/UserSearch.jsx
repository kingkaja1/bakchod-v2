import { useState, useEffect } from 'react';
import { searchUsers, getOrCreateChat } from '../firebase/firestore';
import { useAuth } from '../context/AuthContext';
import './UserSearch.css';

function UserSearch({ onClose, onSelectChat }) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!search.trim()) {
      setUsers([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchUsers(search, user.uid);
        setUsers(results);
      } catch (err) {
        console.error('Search failed:', err);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, user.uid]);

  const handleStartChat = async (otherUser) => {
    setCreating(otherUser.id);
    try {
      const chat = await getOrCreateChat(
        user.uid,
        { displayName: user.displayName, email: user.email },
        otherUser.id,
        { displayName: otherUser.displayName, email: otherUser.email }
      );
      if (chat) {
        onSelectChat(chat.id, { ...otherUser, id: otherUser.id });
        onClose();
      }
    } catch (err) {
      console.error('Failed to create chat:', err);
    } finally {
      setCreating(null);
    }
  };

  return (
    <div className="user-search-overlay" onClick={onClose}>
      <div className="user-search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="user-search-header">
          <h3>New chat</h3>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="user-search-input">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="user-search-results">
          {loading && <div className="search-loading">Searching...</div>}
          {!loading && search.trim() && users.length === 0 && (
            <div className="search-empty">
              <p>No users found</p>
              <p className="search-hint">Both users must sign in at least once to appear in search. Try searching by email or display name.</p>
            </div>
          )}
          {!loading &&
            users.map((u) => (
              <div
                key={u.id}
                className="user-search-item"
                onClick={() => handleStartChat(u)}
              >
                <div className="user-search-avatar">
                  {u.photoURL ? (
                    <img src={u.photoURL} alt={u.displayName} />
                  ) : (
                    <span>{u.displayName?.charAt(0) || '?'}</span>
                  )}
                </div>
                <div className="user-search-info">
                  <span className="user-search-name">{u.displayName || 'Unknown'}</span>
                  <span className="user-search-email">{u.email}</span>
                </div>
                {creating === u.id && <span className="creating">...</span>}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

export default UserSearch;
