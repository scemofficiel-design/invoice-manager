import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from '@im/shared/i18n/fr.json';
import en from '@im/shared/i18n/en.json';

void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  lng: (() => {
    try {
      return localStorage.getItem('im-locale') ?? 'fr';
    } catch {
      return 'fr';
    }
  })(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

export function setLocale(locale: 'fr' | 'en') {
  void i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
  try {
    localStorage.setItem('im-locale', locale);
  } catch {
    /* stockage indisponible : préférence non mémorisée localement */
  }
}

export default i18n;
