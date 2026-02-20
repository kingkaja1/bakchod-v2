import './MessageInput.css';

function MessageInput({ value, onChange, onSend }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="message-input-container">
      <div className="message-input">
        <button className="input-action" aria-label="Emoji">😊</button>
        <button className="input-action" aria-label="Attach">📎</button>
        <input
          type="text"
          placeholder="Type a message"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="send-btn"
          onClick={onSend}
          aria-label="Send"
          disabled={!value.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

export default MessageInput;
