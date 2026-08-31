import { Button, Text, Title1 } from '@fluentui/react-components';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { errorI18nKey, isApiError } from '../../api/http';
import { testEmail, type EmailTestResult } from '../../api/admin';

// 邮件连通性测试（AD04）：触发服务端向系统管理员邮箱发送测试邮件并展示结果。
export function TestEmailPage() {
  const { t } = useTranslation();

  const runMutation = useMutation({
    mutationFn: () => testEmail(),
  });

  const result = runMutation.data as EmailTestResult | undefined;

  return (
    <div className="flex flex-col gap-4">
      <Title1 as="h1">{t('admin.testEmail.title')}</Title1>

      <Text>{t('admin.testEmail.description')}</Text>

      <div className="flex items-center gap-3">
        <Button
          appearance="primary"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
        >
          {runMutation.isPending ? t('common.loading') : t('admin.testEmail.send')}
        </Button>
      </div>

      {runMutation.isError && (
        <Text className="text-red-600">
          {isApiError(runMutation.error)
            ? t(errorI18nKey(runMutation.error.code))
            : t('errors.UNKNOWN')}
        </Text>
      )}

      {result && (
        <div
          className={`rounded-md p-4 ${
            result.ok ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'
          }`}
        >
          <Text>{result.ok ? t('admin.testEmail.success') : t('admin.testEmail.failure')}</Text>
          <div className="mt-2 flex flex-col gap-1 text-sm">
            <span>
              {t('admin.testEmail.provider')}: {result.provider}
            </span>
            {result.reason && (
              <span>
                {t('admin.testEmail.reason')}: {result.reason}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
