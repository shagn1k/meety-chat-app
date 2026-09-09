export default function UserCard({ user, isSelected, onSelect, isSelf }) {
  if (isSelf) return null;

  const isBusy = user.status === 'busy';
  const initials = user.username.charAt(0).toUpperCase();

  const avatarColors = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
    '#10b981', '#3b82f6', '#ef4444', '#14b8a6'
  ];
  const colorIndex =
    user.username.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) %
    avatarColors.length;
  const avatarColor = avatarColors[colorIndex];

  return (
    <div
      className={`user-card${isSelected ? ' selected' : ''}${isBusy ? ' busy' : ''}`}
      onClick={() => !isBusy && onSelect(user)}
      title={isBusy ? `${user.username} is currently busy` : `Chat with ${user.username}`}
    >
      <div className="uc-avatar-wrap">
        <div
          className="uc-avatar"
          style={{ background: avatarColor }}
        >
          {initials}
        </div>
        <span className="uc-online-dot" />
      </div>

      <div className="uc-info">
        <div className="uc-name">{user.username}</div>
        <span className="uc-field-tag">{user.field || 'No field set'}</span>
      </div>

      <div className="uc-status">
        <span className={`uc-badge${isBusy ? ' uc-badge-busy' : ' uc-badge-free'}`}>
          {isBusy ? 'BUSY' : 'FREE'}
        </span>
      </div>
    </div>
  );
}
