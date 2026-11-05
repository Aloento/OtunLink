# OtunLink 数据库设置（PG / Hyperdrive）

> 记录私有 PostgreSQL 的连通方式、迁移执行方式与验证结论。

## 1. 当前验证结论（✅ 已连通 · 2026-11-05 迁移后）

- **2026-11-05 迁移**：`164.30.21.203:9500`（PG 17.11）→ **`sc.aloen.to:6432`（PG 18.6）**；库名与账号不变（`otunlink` / `root`）。
- 服务端**强制 TLS**：明文连接直接报 `08P01 SSL required`，连接串**必须**带 `?sslmode=require`。
  证书为 Let's Encrypt `CN=sc.aloen.to`（有效期到 2027-02-03）。
- 6432 是前置代理（PG 本体 `listen_addresses=localhost`、`port=5432`）：实测同一会话内 `pg_backend_pid()` 不变化、
  `prepare` 可用 → 不是事务级池；`db.ts` 仍保留 `prepare: false`（Hyperdrive 兼容，别改）。
- 连接串两处都要改（均 gitignored，含密码，勿提交）：`apps/api/.dev.vars`（wrangler dev 读）与
  根 `.dev.vars`（`packages/db` 的 CLI 只读仓库根这两个文件：`.env` / `.dev.vars`）。
- 2026-11-05 实测：`db:ping` → `SELECT 1 = 1`；`db:migrate` → `applied 0 / skipped 3`（幂等，schema 已一致）。
- 迁移完整性核对：30 张表**逐表行数 + 最大时间戳新旧完全一致**，最后一条业务写入 `2026-11-03T18:36:08Z`
  （`sales_orders` / `notifications`）→ 迁移后旧库无新增写入，可安全切换。
- 生产链路（Worker → Hyperdrive → 新库）实测：`wrangler dev --remote` 绑生产 Hyperdrive 读 `server_version`
  = **18.6**（切换前的同一测试 harness 读到 17.11）。

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

1. `sc.aloen.to` 侧需放行：开发机出口 IP（当前经 WARP，出口 `104.28.193.95`，会变）与 Cloudflare 出口 IP 段
   （`https://www.cloudflare.com/ips/`）。2026-11-05 切换生产 Hyperdrive 后远端实测连通，说明 Cloudflare 侧已放行。
2. 服务端只接受 TLS（`08P01 SSL required`）。本机直连用 `sslmode=require` 即可；
   注意 pg v8 把 `require` 当作 `verify-full` 处理（pg v9 起改为 libpq 语义），postgres.js 的 `require` 只加密不校验证书。

### 3.2 连接串样例

```env
# 直连（本地 / 降级）— 必须带 sslmode=require，否则服务端拒绝
DATABASE_URL=postgresql://<user>:<password>@sc.aloen.to:6432/otunlink?sslmode=require

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

> 本机提示：Windows 自带的 `curl.exe`（schannel）经 WARP 出口对 `api.otun.musi.land` 会报
> `SEC_E_ILLEGAL_MESSAGE`，不是站点故障；用 `node -e "fetch('https://api.otun.musi.land/api/v1/health').then(r=>r.text()).then(console.log)"`
> 或浏览器验证。

## 7. 2026-11-05 迁移（sc.aloen.to）与回滚口径

| 项               | 旧（已停用）                                        | 新（当前）                                                        |
| ---------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| 直连串           | `postgres://root:***@164.30.21.203:9500/otunlink`（明文） | `postgres://root:***@sc.aloen.to:6432/otunlink?sslmode=require` |
| PG 版本          | 17.11                                               | 18.6（Ubuntu pgdg24.04）                                          |
| Hyperdrive origin | `164.30.21.203:9500`                               | `sc.aloen.to:6432`，`sslmode=require`，缓存仍 `max_age=1 / swr=0` |

改动落点：`apps/api/.dev.vars`、根 `.dev.vars`（gitignored，含密码）、`.dev.vars.example`、
`.env.example`、`packages/db/drizzle.config.ts` 默认值、`apps/api/src/auth/middleware.test.ts` 的报错样本。
`wrangler.toml` **不需要改**（Hyperdrive 只按 binding id 引用资源，id 未变，Worker 无需重新部署）。

**回滚（一条命令，binding id 不变）**：

```powershell
npx wrangler hyperdrive update d3f06050a92846ca950561f5d37f1232 `
  --connection-string "postgres://root:<密码>@164.30.21.203:9500/otunlink"
npx wrangler hyperdrive get d3f06050a92846ca950561f5d37f1232   # 确认 origin 与 caching
```

旧库是明文连接：回滚后用 `wrangler hyperdrive get` 确认没有残留 `sslmode`
（CLI 无法把 sslmode 设回“关闭”，若仍有 `sslmode: require` 就在 CF 控制台把 TLS 关掉）。

回滚只在旧库仍可写时有意义：**切换后写进新库的数据不会回流旧库**。
切换前已核对 30 张表行数与最大时间戳完全一致（见 §1），因此切换点无数据差。
