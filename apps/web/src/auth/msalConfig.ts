import { LogLevel, type Configuration } from '@azure/msal-browser';

// MSAL 配置构建（纯函数，便于单测）。
// auth code + PKCE 由 @azure/msal-browser 默认启用（protocolMode 默认 AAD v2）。

export interface WebAuthConfigInput {
  tenantId: string;
  clientId: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  apiScope: string;
  authority?: string;
}

export interface BuiltAuthConfig {
  msal: Configuration;
  loginScopes: string[];
  apiScope: string;
}

export function buildMsalConfig(input: WebAuthConfigInput): BuiltAuthConfig {
  const authority =
    input.authority ?? `https://login.microsoftonline.com/${input.tenantId}`;

  const msal: Configuration = {
    auth: {
      clientId: input.clientId,
      authority,
      redirectUri: input.redirectUri,
      postLogoutRedirectUri: input.postLogoutRedirectUri,
    },
    cache: {
      cacheLocation: 'sessionStorage',
    },
    system: {
      loggerOptions: {
        loggerCallback: (level: LogLevel, message: string, containsPii: boolean) => {
          if (level === LogLevel.Error && !containsPii) {
            // 仅错误级日志落到控制台，避免泄露 PII。
            // eslint-disable-next-line no-console
            console.error(`[msal] ${message}`);
          }
        },
        logLevel: LogLevel.Error,
        piiLoggingEnabled: false,
      },
    },
  };

  const loginScopes = ['openid', 'profile', 'email', input.apiScope];

  return { msal, loginScopes, apiScope: input.apiScope };
}

/** 从 Vite 环境变量解析配置；未配置 tenant/client 时返回 null（页面提示需配置）。 */
export function envAuthConfig(): BuiltAuthConfig | null {
  const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID as string | undefined;
  const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID as string | undefined;
  if (!tenantId || !clientId) return null;

  const devRedirect = 'http://localhost:5173/auth/callback';
  const prodRedirect = 'https://otun.musi.land/auth/callback';
  const redirectUri =
    (import.meta.env.VITE_REDIRECT_URI as string | undefined) ??
    (import.meta.env.DEV ? devRedirect : prodRedirect);

  const apiScope =
    (import.meta.env.VITE_API_SCOPE as string | undefined) ??
    `api://${clientId}/OtunLink.API`;

  return buildMsalConfig({
    tenantId,
    clientId,
    redirectUri,
    postLogoutRedirectUri: import.meta.env.DEV ? 'http://localhost:5173' : 'https://otun.musi.land',
    apiScope,
  });
}
