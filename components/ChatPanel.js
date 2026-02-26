'use client';
import { useEffect, useRef, useState } from 'react';
import {
  collection, addDoc, onSnapshot, query,
  orderBy, serverTimestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';

const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  panel: { background: 'white', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: '600px', height: '80vh', display: 'flex', flexDirection: 'column' },
  head: { padding: '18px 22px', borderBottom: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0d0d0d', borderRadius: '24px 24px 0 0' },
  headInfo: { display: 'flex', alignItems: 'center', gap: '12px' },
  avatar: { width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg,#f472b6,#4a9eff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' },
  name: { fontWeight: 700, color: 'white', fontSize: '.95rem' },
  status: { fontSize: '.72rem', color: '#9ca3af', marginTop: '1px' },
  closeBtn: { background: 'rgba(255,255,255,.1)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '1rem' },
  msgs: { flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: '11px', background: '#f9fafb' },
  empty: { textAlign: 'center', padding: '40px 20px', color: '#9ca3af', fontSize: '.85rem' },
  inputWrap: { padding: '14px 16px', borderTop: '1.5px solid #e2e8f0', display: 'flex', gap: '10px', background: 'white' },
  input: { flex: 1, padding: '11px 15px', border: '1.5px solid #e2e8f0', borderRadius: '99px', fontFamily: "'DM Sans', sans-serif", fontSize: '.88rem', outline: 'none' },
  sendBtn: { padding: '11px 20px', background: 'linear-gradient(135deg,#1a6fd4,#db2777)', color: 'white', border: 'none', borderRadius: '99px', fontFamily: "'DM Sans', sans-serif", fontSize: '.84rem', fontWeight: 700, cursor: 'pointer' },
};

export default function ChatPanel({ requestId, clientName, senderRole, senderName, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!requestId) return;
    const q = query(
      collection(db, 'chats', requestId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [requestId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    await addDoc(collection(db, 'chats', requestId, 'messages'), {
      text: trimmed,
      sender: senderRole,
      senderName,
      createdAt: serverTimestamp(),
    });
    setSending(false);
  }

  const headLabel = senderRole === 'admin'
    ? `${clientName}  Chat`
    : '\u2728 Yoselin - Your Cleaner';

  return (
    <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={s.panel}>
        <div style={s.head}>
          <div style={s.headInfo}>
            <div style={s.avatar}></div>
            <div>
              <div style={s.name}>{headLabel}</div>
              <div style={s.status}>Yoselin's Cleaning Service</div>
            </div>
          </div>
          <button style={s.closeBtn} onClick={onClose}></button>
        </div>

        <div style={s.msgs}>
          {messages.length === 0 && (
            <div style={s.empty}>No messages yet. Say hello! </div>
          )}
          {messages.map(msg => {
            const isMe = msg.sender === senderRole;
            return (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                <div style={{ fontSize: '.68rem', color: '#9ca3af', fontWeight: 700, marginBottom: '3px' }}>
                  {msg.senderName}
                </div>
                <div style={{
                  maxWidth: '78%', padding: '11px 15px', borderRadius: '18px',
                  borderBottomRightRadius: isMe ? '5px' : '18px',
                  borderBottomLeftRadius: isMe ? '18px' : '5px',
                  background: isMe
                    ? 'linear-gradient(135deg,#1a6fd4,#db2777)'
                    : '#0d0d0d',
                  color: 'white', fontSize: '.87rem', lineHeight: 1.45,
                }}>
                  {msg.text}
                  <div style={{ fontSize: '.65rem', opacity: 0.6, marginTop: '5px', textAlign: 'right' }}>
                    {msg.createdAt?.toDate
                      ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '...'}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div style={s.inputWrap}>
          <input
            style={s.input}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Type a message..."
            autoFocus
          />
          <button style={s.sendBtn} onClick={send} disabled={sending}>
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
