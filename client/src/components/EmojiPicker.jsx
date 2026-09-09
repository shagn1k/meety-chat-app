import { useState } from 'react';

const EMOJI_CATEGORIES = {
  'Smileys': ['😀','😂','🥲','😊','😍','🥰','😎','🤩','😢','😡','🤔','😴','🤗','😇','🥳','😱'],
  'Gestures': ['👍','👎','👋','🙌','👏','🤝','🙏','✌️','🤞','💪','🫶','🤙'],
  'Objects': ['💬','💡','🔥','⭐','🎯','🚀','💻','📱','🎉','🎊','🏆','📚'],
  'Nature': ['🌸','🌿','🌊','☀️','🌙','⭐','🌈','❄️','🍀','🦋','🐶','🐱'],
};

export default function EmojiPicker({ onSelect, onClose }) {
  const [tab, setTab] = useState('Smileys');

  return (
    <div className="emoji-picker">
      <div className="ep-tabs">
        {Object.keys(EMOJI_CATEGORIES).map((cat) => (
          <button
            key={cat}
            className={`ep-tab${tab === cat ? ' active' : ''}`}
            onClick={() => setTab(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="ep-grid">
        {EMOJI_CATEGORIES[tab].map((emoji) => (
          <button
            key={emoji}
            className="ep-emoji"
            onClick={() => { onSelect(emoji); onClose(); }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
