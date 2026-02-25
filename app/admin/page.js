'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../../lib/firebase';
import Chat from '../../components/Chat';

// ── Pricing (mirrors book/page.js) ──────────────────────
const BPRICES = { half:15, small:50, medium:65, large:80 };
const RPRICES = { bed_small:25, bed_medium:30, bed_large:35, liv_medium:15, liv_large:35, office:10, kit_small:45, kit_medium:55, kit_large:70, laundry:10, basement:75 };
const RNAMES  = { bed_small:'Small Bedroom', bed_medium:'Medium Bedroom', bed_large:'Large/Master Bedroom', liv_medium:'Medium Living Room', liv_large:'Large Living Room', office:'Office/Study', kit_small:'Small Kitchen', kit_medium:'Medium Kitchen', kit_large:'Large Kitchen', laundry:'Laundry Room', basement:'Basement' };
const BNAMES  = { half:'Half Bath', small:'Small Full Bath', medium:'Medium Full Bath', large:'Large/Master Bath' };
const EXTRAS  = [
  { id:'cabinets', name:'🗄️ Inside Cabinets', price:16 },
  { id:'pantry',   name:'🥫 Inside Pantry',   price:20 },
  { id:'oven',     name:'🔥 Inside Oven',      price:16 },
  { id:'fridge',   name:'❄️ Inside Fridge',    price:16 },
  { id:'baseboard',name:'🧹 Baseboard Cleaning',price:5 },
];
const FREQS = [
  { val:'once',     label:'One-Time',    tag:'No discount',   pct:0 },
  { val:'biweekly', label:'Bi-Weekly',   tag:'Save 15%',      pct:0.15 },
  { val:'weekly',   label:'Weekly',      tag:'Save 15–20%',   pct:0.175 },
  { val:'monthly',  label:'2–3× / Month',tag:'Save 10–15%',   pct:0.125 },
];
const BUILDING_TYPES = [
  {val:'House',icon:'🏠'},{val:'Apartment',icon:'🏢'},{val:'Condo',icon:'🏙️'},
  {val:'Party / Event',icon:'🎉'},{val:'Office',icon:'💼'},{val:'Bank',icon:'🏦'},{val:'Retail Store',icon:'🛍️'},
];
const ALL_TIMES = ['Morning (8am–12pm)','Afternoon (12pm–4pm)','Evening (4pm–7pm)','Flexible'];
const initBaths = () => ({ half:0, small:0, medium:0, large:0 });
const initRooms = () => ({ bed_small:0, bed_medium:0, bed_large:0, liv_medium:0, liv_large:0, office:0, kit_small:0, kit_medium:0, kit_large:0, laundry:0, basement:0 });

