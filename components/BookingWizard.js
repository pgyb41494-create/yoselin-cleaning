'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, addDoc, onSnapshot, serverTimestamp, query, where, getDocs, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const BPRICES = { half: 15, small: 50, medium: 65, large: 80 };
const RPRICES = { bed_small: 25, bed_medium: 30, bed_large: 35, liv_small: 20, liv_medium: 25, liv_large: 35, office: 10, kit_small: 45, kit_medium: 55, kit_large: 70, laundry: 10, basement: 75 };
const RNAMES  = { bed_small: 'Small Bedroom', bed_medium: 'Medium Bedroom', bed_large: 'Large/Master Bedroom', liv_small: 'Small Living Room', liv_medium: 'Medium Living Room', liv_large: 'Large Living Room', office: 'Office/Study', kit_small: 'Small Kitchen', kit_medium: 'Medium Kitchen', kit_large: 'Large Kitchen', laundry: 'Laundry Room', basement: 'Basement' };
const BNAMES  = { half: 'Half Bath', small: 'Small Full Bath', medium: 'Medium Full Bath', large: 'Large/Master Bath' };

const EXTRAS = [
  { id: 'cabinets',  name: 'Inside Cabinets',   price: 16 },
  { id: 'pantry',    name: 'Inside Pantry',      price: 20 },
  { id: 'oven',      name: 'Inside Oven',        price: 16 },
  { id: 'fridge',    name: 'Inside Fridge',      price: 16 },
  { id: 'baseboard', name: 'Baseboard Cleaning', price: 5  },
  { id: 'windows',   name: 'Window Trim',        price: 5, hasQty: true },
];

const FREQS = [
  { val: 'once',     label: 'One-Time',  pct: 0     },
  { val: 'weekly',   label: 'Weekly',    pct: 0.175 },
  { val: 'biweekly', label: 'Bi-Weekly', pct: 0.15  },
  { val: 'monthly',  label: 'Monthly',   pct: 0.125 },
];

