'use client';
import { useLang } from '../lib/LanguageContext';

export default function LanguageToggle({ style }) {
  const { lang, toggleLang } = useLang();
  return (
    <button
      onClick={toggleLang}
      title={lang === 'en' ? 'Cambiar a Español' : 'Switch to English'}
      style={{
        display: 'flex', alignItems: 'center', gap: '5px',
        padding: '6px 12px', borderRadius: '99px',
        background: 'rgba(255,255,255,.06)',
        border: '1px solid rgba(255,255,255,.15)',
        color: '#d8b4fe', fontSize: '.78rem', fontWeight: '700',
        cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
        transition: 'all .2s',
        ...style,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,.15)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,.5)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.15)'; }}
    >
      <span style={{ fontSize: '.95rem' }}>{lang === 'en' ? '🇪🇸' : '🇺🇸'}</span>
      {lang === 'en' ? 'ES' : 'EN'}
    </button>
  );
}
