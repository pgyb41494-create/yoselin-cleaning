'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth, ADMIN_EMAILS } from '../../lib/firebase';

// Compress image to base64 data URL
function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = (maxWidth / w) * h; w = maxWidth; }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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

  // Load gallery photos from multiple Firestore docs (settings/gallery_0, gallery_1, etc.)
  useEffect(() => {
    // Listen to the index doc
    const unsub = onSnapshot(
      doc(db, 'settings', 'galleryIndex'),
      async (snap) => {
        if (snap.exists()) {
          const { count = 0 } = snap.data();
          const allPhotos = [];
          for (let i = 0; i < count; i++) {
            try {
              const chunkSnap = await getDoc(doc(db, 'settings', `gallery_${i}`));
              if (chunkSnap.exists()) {
                allPhotos.push(...(chunkSnap.data().photos || []));
              }
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
      if (e.key === 'ArrowLeft')  { const n = (lightbox.index - 1 + filteredPhotos.length) % filteredPhotos.length; setLightbox({ ...filteredPhotos[n], index: n }); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightbox, photos, filter]);

  const handleUpload = async () => {
    if (!uploadFiles.length) return;
    setUploading(true);
    setUploadProgress('');
    try {
      // Compress all images
      const newPhotos = [];
      for (let i = 0; i < uploadFiles.length; i++) {
        setUploadProgress(`Compressing ${i + 1} of ${uploadFiles.length}...`);
        const dataUrl = await compressImage(uploadFiles[i]);
        newPhotos.push({
          id: Date.now().toString() + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
          url: dataUrl,
          label: uploadLabel || '',
          description: uploadDesc || '',
          category: uploadCategory || '',
          createdAt: new Date().toISOString(),
        });
      }

      setUploadProgress('Saving to gallery...');

      // Load existing photos from all chunks
      const indexSnap = await getDoc(doc(db, 'settings', 'galleryIndex'));
      const existingCount = indexSnap.exists() ? (indexSnap.data().count || 0) : 0;
      let allExisting = [];
      for (let i = 0; i < existingCount; i++) {
        try {
          const chunkSnap = await getDoc(doc(db, 'settings', `gallery_${i}`));
          if (chunkSnap.exists()) allExisting.push(...(chunkSnap.data().photos || []));
        } catch (e) {}
      }

      // Merge new photos at the front
      const allPhotos = [...newPhotos, ...allExisting];

      // Split into chunks of ~4 photos per doc (to stay under 1MB Firestore limit)
      const CHUNK_SIZE = 4;
      const chunks = [];
      for (let i = 0; i < allPhotos.length; i += CHUNK_SIZE) {
        chunks.push(allPhotos.slice(i, i + CHUNK_SIZE));
      }

      // Write each chunk
      for (let i = 0; i < chunks.length; i++) {
        await setDoc(doc(db, 'settings', `gallery_${i}`), { photos: chunks[i] });
      }

      // Update index
      await setDoc(doc(db, 'settings', 'galleryIndex'), { count: chunks.length });

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
      // Load all photos
      const indexSnap = await getDoc(doc(db, 'settings', 'galleryIndex'));
      const existingCount = indexSnap.exists() ? (indexSnap.data().count || 0) : 0;
      let allPhotos = [];
      for (let i = 0; i < existingCount; i++) {
        try {
          const chunkSnap = await getDoc(doc(db, 'settings', `gallery_${i}`));
          if (chunkSnap.exists()) allPhotos.push(...(chunkSnap.data().photos || []));
        } catch (e) {}
      }

      // Remove the photo
      allPhotos = allPhotos.filter(p => p.id !== photo.id);

      // Re-chunk and save
      const CHUNK_SIZE = 4;
      const chunks = [];
      for (let i = 0; i < allPhotos.length; i += CHUNK_SIZE) {
        chunks.push(allPhotos.slice(i, i + CHUNK_SIZE));
      }
      for (let i = 0; i < chunks.length; i++) {
        await setDoc(doc(db, 'settings', `gallery_${i}`), { photos: chunks[i] });
      }
      // Clean up old chunks
      for (let i = chunks.length; i < existingCount; i++) {
        try { await setDoc(doc(db, 'settings', `gallery_${i}`), { photos: [] }); } catch (e) {}
      }
      await setDoc(doc(db, 'settings', 'galleryIndex'), { count: chunks.length });
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const filtered = filter === 'all' ? photos : photos.filter(p => p.category === filter);
  const categories = ['all', ...new Set(photos.map(p => p.category).filter(Boolean))];

  const inputStyle = {
    width: '100%', padding: '11px 14px', background: '#1a1a1a', border: '1.5px solid #2a2a2a',
    borderRadius: '10px', color: 'white', fontSize: '.88rem', fontFamily: "'DM Sans',sans-serif",
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>

      {/* NAV */}
      <nav style={{ background: '#151515', borderBottom: '1px solid #1f1f1f', padding: '0 24px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <img src="/logo.png" alt="Yoselin's Cleaning" style={{ height: '50px', objectFit: 'contain' }} />
        </button>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => router.push('/')} style={{ padding: '9px 18px', background: 'transparent', border: '1.5px solid #2a2a2a', color: '#9ca3af', borderRadius: '10px', fontFamily: "'DM Sans',sans-serif", fontWeight: '700', fontSize: '.83rem', cursor: 'pointer' }}>
            ← Home
          </button>
          <button onClick={() => router.push('/book')} style={{ padding: '9px 18px', background: 'linear-gradient(135deg,#1a6fd4,#db2777)', color: 'white', border: 'none', borderRadius: '10px', fontFamily: "'DM Sans',sans-serif", fontWeight: '700', fontSize: '.83rem', cursor: 'pointer' }}>
            Get a Quote
          </button>
        </div>
      </nav>

      {/* HERO */}
      <div style={{ background: 'linear-gradient(135deg,#0d0d1a 0%,#1a0828 50%,#0d0d1a 100%)', padding: '52px 24px 40px', textAlign: 'center' }}>
        <div style={{ fontSize: '.73rem', fontWeight: '800', color: '#a855f7', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '12px' }}>Real Results · Real Homes</div>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(1.8rem,5vw,2.8rem)', fontWeight: '900', color: 'white', marginBottom: '16px', lineHeight: 1.2 }}>
          See the <span style={{ background: 'linear-gradient(135deg,#f472b6,#a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Transformation</span>
        </h1>
        <p style={{ color: '#9ca3af', fontSize: 'clamp(.85rem,2.5vw,1rem)', maxWidth: '520px', margin: '0 auto 28px', lineHeight: 1.7 }}>
          Every photo is from a real job. We tackle the toughest messes — stoves, bathrooms, floors, kitchens — and leave everything spotless.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[['✨', photos.length + ' Photos'], ['🏆', '5.0 Rating'], ['📍', 'Fairfield, OH']].map(([ico, label]) => (
            <div key={label} style={{ background: 'rgba(168,85,247,.1)', border: '1px solid rgba(168,85,247,.2)', borderRadius: '99px', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{ico}</span>
              <span style={{ fontSize: '.78rem', fontWeight: '700', color: '#d8b4fe' }}>{label}</span>
            </div>
          ))}
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

      {/* ADMIN UPLOAD PANEL */}
      {isAdmin && showUpload && (
        <div style={{ background: 'linear-gradient(135deg,rgba(16,185,129,.06),rgba(5,150,105,.04))', borderBottom: '1.5px solid rgba(16,185,129,.2)', padding: '28px 24px' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.2rem', fontWeight: '800', color: 'white', marginBottom: '18px', textAlign: 'center' }}>
              📷 Upload Gallery Photos
            </h3>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '.78rem', fontWeight: '700', color: '#9ca3af', marginBottom: '6px' }}>Select Photos</label>
              <input type="file" accept="image/*" multiple
                onChange={e => setUploadFiles(Array.from(e.target.files))}
                style={{ ...inputStyle, padding: '10px', cursor: 'pointer' }} />
              {uploadFiles.length > 0 && (
                <div style={{ fontSize: '.75rem', color: '#10b981', marginTop: '6px', fontWeight: '600' }}>
                  {uploadFiles.length} file{uploadFiles.length > 1 ? 's' : ''} selected
                </div>
              )}
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '.78rem', fontWeight: '700', color: '#9ca3af', marginBottom: '6px' }}>Label (optional)</label>
              <input type="text" placeholder="e.g. Kitchen Deep Clean" value={uploadLabel}
                onChange={e => setUploadLabel(e.target.value)} style={inputStyle} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '.78rem', fontWeight: '700', color: '#9ca3af', marginBottom: '6px' }}>Description (optional)</label>
              <input type="text" placeholder="e.g. Full kitchen scrub including oven" value={uploadDesc}
                onChange={e => setUploadDesc(e.target.value)} style={inputStyle} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '.78rem', fontWeight: '700', color: '#9ca3af', marginBottom: '6px' }}>Category</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { value: '', label: 'None', color: '#6b7280' },
                  { value: 'before', label: '🔴 Before', color: '#ef4444' },
                  { value: 'after', label: '✅ After', color: '#10b981' },
                  { value: 'general', label: '📷 General', color: '#a855f7' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setUploadCategory(opt.value)}
                    style={{
                      padding: '8px 16px', borderRadius: '10px', cursor: 'pointer',
                      fontFamily: "'DM Sans',sans-serif", fontWeight: '700', fontSize: '.82rem',
                      background: uploadCategory === opt.value ? opt.color + '22' : '#1a1a1a',
                      border: `1.5px solid ${uploadCategory === opt.value ? opt.color : '#2a2a2a'}`,
                      color: uploadCategory === opt.value ? opt.color : '#6b7280',
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {uploadProgress && (
              <div style={{ fontSize: '.82rem', color: uploadProgress.includes('failed') ? '#ef4444' : '#10b981', fontWeight: '600', marginBottom: '14px', textAlign: 'center' }}>
                {uploadProgress}
              </div>
            )}

            <button onClick={handleUpload} disabled={uploading || !uploadFiles.length}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px', border: 'none', cursor: uploading || !uploadFiles.length ? 'not-allowed' : 'pointer',
                background: uploading || !uploadFiles.length ? '#2a2a2a' : 'linear-gradient(135deg,#10b981,#059669)',
                color: uploading || !uploadFiles.length ? '#6b7280' : 'white',
                fontFamily: "'DM Sans',sans-serif", fontWeight: '800', fontSize: '.95rem',
                boxShadow: uploading || !uploadFiles.length ? 'none' : '0 4px 20px rgba(16,185,129,.35)',
              }}>
              {uploading ? '⏳ Uploading...' : `Upload ${uploadFiles.length || ''} Photo${uploadFiles.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* FILTER TABS */}
      {categories.length > 1 && (
        <div style={{ background: '#111', borderBottom: '1px solid #1f1f1f', padding: '0 20px', display: 'flex', gap: '4px', overflowX: 'auto' }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)} style={{
              padding: '13px 18px', background: 'none', border: 'none',
              borderBottom: filter === cat ? '3px solid #a855f7' : '3px solid transparent',
              color: filter === cat ? '#a855f7' : '#6b7280',
              fontFamily: "'DM Sans',sans-serif", fontWeight: '700', fontSize: '.82rem',
              cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'capitalize',
            }}>
              {cat === 'all' ? '📷 All' : cat === 'before' ? '🔴 Before' : cat === 'after' ? '✅ After' : cat}
            </button>
          ))}
        </div>
      )}

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '28px 16px 80px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#6b7280' }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📷</div>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.1rem', color: 'white' }}>Loading gallery...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#6b7280' }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📷</div>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.2rem', color: 'white', marginBottom: '8px' }}>Photos Coming Soon</div>
            <div style={{ fontSize: '.85rem', lineHeight: 1.6, maxWidth: '320px', margin: '0 auto' }}>
              Check back soon — we're uploading our before & after photos of real client jobs.
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
              {filtered.map((photo, i) => (
                <div key={photo.id || i} style={{ borderRadius: '16px', overflow: 'hidden', border: '1.5px solid #2a2a2a', position: 'relative', background: '#181818', transition: 'transform .15s, border-color .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.borderColor = '#a855f7'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = '#2a2a2a'; }}>
                  <div onClick={() => setLightbox({ ...photo, index: i })} style={{ aspectRatio: '4/3', overflow: 'hidden', background: '#111', cursor: 'zoom-in' }}>
                    <img src={photo.url} alt={photo.label || 'Gallery photo'} loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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
                    <button onClick={() => handleDeletePhoto(photo)}
                      style={{
                        position: 'absolute', top: '10px', right: '10px',
                        background: 'rgba(239,68,68,.9)', color: 'white', border: 'none',
                        borderRadius: '8px', padding: '4px 10px', fontSize: '.65rem', fontWeight: '800',
                        cursor: 'pointer', backdropFilter: 'blur(4px)',
                      }}>
                      🗑 Delete
                    </button>
                  )}
                  <div style={{ padding: '12px 14px' }}>
                    {photo.label && <div style={{ fontWeight: '700', color: 'white', fontSize: '.85rem', marginBottom: '3px' }}>{photo.label}</div>}
                    {photo.description && <div style={{ fontSize: '.75rem', color: '#6b7280', lineHeight: 1.5 }}>{photo.description}</div>}
                    <div style={{ fontSize: '.65rem', color: '#4b5563', marginTop: '6px' }}>🔍 Tap to enlarge</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: 'linear-gradient(135deg,rgba(26,111,212,.1),rgba(219,39,119,.08))', border: '1.5px solid rgba(168,85,247,.2)', borderRadius: '20px', padding: '40px 24px', textAlign: 'center', marginTop: '48px' }}>
              <div style={{ fontSize: '2rem', marginBottom: '14px' }}>✨</div>
              <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.5rem', fontWeight: '900', color: 'white', marginBottom: '8px' }}>Want Results Like These?</h2>
              <p style={{ color: '#9ca3af', fontSize: '.9rem', marginBottom: '24px', lineHeight: 1.6 }}>Get a free custom estimate for your home or office. No commitment required.</p>
              <button onClick={() => router.push('/book')} style={{ padding: '15px 36px', background: 'linear-gradient(135deg,#a855f7,#db2777)', color: 'white', border: 'none', borderRadius: '14px', fontFamily: "'DM Sans',sans-serif", fontWeight: '800', fontSize: '1rem', cursor: 'pointer' }}>
                Book a Cleaning Now
              </button>
            </div>
          </>
        )}
      </div>

      {/* LIGHTBOX */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.93)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img src={lightbox.url} alt={lightbox.label || ''} style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: '14px', display: 'block' }} />
            {lightbox.label && (
              <div style={{ textAlign: 'center', marginTop: '14px', fontWeight: '700', color: 'white', fontSize: '.95rem' }}>
                {lightbox.category === 'before' ? '🔴 Before — ' : lightbox.category === 'after' ? '✅ After — ' : ''}{lightbox.label}
              </div>
            )}
            <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: '-14px', right: '-14px', width: '36px', height: '36px', borderRadius: '50%', background: '#2a2a2a', border: '2px solid #444', color: 'white', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            {filtered.length > 1 && (
              <>
                <button onClick={e => { e.stopPropagation(); const n = (lightbox.index - 1 + filtered.length) % filtered.length; setLightbox({ ...filtered[n], index: n }); }}
                  style={{ position: 'absolute', left: '-52px', top: '50%', transform: 'translateY(-50%)', width: '40px', height: '40px', borderRadius: '50%', background: '#1f1f1f', border: '1px solid #333', color: 'white', fontSize: '1.3rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
                <button onClick={e => { e.stopPropagation(); const n = (lightbox.index + 1) % filtered.length; setLightbox({ ...filtered[n], index: n }); }}
                  style={{ position: 'absolute', right: '-52px', top: '50%', transform: 'translateY(-50%)', width: '40px', height: '40px', borderRadius: '50%', background: '#1f1f1f', border: '1px solid #333', color: 'white', fontSize: '1.3rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
