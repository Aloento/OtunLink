import { Spinner } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';

export function FullPageSpinner() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner label={t('common.loading')} />
    </div>
  );
}
