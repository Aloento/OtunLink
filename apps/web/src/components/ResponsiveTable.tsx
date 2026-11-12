import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useMediaQuery } from '../layout/useMediaQuery';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRegion, TableRow } from '../ui/table';

// 响应式数据容器：桌面/平板渲染表格，手机（<768）渲染卡片列表。
//
// 表格侧遵循 responsive-table 指南：语义化 <table>/<thead>/<th scope="col">，
// 可滚动区域用 role="region" + aria-label 命名，并加 tabindex 让纯键盘用户
// 能滚动表格；表头 sticky，滚动时始终能对上列名。

export interface ResponsiveTableColumn<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  /**
   * 列对齐。数字/金额列用 'end'：表头与单元格**同时**右对齐，
   * 才不会出现「表头靠左、内容靠右」的错位。
   */
  align?: 'end';
}

export function ResponsiveTable<T>({
  columns,
  items,
  rowKey,
  emptyText,
  actions,
  label,
}: {
  columns: ResponsiveTableColumn<T>[];
  items: T[];
  rowKey: (item: T) => string;
  emptyText: string;
  /** 可选操作列（桌面为末列，移动端渲染在卡片底部）。 */
  actions?: (item: T) => ReactNode;
  /** 表格区域的可访问名称；缺省用空态文案代替。 */
  label?: string;
}) {
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 767px)');

  if (items.length === 0) {
    return <p className="text-sm text-ink-subtle">{emptyText}</p>;
  }

  if (isMobile) {
    return (
      // Safari 在 display:flex 的列表上会丢弃 list 语义，显式 role="list" 补回。
      <ul role="list" className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={rowKey(item)} className="rounded-card border border-line bg-surface p-4">
            <dl className="flex flex-col gap-1.5">
              {columns.map((col) => (
                <div key={col.key} className="flex min-w-0 items-baseline gap-3">
                  <dt className="shrink-0 text-xs text-ink-subtle">{col.header}</dt>
                  <dd className="min-w-0 flex-1 text-end wrap-break-word">{col.render(item)}</dd>
                </div>
              ))}
            </dl>
            {actions ? (
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">{actions(item)}</div>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <TableRegion label={label ?? emptyText}>
      <Table>
        <caption className="sr-only">{label ?? emptyText}</caption>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={col.align === 'end' ? 'text-end' : undefined}>
                {col.header}
              </TableHead>
            ))}
            {actions ? <TableHead className="text-end">{t('common.actions')}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={rowKey(item)} className="hover:bg-surface-muted/60">
              {columns.map((col) => (
                <TableCell key={col.key} className={col.align === 'end' ? 'text-end tabular-nums' : undefined}>
                  {col.render(item)}
                </TableCell>
              ))}
              {actions ? (
                <TableCell>
                  <div className="flex flex-wrap items-center justify-end gap-2">{actions(item)}</div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableRegion>
  );
}
