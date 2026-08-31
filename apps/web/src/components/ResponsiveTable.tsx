import {
  Body1,
  Caption1,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@fluentui/react-components';
import type { ReactNode } from 'react';

import { useMediaQuery } from '../layout/useMediaQuery';

// 响应式数据容器：桌面/平板渲染表格，手机（<768）渲染卡片列表。

export interface ResponsiveTableColumn<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
}

export function ResponsiveTable<T>({
  columns,
  items,
  rowKey,
  emptyText,
}: {
  columns: ResponsiveTableColumn<T>[];
  items: T[];
  rowKey: (item: T) => string;
  emptyText: string;
}) {
  const isMobile = useMediaQuery('(max-width: 767px)');

  if (items.length === 0) {
    return <Body1>{emptyText}</Body1>;
  }

  if (isMobile) {
    return (
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <Card key={rowKey(item)} className="p-4">
            {columns.map((col) => (
              <div key={col.key} className="mb-2 flex items-baseline justify-between gap-3">
                <Caption1 className="text-neutral-500">{col.header}</Caption1>
                <div className="text-right">{col.render(item)}</div>
              </div>
            ))}
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHeaderCell key={col.key}>{col.header}</TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={rowKey(item)}>
              {columns.map((col) => (
                <TableCell key={col.key}>{col.render(item)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
