import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './global.css';
import { appName, appTagline, siteUrl } from '@/lib/shared';
import { i18n, localeDirection } from '@/lib/i18n';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

// Global SEO defaults and document shell.
// Route params select the English or Chinese document language.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${appName} — ${appTagline}`,
    template: `%s — ${appName}`,
  },
  description: appTagline,
  applicationName: appName,
  openGraph: {
    siteName: appName,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
  icons: {
    icon: '/favicon.png',
    apple: '/icon.png',
  },
};

export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang?: string }>;
}) {
  const { lang: rawLang } = await params;
  const lang = i18n.languages.includes(rawLang as (typeof i18n.languages)[number])
    ? (rawLang as (typeof i18n.languages)[number])
    : i18n.defaultLanguage;
  const dir = localeDirection(lang);
  const fontClassName = inter.className;

  return (
    <html lang={lang} dir={dir} className={fontClassName} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
