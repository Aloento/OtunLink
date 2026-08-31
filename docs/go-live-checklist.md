# OtunLink 上线检查清单（分阶段）

> 与 `docs/deploy.md` 配套。建议按阶段推进，每阶段有明确验收动作。

## 阶段 0：开发验证（本地）

- [x] `pnpm -r typecheck` 通过（0 error）
- [x] `pnpm -r test` 通过（含 `smoke.test.ts` 全链路集成）
- [x] `pnpm -r build` 通过
- [x] 迁移文件与 `schema.ts` / `migrations.generated.ts` 一致
- [x] 无真实 PG / 真实 SMTP 依赖纳入测试（全 mock）

## 阶段 1：基础设施

- [ ] Pages 项目 + 自定义域 CNAME（`app.example.com` → `*.pages.dev`）
- [ ] Workers 项目 + 自定义域（`api.example.com`）
- [ ] Hyperdrive 实例指向生产 PG（连接池参数见 deploy.md §2）
- [ ] R2 bucket 与 KV 创建，绑定到 Worker
- [ ] `.dev.vars` 与生产 secrets 分离，生产不提交任何密钥

## 阶段 2：数据库

- [ ] `drizzle-kit migrate` 在预发库执行成功（journal 与线上一致）
- [ ] 预发库做一次「备份 → 迁移 → 回滚演练」（见 deploy.md §4.1）
- [ ] 关键表索引核对：`audit_logs(entity_type, entity_id)`、
      `notifications(user_id, read_at)`、`email_logs(status, created_at)`
- [ ] 确认 P10 新增 `email_logs.body` / `email_logs.attempts` 列已生效

## 阶段 3：应用

- [ ] API `GET /api/v1/health` 返回 `{"ok":true}`
- [ ] 登录（MSAL）→ 工作台 `/` 显示角色待办
- [ ] 通知中心 `/notifications`：列表 / 未读筛选 / 批量已读 / 导航徽标
- [ ] 管理员：`GET /admin/audit-logs` 分页筛选可用（仅 ADMIN）
- [ ] 管理员：`POST /admin/test-email`：
  - 配置了 SMTP → 返回 `{"ok":true}` 且收到测试邮件
  - 未配置 → 返回 `{"ok":false,"reason":"未配置 SMTP_HOST..."}`（符合预期）
- [ ] 效期预警：手动触发 `scheduled`（或等待定时）后站内通知生成；
      配了 SMTP 则额外收到邮件，未配则仅站内通知

## 阶段 4：邮件（SMTP 直连，可选）

- [ ] 在 GitHub 仓库 Secrets 配置 `SMTP_USER` / `SMTP_PASS`（部署 CI 自动 `wrangler secret put`；`SMTP_HOST`/`MAIL_FROM` 等在 `wrangler.toml [vars]`）
- [ ] 确认邮箱服务器允许 Cloudflare Workers 经 465（隐式 TLS）/ 587（STARTTLS）出站
- [ ] `POST /admin/test-email` 联通：返回 `{"ok":true}` 且收到测试邮件
- [ ] 未配置时确认 API 返回降级原因、仅站内通知（fail-safe）

## 阶段 5：灰度与回滚

- [ ] 只读流量放量 10% → 监控 `4xx/5xx` 比例与 `email_logs` 失败率
- [ ] 写操作放量（入库/出库/销售）→ 抽查 `audit_logs` 与通知落库
- [ ] 回滚预案：`drizzle-kit migrate` 前滚为主；破坏性变更按「扩后缩」执行
- [ ] 值班监控：`/api/v1/health`、`/notifications/unread-count` 时延
