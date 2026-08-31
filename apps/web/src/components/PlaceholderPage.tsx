import { Body1, Button, Title1 } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

// 业务页面占位（ck-03）：后续 checkpoint 替换为真实页面。
export function PlaceholderPage({ title, description }: { title: string; description?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <Title1 as="h1">{title}</Title1>
      <Body1>{description ?? t('placeholder.title')}</Body1>
      <div>
        <Link to="/">
          <Button appearance="subtle">{t('common.backHome')}</Button>
        </Link>
      </div>
    </div>
  );
}
