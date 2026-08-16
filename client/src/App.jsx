import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:5001');

function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [loggedIn, setLoggedIn] = useState(false);
  const [loginMode, setLoginMode] = useState(true);

  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);

  const [message, setMessage] = useState('');
  const [currentConversation, setCurrentConversation] = useState([]);

  const [authMessage, setAuthMessage] = useState('');
  const [search, setSearch] = useState('');
  
  const [chatPreviews, setChatPreviews] = useState({});


  // =========================
  // SOCKET LISTENERS
  // =========================

  useEffect(() => {
    socket.on('users_list', (onlineUsers) => {
      setUsers(onlineUsers);
    });

    socket.on('login_result', (result) => {
      if (result.success) {
        setUsername(result.username);
        setLoggedIn(true);
        setAuthMessage('');
      } else {
        setAuthMessage(result.message);
      }
    });
    

    socket.on('register_result', (result) => {
      if (result.success) {
        setAuthMessage(
          'Account created! You can now login.'
        );

        setLoginMode(true);
        setPassword('');
      } else {
        setAuthMessage(result.message);
      }
    });

   socket.on('receive_private_message', (data) => {
  setCurrentConversation((prev) => [
    ...prev,
    data
  ]);

  const otherUser =
    data.from === username
      ? data.to
      : data.from;

  setChatPreviews((prev) => ({
    ...prev,
    [otherUser]: {
      lastMessage: data.message,
      time: data.time,
      unread:
        data.from !== username &&
        selectedUser !== otherUser
          ? (prev[otherUser]?.unread || 0) + 1
          : 0
    }
  }));
});

    socket.on('conversation_history', (history) => {
      setCurrentConversation(history);
    });

    return () => {
      socket.off('users_list');
      socket.off('login_result');
      socket.off('register_result');
      socket.off('receive_private_message');
      socket.off('conversation_history');
    };
  }, []);
 

  // =========================
  // LOGIN
  // =========================

  const login = () => {
  const cleanUsername = username.trim();

  if (
    cleanUsername === '' ||
    password.trim() === ''
  ) {
    setAuthMessage('Enter username and password');
    return;
  }

  console.log('Sending login request for:', cleanUsername);

  socket.emit('login', {
    username: cleanUsername,
    password
  });
};

  // =========================
  // REGISTER
  // =========================

  const register = () => {
    if (
      username.trim() === '' ||
      password.trim() === ''
    ) {
      setAuthMessage(
        'Enter username and password'
      );
      return;
    }

    if (password.length < 6) {
      setAuthMessage(
        'Password must be at least 6 characters'
      );
      return;
    }

    const performRegister = () => {
      socket.emit('register', {
        username: username.trim(),
        password
      });
    };

    if (socket.connected) {
      performRegister();
    } else {
      socket.once('connect', performRegister);
      socket.connect();
    }
  };

  // =========================
  // LOGOUT
  // =========================

const logout = () => {
  console.log('Logging out:', username);

  socket.disconnect();

  window.location.reload();
};

  // =========================
  // SELECT USER
  // =========================

 const selectUser = (user) => {
  setSelectedUser(user);
  setCurrentConversation([]);

  // Clear unread count
  setChatPreviews((prev) => ({
    ...prev,
    [user]: {
      ...prev[user],
      unread: 0
    }
  }));

  socket.emit('get_conversation', {
    user1: username,
    user2: user
  });
};

  // =========================
  // SEND MESSAGE
  // =========================

  const sendMessage = () => {
    if (
      !selectedUser ||
      message.trim() === ''
    ) {
      return;
    }

    socket.emit('private_message', {
      to: selectedUser,
      from: username,
      message: message.trim()
    });

    setMessage('');
  };

  // =========================
  // FILTER USERS
  // =========================

