import { Tooltip, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { SubscriptionClientInfo } from '@/generated/zod';
import { IntlUtil, type CalendarKind } from '@/utils';

export default function SubscriptionClientSummary({
  client,
  datepicker = 'gregorian',
}: {
  client?: SubscriptionClientInfo | null;
  datepicker?: CalendarKind;
}) {
  const { t } = useTranslation();
  const label = (key: string) => t(`pages.clients.devices.${key}`);
  return (
    <section className="subscription-client-summary">
      <Typography.Title level={5}>{label('subscriptionClient')}</Typography.Title>
      {client ? (
        <>
          <Tooltip title={client.userAgent || undefined}>
            <Typography.Text strong>
              {[client.name || label('unknownClient'), client.version].filter(Boolean).join(' ')}
            </Typography.Text>
          </Tooltip>
          <Typography.Text type="secondary">
            {label('lastFetch')}: {IntlUtil.formatDate(client.lastSeen, datepicker)}
            {client.lastIp ? ` · ${label('subscriptionIP')}: ${client.lastIp}` : ''}
          </Typography.Text>
        </>
      ) : (
        <Typography.Text type="secondary">{label('noSubscriptionClient')}</Typography.Text>
      )}
      <Typography.Text type="secondary">{label('subscriptionClientNote')}</Typography.Text>
    </section>
  );
}
