import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from './button';

/**
 * 列表分页条：总数文案 + 上一页/下一页。
 *
 * 箭头按钮必须有可访问名称——只写 `←` / `→` 时屏幕阅读器只会读出「左箭头」，
 * 用户无法判断按钮作用（见 modern-web-guidance: accessibility「Choosing the name」）。
 */
export function Pagination({
  page,
  totalPages,
  onChange,
  totalLabel,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  totalLabel?: string;
}) {
  const { t } = useTranslation();

  if (totalPages <= 1) {
    return totalLabel ? (
      <div className="flex items-center justify-between gap-2 text-sm text-ink-muted">
        <span>{totalLabel}</span>
      </div>
    ) : null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
      <span>{totalLabel}</span>
      <nav aria-label={t('common.pagination')} className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={page <= 1}
          aria-label={t('common.previousPage')}
          onClick={() => onChange(Math.max(1, page - 1))}
          icon={<ChevronLeft aria-hidden className="size-4" />}
        />
        <span aria-live="polite" className="tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={page >= totalPages}
          aria-label={t('common.nextPage')}
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          icon={<ChevronRight aria-hidden className="size-4" />}
        />
      </nav>
    </div>
  );
}
