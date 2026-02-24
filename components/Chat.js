'use client';
import { useState, useEffect, useRef } from 'react';
import { collection, addDoc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function Chat({ requestId, currentUser, senderRole, clientName, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!requestId) return;
    const q = query(collection(db, 'chats', requestId, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [requestId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    await addDoc(collection(db, 'chats', requestId, 'messages'), {
      text: t,
      sender: senderRole,
      senderName: senderRole === 'admin' ? 'Yoselin' : (currentUser?.displayName?.split(' ')[0] || 'You'),
      senderPhoto: currentUser?.photoURL || null,
      createdAt: serverTimestamp(),
    });
  };

  const displayName = senderRole === 'admin' ? clientName || 'Client' : 'Yoselin';

  return (
    <div className="chat-overlay show">
      <div className="chat-panel">
        <div className="chat-head">
          <div className="chat-head-info">
            <div className="chat-avatar">✨</div>
            <div>
              <div className="chat-name">{senderRole === 'admin' ? `Chat with ${displayName}` : 'Chat with Yoselin'}</div>
              <div className="chat-status">Yoselin's Cleaning Service</div>
            </div>
          </div>
          <button className="chat-close" onClick={onClose}>✕</button>
        </div>

        <div className="chat-msgs">
          {messages.length === 0 ? (
            <div className="chat-empty">No messages yet. Say hello! 👋</div>
          ) : messages.map(m => {
            const isMe = m.sender === senderRole;
            return (
              <div key={m.id} className={`msg-wrap ${isMe ? 'mine' : ''}`}>
                <div className="msg-sender">{m.senderName}</div>
                <div className={`bubble ${isMe ? 'bubble-customer' : 'bubble-admin'}`}>
                  {m.text}
                  <div className="bubble-time">
                    {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="chat-input-wrap">
          <input
            className="chat-input"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Type a message..."
          />
          <button className="chat-send" onClick={send}>Send</button>
        </div>
      </div>
    </div>
  );
}
