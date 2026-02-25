'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, onSnapshot, orderBy, serverTimestamp } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../../lib/firebase';

const BPRICES = { half: 15, small: 50, medium: 65, large: 80 };
const RPRICES = { bed_small: 25, bed_medium: 30, bed_large: 35, liv_medium: 15, liv_large: 35, office: 10, kit_small: 45, kit_medium: 55, kit_large: 70, laundry: 10, basement: 75 };
const RNAMES  = { bed_small: 'Small Bedroom', bed_medium: 'Medium Bedroom', bed_large: 'Large/Master Bedroom', liv_medium: 'Medium Living Room', liv_large: 'Large Living Room', office: 'Office/Study', kit_small: 'Small Kitchen', kit_medium: 'Medium Kitchen', kit_large: 'Large Kitchen', laundry: 'Laundry Room', basement: 'Basement' };
const BNAMES  = { half: 'Half Bath', small: 'Small Full Bath', medium: 'Medium Full Bath', large: 'Large/Master Bath' };
const EXTRAS = [
  { id: 'cabinets',  name: '🗄️ Inside Cabinets',   price: 16 },
  { id: 'pantry',    name: '🥫 Inside Pantry',       price: 20 },
  { id: 'oven',      name: '🔥 Inside Oven',          price: 16 },
  { id: 'fridge',    name: '❄️ Inside Fridge',        price: 16 },
  { id: 'baseboard', name: '🧹 Baseboard Cleaning',  price:  5 },
];
const FREQS = [
  { val: 'once',     label: 'One-Time',      tag: 'No discount',   pct: 0     },
  { val: 'biweekly', label: 'Bi-Weekly',     tag: 'Save 15%',      pct: 0.15  },
  { val: 'weekly',   label: 'Weekly',        tag: 'Save 15-20%',   pct: 0.175 },
  { val: 'monthly',  label: '2-3x / Month',  tag: 'Save 10-15%',   pct: 0.125 },
];
const BUILDING_TYPES = [
  { val: 'House',        icon: '🏠' },
  { val: 'Apartment',    icon: '🏢' },
  { val: 'Condo',        icon: '🏙️' },
  { val: 'Party / Event',icon: '🎉' },
  { val: 'Office',       icon: '💼' },
  { val: 'Bank',         icon: '🏦' },
  { val: 'Retail Store', icon: '🛍️' },
];
const FALLBACK_TIMES = ['Morning (8am–12pm)', 'Afternoon (12pm–4pm)', 'Evening (4pm–7pm)', 'Flexible'];

const initBaths = () => ({ half: 0, small: 0, medium: 0, large: 0 });
const initRooms = () => ({ bed_small: 0, bed_medium: 0, bed_large: 0, liv_medium: 0, liv_large: 0, office: 0, kit_small: 0, kit_medium: 0, kit_large: 0, laundry: 0, basement: 0 });

