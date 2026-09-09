import { useState } from 'react';
import UserCard from './UserCard';
import socket from '../socket';

export default function Sidebar({
  currentUser,
  currentField,
  onlineUsers,
  selectedUser,
  onSelectUser,
  onLogout
}) {
  const [search, setSearch] = useState('');

  const initials = currentUser.charAt(0).toUpperCase();

  const filtered = onlineUsers
    .filter((u) => u.username !== currentUser)
    .filter((u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      (u.field || '').toLowerCase().includes(search.toLowerCase())
    );

  const handleRefresh = () => {
    socket.emit('refresh_online_users');
  };

  return (
    <aside className="sidebar">
      {/* HEADER */}
      <div className="sb-header">
        <div className="sb-logo">
          <span className="sb-logo-mark">✦</span>
          <span className="sb-logo-text">Meety</span>
        </div>
      </div>

      {/* CURRENT USER PROFILE */}
      <div className="sb-profile">
        <div className="sb-profile-avatar">{initials}</div>
        <div className="sb-profile-info">
          <div className="sb-profile-name">{currentUser}</div>
          <span className="sb-profile-field">{currentField || 'No field'}</span>
        </div>
        <button className="sb-logout-btn" onClick={onLogout} title="Log out">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      {/* SEARCH + REFRESH */}
      <div className="sb-search-row">
        <div className="sb-search-wrap">
          <svg className="sb-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="sb-search"
            type="text"
            placeholder="Search users or fields..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          className="sb-refresh-btn"
          onClick={handleRefresh}
          title="Refresh online users"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>

      {/* ONLINE USERS LABEL */}
      <div className="sb-section-label">
        <span>Online Users</span>
        <span className="sb-count">{filtered.length}</span>
      </div>

      {/* USER LIST */}
      <div className="sb-user-list">
        {filtered.length === 0 ? (
          <div className="sb-empty">
            {search ? 'No users match your search' : 'No other users online'}
          </div>
        ) : (
          filtered.map((user) => (
            <UserCard
              key={user.username}
              user={user}
              isSelected={selectedUser?.username === user.username}
              onSelect={onSelectUser}
              isSelf={false}
            />
          ))
        )}
      </div>
    </aside>
  );
}
