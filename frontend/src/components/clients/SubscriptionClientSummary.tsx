import { Tooltip, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { SubscriptionClientInfo } from '@/generated/zod';
import { IntlUtil, type CalendarKind } from '@/utils';

export default function SubscriptionClientSummary({
  client,
  datepicker = 'gregorian',
  customerView = false,
}: {
  client?: SubscriptionClientInfo | null;
  datepicker?: CalendarKind;
  customerView?: boolean;
}) {
  const { t } = useTranslation();
  const label = (key: string) => t(`pages.clients.devices.${key}`);
  const clientName = client?.name || label('unknownClient');
  return (
    <section className="subscription-client-summary">
      <Typography.Title level={5}>{label('subscriptionClient')}</Typography.Title>
      {client ? (
        <>
          {customerView ? (
            <Typography.Text strong>{clientName}</Typography.Text>
          ) : (
            <>
              <Tooltip title={client.userAgent || undefined}>
                <Typography.Text strong>
                  {[clientName, client.version].filter(Boolean).join(' ')}
                </Typography.Text>
              </Tooltip>
              <Typography.Text type="secondary">
                {label('lastFetch')}: {IntlUtil.formatDate(client.lastSeen, datepicker)}
                {client.lastIp ? ` · ${label('subscriptionIP')}: ${client.lastIp}` : ''}
              </Typography.Text>
            </>
          )}
        </>
      ) : (
        <Typography.Text type="secondary">{label('noSubscriptionClient')}</Typography.Text>
      )}
      <Typography.Text type="secondary">
        {customerView
          ? '根据最近的订阅请求识别，不代表当前连接的软件。'
          : label('subscriptionClientNote')}
      </Typography.Text>
    </section>
  );
}
