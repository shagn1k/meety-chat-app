import { useState, useRef, useEffect, useCallback } from 'react';
import MessageBubble from './MessageBubble';
import EmojiPicker from './EmojiPicker';
import socket from '../socket';

// ─── Inline canvas drawing layer ───────────────────────────────────────────
const DRAW_COLORS = ['#1f2937', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'];

function InlineCanvas({ onClose }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#ef4444');
  const [brushSize, setBrushSize] = useState(4);
  const isDrawing = useRef(false);
  const lastPos = useRef(null);
  const history = useRef([]);

  // Size canvas to match its container
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Save current drawing
    const ctx = canvas.getContext('2d');
    const snapshot = canvas.width > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;

    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;

    // Restore drawing
    if (snapshot) ctx.putImageData(snapshot, 0, 0);
  }, []);

  // Draw a line segment — uses normalized 0-1 coords so resizing stays correct
  const drawSegment = useCallback((ctx, x0, y0, x1, y1, strokeColor, size, isEraser, w, h) => {
    const px0 = x0 * w, py0 = y0 * h;
    const px1 = x1 * w, py1 = y1 * h;
    ctx.beginPath();
    ctx.moveTo(px0, py0);
    ctx.lineTo(px1, py1);
    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = size * 5;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = size;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.closePath();
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  useEffect(() => {
    resizeCanvas();
    const obs = new ResizeObserver(resizeCanvas);
    if (containerRef.current) obs.observe(containerRef.current);

    const onDraw = (data) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      drawSegment(ctx, data.x0, data.y0, data.x1, data.y1, data.color, data.size, data.eraser, canvas.width, canvas.height);
    };

    const onClear = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      history.current = [];
    };

    socket.off('whiteboard_draw');
    socket.off('whiteboard_clear');
    socket.on('whiteboard_draw', onDraw);
    socket.on('whiteboard_clear', onClear);

    return () => {
      obs.disconnect();
      socket.off('whiteboard_draw', onDraw);
      socket.off('whiteboard_clear', onClear);
    };
  }, [resizeCanvas, drawSegment]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) / canvas.width,
        y: (e.touches[0].clientY - rect.top) / canvas.height
      };
    }
    return {
      x: (e.clientX - rect.left) / canvas.width,
      y: (e.clientY - rect.top) / canvas.height
    };
  };

  const saveHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    history.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (history.current.length > 40) history.current.shift();
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    saveHistory();
    isDrawing.current = true;
    lastPos.current = getPos(e);
  };

  const onPointerMove = (e) => {
    e.preventDefault();
    if (!isDrawing.current || !lastPos.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e);
    const isEraser = tool === 'eraser';

    drawSegment(ctx, lastPos.current.x, lastPos.current.y, pos.x, pos.y, color, brushSize, isEraser, canvas.width, canvas.height);

    socket.emit('whiteboard_draw', {
      x0: lastPos.current.x, y0: lastPos.current.y,
      x1: pos.x, y1: pos.y,
      color, size: brushSize, eraser: isEraser
    });

    lastPos.current = pos;
  };

  const onPointerUp = (e) => {
    e.preventDefault();
    isDrawing.current = false;
    lastPos.current = null;
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    saveHistory();
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit('whiteboard_clear');
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    if (!canvas || history.current.length === 0) return;
    const ctx = canvas.getContext('2d');
    const prev = history.current.pop();
    ctx.putImageData(prev, 0, 0);
  };

  return (
    <div className="il-canvas-layer" ref={containerRef}>
      {/* Floating compact toolbar */}
      <div className="il-toolbar">
        <button
          className={`il-tool${tool === 'pen' ? ' active' : ''}`}
          onClick={() => setTool('pen')}
          title="Pen"
        >✏️</button>
        <button
          className={`il-tool${tool === 'eraser' ? ' active' : ''}`}
          onClick={() => setTool('eraser')}
          title="Eraser"
        >🧹</button>

        <div className="il-divider" />

        {DRAW_COLORS.map((c) => (
          <button
            key={c}
            className={`il-color${color === c && tool === 'pen' ? ' active' : ''}`}
            style={{ background: c }}
            onClick={() => { setColor(c); setTool('pen'); }}
            title={c}
          />
        ))}

        <div className="il-divider" />

        <input
          className="il-size"
          type="range"
          min="2"
          max="18"
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          title={`Brush size: ${brushSize}`}
        />

        <div className="il-divider" />

        <button className="il-tool" onClick={handleUndo} title="Undo">↩</button>
        <button className="il-tool il-clear" onClick={handleClear} title="Clear">🗑</button>

        <div className="il-divider" />

        <button className="il-close-draw" onClick={onClose} title="Close drawing mode">✕ Close</button>
      </div>

      <canvas
        ref={canvasRef}
        className="il-canvas"
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
      />
    </div>
  );
}

