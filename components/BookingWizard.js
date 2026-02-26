'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, addDoc, onSnapshot, serverTimestamp, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
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
    let base = 0;
    const lines = [];
    Object.keys(baths).forEach(t => {
      if (baths[t] > 0) { base += baths[t] * BPRICES[t]; lines.push(BNAMES[t] + ' x' + baths[t]); }
    });
    Object.keys(rooms).forEach(r => {
      if (rooms[r] > 0) { base += rooms[r] * RPRICES[r]; lines.push(RNAMES[r] + ' x' + rooms[r]); }
    });
    let extTotal = 0;
    const extraNames = [];
    EXTRAS.forEach(e => {
      if (extras[e.id]) {
        const qty = e.hasQty ? (windowQty || 1) : 1;
        extTotal += e.price * qty;
        const label = e.hasQty ? `${e.name} x${qty}` : e.name;
        extraNames.push(label);
        lines.push(label);
      }
    });
    const sub = base + extTotal;
    const fq = FREQS.find(f => f.val === freq);
    let discAmt = fq && fq.pct > 0 ? sub * fq.pct : 0;
    if (firstTime === 'yes') discAmt += sub * 0.10;
    if (senior    === 'yes') discAmt += sub * 0.10;
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

  const stepLabels = ['Contact', 'Rooms', 'Add-Ons', 'Frequency', 'Review'];

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

            {/* Walk-through toggle on step 0 */}
            <div
              className={'wt-toggle ' + (walkthrough ? 'active' : '')}
              onClick={() => setWalkthrough(w => !w)}
              style={{ marginTop: '12px' }}
            >
              <div className="wt-info">
                <div className="wt-title">Request a Walk-Through</div>
                <div className="wt-desc">We will visit before cleaning to give you an exact quote</div>
              </div>
              <div className="wt-check">{walkthrough ? '✓' : ''}</div>
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

        {/* ── STEP 2: ADD-ONS ── */}
        {step === 2 && (
          <div>
            <div className="page-title">Add-On Services</div>
            <div className="page-sub">Select any extras (all optional)</div>
            <div className="wcard">
              <div className="card-body">
                <div className="extras-grid">
                  {EXTRAS.map(e => (
                    <div key={e.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div
                        className={'eitem ' + (extras[e.id] ? 'selected' : '')}
                        onClick={() => setExtras(x => ({ ...x, [e.id]: !x[e.id] }))}
                      >
                        <input type="checkbox" readOnly checked={!!extras[e.id]}
                          style={{ width: '17px', height: '17px', accentColor: 'var(--pink-deep)', flexShrink: 0, marginTop: '2px' }}
                        />
                        <div className="ename">{e.name}</div>
                      </div>
                      {e.hasQty && extras[e.id] && (
                        <div style={{
                          background: '#1a1a2e', border: '1.5px solid var(--blue)',
                          borderRadius: '10px', padding: '10px 14px',
                          display: 'flex', alignItems: 'center', gap: '10px',
                        }}>
                          <span style={{ fontSize: '.78rem', color: '#d1d5db', fontWeight: '700', flex: 1 }}>
                            How many windows?
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button type="button" className="qbtn"
                              onClick={ev => { ev.stopPropagation(); setWindowQty(q => Math.max(1, q - 1)); }}>-</button>
                            <span className="qdis">{windowQty}</span>
                            <button type="button" className="qbtn"
                              onClick={ev => { ev.stopPropagation(); setWindowQty(q => q + 1); }}>+</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="divider"></div>
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
            <div className="nav-btns">
              <button className="btn-back" onClick={() => goTo(1)}>Back</button>
              <button className="btn-next" onClick={() => goTo(3)}>Next: Frequency</button>
            </div>
          </div>
        )}

        {/* ── STEP 3: FREQUENCY ── */}
        {step === 3 && (
          <div>
            <div className="page-title">Cleaning Frequency</div>
            <div className="page-sub">How often would you like us to clean?</div>
            <div className="wcard">
              <div className="card-body">
                <label style={{ display: 'block', fontWeight: '700', fontSize: '.82rem', color: '#111827', marginBottom: '12px' }}>
                  Frequency
                </label>
                {/* Frequency pills — no discount tags shown */}
                <div className="fpills" style={{ marginBottom: '18px' }}>
                  {FREQS.map(fq => (
                    <div
                      key={fq.val}
                      className={'fpill ' + (freq === fq.val ? 'active' : '')}
                      onClick={() => setFreq(fq.val)}
                    >
                      {fq.label}
                    </div>
                  ))}
                </div>
                <div className="divider"></div>
                {/* First-time / senior — simple Yes/No, no percentage labels */}
                <div className="row2">
                  <div className="fg">
                    <label>First time with us?</label>
                    <select value={firstTime} onChange={e => setFirstTime(e.target.value)}>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label>Senior discount?</label>
                    <select value={senior} onChange={e => setSenior(e.target.value)}>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="nav-btns" style={{ marginTop: '18px' }}>
              <button className="btn-back" onClick={() => goTo(2)}>Back</button>
              <button className="btn-next" onClick={() => goTo(4)}>Next: Review</button>
            </div>
          </div>
        )}

        {/* ── STEP 4: REVIEW ── */}
        {step === 4 && (
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
              <button className="btn-back" onClick={() => goTo(3)}>Back</button>
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
