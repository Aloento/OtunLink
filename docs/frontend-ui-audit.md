# 前端重构与 Modern Web Guidance 审计报告

> 范围：`apps/web`（Tailwind CSS v4 + Radix UI 全量替换 Fluent UI），以及随后的
> Modern Web Guidance 合规审计。仅日间模式。
> 约定文档见 [`docs/frontend-ui.md`](./frontend-ui.md)。

## 1. 结论

| 项 | 结果 |
| --- | --- |
| Fluent UI 残留 | **0**（`@fluentui/react-components` 已从依赖移除，源码零引用） |
| 页面/组件迁移 | 54 个文件改写，1 个死组件删除（`LanguageSwitch`，其功能并入账号菜单） |
| 新增基础层 | `src/ui/` 18 个组件（1219 行）+ `src/lib/cn.ts` |
| 类型检查 | `pnpm -r typecheck` **0 error** |
| 测试 | `pnpm -r test` **374 passed**（web 98、api 251、shared 17、db 8） |
| 构建 | `pnpm build` 成功；首屏 JS 1845 kB → 1591 kB（gzip 492 → 437 kB） |
| `legacy-scan`（33 条确定性规则） | `apps/web/src` **totalFindings: 0** |
| 暗色模式 | 无 `dark:` 变体、无 `prefers-color-scheme` 分支；`color-scheme: light` + `<meta name="color-scheme" content="light">` |
| 原生 `window.confirm` | 0（全部换成 `<ConfirmDialog>`） |
| 裸「← / →」分页 | 0（全部换成 `<Pagination>`，箭头按钮有可访问名称） |
| 原始调色板类（`neutral-*` / `blue-*` / `red-*` …） | 0 |
| 内联 `style` | 0 |

## 2. 技术栈与取舍

见 [`docs/frontend-ui.md` §1](./frontend-ui.md)。要点：

- **Tailwind CSS v4** 承担全部样式；令牌集中在 `src/index.css` 的 `@theme`，
  页面里不出现 `#fff` / `neutral-500` 之类的字面色值。
- **Radix** 只承担平台没有替代品的复合控件：Tabs、Popover（Combobox）、
  DropdownMenu、Tooltip、Slot。
- **原生 `<dialog>` / `<select>` / `<input>`** 承担模态、下拉、复选框、文本输入：
  - 模态：`dialog` 指南明确要求用 `<dialog>` + `showModal()`，原生已提供 inert 页面、
    焦点陷阱与焦点归还、顶层渲染、Esc/返回手势关闭；自建遮罩层（含 Radix Dialog）
    需要手工重建这些行为。
  - 下拉：`branded-select-styling` / `browser-ui-theming` 建议先用 `appearance: base-select`
    改造原生控件；本应用是现场使用的 PWA，移动端系统选择器体验更好。

> 因此最终依赖里没有 `@radix-ui/react-dialog` / `react-select` / `react-checkbox`：
> 这三处平台原生方案更优，按指南替换掉了。

## 3. 迁移做法

1. 先落地基础层（令牌、`cn()`、16 个 UI 组件），冻结 API，写成契约文档。
2. 5 个子智能体按**互不重叠的文件域**并行迁移：发货单+发货组件 / 销售 / 物品+库存+零售价 /
   入库+出库 / 退货+管理端+整屏页+路由守卫；Lead 负责外壳（`AppLayout`）、共享组件、
   i18n 资源与依赖清理。
3. 迁移期间每天跑 `tsc --noEmit`、`vitest`、`vite build`，并用
   `scripts/check-ui-migration.sh` 对比 HEAD 与工作区的 i18n key / 导出名集合，
   确认没有在改写中丢功能。
4. 迁移完成后跑 `mwg legacy-scan`，再做深度指南审计（见 §4）。

### 回归自检脚本

`scripts/check-ui-migration.sh` 逐文件比对 `HEAD` 与工作区：

- 消失的 `t('…')` key（唯一命中是 `admin/TestEmailPage` 的 `common.loading` —— 原
  `<Spinner label>` 改成了 `<Button loading>`，属有意删除）
- 消失的 `export function/const` 名称（无命中）

## 4. Modern Web Guidance 审计（改了什么）

