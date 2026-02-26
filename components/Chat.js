'use client';
import { useState, useEffect, useRef } from 'react';
import {
  collection, addDoc, onSnapshot, orderBy, query,
  serverTimestamp, doc, setDoc, increment as fsIncrement,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { notifyAdminNewMessage, notifyCustomerNewMessage } from '../lib/notifications';

export default function Chat({
  requestId,
  currentUser,
  senderRole,
  clientName,
  clientEmail,   //  admin passes this so we can email the customer
  onClose,
  inline = false,
}) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  /*  Listen to messages  */
  useEffect(() => {
    if (!requestId) return;
    const q = query(
      collection(db, 'chats', requestId, 'messages'),
      orderBy('createdAt', 'asc'),
    );
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [requestId]);

  /*  Auto-scroll  */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /*  Mark messages as read when chat is opened / messages update 
       Customer opens chat  reset unreadByCustomer to 0
       Admin    opens chat  reset unreadByAdmin    to 0          */
  useEffect(() => {
    if (!requestId) return;
    const field = senderRole === 'admin' ? 'unreadByAdmin' : 'unreadByCustomer';
    setDoc(doc(db, 'chatUnread', requestId), { [field]: 0 }, { merge: true }).catch(() => {});
  }, [requestId, senderRole, messages.length]);

  /*  Send message  */
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');

    // Persist the message
    await addDoc(collection(db, 'chats', requestId, 'messages'), {
      text: t,
      sender: senderRole,
      senderName: senderRole === 'admin'
        ? 'Owner'
        : (currentUser?.displayName?.split(' ')[0] || 'You'),
      senderPhoto: currentUser?.photoURL || null,
      createdAt: serverTimestamp(),
    });

    // Bump the unread counter for the OTHER party
    const bumpField = senderRole === 'admin' ? 'unreadByCustomer' : 'unreadByAdmin';
    setDoc(
      doc(db, 'chatUnread', requestId),
      { [bumpField]: fsIncrement(1) },
      { merge: true },
    ).catch(() => {});

    // Send email notification
    if (senderRole === 'customer') {
      notifyAdminNewMessage({
        clientName: currentUser?.displayName || 'A customer',
        messageText: t,
      });
    } else {
      // admin  customer
      notifyCustomerNewMessage({
        clientEmail: clientEmail,
        clientName: clientName?.split(' ')[0] || 'there',
        messageText: t,
      });
    }
  };

  /*  Shared message renderer  */
  const renderMessages = () =>
    messages.length === 0 ? (
      <div className="chat-empty">No messages yet. Say hello! </div>
    ) : (
      messages.map(m => {
        const isMe = m.sender === senderRole;
        return (
          <div key={m.id} className={`msg-wrap ${isMe ? 'mine' : ''}`}>
            <div className="msg-sender">{m.senderName}</div>
            <div className={`bubble ${isMe ? 'bubble-customer' : 'bubble-admin'}`}>
              {m.text}
              <div className="bubble-time">
                {m.createdAt?.toDate
                  ? m.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '...'}
              </div>
            </div>
          </div>
        );
      })
    );

  /*  INLINE mode (embedded in dashboard tab)  */
  if (inline) {
    return (
      <div className="chat-inline">
        <div
          className="chat-msgs"
          style={{ height: '400px', overflowY: 'auto', padding: '16px', background: '#f9fafb', borderRadius: '14px', marginBottom: '12px' }}
        >
          {renderMessages()}
          <div ref={bottomRef} />
        </div>
        <div className="chat-input-wrap" style={{ borderRadius: '12px', border: '1.5px solid var(--border)', padding: '10px 14px' }}>
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
    );
  }

  /*  OVERLAY mode (admin panel)  */
  return (
    <div className="chat-overlay show">
      <div className="chat-panel">
        <div className="chat-head">
          <div className="chat-head-info">
            <div className="chat-avatar"></div>
            <div>
              <div className="chat-name">
                {senderRole === 'admin' ? `Chat with ${clientName || 'Client'}` : 'Messages'}
              </div>
              <div className="chat-status">Yoselin's Cleaning Service</div>
            </div>
          </div>
          {onClose && <button className="chat-close" onClick={onClose}></button>}
        </div>

        <div className="chat-msgs">
          {renderMessages()}
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
