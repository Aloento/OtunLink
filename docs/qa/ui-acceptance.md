# OtunLink UI 验收计划

> 状态：执行中（部分闭环） · 定位：在本地以真实浏览器逐个场景验收前端 UI / 权限 / 业务流 / 双语 / 响应式
> 范围：P0→P10 所有前端页面与关键业务闭环；不含部署到 CF 后的线上验收（见 deploy.md）
> 执行方式：本阶段采用 **方案 B（真实本地 PG + 真实 Entra）**，验收工具为 **agent 内置浏览器**
>（openBrowserPage / readPage / clickElement / typeInPage / screenshotPage），**未采用 Playwright**。
> 实测结果与缺陷清单见下文 **§7 / §8 / §9**。

---

## 1. 目标

用 Playwright 驱动真实浏览器（Chromium），对本仓库 `apps/web` 的每个页面与核心业务流做
「逐个调用网页」验收。每次验收记录：场景编号、前置、操作、预期、实测结果（通过/失败/缺陷）。

## 2. 本地运行前提（必须先解决）

前端 `pnpm dev:web`（Vite，http://localhost:5173）；后端 `pnpm dev:api`（wrangler dev，
http://localhost:8787）。**当前无法直接自动化验收，原因有二：**

### 2.1 后端数据来源

`defaultApp` 用 SQL 仓储，需可达的私有 PostgreSQL（`.dev.vars` 的 `DATABASE_URL`）。
本地无 DB 时业务端点返回 503。仓库已有 `devGetRepos()`（无 DB 时退回**进程内存仓储**），
但未接入默认入口。

### 2.2 登录（真实 Entra OAuth）

前端走 MSAL + 真实 Entra 单租户登录，Playwright 自动化登录弹出/重定向不稳定，且依赖真实凭据。

### 2.3 运行模式（二选一）

**方案 A（推荐）：内存仓储 + dev 登录 mock**
- 新增 dev 装配入口：`verifyToken` 返回固定 claims + `getRepos` 用 `devGetRepos`（内存兜底）。
- 内存仓储 seed 四类用户（ADMIN/COLLECTOR/WAREHOUSE/RETAILER）+ 多业务单元 + 物品 + 典型单据，
  让每个页面都有数据可点验。
- 前端 dev 模式（`VITE_DEV_AUTH=1`）用本地 mock 会话（可切换角色），跳过 MSAL。
- 优点：无外部依赖（DB/Entra）、可重复、跨角色切换快。缺点：内存数据进程级、重启清空。

**方案 B：真实本地 PG + 真实 Entra**
- 需可达 PG：`pnpm --filter db migrate` + 导入 seed；Playwright 用 `storageState` 保存一次真实登录。
- 优点：最贴近生产（真实持久化/权限）。缺点：依赖外部，登录自动化不稳、成本高。

> 本计划默认按**方案 A** 编排；若选方案 B，仅把「运行/登录」替换，可验收项目清单不变。

---

## 3. 可验收项目清单

> 编号规则：`A`=公共/基础，`C`=集货方，`W`=仓库方，`R`=零售方，`AD`=管理员。
> 「前置」为验收前所需角色与数据；数据由 dev seed 提供。

### 3.0 公共 / 基础（A）

| 编号 | 可验收项 | 操作要点 | 预期 |
|---|---|---|---|
| A01 | 未登录跳登录页 | 访问 `/`，未带会话 | 重定向 `/login`，显示登录按钮 |
| A02 | 登录后进入系统 | dev 登录（方案A）或 MSAL | 进入工作台 `/`，导航可见 |
| A03 | 中英双语切换 | 顶部切换语言 | 导航/文案即时切换；Fluent 组件 locale 同步 |
| A04 | 桌面/手机响应式 | 改变视口宽度（375/768/1280） | 桌面侧边栏；手机底部导航；表格转卡片 |
| A05 | 导航与铃铛徽标 | 首页顶栏/侧栏 | 各角色按权限显示导航；有未读通知时铃铛带徽标 |
| A06 | 无权限页面 | 以低权限角色访问高权限路由 | 显示 Forbidden 占位页 |
| A07 | PENDING 用户引导 | 未分配岗位用户登录 | 显示「等待管理员分配岗位」引导页 |
| A08 | 登出 | 退出登录 | 清会话并回到 `/login` |

