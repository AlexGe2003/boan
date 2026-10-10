import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';

type NetworkPage = 'nodes' | 'inbounds' | 'hosts' | 'routing' | 'outbound';

const pageKeys = {
  nodes: ['networkGuide.nodes.title', 'networkGuide.nodes.hint'],
  inbounds: ['networkGuide.inbounds.title', 'networkGuide.inbounds.hint'],
  hosts: ['networkGuide.hosts.title', 'networkGuide.hosts.hint'],
  routing: ['networkGuide.routing.title', 'networkGuide.routing.hint'],
  outbound: ['networkGuide.outbound.title', 'networkGuide.outbound.hint'],
} as const;

export default function NetworkPageIntro({ page }: { page: NetworkPage }) {
  const { t } = useTranslation();
  return (
    <header style={{ marginBottom: 20 }}>
      <Typography.Title level={2} style={{ marginTop: 0, marginBottom: 8 }}>
        {t(pageKeys[page][0])}
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ maxWidth: '65ch', marginBottom: 0 }}>
        {t(pageKeys[page][1])}
      </Typography.Paragraph>
    </header>
  );
}
