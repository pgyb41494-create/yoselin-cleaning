'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isAdmin } from '../../lib/firebase';

// ─── Pricing ───────────────────────────────────────────
const bPrices = { half:15, small:50, medium:65, large:80 };
const rPrices  = { bed_small:25, bed_medium:30, bed_large:35, liv_medium:15, liv_large:35, office:10, kit_small:45, kit_medium:55, kit_large:70, laundry:10, basement:75 };
const bathLabels = { half:'Half Bath', small:'Small Bath', medium:'Medium Bath', large:'Large Bath' };
const roomLabels = { bed_small:'Small Bedroom', bed_medium:'Medium Bedroom', bed_large:'Large Bedroom', liv_medium:'Medium Living', liv_large:'Large Living', office:'Office', kit_small:'Small Kitchen', kit_medium:'Medium Kitchen', kit_large:'Large Kitchen', laundry:'Laundry Room', basement:'Basement' };
const ADDONS = [
  { id:'cabinets',   price:16, label:'🗄️ Inside Cabinets' },
  { id:'pantry',     price:20, label:'🥫 Inside Pantry' },
  { id:'oven',       price:16, label:'🔥 Inside Oven' },
  { id:'fridge',     price:16, label:'❄️ Inside Fridge' },
  { id:'baseboards', price:5,  label:'🧹 Baseboard Cleaning' },
];

// ─── Shared style helpers ──────────────────────────────
const cardStyle = { background:'white', borderRadius:'18px', border:'1.5px solid #e2e8f0', marginBottom:'18px', overflow:'hidden', boxShadow:'0 2px 10px rgba(0,0,0,.04)' };
const sectionHead = (icon, title, sub) => (
  <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'14px 20px', borderBottom:'1.5px solid #e2e8f0', background:'linear-gradient(135deg,#e8f2ff,#fce4f3)' }}>
    <div style={{ width:34, height:34, borderRadius:9, background:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.05rem', boxShadow:'0 2px 5px rgba(0,0,0,.08)' }}>{icon}</div>
    <div>
      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'.98rem', fontWeight:700, color:'#111827' }}>{title}</div>
      {sub && <div style={{ fontSize:'.72rem', color:'#4b5563', marginTop:1 }}>{sub}</div>}
    </div>
  </div>
);

function QRow({ label, desc, value, onDec, onInc }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 0', borderBottom:'1px solid #e2e8f0', gap:10 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:'.86rem', fontWeight:700, color:'#111827' }}>{label}</div>
        {desc && <div style={{ fontSize:'.72rem', color:'#4b5563', marginTop:2 }}>{desc}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:9 }}>
        {['−','＋'].map((sym,i) => (
          <button key={sym} onClick={i===0?onDec:onInc}
            style={{ width:30, height:30, borderRadius:8, border:'1.5px solid #e2e8f0', background:'white', fontSize:'1.1rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:'#1a6fd4' }}>
            {sym}
          </button>
        ))}
        <span style={{ fontSize:'1rem', fontWeight:700, minWidth:20, textAlign:'center', color:'#111827' }}>{value}</span>
      </div>
    </div>
  );
}