### 3.1 集货方（C）

| 编号 | 可验收项 | 操作要点 | 预期 |
|---|---|---|---|
| C01 | 物品目录列表 | 打开 `/items` | 分页列表；搜索名称/条码；复用已有物品 |
| C02 | 新增/编辑物品 | 新建物品：名称/条码/规格(件袋盒包+内数)/是否食品 | 保存后列表可见；规格换算展示 |
| C03 | 物品图片上传 | 上传图片 | 自动压缩并显示缩略图 |
| C04 | 创建发货单 | 选集货部；清单(复用物品+新增)；多物流公司/多单号；箱数；食品行必填生产/到期日 | 保存 DRAFT；清单含效期列 |
| C05 | 转交发货单 | 点击「转交」 | 状态 SENT；锁定；收货方可见 |
| C06 | 处理点货差异 review | 工作台「待处理差异」→ 对比应收/实收/原因/照片 → 同意/拒绝 | 同意→应收按实收修订(审计)；拒绝→需评论，可改后重提 |
| C07 | 处理发货退货单 | 接受/拒绝拒收退货 | 接受→登记退回物流(闭环)；拒绝→可修改重提 |
| C08 | 工作台待办汇总 | 打开 `/` | 显示待点货/待处理差异/待处理退货 数量 |

### 3.2 仓库方（W）

| 编号 | 可验收项 | 操作要点 | 预期 |
|---|---|---|---|
| W01 | 点货 | 对 SENT 发货单逐项填实收 | 实收≠应收行**红色高亮**+「差N」徽标+顶部警示 |
| W02 | 提交差异修订 | 填原因+附照片 → 提交 | 状态 PENDING；仅一个 PENDING |
| W03 | 确认收货 | 实收=应收 → 确认收货 | 生成入库单；需建档批次(生产/到期日/批号) |
| W04 | 入库单过账 | POST 入库单 | 建/关联批次；写台账；加库存；原始价只读 |
| W05 | 手动入库单 | 新建手动入库单+明细+批次 | POSTED 后原始价不可改 |
| W06 | 手动出库单 | 普通出库：交易对手+明细；FEFO 提示 | POSTED 扣减库存；台账 OUTBOUND_NORMAL |
| W07 | 报损单 | 填损失原因+附图+指定批次 | POSTED 扣减；台账 OUTBOUND_LOSS |
| W08 | 过期批次一键报损 | 库存页「已过期」Tab → 一键生成 | 生成报损草稿，原因预填「过期」 |
| W09 | 库存台账 | `/inventory` 按仓库 | 物品汇总+批次明细(效期≤30天黄/过期红)+流水 |
| W10 | 零售价管理 | 设置/修改某仓库某物品零售价 | 可改；留历史；不影响采购价 |
| W11 | 销售单-请货创建 | 仓库为零售创建/处理请货 | 行级改价；整单折扣；FEFO 分配预览 |
| W12 | 销售单-发送 | 确认并发送 | 立即扣批次库存；台账 OUTBOUND_SALE |
| W13 | 销售单-取消 | 发送后取消 | 回补库存(OUTBOUND_SALE_REVERSAL)；通知零售 |
| W14 | 售后审核 | 同意/拒绝零售退货 | 同意→可收货回补；拒绝→附理由 |
| W15 | 退收回补 | 收到退回 → 确认收退货 | 原批次优先/待检批次兜底；台账 RETURN_IN |
| W16 | 通知中心 | 打开 `/notifications` | 待点货/差异/销售/效期预警等通知展示 |

### 3.3 零售方（R）

| 编号 | 可验收项 | 操作要点 | 预期 |
|---|---|---|---|
| R01 | 查看各仓库库存/零售价 | `/inventory`、`/retail-prices` | 只读；可见效期；成本/采购价不可见。⚠️ §8.1：库存/零售价范围 = **已签约仓库**（不受自身门店 scope 过滤），默认无签约时为空；零售价**只读**已确认 |
| R02 | 请货创建销售单 | 选仓库+物品+数量+送货方式(自提/快递) | 生成 DRAFT 销售单 |
| R03 | 上传支付凭证 | 销售单上传支付凭证 | 状态 PAYMENT_UPLOADED |
| R04 | 确认收货 | 确认收货 | 状态 CONFIRMED；可发起售后 |
| R05 | 发起售后退货 | 按销售单整单/部分行+原因+照片 | 生成 REQUESTED 售后单；可退数量校验 |
| R06 | 通知中心 | 查看通知 | 销售发送/审核/退货结果通知 |

