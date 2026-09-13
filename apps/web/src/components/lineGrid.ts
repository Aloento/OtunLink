/**
 * Fluent 的 Field / Select / Input 默认 min-width: auto，原生 <select> 的固有宽度由最长的选项
 * 文本决定（如「物品名 · SKU」或单位名称），会把栅格列撑到 min-content 宽度，使同一行的控件互相重叠。
 * 这里逐层放开 min-width 并让控件填满列宽；栅格自身的列数与间距由调用方给出。
 */
export const FIELD_OVERFLOW_GUARD =
  '*:min-w-0 ' +
  '[&_.fui-Input]:w-full [&_.fui-Input]:min-w-0 [&_.fui-Input__input]:min-w-0 ' +
  '[&_.fui-Select]:w-full [&_.fui-Select]:min-w-0 [&_.fui-Select__select]:w-full [&_.fui-Select__select]:min-w-0';

/**
 * 单据明细行（物品清单）栅格共用类名。调用方再追加 sm:grid-cols-N 控制列数。
 */
export const LINE_GRID_CLASS = `grid grid-cols-1 gap-2 ${FIELD_OVERFLOW_GUARD}`;
