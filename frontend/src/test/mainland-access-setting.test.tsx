import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MainlandAccessSetting from '@/pages/settings/MainlandAccessSetting';
import { renderWithProviders } from './test-utils';

describe('regional website access', () => {
  it.each([
    [true, 'CN,HK,TW,MO', 'Mainland China', true, 'HK,TW,MO'],
    [true, 'MO,TW', 'Taiwan', true, 'MO'],
    [true, 'CN,HK,TW,MO', 'Select all', false, 'CN,HK,TW,MO'],
    [true, 'CN,JP', 'Select all', true, 'JP'],
    [false, 'CN,HK,TW,MO', 'Hong Kong', true, 'HK'],
  ] as const)(
    'maps allowed choices to blocked regions (%s, %s, %s)',
    (enabled, regions, choice, nextEnabled, nextRegions) => {
      const onChange = vi.fn();
      renderWithProviders(
        <MainlandAccessSetting
          setting={{ websiteGeoBlockEnable: enabled, websiteGeoBlockRegions: regions }}
          onChange={onChange}
        />,
      );
      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Allowed website regions' }));
      const option = document.querySelector(`.ant-select-item-option[title="${choice}"]`);
      expect(option).not.toBeNull();
      fireEvent.click(option!);
      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        websiteGeoBlockEnable: nextEnabled,
        websiteGeoBlockRegions: nextRegions,
      });
    },
  );
  it('blocks all four regions when cleared', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <MainlandAccessSetting
        setting={{ websiteGeoBlockEnable: false, websiteGeoBlockRegions: 'MO,TW' }}
        onChange={onChange}
      />,
    );
    const clear = document.querySelector('.ant-select-clear');
    expect(clear).not.toBeNull();
    fireEvent.click(clear!);
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      websiteGeoBlockEnable: true,
      websiteGeoBlockRegions: 'CN,HK,TW,MO',
    });
  });
});
