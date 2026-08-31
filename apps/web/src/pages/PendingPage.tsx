import { useMsal } from '@azure/msal-react';
import { Body1, Button, Title1 } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';

import type { MeUser } from '../api/client';

// PENDING / DISABLED 引导页：等待管理员分配岗位或联系管理员。
export function PendingPage({ me, onRefresh }: { me: MeUser; onRefresh: () => void }) {
  const { instance } = useMsal();
  const { t } = useTranslation();

  const logout = () => instance.logoutRedirect();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Title1 as="h1">{me.name}</Title1>
      {me.status === 'PENDING' ? (
        <Body1>{t('pending.waiting')}</Body1>
      ) : (
        <Body1>{t('pending.disabled')}</Body1>
      )}
      <div className="flex gap-2">
        <Button appearance="primary" onClick={onRefresh}>
          {t('pending.refresh')}
        </Button>
        <Button onClick={logout}>{t('pending.logout')}</Button>
      </div>
    </div>
  );
}
