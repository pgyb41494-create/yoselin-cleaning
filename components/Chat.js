'use client';
import { useState, useEffect, useRef } from 'react';
import {
  collection, addDoc, onSnapshot, orderBy, query,
  serverTimestamp, doc, setDoc, increment as fsIncrement,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { notifyAdminNewMessage, notifyCustomerNewMessage } from '../lib/notifications';

/* ── Inject keyframe animations once ── */
const ANIM_ID = '__chat_anim__';
function injectAnimations() {
  if (typeof document === 'undefined' || document.getElementById(ANIM_ID)) return;
  const style = document.createElement('style');
  style.id = ANIM_ID;
  style.textContent = `
    @keyframes msgSlideIn {
      from { opacity: 0; transform: translateY(12px) scale(0.95); }
      to   { opacity: 1; transform: translateY(0)  scale(1);    }
    }
    @keyframes msgSlideInLeft {
      from { opacity: 0; transform: translateX(-14px) scale(0.96); }
      to   { opacity: 1; transform: translateX(0)     scale(1);    }
    }
    @keyframes msgSlideInRight {
      from { opacity: 0; transform: translateX(14px) scale(0.96); }
      to   { opacity: 1; transform: translateX(0)    scale(1);    }
    }
    @keyframes typingDot {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40%            { transform: scale(1);   opacity: 1;   }
    }
    @keyframes toastSlideIn {
      from { opacity: 0; transform: translateX(110%); }
      to   { opacity: 1; transform: translateX(0);    }
    }
    @keyframes toastSlideOut {
      from { opacity: 1; transform: translateX(0);    }
      to   { opacity: 0; transform: translateX(110%); }
    }
    @keyframes sendPop {
      0%   { transform: scale(1);    }
      40%  { transform: scale(0.88); }
      100% { transform: scale(1);    }
    }
    @keyframes panelSlideUp {
      from { transform: translateY(100%); opacity: 0.6; }
      to   { transform: translateY(0);    opacity: 1;   }
    }
    @keyframes overlayFadeIn {
      from { background: rgba(0,0,0,0); }
      to   { background: rgba(0,0,0,0.65); }
    }
    .chat-msg-animate-left  { animation: msgSlideInLeft  0.28s cubic-bezier(.22,.68,0,1.2) both; }
    .chat-msg-animate-right { animation: msgSlideInRight 0.28s cubic-bezier(.22,.68,0,1.2) both; }
    .chat-send-anim { animation: sendPop 0.22s ease both; }
    .chat-panel-anim { animation: panelSlideUp 0.32s cubic-bezier(.22,.68,0,1.1) both; }
    .chat-overlay-anim { animation: overlayFadeIn 0.25s ease both; }
    .typing-dot {
      width: 7px; height: 7px; border-radius: 50%; background: #9ca3af; display: inline-block;
      animation: typingDot 1.2s infinite ease-in-out;
    }
    .typing-dot:nth-child(1) { animation-delay: 0s; }
    .typing-dot:nth-child(2) { animation-delay: 0.18s; }
    .typing-dot:nth-child(3) { animation-delay: 0.36s; }
    .chat-input-glow:focus {
      border-color: #1a6fd4 !important;
      box-shadow: 0 0 0 3px rgba(26,111,212,.15) !important;
      outline: none;
    }
  `;
  document.head.appendChild(style);
}

/* ── Toast notification (top-right) ── */
function Toast({ toast, onDismiss }) {
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setHiding(true), 3800);
    const t2 = setTimeout(() => onDismiss(), 4300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDismiss]);

  return (
    <div
      onClick={() => { setHiding(true); setTimeout(onDismiss, 400); }}
      style={{
        position: 'fixed', top: '72px', right: '16px', zIndex: 9999,
        background: '#1a1a1a', border: '1.5px solid #2a2a2a',
        borderRadius: '16px', padding: '12px 16px', maxWidth: '300px',
        boxShadow: '0 8px 32px rgba(0,0,0,.55)',
        cursor: 'pointer', userSelect: 'none',
        animation: hiding
          ? 'toastSlideOut 0.4s ease forwards'
          : 'toastSlideIn 0.35s cubic-bezier(.22,.68,0,1.15) forwards',
        display: 'flex', alignItems: 'flex-start', gap: '10px',
      }}
    >
      {/* Avatar */}
      <div style={{
        width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg,#f472b6,#4a9eff)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1rem', fontWeight: '700', color: 'white',
      }}>
        {toast.senderName?.[0]?.toUpperCase() || 'Y'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
          <div style={{ fontWeight: '700', color: 'white', fontSize: '.82rem' }}>
            {toast.senderName}
          </div>
          <div style={{ fontSize: '.68rem', color: '#555', marginLeft: '8px', whiteSpace: 'nowrap' }}>now</div>
        </div>
        <div style={{
          fontSize: '.78rem', color: '#9ca3af', lineHeight: 1.4,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {toast.text}
        </div>
        <div style={{ marginTop: '6px', fontSize: '.68rem', color: '#555', fontWeight: '600', letterSpacing: '.3px' }}>
          TAP TO VIEW
        </div>
      </div>
      {/* Dismiss X */}
      <button
        onClick={e => { e.stopPropagation(); setHiding(true); setTimeout(onDismiss, 400); }}
        style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '.85rem', padding: '0', lineHeight: 1, flexShrink: 0 }}
      >
        x
      </button>
    </div>
  );
}

