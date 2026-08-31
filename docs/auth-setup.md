# Entra ID（Azure AD 免费版）单租户 App Registration 配置指南

> 对应 design.md §3。本文指导在 Azure Entra ID（原 Azure AD）免费版中创建**单租户**应用注册，
> 使 OtunLink 前端（MSAL，auth code + PKCE）与后端（Hono Worker，jose 校验 JWT）能够完成
> 登录、自动开户与 RBAC 鉴权。

## 1. 创建应用注册

1. 登录 [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **应用注册** → **新注册**。
2. 名称：`OtunLink`。
3. 受支持的帐户类型：**仅此组织目录中的帐户（单租户）**。
4. 重定向 URI（平台选 **单页应用程序 (SPA)**）：
   - 生产：`https://app.otunlink.com/auth/callback`
   - 本地开发：`http://localhost:5173/auth/callback`
5. 点击**注册**。

> 免费版即可满足需求：安全默认值（Security Defaults，含 MFA/条件访问）保持开启即可，
> 本 checkpoint 不自行实现条件访问/MFA 策略。

## 2. 暴露 API 范围（后端 audience）

1. 应用注册 → **公开 API** → **添加作用域**。
2. 作用域名：`OtunLink.API`（完整形式 `api://<app-id>/OtunLink.API`）。
3. 谁可以同意：**仅管理员**（由租户管理员为组织授权）。
4. 可选：在**授权客户端应用程序**中加入 Web 应用的 clientId（同一个 app 时系统自动支持）。

后端 JWT 校验的 audience 同时接受该 API 作用域与 Web 应用的 `clientId`
（见 `apps/api/src/auth/verifier.ts` 的 `resolveAudience`），因此前端用自身 clientId
获取的 token 也能通过校验。

## 3. 记录配置项

在 Azure 门户 **概览** 页复制以下值：

| 配置项 | 说明 | 必填 |
| --- | --- | --- |
| `TENANT_ID` | **目录（租户）ID** | 是 |
| `CLIENT_ID` | **应用程序（客户端）ID** | 是 |
| `CLIENT_SECRET` | **证书和密码 → 客户端密码**（仅服务端机器到机器场景使用；本 checkpoint 前端用 PKCE，服务端仅验签，**可不填**） | 否 |

## 4. 写入环境变量

### 后端（Worker，`apps/api/.dev.vars`，模板见仓库根 `.dev.vars.example`）

```bash
ENTRA_TENANT_ID=<TENANT_ID>
ENTRA_CLIENT_ID=<CLIENT_ID>
# 可选：JWT issuer 覆盖（默认 https://login.microsoftonline.com/<TENANT_ID>/v2.0）
# ENTRA_ISSUER=https://login.microsoftonline.com/<TENANT_ID>/v2.0
# 可选：显式 audience；留空时默认接受 CLIENT_ID
# ENTRA_AUDIENCE=api://<CLIENT_ID>/OtunLink.API
# 可选：客户端密码（本 checkpoint 服务端不校验机密客户端，可不填）
# ENTRA_CLIENT_SECRET=
```

### 前端（Vite，`apps/web/.env.local`，模板见仓库根 `.env.example`）

```bash
VITE_ENTRA_TENANT_ID=<TENANT_ID>
VITE_ENTRA_CLIENT_ID=<CLIENT_ID>
# 可选：覆盖默认重定向地址（生产 https://app.otunlink.com/auth/callback；开发 http://localhost:5173/auth/callback）
# VITE_REDIRECT_URI=
# 可选：覆盖默认 API scope api://<CLIENT_ID>/OtunLink.API
# VITE_API_SCOPE=
# 可选：API 基地址，默认 http://localhost:8787
# VITE_API_BASE_URL=
```

## 5. JWKS 缓存（后端）

JWT 签名公钥（JWKS）从 Microsoft 元数据端点拉取：

```
https://login.microsoftonline.com/<TENANT_ID>/discovery/v2.0/keys
```

缓存策略（`apps/api/src/auth/verifier.ts`）：
1. 优先 **Cloudflare KV**（绑定名 `JWKS_CACHE`，TTL 24h）；
2. KV 未绑定/读写失败时降级为 **模块内存缓存**（进程/isolate 级，重启失效）；
3. 两级均未命中时直连 issuer 重新拉取并回写。

生产建议在 `wrangler.jsonc` 中绑定 `JWKS_CACHE` KV namespace。
