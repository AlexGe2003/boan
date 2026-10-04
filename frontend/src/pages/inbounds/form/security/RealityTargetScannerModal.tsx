import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Input, Modal, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import type { RealityScanResult } from '@/generated/types';

// xray-core ML-DSA-65 REALITY min peer cert-chain size (not defined in this repo).
export const MLDSA65_MIN_CERT_CHAIN_BYTES = 3500;

interface RealityTargetScannerModalProps {
  open: boolean;
  onClose: () => void;
  scanRealityCandidates: (targets?: string) => Promise<RealityScanResult[]>;
  onPick: (result: RealityScanResult) => void;
  mldsa65Enabled?: boolean;
}

export default function RealityTargetScannerModal({
  open,
  onClose,
  scanRealityCandidates,
  onPick,
  mldsa65Enabled = false,
}: RealityTargetScannerModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RealityScanResult[]>([]);
  const scanRef = useRef(scanRealityCandidates);
  useEffect(() => {
    scanRef.current = scanRealityCandidates;
  });

  const requestId = useRef(0);
  const [error, setError] = useState('');

  const runScan = useCallback(async (targets?: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    setResults([]);
    try {
      const rows = await scanRef.current(targets);
      if (id === requestId.current) setResults(rows);
    } catch (cause) {
      if (id === requestId.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      void runScan();
    }
    return () => {
      requestId.current++;
    };
  }, [open, runScan]);

  const reasonText = (row: RealityScanResult) => {
    if (row.privateTarget) return t('pages.inbounds.form.scanReasonPrivate');
    if (row.reason.includes('lookup ')) return t('pages.inbounds.form.scanReasonDNS');
    if (/timeout|deadline exceeded/i.test(row.reason))
      return t('pages.inbounds.form.scanReasonTimeout');
    if (row.reason.startsWith('connection failed:'))
      return t('pages.inbounds.form.scanReasonConnection');
    if (row.reason.startsWith('TLS handshake failed:'))
      return t('pages.inbounds.form.scanReasonTLS');
    if (row.reason.startsWith('certificate not trusted:'))
      return t('pages.inbounds.form.scanReasonCert');
    if (row.reason === 'server does not negotiate TLS 1.3')
      return t('pages.inbounds.form.scanReasonTLS13');
    if (row.reason === 'server does not negotiate HTTP/2 (h2)')
      return t('pages.inbounds.form.scanReasonH2');
    if (row.reason === 'server did not use X25519 key exchange')
      return t('pages.inbounds.form.scanReasonCurve');
    return row.reason;
  };
  const usable = (row: RealityScanResult) =>
    row.feasible && (!mldsa65Enabled || row.certChainBytes >= MLDSA65_MIN_CERT_CHAIN_BYTES);

  const columns: ColumnsType<RealityScanResult> = [
    {
      title: t('pages.inbounds.form.target'),
      dataIndex: 'target',
      key: 'target',
      width: 200,
      render: (target: string, row) => (
        <Tooltip title={row.ip ? `${target} — ${row.ip}` : target}>
          <div style={{ lineHeight: 1.25 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {target}
            </div>
            {row.ip ? <div style={{ color: '#999', fontSize: 12 }}>{row.ip}</div> : null}
          </div>
        </Tooltip>
      ),
    },
    {
      title: t('pages.inbounds.form.scanStatus'),
      dataIndex: 'feasible',
      key: 'feasible',
      width: 95,
      render: (feasible: boolean, row) =>
        feasible ? (
          <Tag color="success">{t('pages.inbounds.form.scanFeasible')}</Tag>
        ) : (
          <Tag color="warning">
            {t(
              row.tlsVersion
                ? 'pages.inbounds.form.scanNotFeasible'
                : 'pages.inbounds.form.scanProbeFailed',
            )}
          </Tag>
        ),
    },
    {
      title: t('pages.inbounds.form.scanReason'),
      key: 'reason',
      width: 240,
      render: (_, row) =>
        row.reason ? (
          <div style={{ overflowWrap: 'anywhere' }}>
            <div>{reasonText(row)}</div>
            <details>
              <summary>{t('pages.inbounds.form.scanTechnicalDetails')}</summary>
              <Typography.Text type="secondary">{row.reason}</Typography.Text>
            </details>
          </div>
        ) : usable(row) ? (
          '—'
        ) : (
          t('pages.inbounds.form.scanMldsaCertChainTooSmall', {
            length: row.certChainBytes,
            min: MLDSA65_MIN_CERT_CHAIN_BYTES,
          })
        ),
    },
    {
      title: 'TLS',
      dataIndex: 'tlsVersion',
      key: 'tlsVersion',
      width: 60,
      render: (v: string) => v || '—',
    },
    {
      title: 'ALPN',
      dataIndex: 'alpn',
      key: 'alpn',
      width: 75,
      render: (v: string) => v || '—',
    },
    {
      title: t('pages.inbounds.form.scanCurve'),
      dataIndex: 'curveID',
      key: 'curveID',
      width: 160,
      ellipsis: true,
      render: (v: string) => v || '—',
    },
    {
      title: t('pages.inbounds.form.scanCert'),
      dataIndex: 'certSubject',
      key: 'certSubject',
      width: 160,
      ellipsis: true,
      render: (_: string, row) =>
        !row.tlsVersion ? (
          '—'
        ) : row.certValid ? (
          <Tooltip title={`${row.certSubject} (${row.certIssuer})`}>
            <span>{row.certSubject || '—'}</span>
          </Tooltip>
        ) : (
          <Tag>{t('pages.inbounds.form.scanCertInvalid')}</Tag>
        ),
    },
    {
      title: t('pages.inbounds.form.scanCertChain'),
      dataIndex: 'certChainBytes',
      key: 'certChainBytes',
      width: 100,
      render: (bytes: number) => {
        if (!bytes) return '—';
        if (mldsa65Enabled && bytes < MLDSA65_MIN_CERT_CHAIN_BYTES) {
          return (
            <Tooltip
              title={t('pages.inbounds.form.scanMldsaCertChainTooSmall', {
                length: bytes,
                min: MLDSA65_MIN_CERT_CHAIN_BYTES,
              })}
            >
              <Tag color="warning">{bytes} B</Tag>
            </Tooltip>
          );
        }
        return `${bytes} B`;
      },
    },
    {
      title: t('pages.inbounds.form.scanLatency'),
      dataIndex: 'latencyMs',
      key: 'latencyMs',
      width: 85,
      render: (v: number) => (v > 0 ? `${v} ms` : '—'),
    },
    {
      title: '',
      key: 'action',
      width: 64,
      fixed: 'right',
      render: (_, row) => (
        <Button
          type="link"
          size="small"
          disabled={!usable(row)}
          onClick={() => {
            onPick(row);
            onClose();
          }}
        >
          {t('pages.inbounds.form.scanUse')}
        </Button>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="rescan" onClick={() => runScan(query.trim() || undefined)} loading={loading}>
          {t('pages.inbounds.form.scanRescan')}
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          {t('close')}
        </Button>,
      ]}
      title={t('pages.inbounds.form.scanModalTitle')}
      width={1080}
    >
      <Space orientation="vertical" size="small" style={{ width: '100%' }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t('pages.inbounds.form.scanModalDesc')}
        </Typography.Paragraph>
        <Input.Search
          allowClear
          enterButton={t('pages.inbounds.form.scan')}
          loading={loading}
          disabled={loading}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onSearch={() => runScan(query.trim() || undefined)}
          placeholder={t('pages.inbounds.form.scanDiscoverPlaceholder')}
        />
        {error ? (
          <Alert
            type="error"
            showIcon
            title={t('pages.inbounds.toasts.scanRealityTargetError')}
            description={error}
          />
        ) : null}
        <Typography.Text type="secondary" role="status">
          {loading
            ? t('pages.inbounds.form.scanRunning')
            : t('pages.inbounds.form.scanSummary', {
                total: results.length,
                usable: results.filter(usable).length,
              })}
        </Typography.Text>
        <Table<RealityScanResult>
          size="small"
          rowKey="target"
          loading={loading}
          columns={columns}
          dataSource={results}
          pagination={false}
          locale={{
            emptyText: loading
              ? t('pages.inbounds.form.scanRunning')
              : error
                ? t('pages.inbounds.toasts.scanRealityTargetError')
                : t('pages.inbounds.form.scanEmpty'),
          }}
          scroll={{ x: 1300, y: 360 }}
        />
      </Space>
    </Modal>
  );
}
