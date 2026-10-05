import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';

type NetworkPage = 'nodes' | 'inbounds' | 'hosts' | 'routing' | 'outbound';

export default function NetworkPageIntro({ page }: { page: NetworkPage }) {
  const { t } = useTranslation();
  return (
    <header style={{ marginBottom: 20 }}>
      <Typography.Title level={2} style={{ marginTop: 0, marginBottom: 8 }}>
        {t(`networkGuide.${page}.title`)}
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ maxWidth: '65ch', marginBottom: 0 }}>
        {t(`networkGuide.${page}.hint`)}
      </Typography.Paragraph>
    </header>
  );
}
