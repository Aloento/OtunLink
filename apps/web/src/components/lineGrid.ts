/**
 * 栅格内控件的溢出保护（纯 Tailwind）。
 *
 * 旧 UI 组件库的字段容器默认 `min-width: auto`：原生 <select> 的固有宽度由最长选项
 * 文本决定，会把栅格列撑到 min-content，同一行的控件于是互相重叠 —— 当时只能靠
 * 后代选择器把它内部类名的 min-width 逐个放开。
 *
 * 现在 <Input> / <Select> / <Textarea> 自带 `w-full min-w-0`（见 src/ui/input.tsx、
 * src/ui/select.tsx），控件本身不会再撑破列；这里只需要把栅格直接子元素的
 * min-width 也放开。栅格自身的列数与间距仍由调用方给出。
 */
export const FIELD_OVERFLOW_GUARD = '[&>*]:min-w-0';

/**
 * 单据明细行（物品清单）栅格共用类名。调用方再追加 sm:grid-cols-N 控制列数。
 */
export const LINE_GRID_CLASS = `grid grid-cols-1 gap-2 ${FIELD_OVERFLOW_GUARD}`;
