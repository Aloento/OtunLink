import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, Columns3 } from 'lucide-react';
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../lib/cn';
import { usePersistentState } from '../lib/usePersistentState';
import { Empty } from './empty';
import { SkeletonRows } from './skeleton';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

// ---------------------------------------------------------------------------
// DataTable：面向 ERP 的高密度数据表。
//
// 为什么用 TanStack Table 而不是手写：表格需要的状态位（列宽、列显隐、排序、
// 未来的分组/行选择）会互相纠缠，headless 库把「状态机」这部分拿走后，我们只写
// 单元格渲染与样式。渲染仍然是原生 <table>，读屏软件的表格导航、行列朗读、
// 表头关联全部由浏览器提供，不引入 role="grid" 这类自建语义。
//
// 排序默认不做：数据在服务端分页时，对「当前页」排序会让用户以为排的是全量，
// 这是 ERP 里最容易造成误判的假功能。要么由调用方接管（sortMode="server"），
// 要么在整表一次性加载时用 sortMode="client"。
// ---------------------------------------------------------------------------

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  width?: number;
  minWidth?: number;
  align?: 'start' | 'end';
  sortable?: boolean;
  /**
   * 客户端排序的取值函数。不提供则该列不可排序 —— 排序整行对象没有意义，
   * 强行「排一下」只会得到看起来随机的结果。
   */
  sortValue?: (row: T) => string | number | null | undefined;
  /** 允许用户在「列」菜单里隐藏（默认 true）。主键列一般设 false。 */
  hideable?: boolean;
  /** 固定在首列（横向滚动时保持可见）。 */
  sticky?: boolean;
  className?: string;
  headerClassName?: string;
}

function compareValues(a: string | number | null | undefined, b: string | number | null | undefined): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1; // 空值永远排最后，不参与比较
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'zh-CN');
}

export interface TableSort {
  id: string;
  desc: boolean;
}

export type SortMode = 'none' | 'client' | 'server';

interface DataTableProps<T> {
  /** localStorage 里列宽/列显隐的命名空间，同一个表跨页面共享用同一值。 */
  tableId: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** 总条数（服务端分页时用于「第 x–y 条 / 共 n 条」）。 */
  total?: number;
  loading?: boolean;
  error?: ReactNode;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  /** 行尾操作区（通常是省略号菜单），未提供时不渲染该列。 */
  rowActions?: (row: T) => ReactNode;
  /** 表格上方的工具条（筛选条），与表格共享边框。 */
  toolbar?: ReactNode;
  /** 表格下方的分页条。 */
  footer?: ReactNode;
  caption?: string;
  sortMode?: SortMode;
  sorting?: TableSort[];
  onSortingChange?: (next: TableSort[]) => void;
  initialSorting?: TableSort[];
  stickyFirstColumn?: boolean;
  zebra?: boolean;
  className?: string;
  /** 表格内部滚动高度，例如 "calc(100dvh - 15rem)"。 */
  maxHeight?: string;
  getRowLabel?: (row: T) => string;
  /** 没有 caption 时的可访问名称（表格也需要名字，否则读屏只报「表格 5 行 8 列」）。 */
  ariaLabel?: string;
}

