import { render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { afterEach, expect, test } from 'vitest';
import NetworkPageIntro from '@/components/NetworkPageIntro';
import zhCN from '../../../internal/web/translation/zh-CN.json';

afterEach(async () => {
  await i18next.changeLanguage('en-US');
});

test.each(['nodes', 'inbounds', 'hosts', 'routing', 'outbound'] as const)(
  'renders translated Chinese guidance for %s instead of a resource key',
  async (page) => {
    i18next.addResourceBundle('zh-CN', 'translation', zhCN, true, true);
    await i18next.changeLanguage('zh-CN');
    render(<NetworkPageIntro page={page} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      zhCN.networkGuide[page].title,
    );
    expect(screen.getByText(zhCN.networkGuide[page].hint)).toBeTruthy();
    expect(screen.queryByText(`networkGuide.${page}.title`)).toBeNull();
  },
);