function NavBtns({ onBack, onNext, nextLabel='Next →' }) {
  return (
    <div style={{ display:'flex', gap:12, marginTop:6 }}>
      {onBack && <button onClick={onBack} style={{ flex:1, maxWidth:140, padding:14, background:'white', color:'#111827', border:'2px solid #e2e8f0', borderRadius:14, fontFamily:"'DM Sans',sans-serif", fontSize:'.95rem', fontWeight:700, cursor:'pointer' }}>← Back</button>}
      <button onClick={onNext} style={{ flex:1, padding:14, background:'linear-gradient(135deg,#1a6fd4,#db2777)', color:'white', border:'none', borderRadius:14, fontFamily:"'DM Sans',sans-serif", fontSize:'.95rem', fontWeight:700, cursor:'pointer', boxShadow:'0 4px 18px rgba(26,111,212,.2)' }}>{nextLabel}</button>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────
export default function BookingPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Form state
  const [info, setInfo] = useState({ firstName:'', lastName:'', phone:'', email:'', address:'', date:'', time:'' });
  const [baths, setBaths] = useState({ half:0, small:0, medium:0, large:0 });
  const [rooms, setRooms] = useState({ bed_small:0, bed_medium:0, bed_large:0, liv_medium:0, liv_large:0, office:0, kit_small:0, kit_medium:0, kit_large:0, laundry:0, basement:0 });
  const [addons, setAddons] = useState({});
  const [windowCount, setWindowCount] = useState(0);
  const [pets, setPets] = useState('no');
  const [otherReqs, setOtherReqs] = useState('');
  const [freq, setFreq] = useState('once');
  const [firstTime, setFirstTime] = useState('no');
  const [senior, setSenior] = useState('no');
  const [walkthrough, setWalkthrough] = useState(false);
  const [notes, setNotes] = useState('');
  const [referral, setReferral] = useState('');
  const [access, setAccess] = useState("I'll be home");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) { router.replace('/'); return; }
      if (isAdmin(u)) { router.replace('/admin'); return; }
      setUser(u);
      setInfo(prev => ({ ...prev, email: u.email || '', firstName: u.displayName?.split(' ')[0] || '', lastName: u.displayName?.split(' ').slice(1).join(' ') || '' }));
    });
    return () => unsub();
  }, [router]);

  // ─── Price calculation ─────────────────────────────
  function calcPrice() {
    let base = 0;
    Object.entries(baths).forEach(([k,v]) => { if(v>0) base += v*bPrices[k]; });
    Object.entries(rooms).forEach(([k,v]) => { if(v>0) base += v*rPrices[k]; });
    let extra = 0;
    Object.entries(addons).forEach(([k,v]) => { if(v){ const a=ADDONS.find(a=>a.id===k); if(a) extra+=a.price; } });
    if(windowCount>0) extra += windowCount*5;
    const sub = base + extra;
    const discMap = { biweekly:0.15, weekly:0.175, monthly:0.125, once:0 };
    let disc = sub * (discMap[freq]||0);
    if(firstTime==='yes') disc += sub*0.10;
    if(senior==='yes') disc += sub*0.10;
    return Math.max(0, Math.round(sub - disc));
  }

  function addonLines() {
    const lines = [];
    Object.entries(addons).forEach(([k,v]) => { if(v){ const a=ADDONS.find(a=>a.id===k); if(a) lines.push(a.label.replace(/^[^\s]+\s/,'').trim()); } });
    if(windowCount>0) lines.push(`Window Trim ×${windowCount}`);
    return lines.join(', ') || 'None';
  }

  // ─── Submit ───────────────────────────────────────
  async function submit() {
    if (!user) return;
    setSubmitting(true);
    const final = calcPrice();
    const bathDesc = Object.entries(baths).filter(([,v])=>v>0).map(([k,v])=>`${v} ${bathLabels[k]}`).join(', ') || 'None';
    const roomDesc = Object.entries(rooms).filter(([,v])=>v>0).map(([k,v])=>`${v} ${roomLabels[k]}`).join(', ') || 'None';
    const req = {
      uid: user.uid, email: user.email,
      name: `${info.firstName} ${info.lastName}`.trim(),
      phone: info.phone || 'N/A', address: info.address || 'N/A',
      date: info.date || 'N/A', time: info.time || 'N/A',
      bathrooms: bathDesc, rooms: roomDesc,
      addons: addonLines(), pets, otherRequests: otherReqs || 'None',
      walkthrough: walkthrough ? 'Yes' : 'No', frequency: freq,
      firstTime, senior, notes: notes || '',
      referral: referral || 'N/A', access,
      estimate: final, status: 'new',
      submittedAt: new Date().toLocaleString(),
      createdAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, 'requests'), req);
    // Send welcome chat message
    await addDoc(collection(db, 'chats', docRef.id, 'messages'), {
      text: `Hi ${info.firstName || 'there'}! 👋 Thank you for reaching out to Yoselin's Cleaning Service. I've received your request and will get back to you within 24 hours to confirm your appointment!`,
      sender: 'admin', senderName: 'Yoselin',
      createdAt: serverTimestamp(),
    });
    setSubmitting(false);
    setDone(true);
  }

  const final = calcPrice();

  if (!user) return null;

  const input = (id, label, type='text', placeholder='', required=false) => (
    <div style={{ marginBottom:13 }}>
      <label style={{ display:'block', fontSize:'.82rem', fontWeight:700, color:'#111827', marginBottom:6 }}>{label}{!required&&<span style={{ fontWeight:400, color:'#6b7280', fontSize:'.74rem' }}> (optional)</span>}</label>
      <input type={type} value={info[id]||''} placeholder={placeholder} onChange={e=>setInfo({...info,[id]:e.target.value})}
        style={{ width:'100%', padding:'10px 13px', border:'1.5px solid #e2e8f0', borderRadius:10, fontFamily:"'DM Sans',sans-serif", fontSize:'.87rem', color:'#111827', background:'#f8f9ff', outline:'none' }} />
    </div>
  );

  // ─── Step views ───────────────────────────────────
  const steps = [
    // 0: Contact
    <div key={0}>
      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.5rem', fontWeight:900, marginBottom:4 }}>👤 Your Information</div>
      <div style={{ fontSize:'.85rem', color:'#4b5563', marginBottom:22 }}>Tell us who you are and how to reach you</div>
      <div style={cardStyle}><div style={{ padding:'18px 20px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:13, marginBottom:0 }}>
          <div>{input('firstName','First Name','text','Maria',true)}</div>
          <div>{input('lastName','Last Name','text','Rodriguez')}</div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:13 }}>
          <div>{input('phone','Phone Number','tel','(555) 000-0000')}</div>
          <div>
            <label style={{ display:'block', fontSize:'.82rem', fontWeight:700, color:'#111827', marginBottom:6 }}>Email</label>
            <input type="email" value={info.email} readOnly
              style={{ width:'100%', padding:'10px 13px', border:'1.5px solid #e2e8f0', borderRadius:10, fontFamily:"'DM Sans',sans-serif", fontSize:'.87rem', color:'#6b7280', background:'#f3f4f6', outline:'none' }} />
          </div>
        </div>
        {input('address','Service Address','text','Street address, City, ZIP')}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:13 }}>
          <div>{input('date','Preferred Date','text','e.g. Monday, March 10')}</div>
          <div>
            <label style={{ display:'block', fontSize:'.82rem', fontWeight:700, color:'#111827', marginBottom:6 }}>Preferred Time</label>
            <select value={info.time} onChange={e=>setInfo({...info,time:e.target.value})} style={{ width:'100%', padding:'10px 13px', border:'1.5px solid #e2e8f0', borderRadius:10, fontFamily:"'DM Sans',sans-serif", fontSize:'.87rem', color:'#111827', background:'#f8f9ff', outline:'none' }}>
              <option value="">Select a time</option>
              {['Morning (8am–12pm)','Afternoon (12pm–4pm)','Evening (4pm–7pm)','Flexible'].map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div></div>
      <NavBtns onNext={()=>{ if(!info.firstName.trim()){alert('Please enter your first name.');return;} setStep(1); }} nextLabel="Next: Rooms →" />
    </div>,

    // 1: Rooms
    <div key={1}>
      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.5rem', fontWeight:900, marginBottom:4 }}>🏠 Rooms</div>
      <div style={{ fontSize:'.85rem', color:'#4b5563', marginBottom:22 }}>Tell us about the rooms in your home</div>
      <div style={cardStyle}>
        {sectionHead('🛏️','Bedrooms & Living Spaces')}
        <div style={{ padding:'0 20px' }}>
          {[['bed_small','🛏️ Small Bedroom','Guest room, kids room'],['bed_medium','🛏️ Medium Bedroom','Standard bedroom with closet'],['bed_large','🌟 Large / Master Bedroom','Spacious primary bedroom'],['liv_medium','🛋️ Medium Living Room','Standard family room or den'],['liv_large','🛋️ Large Living Room','Open-concept or spacious'],['office','💼 Office / Study','Home office or reading room']].map(([k,l,d])=>(
            <QRow key={k} label={l} desc={d} value={rooms[k]} onDec={()=>setRooms({...rooms,[k]:Math.max(0,rooms[k]-1)})} onInc={()=>setRooms({...rooms,[k]:rooms[k]+1})} />
          ))}
        </div>
      </div>
      <div style={cardStyle}>
        {sectionHead('🛁','Bathrooms')}
        <div style={{ padding:'0 20px' }}>
          {[['half','🚽 Half Bathroom','Toilet + sink only'],['small','🚿 Small Full Bathroom','Shower or tub, smaller space'],['medium','🛁 Medium Full Bathroom','Standard size with tub + shower'],['large','🌟 Large / Master Bathroom','Large shower, spacious layout']].map(([k,l,d])=>(
            <QRow key={k} label={l} desc={d} value={baths[k]} onDec={()=>setBaths({...baths,[k]:Math.max(0,baths[k]-1)})} onInc={()=>setBaths({...baths,[k]:baths[k]+1})} />
          ))}
        </div>
      </div>
      <div style={cardStyle}>
        {sectionHead('🍳','Kitchen & Utility')}
        <div style={{ padding:'0 20px' }}>
          {[['kit_small','🍳 Small Kitchen','Compact kitchen or kitchenette'],['kit_medium','🍳 Medium Kitchen','Standard kitchen with dining area'],['kit_large','🍳 Large Kitchen','Open-concept or chef\'s kitchen'],['laundry','🧺 Laundry Room','Washer/dryer area'],['basement','🏚️ Basement','Finished or unfinished basement']].map(([k,l,d])=>(
            <QRow key={k} label={l} desc={d} value={rooms[k]} onDec={()=>setRooms({...rooms,[k]:Math.max(0,rooms[k]-1)})} onInc={()=>setRooms({...rooms,[k]:rooms[k]+1})} />
          ))}
        </div>
      </div>
      <NavBtns onBack={()=>setStep(0)} onNext={()=>setStep(2)} nextLabel="Next: Add-Ons →" />
    </div>,

    // 2: Add-Ons
    <div key={2}>
      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.5rem', fontWeight:900, marginBottom:4 }}>✨ Add-On Services</div>
      <div style={{ fontSize:'.85rem', color:'#4b5563', marginBottom:22 }}>Select any extras you'd like included (all optional)</div>
      <div style={cardStyle}><div style={{ padding:'18px 20px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10 }}>
          {ADDONS.map(a=>(
            <label key={a.id} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:13, border:`1.5px solid ${addons[a.id]?'#db2777':'#e2e8f0'}`, borderRadius:12, cursor:'pointer', background: addons[a.id]?'#fce4f3':'#f8f9ff', transition:'all .15s' }}>
              <input type="checkbox" checked={!!addons[a.id]} onChange={e=>setAddons({...addons,[a.id]:e.target.checked})} style={{ width:17, height:17, accentColor:'#db2777', flexShrink:0, marginTop:2 }} />
              <span style={{ fontSize:'.83rem', fontWeight:700, color:'#111827' }}>{a.label}</span>
            </label>
          ))}
          {/* Window trim with counter */}
          <label style={{ display:'flex', alignItems:'flex-start', gap:10, padding:13, border:`1.5px solid ${windowCount>0?'#db2777':'#e2e8f0'}`, borderRadius:12, cursor:'pointer', background: windowCount>0?'#fce4f3':'#f8f9ff' }}>
            <input type="checkbox" checked={windowCount>0} onChange={e=>setWindowCount(e.target.checked?1:0)} style={{ width:17, height:17, accentColor:'#db2777', flexShrink:0, marginTop:2 }} />
            <div>
              <span style={{ fontSize:'.83rem', fontWeight:700, color:'#111827' }}>🪟 Window Trim</span>
              {windowCount>0&&(
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
                  <button onClick={e=>{e.preventDefault();setWindowCount(Math.max(1,windowCount-1));}} style={{ width:26, height:26, borderRadius:6, border:'1.5px solid #e2e8f0', background:'white', cursor:'pointer', fontWeight:700, color:'#1a6fd4' }}>−</button>
                  <span style={{ fontSize:'.9rem', fontWeight:700 }}>{windowCount}</span>
                  <button onClick={e=>{e.preventDefault();setWindowCount(windowCount+1);}} style={{ width:26, height:26, borderRadius:6, border:'1.5px solid #e2e8f0', background:'white', cursor:'pointer', fontWeight:700, color:'#1a6fd4' }}>+</button>
                </div>
              )}
            </div>
          </label>
        </div>
        <div style={{ height:1, background:'#e2e8f0', margin:'14px 0' }} />
        <div style={{ marginBottom:13 }}>
          <label style={{ display:'block', fontSize:'.82rem', fontWeight:700, color:'#111827', marginBottom:6 }}>🐾 Any Pets?</label>
          <select value={pets} onChange={e=>setPets(e.target.value)} style={{ width:'100%', padding:'10px 13px', border:'1.5px solid #e2e8f0', borderRadius:10, fontFamily:"'DM Sans',sans-serif", fontSize:'.87rem', color:'#111827', background:'#f8f9ff', outline:'none' }}>
            <option value="no">No</option><option value="yes">Yes</option>
          </select>
        </div>
        <div>
          <label style={{ display:'block', fontSize:'.82rem', fontWeight:700, color:'#111827', marginBottom:6 }}>Other Requests <span style={{ fontWeight:400, color:'#6b7280', fontSize:'.74rem' }}>(optional)</span></label>
          <input type="text" value={otherReqs} onChange={e=>setOtherReqs(e.target.value)} placeholder="e.g. Deep clean behind appliances..." style={{ width:'100%', padding:'10px 13px', border:'1.5px solid #e2e8f0', borderRadius:10, fontFamily:"'DM Sans',sans-serif", fontSize:'.87rem', color:'#111827', background:'#f8f9ff', outline:'none' }} />
        </div>
      </div></div>
      <NavBtns onBack={()=>setStep(1)} onNext={()=>setStep(3)} nextLabel="Next: Frequency →" />
    </div>,

    // 3: Frequency
    <div key={3}>
      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.5rem', fontWeight:900, marginBottom:4 }}>📅 Frequency & Discounts</div>
      <div style={{ fontSize:'.85rem', color:'#4b5563', marginBottom:22 }}>How often would you like us to clean?</div>
      <div style={cardStyle}><div style={{ padding:'18px 20px' }}>
        <label style={{ display:'block', fontSize:'.82rem', fontWeight:700, color:'#111827', marginBottom:12 }}>Cleaning Frequency</label>
        <div style={{ display:'flex', flexWrap:'wrap', gap:9, marginBottom:18 }}>
          {[['once','One-Time','No discount'],['biweekly','Bi-Weekly','Save 15%'],['weekly','Weekly','Save 15–20%'],['monthly','2–3× / Month','Save 10–15%']].map(([v,l,tag])=>(
            <div key={v} onClick={()=>setFreq(v)} style={{ padding:'11px 17px', border:`2px solid ${freq===v?'#0d0d0d':'#e2e8f0'}`, borderRadius:99, fontSize:'.82rem', fontWeight:700, cursor:'pointer', color: freq===v?'white':'#4b5563', background: freq===v?'#0d0d0d':'transparent', transition:'all .15s' }}>
              {l}<span style={{ display:'block', fontSize:'.68rem', marginTop:3, color: freq===v?'rgba(255,255,255,.7)':'#f472b6', fontWeight:600 }}>{tag}</span>
            </div>
          ))}
        </div>
        <div style={{ height:1, background:'#e2e8f0', margin:'14px 0' }} />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:13 }}>
          <div>
            <label style={{ display:'block', fontSize:'.82rem', fontWeight:700, color:'#111827', marginBottom:6 }}>First time with us?</label>
            <select value={firstTime} onChange={e=>setFirstTime(e.target.value)} style={{ width:'100%', padding:'10px 13px', border:'1.5px solid #e2e8f0', borderRadius:10, fontFamily:"'DM Sans',sans-serif", fontSize:'.87rem', color:'#111827', background:'#f8f9ff', outline:'none' }}>
              <option value="no">No, returning client</option><option value="yes">Yes! First time — 10% off</option>
            </select>
          </div>
          <div>
            <label style={{ display:'block', fontSize:'.82rem', fontWeight:700, color:'#111827', marginBottom:6 }}>Senior discount?</label>
            <select value={senior} onChange={e=>setSenior(e.target.value)} style={{ width:'100%', padding:'10px 13px', border:'1.5px solid #e2e8f0', borderRadius:10, fontFamily:"'DM Sans',sans-serif", fontSize:'.87rem', color:'#111827', background:'#f8f9ff', outline:'none' }}>
              <option value="no">No</option><option value="yes">Yes — 10% senior discount</option>
            </select>
          </div>
        </div>
      </div></div>
      <div onClick={()=>setWalkthrough(!walkthrough)} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 18px', background: walkthrough?'#e8f2ff':'#f8f9ff', border:`1.5px solid ${walkthrough?'#1a6fd4':'#e2e8f0'}`, borderRadius:12, marginTop:14, cursor:'pointer' }}>
        <div style={{ fontSize:'1.3rem' }}>🏠</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:'.84rem', fontWeight:700, color:'#111827' }}>Request a Walk-Through</div>
          <div style={{ fontSize:'.72rem', color:'#4b5563', marginTop:2 }}>We'll visit before cleaning to give an exact quote</div>
        </div>
        <div style={{ width:20, height:20, borderRadius:6, border:`2px solid ${walkthrough?'#1a6fd4':'#e2e8f0'}`, background: walkthrough?'#1a6fd4':'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.75rem', color:'white' }}>{walkthrough?'✓':''}</div>
      </div>
      <NavBtns onBack={()=>setStep(2)} onNext={()=>setStep(4)} nextLabel="Next: Review →" />
    </div>,

    // 4: Review & Submit
    <div key={4}>
      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.5rem', fontWeight:900, marginBottom:4 }}>📋 Review & Submit</div>
      <div style={{ fontSize:'.85rem', color:'#4b5563', marginBottom:22 }}>Almost done — add any notes and submit</div>
      <div style={cardStyle}><div style={{ padding:'18px 20px' }}>
        <div style={{ marginBottom:13 }}>
          <label style={{ display:'block', fontSize:'.82rem', fontWeight:700, color:'#111827', marginBottom:6 }}>Notes <span style={{ fontWeight:400, color:'#6b7280', fontSize:'.74rem' }}>(optional)</span></label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Focus on kitchen, allergic to certain products..." style={{ width:'100%', padding:'10px 13px', border:'1.5px solid #e2e8f0', borderRadius:10, fontFamily:"'DM Sans',sans-serif", fontSize:'.87rem', color:'#111827', background:'#f8f9ff', outline:'none', resize:'vertical', minHeight:70 }} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:13 }}>
          <div>
            <label style={{ display:'block', fontSize:'.82rem', fontWeight:700, color:'#111827', marginBottom:6 }}>How did you hear about us?</label>
            <select value={referral} onChange={e=>setReferral(e.target.value)} style={{ width:'100%', padding:'10px 13px', border:'1.5px solid #e2e8f0', borderRadius:10, fontFamily:"'DM Sans',sans-serif", fontSize:'.87rem', color:'#111827', background:'#f8f9ff', outline:'none' }}>
              <option value="">Select one</option>
              {['Google / Search Engine','Instagram / Facebook','Friend or Family Referral','Nextdoor','Flyer / Advertisement','Other'].map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display:'block', fontSize:'.82rem', fontWeight:700, color:'#111827', marginBottom:6 }}>Home Access</label>
            <select value={access} onChange={e=>setAccess(e.target.value)} style={{ width:'100%', padding:'10px 13px', border:'1.5px solid #e2e8f0', borderRadius:10, fontFamily:"'DM Sans',sans-serif", fontSize:'.87rem', color:'#111827', background:'#f8f9ff', outline:'none' }}>
              {["I'll be home","Lockbox / Key left out","Garage code","Other arrangement"].map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </div></div>

      {/* Price bar */}
      <div style={{ background:'#0d0d0d', borderRadius:18, padding:'20px 22px', marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:14, marginBottom:14, paddingBottom:14, borderBottom:'1px solid rgba(255,255,255,.1)' }}>
          <div>
            <div style={{ fontSize:'.74rem', color:'#9ca3af', marginBottom:4, fontWeight:600 }}>YOUR ESTIMATE</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2.6rem', fontWeight:900, background:'linear-gradient(135deg,#f472b6,#4a9eff)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', lineHeight:1 }}>${final}</div>
            <div style={{ fontSize:'.72rem', color:'#9ca3af', marginTop:4 }}>Est. range: ${Math.round(final*.95)} – ${Math.round(final*1.1)}</div>
          </div>
        </div>
        <div style={{ fontSize:'.69rem', color:'#9ca3af', textAlign:'center' }}>💡 Estimate based on your selections. Final price confirmed after walkthrough.</div>
      </div>

      <NavBtns onBack={()=>setStep(3)} onNext={submit} nextLabel={submitting ? 'Submitting...' : `✨ Submit Request — $${final}`} />
    </div>,
  ];

  // ─── Done overlay ──────────────────────────────────
  if (done) {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div style={{ background:'white', borderRadius:22, padding:'40px 28px', textAlign:'center', maxWidth:380, width:'100%' }}>
          <div style={{ fontSize:'2.8rem' }}>🎉</div>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.5rem', margin:'12px 0 8px', color:'#0d0d0d' }}>Request Sent!</h2>
          <p style={{ color:'#4b5563', fontSize:'.85rem', lineHeight:1.6 }}><strong>Yoselin will contact you within 24 hours</strong> to confirm your appointment.</p>
          <p style={{ fontSize:'.82rem', color:'#4b5563', background:'#f3f4f6', borderRadius:10, padding:12, marginTop:12 }}>💬 You can chat with Yoselin from your dashboard!</p>
          <button onClick={()=>router.push('/dashboard')} style={{ marginTop:20, padding:'12px 32px', background:'#0d0d0d', color:'white', border:'none', borderRadius:99, fontFamily:"'DM Sans',sans-serif", fontWeight:600, cursor:'pointer', fontSize:'.86rem' }}>Go to My Dashboard →</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', background:'#f8f9ff' }}>
      {/* Header */}
      <div style={{ background:'#0d0d0d', height:5, background:'linear-gradient(90deg,#f472b6,#4a9eff,#db2777,#1a6fd4)', backgroundSize:'300% 100%' }} />
      <header style={{ background:'#0d0d0d', padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontFamily:"'Playfair Display',serif", color:'white', fontSize:'1.1rem', fontWeight:700 }}>Yoselin's <span style={{ color:'#f472b6' }}>Cleaning</span></div>
        <button onClick={()=>router.push('/dashboard')} style={{ background:'#222', border:'1px solid #444', color:'#c0c4cc', padding:'7px 13px', borderRadius:8, fontFamily:"'DM Sans',sans-serif", fontSize:'.75rem', cursor:'pointer' }}>← My Dashboard</button>
      </header>

      {/* Step indicators */}
      <div style={{ background:'white', borderBottom:'1.5px solid #e2e8f0', padding:'16px 20px' }}>
        <div style={{ maxWidth:800, margin:'0 auto', display:'flex', alignItems:'center' }}>
          {['Contact','Rooms','Add-Ons','Frequency','Review'].map((label,i)=>(
            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', position:'relative' }}>
              {i<4&&<div style={{ position:'absolute', top:14, left:'calc(50% + 14px)', right:'calc(-50% + 14px)', height:2, background: i<step?'#1a6fd4':'#e2e8f0', zIndex:0 }} />}
              <div style={{ width:28, height:28, borderRadius:'50%', border:`2px solid ${i<=step?'#1a6fd4':'#e2e8f0'}`, background: i<step?'#1a6fd4':i===step?'#1a6fd4':'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.72rem', fontWeight:700, color: i<=step?'white':'#4b5563', position:'relative', zIndex:1, transition:'all .3s' }}>{i<step?'✓':i+1}</div>
              <div style={{ fontSize:'.65rem', fontWeight:700, color: i<=step?'#1a6fd4':'#4b5563', marginTop:5 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:800, margin:'0 auto', padding:'24px 14px 60px' }}>
        {steps[step]}
      </div>
    </div>
  );
}
