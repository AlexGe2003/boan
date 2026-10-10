import { defineI18n } from 'fumadocs-core/i18n';

// Content lives in `content/docs/{locale}/...`.
// Untranslated Chinese pages fall back to English.
export const i18n = defineI18n({
  defaultLanguage: 'en',
  languages: ['en', 'zh'],
  parser: 'dir',
  // English keeps canonical `/docs/...`; other locales are prefixed `/zh/...`.
  hideLocale: 'default-locale',
});

export type Locale = (typeof i18n.languages)[number];

// Display names for the language switcher (in their own script).
export const locales: { locale: Locale; name: string }[] = [
  { locale: 'en', name: 'English' },
  { locale: 'zh', name: '中文' },
];

export function localeDirection(_locale: string): 'ltr' {
  return 'ltr';
}
