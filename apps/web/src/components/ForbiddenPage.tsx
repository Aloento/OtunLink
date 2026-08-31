import { Body1, Title1 } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';

export function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <Title1 as="h1">{t('forbidden.title')}</Title1>
      <Body1>{t('forbidden.description')}</Body1>
    </div>
  );
}
