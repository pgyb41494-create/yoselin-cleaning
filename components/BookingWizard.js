'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, addDoc, onSnapshot, serverTimestamp, query, where, getDocs, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const BPRICES = { half: 15, small: 50, medium: 65, large: 80 };
const RPRICES = { bed_small: 25, bed_medium: 30, bed_large: 35, liv_medium: 15, liv_large: 35, office: 10, kit_small: 45, kit_medium: 55, kit_large: 70, laundry: 10, basement: 75 };
const RNAMES  = { bed_small: 'Small Bedroom', bed_medium: 'Medium Bedroom', bed_large: 'Large/Master Bedroom', liv_medium: 'Medium Living Room', liv_large: 'Large Living Room', office: 'Office/Study', kit_small: 'Small Kitchen', kit_medium: 'Medium Kitchen', kit_large: 'Large Kitchen', laundry: 'Laundry Room', basement: 'Basement' };
const BNAMES  = { half: 'Half Bath', small: 'Small Full Bath', medium: 'Medium Full Bath', large: 'Large/Master Bath' };

const EXTRAS = [
  { id: 'cabinets',  name: 'Inside Cabinets',   price: 16 },
  { id: 'pantry',    name: 'Inside Pantry',      price: 20 },
  { id: 'oven',      name: 'Inside Oven',        price: 16 },
  { id: 'fridge',    name: 'Inside Fridge',      price: 16 },
  { id: 'baseboard', name: 'Baseboard Cleaning', price: 5  },
  { id: 'windows',   name: 'Window Trim',        price: 5, hasQty: true },
];

// pct kept for discount calculation — labels intentionally omitted
const FREQS = [
  { val: 'once',     label: 'One-Time',     pct: 0     },
  { val: 'biweekly', label: 'Bi-Weekly',    pct: 0.15  },
  { val: 'weekly',   label: 'Weekly',       pct: 0.175 },
  { val: 'monthly',  label: '2-3x / Month', pct: 0.125 },
];

const BEDROOMS = [
  { key: 'bed_small',  name: 'Small Bedroom',        desc: 'Guest room or compact space'   },
  { key: 'bed_medium', name: 'Medium Bedroom',       desc: 'Standard bedroom with closet'  },
  { key: 'bed_large',  name: 'Large/Master Bedroom', desc: 'Spacious with en-suite'        },
  { key: 'liv_medium', name: 'Medium Living Room',   desc: 'Standard family room'          },
  { key: 'liv_large',  name: 'Large Living Room',    desc: 'Open-concept space'            },
  { key: 'office',     name: 'Office/Study',         desc: 'Home office or reading room'   },
];
const BATHROOMS = [
  { key: 'half',   name: 'Half Bathroom',         desc: 'Toilet + sink only'         },
  { key: 'small',  name: 'Small Full Bathroom',   desc: 'Shower or tub'              },
  { key: 'medium', name: 'Medium Full Bathroom',  desc: 'Standard with tub + shower' },
  { key: 'large',  name: 'Large/Master Bathroom', desc: 'Large shower, spacious'     },
];
const KITCHEN = [
  { key: 'kit_small',  name: 'Small Kitchen',  desc: 'Compact kitchenette'             },
  { key: 'kit_medium', name: 'Medium Kitchen', desc: 'Standard with dining'            },
  { key: 'kit_large',  name: 'Large Kitchen',  desc: "Open-concept or chef's kitchen"  },
  { key: 'laundry',    name: 'Laundry Room',   desc: 'Washer/dryer area'               },
  { key: 'basement',   name: 'Basement',       desc: 'Finished or unfinished'          },
];

const initBaths = () => ({ half: 0, small: 0, medium: 0, large: 0 });
const initRooms = () => ({ bed_small: 0, bed_medium: 0, bed_large: 0, liv_medium: 0, liv_large: 0, office: 0, kit_small: 0, kit_medium: 0, kit_large: 0, laundry: 0, basement: 0 });

