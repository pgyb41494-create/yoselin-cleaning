'use client';
import { createContext, useContext, useState, useEffect } from 'react';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState('en');

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.sessionStorage?.getItem?.('lang') : null;
    if (saved === 'es') setLang('es');
  }, []);

  const toggleLang = () => {
    const next = lang === 'en' ? 'es' : 'en';
    setLang(next);
    try { window.sessionStorage.setItem('lang', next); } catch {}
  };

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t: (en, es) => lang === 'es' ? es : en }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) return { lang: 'en', toggleLang: () => {}, t: (en) => en };
  return ctx;
}