export function DataTable<T>({
  tableId,
  columns,
  rows,
  rowKey,
  total,
  loading = false,
  error,
  empty,
  onRowClick,
  rowActions,
  toolbar,
  footer,
  caption,
  sortMode = 'none',
  sorting,
  onSortingChange,
  initialSorting,
  stickyFirstColumn = false,
  zebra = false,
  className,
  maxHeight,
  getRowLabel,
  ariaLabel,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [columnVisibility, setColumnVisibility] = usePersistentState<VisibilityState>(
    `table:${tableId}:columns`,
    {},
  );
  const [columnSizing, setColumnSizing] = usePersistentState<ColumnSizingState>(
    `table:${tableId}:widths`,
    {},
  );
  const [localSorting, setLocalSorting] = usePersistentState<TableSort[]>(
    `table:${tableId}:sort`,
    initialSorting ?? [],
  );

  const activeSorting = sorting ?? localSorting;
  const changeSorting = onSortingChange ?? setLocalSorting;

  const columnDefs = useMemo<ColumnDef<T>[]>(() => {
    const defs: ColumnDef<T>[] = columns.map((column) => ({
      id: column.id,
      accessorFn: (row: T) => row,
      header: () => column.header,
      cell: (info) => column.cell(info.row.original),
      size: column.width ?? 160,
      minSize: column.minWidth ?? 72,
      enableSorting:
        sortMode !== 'none' && column.sortable !== false && (sortMode === 'server' || Boolean(column.sortValue)),
      sortingFn: column.sortValue
        ? (rowA, rowB, columnId) => compareValues(column.sortValue!(rowA.original), column.sortValue!(rowB.original))
        : 'basic',
      enableHiding: column.hideable !== false,
      // 第一次点击一律升序：TanStack 对数值列默认「先降序」，但 ERP 里点一下表头
      // 的预期是「从小到大」，降序再点一下就到。
      sortDescFirst: false,
      meta: { align: column.align ?? 'start', sticky: column.sticky, className: column.className },
    }));

    if (rowActions) {
      defs.push({
        id: '__actions',
        header: () => <span className="sr-only">{t('common.actions')}</span>,
        cell: (info) => rowActions(info.row.original),
        size: 56,
        minSize: 56,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
        meta: { align: 'end' },
      });
    }
    return defs;
  }, [columns, rowActions, sortMode]);

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: { sorting: activeSorting, columnVisibility, columnSizing },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(activeSorting) : updater;
      changeSorting(next as TableSort[]);
    },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: sortMode === 'client' ? getSortedRowModel() : undefined,
    manualSorting: sortMode === 'server',
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    defaultColumn: { minSize: 72, size: 160 },
  });

  const visibleLeafColumns = table.getVisibleLeafColumns();
  const visibleColumnCount = visibleLeafColumns.length;
  const showEmpty = !loading && !error && rows.length === 0;
  const hideableColumns = columns.filter((column) => column.hideable !== false);

  return (
    <div className={cn('flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface', className)}>
      {toolbar ? <div className="shrink-0 border-b border-line">{toolbar}</div> : null}

      <div
        // 可横向滚动的表格容器必须是可聚焦的 region 且有名字，
        // 否则键盘用户没法滚到右侧的列（see: responsive-table）
        role="region"
        aria-label={caption ?? ariaLabel}
        tabIndex={0}
        className={cn('relative min-h-0 flex-1 overflow-auto app-scroll focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600')}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className="app-table" aria-label={caption ? undefined : ariaLabel}>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header, index) => {
                  const align = (header.column.columnDef.meta as { align?: string } | undefined)?.align;
                  const isSticky = stickyFirstColumn && index === 0;
                  const sorted = header.column.getIsSorted();
                  const canSort = sortMode !== 'none' && header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      // aria-sort 只加在可排序列上：念出来就是「已按数量降序排列」
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                      // 对齐通过自定义属性传给样式表：表头与单元格读同一个变量，
                      // 既不会被层叠顺序翻盘，也不把静态样式写死在内联 style 里。
                      style={
                        {
                          width: header.getSize(),
                          '--cell-align': align === 'end' ? 'end' : 'start',
                        } as CSSProperties
                      }
                      className={cn('relative', isSticky && 'app-table-sticky')}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            'inline-flex w-full items-center gap-1 rounded-[4px] py-1 text-start',
                            'hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
                            align === 'end' && 'justify-end',
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <ChevronUp aria-hidden className="size-3" />
                          ) : sorted === 'desc' ? (
                            <ChevronDown aria-hidden className="size-3" />
                          ) : (
                            <ChevronsUpDown aria-hidden className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                      {header.column.getCanResize() ? (
                        <div
                          // 拖拽列宽只是指针增强，键盘用户不做这件事；若把它暴露成
                          // 可聚焦的 separator，列头的可访问名称会被拼成「名称 调整列宽」。
                          aria-hidden="true"
                          data-resizing={header.column.getIsResizing()}
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onDoubleClick={() => header.column.resetSize()}
                          className="app-col-resizer"
                        />
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <SkeletonRows rows={8} columns={Math.min(visibleColumnCount, 6)} />
            ) : null}

            {!loading && error ? (
              <tr>
                <td colSpan={visibleColumnCount} className="!h-auto py-10 text-center text-danger-600">
                  {error}
                </td>
              </tr>
            ) : null}

            {showEmpty ? (
              <tr>
                <td colSpan={visibleColumnCount} className="!h-auto p-0">
                  {empty ?? <Empty title={t('common.noResults')} />}
                </td>
              </tr>
            ) : null}

            {table.getRowModel().rows.map((row, rowIndex) => {
              const label = getRowLabel?.(row.original);
              return (
                <tr
                  key={rowKey(row.original)}
                  data-zebra={zebra && rowIndex % 2 === 1 ? 'true' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={label}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          // 空格默认会滚动容器，行内已聚焦时按空格视为激活
                          event.preventDefault();
                          onRowClick(row.original);
                        }
                      : undefined
                  }
                  className={cn(
                    onRowClick &&
                      'cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600',
                  )}
                >
                  {row.getVisibleCells().map((cell, index) => {
                    const meta = cell.column.columnDef.meta as
                      | { align?: string; className?: string }
                      | undefined;
                    const isSticky = stickyFirstColumn && index === 0;
                    return (
                      <td
                        key={cell.id}
                        style={
                          {
                            width: cell.column.getSize(),
                            '--cell-align': meta?.align === 'end' ? 'end' : 'start',
                          } as CSSProperties
                        }
                        className={cn('truncate', isSticky && 'app-table-sticky', meta?.className)}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line bg-surface px-3 py-1.5">
        {/* 分页条自己占满剩余宽度：右侧再放列显示开关 */}
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-ink-muted">
          {footer ?? <TableCount total={total} shown={rows.length} />}
        </div>
        <div className="flex items-center gap-1">
          {hideableColumns.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-control)] px-2 text-xs text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                aria-label={t('common.columns')}
              >
                <Columns3 aria-hidden className="size-3.5" />
                {t('common.columns')}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t('common.columnsHint')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {table.getAllLeafColumns().map((column) => {
                  const def = columns.find((item) => item.id === column.id);
                  if (!def) return null;
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(checked) => column.toggleVisibility(checked === true)}
                      // 最后一列不允许关掉：没有列的表看起来像坏了
                      disabled={column.getIsVisible() && table.getVisibleLeafColumns().length === 1}
                    >
                      {def.header}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** 「第 21–40 条 / 共 1,204 条」——分页信息本身也是数据，不要只给页码。 */
export function TableCount({ total, shown }: { total?: number; shown: number }) {
  const { t, i18n } = useTranslation();
  const format = (value: number) => value.toLocaleString(i18n.language);
  if (total === undefined) return <span>{t('common.tableShown', { shown: format(shown) })}</span>;
  return (
    <span>{t('common.tableShownOfTotal', { shown: format(shown), total: format(total) })}</span>
  );
}

/** 表格分页条：上一页/下一页 + 页码 + 每页条数。 */
export function TablePager({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [20, 50, 100],
}: {
  page: number;
  totalPages: number;
  total?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}) {
  const { t, i18n } = useTranslation();
  const from = total === undefined ? 0 : (page - 1) * (pageSize ?? 0) + 1;
  const to = pageSize ? Math.min(page * pageSize, total ?? page * pageSize) : (total ?? 0);
  const format = (value: number) => value.toLocaleString(i18n.language);

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <div className="text-xs text-ink-muted">
        {total === undefined ? null : (
          <span>
            {t('common.picker.range', {
              from: format(total === 0 ? 0 : from),
              to: format(to),
              total: format(total),
            })}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {onPageSizeChange && pageSize ? (
          <label className="flex items-center gap-1 text-xs text-ink-muted">
            {t('common.picker.pageSize')}
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-7 rounded-[var(--radius-control)] border border-line-strong bg-surface px-1 text-xs text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label={t('common.previousPage')}
            className="inline-flex size-7 items-center justify-center rounded-[var(--radius-control)] border border-line bg-surface text-ink-soft hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          <span className="min-w-16 text-center text-xs text-ink-muted">
            {page} / {Math.max(1, totalPages)}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label={t('common.nextPage')}
            className="inline-flex size-7 items-center justify-center rounded-[var(--radius-control)] border border-line bg-surface text-ink-soft hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
          >
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
