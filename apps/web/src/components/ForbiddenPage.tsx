import { useTranslation } from 'react-i18next';

export function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('forbidden.title')}</h1>
      <p className="text-sm text-ink-muted">{t('forbidden.description')}</p>
    </div>
  );
}
