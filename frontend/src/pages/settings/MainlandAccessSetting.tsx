import { useTranslation } from 'react-i18next';
import { Select } from 'antd';
import { SettingListItem } from '@/components/ui';
import type { AllSetting } from '@/models/setting';

type RegionSetting = Pick<AllSetting, 'websiteGeoBlockEnable' | 'websiteGeoBlockRegions'>;
const regionCodes = ['CN', 'HK', 'TW', 'MO'];

export default function MainlandAccessSetting({
  setting,
  onChange,
}: {
  setting: RegionSetting;
  onChange: (patch: RegionSetting) => void;
}) {
  const { t } = useTranslation();
  const blocked = setting.websiteGeoBlockEnable
    ? setting.websiteGeoBlockRegions
        .split(',')
        .map((region) => region.trim().toUpperCase())
        .filter(Boolean)
    : [];
  const allowed = regionCodes.filter((region) => !blocked.includes(region));

  function change(selected: string[]) {
    const nextAllowed = selected.includes('all') ? regionCodes : selected;
    const nextBlocked = [
      ...blocked.filter((region) => !regionCodes.includes(region)),
      ...regionCodes.filter((region) => !nextAllowed.includes(region)),
    ];
    onChange({
      websiteGeoBlockEnable: nextBlocked.length > 0,
      websiteGeoBlockRegions: nextBlocked.length
        ? nextBlocked.join(',')
        : setting.websiteGeoBlockRegions,
    });
  }

  return (
    <SettingListItem
      paddings="small"
      title={t('pages.settings.allowedWebsiteRegions')}
      description={t('pages.settings.allowedWebsiteRegionsDesc')}
    >
      <Select
        mode="multiple"
        allowClear
        aria-label={t('pages.settings.allowedWebsiteRegions')}
        placeholder={t('pages.settings.noWebsiteRegionsAllowed')}
        value={allowed}
        onChange={change}
        style={{ width: 320, maxWidth: '100%' }}
        options={[
          { value: 'all', label: t('pages.settings.selectAllWebsiteRegions') },
          ...regionCodes.map((value) => ({
            value,
            label: t(`pages.settings.websiteRegions.${value}`),
          })),
        ]}
      />
    </SettingListItem>
  );
}
