# 前端 UI 契约（Tailwind + Radix）

> 本文件是 `apps/web` 的 UI 层唯一约定来源。所有页面/组件迁移与后续新增都必须遵循。
> 变更 UI 基础组件前先改本文件。

## 0. 设计基调与不变量

目标：一屏看更多行、操作路径更短、找数据不靠翻页。动任何页面前先确认这五条：

1. **只做日间模式**：不写 `dark:`，不监听 `prefers-color-scheme`。
2. **模态一律原生 `<dialog>`** + `showModal()`：不加 `role="dialog"` / `aria-modal`，
   不手写焦点陷阱。
3. **少量枚举用原生 `<select>`，大量记录用 `EntityPicker`**：不要用 `<Select>`
   装「前 100 条」，搜不到就等于数据丢了。
4. **不改业务逻辑、i18n key 语义、导出名**：只改表现与交互。
5. **不引入第二套 primitives**：`radix-ui` 伞包、Base UI、另一套表单库都不进依赖。

视觉基线：

| 维度 | 取值 |
| --- | --- |
| 画布 | `bg-canvas` `#f4f6f8`（冷灰，衬托白色数据面板） |
| 面板 | `bg-surface` + `border-line` 1px，**不用阴影** |
| 字号 | 正文 13px、次要 12px、标签 11px；页标题 17px、区块标题 13px |
| 数字 | `tabular-nums`；金额/数量列 `align: 'end'`，表头一起右对齐 |
| 动效 | 120–150ms 的颜色/透明度过渡，不加位移与缩放 |

**禁止**：渐变、大阴影、药丸按钮、彩色大图标、卡片套卡片、用横向滚动兜住列。

## 1. 技术栈

| 层 | 选择 | 说明 |
| --- | --- | --- |
| 样式 | Tailwind CSS v4（`@tailwindcss/vite`） | 唯一样式方案。禁止 CSS-in-JS、内联 `style`、`@fluentui/*`。 |
| 令牌 | `src/index.css` 的 `@theme` | 颜色/圆角全部走令牌（`bg-surface`、`text-ink-muted`、`border-line`…），不要写死 `#fff`/`gray-100`。 |
| 复合控件 | Radix UI | Tabs、Popover/Combobox、DropdownMenu、Tooltip、Slot。 |
| 原生控件 | `<dialog>`、`<select>`、`<input>`、`<textarea>` | 见 §2 的取舍理由。 |
| 图标 | `lucide-react` | 统一 16/20px，`aria-hidden`。 |

### 为什么模态用原生 `<dialog>`、下拉用原生 `<select>`

Modern Web Guidance 的 `dialog` 指南要求模态直接建立在 `<dialog>` + `showModal()` 上：
原生模态免费提供 inert 页面、焦点陷阱与焦点归还、顶层渲染、Esc/返回手势关闭。
自建遮罩层（含 Radix Dialog）需要手工重建这些行为，属于指南明确要求避免的做法。

`branded-select-styling` / `browser-ui-theming` 同样建议先尝试用 CSS
（`appearance: base-select` 渐进增强）改造原生 `<select>`，而不是重造 listbox：
原生控件保留键盘、输入法、屏幕阅读器与移动端系统选择器。
本应用是仓库/门店现场使用的 PWA，移动端系统选择器体验明显更好。

Radix 用在没有平台替代品的地方：Tabs（roving tabindex + `role="tabpanel"`）、
Popover（视口翻转定位）、DropdownMenu、Tooltip、Slot（`asChild`）。

## 2. 仅日间模式

- `:root` 固定 `color-scheme: light`；不写 `dark:` 变体，不监听 `prefers-color-scheme`。
- 品牌色 `--color-brand-600: #0352d1`（与 `index.html` 的 `theme-color` 一致）。

## 3. 令牌

| 用途 | 类名 |
| --- | --- |
| 页面背景 | `bg-canvas` |
| 卡片/表格背景 | `bg-surface` |
| 次级填充 | `bg-surface-muted` / 悬停 `bg-surface-hover` |
| 装饰性分隔线（卡片外框、表头） | `border-line` |
| **控件边界**（输入框/下拉/复选框/次级按钮） | `border-line-strong` / 悬停 `border-line-hover` |
| 正文 | `text-ink` |
| 次级正文 | `text-ink-soft` |
| 说明/标签 | `text-ink-muted` |
| 弱化信息 | `text-ink-subtle` |
| 品牌 | `bg-brand-600` `text-brand-700` `bg-brand-50` `ring-brand-200` |
| 成功/警告/危险 | `text-success-600` `text-warning-700` `text-danger-600` + 对应 `*-50` / `*-200` 底色 |
| 圆角 | `rounded-card`（卡片）、`rounded-lg`（控件）、`rounded-md`（菜单项） |

