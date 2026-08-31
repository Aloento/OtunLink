# ck-10（P10）通知 / 审计 / 邮件桥 / 打磨上线

## 目标
站内通知 + 自建域名邮箱（HTTP↔SMTP 桥）打通关键事件；审计日志完善；工作台待办聚合与效期预警；数据导入（可选）；上线检查清单。

## 范围
- 🔨 通知：`notifications` 表写入点接入关键事件（待点货/差异/拒收/发货退货/售后/过期预警/销售发送/支付待确认…）；`GET /notifications`、`POST /notifications/read`；工作台 `/` 待办聚合（按角色+scope）
- 🔨 邮件（design.md §8.8）：
  - `EmailProvider` 接口 + 两种适配器：`mail-bridge`（自建 HTTP↔SMTP 桥，`infra/mail-bridge` 轻量 Node 服务，API key 鉴权，部署于邮件服务器侧）/ `api`（预留）
  - 环境变量：BRIDGE_URL/API_KEY、MAIL_FROM（如 noreply@otunlink.com）
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
