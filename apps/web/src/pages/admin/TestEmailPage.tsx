import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { errorI18nKey, isApiError } from '../../api/http';
import { testEmail, type EmailTestResult } from '../../api/admin';
import { Button } from '../../ui/button';
import { PageHeader } from '../../ui/page-header';

// 邮件连通性测试（AD04）：触发服务端向系统管理员邮箱发送测试邮件并展示结果。
export function TestEmailPage() {
  const { t } = useTranslation();

  const runMutation = useMutation({
    mutationFn: () => testEmail(),
    // 只发一封测试邮件、不改动任何业务数据，无需连带刷新全局缓存。
    meta: { skipRefresh: true },
  });

  const result = runMutation.data as EmailTestResult | undefined;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('admin.testEmail.title')}
        description={t('admin.testEmail.description')}
      />

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          loading={runMutation.isPending}
          disabled={runMutation.isPending}
          onClick={() => runMutation.mutate()}
        >
          {t('admin.testEmail.send')}
        </Button>
      </div>

      {runMutation.isError && (
        <p role="alert" className="text-sm text-danger-600">
          {isApiError(runMutation.error)
            ? t(errorI18nKey(runMutation.error.code))
            : t('errors.UNKNOWN')}
        </p>
      )}

      {result && (
        <div
          role="status"
          className={`rounded-card border p-4 ${
            result.ok
              ? 'border-success-200 bg-success-50 text-success-600'
              : 'border-warning-200 bg-warning-50 text-warning-700'
          }`}
        >
          <p className="text-sm font-medium">
            {result.ok ? t('admin.testEmail.success') : t('admin.testEmail.failure')}
          </p>
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