两类边框不要混用：`line` 是装饰（不承担「识别控件」职责），`line-strong` 是控件边界
（WCAG 1.4.11 要求 ≥ 3:1）。把 `line` 用到输入框上会让低视力用户看不出输入框范围。

对比度基线（白底）：`text-ink-subtle` #666 = 5.74:1、`border-line-strong` #8c8c8c = 3.36:1、
`text-danger-600` #cf1f1f = 5.38:1（在 danger-50 上 4.91:1）、`bg-brand-600` + `text-white` = 6.70:1。

## 4. 基础组件（`src/ui/`）

> 全部具名导出，路径相对导入（例：`../../ui/button`）。

### Button
```tsx
<Button variant="primary|secondary|subtle|danger|ghost" size="sm|md|icon"
        loading icon={<Icon aria-hidden className="size-4" />} onClick={fn}>
  文案
</Button>
<Button asChild><Link to="/x">文案</Link></Button>   {/* 链接用地 */}
```
`type` 默认 `button`。图标按钮必须给 `aria-label`。

### Input / Textarea / Select
```tsx
<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={…} />
<Textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} />
<Select value={status} onValueChange={setStatus} aria-label={…}>
  <option value="">{t('…all…')}</option>
</Select>
```
`Select` 是原生 `<select>`：**不要**给它加 `children` 之外的自定义渲染，
选项必须是 `<option>`（或 `options={[{value,label}]}` + `placeholder`）。
禁用某项用 `<option disabled>`。

### Checkbox
```tsx
<Checkbox id="perishable" checked={v} onChange={(e) => set(e.currentTarget.checked)} label={t('…')} />
```

### Field（表单字段容器）
```tsx
<Field label={t('items.name')} required error={fieldError} hint={…} className="sm:col-span-2">
  <Input … />
</Field>
```
- 单元素子节点会自动注入 `id` / `aria-describedby` / `aria-invalid` / `required`；
  多子节点（例如「输入框 + 单位后缀」）不注入，由调用方自己接。
- `error` 只在**用户已交互或提交被拒**后传入；不要在首次渲染就标红必填项
  （`validate-input-after-interaction` / `required-field-feedback`）。
- 错误节点是**按需插入**的 `<p role="alert">`：插入即播报，不是常驻 live region。
- 子节点不是表单控件（例如 `<ImageUpload>`）时不要用 `Field` 的 `label` 语义，
  用 `<div>` + 独立 `<label>`/`<h3>` 组织，避免孤儿 `for`。

### Badge / Card / PageHeader / Spinner
```tsx
<Badge tone="success|warning|danger|brand|neutral">…</Badge>
<Card>…</Card>
<CardHeader title={…} actions={…} />
<PageHeader title={t('…')} description={…} actions={…} />
<Spinner label={t('common.loading')} />
```
状态不能只靠颜色表达：Badge 内要有文字或符号。

### Dialog（原生 `<dialog>`）
```tsx
<Dialog open={open} onOpenChange={setOpen} closeLabel={t('common.close')}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{…}</DialogTitle>
      <DialogDescription>{…}</DialogDescription>
    </DialogHeader>
    <DialogBody>…</DialogBody>
    <DialogFooter>
      <Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
      <Button variant="primary" onClick={submit} loading={busy}>{…}</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```
- **不要**加 `role="dialog"`、`aria-modal`、焦点陷阱、`inert` 或 Esc 监听。
- 初始焦点：给目标元素加 `data-autofocus`；破坏性确认请把它放在「取消」上。
- 默认点击遮罩关闭（`lightDismiss`），Esc 与返回手势由浏览器处理。
- 表单弹窗里不要用 `<form method="dialog">` 之外的提交方式绕过关闭逻辑。

