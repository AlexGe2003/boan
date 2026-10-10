export const panelPalettes = {
  dark: {
    bg: '#141619',
    sidebar: '#181b20',
    card: '#1c1f24',
    border: '#303640',
    text: '#f0f2f7',
    muted: '#a4adbd',
    tertiary: '#8b95a6',
    primary: '#4169f5',
    activeBg: '#1d2d4b',
    activeText: '#7696ff',
    hoverBg: '#232830',
  },
  light: {
    bg: '#f8f9fc',
    sidebar: '#ffffff',
    card: '#ffffff',
    border: '#dce1e9',
    text: '#202631',
    muted: '#596577',
    tertiary: '#647083',
    primary: '#4169f5',
    activeBg: '#eaf0ff',
    activeText: '#3158dc',
    hoverBg: '#f0f3f8',
  },
} as const;

export function panelPalette(isDark: boolean, isUltra: boolean) {
  if (!isDark) return panelPalettes.light;
  return isUltra
    ? { ...panelPalettes.dark, bg: '#08090b', sidebar: '#101215' }
    : panelPalettes.dark;
}
