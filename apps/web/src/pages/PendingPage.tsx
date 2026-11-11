import { useTranslation } from 'react-i18next';

import type { MeUser } from '../api/client';
import { useLogout } from '../auth/SessionProvider';
import { Button } from '../ui/button';

// PENDING / DISABLED 引导页：等待管理员分配岗位或联系管理员。
export function PendingPage({ me, onRefresh }: { me: MeUser; onRefresh: () => void }) {
  const { t } = useTranslation();
  const logout = useLogout();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{me.name}</h1>
      {me.status === 'PENDING' ? (
        <p className="max-w-xl text-sm text-ink-muted">{t('pending.waiting')}</p>
      ) : (
        <p className="max-w-xl text-sm text-ink-muted">{t('pending.disabled')}</p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" onClick={onRefresh}>
          {t('pending.refresh')}
        </Button>
        <Button variant="secondary" onClick={logout}>
          {t('pending.logout')}
        </Button>
      </div>
    </div>
  );
}