/* ── Typing indicator bubble ── */
function TypingIndicator() {
  return (
    <div className="msg-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <div className="msg-sender" style={{ fontSize: '.68rem', color: '#9ca3af', fontWeight: 700, marginBottom: '3px' }}>
        Yoselin
      </div>
      <div style={{
        background: '#1f1f2e', border: '1px solid #2a2a2a',
        borderRadius: '18px', borderBottomLeftRadius: '5px',
        padding: '11px 16px', display: 'flex', alignItems: 'center', gap: '5px',
        animation: 'msgSlideInLeft 0.25s ease both',
      }}>
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   Main Chat component
───────────────────────────────────────────────── */
export default function Chat({
  requestId,
  currentUser,
  senderRole,
  clientName,
  clientEmail,
  onClose,
  inline = false,
}) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendAnim, setSendAnim] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [newMsgIds, setNewMsgIds] = useState(new Set());
  const bottomRef = useRef(null);
  const seenIdsRef = useRef(new Set());
  const isFirstLoad = useRef(true);
  const inputRef = useRef(null);

  useEffect(() => { injectAnimations(); }, []);

  /* Listen to messages */
  useEffect(() => {
    if (!requestId) return;
    const q = query(collection(db, 'chats', requestId, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);

      if (isFirstLoad.current) {
        // Seed seen IDs silently on first load
        snap.docs.forEach(d => seenIdsRef.current.add(d.id));
        isFirstLoad.current = false;
        return;
      }

      // Detect truly new messages
      const incoming = [];
      snap.docs.forEach(d => {
        if (!seenIdsRef.current.has(d.id)) {
          seenIdsRef.current.add(d.id);
          incoming.push({ id: d.id, ...d.data() });
        }
      });

      if (incoming.length > 0) {
        // Animate new bubbles
        setNewMsgIds(prev => {
          const next = new Set(prev);
          incoming.forEach(m => next.add(m.id));
          return next;
        });
        // Trigger typing indicator briefly then show message
        const fromOther = incoming.filter(m => m.sender !== senderRole);
        if (fromOther.length > 0) {
          setIsTyping(true);
          setTimeout(() => setIsTyping(false), 900);
          // Toast notification
          fromOther.forEach(m => {
            setToasts(t => [...t, { id: m.id, senderName: m.senderName || clientName || 'New message', text: m.text }]);
          });
        }
        // Clean up animation class after it plays
        setTimeout(() => {
          setNewMsgIds(prev => {
            const next = new Set(prev);
            incoming.forEach(m => next.delete(m.id));
            return next;
          });
        }, 600);
      }
    });
    return () => unsub();
  }, [requestId, senderRole, clientName]);

  /* Auto-scroll */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  /* Mark as read */
  useEffect(() => {
    if (!requestId) return;
    const field = senderRole === 'admin' ? 'unreadByAdmin' : 'unreadByCustomer';
    setDoc(doc(db, 'chatUnread', requestId), { [field]: 0 }, { merge: true }).catch(() => {});
  }, [requestId, senderRole, messages.length]);

  /* Send message */
  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setSendAnim(true);
    setText('');
    setTimeout(() => setSendAnim(false), 300);

    await addDoc(collection(db, 'chats', requestId, 'messages'), {
      text: t,
      sender: senderRole,
      senderName: senderRole === 'admin'
        ? 'Owner'
        : (currentUser?.displayName?.split(' ')[0] || 'You'),
      senderPhoto: currentUser?.photoURL || null,
      createdAt: serverTimestamp(),
    });

    const bumpField = senderRole === 'admin' ? 'unreadByCustomer' : 'unreadByAdmin';
    setDoc(doc(db, 'chatUnread', requestId), { [bumpField]: fsIncrement(1) }, { merge: true }).catch(() => {});

    if (senderRole === 'customer') {
      notifyAdminNewMessage({ clientName: currentUser?.displayName || 'A customer', messageText: t });
    } else {
      notifyCustomerNewMessage({ clientEmail, clientName: clientName?.split(' ')[0] || 'there', messageText: t });
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const dismissToast = id => setToasts(t => t.filter(x => x.id !== id));

  /* Message renderer */
  const renderMessages = () =>
    messages.length === 0 ? (
      <div className="chat-empty" style={{ color: '#6b7280', textAlign: 'center', padding: '40px 20px', fontSize: '.85rem' }}>
        No messages yet. Say hello!
      </div>
    ) : (
      messages.map((m, idx) => {
        const isMe = m.sender === senderRole;
        const isNew = newMsgIds.has(m.id);
        const animClass = isNew ? (isMe ? 'chat-msg-animate-right' : 'chat-msg-animate-left') : '';
        const showSender = idx === 0 || messages[idx - 1]?.sender !== m.sender;
        return (
          <div
            key={m.id}
            className={`msg-wrap ${isMe ? 'mine' : ''} ${animClass}`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}
          >
            {showSender && (
              <div className="msg-sender" style={{ fontSize: '.68rem', fontWeight: 700, color: '#6b7280', marginBottom: '3px' }}>
                {m.senderName}
              </div>
            )}
            <div
              className={`bubble ${isMe ? 'bubble-customer' : 'bubble-admin'}`}
              style={{
                background: isMe
                  ? 'linear-gradient(135deg,#1a6fd4,#db2777)'
                  : '#1f1f2e',
                color: 'white',
                border: isMe ? 'none' : '1px solid #2a2a2a',
                transition: 'box-shadow .2s',
              }}
            >
              {m.text}
              <div className="bubble-time" style={{ fontSize: '.62rem', opacity: 0.55, marginTop: '5px', textAlign: 'right' }}>
                {m.createdAt?.toDate
                  ? m.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '\u2022\u2022\u2022'}
              </div>
            </div>
          </div>
        );
      })
    );

  /* Input + Send bar (shared) */
  const InputBar = ({ style = {} }) => (
    <div className="chat-input-wrap" style={{ display: 'flex', gap: '10px', ...style }}>
      <input
        ref={inputRef}
        className="chat-input chat-input-glow"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
        placeholder="Type a message..."
        style={{ background: '#1f1f1f', borderColor: '#2a2a2a', color: 'white', transition: 'border-color .2s, box-shadow .2s' }}
      />
      <button
        className={'chat-send' + (sendAnim ? ' chat-send-anim' : '')}
        onClick={send}
        disabled={sending || !text.trim()}
        style={{
          opacity: text.trim() ? 1 : 0.45,
          transition: 'opacity .2s, transform .1s',
          transform: text.trim() ? 'scale(1)' : 'scale(0.95)',
        }}
      >
        {sending ? (
          <span style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
            <span className="typing-dot" style={{ background: 'white' }} />
            <span className="typing-dot" style={{ background: 'white' }} />
            <span className="typing-dot" style={{ background: 'white' }} />
          </span>
        ) : 'Send'}
      </button>
    </div>
  );

  /* INLINE mode */
  if (inline) {
    return (
      <>
        {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />)}
        <div className="chat-inline">
          <div
            className="chat-msgs"
            style={{ height: '400px', overflowY: 'auto', padding: '16px', background: '#0d0d0d', borderRadius: '14px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            {renderMessages()}
            {isTyping && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
          <InputBar style={{ background: '#111', borderRadius: '12px', border: '1.5px solid #2a2a2a', padding: '10px 14px' }} />
        </div>
      </>
    );
  }

  /* OVERLAY mode */
  return (
    <>
      {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />)}
      <div className="chat-overlay show chat-overlay-anim">
        <div className="chat-panel chat-panel-anim">
          <div className="chat-head" style={{ background: '#0d0d0d', borderBottom: '1px solid #1f1f1f' }}>
            <div className="chat-head-info">
              <div className="chat-avatar" style={{ background: 'linear-gradient(135deg,#f472b6,#4a9eff)', color: 'white', fontSize: '.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {senderRole === 'admin' ? (clientName?.[0]?.toUpperCase() || 'C') : 'Y'}
              </div>
              <div>
                <div className="chat-name">
                  {senderRole === 'admin' ? `Chat with ${clientName || 'Client'}` : "Yoselin's Cleaning"}
                </div>
                <div className="chat-status" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 6px #10b981' }} />
                  Online
                </div>
              </div>
            </div>
            {onClose && (
              <button className="chat-close" onClick={onClose} style={{ transition: 'background .2s', fontSize: '.85rem' }}>
                x
              </button>
            )}
          </div>

          <div className="chat-msgs" style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#0a0a0a' }}>
            {renderMessages()}
            {isTyping && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>

          <InputBar style={{ background: '#111', borderTop: '1px solid #1f1f1f', padding: '14px 16px' }} />
        </div>
      </div>
    </>
  );
}