const BEDROOMS = [
  { key: 'bed_small',  name: 'Small Bedroom',        desc: 'Guest room or compact space'   },
  { key: 'bed_medium', name: 'Medium Bedroom',       desc: 'Standard bedroom with closet'  },
  { key: 'bed_large',  name: 'Large/Master Bedroom', desc: 'Spacious with en-suite'        },
  { key: 'liv_small',  name: 'Small Living Room',    desc: 'Cozy or compact space'         },
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
const initRooms = () => ({ bed_small: 0, bed_medium: 0, bed_large: 0, liv_small: 0, liv_medium: 0, liv_large: 0, office: 0, kit_small: 0, kit_medium: 0, kit_large: 0, laundry: 0, basement: 0 });

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function formatDateKey(d) { return MONTH_NAMES[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); }

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

  // Calendar state
  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calYear,  setCalYear]  = useState(now.getFullYear());

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

  // Build a map of date -> slot count for the calendar
  const slotsPerDate = {};
  availability.forEach(s => { slotsPerDate[s.date] = (slotsPerDate[s.date] || 0) + 1; });

  const calFirstDay   = new Date(calYear, calMonth, 1).getDay();
  const calDaysInMonth = getDaysInMonth(calYear, calMonth);
  const todayMidnight  = new Date(); todayMidnight.setHours(0,0,0,0);

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };

  // Don't let user go to past months
  const canGoPrev = calYear > now.getFullYear() || (calYear === now.getFullYear() && calMonth > now.getMonth());

  const goTo = (s) => {
    if (s >= 1) {
      if (!form.firstName.trim()) { alert('Please enter your first name.'); return; }
      if (!form.phone.trim())     { alert('Please enter your phone number.'); return; }
      if (!form.date)             { alert('Please choose a preferred date.'); return; }
    }
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
      <div className="progress-wrap" style={{ marginBottom: '0' }}>
        <div className="steps-row">
          {stepLabels.map((label, i) => (
            <div key={i} className={'step-dot ' + (i < step ? 'done' : i === step ? 'active' : '')}>
              <div className="dot-circle">{i < step ? '\u2713' : i + 1}</div>
              <div className="dot-label">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="wizard-body">

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
                  <input ref={addressInputRef} type="text" value={form.address} onChange={e => setF('address', e.target.value)}
                    onFocus={() => { if (window.__gmapsLoaded && !autocompleteRef.current) initAutocomplete(); }}
                    placeholder="Start typing your address..." autoComplete="off" />
                </div>
                {/* ── VISUAL CALENDAR DATE PICKER ── */}
                {availDates.length > 0 ? (
                  <div style={{ marginTop: '4px' }}>
                    <label style={{ marginBottom: '10px', display: 'block' }}>Preferred Date <span style={{ color: '#ef4444' }}>*</span></label>
                    <div style={{ background: '#151515', borderRadius: '16px', border: '1.5px solid #2a2a2a', padding: '16px', marginBottom: '14px' }}>
                      {/* Month nav */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                        <button type="button" onClick={prevMonth} disabled={!canGoPrev} style={{ background: canGoPrev ? '#222' : 'transparent', border: '1px solid #333', color: canGoPrev ? '#d1d5db' : '#333', borderRadius: '8px', padding: '5px 11px', cursor: canGoPrev ? 'pointer' : 'default', fontWeight: '700', fontSize: '.82rem' }}>&lt;</button>
                        <div style={{ fontFamily: 'Playfair Display, serif', fontWeight: '700', color: 'white', fontSize: '.95rem' }}>{MONTH_NAMES[calMonth]} {calYear}</div>
                        <button type="button" onClick={nextMonth} style={{ background: '#222', border: '1px solid #333', color: '#d1d5db', borderRadius: '8px', padding: '5px 11px', cursor: 'pointer', fontWeight: '700', fontSize: '.82rem' }}>&gt;</button>
                      </div>
                      {/* Day headers */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '4px' }}>
                        {DAY_LABELS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: '.62rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', padding: '4px 0' }}>{d}</div>)}
                      </div>
                      {/* Day grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                        {Array.from({ length: calFirstDay }).map((_, i) => <div key={'e'+i} />)}
                        {Array.from({ length: calDaysInMonth }).map((_, i) => {
                          const day = i + 1;
                          const d = new Date(calYear, calMonth, day);
                          const key = formatDateKey(d);
                          const isPast = d < todayMidnight;
                          const slotCount = slotsPerDate[key] || 0;
                          const hasSlots = slotCount > 0;
                          const isSelected = form.date === key;
                          const isToday = now.getDate() === day && now.getMonth() === calMonth && now.getFullYear() === calYear;
                          const canClick = !isPast && hasSlots;
                          return (
                            <button key={day} type="button" onClick={() => {
                              if (!canClick) return;
                              setF('date', key); setF('time', '');
                            }} style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                              aspectRatio: '1', borderRadius: '10px', padding: '2px', position: 'relative',
                              border: isSelected ? '2px solid #a855f7' : isToday ? '1.5px solid #555' : '1px solid transparent',
                              background: isSelected ? 'linear-gradient(135deg, rgba(168,85,247,.25), rgba(219,39,119,.15))' : canClick ? 'rgba(168,85,247,.06)' : 'transparent',
                              color: isPast ? '#2a2a2a' : isSelected ? '#e9d5ff' : hasSlots ? '#d1d5db' : '#3a3a3a',
                              cursor: canClick ? 'pointer' : 'default',
                              fontWeight: isSelected ? '800' : '600', fontSize: '.82rem',
                              transition: 'all .15s',
                            }}>
                              {day}
                              {hasSlots && !isPast && (
                                <span style={{ fontSize: '.52rem', fontWeight: '800', color: isSelected ? '#e9d5ff' : slotCount <= 2 ? '#f59e0b' : '#10b981', marginTop: '1px', lineHeight: 1 }}>
                                  {slotCount} slot{slotCount !== 1 ? 's' : ''}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {/* Selected date display */}
                      {form.date && (
                        <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(168,85,247,.1)', border: '1px solid rgba(168,85,247,.25)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '.8rem', fontWeight: '700', color: '#d8b4fe' }}>📅 {form.date}</span>
                          <button type="button" onClick={() => { setF('date', ''); setF('time', ''); }} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '.72rem', fontWeight: '700', cursor: 'pointer' }}>Clear</button>
                        </div>
                      )}
                    </div>

                    {/* Time slots */}
                    <label style={{ marginBottom: '8px', display: 'block' }}>Preferred Time</label>
                    {form.date && timesForDate.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                        {timesForDate.map(tm => (
                          <button key={tm} type="button" onClick={() => setF('time', tm)} style={{
                            padding: '10px 16px', borderRadius: '10px',
                            border: form.time === tm ? '2px solid #a855f7' : '1.5px solid #2a2a2a',
                            background: form.time === tm ? 'linear-gradient(135deg, rgba(168,85,247,.25), rgba(219,39,119,.12))' : '#151515',
                            color: form.time === tm ? '#e9d5ff' : '#9ca3af',
                            fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.8rem',
                            cursor: 'pointer', transition: 'all .15s',
                          }}>{tm}</button>
                        ))}
                      </div>
                    ) : form.date ? (
                      <div style={{ color: '#6b7280', fontSize: '.82rem', padding: '10px 0' }}>No time slots for this date</div>
                    ) : (
                      <div style={{ color: '#6b7280', fontSize: '.82rem', padding: '10px 0' }}>Pick a date first</div>
                    )}
                  </div>
                ) : (
                  /* Fallback when no availability is set — plain text inputs */
                  <div className="row2">
                    <div className="fg">
                      <label>Preferred Date <span style={{ color: '#ef4444' }}>*</span></label>
                      <input type="text" value={form.date} onChange={e => setF('date', e.target.value)} placeholder="e.g. Monday, March 10" />
                    </div>
                    <div className="fg">
                      <label>Preferred Time</label>
                      <select value={form.time} onChange={e => setF('time', e.target.value)}>
                        <option value="">Select a time</option>
                        <option>Morning (8am-12pm)</option>
                        <option>Afternoon (12pm-4pm)</option>
                        <option>Evening (4pm-7pm)</option>
                        <option>Flexible</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div onClick={() => setWalkthrough(w => !w)} style={{
              marginTop: '16px', borderRadius: '16px',
              border: walkthrough ? '2px solid #1a6fd4' : '2px dashed #3a3a3a',
              background: walkthrough ? 'linear-gradient(135deg, rgba(26,111,212,.15), rgba(219,39,119,.08))' : '#141414',
              padding: '20px 22px', cursor: 'pointer', transition: 'all .2s', display: 'flex', alignItems: 'center', gap: '18px',
            }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', flexShrink: 0, background: walkthrough ? 'linear-gradient(135deg,#1a6fd4,#db2777)' : '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', transition: 'all .2s' }}>{'\uD83C\uDFE0'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '800', fontSize: '.98rem', color: walkthrough ? 'white' : '#9ca3af', marginBottom: '4px', transition: 'color .2s' }}>
                  Request a Free Walk-Through
                </div>
                <div style={{ fontSize: '.8rem', color: walkthrough ? '#a5c8ff' : '#555', lineHeight: 1.5, transition: 'color .2s' }}>
                  {"We'll visit your space first to give you an exact price \u2014 no surprises."}
                </div>
                {walkthrough && (
                  <div style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(16,185,129,.15)', border: '1px solid rgba(16,185,129,.3)', borderRadius: '99px', padding: '3px 10px', fontSize: '.74rem', fontWeight: '700', color: '#10b981' }}>
                    {'\u2705'} Walk-through requested
                  </div>
                )}
              </div>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0, border: walkthrough ? '2px solid #1a6fd4' : '2px solid #3a3a3a', background: walkthrough ? '#1a6fd4' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.9rem', color: 'white', fontWeight: '900', transition: 'all .2s' }}>
                {walkthrough ? '\u2713' : ''}
              </div>
            </div>

            <div className="nav-btns">
              <button className="btn-next" onClick={() => goTo(1)}>Next: Rooms</button>
            </div>
          </div>
        )}

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
                      onDec={() => setRooms(r => ({ ...r, [key]: Math.max(0, r[key] - 1) }))} />
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
                      onDec={() => setBaths(b => ({ ...b, [key]: Math.max(0, b[key] - 1) }))} />
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
                      onDec={() => setRooms(r => ({ ...r, [key]: Math.max(0, r[key] - 1) }))} />
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

        {step === 2 && (
          <div>
            <div className="page-title">Preferences</div>
            <div className="page-sub">Extras, frequency, and a few quick questions</div>

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
                        <input type="checkbox" readOnly checked={!!extras[e.id]} style={{ width: '17px', height: '17px', accentColor: 'var(--pink-deep)', flexShrink: 0, marginTop: '2px' }} />
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

        {step === 3 && (
          <div>
            <div className="page-title">Review and Submit</div>
            <div className="page-sub">Add any notes and submit your request</div>

            {/* Date & Time Summary Card */}
            {(form.date || form.time) && (() => {
              const parsed = form.date ? new Date(form.date) : null;
              const dayName = parsed && !isNaN(parsed) ? ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][parsed.getDay()] : '';
              const monthName = parsed && !isNaN(parsed) ? MONTH_NAMES[parsed.getMonth()] : '';
              const dayNum = parsed && !isNaN(parsed) ? parsed.getDate() : '';
              const year = parsed && !isNaN(parsed) ? parsed.getFullYear() : '';
              return (
                <div style={{ background: '#111', border: '1.5px solid #2a2a2a', borderRadius: '18px', overflow: 'hidden', marginBottom: '18px' }}>
                  <div style={{ padding: '12px 18px', background: 'linear-gradient(135deg, rgba(168,85,247,.12), rgba(219,39,119,.06))', borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '.78rem' }}>\uD83D\uDCC5</span>
                    <span style={{ fontSize: '.68rem', fontWeight: '800', color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '1px' }}>Preferred Date & Time</span>
                  </div>
                  <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '18px' }}>
                    {parsed && !isNaN(parsed) ? (
                      <div style={{ width: '76px', flexShrink: 0, borderRadius: '14px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(168,85,247,.25)', border: '1px solid rgba(168,85,247,.3)' }}>
                        <div style={{ background: 'linear-gradient(135deg, #a855f7, #db2777)', padding: '5px 0 3px', textAlign: 'center' }}>
                          <div style={{ fontSize: '.6rem', fontWeight: '800', color: 'rgba(255,255,255,.9)', textTransform: 'uppercase', letterSpacing: '1.5px', lineHeight: 1 }}>{monthName.slice(0,3)}</div>
                        </div>
                        <div style={{ background: '#1a1a2e', padding: '8px 0 6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '1.8rem', fontWeight: '900', color: 'white', lineHeight: 1 }}>{dayNum}</div>
                          <div style={{ fontSize: '.58rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.6px', marginTop: '2px' }}>{dayName.slice(0,3)}</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ width: '76px', height: '76px', borderRadius: '14px', background: '#1a1a2e', border: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.6rem' }}>\uD83D\uDCC5</div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '1.05rem', fontWeight: '800', color: 'white', lineHeight: 1.3, marginBottom: '2px' }}>
                        {parsed && !isNaN(parsed) ? `${dayName}, ${monthName} ${dayNum}` : form.date}
                      </div>
                      {year && <div style={{ fontSize: '.78rem', fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>{year}</div>}
                      {form.time && form.time !== 'N/A' && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(168,85,247,.12)', border: '1px solid rgba(168,85,247,.2)', borderRadius: '10px', padding: '6px 14px' }}>
                          <span style={{ fontSize: '.74rem' }}>\uD83D\uDD52</span>
                          <span style={{ fontSize: '.84rem', fontWeight: '700', color: '#d8b4fe' }}>{form.time}</span>
                        </div>
                      )}
                      {(!form.time || form.time === 'N/A') && (
                        <div style={{ fontSize: '.78rem', color: '#555', fontStyle: 'italic' }}>No time selected</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
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
                      <option>{"I'll be home"}</option>
                      <option>Lockbox / Key left out</option>
                      <option>Garage code</option>
                      <option>Other arrangement</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="wcard">
              <div className="card-header" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,.18), rgba(26,111,212,.1))' }}>
                <div className="card-icon" style={{ fontSize: '1.2rem' }}>{'\uD83C\uDFF7\uFE0F'}</div>
                <div>
                  <div className="card-title">Discounts</div>
                  <div className="card-sub">Any applicable discounts will be applied to your estimate</div>
                </div>
              </div>
              <div className="card-body">
                <div className="row2">
                  <div className="fg">
                    <label style={{ marginBottom: '8px', display: 'block' }}>First-time client?</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {['no', 'yes'].map(v => (
                        <button key={v} type="button" onClick={() => setFirstTime(v)} style={{
                          flex: 1, padding: '11px 0', borderRadius: '10px', cursor: 'pointer',
                          fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.92rem',
                          border: firstTime === v ? (v === 'yes' ? '2px solid #10b981' : '2px solid #555') : '2px solid #2a2a2a',
                          background: firstTime === v ? (v === 'yes' ? 'rgba(16,185,129,.18)' : '#252525') : '#1a1a1a',
                          color: firstTime === v ? (v === 'yes' ? '#10b981' : '#d1d5db') : '#4b5563',
                          transition: 'all .15s',
                        }}>{v === 'yes' ? 'Yes' : 'No'}</button>
                      ))}
                    </div>
                  </div>
                  <div className="fg">
                    <label style={{ marginBottom: '8px', display: 'block' }}>Senior discount?</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {['no', 'yes'].map(v => (
                        <button key={v} type="button" onClick={() => setSenior(v)} style={{
                          flex: 1, padding: '11px 0', borderRadius: '10px', cursor: 'pointer',
                          fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.92rem',
                          border: senior === v ? (v === 'yes' ? '2px solid #10b981' : '2px solid #555') : '2px solid #2a2a2a',
                          background: senior === v ? (v === 'yes' ? 'rgba(16,185,129,.18)' : '#252525') : '#1a1a1a',
                          color: senior === v ? (v === 'yes' ? '#10b981' : '#d1d5db') : '#4b5563',
                          transition: 'all .15s',
                        }}>{v === 'yes' ? 'Yes' : 'No'}</button>
                      ))}
                    </div>
                  </div>
                </div>
                {(firstTime === 'yes' || senior === 'yes') && (
                  <div style={{ marginTop: '12px', background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.25)', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1rem' }}>{'\u2705'}</span>
                    <span style={{ fontSize: '.82rem', fontWeight: '700', color: '#10b981' }}>Discount applied!</span>
                  </div>
                )}
              </div>
            </div>

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
