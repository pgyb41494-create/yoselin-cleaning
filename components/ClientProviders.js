'use client';
import { LanguageProvider } from '../lib/LanguageContext';

export default function ClientProviders({ children }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}
