'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, auth, storage, ADMIN_EMAILS } from '../../lib/firebase';

export default function GalleryPage() {
  const router = useRouter();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);
  const [filter, setFilter] = useState('all');
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);
      setIsAdmin(user ? ADMIN_EMAILS.includes(user.email?.toLowerCase()) || ADMIN_EMAILS.includes(user.email) : false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'galleryIndex'),
      async (snap) => {
        if (snap.exists()) {
          const { count = 0 } = snap.data();
          const allPhotos = [];
          for (let i = 0; i < count; i++) {
            try {
              const chunkSnap = await getDoc(doc(db, 'settings', 'gallery_' + i));
              if (chunkSnap.exists()) allPhotos.push(...(chunkSnap.data().photos || []));
            } catch (e) {}
          }
          setPhotos(allPhotos);
        } else {
          setPhotos([]);
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const filteredPhotos = filter === 'all' ? photos : photos.filter(p => p.category === filter);
    const handleKey = (e) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') { const n = (lightbox.index + 1) % filteredPhotos.length; setLightbox({ ...filteredPhotos[n], index: n }); }
      if (e.key === 'ArrowLeft') { const n = (lightbox.index - 1 + filteredPhotos.length) % filteredPhotos.length; setLightbox({ ...filteredPhotos[n], index: n }); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightbox, photos, filter]);

  const handleUpload = async () => {
    if (!uploadFiles.length) return;
    setUploading(true);
    setUploadProgress('');
    try {
      const newPhotos = [];
      for (let i = 0; i < uploadFiles.length; i++) {
        setUploadProgress('Uploading ' + (i + 1) + ' of ' + uploadFiles.length + '...');
        const file = uploadFiles[i];
        const fileName = 'gallery/' + Date.now() + '_' + file.name;
        const storageRef = ref(storage, fileName);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        newPhotos.push({
          id: Date.now().toString() + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
          url: url,
          fileName: fileName,
          label: uploadLabel || '',
          description: uploadDesc || '',
          category: uploadCategory || '',
          createdAt: new Date().toISOString(),
        });
      }
      setUploadProgress('Saving to gallery...');
      var indexSnap = await getDoc(doc(db, 'settings', 'galleryIndex'));
      var existingCount = indexSnap.exists() ? (indexSnap.data().count || 0) : 0;
      var existingChunks = [];
      for (var ci = 0; ci < existingCount; ci++) {
        try {
          var chunkSnap = await getDoc(doc(db, 'settings', 'gallery_' + ci));
          existingChunks.push(chunkSnap.exists() ? (chunkSnap.data().photos || []) : []);
        } catch (e) { existingChunks.push([]); }
      }
      for (var si = existingChunks.length - 1; si >= 0; si--) {
        await setDoc(doc(db, 'settings', 'gallery_' + (si + 1)), { photos: existingChunks[si] });
      }
      await setDoc(doc(db, 'settings', 'gallery_0'), { photos: newPhotos });
      var newCount = existingCount + 1;
      await setDoc(doc(db, 'settings', 'galleryIndex'), { count: newCount, updatedAt: Date.now() });
      var allPhotos = [].concat(newPhotos);
      existingChunks.forEach(function(c) { allPhotos.push.apply(allPhotos, c); });
      setPhotos(allPhotos);
      setUploadFiles([]);
      setUploadLabel('');
      setUploadDesc('');
      setUploadCategory('');
      setShowUpload(false);
      setUploadProgress('');
    } catch (err) {
      console.error('Upload error:', err);
      setUploadProgress('Upload failed: ' + err.message);
    }
    setUploading(false);
  };

  const handleDeletePhoto = async (photo) => {
    if (!window.confirm('Delete this photo?')) return;
    try {
      if (photo.fileName) {
        try { await deleteObject(ref(storage, photo.fileName)); } catch (e) { console.warn('Storage delete skipped:', e); }
      }
      var indexSnap = await getDoc(doc(db, 'settings', 'galleryIndex'));
      var existingCount = indexSnap.exists() ? (indexSnap.data().count || 0) : 0;
      var found = false;
      var allPhotos = [];
      for (var i = 0; i < existingCount; i++) {
        try {
          var chunkSnap = await getDoc(doc(db, 'settings', 'gallery_' + i));
          var chunkPhotos = chunkSnap.exists() ? (chunkSnap.data().photos || []) : [];
          var before = chunkPhotos.length;
          var filtered2 = chunkPhotos.filter(function(p) { return p.id !== photo.id; });
          if (filtered2.length < before) {
            await setDoc(doc(db, 'settings', 'gallery_' + i), { photos: filtered2 });
            found = true;
            allPhotos.push.apply(allPhotos, filtered2);
          } else {
            allPhotos.push.apply(allPhotos, chunkPhotos);
          }
        } catch (e) { console.warn('Chunk read error:', e); }
      }
      if (found) {
        await setDoc(doc(db, 'settings', 'galleryIndex'), { count: existingCount, updatedAt: Date.now() });
        setPhotos(allPhotos);
        if (lightbox && lightbox.id === photo.id) setLightbox(null);
      } else {
        alert('Photo not found in database. Try refreshing.');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete: ' + err.message);
    }
  };

  var filteredPhotos = filter === 'all' ? photos : photos.filter(function(p) { return p.category === filter; });
  var categories = ['all'].concat([...new Set(photos.map(function(p) { return p.category; }).filter(Boolean))]);

  var inputStyle = {
    width: '100%', padding: '11px 14px', background: '#1a1a1a', border: '1.5px solid #2a2a2a',
    borderRadius: '10px', color: 'white', fontSize: '.88rem', fontFamily: "'DM Sans',sans-serif",
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      <nav style={{ background: '#151515', borderBottom: '1px solid #1f1f1f', padding: '0 24px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <img src="/logo.png" alt="Yoselin's Cleaning" style={{ height: '50px', objectFit: 'contain' }} />
        </button>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => router.push('/')} style={{ padding: '9px 18px', background: 'transparent', border: '1.5px solid #2a2a2a', color: '#9ca3af', borderRadius: '10px', fontFamily: "'DM Sans',sans-serif", fontWeight: '700', fontSize: '.83rem', cursor: 'pointer' }}>
            {'← Home'}
          </button>
          <button onClick={() => router.push('/book')} style={{ padding: '9px 18px', background: 'linear-gradient(135deg,#1a6fd4,#db2777)', color: 'white', border: 'none', borderRadius: '10px', fontFamily: "'DM Sans',sans-serif", fontWeight: '700', fontSize: '.83rem', cursor: 'pointer' }}>
            {'Get a Quote'}
          </button>
        </div>
      </nav>

      <div style={{ background: 'linear-gradient(135deg,#0d0d1a 0%,#1a0828 50%,#0d0d1a 100%)', padding: '52px 24px 40px', textAlign: 'center' }}>
        <div style={{ fontSize: '.73rem', fontWeight: '800', color: '#a855f7', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '12px' }}>{'Real Results · Real Homes'}</div>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(1.8rem,5vw,2.8rem)', fontWeight: '900', color: 'white', marginBottom: '16px', lineHeight: 1.2 }}>
          {'See the '}<span style={{ background: 'linear-gradient(135deg,#f472b6,#a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{'Transformation'}</span>
        </h1>
        <p style={{ color: '#9ca3af', fontSize: 'clamp(.85rem,2.5vw,1rem)', maxWidth: '520px', margin: '0 auto 28px', lineHeight: 1.7 }}>
          {'Every photo is from a real job. We tackle the toughest messes and leave everything spotless.'}
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[['✨', photos.length + ' Photos'], ['🏆', '5.0 Rating'], ['📍', 'Fairfield, OH']].map(function(arr) {
            return (
              <div key={arr[1]} style={{ background: 'rgba(168,85,247,.1)', border: '1px solid rgba(168,85,247,.2)', borderRadius: '99px', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{arr[0]}</span>
                <span style={{ fontSize: '.78rem', fontWeight: '700', color: '#d8b4fe' }}>{arr[1]}</span>
              </div>
            );
          })}
        </div>
        {isAdmin && (
          <div style={{ marginTop: '24px' }}>
            <button onClick={() => setShowUpload(!showUpload)} style={{
              padding: '12px 28px', background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white',
              border: 'none', borderRadius: '12px', fontFamily: "'DM Sans',sans-serif", fontWeight: '800',
              fontSize: '.9rem', cursor: 'pointer', boxShadow: '0 4px 20px rgba(16,185,129,.35)',
            }}>
              {showUpload ? '✕ Close Upload' : '➕ Upload Photos'}
            </button>
          </div>
        )}
      </div>

      {isAdmin && showUpload && (
        <div style={{ background: 'linear-gradient(135deg,rgba(16,185,129,.06),rgba(5,150,105,.04))', borderBottom: '1.5px solid rgba(16,185,129,.2)', padding: '28px 24px' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.2rem', fontWeight: '800', color: 'white', marginBottom: '18px', textAlign: 'center' }}>
              {'📷 Upload Gallery Photos'}
            </h3>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '.78rem', fontWeight: '700', color: '#9ca3af', marginBottom: '6px' }}>Select Photos</label>
              <input type="file" accept="image/*" multiple onChange={e => setUploadFiles(Array.from(e.target.files))} style={{ ...inputStyle, padding: '10px', cursor: 'pointer' }} />
              {uploadFiles.length > 0 && (
                <div style={{ fontSize: '.75rem', color: '#10b981', marginTop: '6px', fontWeight: '600' }}>
                  {uploadFiles.length + ' file' + (uploadFiles.length > 1 ? 's' : '') + ' selected'}
                </div>
              )}
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '.78rem', fontWeight: '700', color: '#9ca3af', marginBottom: '6px' }}>Label (optional)</label>
              <input type="text" placeholder="e.g. Kitchen Deep Clean" value={uploadLabel} onChange={e => setUploadLabel(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '.78rem', fontWeight: '700', color: '#9ca3af', marginBottom: '6px' }}>Description (optional)</label>
              <input type="text" placeholder="e.g. Full kitchen scrub including oven" value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '.78rem', fontWeight: '700', color: '#9ca3af', marginBottom: '6px' }}>Category</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { value: '', label: 'None', color: '#6b7280' },
                  { value: 'before', label: '🔴 Before', color: '#ef4444' },
                  { value: 'after', label: '✅ After', color: '#10b981' },
                  { value: 'general', label: '📷 General', color: '#a855f7' },
                ].map(function(opt) {
                  return (
                    <button key={opt.value} onClick={() => setUploadCategory(opt.value)} style={{
                      padding: '8px 16px', borderRadius: '10px', cursor: 'pointer',
                      fontFamily: "'DM Sans',sans-serif", fontWeight: '700', fontSize: '.82rem',
                      background: uploadCategory === opt.value ? opt.color + '22' : '#1a1a1a',
                      border: '1.5px solid ' + (uploadCategory === opt.value ? opt.color : '#2a2a2a'),
                      color: uploadCategory === opt.value ? opt.color : '#6b7280',
                    }}>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {uploadProgress && (
              <div style={{ fontSize: '.82rem', color: uploadProgress.includes('failed') ? '#ef4444' : '#10b981', fontWeight: '600', marginBottom: '14px', textAlign: 'center' }}>
                {uploadProgress}
              </div>
            )}
            <button onClick={handleUpload} disabled={uploading || !uploadFiles.length} style={{
              width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
              cursor: uploading || !uploadFiles.length ? 'not-allowed' : 'pointer',
              background: uploading || !uploadFiles.length ? '#2a2a2a' : 'linear-gradient(135deg,#10b981,#059669)',
              color: uploading || !uploadFiles.length ? '#6b7280' : 'white',
              fontFamily: "'DM Sans',sans-serif", fontWeight: '800', fontSize: '.95rem',
              boxShadow: uploading || !uploadFiles.length ? 'none' : '0 4px 20px rgba(16,185,129,.35)',
            }}>
              {uploading ? 'Uploading...' : 'Upload ' + (uploadFiles.length || '') + ' Photo' + (uploadFiles.length !== 1 ? 's' : '')}
            </button>
          </div>
        </div>
      )}

      {categories.length > 1 && (
        <div style={{ background: '#111', borderBottom: '1px solid #1f1f1f', padding: '0 20px', display: 'flex', gap: '4px', overflowX: 'auto' }}>
          {categories.map(function(cat) {
            return (
              <button key={cat} onClick={() => setFilter(cat)} style={{
                padding: '13px 18px', background: 'none', border: 'none',
                borderBottom: filter === cat ? '3px solid #a855f7' : '3px solid transparent',
                color: filter === cat ? '#a855f7' : '#6b7280',
                fontFamily: "'DM Sans',sans-serif", fontWeight: '700', fontSize: '.82rem',
                cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'capitalize',
              }}>
                {cat === 'all' ? '📷 All' : cat === 'before' ? '🔴 Before' : cat === 'after' ? '✅ After' : cat}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '28px 16px 80px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#6b7280' }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>{'📷'}</div>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.1rem', color: 'white' }}>{'Loading gallery...'}</div>
          </div>
        ) : filteredPhotos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#6b7280' }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>{'📷'}</div>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.2rem', color: 'white', marginBottom: '8px' }}>{'Photos Coming Soon'}</div>
            <div style={{ fontSize: '.85rem', lineHeight: 1.6, maxWidth: '320px', margin: '0 auto' }}>
              {"Check back soon — we're uploading our before & after photos of real client jobs."}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
            {filteredPhotos.map(function(photo, i) {
              return (
                <div key={photo.id || i} style={{ borderRadius: '16px', overflow: 'hidden', border: '1.5px solid #2a2a2a', position: 'relative', background: '#181818', transition: 'transform .15s, border-color .15s' }}
                  onMouseEnter={function(e) { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.borderColor = '#a855f7'; }}
                  onMouseLeave={function(e) { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = '#2a2a2a'; }}>
                  <div onClick={() => setLightbox({ ...photo, index: i })} style={{ aspectRatio: '4/3', overflow: 'hidden', background: '#111', cursor: 'zoom-in' }}>
                    <img src={photo.url} alt={photo.label || 'Gallery photo'} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  {photo.category && (
                    <div style={{
                      position: 'absolute', top: '10px', left: '10px',
                      background: photo.category === 'before' ? 'rgba(239,68,68,.9)' : photo.category === 'after' ? 'rgba(16,185,129,.9)' : 'rgba(168,85,247,.9)',
                      color: 'white', fontSize: '.65rem', fontWeight: '800', padding: '3px 9px', borderRadius: '99px',
                      textTransform: 'uppercase', letterSpacing: '.5px',
                    }}>
                      {photo.category === 'before' ? '🔴 Before' : photo.category === 'after' ? '✅ After' : photo.category}
                    </div>
                  )}
                  {isAdmin && (
                    <button onClick={() => handleDeletePhoto(photo)} style={{
                      position: 'absolute', top: '10px', right: '10px',
                      background: 'rgba(239,68,68,.9)', color: 'white', border: 'none',
                      borderRadius: '8px', padding: '4px 10px', fontSize: '.65rem', fontWeight: '800',
                      cursor: 'pointer', backdropFilter: 'blur(4px)',
                    }}>
                      {'🗑 Delete'}
                    </button>
                  )}
                  <div style={{ padding: '12px 14px' }}>
                    {photo.label && <div style={{ fontWeight: '700', color: 'white', fontSize: '.85rem', marginBottom: '3px' }}>{photo.label}</div>}
                    {photo.description && <div style={{ fontSize: '.75rem', color: '#6b7280', lineHeight: 1.5 }}>{photo.description}</div>}
                    <div style={{ fontSize: '.65rem', color: '#4b5563', marginTop: '6px' }}>{'🔍 Tap to enlarge'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.93)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={function(e) { e.stopPropagation(); }} style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img src={lightbox.url} alt={lightbox.label || ''} style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: '14px', display: 'block' }} />
            {lightbox.label && (
              <div style={{ textAlign: 'center', marginTop: '14px', fontWeight: '700', color: 'white', fontSize: '.95rem' }}>
                {(lightbox.category === 'before' ? '🔴 Before — ' : lightbox.category === 'after' ? '✅ After — ' : '') + lightbox.label}
              </div>
            )}
            <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: '-14px', right: '-14px', width: '36px', height: '36px', borderRadius: '50%', background: '#2a2a2a', border: '2px solid #444', color: 'white', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{'×'}</button>
            {filteredPhotos.length > 1 && (
              <>
                <button onClick={function(e) { e.stopPropagation(); var n = (lightbox.index - 1 + filteredPhotos.length) % filteredPhotos.length; setLightbox({ ...filteredPhotos[n], index: n }); }}
                  style={{ position: 'absolute', left: '-52px', top: '50%', transform: 'translateY(-50%)', width: '40px', height: '40px', borderRadius: '50%', background: '#1f1f1f', border: '1px solid #333', color: 'white', fontSize: '1.3rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{'‹'}</button>
                <button onClick={function(e) { e.stopPropagation(); var n = (lightbox.index + 1) % filteredPhotos.length; setLightbox({ ...filteredPhotos[n], index: n }); }}
                  style={{ position: 'absolute', right: '-52px', top: '50%', transform: 'translateY(-50%)', width: '40px', height: '40px', borderRadius: '50%', background: '#1f1f1f', border: '1px solid #333', color: 'white', fontSize: '1.3rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{'›'}</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}