export default function BookPage() {
  const router = useRouter();
  const [user,        setUser]       = useState(null);
  const [step,        setStep]       = useState(0);
  const [baths,       setBaths]      = useState(initBaths());
  const [rooms,       setRooms]      = useState(initRooms());
  const [extras,      setExtras]     = useState({});
  const [windows,     setWindows]    = useState(false);
  const [windowCount, setWindowCount]= useState(1);
  const [winModal,    setWinModal]   = useState(false);
  const [freq,        setFreq]       = useState('once');
  const [walkthrough, setWalkthrough]= useState(false);
  const [firstTime,   setFirstTime]  = useState('no');
  const [senior,      setSenior]     = useState('no');
  const [form,        setForm]       = useState({
    firstName: '', lastName: '', phone: '', email: '',
    address: '', date: '', time: '', pets: 'no',
    otherReqs: '', notes: '', referral: '',
    access: "I'll be home", buildingType: '',
  });
  const [submitted,   setSubmitted]  = useState(false);
  const [submitting,  setSubmitting] = useState(false);

  // ── Availability slots from admin ─────────────────────
  const [availability, setAvailability] = useState([]); // [{ id, date, times[] }]

  useEffect(() => {
    // Listen for admin-set availability
    const unsub = onSnapshot(
      query(collection(db, 'availability'), orderBy('createdAt', 'asc')),
      snap => setAvailability(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push('/'); return; }
      if (u.email === ADMIN_EMAIL) { router.push('/admin'); return; }
      setUser(u);
      setForm(f => ({
        ...f,
        email: u.email || '',
        firstName: u.displayName?.split(' ')[0] || '',
        lastName: u.displayName?.split(' ').slice(1).join(' ') || '',
      }));
      const q = query(collection(db, 'requests'), where('userId', '==', u.uid));
      const snap = await getDocs(q);
      if (!snap.empty) router.push('/dashboard');
    });
    return () => unsub();
  }, [router]);

  // Times available for the selected date
  const selectedSlot = availability.find(a => a.date === form.date);
  const availableTimes = selectedSlot?.times?.length ? selectedSlot.times : FALLBACK_TIMES;

  const calcPrice = () => {
    let base = 0; const lines = [];
    Object.keys(baths).forEach(t => { if (baths[t] > 0) { base += baths[t] * BPRICES[t]; lines.push(BNAMES[t] + ' ×' + baths[t]); }});
    Object.keys(rooms).forEach(r => { if (rooms[r] > 0) { base += rooms[r] * RPRICES[r]; lines.push(RNAMES[r] + ' ×' + rooms[r]); }});
    let extTotal = 0; const extraNames = [];
    EXTRAS.forEach(e => { if (extras[e.id]) { extTotal += e.price; extraNames.push(e.name.replace(/[^\w\s]/g,'').trim()); lines.push(e.name); }});
    if (windows) { extTotal += windowCount * 5; extraNames.push('Window Trim ×' + windowCount); lines.push('Window Trim ×' + windowCount); }
    const sub = base + extTotal;
    const discounts = [];
    const fq = FREQS.find(f => f.val === freq);
    if (fq?.pct > 0) discounts.push({ k: fq.label + ' discount', pct: fq.pct });
    if (firstTime === 'yes') discounts.push({ k: 'First-Time 10%', pct: 0.10 });
    if (senior   === 'yes') discounts.push({ k: 'Senior 10%',      pct: 0.10 });
    const discAmt = discounts.reduce((s, d) => s + sub * d.pct, 0);
    return { final: Math.max(0, Math.round(sub - discAmt)), sub, discounts, lines, extraNames };
  };

  const price = calcPrice();

  const goTo = (s) => {
    if (s === 1 && !form.firstName.trim()) { alert('Please enter your first name.'); return; }
    setStep(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    if (!form.firstName.trim()) { alert('Please enter your name.'); return; }
    setSubmitting(true);
    const bathDesc = Object.keys(baths).filter(k => baths[k] > 0).map(k => baths[k] + ' ' + BNAMES[k]).join(', ') || 'None';
    const roomDesc = Object.keys(rooms).filter(k => rooms[k] > 0).map(k => rooms[k] + ' ' + RNAMES[k]).join(', ') || 'None';
    const req = {
      userId: user.uid,
      userEmail: user.email,
      name: (form.firstName + ' ' + form.lastName).trim(),
      phone: form.phone || 'N/A',
      email: form.email || user.email,
      address: form.address || 'N/A',
      date: form.date || 'N/A',
      time: form.time || 'N/A',
      buildingType: form.buildingType || 'Not specified',
      bathrooms: bathDesc,
      rooms: roomDesc,
      addons: price.extraNames.join(', ') || 'None',
      pets: form.pets,
      otherRequests: form.otherReqs || 'None',
      walkthrough: walkthrough ? 'Yes' : 'No',
      frequency: freq,
      firstTime, senior,
      notes: form.notes || '',
      referral: form.referral || 'N/A',
      access: form.access,
      estimate: price.final,
      status: 'new',
      submittedAt: new Date().toLocaleString(),
      createdAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, 'requests'), req);
    await addDoc(collection(db, 'chats', docRef.id, 'messages'), {
      text: `Hi ${form.firstName}! 👋 Thank you for reaching out to Yoselin's Cleaning Service. I've received your request and will get back to you within 24 hours to confirm your appointment!`,
      sender: 'admin', senderName: 'Yoselin', createdAt: serverTimestamp(),
    });
    setSubmitting(false);
    setSubmitted(true);
  };

  const f    = form;
  const setF = (k, v) => setForm(x => ({ ...x, [k]: v }));
  const stepLabels = ['Contact', 'Rooms', 'Add-Ons', 'Frequency', 'Review'];
  const hasAvailability = availability.length > 0;

  const QCtrl = ({ val, onInc, onDec }) => (
    <div className="qctrl">
      <button className="qbtn" onClick={onDec}>−</button>
      <span className="qdis">{val}</span>
      <button className="qbtn" onClick={onInc}>+</button>
    </div>
  );

  return (
    <div>
      <div className="sparkle-bar"></div>

      {/* Header */}
      <div className="guest-header">
        <div style={{ position:'absolute', top:'15px', right:'16px', display:'flex', gap:'8px', alignItems:'center' }}>
          {user?.photoURL && <img src={user.photoURL} className="nav-avatar" alt="" />}
          <button className="signout-btn" onClick={() => { signOut(auth); router.push('/'); }}>Sign Out</button>
        </div>
        <div style={{ fontSize:'2rem', marginBottom:'7px' }}>✨</div>
        <h1>Yoselin's<br /><span>Cleaning Service</span></h1>
        <p>Professional • Reliable • Sparkling Clean</p>
        <div className="header-badges">
          <span className="hbadge pink">✦ Licensed & Insured</span>
          <span className="hbadge blue">⭐ 5-Star Rated</span>
          <span className="hbadge">Free Estimates</span>
        </div>
      </div>

      {/* Step progress */}
      <div className="progress-wrap">
        <div className="steps-row">
          {stepLabels.map((label, i) => (
            <div key={i} className={`step-dot ${i < step ? 'done' : i === step ? 'active' : ''}`}>
              <div className="dot-circle">{i < step ? '✓' : i + 1}</div>
              <div className="dot-label">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="wizard-body">

        {/* ── STEP 0: CONTACT ── */}
        {step === 0 && (
          <div>
            <div className="page-title">👤 Your Information</div>
            <div className="page-sub">Tell us who you are and how to reach you</div>

            <div className="wcard"><div className="card-body">
              <div className="row2">
                <div className="fg"><label>First Name</label><input type="text" value={f.firstName} onChange={e => setF('firstName', e.target.value)} placeholder="e.g. Maria" /></div>
                <div className="fg"><label>Last Name</label><input type="text" value={f.lastName} onChange={e => setF('lastName', e.target.value)} placeholder="e.g. Rodriguez" /></div>
              </div>
              <div className="row2">
                <div className="fg"><label>Phone Number</label><input type="tel" value={f.phone} onChange={e => setF('phone', e.target.value)} placeholder="(555) 000-0000" /></div>
                <div className="fg"><label>Email</label><input type="email" value={f.email} onChange={e => setF('email', e.target.value)} placeholder="your@email.com" /></div>
              </div>

              {/* Building Type */}
              <div className="fg">
                <label>Building Type</label>
                <div className="building-grid">
                  {BUILDING_TYPES.map(b => (
                    <div
                      key={b.val}
                      className={`building-tile ${f.buildingType === b.val ? 'selected' : ''}`}
                      onClick={() => setF('buildingType', b.val)}
                    >
                      <span className="bt-icon">{b.icon}</span>
                      <span className="bt-label">{b.val}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="fg"><label>Service Address</label>
                <input type="text" value={f.address} onChange={e => setF('address', e.target.value)} placeholder="Street address, City, ZIP" />
              </div>

              <div className="row2">
                {/* Date — dropdown if admin has set slots, text input as fallback */}
                <div className="fg">
                  <label>
                    Preferred Date
                    {hasAvailability && <span className="opt"> — select from available</span>}
                  </label>
                  {hasAvailability ? (
                    <select
                      value={f.date}
                      onChange={e => { setF('date', e.target.value); setF('time', ''); }}
                    >
                      <option value="">Select a date</option>
                      {availability.map(a => (
                        <option key={a.id} value={a.date}>{a.date}</option>
                      ))}
                      <option value="Flexible">Flexible / Contact me</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={f.date}
                      onChange={e => setF('date', e.target.value)}
                      placeholder="e.g. Monday, March 10"
                    />
                  )}
                </div>

                {/* Time — filtered by selected date */}
                <div className="fg">
                  <label>Preferred Time</label>
                  <select value={f.time} onChange={e => setF('time', e.target.value)}>
                    <option value="">Select a time</option>
                    {availableTimes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div></div>

            <div className="nav-btns">
              <button className="btn-next" onClick={() => goTo(1)}>Next: Rooms →</button>
            </div>
          </div>
        )}

        {/* ── STEP 1: ROOMS ── */}
        {step === 1 && (
          <div>
            <div className="page-title">🏠 Rooms</div>
            <div className="page-sub">Select room types and quantities</div>

            <div className="wcard">
              <div className="card-header"><div className="card-icon">🛏️</div><div><div className="card-title">Bedrooms & Living</div></div></div>
              <div className="card-body"><div className="bath-box">
                {[
                  ['bed_small', '🛏️ Small Bedroom',      'Guest room or compact space'],
                  ['bed_medium','🛏️ Medium Bedroom',     'Standard bedroom with closet'],
                  ['bed_large', '🌟 Large/Master Bedroom','Spacious with en-suite'],
                  ['liv_medium','🛋️ Medium Living Room', 'Standard family room'],
                  ['liv_large', '🛋️ Large Living Room',  'Open-concept space'],
                  ['office',    '💼 Office/Study',        'Home office or reading room'],
                ].map(([k, n, d]) => (
                  <div className="bath-row" key={k}>
                    <div style={{flex:1}}><div className="bname">{n}</div><div className="bdesc">{d}</div></div>
                    <QCtrl val={rooms[k]} onInc={() => setRooms(r => ({...r,[k]:r[k]+1}))} onDec={() => setRooms(r => ({...r,[k]:Math.max(0,r[k]-1)}))} />
                  </div>
                ))}
              </div></div>
            </div>

            <div className="wcard">
              <div className="card-header"><div className="card-icon">🛁</div><div><div className="card-title">Bathrooms</div></div></div>
              <div className="card-body"><div className="bath-box">
                {[
                  ['half',  '🚽 Half Bathroom',       'Toilet + sink only'],
                  ['small', '🚿 Small Full Bathroom',  'Shower or tub'],
                  ['medium','🛁 Medium Full Bathroom', 'Standard with tub + shower'],
                  ['large', '🌟 Large/Master Bathroom','Large shower, spacious'],
                ].map(([k, n, d]) => (
                  <div className="bath-row" key={k}>
                    <div style={{flex:1}}><div className="bname">{n}</div><div className="bdesc">{d}</div></div>
                    <QCtrl val={baths[k]} onInc={() => setBaths(b => ({...b,[k]:b[k]+1}))} onDec={() => setBaths(b => ({...b,[k]:Math.max(0,b[k]-1)}))} />
                  </div>
                ))}
              </div></div>
            </div>

            <div className="wcard">
              <div className="card-header"><div className="card-icon">🍳</div><div><div className="card-title">Kitchen & Utility</div></div></div>
              <div className="card-body"><div className="bath-box">
                {[
                  ['kit_small', '🍳 Small Kitchen',  'Compact kitchenette'],
                  ['kit_medium','🍳 Medium Kitchen', 'Standard with dining'],
                  ['kit_large', '🍳 Large Kitchen',  "Open-concept or chef's kitchen"],
                  ['laundry',   '🧺 Laundry Room',   'Washer/dryer area'],
                  ['basement',  '🏚️ Basement',       'Finished or unfinished'],
                ].map(([k, n, d]) => (
                  <div className="bath-row" key={k}>
                    <div style={{flex:1}}><div className="bname">{n}</div><div className="bdesc">{d}</div></div>
                    <QCtrl val={rooms[k]} onInc={() => setRooms(r => ({...r,[k]:r[k]+1}))} onDec={() => setRooms(r => ({...r,[k]:Math.max(0,r[k]-1)}))} />
                  </div>
                ))}
              </div></div>
            </div>

            <div className="nav-btns">
              <button className="btn-back" onClick={() => goTo(0)}>← Back</button>
              <button className="btn-next" onClick={() => goTo(2)}>Next: Add-Ons →</button>
            </div>
          </div>
        )}

        {/* ── STEP 2: ADD-ONS ── */}
        {step === 2 && (
          <div>
            <div className="page-title">✨ Add-On Services</div>
            <div className="page-sub">Select any extras you'd like (all optional)</div>
            <div className="wcard"><div className="card-body">
              <div className="extras-grid">
                {EXTRAS.map(e => (
                  <div key={e.id} className={`eitem ${extras[e.id] ? 'selected' : ''}`} onClick={() => setExtras(x => ({...x,[e.id]:!x[e.id]}))}>
                    <input type="checkbox" readOnly checked={!!extras[e.id]} style={{width:'17px',height:'17px',accentColor:'var(--pink-deep)',flexShrink:0,marginTop:'2px'}} />
                    <div className="ename">{e.name}</div>
                  </div>
                ))}
                <div className={`eitem ${windows ? 'selected' : ''}`} onClick={() => setWinModal(true)}>
                  <input type="checkbox" readOnly checked={windows} style={{width:'17px',height:'17px',accentColor:'var(--pink-deep)',flexShrink:0,marginTop:'2px'}} />
                  <div>
                    <div className="ename">🪟 Window Trim</div>
                    {windows && <div style={{fontSize:'.72rem',color:'var(--blue)',fontWeight:'700',marginTop:'3px'}}>✓ {windowCount} window{windowCount>1?'s':''}</div>}
                  </div>
                </div>
              </div>
              <div className="divider"></div>
              <div className="fg"><label>🐾 Any Pets?</label>
                <select value={f.pets} onChange={e => setF('pets', e.target.value)}>
                  <option value="no">No</option><option value="yes">Yes</option>
                </select>
              </div>
              <div className="fg"><label>Other Requests <span className="opt">(optional)</span></label>
                <input type="text" value={f.otherReqs} onChange={e => setF('otherReqs', e.target.value)} placeholder="e.g. Deep clean behind appliances..." />
              </div>
            </div></div>
            <div className="nav-btns">
              <button className="btn-back" onClick={() => goTo(1)}>← Back</button>
              <button className="btn-next" onClick={() => goTo(3)}>Next: Frequency →</button>
            </div>
          </div>
        )}

        {/* ── STEP 3: FREQUENCY ── */}
        {step === 3 && (
          <div>
            <div className="page-title">📅 Frequency & Discounts</div>
            <div className="page-sub">More frequent = more savings!</div>
            <div className="wcard"><div className="card-body">
              <label style={{display:'block',fontWeight:'700',fontSize:'.82rem',color:'#d1d5db',marginBottom:'12px'}}>Cleaning Frequency</label>
              <div className="fpills" style={{marginBottom:'18px'}}>
                {FREQS.map(fq => (
                  <div key={fq.val} className={`fpill ${freq===fq.val?'active':''}`} onClick={() => setFreq(fq.val)}>
                    {fq.label}<span className="ftag">{fq.tag}</span>
                  </div>
                ))}
              </div>
              <div className="divider"></div>
              <div className="row2">
                <div className="fg"><label>First time with us?</label>
                  <select value={firstTime} onChange={e => setFirstTime(e.target.value)}>
                    <option value="no">No, returning client</option>
                    <option value="yes">Yes! First time — 10% off</option>
                  </select>
                </div>
                <div className="fg"><label>Senior discount?</label>
                  <select value={senior} onChange={e => setSenior(e.target.value)}>
                    <option value="no">No</option>
                    <option value="yes">Yes — 10% senior discount</option>
                  </select>
                </div>
              </div>
            </div></div>
            <div className={`wt-toggle ${walkthrough?'active':''}`} onClick={() => setWalkthrough(w => !w)}>
              <div style={{fontSize:'1.3rem'}}>🏠</div>
              <div className="wt-info"><div className="wt-title">Request a Walk-Through</div><div className="wt-desc">We'll visit before cleaning to give an exact quote</div></div>
              <div className="wt-check">{walkthrough ? '✓' : ''}</div>
            </div>
            <div className="nav-btns" style={{marginTop:'18px'}}>
              <button className="btn-back" onClick={() => goTo(2)}>← Back</button>
              <button className="btn-next" onClick={() => goTo(4)}>Next: Review →</button>
            </div>
          </div>
        )}

        {/* ── STEP 4: REVIEW ── */}
        {step === 4 && (
          <div>
            <div className="page-title">📋 Review & Submit</div>
            <div className="page-sub">Add notes and submit your request</div>
            <div className="wcard">
              <div className="card-header"><div className="card-icon">📝</div><div><div className="card-title">Special Requests</div></div></div>
              <div className="card-body">
                <div className="fg"><label>Notes <span className="opt">(optional)</span></label>
                  <textarea value={f.notes} onChange={e => setF('notes', e.target.value)} placeholder="e.g. Focus on kitchen, allergic to certain products..." />
                </div>
                <div className="row2">
                  <div className="fg"><label>How did you hear about us?</label>
                    <select value={f.referral} onChange={e => setF('referral', e.target.value)}>
                      <option value="">Select one</option>
                      <option>Google / Search Engine</option>
                      <option>Instagram / Facebook</option>
                      <option>Friend or Family</option>
                      <option>Nextdoor</option>
                      <option>Flyer / Advertisement</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="fg"><label>Home Access</label>
                    <select value={f.access} onChange={e => setF('access', e.target.value)}>
                      <option>I'll be home</option>
                      <option>Lockbox / Key left out</option>
                      <option>Garage code</option>
                      <option>Other arrangement</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="pbar">
              <div className="pbar-top">
                <div>
                  <div className="plabel">YOUR ESTIMATE</div>
                  <div className="pamount">${price.final}</div>
                  <div className="prange">
                    {price.final > 0
                      ? `Est. range: $${Math.round(price.final*.95)} – $${Math.round(price.final*1.1)}`
                      : 'Complete rooms to calculate'}
                  </div>
                </div>
                <div>
                  <div className="plabel">DISCOUNTS</div>
                  <div className="disc-badges">
                    {price.discounts.length
                      ? price.discounts.map(d => <span key={d.k} className="dbadge">{d.k}</span>)
                      : <span style={{fontSize:'.74rem',color:'#555'}}>None</span>}
                  </div>
                </div>
              </div>
              <div className="plines">
                {price.lines.map((l, i) => <div key={i} className="pline">✓ {l}</div>)}
              </div>
              <div className="pnote">💡 Final price confirmed after walkthrough or consultation.</div>
            </div>

            <div className="nav-btns">
              <button className="btn-back" onClick={() => goTo(3)}>← Back</button>
              <button className="btn-next" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Submitting...' : `✨ Submit Request — $${price.final}`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Window Modal */}
      <div className={`win-overlay ${winModal?'show':''}`}>
        <div className="win-modal">
          <h3>🪟 Window Trim</h3>
          <p>How many windows would you like cleaned?</p>
          <div style={{display:'flex',justifyContent:'center',gap:'14px',marginBottom:'18px'}}>
            <button className="qbtn" style={{width:'38px',height:'38px',fontSize:'1.3rem'}} onClick={() => setWindowCount(w => Math.max(1,w-1))}>−</button>
            <span className="qdis" style={{fontSize:'1.5rem',minWidth:'36px'}}>{windowCount}</span>
            <button className="qbtn" style={{width:'38px',height:'38px',fontSize:'1.3rem'}} onClick={() => setWindowCount(w => w+1)}>+</button>
          </div>
          <button className="win-btn" onClick={() => { setWindows(true); setWinModal(false); }}>Confirm</button>
          <br />
          <button onClick={() => { setWindows(false); setWindowCount(1); setWinModal(false); }} style={{marginTop:'10px',background:'none',border:'none',color:'#6b7280',fontSize:'.8rem',cursor:'pointer'}}>Remove Window Trim</button>
        </div>
      </div>

      {/* Success */}
      <div className={`sov ${submitted?'show':''}`}>
        <div className="sbox">
          <div style={{fontSize:'2.8rem'}}>🎉</div>
          <h2>Request Sent!</h2>
          <p><strong>Yoselin will contact you within 24 hours</strong> to confirm your appointment.</p>
          <br />
          <p style={{fontSize:'.82rem',background:'#1f1f1f',borderRadius:'10px',padding:'12px',color:'#9ca3af'}}>
            💡 You can track your request and message us from your <strong style={{color:'white'}}>dashboard</strong>.
          </p>
          <button className="sclose" onClick={() => router.push('/dashboard')}>Go to My Dashboard →</button>
        </div>
      </div>
    </div>
  );
}
