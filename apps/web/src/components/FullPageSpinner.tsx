import { useTranslation } from 'react-i18next';

import { Spinner } from '../ui/spinner';

export function FullPageSpinner() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner size="lg" label={t('common.loading')} />
    </div>
  );
}