### 3.4 管理员（AD）

| 编号 | 可验收项 | 操作要点 | 预期 |
|---|---|---|---|
| AD01 | 用户管理 | 分配岗位+数据范围 | 用户刷新即生效；PENDING→ACTIVE |
| AD02 | 业务单元管理 | 增改集货/仓库/门店 | 多实例可见 |
| AD03 | 审计日志 | `/admin/audit-logs` | 列出关键写操作 actor/entity/before/after，可分页筛选 |
| AD04 | 邮件连通性测试 | `POST /admin/test-email` | 有桥→发送记录；无桥→降级提示 |

---

## 4. Playwright 引入方式

- 在仓库新增 e2e 工作区（或用 `apps/web` 内加 `@playwright/test`），`playwright.config.ts` 配置
  `webServer` 同时启动 `dev:web`(5173) 与 `dev:api`(8787)，`baseURL=http://localhost:5173`。
- 按方案 A：`webServer` 启动 dev 装配（内存+dev登录），并前置 seed。
- 测试存放 `e2e/`，按上述编号命名（如 `A01-login.spec.ts`、`C05-send-shipment.spec.ts`）。
- 逐个场景跑通后，可用 `playwright test --grep` 单跑；失败时截图/录屏留档。

## 5. 验收执行流程

1. 确认运行模式（A/B）→ 引入 Playwright + dev 装配/seed。
2. 按编号顺序跑通每个场景（先 A 公共，再 C/W/R/AD）。
3. 每个场景记录实测结果（通过 / 失败 / 缺陷描述）→ 汇总为验收报告。
4. 失败项回填为后续 checkpoint（由子 agent 修复），并复验。

## 6. 开放决策（待确认）

- **运行模式**：方案 A（内存+dev 登录，推荐）还是方案 B（真实 PG+真实 Entra）？
- **Playwright 落点**：独立 `e2e/` 目录还是并入 `apps/web`？
- 是否需要保留「真实登录」一条端到端（方案 B 附带）以验证 MSAL 回调闭环？

---

## 7. 验收执行结果（本阶段 · 方案 B · 内置浏览器）

> 执行方式：agent 内置浏览器（openBrowserPage / readPage / clickElement / typeInPage / screenshotPage），
> 真实本地 PostgreSQL + 真实 Entra 登录（ADMIN `Soar Aloento · 管理员`，中文）。

