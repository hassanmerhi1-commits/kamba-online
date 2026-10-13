import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import pt from './locales/pt.json';
import en from './locales/en.json';

/** Portuguese is official — English is secondary */
i18n.use(initReactI18next).init({
  resources: {
    pt: { translation: pt },
    en: { translation: en },
  },
  lng: 'pt',
  fallbackLng: 'pt',
  interpolation: { escapeValue: false },
});

export default i18n;

export function setLanguage(lang: 'pt' | 'en') {
  return i18n.changeLanguage(lang);
}

export function getLanguage(): 'pt' | 'en' {
  return (i18n.language === 'en' ? 'en' : 'pt') as 'pt' | 'en';
}
