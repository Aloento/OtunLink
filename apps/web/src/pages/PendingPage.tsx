import { Button, Body1, Title1 } from '@fluentui/react-components';
import { useMsal } from '@azure/msal-react';

import type { MeUser } from '../api/client';

export function PendingPage({ me, onRefresh }: { me: MeUser; onRefresh: () => void }) {
  const { instance } = useMsal();

  const logout = () => instance.logoutRedirect();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Title1 as="h1">欢迎，{me.name}</Title1>
      {me.status === 'PENDING' ? (
        <Body1>您的账号尚未分配岗位，请等待管理员在「用户管理」中完成分配后刷新。</Body1>
      ) : (
        <Body1>您的账号已停用，请联系管理员。</Body1>
      )}
      <div className="flex gap-2">
        <Button appearance="primary" onClick={onRefresh}>
          刷新
        </Button>
        <Button onClick={logout}>登出</Button>
      </div>
    </div>
  );
}
