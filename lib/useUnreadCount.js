import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Returns the number of unread messages for `myRole` in a given chat.
 * Automatically re-renders when new messages arrive or when the chat is marked read.
 */
export function useUnreadCount(requestId, myRole) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!requestId || !myRole) return;

    const otherRole = myRole === 'admin' ? 'customer' : 'admin';
    let lastReadTime = null;
    let msgs = [];

    function recalc() {
      const n = msgs.filter(m => {
        if (m.sender !== otherRole) return false;
        if (!lastReadTime) return true;
        const t = m.createdAt?.toDate?.();
        return t ? t > lastReadTime : false;
      }).length;
      setCount(n);
    }

    // Listen to read-receipt doc
    const readUnsub = onSnapshot(
      doc(db, 'chatReads', `${requestId}_${myRole}`),
      snap => {
        lastReadTime = snap.exists() ? (snap.data().lastReadAt?.toDate?.() ?? null) : null;
        recalc();
      },
      () => { lastReadTime = null; recalc(); }
    );

    // Listen to messages
    const msgUnsub = onSnapshot(
      query(collection(db, 'chats', requestId, 'messages'), orderBy('createdAt', 'asc')),
      snap => {
        msgs = snap.docs.map(d => d.data());
        recalc();
      },
      () => {}
    );

    return () => { readUnsub(); msgUnsub(); };
  }, [requestId, myRole]);

  return count;
}