// ── Shared sub-components ────────────────────────────────
function QCtrl({ val, onInc, onDec }) {
  return (
    <div className="qctrl">
      <button className="qbtn" onClick={onDec}>−</button>
      <span className="qdis">{val}</span>
      <button className="qbtn" onClick={onInc}>+</button>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [user,     setUser]     = useState(null);
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [chatReq,  setChatReq]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [adminTab, setAdminTab] = useState('new');
  const [authError,setAuthError]= useState(false);

  // ── Availability ──────────────────────────────────────
  const [availability, setAvailability] = useState([]);
  const [newDate,  setNewDate]  = useState('');
  const [newTimes, setNewTimes] = useState([]);
  const [avBusy,   setAvBusy]   = useState(false);

  // ── Full Quote Wizard state ───────────────────────────
  const [showWizard,  setShowWizard]  = useState(false);
  const [wizStep,     setWizStep]     = useState(0);
  const [wizBaths,    setWizBaths]    = useState(initBaths());
  const [wizRooms,    setWizRooms]    = useState(initRooms());
  const [wizExtras,   setWizExtras]   = useState({});
  const [wizWindows,  setWizWindows]  = useState(false);
  const [wizWinCount, setWizWinCount] = useState(1);
  const [wizWinModal, setWizWinModal] = useState(false);
  const [wizFreq,     setWizFreq]     = useState('once');
  const [wizWalk,     setWizWalk]     = useState(false);
  const [wizFirst,    setWizFirst]    = useState('no');
  const [wizSenior,   setWizSenior]   = useState('no');
  const [wizForm,     setWizForm]     = useState({ firstName:'', lastName:'', phone:'', email:'', address:'', date:'', time:'', pets:'no', otherReqs:'', notes:'', referral:'', access:"I'll be home", buildingType:'' });
  const [wizBusy,     setWizBusy]     = useState(false);
  const [wizDone,     setWizDone]     = useState(false);

  // ── Auth ──────────────────────────────────────────────
  useEffect(() => {
    let t;
    try {
      const unsub = onAuthStateChanged(auth, u => {
        clearTimeout(t);
        if (!u || u.email !== ADMIN_EMAIL) { router.push('/'); return; }
        setUser(u); setLoading(false);
      });
      t = setTimeout(() => { setLoading(false); setAuthError(true); }, 8000);
      return () => { unsub(); clearTimeout(t); };
    } catch { setLoading(false); setAuthError(true); }
  }, [router]);

  // ── Requests listener ────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'requests'), orderBy('createdAt', 'desc')),
      snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [user]);

  // ── Availability listener ────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'availability'), orderBy('createdAt', 'asc')),
      snap => setAvailability(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [user]);

  // ── Actions ──────────────────────────────────────────
  const confirmReq = async (req) => {
    await updateDoc(doc(db, 'requests', req.id), { status:'confirmed' });
    await addDoc(collection(db, 'chats', req.id, 'messages'), {
      text:`Hi ${req.name.split(' ')[0]}! 🎉 Your cleaning appointment has been confirmed for ${req.date}. Please reach out if you have any questions!`,
      sender:'admin', senderName:'Yoselin', createdAt: serverTimestamp(),
    });
    setSelected(r => r ? { ...r, status:'confirmed' } : r);
  };

  const markDone = async (req) => {
    await updateDoc(doc(db, 'requests', req.id), { status:'done' });
    setSelected(r => r ? { ...r, status:'done' } : r);
  };

  const addAvailability = async () => {
    if (!newDate.trim() || newTimes.length === 0) { alert('Add a date and select at least one time slot.'); return; }
    setAvBusy(true);
    await addDoc(collection(db, 'availability'), {
      date: newDate.trim(), times: newTimes, createdAt: serverTimestamp(),
    });
    setNewDate(''); setNewTimes([]); setAvBusy(false);
  };

  const deleteAvailability = async (id) => {
    await deleteDoc(doc(db, 'availability', id));
  };

  // ── Wizard pricing ───────────────────────────────────
  const calcWizPrice = () => {
    let base = 0; const lines = [];
    Object.keys(wizBaths).forEach(t => { if (wizBaths[t]>0) { base += wizBaths[t]*BPRICES[t]; lines.push(BNAMES[t]+' ×'+wizBaths[t]); }});
    Object.keys(wizRooms).forEach(r => { if (wizRooms[r]>0) { base += wizRooms[r]*RPRICES[r]; lines.push(RNAMES[r]+' ×'+wizRooms[r]); }});
    let ext = 0; const extraNames = [];
    EXTRAS.forEach(e => { if (wizExtras[e.id]) { ext += e.price; extraNames.push(e.name.replace(/[^\w\s]/g,'').trim()); }});
    if (wizWindows) { ext += wizWinCount*5; extraNames.push('Window Trim ×'+wizWinCount); }
    const sub = base + ext;
    const discounts = [];
    const fq = FREQS.find(f => f.val === wizFreq);
    if (fq?.pct > 0) discounts.push({ k: fq.label+' discount', pct: fq.pct });
    if (wizFirst==='yes') discounts.push({ k:'First-Time 10%', pct:0.10 });
    if (wizSenior==='yes') discounts.push({ k:'Senior 10%', pct:0.10 });
    const discAmt = discounts.reduce((s,d) => s+sub*d.pct, 0);
    return { final: Math.max(0, Math.round(sub-discAmt)), sub, discounts, lines, extraNames };
  };

  const setWF = (k, v) => setWizForm(f => ({ ...f, [k]: v }));

  const submitWizard = async () => {
    if (!wizForm.firstName.trim()) { alert('Please enter client first name.'); return; }
    setWizBusy(true);
    const price = calcWizPrice();
    const bathDesc = Object.keys(wizBaths).filter(k=>wizBaths[k]>0).map(k=>wizBaths[k]+' '+BNAMES[k]).join(', ') || 'None';
    const roomDesc = Object.keys(wizRooms).filter(k=>wizRooms[k]>0).map(k=>wizRooms[k]+' '+RNAMES[k]).join(', ') || 'None';
    const ref = await addDoc(collection(db, 'requests'), {
      userId: 'manual-'+Date.now(),
      userEmail: wizForm.email,
      name: (wizForm.firstName+' '+wizForm.lastName).trim(),
      phone: wizForm.phone || 'N/A',
      email: wizForm.email || 'N/A',
      address: wizForm.address || 'N/A',
      date: wizForm.date || 'N/A',
      time: wizForm.time || 'N/A',
      buildingType: wizForm.buildingType || 'Not specified',
      bathrooms: bathDesc,
      rooms: roomDesc,
      addons: price.extraNames.join(', ') || 'None',
      pets: wizForm.pets,
      otherRequests: wizForm.otherReqs || 'None',
      walkthrough: wizWalk ? 'Yes' : 'No',
      frequency: wizFreq,
      firstTime: wizFirst,
      senior: wizSenior,
      notes: wizForm.notes || '',
      referral: wizForm.referral || 'N/A',
      access: wizForm.access,
      estimate: price.final,
      status: 'new',
      submittedAt: new Date().toLocaleString(),
      createdAt: serverTimestamp(),
      isManual: true,
    });
    await addDoc(collection(db, 'chats', ref.id, 'messages'), {
      text:`Hi ${wizForm.firstName}! 👋 I've prepared a quote for your cleaning service. Your estimate is $${price.final}. Please reach out with any questions!`,
      sender:'admin', senderName:'Yoselin', createdAt: serverTimestamp(),
    });
    setWizBusy(false); setWizDone(true);
  };

  const closeWizard = () => {
    setShowWizard(false); setWizDone(false); setWizStep(0);
    setWizBaths(initBaths()); setWizRooms(initRooms()); setWizExtras({});
    setWizWindows(false); setWizWinCount(1); setWizFreq('once');
    setWizWalk(false); setWizFirst('no'); setWizSenior('no');
    setWizForm({ firstName:'', lastName:'', phone:'', email:'', address:'', date:'', time:'', pets:'no', otherReqs:'', notes:'', referral:'', access:"I'll be home", buildingType:'' });
  };

  // ── Derived ──────────────────────────────────────────
  if (loading) return <div className="spinner-page"><div className="spinner"></div></div>;

  if (authError) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0d0d0d',padding:'20px'}}>
      <div style={{background:'#181818',border:'1.5px solid #2a2a2a',borderRadius:'24px',padding:'48px 38px',maxWidth:'440px',textAlign:'center'}}>
        <div style={{fontSize:'2.5rem',marginBottom:'12px'}}>🛡️</div>
        <h2 style={{color:'white',fontFamily:'Playfair Display,serif',fontSize:'1.5rem',marginBottom:'8px'}}>Connection Blocked</h2>
        <p style={{color:'#9ca3af',fontSize:'.9rem',lineHeight:1.6,marginBottom:'20px'}}>An ad blocker may be blocking this page. Please disable it and refresh.</p>
        <button onClick={() => window.location.reload()} style={{padding:'12px 28px',background:'linear-gradient(135deg,#1a6fd4,#db2777)',color:'white',border:'none',borderRadius:'12px',fontSize:'.95rem',fontWeight:700,cursor:'pointer'}}>Refresh Page</button>
      </div>
    </div>
  );

  const newReqs       = requests.filter(r => r.status === 'new');
  const confirmedReqs = requests.filter(r => r.status === 'confirmed');
  const doneReqs      = requests.filter(r => r.status === 'done');
  const pipeline      = requests.filter(r => r.status !== 'done').reduce((s,r) => s+(r.estimate||0), 0);
  const displayReqs   = adminTab==='new' ? newReqs : adminTab==='confirmed' ? confirmedReqs : adminTab==='done' ? doneReqs : [];

  const wizPrice = calcWizPrice();
  const wizDateTimes = availability.find(a => a.date === wizForm.date);

  return (
    <div className="ad-root">

      {/* NAV */}
      <nav className="ad-nav">
        <div className="ad-nav-left">
          <div className="ad-nav-brand">✨ Yoselins Cleaning</div>
          <span className="ad-badge">ADMIN</span>
        </div>
        <div className="nav-user">
          {user?.photoURL && <img src={user.photoURL} className="nav-avatar" alt="" />}
          <button className="signout-btn" onClick={() => { signOut(auth); router.push('/'); }}>Sign Out</button>
        </div>
      </nav>

      {/* STATS */}
      <div className="ad-stats">
        <div className="ad-stat"><div className="ad-stat-val ad-stat-yellow">{newReqs.length}</div><div className="ad-stat-label">New Quotes</div></div>
        <div className="ad-stat"><div className="ad-stat-val ad-stat-blue">{confirmedReqs.length}</div><div className="ad-stat-label">Confirmed</div></div>
        <div className="ad-stat"><div className="ad-stat-val ad-stat-green">{doneReqs.length}</div><div className="ad-stat-label">Completed</div></div>
        <div className="ad-stat" style={{borderRight:'none'}}><div className="ad-stat-val ad-stat-pink">${pipeline}</div><div className="ad-stat-label">Pipeline</div></div>
        <button className="ad-new-quote-btn" onClick={() => setShowWizard(true)}>+ Create Quote</button>
      </div>

      {/* TABS */}
      <div className="ad-tabs-row">
        <div className="ad-tabs">
          {[
            { id:'new',          label:'New Quotes',  badge: newReqs.length },
            { id:'confirmed',    label:'Confirmed',   badge: confirmedReqs.length },
            { id:'done',         label:'Completed',   badge: 0 },
            { id:'availability', label:'📅 Availability', badge: 0 },
          ].map(t => (
            <button key={t.id} className={`ad-tab ${adminTab===t.id?'active':''}`} onClick={() => setAdminTab(t.id)}>
              {t.label} {t.badge > 0 && <span className="ad-tab-badge">{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* BODY */}
      <div className="ad-body">

        {/* ── QUOTE TABS ── */}
        {adminTab !== 'availability' && (
          displayReqs.length === 0 ? (
            <div className="ad-empty">
              <div className="ad-empty-icon">{adminTab==='new'?'📭':adminTab==='confirmed'?'📅':'🏁'}</div>
              <p>No {adminTab==='new'?'new quotes':adminTab==='confirmed'?'confirmed bookings':'completed jobs'} yet.</p>
            </div>
          ) : (
            <div className="ad-cards">
              {displayReqs.map(r => (
                <div className="ad-req-card" key={r.id}>
                  <div className="arc-top">
                    <div><div className="arc-name">{r.name}</div><div className="arc-email">{r.email}</div></div>
                    <div className="arc-price">${r.estimate}</div>
                  </div>
                  <div className="arc-meta">
                    <span>📅 {r.date || 'No date'}</span>
                    <span>📍 {r.address?.split(',')[0] || '—'}</span>
                    <span>🔁 {r.frequency}</span>
                    {r.buildingType && r.buildingType !== 'Not specified' && <span>🏠 {r.buildingType}</span>}
                  </div>
                  <div className="arc-actions">
                    <button className="arc-btn arc-view" onClick={() => setSelected(r)}>View Details</button>
                    <button className="arc-btn arc-chat" onClick={() => setChatReq(r)}>💬 Message</button>
                    {r.status==='new'       && <button className="arc-btn arc-confirm" onClick={() => confirmReq(r)}>✅ Confirm</button>}
                    {r.status==='confirmed' && <button className="arc-btn arc-done"    onClick={() => markDone(r)}>🏁 Mark Done</button>}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── AVAILABILITY TAB ── */}
        {adminTab === 'availability' && (
          <div style={{maxWidth:'680px'}}>
            <div className="cd-section-header" style={{marginBottom:'20px'}}>
              <h3 style={{color:'white',fontFamily:"'Playfair Display',serif",fontSize:'1.2rem'}}>Manage Available Dates</h3>
              <p style={{color:'#6b7280',fontSize:'.84rem',marginTop:'4px'}}>Clients will see these date & time options when booking.</p>
            </div>

            {/* Add new slot */}
            <div className="wcard" style={{marginBottom:'20px'}}>
              <div className="card-header"><div className="card-icon">➕</div><div><div className="card-title">Add Available Date</div></div></div>
              <div className="card-body">
                <div className="fg">
                  <label>Date Label (what clients see)</label>
                  <input type="text" value={newDate} onChange={e => setNewDate(e.target.value)} placeholder="e.g. Monday, March 10" />
                </div>
                <div className="fg">
                  <label>Available Time Slots</label>
                  <div style={{display:'flex',flexWrap:'wrap',gap:'8px',marginTop:'6px'}}>
                    {ALL_TIMES.map(t => (
                      <label key={t} style={{display:'flex',alignItems:'center',gap:'7px',padding:'8px 14px',border:`1.5px solid ${newTimes.includes(t)?'var(--pink-deep)':'#2a2a2a'}`,borderRadius:'10px',cursor:'pointer',background:newTimes.includes(t)?'rgba(219,39,119,.1)':'#1f1f1f',fontSize:'.82rem',fontWeight:600,color:newTimes.includes(t)?'var(--pink)':'#d1d5db',transition:'all .15s'}}>
                        <input type="checkbox" checked={newTimes.includes(t)} onChange={e => setNewTimes(prev => e.target.checked ? [...prev,t] : prev.filter(x=>x!==t))} style={{accentColor:'var(--pink-deep)',width:'15px',height:'15px'}} />
                        {t}
                      </label>
                    ))}
                  </div>
                </div>
                <button className="cd-btn-primary" onClick={addAvailability} disabled={avBusy}>
                  {avBusy ? 'Adding...' : '+ Add Date Slot'}
                </button>
              </div>
            </div>

            {/* Existing slots */}
            {availability.length === 0 ? (
              <div className="ad-empty">
                <div className="ad-empty-icon">📅</div>
                <p>No available dates added yet. Add one above!</p>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                {availability.map(slot => (
                  <div key={slot.id} style={{background:'#181818',border:'1.5px solid #2a2a2a',borderRadius:'14px',padding:'14px 18px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px',flexWrap:'wrap'}}>
                    <div>
                      <div style={{color:'white',fontWeight:700,fontSize:'.92rem',marginBottom:'5px'}}>📅 {slot.date}</div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
                        {slot.times?.map(t => (
                          <span key={t} style={{background:'rgba(26,111,212,.15)',color:'var(--blue-light)',fontSize:'.72rem',fontWeight:700,padding:'3px 10px',borderRadius:'99px'}}>{t}</span>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => deleteAvailability(slot.id)} style={{background:'rgba(239,68,68,.15)',color:'#f87171',border:'1px solid rgba(239,68,68,.3)',borderRadius:'8px',padding:'6px 14px',fontSize:'.78rem',fontWeight:700,cursor:'pointer',flexShrink:0}}>
                      🗑 Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* DETAIL MODAL */}
      {selected && (
        <div className="overlay show" onClick={e => e.target===e.currentTarget && setSelected(null)}>
          <div className="modal">
            <div className="modal-head">
              <h3>Quote Details</h3>
              <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className="price-box">
              <div className="price-label">ESTIMATED TOTAL</div>
              <div className="price-val">${selected.estimate}</div>
            </div>
            {[
              ['Submitted', selected.submittedAt], ['Client', selected.name], ['Phone', selected.phone],
              ['Email', selected.email], ['Building Type', selected.buildingType||'—'], ['Address', selected.address],
              ['Date', selected.date], ['Time', selected.time],
              ['Bathrooms', selected.bathrooms], ['Rooms', selected.rooms],
              ['Add-Ons', selected.addons], ['Pets', selected.pets==='yes'?'Yes':'No'],
              ['Other Requests', selected.otherRequests||'—'], ['Walk-Through', selected.walkthrough||'No'],
              ['Frequency', selected.frequency], ['First-Time?', selected.firstTime==='yes'?'Yes (10% disc)':'No'],
              ['Senior?', selected.senior==='yes'?'Yes (10% disc)':'No'],
              ['Home Access', selected.access||'—'], ['Referral', selected.referral||'—'], ['Notes', selected.notes||'—'],
            ].map(([k,v]) => (
              <div key={k} className="detail-row"><span className="dk">{k}</span><span className="dv">{v}</span></div>
            ))}
            <div className="modal-actions">
              {selected.status==='new'       && <button className="act-btn act-confirm" onClick={() => confirmReq(selected)}>✅ Confirm</button>}
              {selected.status==='confirmed' && <button className="act-btn act-done"    onClick={() => markDone(selected)}>🏁 Mark Done</button>}
              <button className="act-btn act-chat" onClick={() => { setChatReq(selected); setSelected(null); }}>💬 Message</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          FULL QUOTE WIZARD (same as /book)
      ════════════════════════════════════════════════ */}
      {showWizard && (
        <div style={{position:'fixed',inset:0,background:'#0d0d0d',zIndex:600,overflowY:'auto',display:'flex',flexDirection:'column'}}>
          {/* Wizard Nav */}
          <div style={{background:'#0a0a0a',padding:'14px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid #2a2a2a',position:'sticky',top:0,zIndex:10}}>
            <div style={{fontFamily:"'Playfair Display',serif",color:'white',fontSize:'1rem',fontWeight:700}}>✨ Create Quote <span style={{color:'var(--pink)',fontSize:'.78rem',fontWeight:600,marginLeft:'6px'}}>Admin</span></div>
            <button onClick={closeWizard} style={{background:'rgba(255,255,255,.07)',border:'1px solid #333',color:'#9ca3af',padding:'7px 14px',borderRadius:'8px',fontSize:'.8rem',cursor:'pointer'}}>✕ Cancel</button>
          </div>

          {/* Step indicators */}
          <div className="progress-wrap">
            <div className="steps-row">
              {['Contact','Rooms','Add-Ons','Frequency','Review'].map((label,i) => (
                <div key={i} className={`step-dot ${i<wizStep?'done':i===wizStep?'active':''}`}>
                  <div className="dot-circle">{i<wizStep?'✓':i+1}</div>
                  <div className="dot-label">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="wizard-body">
            {wizDone ? (
              <div style={{textAlign:'center',padding:'60px 20px'}}>
                <div style={{fontSize:'3rem',marginBottom:'14px'}}>🎉</div>
                <h2 style={{fontFamily:"'Playfair Display',serif",color:'white',fontSize:'1.6rem',marginBottom:'10px'}}>Quote Created!</h2>
                <p style={{color:'#9ca3af',marginBottom:'24px'}}>Estimate: <strong style={{color:'white'}}>${wizPrice.final}</strong> — client notified via chat.</p>
                <button className="btn-next" style={{maxWidth:'260px',margin:'0 auto'}} onClick={closeWizard}>← Back to Admin</button>
              </div>
            ) : (
              <>
                {/* ── STEP 0: CONTACT ── */}
                {wizStep === 0 && (
                  <div>
                    <div className="page-title">👤 Client Information</div>
                    <div className="page-sub">Enter the client's details</div>
                    <div className="wcard"><div className="card-body">
                      <div className="row2">
                        <div className="fg"><label>First Name</label><input type="text" value={wizForm.firstName} onChange={e=>setWF('firstName',e.target.value)} placeholder="e.g. Maria" /></div>
                        <div className="fg"><label>Last Name</label><input type="text" value={wizForm.lastName} onChange={e=>setWF('lastName',e.target.value)} placeholder="e.g. Rodriguez" /></div>
                      </div>
                      <div className="row2">
                        <div className="fg"><label>Phone</label><input type="tel" value={wizForm.phone} onChange={e=>setWF('phone',e.target.value)} placeholder="(555) 000-0000" /></div>
                        <div className="fg"><label>Email</label><input type="email" value={wizForm.email} onChange={e=>setWF('email',e.target.value)} placeholder="client@email.com" /></div>
                      </div>
                      {/* Building Type */}
                      <div className="fg">
                        <label>Building Type</label>
                        <div className="building-grid">
                          {BUILDING_TYPES.map(b => (
                            <div key={b.val} className={`building-tile ${wizForm.buildingType===b.val?'selected':''}`} onClick={() => setWF('buildingType',b.val)}>
                              <span className="bt-icon">{b.icon}</span>
                              <span className="bt-label">{b.val}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="fg"><label>Service Address</label><input type="text" value={wizForm.address} onChange={e=>setWF('address',e.target.value)} placeholder="Street address, City, ZIP" /></div>
                      <div className="row2">
                        <div className="fg">
                          <label>Preferred Date</label>
                          {availability.length > 0 ? (
                            <select value={wizForm.date} onChange={e => { setWF('date',e.target.value); setWF('time',''); }}>
                              <option value="">Select available date</option>
                              {availability.map(a => <option key={a.id} value={a.date}>{a.date}</option>)}
                              <option value="Flexible">Flexible / TBD</option>
                            </select>
                          ) : (
                            <input type="text" value={wizForm.date} onChange={e=>setWF('date',e.target.value)} placeholder="e.g. Monday, March 10" />
                          )}
                        </div>
                        <div className="fg">
                          <label>Preferred Time</label>
                          <select value={wizForm.time} onChange={e=>setWF('time',e.target.value)}>
                            <option value="">Select a time</option>
                            {(wizDateTimes?.times || ALL_TIMES).map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                    </div></div>
                    <div className="nav-btns">
                      <button className="btn-next" onClick={() => { if(!wizForm.firstName.trim()){alert('Enter client first name.');return;} setWizStep(1); }}>Next: Rooms →</button>
                    </div>
                  </div>
                )}

                {/* ── STEP 1: ROOMS ── */}
                {wizStep === 1 && (
                  <div>
                    <div className="page-title">🏠 Rooms</div>
                    <div className="page-sub">Select room types and quantities</div>

                    <div className="wcard">
                      <div className="card-header"><div className="card-icon">🛏️</div><div><div className="card-title">Bedrooms & Living</div></div></div>
                      <div className="card-body"><div className="bath-box">
                        {[['bed_small','🛏️ Small Bedroom','Guest or compact'],['bed_medium','🛏️ Medium Bedroom','Standard with closet'],['bed_large','🌟 Large/Master Bedroom','Spacious with en-suite'],['liv_medium','🛋️ Medium Living Room','Standard family room'],['liv_large','🛋️ Large Living Room','Open-concept'],['office','💼 Office/Study','Home office']].map(([k,n,d]) => (
                          <div className="bath-row" key={k}>
                            <div style={{flex:1}}><div className="bname">{n}</div><div className="bdesc">{d}</div></div>
                            <QCtrl val={wizRooms[k]} onInc={() => setWizRooms(r=>({...r,[k]:r[k]+1}))} onDec={() => setWizRooms(r=>({...r,[k]:Math.max(0,r[k]-1)}))} />
                          </div>
                        ))}
                      </div></div>
                    </div>

                    <div className="wcard">
                      <div className="card-header"><div className="card-icon">🛁</div><div><div className="card-title">Bathrooms</div></div></div>
                      <div className="card-body"><div className="bath-box">
                        {[['half','🚽 Half Bathroom','Toilet + sink'],['small','🚿 Small Full Bath','Shower or tub'],['medium','🛁 Medium Full Bath','Standard with tub'],['large','🌟 Large/Master Bath','Large shower, spacious']].map(([k,n,d]) => (
                          <div className="bath-row" key={k}>
                            <div style={{flex:1}}><div className="bname">{n}</div><div className="bdesc">{d}</div></div>
                            <QCtrl val={wizBaths[k]} onInc={() => setWizBaths(b=>({...b,[k]:b[k]+1}))} onDec={() => setWizBaths(b=>({...b,[k]:Math.max(0,b[k]-1)}))} />
                          </div>
                        ))}
                      </div></div>
                    </div>

                    <div className="wcard">
                      <div className="card-header"><div className="card-icon">🍳</div><div><div className="card-title">Kitchen & Utility</div></div></div>
                      <div className="card-body"><div className="bath-box">
                        {[['kit_small','🍳 Small Kitchen','Compact kitchenette'],['kit_medium','🍳 Medium Kitchen','Standard with dining'],['kit_large','🍳 Large Kitchen',"Open-concept or chef's"],['laundry','🧺 Laundry Room','Washer/dryer area'],['basement','🏚️ Basement','Finished or unfinished']].map(([k,n,d]) => (
                          <div className="bath-row" key={k}>
                            <div style={{flex:1}}><div className="bname">{n}</div><div className="bdesc">{d}</div></div>
                            <QCtrl val={wizRooms[k]} onInc={() => setWizRooms(r=>({...r,[k]:r[k]+1}))} onDec={() => setWizRooms(r=>({...r,[k]:Math.max(0,r[k]-1)}))} />
                          </div>
                        ))}
                      </div></div>
                    </div>

                    <div className="nav-btns">
                      <button className="btn-back" onClick={() => setWizStep(0)}>← Back</button>
                      <button className="btn-next" onClick={() => setWizStep(2)}>Next: Add-Ons →</button>
                    </div>
                  </div>
                )}

                {/* ── STEP 2: ADD-ONS ── */}
                {wizStep === 2 && (
                  <div>
                    <div className="page-title">✨ Add-On Services</div>
                    <div className="page-sub">All optional extras</div>
                    <div className="wcard"><div className="card-body">
                      <div className="extras-grid">
                        {EXTRAS.map(e => (
                          <div key={e.id} className={`eitem ${wizExtras[e.id]?'selected':''}`} onClick={() => setWizExtras(x=>({...x,[e.id]:!x[e.id]}))}>
                            <input type="checkbox" readOnly checked={!!wizExtras[e.id]} style={{width:'17px',height:'17px',accentColor:'var(--pink-deep)',flexShrink:0,marginTop:'2px'}} />
                            <div className="ename">{e.name}</div>
                          </div>
                        ))}
                        <div className={`eitem ${wizWindows?'selected':''}`} onClick={() => { if (!wizWindows) setWizWinModal(true); else setWizWinModal(true); }}>
                          <input type="checkbox" readOnly checked={wizWindows} style={{width:'17px',height:'17px',accentColor:'var(--pink-deep)',flexShrink:0,marginTop:'2px'}} />
                          <div><div className="ename">🪟 Window Trim</div>{wizWindows&&<div style={{fontSize:'.72rem',color:'var(--blue)',fontWeight:'700',marginTop:'3px'}}>✓ {wizWinCount} window{wizWinCount>1?'s':''}</div>}</div>
                        </div>
                      </div>
                      <div className="divider"></div>
                      <div className="fg"><label>🐾 Any Pets?</label>
                        <select value={wizForm.pets} onChange={e=>setWF('pets',e.target.value)}>
                          <option value="no">No</option><option value="yes">Yes</option>
                        </select>
                      </div>
                      <div className="fg"><label>Other Requests <span className="opt">(optional)</span></label>
                        <input type="text" value={wizForm.otherReqs} onChange={e=>setWF('otherReqs',e.target.value)} placeholder="e.g. Deep clean behind appliances..." />
                      </div>
                    </div></div>
                    <div className="nav-btns">
                      <button className="btn-back" onClick={() => setWizStep(1)}>← Back</button>
                      <button className="btn-next" onClick={() => setWizStep(3)}>Next: Frequency →</button>
                    </div>
                  </div>
                )}

                {/* ── STEP 3: FREQUENCY ── */}
                {wizStep === 3 && (
                  <div>
                    <div className="page-title">📅 Frequency & Discounts</div>
                    <div className="page-sub">More frequent = more savings!</div>
                    <div className="wcard"><div className="card-body">
                      <label style={{display:'block',fontWeight:'700',fontSize:'.82rem',color:'#d1d5db',marginBottom:'12px'}}>Cleaning Frequency</label>
                      <div className="fpills" style={{marginBottom:'18px'}}>
                        {FREQS.map(fq => (
                          <div key={fq.val} className={`fpill ${wizFreq===fq.val?'active':''}`} onClick={() => setWizFreq(fq.val)}>
                            {fq.label}<span className="ftag">{fq.tag}</span>
                          </div>
                        ))}
                      </div>
                      <div className="divider"></div>
                      <div className="row2">
                        <div className="fg"><label>First time with us?</label>
                          <select value={wizFirst} onChange={e=>setWizFirst(e.target.value)}>
                            <option value="no">No, returning client</option>
                            <option value="yes">Yes — 10% off</option>
                          </select>
                        </div>
                        <div className="fg"><label>Senior discount?</label>
                          <select value={wizSenior} onChange={e=>setWizSenior(e.target.value)}>
                            <option value="no">No</option>
                            <option value="yes">Yes — 10% senior discount</option>
                          </select>
                        </div>
                      </div>
                    </div></div>
                    <div className={`wt-toggle ${wizWalk?'active':''}`} onClick={() => setWizWalk(w=>!w)}>
                      <div style={{fontSize:'1.3rem'}}>🏠</div>
                      <div className="wt-info"><div className="wt-title">Request a Walk-Through</div><div className="wt-desc">Visit before cleaning to give exact quote</div></div>
                      <div className="wt-check">{wizWalk?'✓':''}</div>
                    </div>
                    <div className="nav-btns" style={{marginTop:'18px'}}>
                      <button className="btn-back" onClick={() => setWizStep(2)}>← Back</button>
                      <button className="btn-next" onClick={() => setWizStep(4)}>Next: Review →</button>
                    </div>
                  </div>
                )}

                {/* ── STEP 4: REVIEW ── */}
                {wizStep === 4 && (
                  <div>
                    <div className="page-title">📋 Review & Create</div>
                    <div className="page-sub">Add notes and finalize the quote</div>
                    <div className="wcard">
                      <div className="card-header"><div className="card-icon">📝</div><div><div className="card-title">Notes</div></div></div>
                      <div className="card-body">
                        <div className="fg"><label>Notes <span className="opt">(optional)</span></label>
                          <textarea value={wizForm.notes} onChange={e=>setWF('notes',e.target.value)} placeholder="Special instructions..." />
                        </div>
                        <div className="row2">
                          <div className="fg"><label>Referral Source</label>
                            <select value={wizForm.referral} onChange={e=>setWF('referral',e.target.value)}>
                              <option value="">Select one</option>
                              <option>Google / Search Engine</option><option>Instagram / Facebook</option>
                              <option>Friend or Family</option><option>Nextdoor</option>
                              <option>Flyer / Advertisement</option><option>Other</option>
                            </select>
                          </div>
                          <div className="fg"><label>Home Access</label>
                            <select value={wizForm.access} onChange={e=>setWF('access',e.target.value)}>
                              <option>I'll be home</option><option>Lockbox / Key left out</option>
                              <option>Garage code</option><option>Other arrangement</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pbar">
                      <div className="pbar-top">
                        <div>
                          <div className="plabel">ESTIMATE</div>
                          <div className="pamount">${wizPrice.final}</div>
                          <div className="prange">{wizPrice.final>0?`Range: $${Math.round(wizPrice.final*.95)} – $${Math.round(wizPrice.final*1.1)}`:'Add rooms to calculate'}</div>
                        </div>
                        <div>
                          <div className="plabel">DISCOUNTS</div>
                          <div className="disc-badges">
                            {wizPrice.discounts.length ? wizPrice.discounts.map(d=><span key={d.k} className="dbadge">{d.k}</span>) : <span style={{fontSize:'.74rem',color:'#555'}}>None</span>}
                          </div>
                        </div>
                      </div>
                      <div className="plines">
                        {wizPrice.lines.map((l,i) => <div key={i} className="pline">✓ {l}</div>)}
                      </div>
                      <div className="pnote">💡 Final price confirmed before service.</div>
                    </div>

                    <div className="nav-btns">
                      <button className="btn-back" onClick={() => setWizStep(3)}>← Back</button>
                      <button className="btn-next" onClick={submitWizard} disabled={wizBusy}>
                        {wizBusy ? 'Creating...' : `✨ Create Quote — $${wizPrice.final}`}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Window count modal */}
          <div className={`win-overlay ${wizWinModal?'show':''}`}>
            <div className="win-modal">
              <h3>🪟 Window Trim</h3>
              <p>How many windows?</p>
              <div style={{display:'flex',justifyContent:'center',gap:'14px',marginBottom:'18px'}}>
                <button className="qbtn" style={{width:'38px',height:'38px',fontSize:'1.3rem'}} onClick={() => setWizWinCount(w=>Math.max(1,w-1))}>−</button>
                <span className="qdis" style={{fontSize:'1.5rem',minWidth:'36px'}}>{wizWinCount}</span>
                <button className="qbtn" style={{width:'38px',height:'38px',fontSize:'1.3rem'}} onClick={() => setWizWinCount(w=>w+1)}>+</button>
              </div>
              <button className="win-btn" onClick={() => { setWizWindows(true); setWizWinModal(false); }}>Confirm</button><br />
              <button onClick={() => { setWizWindows(false); setWizWinCount(1); setWizWinModal(false); }} style={{marginTop:'10px',background:'none',border:'none',color:'#6b7280',fontSize:'.8rem',cursor:'pointer'}}>Remove Window Trim</button>
            </div>
          </div>
        </div>
      )}

      {/* CHAT */}
      {chatReq && (
        <Chat requestId={chatReq.id} currentUser={user} senderRole="admin" clientName={chatReq.name} onClose={() => setChatReq(null)} />
      )}
    </div>
  );
}
