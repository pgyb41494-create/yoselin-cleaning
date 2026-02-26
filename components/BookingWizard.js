'use client';
import { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, serverTimestamp, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { notifyNewBooking } from '../lib/notifications';

const BPRICES = { half: 15, small: 50, medium: 65, large: 80 };
const RPRICES = { bed_small: 25, bed_medium: 30, bed_large: 35, liv_medium: 15, liv_large: 35, office: 10, kit_small: 45, kit_medium: 55, kit_large: 70, laundry: 10, basement: 75 };
const RNAMES = { bed_small: 'Small Bedroom', bed_medium: 'Medium Bedroom', bed_large: 'Large/Master Bedroom', liv_medium: 'Medium Living Room', liv_large: 'Large Living Room', office: 'Office/Study', kit_small: 'Small Kitchen', kit_medium: 'Medium Kitchen', kit_large: 'Large Kitchen', laundry: 'Laundry Room', basement: 'Basement' };
const BNAMES = { half: 'Half Bath', small: 'Small Full Bath', medium: 'Medium Full Bath', large: 'Large/Master Bath' };

const EXTRAS = [
  { id: 'cabinets', name: 'Inside Cabinets', price: 16 },
  { id: 'pantry', name: 'Inside Pantry', price: 20 },
  { id: 'oven', name: 'Inside Oven', price: 16 },
  { id: 'fridge', name: 'Inside Fridge', price: 16 },
  { id: 'baseboard', name: 'Baseboard Cleaning', price: 5 },
  { id: 'windows', name: 'Window Trim', price: 5 },
];

const FREQS = [
  { val: 'once', label: 'One-Time', tag: 'No discount', pct: 0 },
  { val: 'biweekly', label: 'Bi-Weekly', tag: 'Save 15%', pct: 0.15 },
  { val: 'weekly', label: 'Weekly', tag: 'Save 17.5%', pct: 0.175 },
  { val: 'monthly', label: '2-3x / Month', tag: 'Save 12.5%', pct: 0.125 },
];

const BEDROOMS = [
  { key: 'bed_small', name: 'Small Bedroom', desc: 'Guest room or compact space' },
  { key: 'bed_medium', name: 'Medium Bedroom', desc: 'Standard bedroom with closet' },
  { key: 'bed_large', name: 'Large/Master Bedroom', desc: 'Spacious with en-suite' },
  { key: 'liv_medium', name: 'Medium Living Room', desc: 'Standard family room' },
  { key: 'liv_large', name: 'Large Living Room', desc: 'Open-concept space' },
  { key: 'office', name: 'Office/Study', desc: 'Home office or reading room' },
];

const BATHROOMS = [
  { key: 'half', name: 'Half Bathroom', desc: 'Toilet + sink only' },
  { key: 'small', name: 'Small Full Bathroom', desc: 'Shower or tub' },
  { key: 'medium', name: 'Medium Full Bathroom', desc: 'Standard with tub + shower' },
  { key: 'large', name: 'Large/Master Bathroom', desc: 'Large shower, spacious' },
];

const KITCHEN = [
  { key: 'kit_small', name: 'Small Kitchen', desc: 'Compact kitchenette' },
  { key: 'kit_medium', name: 'Medium Kitchen', desc: 'Standard with dining' },
  { key: 'kit_large', name: 'Large Kitchen', desc: "Open-concept or chef's kitchen" },
  { key: 'laundry', name: 'Laundry Room', desc: 'Washer/dryer area' },
  { key: 'basement', name: 'Basement', desc: 'Finished or unfinished' },
];

const BUILDING_TYPES = ['House', 'Apartment', 'Condo', 'Party Event', 'Office', 'Bank', 'Retail Store'];

const initBaths = () => ({ half: 0, small: 0, medium: 0, large: 0 });
const initRooms = () => ({ bed_small: 0, bed_medium: 0, bed_large: 0, liv_medium: 0, liv_large: 0, office: 0, kit_small: 0, kit_medium: 0, kit_large: 0, laundry: 0, basement: 0 });

export default function BookingWizard({ user, onDone, adminMode = false }) {
  const [step, setStep] = useState(0);
  const [baths, setBaths] = useState(initBaths());
  const [rooms, setRooms] = useState(initRooms());
  const [extras, setExtras] = useState({});
  const [freq, setFreq] = useState('once');
  const [walkthrough, setWalkthrough] = useState(false);
  const [firstTime, setFirstTime] = useState('no');
  const [senior, setSenior] = useState('no');
  const [submitting, setSubmitting] = useState(false);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [availability, setAvailability] = useState([]);

  const [form, setForm] = useState({
    firstName: user?.displayName?.split(' ')[0] || '',
    lastName: user?.displayName?.split(' ').slice(1).join(' ') || '',
    phone: '', email: user?.email || '',
    address: '', date: '', time: '',
    buildingType: '', pets: 'no', otherReqs: '', notes: '', referral: '', access: "I'll be home",
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'availability'), snap => {
      const slots = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      slots.sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
      setAvailability(slots);
    });
    return () => unsub();
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
      if (extras[e.id]) { extTotal += e.price; extraNames.push(e.name); lines.push(e.name); }
    });
    const sub = base + extTotal;
    const discounts = [];
    const fq = FREQS.find(f => f.val === freq);
    if (fq && fq.pct > 0) discounts.push({ k: fq.label + ' discount', pct: fq.pct });
    if (firstTime === 'yes') discounts.push({ k: 'First-Time 10%', pct: 0.10 });
    if (senior === 'yes') discounts.push({ k: 'Senior 10%', pct: 0.10 });
    const discAmt = discounts.reduce((s, d) => s + sub * d.pct, 0);
    const final = Math.max(0, Math.round(sub - discAmt));
    return { final, sub, discounts, lines, extraNames };
  };

  const price = calcPrice();

  const goTo = (s) => {
    if (s === 1 && !form.firstName.trim()) { alert('Please enter your first name.'); return; }
    setStep(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    if (!form.firstName.trim()) { alert('Please enter a name.'); return; }
    setSubmitting(true);
    // Upload photos to Firebase Storage
    let photoUrls = [];
    if (photoFiles.length > 0) {
      setPhotoUploading(true);
      try {
        for (const file of photoFiles) {
          const path = `bookings/${user?.uid || 'admin'}/${Date.now()}_${file.name}`;
          const snap = await uploadBytes(storageRef(storage, path), file);
          photoUrls.push(await getDownloadURL(snap.ref));
        }
      } catch (e) {
        console.warn('Photo upload failed:', e);
      }
      setPhotoUploading(false);
    }
    const bathDesc = Object.keys(baths).filter(k => baths[k] > 0).map(k => baths[k] + ' ' + BNAMES[k]).join(', ') || 'None';
    const roomDesc = Object.keys(rooms).filter(k => rooms[k] > 0).map(k => rooms[k] + ' ' + RNAMES[k]).join(', ') || 'None';
    const req = {
      userId: user?.uid || 'admin-created',
      userEmail: user?.email || form.email,
      name: (form.firstName + ' ' + form.lastName).trim(),
      phone: form.phone || 'N/A',
      email: form.email || user?.email || 'N/A',
      address: form.address || 'N/A',
      buildingType: form.buildingType || 'Not specified',
      date: form.date || 'N/A',
      time: form.time || 'N/A',
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
      createdByAdmin: adminMode,
      photoUrls,
    };
    const docRef = await addDoc(collection(db, 'requests'), req);
    await addDoc(collection(db, 'chats', docRef.id, 'messages'), {
      text: "Hi " + form.firstName + "! Thank you for reaching out to Yoselin's Cleaning Service. I've received your request and will get back to you within 24 hours to confirm your appointment!",
      sender: 'admin', senderName: 'Owner', createdAt: serverTimestamp(),
    });
    //  Remove the booked time slot so no one else can pick it 
    if (form.date && form.time && form.date !== 'N/A' && form.time !== 'N/A') {
      try {
        const slotQuery = query(
          collection(db, 'availability'),
          where('date', '==', form.date),
          where('time', '==', form.time)
        );
        const slotSnap = await getDocs(slotQuery);
        slotSnap.forEach(async (slotDoc) => {
          await deleteDoc(doc(db, 'availability', slotDoc.id));
        });
      } catch (e) {
        // Non-critical  booking still goes through
        console.warn('Could not remove availability slot:', e);
      }
    }
    // Email admin about new booking (if EmailJS is configured)
    notifyNewBooking({
      clientName: req.name,
      clientEmail: req.email,
      date: req.date,
      address: req.address,
      estimate: req.estimate,
    }).catch(() => {});
    setSubmitting(false);
    if (onDone) onDone(docRef.id);
  };

  const removePhoto = (i) => setPhotoFiles(prev => prev.filter((_, j) => j !== i));

  const stepLabels = ['Contact', 'Rooms', 'Add-Ons', 'Frequency', 'Review'];

  const QCtrl = ({ val, onInc, onDec }) => (
    <div className="qctrl">
      <button className="qbtn" type="button" onClick={onDec}>-</button>
      <span className="qdis">{val}</span>
      <button className="qbtn" type="button" onClick={onInc}>+</button>
    </div>
  );

  const availDates = [...new Set(availability.map(s => s.date))];
  const timesForDate = availability.filter(s => s.date === form.date).map(s => s.time);

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
              <div className="dot-circle">{i < step ? 'v' : i + 1}</div>
              <div className="dot-label">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="wizard-body">

        {/* STEP 0: CONTACT */}
        {step === 0 && (
          <div>
            <div className="page-title">{adminMode ? 'Client Information' : 'Your Information'}</div>
            <div className="page-sub">Tell us who you are and how to reach you</div>
            <div className="wcard">
              <div className="card-body">
                <div className="row2">
                  <div className="fg">
                    <label>First Name</label>
                    <input type="text" value={form.firstName} onChange={e => setF('firstName', e.target.value)} placeholder="e.g. Maria" />
                  </div>
                  <div className="fg">
                    <label>Last Name</label>
                    <input type="text" value={form.lastName} onChange={e => setF('lastName', e.target.value)} placeholder="e.g. Rodriguez" />
                  </div>
                </div>
                <div className="row2">
                  <div className="fg">
                    <label>Phone Number</label>
                    <input type="tel" value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="(555) 000-0000" />
                  </div>
                  <div className="fg">
                    <label>Email</label>
                    <input type="email" value={form.email} onChange={e => setF('email', e.target.value)} placeholder="your@email.com" />
                  </div>
                </div>
                <div className="row2">
                  <div className="fg">
                    <label>Service Address</label>
                    <input type="text" value={form.address} onChange={e => setF('address', e.target.value)} placeholder="Street address, City, ZIP" />
                  </div>
                  <div className="fg">
                    <label>Building Type</label>
                    <select value={form.buildingType} onChange={e => setF('buildingType', e.target.value)}>
                      <option value="">Select building type</option>
                      {BUILDING_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}
                    </select>
                  </div>
                </div>
                <div className="row2">
                  <div className="fg">
                    <label>Preferred Date</label>
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
            <div className="nav-btns">
              <button className="btn-next" onClick={() => goTo(1)}>Next: Rooms</button>
            </div>
          </div>
        )}

        {/* STEP 1: ROOMS */}
        {step === 1 && (
          <div>
            <div className="page-title">Rooms</div>
            <div className="page-sub">Select room types and quantities</div>

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

        {/* STEP 2: ADD-ONS */}
        {step === 2 && (
          <div>
            <div className="page-title">Add-On Services</div>
            <div className="page-sub">Select any extras (all optional)</div>
            <div className="wcard">
              <div className="card-body">
                <div className="extras-grid">
                  {EXTRAS.map(e => (
                    <div key={e.id}
                      className={'eitem ' + (extras[e.id] ? 'selected' : '')}
                      onClick={() => setExtras(x => ({ ...x, [e.id]: !x[e.id] }))}
                    >
                      <input type="checkbox" readOnly checked={!!extras[e.id]}
                        style={{ width: '17px', height: '17px', accentColor: 'var(--pink-deep)', flexShrink: 0, marginTop: '2px' }}
                      />
                      <div className="ename">{e.name}</div>
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

        {/* STEP 3: FREQUENCY */}
        {step === 3 && (
          <div>
            <div className="page-title">Frequency and Discounts</div>
            <div className="page-sub">More frequent = more savings!</div>
            <div className="wcard">
              <div className="card-body">
                <label style={{ display: 'block', fontWeight: '700', fontSize: '.82rem', color: '#111827', marginBottom: '12px' }}>
                  Cleaning Frequency
                </label>
                <div className="fpills" style={{ marginBottom: '18px' }}>
                  {FREQS.map(fq => (
                    <div key={fq.val} className={'fpill ' + (freq === fq.val ? 'active' : '')} onClick={() => setFreq(fq.val)}>
                      {fq.label}
                      <span className="ftag">{fq.tag}</span>
                    </div>
                  ))}
                </div>
                <div className="divider"></div>
                <div className="row2">
                  <div className="fg">
                    <label>First time with us?</label>
                    <select value={firstTime} onChange={e => setFirstTime(e.target.value)}>
                      <option value="no">No, returning client</option>
                      <option value="yes">Yes - First time, 10% off</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label>Senior discount?</label>
                    <select value={senior} onChange={e => setSenior(e.target.value)}>
                      <option value="no">No</option>
                      <option value="yes">Yes - 10% senior discount</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className={'wt-toggle ' + (walkthrough ? 'active' : '')} onClick={() => setWalkthrough(w => !w)}>
              <div className="wt-info">
                <div className="wt-title">Request a Walk-Through</div>
                <div className="wt-desc">We'll visit before cleaning to give an exact quote</div>
              </div>
              <div className="wt-check">{walkthrough ? 'v' : ''}</div>
            </div>
            <div className="nav-btns" style={{ marginTop: '18px' }}>
              <button className="btn-back" onClick={() => goTo(2)}>Back</button>
              <button className="btn-next" onClick={() => goTo(4)}>Next: Review</button>
            </div>
          </div>
        )}

        {/* STEP 4: REVIEW */}
        {step === 4 && (
          <div>
            <div className="page-title">Review and Submit</div>
            <div className="page-sub">Add notes and submit</div>

            {/*  Photo Upload  */}
            <div className="wcard">
              <div className="card-header">
                <div className="card-icon"></div>
                <div>
                  <div className="card-title">Photos <span className="opt" style={{fontFamily:'DM Sans,sans-serif',fontWeight:400,fontSize:'.78rem',color:'#6b7280'}}>(optional)</span></div>
                  <div className="card-sub">Upload photos of your space to help us prepare</div>
                </div>
              </div>
              <div className="card-body">
                <label className="photo-upload-area" htmlFor="bw-photo-input" style={{cursor:'pointer'}}>
                  <div className="pua-icon"></div>
                  <div className="pua-text">Tap to add photos</div>
                  <div className="pua-sub">Up to 5 images  JPG or PNG</div>
                  <input
                    id="bw-photo-input"
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={e => {
                      const files = Array.from(e.target.files).slice(0, 5);
                      setPhotoFiles(files);
                    }}
                  />
                </label>
                {photoFiles.length > 0 && (
                  <div className="photo-preview-row">
                    {photoFiles.map((f, i) => (
                      <div key={i} className="photo-thumb">
                        <img src={URL.createObjectURL(f)} alt={`photo ${i + 1}`} />
                        <button type="button" className="photo-remove" onClick={() => removePhoto(i)}></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

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

            <div className="pbar">
              <div className="pbar-top">
                <div>
                  <div className="plabel">YOUR ESTIMATE</div>
                  <div className="pamount">${price.final}</div>
                  <div className="prange">
                    {price.final > 0
                      ? 'Est. range: $' + Math.round(price.final * .95) + ' - $' + Math.round(price.final * 1.1)
                      : 'Select rooms to calculate'}
                  </div>
                </div>
                <div>
                  <div className="plabel">DISCOUNTS</div>
                  <div className="disc-badges">
                    {price.discounts.length
                      ? price.discounts.map(d => <span key={d.k} className="dbadge">{d.k}</span>)
                      : <span style={{ fontSize: '.74rem', color: '#9ca3af' }}>None</span>
                    }
                  </div>
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
                {photoUploading ? 'Uploading photos...' : submitting ? 'Submitting...' : "Submit Request - $" + price.final}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