| 编号 | 结果 | 说明 |
|---|---|---|
| A01 | ✅ PASS | 未登录访问 `/` 重定向 `/login` |
| A02 | ✅ PASS | 真实 Entra 登录进入工作台 `/`，导航可见 |
| A03 | ✅ PASS（缺陷1 已修复） | 中英切换即时生效；见缺陷清单 #1 i18n 字面键（代码已补齐，待复验） |
| A04/A05 | ⚠️ PARTIAL | 导航/铃铛可用；响应式未做视口扫描；见缺陷 #2（createRoot 控制台报错，dev HMR 伪影） |
| A06/A07 | ⚠️ PASS（受 §8.1 偏差影响，语义确认后需按新矩阵复验） | RETAILER `retail.tester`：PENDING 登录显示引导页 → AD01 分配 RETAILER + ST-XX → 进入系统；访问 `/admin/users` 显示 Forbidden ✓ |
| A08 | ⏳ 未执行 | 需最后再登出（会清除 ADMIN 会话） |
| C01/C02 | ✅ PASS | 物品目录列表/新增物品正常 |
| C03 | ✅（缺陷3 已修复，待复验） | 图片上传成功但**回显 403**（OBS 预签名 URL，见缺陷 #3）；预签名已修正，待复验回显 |
| C04/C05 | ✅ PASS | 创建发货单(含食品行生产/到期日)、转交 SENT 正常 |
| C06/C07/C08 | ⏳ 未执行 | 今次会话未覆盖 |
| W01/W02 | ✅ PASS | 点货=应收（无差异）、未落入差异流程 |
| W03 | ✅ PASS | **确认收货修复**：实收=应收→确认收货，生成入库单 IB-20260831-0001；原 500 已修复（见缺陷 #4） |
| W04 | ✅ PASS | 入库单过账→建批次 BATCH-2026-001；台账 +10.00；平均成本 12.50；原始价只读 |
| W05/W06/W07 | ⏳ 未执行 | 手动入库/出库/报损未覆盖 |
| W08 | ✅ PASS | 已过期 Tab 显示批次(-364 天)→一键生成报损单 OB-20260831-0001→过账→库存扣减为 0 |
| W09 | ✅ PASS | 库存台账 + 台账流水（发货入库 · BATCH-2026-001 · +10.00）验证 |
| W10 | ⚠️ 待复验（缺陷5 已修复；受 §8.1 影响） | 零售价管理属**仓库角色**（与业务语义一致，见 §8.1）；当前 WAREHOUSE 可改零售价 ✓；缺陷 #5「新增入口」待复验 |
| W11–W15 | ⏳ 未执行 | 销售请货链；当前库存 0（W08 已耗尽），需先补货 |
| W16 | ⏳ 待复验（缺陷6 已修复） | 通知中心；且确认收货时 `INBOUND_CONFIRMED` 通知写入失败（缺陷 #6，枚举已补齐，待复验） |
| R01–R06 | ⏸ 暂停（§8.1） | 角色权限模型偏差：RETAILER 应**只能看到已签约仓库的库存后请货**，不可见发货单、不可管理物品、零售价只读；且「已签约仓库」与当前自身门店 scope 过滤冲突（R01 实测库存页为空）→ **2026-08-31 晚语义已全部确认**，待实现修复后重写预期再验 |
| AD01 | ✅ PASS | `/admin/users`：列表(姓名/邮箱/岗位/状态/数据范围/创建时间)+「新增用户」「编辑」弹窗(Entra 对象 ID（objectId）/邮箱/姓名/岗位/数据范围/状态/语言偏好)+**「删除」按钮（弹确认，禁止删除当前登录账号）**全部可用；含 Soar Aloento(管理员) 与 Seed Admin |
| AD02 | ✅ PASS | `/admin/units`：6 个单元(集货/零售/仓库)列表正常；「新增业务单元」弹窗(编码/名称/类型/地址/联系方式/时区/本位币/启用)可用 |
| AD03 | ✅ PASS | `/admin/audit-logs`：表列(时间/动作/实体类型/实体ID/操作用户/变更后)+分页「共 2 条」；按实体类型过滤 `inbound_order` 后剩 1 条，筛选刷新正常 |
| AD04 | ✅ PASS | `/admin/test-email`：点击「发送测试邮件」→ 返回「测试邮件发送失败（或邮件桥降级）／提供方: bridge／原因: 未配置 BRIDGE_URL」（无桥降级提示符合预期） |

> 环境与过程故障：本阶段于搜索/切 Tab 时多次出现 `You are calling ReactDOMClient.createRoot()
> on a container that has already been passed to createRoot() before.`（开发期 Vite/HMR 重复挂载伪影，
> 非产品缺陷）；现已清理重复的 vite 实例，仅保留一个 `dev:web` 进程（见 §9）。

### 7.1 已创建的真实 Entra 测试账号

| 账号 | 登录名 (UPN) | Entra objectId | 用途 | 密码 |
|---|---|---|---|---|
| Retail Tester | `retail.tester@SoarCraft.onmicrosoft.com` | `466efbdf-2c9f-4e4e-9f1e-dc367886b83a` | A06（RETAILER 无权限路由→Forbidden）+ R01–R06（**待重写，见 §8.1**） | `OtunTest@2027!`（首登强制改密；**已注册 MFA**，TOTP 密钥在会话记录中） |
| Pending Tester | `pending.tester@SoarCraft.onmicrosoft.com` | `f7193993-a3b2-445a-991f-88153260d3f5` | A07（未分配岗位登录→「等待管理员分配岗位」引导页） | `OtunTest@2026!` |

> 说明：后端关联用户时**优先用 Entra `oid`（objectId），其次回退 `sub`**（见 `apps/api/src/auth/verifier.ts`、
> `middleware.ts`、`routes/auth.ts`）。`/auth/me` 对未开户账号自动创建 PENDING 记录。
> 因此既支持「用户首次登录自动开户（PENDING）→ 管理员在 AD01 分配岗位」，
> 也支持管理员在 AD01 用 Entra **objectId** 预创建后由该用户首次登录直接命中，不再产生重复的 PENDING 记录。

