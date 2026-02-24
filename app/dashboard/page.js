'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../../lib/firebase';
import Chat from '../../components/Chat';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('home');

  // Settings state
  const [settingsName, setSettingsName] = useState('');
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [settingsMsg, setSettingsMsg] = useState('');
  const [settingsErr, setSettingsErr] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) { router.push('/'); return; }
      if (u.email === ADMIN_EMAIL) { router.push('/admin'); return; }
      setUser(u);
      setSettingsName(u.displayName || '');
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'requests'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setRequest(docs[0]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const saveName = async () => {
    if (!settingsName.trim()) { setSettingsErr('Name cannot be empty.'); return; }
    setSettingsBusy(true); setSettingsErr(''); setSettingsMsg('');
    try {
      await updateProfile(user, { displayName: settingsName.trim() });
      setSettingsMsg('Name updated successfully!');
    } catch { setSettingsErr('Failed to update name.'); }
    setSettingsBusy(false);
  };

  const savePassword = async () => {
    if (!currentPass || !newPass) { setSettingsErr('Fill in both password fields.'); return; }
    if (newPass.length < 6) { setSettingsErr('New password must be at least 6 characters.'); return; }
    setSettingsBusy(true); setSettingsErr(''); setSettingsMsg('');
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPass);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPass);
      setSettingsMsg('Password updated!');
      setCurrentPass(''); setNewPass('');
    } catch (e) {
      setSettingsErr(e.code === 'auth/wrong-password' ? 'Current password is incorrect.' : 'Failed to update password.');
    }
    setSettingsBusy(false);
  };

  if (loading) return <div className="spinner-page"><div className="spinner"></div></div>;

  const firstName = user?.displayName?.split(' ')[0] || 'there';
  const statusLabel = request?.status === 'new' ? 'Pending Review' : request?.status === 'confirmed' ? 'Confirmed' : 'Completed';
  const statusColor = request?.status === 'new' ? '#f59e0b' : request?.status === 'confirmed' ? '#10b981' : '#6b7280';
  const statusIcon = request?.status === 'new' ? '⏳' : request?.status === 'confirmed' ? '✅' : '🏁';
  const isGoogleUser = user?.providerData?.[0]?.providerId === 'google.com';

  return (
    <div className="cd-root">

      {/* NAV */}
      <nav className="cd-nav">
        <div className="cd-nav-brand">✨ Yoselins Cleaning</div>
        <div className="cd-nav-right">
          {user?.photoURL
            ? <img src={user.photoURL} className="nav-avatar" alt="" />
            : <div className="cd-avatar-initials">{firstName[0]?.toUpperCase()}</div>
          }
          <span className="cd-nav-name">{firstName}</span>
          <button className="signout-btn" onClick={() => { signOut(auth); router.push('/'); }}>Sign Out</button>
        </div>
      </nav>

      {/* HERO GREETING */}
      <div className="cd-hero">
        <div className="cd-hero-inner">
          <div className="cd-hero-left">
            <h1>Hey, {firstName} 👋</h1>
            <p>Welcome to your cleaning portal</p>
          </div>
          {request && (
            <div className="cd-hero-status">
              <div className="chs-icon">{statusIcon}</div>
              <div>
                <div className="chs-label">Your Booking</div>
                <div className="chs-status" style={{color: statusColor}}>{statusLabel}</div>
                <div className="chs-price">${request.estimate} estimate</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TAB BAR */}
      <div className="cd-tabs">
        {[
          { id: 'home', label: 'Home', icon: '🏠' },
          { id: 'messages', label: 'Messages', icon: '💬' },
          { id: 'request', label: 'My Quote', icon: '📋' },
          { id: 'settings', label: 'Settings', icon: '⚙️' },
        ].map(t => (
          <button
            key={t.id}
            className={`cd-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            <span className="cd-tab-icon">{t.icon}</span>
            <span className="cd-tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="cd-body">

        {/* ── HOME TAB ── */}
        {activeTab === 'home' && (
          <div className="cd-home">

            {/* Big quote CTA or status */}
            {!request ? (
              <div className="cd-welcome-card">
                <div className="cwc-bg" />
                <div className="cwc-content">
                  <div className="cwc-icon">✨</div>
                  <h2>Get Your Free Quote</h2>
                  <p>Fill out a quick form and we'll send you a custom estimate for your space. No commitment needed.</p>
                  <button className="cd-btn-primary cwc-btn" onClick={() => router.push('/book')}>
                    Get a Quote →
                  </button>
                </div>
              </div>
            ) : (
              <div className="cd-booking-banner">
                <div className="cbb-left">
                  <div className="cbb-ref">Booking #{request.id.slice(-6).toUpperCase()}</div>
                  <div className="cbb-date">📅 {request.date || 'Date TBD'} · {request.time || 'Time TBD'}</div>
                  <div className="cbb-addr">📍 {request.address}</div>
                </div>
                <div className="cbb-right">
                  <div className="cbb-price">${request.estimate}</div>
                  <div className="cbb-plabel">Estimate</div>
                </div>
              </div>
            )}

            {/* Quick action tiles */}
            <div className="cd-tiles">
              <div className="cd-tile" onClick={() => setActiveTab('messages')} style={{opacity: request ? 1 : .45, pointerEvents: request ? 'auto' : 'none'}}>
                <div className="ct-icon-wrap ct-blue">💬</div>
                <div className="ct-text">
                  <div className="ct-title">Messages</div>
                  <div className="ct-sub">{request ? 'Chat with us' : 'Available after quote'}</div>
                </div>
                <div className="ct-arrow">›</div>
              </div>
              <div className="cd-tile" onClick={() => setActiveTab('request')} style={{opacity: request ? 1 : .45, pointerEvents: request ? 'auto' : 'none'}}>
                <div className="ct-icon-wrap ct-pink">📋</div>
                <div className="ct-text">
                  <div className="ct-title">My Quote</div>
                  <div className="ct-sub">{request ? 'View details' : 'No quote yet'}</div>
                </div>
                <div className="ct-arrow">›</div>
              </div>
              <div className="cd-tile" onClick={() => router.push('/book')}>
                <div className="ct-icon-wrap ct-green">💰</div>
                <div className="ct-text">
                  <div className="ct-title">{request ? 'New Quote' : 'Get a Quote'}</div>
                  <div className="ct-sub">Instant estimate</div>
                </div>
                <div className="ct-arrow">›</div>
              </div>
              <div className="cd-tile" onClick={() => setActiveTab('settings')}>
                <div className="ct-icon-wrap ct-gray">⚙️</div>
                <div className="ct-text">
                  <div className="ct-title">Settings</div>
                  <div className="ct-sub">Update your info</div>
                </div>
                <div className="ct-arrow">›</div>
              </div>
            </div>
          </div>
        )}

        {/* ── MESSAGES TAB ── */}
        {activeTab === 'messages' && (
          <div className="cd-tab-panel">
            {!request ? (
              <div className="cd-empty-state">
                <div className="ces-icon">💬</div>
                <h3>No Messages Yet</h3>
                <p>Once you submit a quote request, you can message us directly here.</p>
                <button className="cd-btn-primary" onClick={() => router.push('/book')}>Get a Quote →</button>
              </div>
            ) : (
              <div className="cd-messages-wrap">
                <div className="cd-section-header">
                  <h3>Messages</h3>
                  <p>Questions or changes? Send us a message below.</p>
                </div>
                <Chat requestId={request.id} currentUser={user} senderRole="customer" onClose={null} inline={true} />
              </div>
            )}
          </div>
        )}

        {/* ── MY QUOTE TAB ── */}
        {activeTab === 'request' && (
          <div className="cd-tab-panel">
            {!request ? (
              <div className="cd-empty-state">
                <div className="ces-icon">📋</div>
                <h3>No Quote Yet</h3>
                <p>Submit your first quote request and we'll get back to you within 24 hours.</p>
                <button className="cd-btn-primary" onClick={() => router.push('/book')}>Get a Quote →</button>
              </div>
            ) : (
              <div>
                <div className="cd-section-header">
                  <h3>Quote Details</h3>
                  <span className={`badge badge-${request.status}`}>{statusIcon} {statusLabel}</span>
                </div>
                <div className="cd-detail-card">
                  <div className="cdc-price-row">
                    <div>
                      <div className="cdc-price-label">Your Estimate</div>
                      <div className="cdc-price">${request.estimate}</div>
                      <div className="cdc-price-note">Final price confirmed before service</div>
                    </div>
                    <div className="cdc-ref">#{request.id.slice(-6).toUpperCase()}</div>
                  </div>
                  <div className="cdc-grid">
                    {[
                      ['📅 Date', request.date || 'TBD'],
                      ['🕐 Time', request.time || 'TBD'],
                      ['📍 Address', request.address],
                      ['🔁 Frequency', request.frequency],
                      ['🛁 Bathrooms', request.bathrooms],
                      ['🛏️ Rooms', request.rooms],
                      ['✨ Add-Ons', request.addons || 'None'],
                      ['🐾 Pets', request.pets === 'yes' ? 'Yes' : 'No'],
                    ].map(([k, v]) => (
                      <div className="cdc-row" key={k}>
                        <span className="cdc-key">{k}</span>
                        <span className="cdc-val">{v}</span>
                      </div>
                    ))}
                  </div>
                  <button className="cd-btn-primary" style={{width:'100%', marginTop:'16px'}} onClick={() => setActiveTab('messages')}>
                    💬 Send a Message
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && (
          <div className="cd-tab-panel">
            <div className="cd-section-header">
              <h3>Account Settings</h3>
              <p>Update your name and password</p>
            </div>

            {settingsMsg && <div className="cd-alert cd-alert-success">✅ {settingsMsg}</div>}
            {settingsErr && <div className="cd-alert cd-alert-error">⚠️ {settingsErr}</div>}

            {/* Profile */}
            <div className="cd-settings-card">
              <div className="csc-section-title">Profile</div>
              <div className="cd-settings-avatar">
                {user?.photoURL
                  ? <img src={user.photoURL} alt="" />
                  : <div className="csa-initials">{firstName[0]?.toUpperCase()}</div>
                }
                <div>
                  <div className="csa-name">{user?.displayName || 'No name set'}</div>
                  <div className="csa-email">{user?.email}</div>
                </div>
              </div>
              <div className="cd-settings-field">
                <label>Display Name</label>
                <input
                  type="text"
                  value={settingsName}
                  onChange={e => setSettingsName(e.target.value)}
                  placeholder="Your full name"
                />
              </div>
              <button className="cd-btn-primary" onClick={saveName} disabled={settingsBusy}>
                {settingsBusy ? 'Saving...' : 'Save Name'}
              </button>
            </div>

            {/* Password — only for email users */}
            {!isGoogleUser ? (
              <div className="cd-settings-card">
                <div className="csc-section-title">Change Password</div>
                <div className="cd-settings-field">
                  <label>Current Password</label>
                  <input
                    type="password"
                    value={currentPass}
                    onChange={e => setCurrentPass(e.target.value)}
                    placeholder="Enter current password"
                  />
                </div>
                <div className="cd-settings-field">
                  <label>New Password</label>
                  <input
                    type="password"
                    value={newPass}
                    onChange={e => setNewPass(e.target.value)}
                    placeholder="At least 6 characters"
                  />
                </div>
                <button className="cd-btn-primary" onClick={savePassword} disabled={settingsBusy}>
                  {settingsBusy ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            ) : (
              <div className="cd-settings-card cd-settings-muted">
                <div className="csc-section-title">Password</div>
                <p>You signed in with Google. Password changes are managed through your Google account.</p>
              </div>
            )}

            {/* Danger zone */}
            <div className="cd-settings-card cd-danger-card">
              <div className="csc-section-title">Sign Out</div>
              <p>This will sign you out of your account on this device.</p>
              <button className="cd-btn-danger" onClick={() => { signOut(auth); router.push('/'); }}>
                Sign Out
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