### Tabs（Radix）
```tsx
<Tabs value={v} onValueChange={(next) => setV(next as Kind)}>
  <TabsList>
    <TabsTrigger value="A">…</TabsTrigger>
    <TabsTrigger value="B">…</TabsTrigger>
  </TabsList>
  <TabsContent value="A">{renderList('A')}</TabsContent>
  <TabsContent value="B">{renderList('B')}</TabsContent>
</Tabs>
```
每个 `TabsTrigger` 必须有同名 `TabsContent`（Radix 会把 `aria-controls` 指过去）。
共用渲染逻辑时用同一个渲染函数分别放进各面板。

### Combobox（Radix Popover，可搜索）
```tsx
<Combobox
  value={query}
  onValueChange={setQuery}
  options={[{ value: id, label: name, description?: sku, disabled? }]}
  onSelect={(option) => addRow(option.value, option.label)}
  loading={isFetching}
  loadingText={t('common.loading')}
  emptyText={t('items.noResult')}
  aria-label={…}
/>
```

### Table（语义化）
```tsx
<TableRegion label={t('items.title')}>
  <Table>
    <TableHeader><TableRow><TableHead>{…}</TableHead><TableRow/></TableHeader>
    <TableBody>…<TableRow><TableCell>…</TableCell></TableRow>…</TableBody>
  </Table>
</TableRegion>
```
列表页优先用 `<ResponsiveTable>`（`src/components/ResponsiveTable.tsx`），
它内部已处理手机端卡片化、粘性表头与可滚动区域命名。**必须**传 `label`
（表格区域的可访问名称，用页面/标签页标题），否则会退化成空态文案当区域名。
数字/金额列在单元格里用 `block text-end tabular-nums`。

### Tooltip / DropdownMenu
```tsx
<Tooltip content={t('common.refresh')}><Button size="icon" aria-label={…} /></Tooltip>
<DropdownMenu>
  <DropdownMenuTrigger asChild><Button …/></DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuLabel>…</DropdownMenuLabel>
    <DropdownMenuItem onSelect={fn}>…</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```
Tooltip 不是唯一信息来源：触发元素自身仍需 `aria-label`。

### Pagination
```tsx
<Pagination page={page} totalPages={totalPages} onChange={setPage}
            totalLabel={t('items.total', { total })} />
```
自带 `aria-label`（上一页/下一页）、`aria-live` 页码、禁用态与 ≥24px 命中区。
**不要**再手写「← 按钮 + 页码 + → 按钮」——裸箭头没有可访问名称。

### ConfirmDialog
```tsx
<ConfirmDialog
  open={confirmOpen}
  onOpenChange={setConfirmOpen}
  title={t('items.deleteConfirm', { name })}
  description={…}
  tone="danger"                 // 破坏性操作
  busy={deleting}
  onConfirm={() => { setConfirmOpen(false); void handleDelete(); }}
/>
```
替代 `window.confirm`（阻塞、不可样式化、无法键盘聚焦到具体按钮）。
`tone="danger"` 时初始焦点落在「取消」上，误触 Enter 不会执行危险操作。

### DataTable（列表页主力）
```tsx
<DataTable
  tableId="sales-orders"            // localStorage 命名空间：列宽/显隐/排序按此保存
  caption={t('sales.title')}
  columns={[{ id, header, cell, width, minWidth, align: 'end', sortable, sortValue, sticky, hideable }]}
  rows={data?.items ?? []}
  rowKey={(row) => row.id}
  total={total}
  loading={isLoading}
  error={isError ? t('errors.UNKNOWN') : undefined}
  empty={<Empty … />}
  onRowClick={(row) => navigate(`/sales/${row.id}`)}
  rowActions={(row) => <DropdownMenu … />}
  toolbar={<FilterBar … />}
  footer={<TablePager … />}
  sortMode="none" | "client" | "server"
  stickyFirstColumn
  maxHeight="calc(100dvh - 15rem)"
/>
```
- **服务端分页时不要给 `sortMode="client"`**：那会变成「只排当前页」的假排序。
  要排序就接 `sortMode="server"` + 后端 `sort` 参数，或者整表加载后再用 client。
- `sortValue` 是必填的客户端排序取值函数；不给则该列不可排。
- 对齐只有一个来源：列的 `align`。组件把它写成 `--cell-align` 自定义属性，
  样式表里 `<th>` 与 `<td>` 共用这个变量 —— **不要**在 `cell` 里塞
  `className="text-end"`，那正是表头靠左、数字靠右的成因。
