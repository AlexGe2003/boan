import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';
import { panelPalette } from '@/styles/palette';

const STORAGE_DARK = 'dark-mode';
const STORAGE_ULTRA = 'isUltraDarkThemeEnabled';

function readBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

function applyDom(isDark: boolean, isUltra: boolean) {
  const palette = panelPalette(isDark, isUltra);
  for (const [key, value] of Object.entries(palette)) {
    document.documentElement.style.setProperty(`--panel-${key}`, value);
  }
  document.body.classList.remove('dark', 'light');
  document.body.classList.add(isDark ? 'dark' : 'light');
  // Native scrollbars read color-scheme, not the body class.
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  if (isUltra) {
    document.documentElement.setAttribute('data-theme', 'ultra-dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  const msg = document.getElementById('message');
  if (msg) {
    msg.classList.remove('dark', 'light');
    msg.classList.add(isDark ? 'dark' : 'light');
  }
}

// module load so the document is in the right theme before React mounts.
const initialDark = readBool(STORAGE_DARK, true);
const initialUltra = readBool(STORAGE_ULTRA, false);
applyDom(initialDark, initialUltra);

const STATISTIC_TOKENS = { contentFontSize: 17, titleFontSize: 11 };

// hashed:false drops the `:where(.css-<hash>)` wrapper antd puts around every
// rule. It costs nothing in specificity — `:where()` contributes zero, so the
// panel's own `.ant-*` overrides still win — and it removes roughly 5,700
// wrappers, 16% of the generated stylesheet, from what the browser has to parse.
//
// cssVar.key pins the CSS-variable scope. Every panel page mounts its own
// ConfigProvider (there is no root one), and without a fixed key each mints a
// fresh useId-derived scope, so navigating re-serialises and re-injects the whole
// token block under a new class instead of reusing the one already in the head.
const SHARED_STYLE_CONFIG = {
  hashed: false,
  cssVar: { key: 'xui' },
} as const;

export function buildAntdThemeConfig(isDark: boolean, isUltra: boolean): ThemeConfig {
  const palette = panelPalette(isDark, isUltra);
  return {
    ...SHARED_STYLE_CONFIG,
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: palette.primary,
      colorBgBase: palette.bg,
      colorBgLayout: palette.bg,
      colorBgContainer: palette.card,
      colorBgElevated: palette.card,
      colorBorder: palette.border,
      colorBorderSecondary: palette.border,
      colorText: palette.text,
      colorTextSecondary: palette.muted,
      colorTextDescription: palette.muted,
      colorTextTertiary: palette.tertiary,
      colorTextPlaceholder: palette.tertiary,
      borderRadius: 8,
      borderRadiusLG: 16,
      controlHeight: 40,
      fontSize: 14,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif",
      ...(!isDark
        ? { colorError: '#cf1322', colorErrorText: '#cf1322', colorSuccessText: '#237804' }
        : {}),
    },
    components: {
      Layout: {
        bodyBg: palette.bg,
        headerBg: palette.bg,
        headerColor: palette.text,
        footerBg: palette.bg,
        siderBg: palette.sidebar,
        triggerBg: palette.card,
        triggerColor: palette.text,
      },
      Menu: {
        itemBg: palette.sidebar,
        darkItemBg: palette.sidebar,
        darkSubMenuItemBg: palette.sidebar,
        darkPopupBg: palette.card,
        itemSelectedBg: palette.activeBg,
        darkItemSelectedBg: palette.activeBg,
        itemSelectedColor: palette.activeText,
        darkItemSelectedColor: palette.activeText,
        itemColor: palette.muted,
        darkItemColor: palette.muted,
      },
      Card: { colorBorderSecondary: palette.border },
      Statistic: STATISTIC_TOKENS,
    },
  };
}

export function pauseAnimationsUntilLeave(elementId: string): void {
  document.documentElement.setAttribute('data-theme-animations', 'off');
  const el = document.getElementById(elementId);
  if (!el) return;
  const restore = () => {
    document.documentElement.removeAttribute('data-theme-animations');
    el.removeEventListener('mouseleave', restore);
    el.removeEventListener('touchend', restore);
  };
  el.addEventListener('mouseleave', restore);
  el.addEventListener('touchend', restore);
}

interface ThemeContextValue {
  isDark: boolean;
  isUltra: boolean;
  toggleTheme: () => void;
  toggleUltra: () => void;
  antdThemeConfig: ThemeConfig;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState<boolean>(initialDark);
  const [isUltra, setIsUltra] = useState<boolean>(initialUltra);

  useLayoutEffect(() => {
    applyDom(isDark, isUltra);
    localStorage.setItem(STORAGE_DARK, String(isDark));
    localStorage.setItem(STORAGE_ULTRA, String(isUltra));
  }, [isDark, isUltra]);

  const toggleTheme = useCallback(() => setIsDark((v) => !v), []);
  const toggleUltra = useCallback(() => setIsUltra((v) => !v), []);

  const antdThemeConfig = useMemo(() => buildAntdThemeConfig(isDark, isUltra), [isDark, isUltra]);

  const value = useMemo<ThemeContextValue>(
    () => ({ isDark, isUltra, toggleTheme, toggleUltra, antdThemeConfig }),
    [isDark, isUltra, toggleTheme, toggleUltra, antdThemeConfig],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