export default function BookingWizard({ user, onDone, adminMode = false }) {
  const [step,         setStep]         = useState(0);
  const [baths,        setBaths]        = useState(initBaths());
  const [rooms,        setRooms]        = useState(initRooms());
  const [extras,       setExtras]       = useState({});
  const [windowQty,    setWindowQty]    = useState(1);
  const [freq,         setFreq]         = useState('once');
  const [walkthrough,  setWalkthrough]  = useState(false);
  const [firstTime,    setFirstTime]    = useState('no');
  const [senior,       setSenior]       = useState('no');
  const [submitting,   setSubmitting]   = useState(false);
  const [availability, setAvailability] = useState([]);
  const [livePrices,   setLivePrices]   = useState(null);

  const addressInputRef = useRef(null);
  const autocompleteRef = useRef(null);

  const [form, setForm] = useState({
    firstName: user?.displayName?.split(' ')[0] || '',
    lastName:  user?.displayName?.split(' ').slice(1).join(' ') || '',
    phone: '', email: user?.email || '',
    address: '', date: '', time: '',
    pets: 'no', otherReqs: '', notes: '', referral: '', access: "I'll be home",
  });

  useEffect(() => {
    getDoc(doc(db, 'settings', 'pricing')).then(snap => {
      if (snap.exists()) setLivePrices(snap.data());
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'availability'), snap => {
      const slots = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      slots.sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
      setAvailability(slots);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;
    if (window.__gmapsLoaded) { initAutocomplete(); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true; script.defer = true;
    script.onload = () => { window.__gmapsLoaded = true; initAutocomplete(); };
    document.head.appendChild(script);
  }, []);

  const initAutocomplete = useCallback(() => {
    if (!addressInputRef.current || autocompleteRef.current) return;
    if (!window.google?.maps?.places) return;
    const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
      types: ['address'], componentRestrictions: { country: 'us' },
    });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (place?.formatted_address) setF('address', place.formatted_address);
    });
    autocompleteRef.current = ac;
  }, []);

  const setF = (k, v) => setForm(x => ({ ...x, [k]: v }));

  const calcPrice = () => {
    const BP = livePrices?.bathrooms || BPRICES;
    const RP = livePrices?.rooms || RPRICES;
    const EP = livePrices?.extras || {};
    let base = 0;
    const lines = [];
    Object.keys(baths).forEach(t => {
      if (baths[t] > 0) { base += baths[t] * (BP[t] ?? BPRICES[t]); lines.push(BNAMES[t] + ' x' + baths[t]); }
    });
    Object.keys(rooms).forEach(r => {
      if (rooms[r] > 0) { base += rooms[r] * (RP[r] ?? RPRICES[r]); lines.push(RNAMES[r] + ' x' + rooms[r]); }
    });
    let extTotal = 0;
    const extraNames = [];
    EXTRAS.forEach(e => {
      if (extras[e.id]) {
        const liveP = EP[e.id] ?? e.price;
        const qty = e.hasQty ? (windowQty || 1) : 1;
        extTotal += liveP * qty;
        const label = e.hasQty ? `${e.name} x${qty}` : e.name;
        extraNames.push(label);
        lines.push(label);
      }
    });
    const sub = base + extTotal;
    const fq = FREQS.find(f => f.val === freq);
    const freqPctMap = { biweekly: (livePrices?.discounts?.biweekly ?? 15) / 100, weekly: (livePrices?.discounts?.weekly ?? 17.5) / 100, monthly: (livePrices?.discounts?.monthly ?? 12.5) / 100 };
    let discAmt = fq && fq.val !== 'once' ? sub * (freqPctMap[fq.val] || 0) : 0;
    const ftPct = (livePrices?.discounts?.firstTime ?? 10) / 100;
    const srPct = (livePrices?.discounts?.senior ?? 10) / 100;
    if (firstTime === 'yes') discAmt += sub * ftPct;
    if (senior    === 'yes') discAmt += sub * srPct;
    const hasDiscount = discAmt > 0;
    const final = Math.max(0, Math.round(sub - discAmt));
    return { final, sub: Math.round(sub), hasDiscount, lines, extraNames };
  };

  const price = calcPrice();

  const availDates   = [...new Set(availability.map(s => s.date))];
  const timesForDate = availability.filter(s => s.date === form.date).map(s => s.time);

  const goTo = (s) => {
    // Step 0 validation
    if (s >= 1) {
      if (!form.firstName.trim()) { alert('Please enter your first name.'); return; }
      if (!form.phone.trim())     { alert('Please enter your phone number.'); return; }
      if (!form.date)             { alert('Please choose a preferred date.'); return; }
    }
    // Step 1 validation
    if (s >= 2) {
      const hasRoom = Object.values(rooms).some(v => v > 0) || Object.values(baths).some(v => v > 0);
      if (!hasRoom) { alert('Please select at least one room or bathroom before continuing.'); return; }
    }
    // Remap old step numbers: old steps 2+3 are now step 2, old step 4 is now step 3
    setStep(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    if (!form.firstName.trim()) { alert('Please enter a name.'); return; }
    if (!form.phone.trim())     { alert('Please enter a phone number.'); return; }
    setSubmitting(true);
    const bathDesc = Object.keys(baths).filter(k => baths[k] > 0).map(k => baths[k] + ' ' + BNAMES[k]).join(', ') || 'None';
    const roomDesc = Object.keys(rooms).filter(k => rooms[k] > 0).map(k => rooms[k] + ' ' + RNAMES[k]).join(', ') || 'None';
    const req = {
      userId:         user?.uid    || 'admin-created',
      userEmail:      user?.email  || form.email,
      name:           (form.firstName + ' ' + form.lastName).trim(),
      phone:          form.phone   || 'N/A',
      email:          form.email   || user?.email || 'N/A',
      address:        form.address || 'N/A',
      date:           form.date    || 'N/A',
      time:           form.time    || 'N/A',
      bathrooms:      bathDesc,
      rooms:          roomDesc,
      addons:         price.extraNames.join(', ') || 'None',
      pets:           form.pets,
      otherRequests:  form.otherReqs || 'None',
      walkthrough:    walkthrough ? 'Yes' : 'No',
      frequency:      freq,
      firstTime, senior,
      notes:          form.notes   || '',
      referral:       form.referral || 'N/A',
      access:         form.access,
      estimate:       price.final,
      status:         'new',
      submittedAt:    new Date().toLocaleString(),
      createdAt:      serverTimestamp(),
      createdByAdmin: adminMode,
    };
    const docRef = await addDoc(collection(db, 'requests'), req);
    await addDoc(collection(db, 'chats', docRef.id, 'messages'), {
      text: 'Hi ' + form.firstName + "! Thank you for reaching out. I've received your request and will get back to you within 24 hours to confirm your appointment!",
      sender: 'admin', senderName: 'Owner', createdAt: serverTimestamp(),
    });
    if (form.date && form.time && form.date !== 'N/A' && form.time !== 'N/A') {
      try {
        const slotSnap = await getDocs(query(collection(db, 'availability'), where('date', '==', form.date), where('time', '==', form.time)));
        slotSnap.forEach(async (slotDoc) => { await deleteDoc(doc(db, 'availability', slotDoc.id)); });
      } catch (e) { console.warn('Could not remove slot:', e); }
    }
    setSubmitting(false);
    if (onDone) onDone(docRef.id);
  };

  const stepLabels = ['Contact', 'Rooms', 'Preferences', 'Review'];

  const QCtrl = ({ val, onInc, onDec }) => (
    <div className="qctrl">
      <button className="qbtn" type="button" onClick={onDec}>-</button>
      <span className="qdis">{val}</span>
      <button className="qbtn" type="button" onClick={onInc}>+</button>
    </div>
  );

  const RoomRow = ({ name, desc, val, onInc, onDec }) => (
    <div className="bath-row">
      <div style={{ flex: 1 }}>
        <div className="bname">{name}</div>
        <div className="bdesc">{desc}</div>
      </div>
      <QCtrl val={val} onInc={onInc} onDec={onDec} />
    </div>
  );

  return (
    <div>
      {/* Progress bar */}
      <div className="progress-wrap" style={{ marginBottom: '0' }}>
        <div className="steps-row">
          {stepLabels.map((label, i) => (
            <div key={i} className={'step-dot ' + (i < step ? 'done' : i === step ? 'active' : '')}>
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
            <div className="page-title">{adminMode ? 'Client Information' : 'Your Information'}</div>
            <div className="page-sub">Tell us who you are and how to reach you</div>
            <div className="wcard">
              <div className="card-body">
                <div className="row2">
                  <div className="fg">
                    <label>First Name <span style={{ color: '#ef4444' }}>*</span></label>
                    <input type="text" value={form.firstName} onChange={e => setF('firstName', e.target.value)} placeholder="e.g. Maria" />
                  </div>
                  <div className="fg">
                    <label>Last Name</label>
                    <input type="text" value={form.lastName} onChange={e => setF('lastName', e.target.value)} placeholder="e.g. Rodriguez" />
                  </div>
                </div>
                <div className="row2">
                  <div className="fg">
                    <label>Phone Number <span style={{ color: '#ef4444' }}>*</span></label>
                    <input type="tel" value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="(555) 000-0000" />
                  </div>
                  <div className="fg">
                    <label>Email</label>
                    <input type="email" value={form.email} onChange={e => setF('email', e.target.value)} placeholder="your@email.com" />
                  </div>
                </div>
                <div className="fg">
                  <label>Service Address</label>
                  <input
                    ref={addressInputRef}
                    type="text"
                    value={form.address}
                    onChange={e => setF('address', e.target.value)}
                    onFocus={() => { if (window.__gmapsLoaded && !autocompleteRef.current) initAutocomplete(); }}
                    placeholder="Start typing your address..."
                    autoComplete="off"
                  />
                </div>
                <div className="row2">
                  <div className="fg">
                    <label>Preferred Date <span style={{ color: '#ef4444' }}>*</span></label>
                    {availDates.length > 0 ? (
                      <select value={form.date} onChange={e => { setF('date', e.target.value); setF('time', ''); }}>
                        <option value="">Select an available date</option>
                        {availDates.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={form.date} onChange={e => setF('date', e.target.value)} placeholder="e.g. Monday, March 10" />
                    )}
                  </div>
                  <div className="fg">
                    <label>Preferred Time</label>
                    {availDates.length > 0 && form.date ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginTop: '4px' }}>
                        {timesForDate.map(t => (
                          <button key={t} type="button" onClick={() => setF('time', t)} style={{
                            padding: '8px 14px', borderRadius: '10px',
                            border: form.time === t ? '2px solid transparent' : '1.5px solid var(--border)',
                            background: form.time === t ? 'var(--black)' : 'var(--soft)',
                            color: form.time === t ? 'white' : '#374151',
                            fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.78rem',
                            cursor: 'pointer', transition: 'all .15s',
                          }}>{t}</button>
                        ))}
                      </div>
                    ) : availDates.length > 0 ? (
                      <div style={{ color: '#9ca3af', fontSize: '.82rem', padding: '10px 0' }}>Pick a date first</div>
                    ) : (
                      <select value={form.time} onChange={e => setF('time', e.target.value)}>
                        <option value="">Select a time</option>
                        <option>Morning (8am-12pm)</option>
                        <option>Afternoon (12pm-4pm)</option>
                        <option>Evening (4pm-7pm)</option>
                        <option>Flexible</option>
                      </select>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Walk-through — prominent banner card */}
            <div
              onClick={() => setWalkthrough(w => !w)}
              style={{
                marginTop: '16px',
                borderRadius: '16px',
                border: walkthrough ? '2px solid #1a6fd4' : '2px dashed #3a3a3a',
                background: walkthrough
                  ? 'linear-gradient(135deg, rgba(26,111,212,.15), rgba(219,39,119,.08))'
                  : '#141414',
                padding: '20px 22px',
                cursor: 'pointer',
                transition: 'all .2s',
                display: 'flex',
                alignItems: 'center',
                gap: '18px',
              }}
            >
              <div style={{
                width: '52px', height: '52px', borderRadius: '14px', flexShrink: 0,
                background: walkthrough ? 'linear-gradient(135deg,#1a6fd4,#db2777)' : '#222',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.6rem', transition: 'all .2s',
              }}>
                🏠
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontWeight: '800', fontSize: '.98rem',
                  color: walkthrough ? 'white' : '#9ca3af',
                  marginBottom: '4px', transition: 'color .2s',
                }}>
                  Request a Free Walk-Through
                </div>
                <div style={{ fontSize: '.8rem', color: walkthrough ? '#a5c8ff' : '#555', lineHeight: 1.5, transition: 'color .2s' }}>
                  We’ll visit your space first to give you an exact price — no surprises.
                </div>
                {walkthrough && (
                  <div style={{
                    marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '5px',
                    background: 'rgba(16,185,129,.15)', border: '1px solid rgba(16,185,129,.3)',
                    borderRadius: '99px', padding: '3px 10px',
                    fontSize: '.74rem', fontWeight: '700', color: '#10b981',
                  }}>
                    ✅ Walk-through requested
                  </div>
                )}
              </div>
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                border: walkthrough ? '2px solid #1a6fd4' : '2px solid #3a3a3a',
                background: walkthrough ? '#1a6fd4' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.9rem', color: 'white', fontWeight: '900', transition: 'all .2s',
              }}>
                {walkthrough ? '✓' : ''}
              </div>
            </div>

            <div className="nav-btns">
              <button className="btn-next" onClick={() => goTo(1)}>Next: Rooms</button>
            </div>
          </div>
        )}

        {/* ── STEP 1: ROOMS ── */}
        {step === 1 && (
          <div>
            <div className="page-title">Rooms</div>
            <div className="page-sub">Select at least one room or bathroom to continue</div>

            <div className="wcard">
              <div className="card-header">
                <div className="card-icon">B</div>
                <div><div className="card-title">Bedrooms and Living</div></div>
              </div>
              <div className="card-body">
                <div className="bath-box">
                  {BEDROOMS.map(({ key, name, desc }) => (
                    <RoomRow key={key} name={name} desc={desc} val={rooms[key]}
                      onInc={() => setRooms(r => ({ ...r, [key]: r[key] + 1 }))}
                      onDec={() => setRooms(r => ({ ...r, [key]: Math.max(0, r[key] - 1) }))}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="wcard">
              <div className="card-header">
                <div className="card-icon">Ba</div>
                <div><div className="card-title">Bathrooms</div></div>
              </div>
              <div className="card-body">
                <div className="bath-box">
                  {BATHROOMS.map(({ key, name, desc }) => (
                    <RoomRow key={key} name={name} desc={desc} val={baths[key]}
                      onInc={() => setBaths(b => ({ ...b, [key]: b[key] + 1 }))}
                      onDec={() => setBaths(b => ({ ...b, [key]: Math.max(0, b[key] - 1) }))}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="wcard">
              <div className="card-header">
                <div className="card-icon">K</div>
                <div><div className="card-title">Kitchen and Utility</div></div>
              </div>
              <div className="card-body">
                <div className="bath-box">
                  {KITCHEN.map(({ key, name, desc }) => (
                    <RoomRow key={key} name={name} desc={desc} val={rooms[key]}
                      onInc={() => setRooms(r => ({ ...r, [key]: r[key] + 1 }))}
                      onDec={() => setRooms(r => ({ ...r, [key]: Math.max(0, r[key] - 1) }))}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="nav-btns">
              <button className="btn-back" onClick={() => goTo(0)}>Back</button>
              <button className="btn-next" onClick={() => goTo(2)}>Next: Add-Ons</button>
            </div>
          </div>
        )}

        {/* ── STEP 2: PREFERENCES (Add-Ons + Frequency merged) ── */}
        {step === 2 && (
          <div>
            <div className="page-title">Preferences</div>
            <div className="page-sub">Extras, frequency, and a few quick questions</div>

            {/* Frequency */}
            <div className="wcard">
              <div className="card-header">
                <div className="card-icon">F</div>
                <div><div className="card-title">How often?</div></div>
              </div>
              <div className="card-body">
                <div className="fpills">
                  {FREQS.map(fq => (
                    <div key={fq.val} className={'fpill ' + (freq === fq.val ? 'active' : '')} onClick={() => setFreq(fq.val)}>
                      {fq.label}
                    </div>
                  ))}
                </div>

              </div>
            </div>

            {/* Add-Ons */}
            <div className="wcard">
              <div className="card-header">
                <div className="card-icon">+</div>
                <div><div className="card-title">Add-On Services</div><div className="card-sub">All optional</div></div>
              </div>
              <div className="card-body">
                <div className="extras-grid">
                  {EXTRAS.map(e => (
                    <div key={e.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div className={'eitem ' + (extras[e.id] ? 'selected' : '')} onClick={() => setExtras(x => ({ ...x, [e.id]: !x[e.id] }))}>
                        <input type="checkbox" readOnly checked={!!extras[e.id]}
                          style={{ width: '17px', height: '17px', accentColor: 'var(--pink-deep)', flexShrink: 0, marginTop: '2px' }} />
                        <div className="ename">{e.name}</div>
                      </div>
                      {e.hasQty && extras[e.id] && (
                        <div style={{ background: '#1a1a2e', border: '1.5px solid var(--blue)', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '.78rem', color: '#d1d5db', fontWeight: '700', flex: 1 }}>How many windows?</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button type="button" className="qbtn" onClick={ev => { ev.stopPropagation(); setWindowQty(q => Math.max(1, q - 1)); }}>-</button>
                            <span className="qdis">{windowQty}</span>
                            <button type="button" className="qbtn" onClick={ev => { ev.stopPropagation(); setWindowQty(q => q + 1); }}>+</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="divider"></div>
                <div className="row2">
                  <div className="fg">
                    <label>Any Pets?</label>
                    <select value={form.pets} onChange={e => setF('pets', e.target.value)}>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label>Other Requests <span className="opt">(optional)</span></label>
                    <input type="text" value={form.otherReqs} onChange={e => setF('otherReqs', e.target.value)} placeholder="e.g. Deep clean behind appliances..." />
                  </div>
                </div>
              </div>
            </div>

            <div className="nav-btns">
              <button className="btn-back" onClick={() => goTo(1)}>Back</button>
              <button className="btn-next" onClick={() => goTo(3)}>Next: Review</button>
            </div>
          </div>
        )}

        {/* ── STEP 3: REVIEW ── */}
        {step === 3 && (
          <div>
            <div className="page-title">Review and Submit</div>
            <div className="page-sub">Add any notes and submit your request</div>
            <div className="wcard">
              <div className="card-header">
                <div className="card-icon">N</div>
                <div><div className="card-title">Special Requests</div></div>
              </div>
              <div className="card-body">
                <div className="fg">
                  <label>Notes <span className="opt">(optional)</span></label>
                  <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="e.g. Focus on kitchen, allergic to certain products..." />
                </div>
                <div className="row2">
                  <div className="fg">
                    <label>How did you hear about us?</label>
                    <select value={form.referral} onChange={e => setF('referral', e.target.value)}>
                      <option value="">Select one</option>
                      <option>Google / Search Engine</option>
                      <option>Instagram / Facebook</option>
                      <option>Friend or Family</option>
                      <option>Nextdoor</option>
                      <option>Flyer / Advertisement</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label>Home Access</label>
                    <select value={form.access} onChange={e => setF('access', e.target.value)}>
                      <option>I'll be home</option>
                      <option>Lockbox / Key left out</option>
                      <option>Garage code</option>
                      <option>Other arrangement</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Discounts */}
            <div className="wcard">
              <div className="card-header" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,.18), rgba(26,111,212,.1))' }}>
                <div className="card-icon" style={{ fontSize: '1.2rem' }}>🏷️</div>
                <div>
                  <div className="card-title">Discounts</div>
                  <div className="card-sub">Any applicable discounts will be applied to your estimate</div>
                </div>
              </div>
              <div className="card-body">
                <div className="row2">
                  <div className="fg">
                    <label>First time with us?</label>
                    <select value={firstTime} onChange={e => setFirstTime(e.target.value)}>
                      <option value="no">No, returning client</option>
                      <option value="yes">Yes — 10% first-time discount</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label>Senior discount?</label>
                    <select value={senior} onChange={e => setSenior(e.target.value)}>
                      <option value="no">No</option>
                      <option value="yes">Yes — 10% senior discount</option>
                    </select>
                  </div>
                </div>
                {(firstTime === 'yes' || senior === 'yes') && (
                  <div style={{ marginTop: '10px', background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.25)', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.1rem' }}>✅</span>
                    <span style={{ fontSize: '.82rem', fontWeight: '700', color: '#10b981' }}>
                      Discount applied — your estimate already reflects the savings!
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Price bar — shows final with discount applied, no breakdown of what % */}
            <div className="pbar">
              <div className="pbar-top">
                <div>
                  <div className="plabel">YOUR ESTIMATE</div>
                  <div className="pamount">${price.final}</div>
                  <div className="prange">
                    {price.final > 0
                      ? 'Est. range: $' + Math.round(price.final * .95) + ' \u2013 $' + Math.round(price.final * 1.1)
                      : 'Select rooms to calculate'}
                  </div>
                  {price.hasDiscount && (
                    <div style={{ marginTop: '6px', fontSize: '.76rem', color: '#10b981', fontWeight: '700' }}>
                      Discount applied!
                    </div>
                  )}
                </div>
              </div>
              <div className="plines">
                {price.lines.map((l, i) => <div key={i} className="pline">+ {l}</div>)}
              </div>
              <div className="pnote">Final price confirmed after walkthrough or consultation.</div>
            </div>

            <div className="nav-btns">
              <button className="btn-back" onClick={() => goTo(2)}>Back</button>
              <button className="btn-next" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Request  \u2014  $' + price.final}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
