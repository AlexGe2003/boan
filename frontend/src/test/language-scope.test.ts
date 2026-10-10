import { afterEach, describe, expect, it, vi } from 'vitest';

describe('subscription language scope', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('initializes lazily and changes the subscription language without changing the panel', async () => {
    vi.resetModules();
    const utils = await import('@/utils');
    const cookies = new Map<string, string>([['lang', 'en-US']]);
    vi.spyOn(utils.CookieManager, 'getCookie').mockImplementation(
      (name) => cookies.get(name) ?? '',
    );
    vi.spyOn(utils.CookieManager, 'setCookie').mockImplementation((name, value) => {
      cookies.set(name, value);
    });
    const getLanguage = vi.spyOn(utils.LanguageManager, 'getLanguage');
    const reload = vi.fn();
    vi.stubGlobal('window', { navigator: { language: 'en-US' }, location: { reload } });

    const { readyI18n } = await import('@/i18n/react');
    expect(getLanguage).not.toHaveBeenCalled();

    await readyI18n('subscription');
    expect(cookies.get('subLang')).toBe('en-US');

    utils.LanguageManager.setLanguage('zh-CN', 'subscription');
    expect(cookies.get('lang')).toBe('en-US');
    expect(cookies.get('subLang')).toBe('zh-CN');
    expect(reload).toHaveBeenCalledOnce();

    const dateTimeFormat = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (
      locale?: Intl.LocalesArgument,
    ) {
      return { format: () => String(locale) } as Intl.DateTimeFormat;
    } as typeof Intl.DateTimeFormat);
    expect(utils.IntlUtil.formatDate(0, 'gregorian', 'zh-CN')).toBe('zh-CN');
    expect(dateTimeFormat).toHaveBeenLastCalledWith('zh-CN', expect.any(Object));
  });

  it.each([
    ['fa-IR', 'en-US'],
    ['ru-RU', 'en-US'],
    ['zh-TW', 'zh-CN'],
  ])('replaces legacy %s cookies with %s without reloading', async (previous, expected) => {
    const utils = await import('@/utils');
    const cookies = new Map([
      ['subLang', previous],
      ['lang', 'zh-CN'],
    ]);
    vi.spyOn(utils.CookieManager, 'getCookie').mockImplementation(
      (name) => cookies.get(name) ?? '',
    );
    vi.spyOn(utils.CookieManager, 'setCookie').mockImplementation((name, value) => {
      cookies.set(name, value);
    });
    const reload = vi.fn();
    vi.stubGlobal('window', { navigator: { language: 'en-US' }, location: { reload } });
    expect(utils.LanguageManager.getLanguage('subscription')).toBe(expected);
    expect(cookies.get('subLang')).toBe(expected);
    expect(cookies.get('lang')).toBe('zh-CN');
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not resolve the language for empty or invalid dates', async () => {
    const utils = await import('@/utils');
    const getLanguage = vi.spyOn(utils.LanguageManager, 'getLanguage').mockReturnValue('en-US');

    expect(utils.IntlUtil.formatDate(null)).toBe('');
    expect(utils.IntlUtil.formatDate(undefined)).toBe('');
    expect(utils.IntlUtil.formatDate('not-a-date')).toBe('');
    expect(getLanguage).not.toHaveBeenCalled();
  });
});

it('defaults the panel to Chinese while preserving an explicit English choice', async () => {
  const utils = await import('@/utils');
  const cookies = new Map<string, string>([['lang', 'en-US']]);
  vi.spyOn(utils.CookieManager, 'getCookie').mockImplementation((name) => cookies.get(name) ?? '');
  vi.spyOn(utils.CookieManager, 'setCookie').mockImplementation((name, value) => {
    cookies.set(name, value);
  });
  try {
    expect(utils.LanguageManager.getLanguage()).toBe('zh-CN');
    cookies.set('lang', 'en-US');
    cookies.set('lang_explicit', '1');
    expect(utils.LanguageManager.getLanguage()).toBe('en-US');
  } finally {
    vi.restoreAllMocks();
  }
});
