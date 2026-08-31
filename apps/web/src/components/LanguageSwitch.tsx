import { Button } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';

import type { AppLocale } from '@otunlink/shared';

import { useLocale } from '../i18n/LocaleProvider';

// 语言切换：在 zh-CN / en 间切换并持久化（localStorage）。
export function LanguageSwitch() {
  const { locale, setLocale } = useLocale();
  const { t } = useTranslation();

  const next: AppLocale = locale === 'zh-CN' ? 'en' : 'zh-CN';
  const label = locale === 'zh-CN' ? 'EN' : '中文';

  return (
    <Button
      size="small"
      appearance="subtle"
      title={t('common.switchLanguage')}
      aria-label={t('common.switchLanguage')}
      onClick={() => setLocale(next)}
    >
      {label}
    </Button>
  );
}
