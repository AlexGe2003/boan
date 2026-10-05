import { lazy, Suspense, useState } from 'react';
import { Alert, Button, Empty, Modal, Select, Spin } from 'antd';
import { usePanelRole } from '@/api/queries/usePanelRole';
import { useClientOptions } from '@/api/queries/useClientOptions';

const ClientActivity = lazy(() => import('../clients/ClientActivity'));

export default function ClientVisitsButton() {
  const role = usePanelRole();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string>();
  const clients = useClientOptions(open && role === 'admin');
  if (role !== 'admin') return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>用户访问记录</Button>
      <Modal
        open={open}
        title="用户访问记录 · 本机网站与分类"
        width={1120}
        styles={{ body: { maxHeight: '75vh', overflowY: 'auto', paddingRight: 4 } }}
        footer={null}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        {clients.isError ? (
          <Alert
            type="error"
            title="用户列表加载失败"
            action={<Button onClick={() => void clients.refetch()}>重试</Button>}
          />
        ) : (
          <Select
            showSearch
            aria-label="选择要查看的用户"
            placeholder="选择用户，查看其访问的网站"
            style={{ width: '100%', marginBottom: 16 }}
            value={email}
            onChange={setEmail}
            loading={clients.isFetching}
            options={(clients.data || []).map((value) => ({ value, label: value }))}
          />
        )}
        {open && email ? (
          <Suspense fallback={<Spin />}>
            <ClientActivity key={email} email={email} />
          </Suspense>
        ) : (
          <Empty description="选择用户后显示访问域名、连接次数和网站分类" />
        )}
      </Modal>
    </>
  );
}
