# ck-02（P2）认证与岗位/业务单元

## 目标
实现 Entra ID（Azure AD 免费版）OAuth 登录、自动开户、管理员分配岗位与数据范围、服务端 RBAC 鉴权。

## 范围
- 🔨 `docs/auth-setup.md`：Entra 单租户 App Registration 指南（重定向 `https://app.otunlink.com/auth/callback`、API 暴露范围 `api://<app-id>/OtunLink.API`、免费版权限说明）
- 🔨 apps/web：MSAL（auth code + PKCE）登录/登出；`/auth/callback`；登录后调 `/auth/me`
- 🔨 apps/api：
  - `POST /auth/callback`（或前端带 code 换 token 后）`GET /auth/me`：按 sub+email 自动开户（status=PENDING，role 未定）
  - `GET/PATCH /users/me`；管理端 `GET/POST /admin/users`、`PATCH /admin/users/:id`（设 role ∈ ADMIN/COLLECTOR/WAREHOUSE/RETAILER + 可选 scope_unit_id）
  - 业务单元 CRUD：`GET /units`、`GET/PATCH /admin/units`
- 🔨 RBAC：jose 校验 JWT（JWKS 经 KV 缓存 24h）、`requireAuth`/`requireRole`/`requireUnitScope` 中间件；design.md §3.2 + 附录 C 权限矩阵落地；行为写审计（ck-10 完善，本 checkpoint 先留桩）
- 🔨 PENDING 引导页：提示「等待管理员分配岗位」
- 🔨 测试：RBAC 单测（各角色×资源矩阵抽样）、鉴权失败用例

## 不做
- 条件访问/MFA 策略（用 Entra 安全默认值，docs 说明即可）
- 邮件、通知

## 验收
1. 开发环境完成真实登录（或提供可回放的单测/集成测试证明 token → user 流程）
2. 未登录访问业务 API 返回 401；越权返回 403
3. /auth/me 自动开户，PENDING 用户仅能访问引导页与 /auth/me
4. 管理员可改岗位与数据范围，且立即生效（重新鉴权）
5. `pnpm -r typecheck && pnpm -r test && pnpm -r build` 通过

## 参考
design.md：§3 认证与权限、附录 C 权限矩阵、§11 风险 8。

## 完成情况

- ✅ `docs/auth-setup.md`：Entra 单租户 App Registration 指南（重定向 `https://app.otunlink.com/auth/callback`、API 范围 `api://<app-id>/OtunLink.API`、配置项写入 `.dev.vars.example` / `.env.example`）。
- ✅ apps/web：MSAL（auth code + PKCE）配置与登录/登出；`/auth/callback` 路由占位；登录后调 `/auth/me`；PENDING 引导页；未配置环境变量时给出提示。
- ✅ apps/api：jose JWT 校验（JWKS 经 KV 24h 缓存 + 内存降级）；`requireAuth`/`requireRole`/`requirePermission`/`requireUnitScope` 中间件；`GET /auth/me` 自动开户（PENDING）；`GET/PATCH /users/me`；`GET/POST /admin/users`、`PATCH /admin/users/:id`；`GET /units`、`GET/POST /admin/units`、`PATCH /admin/units/:id`。
- ✅ RBAC：`packages/shared` 落 permission 常量 + role→permission 映射 + `hasPermission`；本 checkpoint 对 auth/users/units 路由生效，中间件通用（后续业务路由复用）。
- ✅ 测试：RBAC 矩阵抽样单测（shared 9 项）+ API 鉴权/RBAC e2e（内存 repository，20 项）+ Web 可测部分（12 项）。
- ⚠️ 生产数据层：PG 不可达（ck-01 BLOCKED 遗留），repositories 为「接口 + SQL 实现 + 内存实现」，生产最终应切 Drizzle（接口接缝已留，注入方式不变）。
- ⚠️ 真实登录未在开发环境实测：需提供真实 `TENANT_ID`/`CLIENT_ID`；代码使用占位符可先行，token→user 流程由注入 fake `verifyToken` 的 e2e 测试覆盖。
- ⚠️ 审计日志：按 checkpoint 约定仅留桩，ck-10 完善。