`legacy-scan` 只覆盖语料里约 20% 有确定性规则的部分，剩下的按主题逐条检索核对。
下表按指南归类，列出**已落地**的改动。

### 4.1 结构与可访问性（`accessibility`）

| 项 | 处理 |
| --- | --- |
| 地标 | `AppLayout` 里 `header` / `nav` / `main` / `footer` 各一个；同一时刻只渲染一个 `nav`，无需 `aria-label` 区分 |
| 跳过链接 | 新增「跳到主要内容」链接，落点 `<main id="main" tabindex="-1">`（屏幕放大镜不跟随非可聚焦元素） |
| 标题层级 | 每页恰好一个 `<h1>`（`PageHeader`），子区块 `<h2>`；弹窗标题固定 `<h2>` |
| 表格 | `<table>` + `<caption class="sr-only">` + `<th scope="col">`；滚动区 `role="region"` + `aria-label` + `tabindex="0"`；表头 `sticky` |
| 移动端卡片列表 | `<ul role="list">` —— Safari 在 `display:flex` 的列表上会丢弃 list 语义 |
| 名称区分 | 逐行操作（拣货勾选、删除、编辑、同意/拒绝）把行标识拼进 `aria-label`，避免一屏十几个同名按钮 |
| 图片 | 所有 `<img>` 有 `alt`（装饰性为 `""`），列表缩略图 `loading="lazy" decoding="async"` |
| 实时播报 | 错误 `role="alert"`、成功提示 `role="status"`；「加载中」不作为 live region 播报 |

### 4.2 模态（`dialog` / `prevent-page-scroll-under-modal-dialog`）

- 全部弹窗改成原生 `<dialog>` + `showModal()`：不写 `role="dialog"`、`aria-modal`、
  焦点陷阱、`inert` 切换、Esc 监听。
- `dialog:modal { overscroll-behavior: contain }` + `::backdrop { overscroll-behavior: contain }`，
  不用 `overflow: hidden` / `position: fixed` 锁页面滚动（避免滚动条消失导致的布局位移）。
- `display` 只作用于 `[open]`，关闭态交回 UA。
- 点击遮罩关闭用 `closedby="any"`，并给不支持 `closedBy` 的浏览器补指针按下/抬起都在框外的降级。
- `data-autofocus` 指定初始焦点；破坏性确认（`ConfirmDialog tone="danger"`）把它放在「取消」上。

### 4.3 表单（`forms` / `validate-input-after-interaction` / `required-field-feedback` / `accessible-error-announcement`）

- `Field` 统一接线：`label for` ↔ 控件 `id`、`aria-describedby` 指向提示与错误、
  `aria-invalid` 仅在出错时设置、`required` 直接落在控件上。
- 错误只在**用户交互后或提交被拒后**出现：出库超量提示由「已填数量」驱动；
  条码字段在 `blur` 或提交被拒后才提示。
- 提示文案走 `aria-describedby` 而不是塞进 label。

### 4.4 下拉与选择器（`branded-select-styling` / `browser-ui-theming` / `select-menu-interaction`）

- 原生 `<select>` + `appearance: base-select`（渐进增强；不支持则退回系统下拉），
  自绘 `::picker(select)`、`::picker-icon`、`option::checked`、`option::checkmark`。
- `accent-color` 跟随品牌色；`:focus-visible` 全局高亮。
- 可搜索选择器用 Radix Popover + ARIA 1.2 combobox 语义（`aria-expanded` / `aria-controls` /
  `aria-activedescendant`），并处理 IME 组字。

### 4.5 IME 安全（`ime-safe-enter-submit`）

- 扫码弹窗的手动输入改成真正的 `<form>` 提交，不再手写 `keydown` 判断 ——
  浏览器在 IME 组字期间会抑制隐式提交。
- Combobox 的 Enter/方向键处理先判断 `isComposing`，并对 Safari 的事件乱序补 `keyCode === 229`。

### 4.5b 命中区域与强制配色

- `ImageUpload` 的删除按钮从 `hidden`（`display:none`，键盘根本到不了）改为
  `opacity-0 + group-hover/focus-visible/pointer-coarse:opacity-100`，尺寸 24×24。
- `forced-colors: active` 下 `app-select` 退回系统下拉（`background-image` 箭头在强制配色里
  会被抹掉，靠背景图表达边界不可靠）。
