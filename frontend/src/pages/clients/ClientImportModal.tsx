import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Input, Modal, Table, Typography } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import {
  CLIENT_BACKUP_MAX_BYTES,
  parseClientBackup,
  type ClientImportResult,
} from './clientBackup';

export default function ClientImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (data: string) => Promise<ClientImportResult>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ClientImportResult | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => {
    if (!text.trim()) return { items: [], error: '' };
    try {
      return { items: parseClientBackup(text), error: '' };
    } catch (e) {
      return { items: [], error: e instanceof Error ? e.message : '文件读取失败' };
    }
  }, [text]);
  async function load(file: File) {
    setError('');
    setResult(null);
    setFilename(file.name);
    setText('');
    if (file.size > CLIENT_BACKUP_MAX_BYTES) {
      setError('备份文件不能超过 10 MB');
      return;
    }
    setBusy(true);
    try {
      setText(await file.text());
    } catch {
      setError('无法读取文件，请重新选择');
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!preview.items.length || busy || result) return;
    setBusy(true);
    setError('');
    try {
      setResult(await onImport(JSON.stringify(preview.items)));
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败，请重试');
    } finally {
      setBusy(false);
    }
  }
  const skipped = result?.skipped ?? [];
  const unique = new Set(preview.items.map((item) => item.client.email));
  return (
    <Modal
      open
      centered
      width={720}
      title={t('pages.clients.import')}
      okText={result ? '导入已完成' : '开始导入'}
      cancelText={result ? '关闭' : '取消'}
      rootClassName="client-import-modal"
      mask={{ closable: false }}
      confirmLoading={busy}
      okButtonProps={{ disabled: !preview.items.length || !!result }}
      onOk={() => void restore()}
      onCancel={() => !busy && onClose()}
      styles={{ body: { maxHeight: '60vh', overflowY: 'auto' } }}
    >
      <Alert
        type="info"
        showIcon
        title="新增恢复，已有用户不会被覆盖"
        description="导入订阅配置、额度、到期时间和入站关联。目标入站需预先存在；重复账号、无效配置会跳过，并显示原因。登录账号、订单和历史流量请使用面板完整备份。"
        style={{ marginBottom: 16 }}
      />
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        aria-label="选择用户备份文件"
        hidden
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void load(file);
        }}
      />
      <Button icon={<UploadOutlined />} disabled={busy} onClick={() => input.current?.click()}>
        选择 JSON 备份文件
      </Button>
      {filename && (
        <Typography.Paragraph style={{ marginTop: 8, overflowWrap: 'anywhere' }}>
          {filename}
        </Typography.Paragraph>
      )}
      <Input.TextArea
        aria-label="用户备份 JSON"
        placeholder="也可以在这里粘贴导出的 JSON"
        rows={5}
        disabled={busy}
        value={text}
        style={{ marginBlock: 16 }}
        onChange={(e) => {
          setText(e.target.value);
          setFilename('');
          setResult(null);
          setError('');
        }}
      />
      {(error || preview.error) && (
        <Alert type="error" title={error || preview.error} style={{ marginBottom: 16 }} />
      )}
      {preview.items.length > 0 && (
        <>
          <Typography.Paragraph>
            待导入 {preview.items.length} 条 ·{' '}
            {preview.items.filter((item) => item.inboundIds.length > 0).length} 条有关联入站 ·{' '}
            {preview.items.length - unique.size} 条文件内重复记录
          </Typography.Paragraph>
          <Table
            size="small"
            rowKey="backupKey"
            pagination={false}
            dataSource={preview.items
              .slice(0, 20)
              .map((item, index) => ({ ...item, backupKey: index }))}
            columns={[
              { title: '用户标识', render: (_, row) => row.client.email },
              { title: '关联入站 ID', render: (_, row) => row.inboundIds.join('、') || '无关联' },
            ]}
            scroll={{ x: 400 }}
          />
          {preview.items.length > 20 && (
            <Typography.Text type="secondary">预览前 20 条，导入会处理全部配置。</Typography.Text>
          )}
        </>
      )}
      {result && (
        <div style={{ marginTop: 16 }}>
          <Alert
            type={skipped.length ? 'warning' : 'success'}
            showIcon
            title={`已新增 ${result.created} 位用户，跳过 ${skipped.length} 条`}
          />
          {skipped.length > 0 && (
            <Table
              size="small"
              rowKey="backupKey"
              pagination={{ pageSize: 10, showSizeChanger: false }}
              dataSource={skipped.map((item, index) => ({ ...item, backupKey: index }))}
              columns={[
                { title: '用户', dataIndex: 'email' },
                { title: '跳过原因', dataIndex: 'reason' },
              ]}
              scroll={{ x: 400 }}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
