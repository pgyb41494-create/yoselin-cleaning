'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, addDoc, onSnapshot, serverTimestamp, query, where, getDocs, deleteDoc, doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { notifyNewBooking } from '../lib/notifications';
import { SERVICE_TYPES, CLEANING_LEVELS, PROJECT_SCOPES, isCleaningService, getServiceById } from '../lib/services';

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
const HOLD_COLLECTION = 'availabilityHolds';
const HOLD_MINUTES = 15;
const HOLD_MS = HOLD_MINUTES * 60 * 1000;
function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function formatDateKey(d) { return MONTH_NAMES[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); }
function slotHoldId(date, time) { return date + '__' + time; }
function holdIsActive(hold, nowMs = Date.now()) {
  const expiresAt = hold?.expiresAt?.toDate?.();
  return !!expiresAt && expiresAt.getTime() > nowMs;
}

export default function BookingWizard({ user, onDone, adminMode = false }) {
  const [step,         setStep]         = useState(0);
  const [serviceType,  setServiceType]  = useState('house_cleaning');
  const [simpleBeds,   setSimpleBeds]   = useState(2);
  const [simpleBaths,  setSimpleBaths]  = useState(1);
  const [cleaningLevel,setCleaningLevel]= useState('standard');
  const [projectScope, setProjectScope] = useState('medium');
  const [projectDetails,setProjectDetails]= useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
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
  const [reservationHolds, setReservationHolds] = useState([]);
  const [holdBusy,     setHoldBusy]     = useState(false);
  const [holdError,    setHoldError]    = useState('');
  const [clockTick,    setClockTick]    = useState(Date.now());
  const [heldSlotKey,  setHeldSlotKey]  = useState('');
  const [livePrices,   setLivePrices]   = useState(null);
  const currentHoldKeyRef = useRef('');
  const pendingHoldKeyRef = useRef('');

  // Calendar state
  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calYear,  setCalYear]  = useState(now.getFullYear());

  const addressInputRef = useRef(null);
  const autocompleteRef = useRef(null);

  const holdToken = useState(() => {
    const fallbackToken = (user?.uid || 'guest') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    try {
      if (typeof window === 'undefined') return fallbackToken;
      const storedToken = window.sessionStorage.getItem('bookingHoldToken');
      if (storedToken) return storedToken;
      window.sessionStorage.setItem('bookingHoldToken', fallbackToken);
      return fallbackToken;
    } catch {
      return fallbackToken;
    }
  })[0];

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
    const unsub = onSnapshot(collection(db, HOLD_COLLECTION), snap => {
      setReservationHolds(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setClockTick(Date.now()), 30000);
    return () => clearInterval(timer);
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

  const activeHolds = reservationHolds.filter(hold => holdIsActive(hold, clockTick));
  const isOwnedHold = (hold) => hold?.userId === user?.uid && hold?.holdToken === holdToken;
  const visibleAvailability = adminMode ? availability : availability.filter(slot => {
    const key = slotHoldId(slot.date, slot.time);
    const hold = activeHolds.find(h => slotHoldId(h.date, h.time) === key);
    return !hold || isOwnedHold(hold);
  });

  const releaseCurrentHold = useCallback(async () => {
    const holdKey = currentHoldKeyRef.current;
    if (!holdKey) return;
    currentHoldKeyRef.current = '';
    pendingHoldKeyRef.current = '';
    setHeldSlotKey('');
    try {
      await deleteDoc(doc(db, HOLD_COLLECTION, holdKey));
    } catch {
      // Expired or already cleared.
    }
  }, []);

  const acquireHold = useCallback(async (date, time) => {
    if (!date || !time || !user?.uid) return;
    if (holdBusy) return;
    setHoldBusy(true);
    setHoldError('');

    const nextKey = slotHoldId(date, time);
    const nextRef = doc(db, HOLD_COLLECTION, nextKey);
    const previousKey = currentHoldKeyRef.current;
    const previousRef = previousKey && previousKey !== nextKey ? doc(db, HOLD_COLLECTION, previousKey) : null;
    pendingHoldKeyRef.current = nextKey;

    try {
      const availabilitySnap = await getDocs(query(collection(db, 'availability'), where('date', '==', date), where('time', '==', time)));
      if (availabilitySnap.empty) {
        throw new Error('That time is no longer available.');
      }

      await runTransaction(db, async (transaction) => {
        const holdSnap = await transaction.get(nextRef);
        const holdData = holdSnap.exists() ? holdSnap.data() : null;
        const holdActive = holdData && holdIsActive(holdData);
        const holdOwnedByMe = holdActive && holdData.userId === user.uid && holdData.holdToken === holdToken;

        if (holdActive && !holdOwnedByMe) {
          throw new Error('That time was just taken. Please choose another slot.');
        }

        if (holdActive && holdOwnedByMe) {
          transaction.update(nextRef, {
            expiresAt: new Date(Date.now() + HOLD_MS),
            updatedAt: serverTimestamp(),
          });
        } else {
          if (holdSnap.exists()) {
            transaction.delete(nextRef);
          }

          if (previousRef) {
            const previousSnap = await transaction.get(previousRef);
            const previousData = previousSnap.exists() ? previousSnap.data() : null;
            if (previousData && previousData.userId === user.uid && previousData.holdToken === holdToken) {
              transaction.delete(previousRef);
            }
          }

          const firstAvailabilityRef = availabilitySnap.docs[0].ref;
          const firstAvailabilitySnap = await transaction.get(firstAvailabilityRef);
          if (!firstAvailabilitySnap.exists()) {
            throw new Error('That time is no longer available.');
          }

          transaction.set(nextRef, {
            slotKey: nextKey,
            date,
            time,
            userId: user.uid,
            userEmail: user.email || form.email || 'N/A',
            holdToken,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            expiresAt: new Date(Date.now() + HOLD_MS),
          });
        }
      });

      currentHoldKeyRef.current = nextKey;
      setHeldSlotKey(nextKey);
      setF('date', date);
      setF('time', time);
      setHoldError('');
    } catch (error) {
      pendingHoldKeyRef.current = previousKey || '';
      currentHoldKeyRef.current = previousKey;
      setHeldSlotKey(previousKey || '');
      const message = error?.message || 'That time could not be reserved. Please try again.';
      if (message.includes('just taken')) {
        setF('time', '');
      }
      setHoldError(message);
    } finally {
      setHoldBusy(false);
    }
  }, [holdBusy, holdToken, user?.email, user?.uid, form.email]);

  useEffect(() => {
    return () => { void releaseCurrentHold(); };
  }, [releaseCurrentHold]);

  useEffect(() => {
    if (adminMode || !heldSlotKey) return;
    const renewTimer = setInterval(() => {
      const currentKey = currentHoldKeyRef.current;
      if (!currentKey) return;
      const holdRef = doc(db, HOLD_COLLECTION, currentKey);
      runTransaction(db, async (transaction) => {
        const snap = await transaction.get(holdRef);
        if (!snap.exists()) return;
        const data = snap.data();
        const active = holdIsActive(data, Date.now());
        const ownedByMe = active && data.userId === user?.uid && data.holdToken === holdToken;
        if (!ownedByMe) return;
        transaction.set(holdRef, {
          expiresAt: new Date(Date.now() + HOLD_MS),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }).catch(() => {});
    }, 4 * 60 * 1000);
    return () => clearInterval(renewTimer);
  }, [adminMode, heldSlotKey, holdToken, user?.uid]);

  const calcPrice = () => {
    const service = getServiceById(serviceType);

    if (!isCleaningService(serviceType)) {
      const scopeMult = { small: 1, medium: 1.6, large: 2.8 }[projectScope] || 1.6;
      const est = Math.round((service.from || 150) * scopeMult);
      return {
        final: est,
        sub: est,
        hasDiscount: false,
        lines: [`${service.name} — ${PROJECT_SCOPES.find(s => s.id === projectScope)?.label || 'Medium'} scope`],
        extraNames: [],
        isCustomQuote: true,
      };
    }

    const BP = livePrices?.bathrooms || BPRICES;
    const RP = livePrices?.rooms || RPRICES;
    const EP = livePrices?.extras || {};
    const bedPrice = RP.bed_medium ?? 30;
    const bathPrice = BP.medium ?? 65;
    let base = simpleBeds * bedPrice + simpleBaths * bathPrice;
    const levelMult = { standard: 1, deep: 1.35, move: 1.55 }[cleaningLevel] || 1;
    if (serviceType === 'move_clean') base *= 1.55;
    else base *= levelMult;

    const lines = [];
    if (simpleBeds > 0) lines.push(`${simpleBeds} bedroom${simpleBeds > 1 ? 's' : ''}`);
    if (simpleBaths > 0) lines.push(`${simpleBaths} bathroom${simpleBaths > 1 ? 's' : ''}`);
    lines.push(CLEANING_LEVELS.find(l => l.id === cleaningLevel)?.label || 'Standard');

    if (showAdvanced) {
      Object.keys(baths).forEach(t => {
        if (baths[t] > 0) { base += baths[t] * (BP[t] ?? BPRICES[t]); lines.push(BNAMES[t] + ' x' + baths[t]); }
      });
      Object.keys(rooms).forEach(r => {
        if (rooms[r] > 0) { base += rooms[r] * (RP[r] ?? RPRICES[r]); lines.push(RNAMES[r] + ' x' + rooms[r]); }
      });
    }

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
    return { final, sub: Math.round(sub), hasDiscount, lines, extraNames, isCustomQuote: false };
  };

  const price = calcPrice();

  const startingFrom = (() => {
    try {
      const BP = livePrices?.bathrooms || BPRICES;
      const RP = livePrices?.rooms || RPRICES;
      const minBP = Math.min(...Object.values(BP));
      const minRP = Math.min(...Object.values(RP));
      return Math.max(0, Math.round(Math.min(minBP, minRP)));
    } catch (e) { return 0; }
  })();

  const estimateDuration = () => {
    const bathCount = Object.values(baths).reduce((s, v) => s + (v || 0), 0);
    const roomCount = Object.values(rooms).reduce((s, v) => s + (v || 0), 0);
    const extrasCount = Object.values(extras).filter(Boolean).length;
    const minutes = bathCount * 30 + roomCount * 25 + extrasCount * 10;
    const hours = Math.max(1, Math.ceil(minutes / 60));
    return hours + ' hour' + (hours > 1 ? 's' : '');
  };

  const availDates   = [...new Set(visibleAvailability.map(s => s.date))];
  const timesForDate = visibleAvailability.filter(s => s.date === form.date).map(s => s.time);

  // Build a map of date -> slot count for the calendar
  const slotsPerDate = {};
  visibleAvailability.forEach(s => { slotsPerDate[s.date] = (slotsPerDate[s.date] || 0) + 1; });

  const calFirstDay   = new Date(calYear, calMonth, 1).getDay();
  const calDaysInMonth = getDaysInMonth(calYear, calMonth);
  const todayMidnight  = new Date(); todayMidnight.setHours(0,0,0,0);

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };

  // Don't let user go to past months
  const canGoPrev = calYear > now.getFullYear() || (calYear === now.getFullYear() && calMonth > now.getMonth());

  useEffect(() => {
    if (adminMode) return;
    const ownedHold = activeHolds.find(hold => hold?.userId === user?.uid && hold?.holdToken === holdToken);
    if (ownedHold) {
      const key = slotHoldId(ownedHold.date, ownedHold.time);
      currentHoldKeyRef.current = key;
      pendingHoldKeyRef.current = '';
      if (heldSlotKey !== key) setHeldSlotKey(key);
    }
  }, [activeHolds, adminMode, heldSlotKey, holdToken, user?.uid]);

  const selectTime = (time) => {
    setHoldError('');
    setF('time', time);
    if (!adminMode) void acquireHold(form.date, time);
  };

  const goTo = (s) => {
    if (s >= 1 && !serviceType) { alert('Please choose a service.'); return; }
    if (s >= 2) {
      if (!form.firstName.trim()) { alert('Please enter your first name.'); return; }
      if (!form.phone.trim())     { alert('Please enter your phone number.'); return; }
      if (!form.date)             { alert('Please choose a preferred date.'); return; }
      if (availDates.length > 0 && !form.time) { alert('Please choose a preferred time.'); return; }
    }
    if (s >= 3) {
      if (isCleaningService(serviceType)) {
        if (simpleBeds < 1 && simpleBaths < 1 && !showAdvanced) {
          alert('Please add at least one bedroom or bathroom.'); return;
        }
        if (showAdvanced) {
          const hasRoom = Object.values(rooms).some(v => v > 0) || Object.values(baths).some(v => v > 0);
          if (!hasRoom) { alert('Please select at least one room or bathroom.'); return; }
        }
      } else if (!projectDetails.trim()) {
        alert('Please describe your project so we can quote accurately.'); return;
      }
    }
    setStep(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    if (!form.firstName.trim()) { alert('Please enter a name.'); return; }
    if (!form.phone.trim())     { alert('Please enter a phone number.'); return; }
    if (availDates.length > 0 && !form.time) { alert('Please choose a preferred time.'); return; }
    if (!isCleaningService(serviceType) && !projectDetails.trim()) {
      alert('Please describe your project.'); return;
    }
    setSubmitting(true);
    const service = getServiceById(serviceType);
    const bathDesc = isCleaningService(serviceType)
      ? (showAdvanced
        ? Object.keys(baths).filter(k => baths[k] > 0).map(k => baths[k] + ' ' + BNAMES[k]).join(', ') || 'None'
        : `${simpleBaths} bathroom${simpleBaths !== 1 ? 's' : ''}`)
      : 'N/A';
    const roomDesc = isCleaningService(serviceType)
      ? (showAdvanced
        ? Object.keys(rooms).filter(k => rooms[k] > 0).map(k => rooms[k] + ' ' + RNAMES[k]).join(', ') || 'None'
        : `${simpleBeds} bedroom${simpleBeds !== 1 ? 's' : ''}`)
      : projectDetails.trim() || 'N/A';
    const req = {
      userId:         user?.uid    || 'admin-created',
      userEmail:      user?.email  || form.email,
      name:           (form.firstName + ' ' + form.lastName).trim(),
      phone:          form.phone   || 'N/A',
      email:          form.email   || user?.email || 'N/A',
      address:        form.address || 'N/A',
      date:           form.date    || 'N/A',
      time:           form.time    || 'N/A',
      serviceType,
      serviceName:    service.name,
      projectScope:   isCleaningService(serviceType) ? cleaningLevel : projectScope,
      projectDetails: isCleaningService(serviceType) ? (form.otherReqs || 'None') : projectDetails.trim(),
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
    const docRef = doc(collection(db, 'requests'));
    const slotChosen = form.date && form.time && form.date !== 'N/A' && form.time !== 'N/A';
    let slotSnap = null;

    try {
      if (slotChosen) {
        slotSnap = await getDocs(query(collection(db, 'availability'), where('date', '==', form.date), where('time', '==', form.time)));
        if (slotSnap.empty && !adminMode) {
          throw new Error('That time is no longer available.');
        }
      }

      const customerHoldFlow = !adminMode && slotChosen && availDates.length > 0;
      if (customerHoldFlow) {
        const holdKey = slotHoldId(form.date, form.time);
        const holdRef = doc(db, HOLD_COLLECTION, holdKey);

        await runTransaction(db, async (transaction) => {
          const holdSnap = await transaction.get(holdRef);
          if (holdSnap.exists()) {
            const holdData = holdSnap.data();
            if (holdIsActive(holdData)) {
              const holdOwnedByMe = holdData.userId === user?.uid && holdData.holdToken === holdToken;
              if (!holdOwnedByMe) {
                throw new Error('That time was just taken by someone else. Please go back and choose another time.');
              }
            }
          }

          // Delete availability while the active hold still exists so security rules can authorize it.
          for (const slotDoc of slotSnap.docs) {
            const slotCheck = await transaction.get(slotDoc.ref);
            if (!slotCheck.exists()) {
              throw new Error('That time is no longer available.');
            }
            transaction.delete(slotDoc.ref);
          }
          if (holdSnap.exists()) {
            transaction.delete(holdRef);
          }
          transaction.set(docRef, req);
        });
      } else {
        await runTransaction(db, async (transaction) => {
          if (slotChosen && slotSnap && !slotSnap.empty) {
            slotSnap.docs.forEach(slotDoc => transaction.delete(slotDoc.ref));
          }
          transaction.set(docRef, req);
        });
      }
    } catch (error) {
      setSubmitting(false);
      setHoldError(error?.message || 'Could not save your booking. Please try again.');
      return;
    }

    notifyNewBooking({
      clientName:  req.name,
      clientEmail: req.email,
      address:     req.address,
      estimate:    req.estimate,
      date:        req.date,
      phone:       req.phone,
    });
    await addDoc(collection(db, 'chats', docRef.id, 'messages'), {
      text: 'Hi ' + form.firstName + "! Thank you for reaching out. I've received your request and will get back to you within 24 hours to confirm your appointment!",
      sender: 'admin', senderName: 'Yoselin', createdAt: serverTimestamp(),
    });
    setSubmitting(false);
    currentHoldKeyRef.current = '';
    pendingHoldKeyRef.current = '';
    setHeldSlotKey('');
    if (onDone) onDone(docRef.id);
  };

  const stepLabels = ['Service', 'Contact', 'Details', 'Review'];
  const selectedService = getServiceById(serviceType);
  const cleaningFlow = isCleaningService(serviceType);
  const selectedHold = activeHolds.find(h => slotHoldId(h.date, h.time) === slotHoldId(form.date, form.time));
  const selectedHoldOwnedByMe = !!selectedHold && isOwnedHold(selectedHold);

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
            <div className="page-title">What do you need?</div>
            <div className="page-sub">Pick a service — we&apos;ll tailor your quote from there</div>
            <div className="service-grid">
              {SERVICE_TYPES.map((svc) => (
                <button
                  key={svc.id}
                  type="button"
                  className={'service-tile' + (serviceType === svc.id ? ' service-tile--active' : '')}
                  onClick={() => {
                    setServiceType(svc.id);
                    if (svc.id === 'move_clean') setCleaningLevel('move');
                  }}
                >
                  <span className="service-tile__icon">{svc.icon}</span>
                  <span className="service-tile__name">{svc.name}</span>
                  <span className="service-tile__desc">{svc.desc}</span>
                  <span className="service-tile__from">From ${svc.from}</span>
                </button>
              ))}
            </div>
            <div className="nav-btns">
              <button type="button" className="btn-next" onClick={() => goTo(1)}>Next: Contact info</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div className="page-title">{adminMode ? 'Client Information' : 'Contact & schedule'}</div>
                <div className="page-sub">How to reach you and when you&apos;d like us there</div>
              </div>
              <div className="quote-badge">
                {selectedService.name} · {price.isCustomQuote ? `est. $${price.final}+` : (price.final > 0 ? `$${price.final} est.` : 'Free estimate')}
              </div>
            </div>
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
                    <label style={{ marginBottom: '8px', display: 'block' }}>Preferred Date <span style={{ color: '#ef4444' }}>*</span></label>
                    <div className="cal-widget">
                      {/* Month nav */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <button type="button" onClick={prevMonth} disabled={!canGoPrev} style={{ background: 'none', border: 'none', color: canGoPrev ? '#9ca3af' : '#2a2a2a', cursor: canGoPrev ? 'pointer' : 'default', fontSize: '1.1rem', padding: '2px 8px', lineHeight: 1 }}>&#x2039;</button>
                        <div style={{ fontSize: '.8rem', fontWeight: '700', color: 'var(--text)', letterSpacing: '.3px' }}>{MONTH_NAMES[calMonth].slice(0,3)} {calYear}</div>
                        <button type="button" onClick={nextMonth} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.1rem', padding: '2px 8px', lineHeight: 1 }}>&#x203A;</button>
                      </div>
                      {/* Day headers */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '3px' }}>
                        {DAY_LABELS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: '.58rem', fontWeight: '700', color: '#4b5563', textTransform: 'uppercase', padding: '2px 0' }}>{d[0]}</div>)}
                      </div>
                      {/* Day grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
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
                              if (!adminMode) void releaseCurrentHold();
                                  setHoldError('');
                                  setF('date', key); setF('time', '');
                            }} className={
                              'cal-day-btn' +
                              (isSelected ? ' cal-day-btn--selected' : '') +
                              (isPast ? ' cal-day-btn--past' : '') +
                              (isToday && !isSelected ? ' cal-day-btn--today' : '') +
                              (canClick && !isSelected ? ' cal-day-btn--available' : '') +
                              (!canClick && !isPast && !isSelected ? ' cal-day-btn--empty' : '')
                            }>
                              <span style={{ lineHeight: 1 }}>{day}</span>
                              {hasSlots && !isPast && (
                                <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: isSelected ? 'rgba(255,255,255,.7)' : slotCount <= 2 ? '#f59e0b' : '#10b981', flexShrink: 0 }} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {/* Legend + clear */}
                      <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                            <span style={{ fontSize: '.6rem', color: '#6b7280' }}>Available</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                            <span style={{ fontSize: '.6rem', color: '#6b7280' }}>Filling up</span>
                          </div>
                        </div>
                        {form.date && (
                          <button type="button" onClick={() => { setF('date', ''); setF('time', ''); }} style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: '.65rem', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}>Clear</button>
                        )}
                      </div>
                      {form.date && (
                        <div style={{ marginTop: '8px', padding: '6px 10px', background: 'rgba(13,148,136,.1)', border: '1px solid rgba(13,148,136,.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '.7rem' }}>&#x1F4C5;</span>
                          <span style={{ fontSize: '.75rem', fontWeight: '700', color: 'var(--blue)' }}>{form.date}</span>
                        </div>
                      )}
                    </div>

                    {/* Time slots */}
                    {form.date && timesForDate.length > 0 ? (
                      <div>
                        <label style={{ marginBottom: '7px', display: 'block', fontSize: '.78rem' }}>Preferred Time</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {timesForDate.map(tm => (
                            <button key={tm} type="button" onClick={() => selectTime(tm)} className={'time-slot-btn' + (form.time === tm ? ' time-slot-btn--active' : '')}>{tm}</button>
                          ))}
                        </div>
                        <div style={{ marginTop: '8px', fontSize: '.72rem', color: '#6b7280' }}>
                          {adminMode ? 'Admin bookings are saved directly.' : (holdBusy ? 'Saving your time selection...' : 'Select the time that works best for you.')}
                        </div>
                      </div>
                    ) : form.date ? (
                      <div style={{ color: '#4b5563', fontSize: '.78rem', padding: '6px 0' }}>No time slots for this date</div>
                    ) : null}
                    {holdError && (
                      <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.22)', color: '#fca5a5', fontSize: '.78rem', lineHeight: 1.45 }}>
                        {holdError}
                      </div>
                    )}
                    {selectedHoldOwnedByMe && form.date && form.time && (
                      <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.22)', color: '#6ee7b7', fontSize: '.78rem', lineHeight: 1.45 }}>
                        Your selected time is saved while you finish your quote.
                      </div>
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
              border: walkthrough ? '2px solid var(--blue)' : '2px dashed var(--border)',
              background: walkthrough ? 'var(--blue-pale)' : 'var(--soft)',
              padding: '20px 22px', cursor: 'pointer', transition: 'all .2s', display: 'flex', alignItems: 'center', gap: '18px',
            }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', flexShrink: 0, background: walkthrough ? 'var(--blue)' : 'white', border: walkthrough ? 'none' : '1px solid var(--border)', color: walkthrough ? 'white' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', transition: 'all .2s' }}>W</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '800', fontSize: '.98rem', color: walkthrough ? 'var(--blue)' : 'var(--text)', marginBottom: '4px', transition: 'color .2s' }}>
                  Request a Free Walk-Through
                </div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', lineHeight: 1.5, transition: 'color .2s' }}>
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
              <button type="button" className="btn-back" onClick={() => goTo(0)}>Back</button>
              <button type="button" className="btn-next" onClick={() => goTo(2)}>Next: Job details</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="page-title">Job details</div>
            <div className="page-sub">
              {cleaningFlow ? 'Tell us about the space — keep it simple' : 'Describe your project'}
            </div>

            {cleaningFlow ? (
              <>
                <div className="wcard">
                  <div className="card-body">
                    <div className="simple-counters">
                      <div className="simple-counter">
                        <div>
                          <div className="bname">Bedrooms</div>
                          <div className="bdesc">Including living areas</div>
                        </div>
                        <QCtrl val={simpleBeds} onInc={() => setSimpleBeds(n => n + 1)} onDec={() => setSimpleBeds(n => Math.max(0, n - 1))} />
                      </div>
                      <div className="simple-counter">
                        <div>
                          <div className="bname">Bathrooms</div>
                          <div className="bdesc">Half baths count too</div>
                        </div>
                        <QCtrl val={simpleBaths} onInc={() => setSimpleBaths(n => n + 1)} onDec={() => setSimpleBaths(n => Math.max(0, n - 1))} />
                      </div>
                    </div>
                    <div className="divider" />
                    <label className="fg-label">Cleaning type</label>
                    <div className="level-pills">
                      {CLEANING_LEVELS.map((lv) => (
                        <button
                          key={lv.id}
                          type="button"
                          className={'level-pill' + (cleaningLevel === lv.id ? ' level-pill--active' : '')}
                          onClick={() => setCleaningLevel(lv.id)}
                        >
                          <strong>{lv.label}</strong>
                          <span>{lv.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

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
                    <div><div className="card-title">Add-ons</div><div className="card-sub">Optional extras</div></div>
                  </div>
                  <div className="card-body">
                    <div className="extras-grid">
                      {EXTRAS.map(e => (
                        <div key={e.id} className={'eitem ' + (extras[e.id] ? 'selected' : '')} onClick={() => setExtras(x => ({ ...x, [e.id]: !x[e.id] }))}>
                          <input type="checkbox" readOnly checked={!!extras[e.id]} />
                          <div className="ename">{e.name}</div>
                        </div>
                      ))}
                    </div>
                    <div className="row2" style={{ marginTop: 14 }}>
                      <div className="fg">
                        <label>Any pets?</label>
                        <select value={form.pets} onChange={e => setF('pets', e.target.value)}>
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                      </div>
                      <div className="fg">
                        <label>Special requests <span className="opt">(optional)</span></label>
                        <input type="text" value={form.otherReqs} onChange={e => setF('otherReqs', e.target.value)} placeholder="e.g. Focus on kitchen..." />
                      </div>
                    </div>
                  </div>
                </div>

                <button type="button" className="link-btn" onClick={() => setShowAdvanced(v => !v)}>
                  {showAdvanced ? 'Hide detailed room list' : 'Need detailed room-by-room pricing?'}
                </button>

                {showAdvanced && (
                  <>
                    <div className="wcard">
                      <div className="card-header"><div className="card-icon">B</div><div><div className="card-title">Detailed rooms</div></div></div>
                      <div className="card-body">
                        <div className="bath-box">
                          {[...BEDROOMS, ...KITCHEN].map(({ key, name, desc }) => (
                            <RoomRow key={key} name={name} desc={desc} val={rooms[key]}
                              onInc={() => setRooms(r => ({ ...r, [key]: r[key] + 1 }))}
                              onDec={() => setRooms(r => ({ ...r, [key]: Math.max(0, r[key] - 1) }))} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="wcard">
                      <div className="card-header"><div className="card-icon">Ba</div><div><div className="card-title">Detailed bathrooms</div></div></div>
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
                  </>
                )}
              </>
            ) : (
              <div className="wcard">
                <div className="card-body">
                  <div className="fg">
                    <label>Project size</label>
                    <div className="level-pills">
                      {PROJECT_SCOPES.map((sc) => (
                        <button
                          key={sc.id}
                          type="button"
                          className={'level-pill' + (projectScope === sc.id ? ' level-pill--active' : '')}
                          onClick={() => setProjectScope(sc.id)}
                        >
                          <strong>{sc.label}</strong>
                          <span>{sc.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="fg">
                    <label>Describe your project <span style={{ color: '#ef4444' }}>*</span></label>
                    <textarea
                      value={projectDetails}
                      onChange={e => setProjectDetails(e.target.value)}
                      placeholder={'e.g. Pressure wash driveway and back patio, or paint 2 bedrooms and hallway...'}
                      rows={5}
                    />
                  </div>
                  <div className="fg">
                    <label>Anything else? <span className="opt">(optional)</span></label>
                    <input type="text" value={form.otherReqs} onChange={e => setF('otherReqs', e.target.value)} placeholder="Access notes, materials, timeline..." />
                  </div>
                  <p className="custom-quote-note">Final price confirmed after Yoselin reviews your project — this is a starting estimate only.</p>
                </div>
              </div>
            )}

            <div className="pbar">
              <div className="pbar-top">
                <div>
                  <div className="plabel">YOUR ESTIMATE</div>
                  <div className="pamount">${price.final}{price.isCustomQuote ? '+' : ''}</div>
                  <div className="prange">
                    {price.isCustomQuote
                      ? 'Custom quote — Yoselin will confirm final price'
                      : price.final > 0
                        ? 'Est. range: $' + Math.round(price.final * .95) + ' – $' + Math.round(price.final * 1.1)
                        : 'Add details to calculate'}
                  </div>
                </div>
              </div>
            </div>

            <div className="nav-btns">
              <button type="button" className="btn-back" onClick={() => goTo(1)}>Back</button>
              <button type="button" className="btn-next" onClick={() => goTo(3)}>Next: Review</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="page-title">Review & submit</div>
            <div className="page-sub">Double-check everything, then send your request</div>

            <div className="review-summary">
              <div className="review-summary__row">
                <span>Service</span>
                <strong>{selectedService.icon} {selectedService.name}</strong>
              </div>
              {!cleaningFlow && projectDetails && (
                <div className="review-summary__row review-summary__row--stack">
                  <span>Project</span>
                  <strong>{projectDetails}</strong>
                </div>
              )}
            </div>

            {/* Date & Time Summary Card */}
            {(form.date || form.time) && (() => {
              const parsed = form.date ? new Date(form.date) : null;
              const dayName = parsed && !isNaN(parsed) ? ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][parsed.getDay()] : '';
              const monthName = parsed && !isNaN(parsed) ? MONTH_NAMES[parsed.getMonth()] : '';
              const dayNum = parsed && !isNaN(parsed) ? parsed.getDate() : '';
              const year = parsed && !isNaN(parsed) ? parsed.getFullYear() : '';
              return (
                <div className="review-date-card">
                    <div className="review-date-card__head">Preferred Date & Time</div>
                  <div className="review-date-card__body">
                    {parsed && !isNaN(parsed) ? (
                      <div style={{ width: '76px', flexShrink: 0, borderRadius: '14px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(13,148,136,.25)', border: '1px solid rgba(13,148,136,.3)' }}>
                        <div style={{ background: 'var(--blue)', padding: '5px 0 3px', textAlign: 'center' }}>
                          <div style={{ fontSize: '.6rem', fontWeight: '800', color: 'rgba(255,255,255,.9)', textTransform: 'uppercase', letterSpacing: '1.5px', lineHeight: 1 }}>{monthName.slice(0,3)}</div>
                        </div>
                        <div style={{ background: 'white', padding: '8px 0 6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '1.8rem', fontWeight: '900', color: 'var(--text)', lineHeight: 1 }}>{dayNum}</div>
                          <div style={{ fontSize: '.58rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.6px', marginTop: '2px' }}>{dayName.slice(0,3)}</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ width: '76px', height: '76px', borderRadius: '14px', background: 'white', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.6rem' }}>\uD83D\uDCC5</div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div className="review-date-card__title">
                        {parsed && !isNaN(parsed) ? `${dayName}, ${monthName} ${dayNum}` : form.date}
                      </div>
                      {year && <div style={{ fontSize: '.78rem', fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>{year}</div>}
                      {form.time && form.time !== 'N/A' && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(13,148,136,.12)', border: '1px solid rgba(13,148,136,.2)', borderRadius: '10px', padding: '6px 14px' }}>
                          <span style={{ fontSize: '.74rem' }}>\uD83D\uDD52</span>
                          <span style={{ fontSize: '.84rem', fontWeight: '700', color: 'var(--blue)' }}>{form.time}</span>
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
              <div className="card-header">
                <div className="card-icon" style={{ fontSize: '1.2rem' }}>D</div>
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
                          border: firstTime === v ? (v === 'yes' ? '2px solid #10b981' : '2px solid var(--text-muted)') : '1.5px solid var(--border)',
                          background: firstTime === v ? (v === 'yes' ? 'rgba(16,185,129,.12)' : 'var(--soft)') : 'white',
                          color: firstTime === v ? (v === 'yes' ? '#059669' : 'var(--text)') : 'var(--text-muted)',
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
                          border: senior === v ? (v === 'yes' ? '2px solid #10b981' : '2px solid var(--text-muted)') : '1.5px solid var(--border)',
                          background: senior === v ? (v === 'yes' ? 'rgba(16,185,129,.12)' : 'var(--soft)') : 'white',
                          color: senior === v ? (v === 'yes' ? '#059669' : 'var(--text)') : 'var(--text-muted)',
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

            <div className="wcard">
              <div className="card-header">
                <div className="card-icon">✓</div>
                <div><div className="card-title">What's included</div></div>
              </div>
              <div className="card-body">
                <div style={{ fontSize: '.95rem', marginBottom: '10px' }}>
                  {price.lines && price.lines.length > 0 ? price.lines.slice(0,6).map((l,i) => (<div key={i} style={{ marginBottom: '6px' }}>• {l}</div>)) : <div>No rooms selected</div>}
                </div>
                <div style={{ fontSize: '.85rem', color: '#6b7280' }}>Estimated time: {estimateDuration()}</div>
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