// ─── Main ChatWindow ────────────────────────────────────────────────────────
export default function ChatWindow({
  currentUser,
  currentField,
  selectedUser,
  chatPartner,
  isBusy,
  messages,
  incomingRequest,
  onAcceptRequest,
  onRejectRequest,
  onEndChat,
  onLogout
}) {
  const [message, setMessage] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Close draw mode when chat ends
  const drawModeActive = drawMode && isBusy;

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);




  const sendMessage = () => {
    if (!chatPartner || !message.trim()) return;
    socket.emit('private_message', {
      to: chatPartner.username,
      from: currentUser,
      message: message.trim()
    });
    setMessage('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleEmojiSelect = (emoji) => {
    setMessage((prev) => prev + emoji);
    textareaRef.current?.focus();
  };

  const getAvatarColor = (name) => {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
    const idx = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
    return colors[idx];
  };

  // ─── Empty state: no user selected and no incoming request ──
  if (!selectedUser && !incomingRequest && !isBusy) {
    return (
      <main className="chat-window">
        <ChatTopBar
          currentUser={currentUser}
          currentField={currentField}
          onLogout={onLogout}
          getAvatarColor={getAvatarColor}
        />
        <div className="cw-empty">
          <div className="cw-empty-icon">💬</div>
          <h2 className="cw-empty-title">Click a user to start chatting</h2>
          <p className="cw-empty-sub">Select someone from the sidebar to send a chat request</p>
        </div>
      </main>
    );
  }

  const displayUser = chatPartner || selectedUser;
  const avatarColor = displayUser ? getAvatarColor(displayUser.username) : '#6366f1';

  return (
    <main className="chat-window">
      {/* ── HEADER ── */}
      <ChatTopBar
        currentUser={currentUser}
        currentField={currentField}
        onLogout={onLogout}
        getAvatarColor={getAvatarColor}
        selectedUser={displayUser}
        avatarColor={avatarColor}
        isBusy={isBusy}
        onEndChat={onEndChat}
      />

      {/* ── INCOMING REQUEST BANNER (only for receiver) ── */}
      {incomingRequest && !isBusy && (
        <div className="cw-request-banner">
          <div className="cw-request-info">
            <div
              className="cw-request-avatar"
              style={{ background: getAvatarColor(incomingRequest.fromUsername) }}
            >
              {incomingRequest.fromUsername.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="cw-request-name">{incomingRequest.fromUsername}</div>
              <div className="cw-request-field">
                <span className="field-tag-sm">{incomingRequest.fromField || 'No field'}</span>
                &nbsp;wants to chat with you
              </div>
            </div>
          </div>
          <div className="cw-request-actions">
            <button
              className="cw-reject-btn"
              onClick={() => onRejectRequest(incomingRequest.fromSocketId)}
            >
              Decline
            </button>
            <button
              className="cw-accept-btn"
              onClick={() => onAcceptRequest(incomingRequest.fromSocketId)}
            >
              Accept
            </button>
          </div>
        </div>
      )}

      {/* ── MESSAGES + INLINE CANVAS LAYER ── */}
      <div className="cw-messages-wrap">
        <div className="cw-messages">
          {/* Waiting state (sender only — no incoming request, not yet busy) */}
          {!isBusy && !incomingRequest && selectedUser && (
            <div className="cw-pending-msg">
              <span className="cw-pending-dot" />
              Chat request sent to <strong>{selectedUser.username}</strong>. Waiting for response…
            </div>
          )}

          {/* Chat just started */}
          {isBusy && messages.length === 0 && (
            <div className="cw-start-msg">
              Chat started with <strong>{chatPartner?.username}</strong>. Say hello! 👋
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} currentUser={currentUser} />
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Inline drawing canvas — overlaid over the messages area */}
        {drawModeActive && (
          <InlineCanvas onClose={() => setDrawMode(false)} />
        )}
      </div>

      {/* ── INPUT AREA (active chat only) ── */}
      {isBusy && chatPartner && (
        <div className="cw-input-area">
          {showEmoji && (
            <div className="cw-emoji-wrap">
              <EmojiPicker
                onSelect={handleEmojiSelect}
                onClose={() => setShowEmoji(false)}
              />
            </div>
          )}

          {/* Emoji button */}
          <button
            className={`cw-emoji-btn${showEmoji ? ' active' : ''}`}
            onClick={() => { setShowEmoji(!showEmoji); }}
            title="Emoji"
          >
            😊
          </button>

          {/* Draw toggle button */}
          <button
            className={`cw-draw-btn${drawModeActive ? ' active' : ''}`}
            onClick={() => { setDrawMode(!drawMode); setShowEmoji(false); }}
            title={drawModeActive ? 'Close drawing mode' : 'Open drawing mode'}
          >
            🖌️
          </button>

          <textarea
            ref={textareaRef}
            className="cw-textarea"
            placeholder={`Message ${chatPartner.username}… (Enter to send, Shift+Enter for new line)`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />

          <button
            className="cw-send-btn"
            onClick={sendMessage}
            disabled={!message.trim()}
            title="Send"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      )}
    </main>
  );
}

// ─── Chat header sub-component ──────────────────────────────────────────────
function ChatTopBar({
  currentUser, currentField, onLogout, getAvatarColor,
  selectedUser, avatarColor, isBusy, onEndChat
}) {
  const myColor = getAvatarColor(currentUser);

  return (
    <header className="cw-header">
      {/* LEFT */}
      <div className="cw-header-left">
        {selectedUser ? (
          <>
            <div className="cw-header-avatar" style={{ background: avatarColor }}>
              {selectedUser.username.charAt(0).toUpperCase()}
            </div>
            <div className="cw-header-info">
              <div className="cw-header-name">{selectedUser.username}</div>
              <div className="cw-header-meta">
                <span className="field-tag-sm">{selectedUser.field || 'No field'}</span>
                <span className={`cw-status-dot${isBusy ? ' busy' : ''}`}>
                  {isBusy ? '● In chat' : '● Online'}
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <span style={{ fontSize: 20, color: '#7c6fe0' }}>✦</span>
            <div className="cw-header-info">
              <div className="cw-header-name">Meety</div>
              <div className="cw-header-meta">Select a user to start chatting</div>
            </div>
          </>
        )}
      </div>

      {/* RIGHT */}
      <div className="cw-header-right">
        {/* End Chat button — visible whenever there is an active chat */}
        {isBusy && selectedUser && (
          <button
            className="cw-endchat-btn"
            onClick={onEndChat}
            title="End this chat"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            End Chat
          </button>
        )}

        {/* Current user's own profile */}
        <div className="cw-my-profile">
          <div className="cw-my-info">
            <div className="cw-my-name">{currentUser}</div>
            <span className="field-tag-sm field-tag-mine">{currentField || 'No field'}</span>
          </div>
          <div className="cw-my-avatar" style={{ background: myColor }}>
            {currentUser.charAt(0).toUpperCase()}
          </div>
          <button className="sb-logout-btn" onClick={onLogout} title="Log out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