const filteredUsers = users
  .filter((user) => user !== username)
  .sort((a, b) => {
    const timeA = chatPreviews[a]?.time
      ? new Date(chatPreviews[a].time).getTime()
      : 0;

    const timeB = chatPreviews[b]?.time
      ? new Date(chatPreviews[b].time).getTime()
      : 0;

    return timeB - timeA;
  })
  .filter((user) =>
    user
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  // =========================
  // LOGIN / REGISTER SCREEN
  // =========================

  if (!loggedIn) {
    return (
      <div className="login-page">
        <div className="login-card">

          <h1 className="login-title">
            Meety
          </h1>

          <p className="login-subtitle">
            {loginMode
              ? 'Welcome back'
              : 'Create your account'}
          </p>

          <input
            className="login-input"
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) =>
              setUsername(e.target.value)
            }
          />

          <input
            className="login-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                loginMode
                  ? login()
                  : register();
              }
            }}
          />

          {authMessage && (
            <p className="auth-message">
              {authMessage}
            </p>
          )}

          <button
            className="login-button"
            onClick={
              loginMode
                ? login
                : register
            }
          >
            {loginMode
              ? 'Login'
              : 'Create Account'}
          </button>

          <button
            className="switch-button"
            onClick={() => {
              setLoginMode(!loginMode);
              setAuthMessage('');
            }}
          >
            {loginMode
              ? 'Create a new account'
              : 'Back to Login'}
          </button>

        </div>
      </div>
    );
  }

  // =========================
  // CHAT APP
  // =========================

  return (
    <div className="chat-app">

      {/* SIDEBAR */}

      <aside className="sidebar">

        <div className="sidebar-header">
          <h2 className="app-title">
            💬 Meety
          </h2>

          <div className="current-user">
            Logged in as{' '}
            <strong>{username}</strong>
          </div>
        </div>

        <div className="search-container">
          <input
            className="search-input"
            type="text"
            placeholder="🔍 Search users..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
          />
        </div>

        <div className="user-list">

          {filteredUsers.map((user) => (
            <div
              key={user}
              className={`user-item ${
                selectedUser === user
                  ? 'active'
                  : ''
              }`}
              onClick={() =>
                selectUser(user)
              }
            >
              <div className="avatar">
                {user
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div>
                <div className="user-name">
                  {user}
                </div>

                <div className="online-status">
                  ● Online
                </div>
              </div>
            </div>
          ))}

        </div>

      </aside>

      {/* CHAT WINDOW */}

      <main className="chat-window">

        {/* HEADER */}

        <header className="chat-header">

          {selectedUser ? (
            <div className="chat-header-user">

              <div className="chat-header-avatar">
                {selectedUser
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div>
                <h2 className="chat-user-name">
                  {selectedUser}
                </h2>

                <div className="chat-user-status">
                  ● Online
                </div>
              </div>

            </div>
          ) : (
            <div>
              <h2 className="chat-user-name">
                Meety
              </h2>

              <div className="chat-user-status">
                Real-time messaging
              </div>
            </div>
          )}

          {/* PROFILE */}

          <div className="profile-area">

            <div className="profile-info">
              <div className="profile-name">
                {username}
              </div>

              <div className="profile-label">
                Online
              </div>
            </div>

            <div className="profile-avatar">
              {username
                .charAt(0)
                .toUpperCase()}
            </div>

            <button
              className="logout-button"
              onClick={logout}
            >
              Logout
            </button>

          </div>

        </header>

        {/* MESSAGES */}

        {selectedUser ? (
          <>
            <div className="messages">

              {currentConversation.map(
                (msg, index) => (
                  <div
                    key={index}
                    className={`message-row ${
                      msg.from === username
                        ? 'sent'
                        : 'received'
                    }`}
                  >

                    <div className="message-bubble">

                      <p className="message-text">
                        {msg.message}
                      </p>

                      <div className="message-time">
                        {new Date(
                          msg.time
                        ).toLocaleTimeString(
                          [],
                          {
                            hour: '2-digit',
                            minute: '2-digit'
                          }
                        )}
                      </div>

                    </div>

                  </div>
                )
              )}


            </div>

            {/* MESSAGE INPUT */}

            <div className="message-input-area">

              <input
                className="message-input"
                type="text"
                placeholder={`Message ${selectedUser}...`}
                value={message}
                onChange={(e) =>
                  setMessage(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    sendMessage();
                  }
                }}
              />

              <button
                className="send-button"
                onClick={sendMessage}
              >
                Send
              </button>

            </div>
          </>
        ) : (

          /* EMPTY STATE */

          <div className="empty-chat">

            <div>

              <div className="empty-chat-icon">
                💬
              </div>

              <h2>
                Welcome, {username} 👋
              </h2>

              <p>
                Select someone from the left
                to start chatting.
              </p>

            </div>

          </div>

        )}

      </main>

    </div>
  );
}

export default App;