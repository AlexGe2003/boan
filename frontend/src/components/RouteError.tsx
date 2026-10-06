import { Button, Result, Space } from 'antd';
import { useRouteError } from 'react-router';
import { useTranslation } from 'react-i18next';

export function isResourceLoadError(error: unknown): boolean {
  return error instanceof Error && /Unable to preload CSS|Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed/i.test(error.message);
}

export default function RouteError() {
  const error = useRouteError();
  const { t } = useTranslation();
  const resourceError = isResourceLoadError(error);
  return (
    <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <Result
        status="warning"
        title={t(resourceError ? 'pageLoadError.resourceTitle' : 'pageLoadError.title')}
        subTitle={t(resourceError ? 'pageLoadError.resourceHint' : 'pageLoadError.hint')}
        extra={<Space wrap>
          <Button type="primary" onClick={() => window.location.reload()}>{t('pageLoadError.retry')}</Button>
          <Button href={`${window.X_UI_BASE_PATH || '/'}panel/`}>{t('pageLoadError.home')}</Button>
        </Space>}
      />
    </main>
  );
}