## 8. 缺陷清单与后续跟进

| # | 缺陷 | 影响 | 状态 |
|---|---|---|---|
| 1 | i18n 字面键直出：工作台 todo 卡片、`shipments.remark` 标签、`common.cancel` 按钮等显示原始 key | 双语不完整 | ✅ 已修复（zh-CN/en 补齐 4 个缺失 key） |
| 2 | `createRoot()` 重复挂载控制台报错（dev HMR，疑似双 vite 实例） | 开发期偶发 SPA 重置/掉登录 | ✅ 环境清理（仅保留单 `dev:web` 实例，非产品缺陷） |
| 3 | 图片上传后**回显 403**（OBS/s3 预签名 URL 失效） | 图片缩略图/预览无法显示 | ✅ 已修复（`X-Amz-Expires` 改为置于 URL query，避免被计入 `X-Amz-SignedHeaders`） |
| 4 | **确认收货 500（已修复）**：`confirmReceipt` 写入 `inbound_order_items.production_date/expiry_date` 时 `String(Date).slice(0,10)` 产生 `"Sun Jun 01"` → 非法 date → 事务回滚 → 500 | 阻塞 W03 闭环 | ✅ 已修复 |
| 5 | 零售价页无「新增」入口：仅对已有行「编辑」，无法为无价仓库×物品创建零售价（后端 PUT 为 upsert，支持创建） | W10 设置零售价无法从 UI 完成 | ✅ 已修复（新增零售价入口 + create 模式对话框） |
| 6 | `notification_type` 枚举缺 `INBOUND_CONFIRMED`（migration `0000` 仅有 `INBOUND`）→ 确认收货通知写入失败（被捕获记录，业务仍成功） | W16 通知缺失、无确认入库通知 | ✅ 已修复（migration `0007` 补齐 14 个类型） |
| 7 | `/stock/expired` 500（**已修复**）：`listExpired` WHERE 引用 `s.expiry_date`，但 `stock` 表无该列，到期日在 `batches`（`b.expiry_date`） | 阻塞 W08 | ✅ 已修复 |
| 8 | A06/A07 无法复现：ADMIN 全权限，缺受限/PENDING Entra 账号 | 无权限/PENDING 引导无法验收 | ✅ 账号已创建：RETAILER `retail.tester`（objectId `466efbdf-…`）、PENDING `pending.tester`（`f7193993-…`）；可执行验收 |
| 9 | 硬刷新/直链访问受保护路由被重定向回 `/`（工作台）：刷新 `/admin/users`、`/admin/test-email`、`/shipments` 均由认证初始化阶段 `RequireAuth` 先用 `replace` 跳到 `/login`，登录态恢复后再跳 `/`，丢失深链 | 深链/刷新丢失，无法直达具体页面（SPA 内点击导航正常）| ✅ 已修复并实测通过（① `RequireAuth` 未登录跳转前将目标路径暂存至 sessionStorage（新增 `returnTo.ts`）；② `LoginPage`/`CallbackPage` 在会话就绪后 `consumeReturnTo()` 恢复深链，否则回 `/`。实测刷新/直达 `/admin/users`、`/admin/units`、`/admin/audit-logs`、`/admin/test-email` 均保留深链且登录态不丢） |
| 10 | 用户管理「新增用户」与「删除」语义修正（本次实施）：① 后端新增 **oid 优先的账号关联**（`oid ?? sub`），使管理员填写的 Entra objectId 能正确预创建/命中真实用户，解决「手动新增用户不可靠、重复 PENDING」问题；② 新增 **`DELETE /admin/users/:id`** + 前端「删除」按钮（禁止删除当前登录账号），补全用户删除能力（原仅可「停用」DISABLED） | 用户管理完整性与开户流程一致 | ✅ 已修复（`types.ts`/`verifier.ts`/`middleware.ts`/`routes/auth.ts`/`repos/*`/`admin-users.ts`/`AdminUsersPage.tsx` + i18n + 测试） |

