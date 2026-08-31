import { Button, Body1, Title1 } from '@fluentui/react-components';
import { useMsal } from '@azure/msal-react';

import type { MeUser } from '../api/client';

export function HomePage({ me }: { me: MeUser }) {
  const { instance } = useMsal();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Title1 as="h1">欢迎，{me.name}</Title1>
      <Body1>
        岗位：{me.role ?? '未分配'} · 状态：{me.status}
      </Body1>
      <Button onClick={() => instance.logoutRedirect()}>登出</Button>
    </div>
  );
}
