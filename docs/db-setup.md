# OtunLink 数据库设置（PG / Hyperdrive）

> 记录私有 PostgreSQL 的连通方式、迁移执行方式与验证结论。

## 1. 当前验证结论（✅ 已连通）

- 连接串已配置在 `apps/api/.dev.vars`（gitignored）：`postgresql://<user>:<pwd>@164.30.21.203:5432/otunlink`
- `pnpm --filter db db:migrate` 已应用（`schema_migrations` 有记录、业务表存在）
- `pnpm --filter db db:ping` 直连与经 relay 均 OK
- Worker 内 `/api/v1/auth/me` 经 postgres.js（`cloudflare:sockets`）直连返回 **200 OK**（登录闭环实测，见 3.3b）
- 本地直连未启用 SSL；生产 Hyperdrive 连接由 Cloudflare 隧道 + Hyperdrive 数据库配置（建议 SSL）承担

## 2. 架构与连接方式

```
私有 PostgreSQL
     ▲
     │ (SSL, 防火墙放行 Cloudflare 出口 IP)
     ▼
Cloudflare Hyperdrive (连接池 + 缓存)
     ▲
     │ (hyperdrive binding)
     ▼
Worker (apps/api) ── 降级直连 ──► DATABASE_URL
```

- **Worker（Cloudflare）**：优先使用 Hyperdrive binding（`env.HYPERDRIVE`），不存在时回退到 `DATABASE_URL` 直连（开发 / 降级）。
- **本地开发**：`wrangler dev` 支持 `.dev.vars` 中写 `DATABASE_URL`（不入库），或在 `wrangler.toml`/`wrangler.jsonc` 配置 hyperdrive 绑定。
- **CLI / 脚本**：`packages/db` 的 `migrate` / `seed` / `ping` 命令读取 `DATABASE_URL`（可选 `DB_SSL=true`）。

## 3. 待用户提供后执行的验证步骤

### 3.1 防火墙 / 白名单

1. 在私有 PG 的安全组 / 防火墙放行 Cloudflare 出口 IP 段（见 Cloudflare 文档 `https://www.cloudflare.com/ips/`），或对测试库临时放行开发机出口 IP。
2. PG 必须允许外部 SSL 连接（`pg_hba.conf` 使用 `hostssl`），建议 `sslmode=require` 起步，生产建议 `verify-full` 并提供 CA 证书。

### 3.2 连接串样例

```env
# 直连（本地 / 降级）
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/otunlink?sslmode=require

# Hyperdrive（在 Cloudflare 控制台创建绑定后自动获得）
# wrangler.jsonc / wrangler.toml:
#   hyperdrive = [{ binding = "HYPERDRIVE", id = "<hyperdrive-id>" }]
```

> 切勿把含密码的连接串提交进仓库；本地放入 `.dev.vars`（已被 gitignore），CI/生产使用 Secret。

### 3.3 生成并应用迁移

```bash
pnpm --filter @otunlink/db db:generate     # 依据 schema 重新生成基线 SQL 并内嵌（离线，无需数据库）
pnpm --filter @otunlink/db db:migrate      # 执行迁移（需要 DATABASE_URL）
pnpm --filter @otunlink/db db:ping         # SELECT 1 连通性自检
pnpm --filter @otunlink/db seed            # 写入示例业务单元（幂等）
```

等价于：

```bash
DATABASE_URL='postgres://...' pnpm --filter @otunlink/db db:migrate
DATABASE_URL='postgres://...' pnpm --filter @otunlink/db seed
```

### 3.3b 本地开发注意事项

1. **Miniflare 的 Hyperdrive 本地模拟不可用**（wrangler 4.127.x + miniflare 5 alpha）：
   报 `proxy request failed, cannot connect to the specified address`——即使目标是本机 relay
   （127.0.0.1）。workerd 的 `cloudflare:sockets` 出站本身正常（已用最小 worker 验证），
   是 Hyperdrive 模拟层的问题。
   **workaround**：本地开发使用 [apps/api/wrangler.local.toml]（不含 `[[hyperdrive]]`），
   即 `wrangler dev --config wrangler.local.toml`；此时 db.ts 回退到 `DATABASE_URL` 直连
   （postgres.js 经 `cloudflare:sockets` 出站）。生产部署仍用 `wrangler.toml`
   （Hyperdrive binding，不受影响）。
2. **postgres.js 必须每个请求创建**（`db.ts` 的 `createExecutor` 不做模块级缓存）：
   workerd 禁止跨请求复用 I/O 对象，缓存单例会抛
   `Cannot perform I/O on behalf of a different request. (I/O type: Writable)`。
   连接池复用由 Hyperdrive（生产）承担；本地直连时每请求建连开销可接受。
3. **端口残留**：多次重启 `wrangler dev` 前先确认 8787 已释放
   （`Get-NetTCPConnection -LocalPort 8787 -State Listen`），否则浏览器请求可能打到旧实例。

### 3.4 Worker 内验证

```bash
cd apps/api
wrangler dev --local    # 或部署后调用
curl -X POST http://localhost:8787/api/v1/admin/migrate \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Authorization: Bearer <ADMIN-JWT>"
```

响应 `{ "ok": true, "applied": [...], "skipped": [...] }` 即迁移幂等执行成功；再次调用应返回空 `applied`（幂等）。

## 4. 迁移幂等与历史

- 执行器在目标库维护 `schema_migrations` 表（`name` 主键 + `applied_at`）。
- 每次运行先读取已执行迁移，只应用未执行的迁移；单个迁移在事务中执行，失败回滚。
- 生成的 SQL 使用 drizzle-kit 的 `--> statement-breakpoint` 分隔符，执行器会先按此切分再逐条执行（该分隔符并非合法 SQL）。
- `POST /api/v1/admin/migrate` 鉴权顺序：`X-Admin-Secret` 已配置(否则 503) → 头存在(401) → 头正确(401) → 角色为 ADMIN(403) → DB 可用(503) → 执行(失败 500)。

## 5. 种子数据

`pnpm --filter db seed` 幂等插入示例业务单元：

| code | name | type | region |
| ---- | ---- | ---- | ------ |
| SH-COLLECT | 上海集货 | COLLECTION | CN |
| GZ-COLLECT | 广州集货 | COLLECTION | CN |
| HU-WAREHOUSE | 匈牙利仓 | WAREHOUSE | HU |
| AT-WAREHOUSE | 奥地利仓 | WAREHOUSE | AT |
| XX-SUPERMARKET | XX超市 | RETAIL | XX |
| YY-SUPERMARKET | YY超市 | RETAIL | YY |

设置 `SEED_ADMIN=1` 可额外插入占位管理员用户（需先手动重置为可用凭证）。