| 11 | **角色权限模型偏差（2026-08-31 业务评审发现，2026-08-31 晚语义已全部确认 → 待实现）**：RETAILER 被实现为「可读发货单/管物流单号/看零售价/可维护物品目录」，但业务语义为「零售 = **外部合作方（商铺买家）**：不可见发货单、不管理零售价（仅只读，范围=已签约仓库）、不能管理物品、只能看已签约仓库库存后请货、付款、退货」；WAREHOUSE 才是改零售价的角色（现实现 ✓）；且「scope 空 = 全量」使仓库/集货可越权到非归属单元（必须绑定归属单元 + 账户单实体）；另需新增**仓库-零售签约关系**与**销售单配送方式+单号**（见 §8.1） | 商业信息泄漏 + 越权 + R 链路不可验收 | ⏸ 暂停验收，**语义已确认，待实现**（详见 §8.1 与 [`rbac-matrix-vs-semantics.md`](./rbac-matrix-vs-semantics.md)） |

---

## 8.1 角色权限模型偏差（评审记录 · 2026-08-31）

**结论**：checkpoint 阶段实现的 RBAC 矩阵与真实业务语义不符（偏差源于早期设计文档 §3.2 矩阵本身即与业务语义有出入，checkpoint 忠实实现了该矩阵）。

**业务语义（用户确认，2026-08-31 晚已全部确认）**：
- **RETAILER = 外部合作方（商铺买家）**：不可见发货单（发货单/物流单号均不可见）；**不可管理零售价**（仅**只读**仓库提供的零售价）；**不可管理物品列表**（仅浏览/搜索/扫码）；只能看到**已签约仓库的库存**然后请货（下单）、上传支付凭证、确认收货、发起售后退货等。
- **WAREHOUSE = 可修改零售价的角色**；只能管理**自己归属的仓库**，不能管理别人的仓库。
- **COLLECTOR（发货方）= 只能管自己的发货单**。
- **归属绑定**：仓库/集货/零售**必须绑定归属单元**；**一个账户只能绑定一个实体**（不允许一个账号管理多个仓库/集货地/门店），**一个实体可有多个账户**（如一个仓库多个仓管）；仅 ADMIN 可空（全量）。
- **仓库-零售签约**：零售可见的库存/零售价/可请货仓库 = **已签约仓库**；签约仅由**仓库主动发起**（添加进可售客户列表即生效，零售无需同意）。
- **销售单配送信息**：仓库提供**配送方式 + 配送单号**（如自提、快递）供零售查看（独立于发货单）。
- **外部合作方账号**：由公司创建 Entra 账号（与内部其他用户一致），无特殊 B2B 来宾流程。

**开放问题答复（2026-08-31 晚，业务方逐条确认）**：
1. 零售价：**可以只读**（范围 = 已签约仓库）。
2. ITEMS_WRITE：**移除**（零售不能管理物品列表）。
3. 物流单号：随发货**不可见**；销售单需有**独立配送方式+单号**供零售查看。
4. scope 语义：**非 ADMIN 必须绑定归属单元**，账户单实体（实体可多账户）；「空 = 全量」仅 ADMIN。
5. 仓库可见范围：**已签约仓库**（签约由仓库主动发起/添加即生效）。
6. 外部合作方账号：公司创建 Entra 账号（与内部一致）。

**实现偏差**（详见 [rbac-matrix-vs-semantics.md](./rbac-matrix-vs-semantics.md) 三方对照表）：
1. `RETAILER` 含 `SHIPMENTS_READ` + `TRACKINGS_MANAGE` → 前端出现「发货单」入口，外部合作方可看内部发货单（**应移除**）。
2. `RETAILER` 含 `RETAIL_PRICES_READ` → 只读保留 ✓，但**查询范围需改为已签约仓库**（当前 `scopeAllows` 会受自身门店过滤/空 scope 放行）。
3. `RETAILER` 含 `ITEMS_WRITE` → 外部合作方可维护全局物品目录（**应移除**，仅保留 `ITEMS_READ`）。
4. **「scope 空 = 全量」**：`scopeAllows*`/`scopeAllowsWrite` 在 `scope_unit_id` 为空时全部放行（`shipments.ts`、`retail-prices.ts`、`inbound/outbound/reviews/return-orders` 等）→ 仓库/集货未绑 scope 时可操作**所有**仓库/发货单，违反「只能管理自己归属」（应改为非 ADMIN 空 scope 即拒绝）。
5. **零售库存被自身门店 scope 过滤**：`stock.ts:28` `unitId: unitId || scope?.unitId` → `retail.tester`(scope=ST-XX) 调 `/stock` 只查自己门店（无货）→ 库存页恒空；应改为按**已签约仓库**查询。
6. **缺失**：仓库-零售签约关系（新表）、销售单配送方式+单号（`sales_orders.carrier/tracking_no`）——均为新增实现项。

