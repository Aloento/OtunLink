# OtunLink 云资源配置（cloud-config）

> 本文件记录 OtunLink 已创建/回传的 Cloudflare 与对象存储资源（不含密钥）。
> 密钥一律放在 gitignored 文件中（见下文「密钥」），**绝不提交仓库**。

## 1. Cloudflare

| 项目 | 值 |
| --- | --- |
| 账户 Account ID | `6597a89c745d8a5c698ffe521e15580e` |
| 域名 | `otun.musi.land`（CNAME → `otun.pages.dev`） |
| Pages 项目 | 项目名 **`otunlink`**（项目域 `otun.pages.dev`）；自定义域 `otun.musi.land` status=active；部署方式：`wrangler pages deploy apps/web/dist --project-name otunlink`（GitHub Actions `deploy.yml` 自动执行；未用 CF Git 集成，monorepo 无法解析工作区包） |
| API Token | 存于 `C:\Codes\OtunLink\.cf\api-token.txt`（gitignored；权限：Worker/Pages/KV/Hyperdrive 编辑） |
| API Worker | `otunlink-api` 已部署（2026-08-31）；自定义域 `api.otun.musi.land`（自动创建 CNAME+证书）与 workers.dev 子域 `otunlink-api.soarcraft.workers.dev` 均已启用 |

### 绑定（已写入 apps/api/wrangler.toml）

| 绑定 | 资源 | 用途 |
| --- | --- | --- |
| `HYPERDRIVE` | id `d3f06050a92846ca950561f5d37f1232` | 私有 PostgreSQL 连接池（生产 DB 访问） |
| `JWKS_CACHE` | KV 命名空间 `otunlink`（id `24881a3ca1404761a800540a6e809d8d`） | Entra JWKS 24h 缓存 |

## 2. 数据库（私有 PostgreSQL，经 Hyperdrive）

| 项目 | 值 |
| --- | --- |
| 主机 / 端口 | `164.30.21.203:5432`（公司私有，需 Hyperdrive 隧道） |
| 数据库 | `otunlink`（**专用库**；原因：账号 `root` 对 `postgres` 默认库无 public 建表权限，PG15+ public schema 归 `pg_database_owner`，故以 `CREATE DATABASE otunlink OWNER root` 解决） |
| 用户 | `root`（非超级用户，拥有 otunlink 库） |
| 连接串（本地） | 见 `apps/api/.dev.vars` 与根 `.dev.vars`（gitignored，含密码） |
| 迁移 | `pnpm --filter @otunlink/db db:migrate`（本地已验证：20 个枚举 / 29 表 / 276 列） |

## 3. 对象存储（S3 兼容，不使用 R2）

华为云 OBS，资源见用户回传；Worker 无原生绑定，运行时经 `aws4fetch`（SigV4 签名）访问。

| 配置项 | 值 |
| --- | --- |
| Endpoint | `https://obs.eu-de.otc.t-systems.com` |
| Region | `eu-de` |
| Bucket | `ims-test-images` |
| Access Key | 用户/AK 见 `apps/api/.dev.vars`（gitignored） |

说明：用户回传的 `ims-test-images.obs.eu-de.otc.t-systems.com` 是「bucket 前缀」访问地址，
标准配置拆分为 endpoint + bucket + region 三项（已按上表录入 wrangler.toml `[vars]`）。

## 4. 认证（Microsoft Entra ID，免费版单租户）

| 项目 | 值 |
| --- | --- |
| 目录（租户）ID | `9ed42989-9bdb-439d-80e7-c709641d1f08` |
| 应用程序（客户端）ID | `0edca98e-17df-41f2-b254-a579095ffcb7` |
| API 暴露范围（scope） | `https://SoarCraft.onmicrosoft.com/OtunLink/API`（发布者域形式；token `aud` 即此 URI） |
| 注册 | 见 `docs/auth-setup.md`；Redirect URI 需含 `https://otun.musi.land/auth/callback` |
| 本地配置 | `apps/api/.dev.vars`：`ENTRA_TENANT_ID/CLIENT_ID/AUDIENCE`（AUDIENCE 已设为真实 scope）；`apps/web/.env.local`：`VITE_ENTRA_*` + `VITE_API_SCOPE`（已设为真实 scope） |

## 5. 本地开发配置

- 复制 `.dev.vars.example` → `apps/api/.dev.vars`（已完成，含 S3 凭据；gitignored）
- `wrangler dev` 自动读取 `apps/api/.dev.vars`
- 前端：`apps/web/.env.local`（gitignored）保存 `VITE_*`（如 API 基址、MSAL 配置）

## 6. 生产部署

```powershell
# 设置 CF API token（wrangler 读取 CLOUDFLARE_API_TOKEN）
$env:CLOUDFLARE_API_TOKEN = (Get-Content 'C:\Codes\OtunLink\.cf\api-token.txt' -Raw).Trim()

# 部署 secrets（仅首次）
cd C:\Codes\OtunLink\apps\api
npx wrangler secret put S3_ACCESS_KEY_ID --name otunlink-api
npx wrangler secret put S3_SECRET_ACCESS_KEY --name otunlink-api
# 以及 DB 相关（Hyperdrive 连接串在控制台配置，无需 secret）

# 部署
npx wrangler deploy
```

## 7. 仍待用户提供 / 待办

1. **Hyperdrive 确认**：控制台确认 `d3f06050a92846ca950561f5d37f1232` 指向 `otunlink` 库；
   并在私有 PG（164.30.21.203）防火墙放行 CF 出口 IP（Hyperdrive 会给出 IP 范围）
2. **域名**：`otun.musi.land`（Pages 自定义域，已 active，SPA 主站）；`api.otun.musi.land`（API Worker 自定义域，已 active）；
   无需额外 `app.` 子域（SPA 直接跑在 otun.musi.land）
3. **Entra App Registration**：按 `docs/auth-setup.md` 完成注册并配置 Redirect URI（见第 4 节）
4. **OBS 策略**：确认 bucket 允许 Programmatic 访问（AK/SK 已给；如跨域/策略需放行）

## 8. 安全注意

- `apps/api/.dev.vars`、`.cf/api-token.txt` 已被 `.gitignore` 忽略（`git check-ignore` 已验证）
- CI/他人机器上使用密钥时，使用 GitHub Secrets / 环境变量，勿复制进仓库
