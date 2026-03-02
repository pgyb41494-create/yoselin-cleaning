'use client';
import { LanguageProvider, useLang } from '../lib/LanguageContext';

function FloatingLangFab() {
  const { lang, toggleLang } = useLang();
  return (
    <button
      className="lang-fab"
      onClick={toggleLang}
      title={lang === 'en' ? 'Cambiar a Español' : 'Switch to English'}
    >
      <span className="lang-fab-flag">{lang === 'en' ? '🇪🇸' : '🇺🇸'}</span>
      {lang === 'en' ? 'Español' : 'English'}
    </button>
  );
}

export default function ClientProviders({ children }) {
  return (
    <LanguageProvider>
      {children}
      <FloatingLangFab />
    </LanguageProvider>
  );
}
