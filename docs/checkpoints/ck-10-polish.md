# ck-10（P10）通知 / 审计 / 邮件桥 / 打磨上线

## 目标
站内通知 + 自建域名邮箱（HTTP↔SMTP 桥）打通关键事件；审计日志完善；工作台待办聚合与效期预警；数据导入（可选）；上线检查清单。

## 范围
- 🔨 通知：`notifications` 表写入点接入关键事件（待点货/差异/拒收/发货退货/售后/过期预警/销售发送/支付待确认…）；`GET /notifications`、`POST /notifications/read`；工作台 `/` 待办聚合（按角色+scope）
- 🔨 邮件（design.md §8.8）：
  - `EmailProvider` 接口 + 两种适配器：`mail-bridge`（自建 HTTP↔SMTP 桥，`infra/mail-bridge` 轻量 Node 服务，API key 鉴权，部署于邮件服务器侧）/ `api`（预留）
  - 环境变量：BRIDGE_URL/API_KEY、MAIL_FROM（如 noreply@otun.musi.land）
  - `email_logs` 表记录；异步发送 + 1 次重试；`POST /admin/test-email` 连通性测试
  - 无桥时的降级：仅站内通知（文档说明）
- 🔨 审计：`audit_logs` 完善（谁/何时/何资源/前后值，关键写操作全覆盖）；`GET /admin/audit-logs`（筛选）
- 🔨 效期预警：Cron + 通知/邮件联动（ck-08b 已产记录，此处接发送）
- 🔨 数据导入（可选）：物品/期初库存 CSV/Excel 导入接口与页面
- 🔨 上线：`docs/deploy.md`（Pages/Workers/Hyperdrive/域名/Env 变量清单/迁移流程）、`docs/go-live-checklist.md`、README 完善；Playwright 冒烟全链路（集货→仓→零售主流程）
- 🔨 打磨：加载/空态/错误态、键盘可达性、移动端体验复查

## 不做
- 新业务功能（盘点/库位/报表/汇率/B2C 为后续迭代，§11 风险 9）

## 验收
1. 关键事件产生站内通知；工作台待办正确（按角色）
2. 配置 mail-bridge 后 `POST /admin/test-email` 成功（或明确记录降级原因）；发送/重试/日志可用
3. 审计日志覆盖关键写操作可查询
4. 效期预警通知/邮件可收到（人工或测试触发）
5. deploy.md + go-live-checklist 完整；冒烟用例通过
6. `pnpm -r typecheck && pnpm -r test && pnpm -r build` 通过

## 参考
design.md：§8.5 通知、§8.8 邮件、§6.2/§6.1、§9 非功能、§10 P10、§11 风险 2。

## 完成情况（ck-10 收官，2026-08-31）
- ✅ 站内通知：关键事件接入 notifications.create（发货转交 SHIPMENT_SENT、确认入库 INBOUND_CONFIRMED、差异 REVIEW_PENDING、发货退货/售后、销售发送/支付/确认、效期 EXPIRY_ALERT 沿用 ck-08b）；新增 `GET /api/v1/notifications`（本人+scope 分页/unreadOnly）、`GET /api/v1/notifications/unread-count`（导航小红点）、`POST /api/v1/notifications/read`（批量已读）；`GET /api/v1/dashboard/todos` 按角色+scope 聚合待办（复用各列表查询）。前端：AppLayout 铃铛+未读徽标、/notifications 页、工作台 `/` 页（加载/空/错误态）。
- ✅ 邮件（§8.8）：`EmailProvider`（lib/email.ts）+ bridge 适配器（POST {BRIDGE_URL}/send，X-API-KEY）、api 适配器预留（未配置报错降级）；`BRIDGE_URL/BRIDGE_API_KEY/MAIL_FROM/MAIL_PROVIDER`；email_logs 记录 to/subject/body/status/error/attempts/sent_at，异步发送+1 次重试（deliverEmail）；`POST /api/v1/admin/test-email` 连通性测试（未配置返回降级原因）；无桥降级为仅站内通知。`infra/mail-bridge` 独立零依赖 Node 样例（HTTP → SMTP，25/465，不入 pnpm workspace，未本地跑真实 SMTP）。
- ✅ 审计：关键写操作（入库过账/出库过账/报损/销售发送/取消/售后审核/收货/零售价修改/退货确认）写 audit_logs（actor/entity/before/after 摘要）；`GET /api/v1/admin/audit-logs` 分页 + entityType/entityId/actorId/时间范围筛选，仅 ADMIN。
- ✅ 效期预警：runExpiryScan 输出 alerts（EXPIRING/EXPIRED），scheduled() 在有邮件桥配置时同步发邮件（无则跳过）。
- ✅ 冒烟：新增 `apps/api/src/smoke.test.ts`（vitest 全链路：集货发货单→仓库点货→确认入库→入库过账→手动出库→零售价→销售单发送/支付/确认→售后退货申请/审核/收货 + 通知/审计/工作台校验），纳入 `pnpm -r test`。未新增 Playwright（仓库无 e2e 框架）。
- ✅ 上线文档：`docs/deploy.md`（Pages/Workers/Hyperdrive/域名 CNAME/Env 清单/drizzle-kit migrate/回滚）、`docs/go-live-checklist.md`（分阶段）、README 快速开始补通知/邮件说明。
- ⏭️ 数据导入（可选）：**按父任务要求跳过**（物品 CSV/Excel 导入未实现，留待后续迭代）。
- ℹ️ 说明：email_logs 表在迁移 0000 已存在（ck-08b 前置），本 checkpoint 仅新增迁移 `0006_shallow_peter_quill`（补 `body`/`attempts` 列 + meta snapshot）。
- 验证：`pnpm -r typecheck`（4/4 通过）、`pnpm -r test`（33 文件 / 200 用例全过：shared 16、db 8、api 136、web 40）、`pnpm -r build`（shared/db tsc、web vite、api wrangler dry-run 均通过）。
- ▶️ 后续（ck-11）：邮件由 `infra/mail-bridge`（HTTP→SMTP 桥）改造为 **SMTP 直连**（Worker 出站 TCP 465/587），并删除邮件桥，详见 [ck-11-smtp.md](ck-11-smtp.md)。