- 不能用 `disabled` 表达「不可操作但需要解释」：`AdminUsersPage` 的「删除自己」改成
  `aria-disabled` + `aria-describedby` 指向 `sr-only` 说明，保持可聚焦（`disabled` 会把它移出 Tab 序，
  读屏用户永远听不到原因）。

### 4.6 色彩与对比（`color` / `browser-ui-theming`）

| 组合 | 改前 | 改后 | 说明 |
| --- | --- | --- | --- |
| 控件边界 `line-strong` / 白底 | 1.48:1 ✗ | **3.36:1** | `#d4d4d4` → `#8c8c8c`，WCAG 1.4.11 要求 ≥3:1 |
| 控件边界 / canvas、surface-muted | 1.42 / 1.36 ✗ | **3.22 / 3.08** | 同上 |
| 悬停边界 `line-hover` | 2.52:1 ✗ | **4.74:1** | `#a3a3a3` → `#737373`（悬停不能反而更难看清） |
| `text-danger-600` on `danger-50` | 4.41:1 ✗ | **4.96:1** | `#dc2626` → `#cf1f1f` |
| `text-ink-subtle` on `surface-muted` | 4.35:1 ✗ | **5.27:1** | `#737373` → `#666666` |
| 菜单项高亮（键盘焦点） | 1.33:1 ✗ | **6.71:1** | 改用 `border-brand-600`，border 在强制配色下也不会被抹掉 |
| 选中标签页 | 1.09:1 ✗ | **3.36:1** | 加 `border-line-strong`，不只靠底色 |
| Combobox 当前项 | 1.09:1 ✗ | **6.71:1** | 加 `outline-brand-600` |

装饰性边界（卡片外框、表头分隔线、Badge 外圈）保留 `--color-line` / `*-200`：
状态信息由文字承载，属 1.4.11 的装饰性豁免。

### 4.7 动效与偏好（`motion` / `spinner`）

- 去掉了「全局把 animation/transition 压到 0.01ms」的写法（`motion` 指南点名禁止：
  会让某些动画变得更刺眼）；改为按用例降级。
- `prefers-reduced-motion: reduce` 下把持续旋转放慢到 6s，而不是停转 ——
  用户仍能看出「正在进行」（`spinner` 指南）。
- 弹窗淡入用 `@starting-style` + `allow-discrete`；`rotate` 过渡只在
  `prefers-reduced-motion: no-preference` 下启用。

### 4.8 性能

- 移除 Fluent 的运行时 CSS-in-JS（Griffel）后，JS 首屏从 1845 kB 降到 1591 kB；
  CSS 只有 31 kB（gzip 7.3 kB）。
- 图片懒加载 + 异步解码；列表分页维持原 20 条/页。
- 字体用系统栈，没有 webfont 阻塞首屏；`<meta name="text-scale" content="scale">`
  让浏览器按系统字号缩放根字号（`respect-os-text-scale`），布局全用 rem 相对单位。
- 控件不用固定高度（`min-h-*` + padding）：用户放大字号时按钮/输入框跟着长高，
  文字不会被裁（`typography` / WCAG 1.4.12）。

## 5. 有意保留的取舍

| 事项 | 说明 |
| --- | --- |
| 移动端卡片/桌面表格两套 DOM | `ResponsiveTable` 仍按 `matchMedia` 二选一渲染，而不是纯 CSS 容器查询。原因：单元格里可能有可编辑控件（点货实收数量），两份 DOM 会产生重复输入框。表格侧仍遵守 `responsive-table` 的语义与粘性表头要求。 |
| `appearance: base-select` | 属渐进增强：Firefox 当前不支持，退回系统下拉（仍是原生可访问控件），不做 polyfill；`forced-colors` 下也主动退回系统下拉。 |
| 分页页码不做整表播报 | 只播报「当前页 / 总页数」（`aria-live="polite"`），避免读屏用户被整表重排刷屏。 |
| Fragile 过渡 | 弹窗淡入用 `@starting-style`；`prefers-reduced-motion` 下不把动画归零，而是把 spinner 放慢到 6s（`motion`/`spinner` 指南）。 |

## 6. 第二轮：缺陷排查与修复

迁移完成后又做了一轮专门的缺陷排查（静态比对 + 新加的 DOM 测试），修掉 5 个真实缺陷：

