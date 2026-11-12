# UI/UE 重构规范（ERP 数据密集版）

> 本文件是并行改造的唯一契约。改任何页面前先读这里；与旧 `frontend-ui.md` 冲突时以本文件为准。

## 1. 目标与不变量

把界面从「后台表单站」改造成 **ERP 工作台**：一屏看更多行、操作路径更短、找数据不再靠翻页。

不变量（改动这些会被 CI 脚本拦住）：

1. **只做日间模式**，全库不出现 `dark:`。
2. **模态仍是原生 `<dialog>`**，不加 `role="dialog"` / `aria-modal` / 手写焦点陷阱。
3. **少量枚举用原生 `<select>`**（状态、角色、类型），**大量记录用 `EntityPicker`**（见 §4）。
4. **不改业务逻辑、i18n key 语义、导出名**；只改表现与交互。
5. **不新增依赖**（本期只允许 `@tanstack/react-table`、`@tanstack/react-virtual`、`cmdk`、`sonner`，已装好）。

## 2. 视觉基调

| 维度 | 取值 | 说明 |
| --- | --- | --- |
| 画布 | `bg-canvas` `#f4f6f8` | 冷灰，衬托白色数据面板 |
| 面板 | `bg-surface` `#fff` + `border-line` | 卡片/表格一律 1px 边框，**不用阴影** |
| 文字 | `ink` / `ink-soft` / `ink-muted` / `ink-subtle` | 正文 13px，次要 12px，标签 11px |
| 主色 | `brand-600` `#0352d1` | 选中/主按钮；`brand-50` 做浅底 |
| 圆角 | 控件 `--radius-control`(6px)、面板 `--radius-card`(8px) | 表格本身不圆角，靠外层容器 |
| 数字 | `.app-table` 自带 `tabular-nums` | 金额、数量右对齐 |
| 动效 | 只做 120–150ms 的颜色/透明度过渡 | 不加位移与缩放动画 |

**禁止**：渐变、大阴影、圆角药丸按钮、彩色大图标、卡片套卡片。

## 3. 页面骨架（所有列表页必须长这样）

```tsx
<div className="flex min-w-0 flex-col gap-3">
  <PageHeader title={t('…')} description={…} actions={…} />

  <DataTable
    tableId="items"
    caption={t('…')}                      // 必填：给读屏的表格名
    columns={columns}
    rows={data?.items ?? []}
    rowKey={(row) => row.id}
    total={data?.total}
    loading={isLoading}
    error={isError ? t('errors.UNKNOWN') : undefined}
    empty={<Empty title={t('…')} action={<Button …/>} />}
    onRowClick={(row) => navigate(…) }
    rowActions={(row) => <RowMenu … />}
    toolbar={<FilterBar …/>}
    footer={<TablePager …/>}
    stickyFirstColumn
    maxHeight="calc(100dvh - 14rem)"
  />
</div>
```

- `DataTable` 自己负责：吸顶表头、列宽拖拽、列显隐（localStorage 按 `tableId`）、骨架屏、空状态、行键盘（Tab 进、Enter/空格打开）。
- 分页用 `TablePager`（含「第 x–y 条 / 共 n 条」与每页条数），不要再手写 ←/→。
- 列表页**不要**再套 `Card`；表格自己有边框。

## 4. 记录选择：`EntityPicker`

大量数据（物品最典型）**必须**用 `EntityPicker`，禁止把 50 条塞进 `<select>`。

```tsx
<EntityPicker
  id={…}
  value={line.itemId}
  displayValue={lineQueries[line.key]}          // 编辑态回填
  title={t('items.pickerTitle')}
  onSearch={async (q, page) => {
    const data = await listItems({ q: q || undefined, page, size: 50 });
    return {
      items: data.items.map((item) => ({
        id: item.id,
        label: item.name,
        meta: [item.sku, item.spec].filter(Boolean).join(' · '),
      })),
      total: data.total,
    };
  }}
  onChange={(option) => { setLine(line.key, 'itemId', option.id); setLineQuery(line.key, option.label); }}
  columns={[{ label: '库存', render: (o) => stockOf(o.id), width: '5rem' }]}
/>
```

要点：搜索走服务端（`q`），滚动到底自动续页，虚拟滚动，↑↓/Enter 选择，IME 安全。数量少的枚举（单位、状态）继续用 `<select>`。

