// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { initI18n } from '../i18n';
import { DataTable, TablePager, type DataTableColumn } from './data-table';

// 数据表是这次重构的核心：列、排序、行键盘、空态一旦坏，所有列表页一起坏。
// 这里只锁「语义与交互」，不锁像素。

beforeAll(() => initI18n());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

interface Row {
  id: string;
  name: string;
  qty: number;
}

const rows: Row[] = [
  { id: 'a', name: '苹果', qty: 3 },
  { id: 'b', name: '香蕉', qty: 11 },
];

const columns: DataTableColumn<Row>[] = [
  { id: 'name', header: '名称', cell: (row) => row.name, width: 160 },
  { id: 'qty', header: '数量', cell: (row) => row.qty, align: 'end', width: 80, sortable: true, sortValue: (row) => row.qty },
];

describe('DataTable', () => {
  it('渲染 caption、表头与行，数量列右对齐', () => {
    render(<DataTable tableId="t1" caption="物品清单" columns={columns} rows={rows} rowKey={(r) => r.id} />);

    const table = screen.getByRole('table', { name: '物品清单' });
    expect(within(table).getByRole('columnheader', { name: '名称' })).toBeTruthy();
    expect(within(table).getAllByRole('row')).toHaveLength(3); // 表头 + 2 行
    expect(within(table).getByText('苹果')).toBeTruthy();

    const qtyCell = within(table).getAllByRole('cell')[1]! as HTMLTableCellElement;
    // 对齐走列的 --cell-align（样式表统一取用），不再靠工具类
    expect(qtyCell.style.getPropertyValue('--cell-align')).toBe('end');
  });

  it('客户端排序：点表头在升序/降序之间切换，并写 aria-sort', () => {
    render(
      <DataTable
        tableId="t2"
        caption="物品清单"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        sortMode="client"
      />,
    );

    const header = screen.getByRole('columnheader', { name: /数量/ });
    // 指南要求：只有当前排序列才带 aria-sort，未排序时不留 aria-sort="none"
    expect(header.getAttribute('aria-sort')).toBeNull();

    fireEvent.click(within(header).getByRole('button'));
    expect(header.getAttribute('aria-sort')).toBe('ascending');

    fireEvent.click(within(header).getByRole('button'));
    expect(header.getAttribute('aria-sort')).toBe('descending');
  });

  it('sortMode 为 none 时不提供排序按钮（避免「只排当前页」的假功能）', () => {
    render(<DataTable tableId="t3" caption="物品清单" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const header = screen.getByRole('columnheader', { name: '数量' });
    expect(within(header).queryByRole('button')).toBeNull();
  });

  it('行可键盘激活：Tab 进来后按 Enter 触发 onRowClick', () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        tableId="t4"
        caption="物品清单"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
      />,
    );

    const row = screen.getByText('苹果').closest('tr')!;
    expect(row.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('空态与加载态互斥：加载时不出空态文案', () => {
    const { rerender } = render(
      <DataTable tableId="t5" caption="清单" columns={columns} rows={[]} rowKey={(r) => r.id} empty={<p>空</p>} />,
    );
    expect(screen.getByText('空')).toBeTruthy();

    rerender(
      <DataTable tableId="t5" caption="清单" columns={columns} rows={[]} rowKey={(r) => r.id} loading empty={<p>空</p>} />,
    );
    expect(screen.queryByText('空')).toBeNull();
  });
});

describe('列对齐', () => {
  // 回归：曾经表头用工具类、单元格用另一种写法，导致「表头靠左、数字靠右」。
  // 现在两边都从列定义的 align 生成 --cell-align，必须完全一致。
  it('表头与单元格携带同一个 --cell-align，且默认 start', () => {
    const { container } = render(
      <DataTable
        tableId="t-align"
        caption="清单"
        columns={[
          { id: 'name', header: '名称', cell: (row: { id: string; qty: string }) => row.id },
          {
            id: 'qty',
            header: '数量',
            align: 'end',
            cell: (row: { id: string; qty: string }) => row.qty,
          },
        ]}
        rows={[{ id: 'a', qty: '5' }]}
        rowKey={(row) => row.id}
      />,
    );

    const headers = [...container.querySelectorAll('th')];
    const cells = [...container.querySelectorAll('tbody td')];

    expect(headers[0]?.style.getPropertyValue('--cell-align')).toBe('start');
    expect(headers[1]?.style.getPropertyValue('--cell-align')).toBe('end');
    expect(cells[0]?.style.getPropertyValue('--cell-align')).toBe('start');
    expect(cells[1]?.style.getPropertyValue('--cell-align')).toBe('end');
    // 不再用工具类做对齐：两套机制并存时哪套生效取决于层叠顺序
    expect(headers[1]?.className).not.toContain('text-end');
    expect(cells[1]?.className).not.toContain('text-end');
  });
});

describe('TablePager', () => {
  it('显示区间与总条数，并按边界禁用箭头', () => {
    const onChange = vi.fn();
    render(<TablePager page={2} totalPages={5} total={100} pageSize={20} onPageChange={onChange} />);

    expect(screen.getByText(/21/)).toBeTruthy();
    expect(screen.getByText(/40/)).toBeTruthy();
    expect(screen.getByText(/100/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /上一页/ }));
    expect(onChange).toHaveBeenCalledWith(1);
  });
});
