# OtunLink 数据库设置（PG / Hyperdrive）

> ck-01 产物。记录私有 PostgreSQL 的连通方式、迁移执行方式与本次验证结论。

## 1. 当前验证结论（⚠️ BLOCKED）

截至 ck-01 提交，本机环境**无任何可用 PostgreSQL**：

- `psql --version`：未安装
- `docker`：未安装 / 不可用
- 本地 `127.0.0.1:5432`：端口未监听
- `DATABASE_URL` 环境变量：未设置
- Cloudflare Hyperdrive 绑定：未配置（需用户提供私有 PG 连接串后创建）

因此**「迁移实际执行 + `SELECT 1` 验证」这一验收项为 BLOCKED**。全部代码（schema、迁移生成、迁移执行器、`POST /api/v1/admin/migrate`、种子脚本）已就绪并通过类型检查与单元测试；一旦用户提供 `DATABASE_URL` / Hyperdrive 配置，即可按第 3 节步骤完成验证。

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
pnpm --filter db db:generate     # 依据 schema 生成 SQL（离线，无需数据库）
pnpm --filter db db:migrate      # 执行迁移（需要 DATABASE_URL）
pnpm --filter db db:ping         # SELECT 1 连通性自检
pnpm --filter db seed            # 写入示例业务单元（幂等）
```

等价于：

```bash
DATABASE_URL='postgres://...' pnpm --filter db db:migrate
DATABASE_URL='postgres://...' pnpm --filter db seed
```

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

- 执行器在目标库维护 `__drizzle_migrations` 表（`version` 主键 + `applied_at`）。
- 每次运行先读取已执行版本，只应用未执行的迁移文件；单个迁移在事务中执行，失败回滚。
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
