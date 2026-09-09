import { useState } from 'react';
import socket from '../socket';

const SUGGESTED_FIELDS = [
  'Cybersecurity',
  'Science',
  'Engineering',
  'Medicine',
  'Business',
  'Design',
  'Education',
  'Finance',
  'Law',
  'Arts'
];

export default function FieldOnboarding({ username, onFieldSaved }) {
  const [field, setField] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    const trimmed = field.trim();
    if (!trimmed) {
      setError('Please enter or choose your field');
      return;
    }
    setSaving(true);
    setError('');
    socket.emit('set_field', { username, field: trimmed });

    socket.once('field_saved', ({ field: savedField }) => {
      setSaving(false);
      onFieldSaved(savedField);
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave();
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-icon">🎯</div>
        <h2 className="onboarding-title">What is your field?</h2>
        <p className="onboarding-subtitle">
          Hi <strong>{username}</strong>! Tell us your area of interest so others can find you.
        </p>

        <div className="onboarding-chips">
          {SUGGESTED_FIELDS.map((f) => (
            <button
              key={f}
              className={`onboarding-chip${field === f ? ' active' : ''}`}
              onClick={() => setField(f)}
            >
              {f}
            </button>
          ))}
        </div>

        <input
          className="onboarding-input"
          type="text"
          placeholder="Or type your own field..."
          value={field}
          onChange={(e) => { setField(e.target.value); setError(''); }}
          onKeyDown={handleKeyDown}
        />

        {error && <p className="onboarding-error">{error}</p>}

        <button
          className="onboarding-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}
