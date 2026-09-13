# OtunLink 数据库设置（PG / Hyperdrive）

> 记录私有 PostgreSQL 的连通方式、迁移执行方式与验证结论。

## 1. 当前验证结论（✅ 已连通）

- 连接串已配置在 `apps/api/.dev.vars`（gitignored）：`postgresql://<user>:<password>@<DB_HOST>:5432/otunlink`
- `pnpm --filter @otunlink/db db:migrate` 已应用（`schema_migrations` 有记录、业务表存在）
- `pnpm --filter @otunlink/db db:ping` 直连与经 relay 均 OK
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
- **本地开发**：`wrangler dev` 支持 `.dev.vars` 中写 `DATABASE_URL`（不入库），或在 `wrangler.toml` 配置 hyperdrive 绑定。
- **CLI / 脚本**：`packages/db` 的 `migrate` / `seed` / `ping` 命令读取 `DATABASE_URL`（可选 `DB_SSL=true`）。

> ⚠️ Hyperdrive 默认开启**查询缓存**（且写入不会使其失效），会造成「用户改了看不到、刷新也没用」。
> 必须把 TTL 压到最小，见下文 §6。

## 3. 待用户提供后执行的验证步骤

### 3.1 防火墙 / 白名单

1. 在私有 PG 的安全组 / 防火墙放行 Cloudflare 出口 IP 段（见 Cloudflare 文档 `https://www.cloudflare.com/ips/`），或对测试库临时放行开发机出口 IP。
2. PG 必须允许外部 SSL 连接（`pg_hba.conf` 使用 `hostssl`），建议 `sslmode=require` 起步，生产建议 `verify-full` 并提供 CA 证书。

### 3.2 连接串样例

```env
# 直连（本地 / 降级）
DATABASE_URL=postgresql://<user>:<password>@<DB_HOST>:5432/otunlink?sslmode=require

# Hyperdrive（在 Cloudflare 控制台创建绑定后自动获得）
# wrangler.toml:
#   [[hyperdrive]]
#   binding = "HYPERDRIVE"
#   id = "<hyperdrive-id>"
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

`pnpm --filter @otunlink/db seed` 幂等插入示例业务单元：

| code  | name     | type      |
| ----- | -------- | --------- |
| SH-CN | 上海集货 | COLLECTOR |
| GZ-CN | 广州集货 | COLLECTOR |
| WH-HU | 匈牙利仓 | WAREHOUSE |
| WH-AT | 奥地利仓 | WAREHOUSE |
| ST-XX | XX超市   | RETAILER  |
| ST-YY | YY超市   | RETAILER  |

设置 `SEED_ADMIN=1` 可额外插入占位管理员用户（需先手动重置为可用凭证）。

## 6. Hyperdrive 查询缓存与写后读一致性（重要）

### 症状

用户新增 / 编辑 / 过账后，界面上看不到变化：**F5 刷新、清空浏览器缓存、换设备都没用**，等大约 1 分钟后才出现。这是服务端 Hyperdrive 查询缓存导致的，客户端怎么刷都刷不掉。

### 根因

Cloudflare Hyperdrive 自 2024 年起**默认开启查询缓存**（`caching.enabled = true`）：

- 只缓存**只读查询**（SELECT），缓存键 = SQL 文本 + 参数；
- **写入 / 事务不会使其失效**（官方明确：Hyperdrive 不做自动失效，也不感知逻辑依赖）；
- 默认 `max_age = 60s` + `stale_while_revalidate = 15s` → 写入后最长约 75 秒内，**所有用户**（包括写入者自己）读到的都还是旧数据。

注意：`apps/api/wrangler.toml` 的 `[[hyperdrive]]` 绑定只接受 `binding` 与 `id` 两个键，
缓存参数属于 Hyperdrive **资源本身**，改 toml 无效，必须用 CLI 或控制台修改。

### 处理（一次即可，但每次新环境都要做）

```bash
# TTL 压到最小：保留连接池，仅去掉「陈旧窗口」
npx wrangler hyperdrive update "<HYPERDRIVE_ID>" --max-age=1 --swr=0
# --swr=0 等价于 stale_while_revalidate 关闭（wrangler 输出 "disabled"）

# 校验
npx wrangler hyperdrive get "<HYPERDRIVE_ID>"
#   caching: { disabled: false, max_age: 1, stale_while_revalidate: 0 }
```

`wrangler hyperdrive update` 是 PATCH 语义：只改显式传入的字段，不会重置 origin / 连接参数。

**生产实例已应用**（2026-09-13 验证）：id `d3f06050a92846ca950561f5d37f1232`，`wrangler hyperdrive get` 返回
`"caching": { "disabled": false, "max_age": 1, "stale_while_revalidate": 0 }`（origin / 连接池参数未变动）。

极端情况下也可整体关闭缓存：`npx wrangler hyperdrive update "<HYPERDRIVE_ID>" --caching-disabled`。
本项目的选择是**保留缓存、把 TTL 降到 1 秒**（`swr=0`），兼顾连接池收益与写后读一致性。

### CI 与权限

`.github/workflows/deploy.yml` 已内置步骤 **Enforce Hyperdrive query cache TTL**（每次部署执行一次）。
它需要 `CLOUDFLARE_API_TOKEN` 具备 **Hyperdrive: Edit** 权限；该步骤是 `continue-on-error: true`，
权限不足时只打印 warning，不会阻断部署 —— 此时请按上面的命令手动执行一次并确认。

### 客户端配合（避免同类问题复发）

- API 全部响应带 `Cache-Control: no-store`（见 `apps/api/src/index.ts` 的全局中间件），前端请求另显式使用 `cache: 'no-store'`；
- 前端 TanStack Query 全局 `staleTime: 0`，挂载 / 窗口聚焦 / 网络重连均重新取数；任何写操作成功后统一失效查询缓存（`refreshAfterWrite`），仅签名图片 URL（带时效）保留缓存；
- Service Worker 仅缓存同源静态资源并已升版本号，不参与 API 缓存。

### 排查清单（再次出现「改了看不到」时）

1. `curl -i https://api.otun.musi.land/api/v1/health` —— 若响应头**没有** `cache-control: no-store`，说明 Worker 未更新（重新部署）。
2. `npx wrangler hyperdrive get "<HYPERDRIVE_ID>"` —— 确认 `caching.max_age=1`、`stale_while_revalidate=0`。
3. 绕开 Worker 直连数据库读一次（`pnpm --filter @otunlink/db db:ping` 或 issue 一条 SELECT）—— 若数据已是新的，问题一定在缓存层，而不是业务逻辑。
4. 浏览器 DevTools → Network：请求若来自 `(ServiceWorker)` 或显示 `from disk cache`，检查 `apps/web/public/sw.js` 的 `CACHE_VERSION` 是否已递增。