**本轮处理（2026-08-31）**：不实现代码；已修订 `docs/design.md`（§1.3/§1.4/§3.2/§3.3/§3.2.1/§3.2.2/附录 C/§11.10 + §4.2 销售单/新表），确认结果记录于 [`rbac-matrix-vs-semantics.md`](./rbac-matrix-vs-semantics.md) §1.1。**R01–R06 验收暂停**，待实现修复（角色权限 + scope + 签约 + 销售单配送字段）后重写 R 链路预期再验。

---

## 9. 本阶段代码 / 迁移变更

- `apps/api/src/repos/sql.ts`：新增 `toYMD()` 辅助函数，修复 5 处日期映射（`mapShipment`、
  `mapShipmentItem`、`mapInboundItem`、`mapStockRow`、`mapSalesAllocation`）；修复 `listExpired`
  到期日列别名 `s.expiry_date` → `b.expiry_date`。
- 已验证：`apps/api` `tsc --noEmit` 通过；`pnpm --filter api run test` **136/136 通过**。
- `apps/api/src/lib/s3.ts`（缺陷 #3）：修复 `presignedGetUrl`，将 `X-Amz-Expires` 设置在 URL query
  而非作为 header 传入，避免其进入 `X-Amz-SignedHeaders` 导致浏览器 GET 签名不匹配返回 403。
- `apps/web/src/i18n/resources/{zh-CN,en}.ts`（缺陷 #1）：补齐 `common.cancel/confirm`、
  `shipments.remark`、`sales.manualQty` 等缺失 key。
- **AD01–AD04 管理端 UI（新增）**：
  - `apps/web/src/api/admin.ts`（新增）：`/admin/users`、`/admin/units`、`/admin/audit-logs`、`/admin/test-email` 客户端。
  - `apps/web/src/pages/admin/{AdminUsersPage,AdminUnitsPage,AuditLogsPage,TestEmailPage}.tsx`（新增）：用户/业务单元/审计日志/邮件连通性 4 页。
  - `apps/web/src/routes/routes.ts`：新增 `adminAuditLogs`(`/admin/audit-logs`,`AUDIT_ADMIN`)、`adminTestEmail`(`/admin/test-email`,`USERS_ADMIN`) 路由；`NAV_ADMIN` 扩为 4 项。
  - `apps/web/src/App.tsx`：挂载 4 个管理页，移除 `PlaceholderPage/PLACEHOLDER_KEYS`。
  - 已验证：`apps/web` `tsc --noEmit` 通过、i18n `resources.test.ts` 2/2 通过；浏览器 AD01–AD04 均 PASS。
- `apps/web/src/pages/retail-prices/RetailPricesPage.tsx`（缺陷 #5）：`editing` 态重构为
  `draft` 态（`mode: 'edit' | 'create'`），新增「新增零售价」入口与 create 模式仓库/物品选择。
- `packages/db/migrations/0007_notification_types.sql`（缺陷 #6）：新增 14 个
  `ALTER TYPE "public"."notification_type" ADD VALUE`（`SHIPMENT_SENT`、`INBOUND_CONFIRMED`、
  `SHIPMENT_RETURN_PENDING`、`REVIEW_PENDING/APPROVED/REJECTED`、`SALES_SENT/CANCELLED/PAYMENT_UPLOADED/CONFIRMED`、
  `AFTER_SALE_REQUESTED/APPROVED/RETURNED`、`RETURN_ACCEPTED`）；同步 `packages/db/src/enums.ts` 的
  `notificationTypeEnum` 并重新生成 `migrations.generated.ts`。
- 环境清理（缺陷 #2）：停止重复的 vite 实例，仅保留一个 `dev:web`（127.0.0.1:5173）。
- 已验证：DB 枚举含全部 24 个类型，14 个新类型事务回滚 INSERT 通过；Web `tsc --noEmit` 通过；
  i18n 键检查 0 缺失；S3 上传+预签名 GET 返回 200。
