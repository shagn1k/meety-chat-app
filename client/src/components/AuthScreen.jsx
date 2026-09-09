import { useState, useEffect } from 'react';
import socket from '../socket';

export default function AuthScreen({ loginError, clearLoginError }) {
  const [loginMode, setLoginMode] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localMessage, setLocalMessage] = useState('');
  const [localType, setLocalType] = useState('error');

  useEffect(() => {
    const onRegisterResult = (result) => {
      if (result.success) {
        setLocalType('success');
        setLocalMessage('Account created! You can now log in.');
        setLoginMode(true);
        setPassword('');
      } else {
        setLocalType('error');
        setLocalMessage(result.message);
      }
    };

    socket.on('register_result', onRegisterResult);
    return () => socket.off('register_result', onRegisterResult);
  }, []);

  // Show login errors passed from parent (App.jsx)
  const displayMessage = loginError || localMessage;
  const displayType = loginError ? 'error' : localType;

  const login = () => {
    const clean = username.trim();
    if (!clean || !password.trim()) {
      setLocalType('error');
      setLocalMessage('Enter username and password');
      if (clearLoginError) clearLoginError();
      return;
    }
    setLocalMessage('');
    if (clearLoginError) clearLoginError();
    socket.emit('login', { username: clean, password });
  };

  const register = () => {
    if (!username.trim() || !password.trim()) {
      setLocalType('error');
      setLocalMessage('Enter username and password');
      if (clearLoginError) clearLoginError();
      return;
    }
    if (password.length < 6) {
      setLocalType('error');
      setLocalMessage('Password must be at least 6 characters');
      if (clearLoginError) clearLoginError();
      return;
    }
    setLocalMessage('');
    if (clearLoginError) clearLoginError();
    socket.emit('register', { username: username.trim(), password });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      loginMode ? login() : register();
    }
  };

  const toggleMode = () => {
    setLoginMode(!loginMode);
    setLocalMessage('');
    setUsername('');
    setPassword('');
    if (clearLoginError) clearLoginError();
  };

  return (
    <div className="auth-page">
      <div className="auth-blob auth-blob-1" />
      <div className="auth-blob auth-blob-2" />

      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-icon">✦</span>
          <span className="auth-logo-name">Meety</span>
        </div>

        <h1 className="auth-title">
          {loginMode ? 'Welcome back' : 'Create account'}
        </h1>
        <p className="auth-subtitle">
          {loginMode
            ? 'Sign in to connect with people in your field'
            : 'Join Meety and start meaningful conversations'}
        </p>

        <div className="auth-fields">
          <div className="auth-field-group">
            <label className="auth-label">Username</label>
            <input
              className="auth-input"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="username"
            />
          </div>

          <div className="auth-field-group">
            <label className="auth-label">Password</label>
            <input
              className="auth-input"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete={loginMode ? 'current-password' : 'new-password'}
            />
          </div>
        </div>

        {displayMessage && (
          <p className={`auth-msg auth-msg-${displayType}`}>{displayMessage}</p>
        )}

        <button
          className="auth-btn-primary"
          onClick={loginMode ? login : register}
        >
          {loginMode ? 'Sign in' : 'Create account'}
        </button>

        <button
          className="auth-btn-ghost"
          onClick={toggleMode}
        >
          {loginMode ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
