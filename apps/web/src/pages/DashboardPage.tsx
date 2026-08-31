import { Body1, Title1 } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';

// 工作台占位（ck-03）：后续 checkpoint 实现待办聚合。
export function DashboardPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <Title1 as="h1">{t('dashboard.title')}</Title1>
      <Body1>{t('dashboard.description')}</Body1>
    </div>
  );
}