## 5. 页面类型

| 类型 | 结构 |
| --- | --- |
| 列表页 | `PageHeader` + `DataTable(toolbar=FilterBar)` |
| 详情页 | `PageHeader`(标题=单号, description=状态/时间) + 两列 `dl` + 行内表格 + 右侧动作 |
| 表单页 | `PageHeader` + 分区 `section`（标题 13px semibold + 分隔线）+ `Field` 网格 |
| 工作台 | 指标 `stat` 行 + 待办列表 + 最近动态 |

页头统一 48px 高，标题 17px semibold，描述 12px `ink-muted`，动作右对齐、主按钮在最右。

## 6. 反馈

- 写操作成功 → `toast.success(t('…'))`；失败 → `toast.error(...)`，并保留字段级错误。
- 加载 → 列表用骨架（`DataTable` 内建），按钮用 `loading`，页面级用 `FullPageSpinner`。
- 破坏性操作 → `ConfirmDialog`（危险态初始焦点在「取消」），不用 `window.confirm`。

## 7. 交互细则

- 搜索框 250ms 防抖；切换筛选时页码归 1。
- 行内操作放右侧省略号菜单，最多暴露 1 个主操作。
- 表头列宽可拖、双击复位；列显隐持久化到 `table:<tableId>:columns`。
- 全局命令面板 `⌘K`：页面跳转 + 物品搜索；已有，别重复实现。
- 密度切换在账号菜单里（紧凑 / 标准 / 宽松），写 `html[data-density]`。

## 8. 可访问性硬性要求

- 表格必须有 `caption` 或 `aria-label`；可排序列用 `<th aria-sort>`。
- 只有图标的按钮必须 `aria-label`；可见文字必须出现在可访问名称里。
- 颜色不能是唯一区分手段：状态同时给文字。
- 触控目标 ≥24×24；`pointer: coarse` 下放大到 32。
- 焦点环 `:focus-visible` 统一 brand-600，偏移 1–2px。

## 9. 验证

```bash
cd apps/web && pnpm exec tsc --noEmit
pnpm test          # 含 12 个 DOM 用例
pnpm build
cd ../.. && node scripts/check-i18n-keys.mjs
```

## 10. 实施结果（第一轮）

已落地：

| 层 | 内容 |
| --- | --- |
| 外壳 | 可收起的左侧导航（图标 + 分组 + 选中色条）、顶部全局搜索（⌘K）、账号菜单内密度切换、移动端底部图标导航、全局 Toast |
| 数据表 | `ui/data-table.tsx`（TanStack Table v8）：吸顶表头、首列固定、列宽拖拽 + 双击复位、列显隐、骨架屏、空态、行键盘激活、`TablePager` |
| 选择器 | `ui/entity-picker.tsx`：模态选择器 + 服务端搜索 + 虚拟滚动 + 无限续页 + 总数 + 多列信息 + IME 安全 |
| 工具条 | `ui/filter-bar.tsx`：搜索 / 筛选 / 计数 / 右侧动作一条基线 |
| 命令面板 | `ui/command-palette.tsx`（cmdk + 原生 dialog，懒加载 18.5 kB） |
| 小组件 | `skeleton` / `empty` / `kbd` / `stat` / `section` / `toast` |
| 页面 | 工作台、物品、销售单、发货单、入库单、出库单、退货单、管理端三页 → 全部改为新表；入库/出库/发货单表单的物品选择改为 `EntityPicker` |

服务端配套：

- 销售/发货/入库/出库/退货列表接口新增 `q`（单号 + 往来单位名 ILIKE，大小写不敏感），计数与列表共用同一谓词。
- 入库/出库/发货列表新增 `itemCount` / `totalQty` 聚合列（子查询），前端不再为每一行拉详情（删掉了 N+1）。

数字：web 测试 104（新增 6 个数据表用例 + 8 个对话框/表单用例），api 测试 275（新增 24 个搜索用例），typecheck 0 error，首屏 1282 kB / gzip 359（命令面板已拆包）。

尚未改造：`inventory`、`retail-prices` 两页仍是旧的 `ResponsiveTable`；各详情页仍是旧版式（只吃到了新令牌与密度）。