- 手机上自动切成卡片列表（主列在卡片顶部，其余列变「标签 — 值」）。
  不需要卡片时传 `mobileCards={false}`。

### FilterBar / TablePager / TableCount
列表页统一：`PageHeader` → `DataTable`（`toolbar=FilterBar`、`footer=TablePager`）。
搜索框 250ms 防抖（`useDebouncedValue`），筛选变化必须把页码重置回 1。

### EntityPicker（大量记录的单选）
```tsx
<EntityPicker
  value={itemId}
  displayValue={name}               // 编辑态回填的显示文本
  title={t('sales.itemName')}
  aria-label={t('sales.itemName')}
  onSearch={async (q, page) => {
    const result = await listItems({ q: q || undefined, page, size: 50 });
    return { total: result.total, items: result.items.map((i) => ({ id: i.id, label: i.name, meta: i.sku })) };
  }}
  onChange={(option) => setItemId(option.id)}
/>
```
**物品/客户这类上千条的记录一律用它，不要用 `<Select>` 装前 100 条** ——
「下拉框里搜不到 = 数据丢了」是这套 UI 最初被推翻的原因。
表单里每个行都要独立的选择器，不要共用一个搜索框。

### Facts（详情页摘要）
```tsx
<Facts boxed items={[[t('sales.status'), …], [t('sales.totalAmount'), amount]]} />
```
`<dl>` + 标签左/值右；数字列自动 `tabular-nums`。新详情页不要再手写 `<dl>` 堆叠。

### FormActions（表单吸底操作条）
```tsx
<FormActions hint={t('sales.saveDraftHint')}>
  <Button variant="primary" loading={saving}>…</Button>
  <Button asChild variant="secondary"><Link …>…</Link></Button>
</FormActions>
```
小屏会自动抬到底部导航之上（`bottom-[calc(3.75rem+env(safe-area-inset-bottom))]`）。

### MobileNav（手机底部导航）
4 个主入口（取角色可见 `nav.main` 前四个）+「更多」（原生 `<dialog>` 列全量、按
业务/管理分组）。**不要再往底栏里塞第 5 个页面**，也不要靠横向滚动藏入口。


## 5. 与旧栈（Fluent UI）的关系

Fluent UI 已于 `07418d9` 全量移除。翻旧 PR / 旧代码时的写法对照看那一次提交的 diff，
不值得再维护一张逐项映射表：剩下的存量代码已经全部是本栈写法。

## 6. 硬性规则

1. **不改业务逻辑**：API 调用、查询键、权限判断、状态机、i18n key、路由路径全部保持原样。
2. **不改对外签名**：`src/components/*` 的导出名与 props 不变，只换内部实现。
3. **依赖已锁定**：TanStack Table/Virtual、cmdk、sonner、若干 Radix 原语。
   新增前先读本文件 §1 的取舍；样式先进 `index.css` 的
   `@theme`/组件层，不要在组件里堆任意值。
4. **文案全部走 i18n**：不新增硬编码中文/英文（新增 key 时同步 `resources/zh-CN.ts` 与 `en.ts`）。
5. **可访问性**：表单控件必须有 label 或 `aria-label`；图标按钮必须有 `aria-label`；
   错误提示加 `role="alert"`；不要用 `<div onClick>` 代替 `<button>`。
6. **响应式**：移动端优先，再在 `sm:`/`md:`/`lg:` 上增强；栅格里的控件要能缩
   （`min-w-0`）。断点值只用 `lib/useMediaQuery.ts` 的 `MOBILE_QUERY` /
   `DESKTOP_QUERY`，不要在别处再写一遍 `767px`。手机上的表格由 DataTable
   自动切成卡片，**不要**用横向滚动兜住多出来的列。
7. **不要用 `dark:`**，不要用 `prefers-color-scheme`。
8. **页面外层节奏**：列表页 `flex flex-col gap-3`（页头 → 表格 → 分页），
   表单/详情页 `gap-4`；不要在页面里自造 `p-6` 之类的外边距。
9. **数字列对齐**：列定义写 `align: 'end'`，表头与单元格会一起右对齐；
   禁止在 `cell` 内部单独加 `text-end`。