| # | 缺陷 | 影响 | 修复 |
| --- | --- | --- | --- |
| 1 | `Combobox` 的 `activeIndex` 初始为 `0` | 第一次按 `↓` 会跳过第一项，Enter 选中的是第二项 | 初始改为 `-1`，只在输入或方向键后才有高亮 |
| 2 | 出库单**编辑**态每行物品选择器显示空文本 | 回填了 `itemId` 却没回填显示文本，用户看到空白输入框，容易误以为行是空的 | 回填时用 DTO 的 `itemName` 一起写 `lineQueries` |
| 3 | 原生 `<dialog>` 的默认初始焦点落在右上角关闭按钮 | 每个弹窗都要先 Tab 一次才能填表 | 没显式 `data-autofocus` 时聚焦第一个真实控件，关闭按钮标记 `data-dialog-dismiss` 跳过 |
| 4 | 组件在模态打开时被卸载（路由跳转）不关闭 dialog | 极端情况下页面停留在 inert 状态 | `useEffect` cleanup 里显式 `close()` |
| 5 | `Field` 包 `<ImageUpload>` 时生成孤儿 `<label for>` | 标签与控件失联，点标签无反应 | 新增 `unlabeled`：label 降级为分组名（`role="group"` + `aria-labelledby`） |

另外补了一处「Label in Name」：账号菜单按钮的可访问名称原来只有「账号菜单」，不含可见的用户名，语音控制说不出这个名字。

### 新增测试

`apps/web/src/ui/dialog.test.tsx`、`combobox.test.tsx`（jsdom + @testing-library/react，12 个用例）：

- `<dialog>` 打开走 `showModal()`、关闭回写受控状态、卸载时关闭、不带 `role="dialog"`/`aria-modal`
- `Field` 的 `for`/`id`/`aria-describedby`/`aria-invalid` 接线、`unlabeled` 分组语义
- `Pagination` 的箭头可访问名称与边界禁用
- `Combobox` 的方向键选择、以及 **IME 组字期间与 Safari `keyCode === 229` 时不会误选中**

`scripts/check-i18n-keys.mjs` 静态校验源码里 543 个 `t('…')` 字面量 key 都能在 zh/en 资源里解析（迁移涉及 54 个文件改写，这是最容易悄悄坏掉的地方）。

## 7. 复现验证

```bash
cd apps/web && pnpm exec tsc --noEmit     # 0 error
pnpm test                                  # 98 passed（含 12 个 DOM 用例）
pnpm build                                 # 成功，dist/assets/index-*.js 1114 kB
cd ../.. && pnpm -r typecheck && pnpm -r test   # 0 error / 374 passed

# 确定性规则扫描（33 guides / 35 rules）
npx -y modern-web-guidance@latest legacy-scan apps/web/src --json   # totalFindings: 0

# 迁移回归自检
bash scripts/check-ui-migration.sh          # i18n key / 导出名无丢失
node scripts/check-i18n-keys.mjs            # 543 个 key 全部可解析

# 规则类零状态核对
grep -rn "@fluentui" apps/web/src | wc -l            # 0
grep -rn "dark:" apps/web/src | wc -l                # 0
grep -rn "window.confirm" apps/web/src --include=*.tsx | grep -v confirm-dialog | wc -l   # 0
grep -rnE "(text|bg|border|ring)-(gray|neutral|blue|red|amber|green)-[0-9]" apps/web/src | wc -l  # 0
```

## 8. 已知遗留（都可单独提 PR）

1. **行式表单缺 `fieldset`/`legend`**：同一页里多行「物品 / 数量 / 移除」，输入框靠 `Field` 的 label
   关联，但行与行之间没有分组语义；按钮已用行号区分。
2. **必填项在按钮 disabled 与「点了再报错」之间二选一**：目前表单有 `disabled={!required}` 的门禁，
   失焦时不会提示「为什么不能提交」。改成「保留可点 + 点击标红」需要动提交门禁。
3. **`Badge` 外圈与卡片边框**仍是装饰性低对比（1.2–1.3:1），状态信息由文字承载。
4. **列表页没有排序**：`sortable-table` 指南给出了渐进增强做法，但后端分页接口不支持排序参数，
   属接口层改动。

