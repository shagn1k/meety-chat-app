import { useState, useEffect, useRef } from 'react';
import socket from './socket';
import AuthScreen from './components/AuthScreen';
import FieldOnboarding from './components/FieldOnboarding';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import './App.css';

function App() {
  // ── Auth state ──────────────────────────────────────────────
  const [loggedIn, setLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [currentField, setCurrentField] = useState('');
  const [needsField, setNeedsField] = useState(false);
  const [loginError, setLoginError] = useState('');

  // ── Online users ────────────────────────────────────────────
  const [onlineUsers, setOnlineUsers] = useState([]);

  // ── Chat request flow ───────────────────────────────────────
  // selectedUser: the user we clicked on but haven't been accepted by yet
  const [selectedUser, setSelectedUser] = useState(null);
  // chatPartner: confirmed active chat partner
  const [chatPartner, setChatPartner] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  // incomingRequest: someone ELSE requesting a chat with us
  const [incomingRequest, setIncomingRequest] = useState(null);

  // ── Messages ─────────────────────────────────────────────────
  const [messages, setMessages] = useState([]);

  // ── Toast / notification ─────────────────────────────────────
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  // Stable ref to currentUser for use inside socket callbacks
  const currentUserRef = useRef('');
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  // ─────────────────────────────────────────────────────────────
  // SOCKET LISTENERS — registered once, cleaned up on unmount
  // We explicitly remove before adding (defensive deduplication)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    // ── Login result ──────────────────────────────────────────
    const onLoginResult = (result) => {
      if (result.success) {
        setLoginError('');
        setCurrentUser(result.username);
        setLoggedIn(true);
        currentUserRef.current = result.username;

        if (!result.field || result.field.trim() === '') {
          setNeedsField(true);
        } else {
          setCurrentField(result.field);
          setNeedsField(false);
        }
      } else {
        setLoginError(result.message);
      }
    };

    // ── Online users list ────────────────────────────────────
    const onOnlineUsers = (users) => {
      setOnlineUsers(users);
    };

    // ── Incoming chat request (we are the TARGET / receiver) ──
    // The backend sends this ONLY to the target's socket via io.to(targetSocketId).
    // This must NEVER fire on the requester (Alice's) side.
    const onChatRequestReceived = (data) => {
      // Extra safety guard: ignore if we somehow triggered our own request
      if (data.fromUsername === currentUserRef.current) return;
      setIncomingRequest(data);
      showToast(`${data.fromUsername} wants to chat with you!`, 'request');
    };

    // ── Chat request sent (we are the SENDER / requester) ────
    // This fires on Alice's socket only — just show a waiting state.
    const onChatRequestSent = ({ toUsername }) => {
      // Already set selectedUser in handleSelectUser; just show toast.
      showToast(`Chat request sent to ${toUsername}. Waiting for response...`, 'info');
    };

    // ── Chat request failed ──────────────────────────────────
    const onChatRequestFailed = ({ reason }) => {
      showToast(reason, 'error');
      setSelectedUser(null);
    };

    // ── Chat accepted (fires on BOTH users) ──────────────────
    const onChatAccepted = ({ withUsername, withField }) => {
      const partner = { username: withUsername, field: withField };
      setChatPartner(partner);
      setIsBusy(true);
      setIncomingRequest(null);
      setSelectedUser(null);
      setMessages([]);
      socket.emit('get_conversation', {
        user1: currentUserRef.current,
        user2: withUsername
      });
      showToast(`Chat started with ${withUsername}!`, 'success');
    };

    // ── Chat rejected (fires only on the requester) ──────────
    const onChatRejected = ({ byUsername }) => {
      setSelectedUser(null);
      showToast(`${byUsername} declined your chat request`, 'error');
    };

    // ── Chat ended (fires on both participants) ───────────────
    const onChatEnded = ({ reason }) => {
      setIsBusy(false);
      setChatPartner(null);
      setSelectedUser(null);
      setIncomingRequest(null);
      setMessages([]);
      showToast(reason || 'Chat ended', 'info');
    };

    // ── Private message ───────────────────────────────────────
    const onReceivePrivateMessage = (data) => {
      setMessages((prev) => [...prev, data]);
    };

    // ── Conversation history ──────────────────────────────────
    const onConversationHistory = (history) => {
      setMessages(history);
    };

    // Defensive: remove any stale listeners before registering
    socket.off('login_result');
    socket.off('online_users');
    socket.off('chat_request_received');
    socket.off('chat_request_sent');
    socket.off('chat_request_failed');
    socket.off('chat_accepted');
    socket.off('chat_rejected');
    socket.off('chat_ended');
    socket.off('receive_private_message');
    socket.off('conversation_history');

    socket.on('login_result', onLoginResult);
    socket.on('online_users', onOnlineUsers);
    socket.on('chat_request_received', onChatRequestReceived);
    socket.on('chat_request_sent', onChatRequestSent);
    socket.on('chat_request_failed', onChatRequestFailed);
    socket.on('chat_accepted', onChatAccepted);
    socket.on('chat_rejected', onChatRejected);
    socket.on('chat_ended', onChatEnded);
    socket.on('receive_private_message', onReceivePrivateMessage);
    socket.on('conversation_history', onConversationHistory);

    return () => {
      socket.off('login_result', onLoginResult);
      socket.off('online_users', onOnlineUsers);
      socket.off('chat_request_received', onChatRequestReceived);
      socket.off('chat_request_sent', onChatRequestSent);
      socket.off('chat_request_failed', onChatRequestFailed);
      socket.off('chat_accepted', onChatAccepted);
      socket.off('chat_rejected', onChatRejected);
      socket.off('chat_ended', onChatEnded);
      socket.off('receive_private_message', onReceivePrivateMessage);
      socket.off('conversation_history', onConversationHistory);
    };
  }, []); // stable empty-dep: all state access is via refs or setters

  // ─────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────

  const handleFieldSaved = (field) => {
    setCurrentField(field);
    setNeedsField(false);
  };

  const handleSelectUser = (user) => {
    if (isBusy) {
      showToast('You are already in a chat. End it first.', 'error');
      return;
    }
    if (user.status === 'busy') {
      showToast(`${user.username} is currently busy`, 'error');
      return;
    }
    // Set selectedUser immediately so the "waiting" UI shows
    setSelectedUser(user);
    setIncomingRequest(null); // clear any stale incoming request
    socket.emit('request_chat', {
      fromUsername: currentUser,
      toUsername: user.username
    });
  };

  const handleAcceptRequest = (fromSocketId) => {
    socket.emit('accept_chat', { fromSocketId });
  };

  const handleRejectRequest = (fromSocketId) => {
    socket.emit('reject_chat', { fromSocketId });
    setIncomingRequest(null);
  };

  const handleEndChat = () => {
    socket.emit('end_chat');
    // Backend will emit chat_ended back to both users; that handler clears state
  };

  const handleLogout = () => {
    socket.emit('logout');
    socket.disconnect();
    window.location.reload();
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  if (!loggedIn) {
    return <AuthScreen loginError={loginError} clearLoginError={() => setLoginError('')} />;
  }

  if (needsField) {
    return <FieldOnboarding username={currentUser} onFieldSaved={handleFieldSaved} />;
  }

  return (
    <div className="app-layout">
      {/* TOAST */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.msg}
        </div>
      )}

      <Sidebar
        currentUser={currentUser}
        currentField={currentField}
        onlineUsers={onlineUsers}
        selectedUser={chatPartner || selectedUser}
        onSelectUser={handleSelectUser}
        onLogout={handleLogout}
      />

      <ChatWindow
        currentUser={currentUser}
        currentField={currentField}
        selectedUser={selectedUser}
        chatPartner={chatPartner}
        isBusy={isBusy}
        messages={messages}
        incomingRequest={incomingRequest}
        onAcceptRequest={handleAcceptRequest}
        onRejectRequest={handleRejectRequest}
        onEndChat={handleEndChat}
        onLogout={handleLogout}
      />
    </div>
  );
}

export default App;