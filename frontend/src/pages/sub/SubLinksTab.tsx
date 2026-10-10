import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, QRCode, Tag, Tooltip } from 'antd';
import { CheckOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';

import SubQrButton from './SubQrButton';

interface SubLinksTabProps {
  subUrl: string;
  subJsonUrl: string;
  subClashUrl: string;
  onCopy: (value: string) => void;
}

const appendRawView = (url: string) => `${url}${url.includes('?') ? '&' : '?'}view=raw`;

export default function SubLinksTab({ subUrl, subJsonUrl, subClashUrl, onCopy }: SubLinksTabProps) {
  const { t } = useTranslation();
  const [copiedKind, setCopiedKind] = useState<string | null>(null);

  const handleCopy = (kind: string, url: string) => {
    onCopy(url);
    setCopiedKind(kind);
    setTimeout(() => {
      setCopiedKind((curr) => (curr === kind ? null : curr));
    }, 2000);
  };

  const rows = [
    {
      kind: 'SUB',
      color: 'blue',
      url: subUrl,
      title: t('subscription.standardTitle'),
      hint: t('subscription.standardHint'),
      downloadable: false,
    },
    {
      kind: 'CLASH',
      color: 'gold',
      url: subClashUrl,
      title: t('subscription.clashTitle'),
      hint: t('subscription.clashHint'),
      downloadable: true,
    },
    {
      kind: 'JSON',
      color: 'purple',
      url: subJsonUrl,
      title: t('subscription.jsonTitle'),
      hint: t('subscription.jsonHint'),
      downloadable: true,
    },
  ].filter((row) => row.url);

  return (
    <div className="sub-rows">
      <p className="sub-muted">{t('subscription.manualHelp')}</p>
      {rows.map((row) => {
        const isCopied = copiedKind === row.kind;
        return (
          <div key={row.kind} className="sub-row sub-link-card">
            <Tag color={row.color} className="sub-row-tag">
              {row.kind}
            </Tag>
            <div className="sub-row-main">
              <a href={row.url} target="_blank" rel="noopener noreferrer" className="sub-row-title">
                {row.title}
              </a>
              <div className="sub-muted">{row.hint}</div>
              <div className="sub-row-url" dir="ltr" title={row.url}>
                {row.url}
              </div>
            </div>
            <div className="sub-row-actions">
              {row.downloadable && (
                <Tooltip title={t('download')}>
                  <Button
                    href={appendRawView(row.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    icon={<DownloadOutlined />}
                    aria-label={t('download')}
                  />
                </Tooltip>
              )}
              <Tooltip title={isCopied ? '已复制！' : t('copy')}>
                <Button
                  type={isCopied ? 'default' : 'primary'}
                  icon={isCopied ? <CheckOutlined style={{ color: '#10b981' }} /> : <CopyOutlined />}
                  onClick={() => handleCopy(row.kind, row.url)}
                  aria-label={t('copy')}
                  className={isCopied ? 'sub-btn-copied' : ''}
                >
                  {isCopied ? <span style={{ color: '#10b981', marginLeft: 4 }}>已复制</span> : null}
                </Button>
              </Tooltip>
              <SubQrButton value={row.url} label={row.title} onCopy={onCopy} />
            </div>
          </div>
        );
      })}
      {subUrl && (
        <div className="sub-qr-card">
          <div className="sub-qr-code">
            <QRCode
              value={subUrl}
              size={112}
              type="svg"
              bordered={false}
              color="#000000"
              bgColor="#ffffff"
            />
          </div>
          <div className="sub-qr-info">
            <div className="sub-qr-title">{t('subscription.scanTitle')}</div>
            <div className="sub-muted">{t('subscription.scanHint')}</div>
            <div className="sub-qr-extra-tip">支持使用支持扫码的客户端直接对准二维码扫描导入。</div>
          </div>
        </div>
      )}
    </div>
  );
}
