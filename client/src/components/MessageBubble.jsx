export default function MessageBubble({ msg, currentUser }) {
  const isSent = msg.from === currentUser;

  const time = new Date(msg.time).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className={`msg-row${isSent ? ' sent' : ' received'}`}>
      <div className="msg-bubble">
        <p className="msg-text">{msg.message}</p>
        <span className="msg-time">{time}</span>
      </div>
    </div>
  );
}
