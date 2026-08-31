import { describe, expect, it } from 'vitest';

import { buildMsalConfig } from './msalConfig';

describe('buildMsalConfig', () => {
  const input = {
    tenantId: 'tenant-1',
    clientId: 'client-1',
    redirectUri: 'https://app.otunlink.com/auth/callback',
    postLogoutRedirectUri: 'https://app.otunlink.com',
    apiScope: 'api://client-1/OtunLink.API',
  };

  it('使用 AAD 权威与重定向地址', () => {
    const { msal } = buildMsalConfig(input);
    expect(msal.auth.authority).toBe('https://login.microsoftonline.com/tenant-1');
    expect(msal.auth.clientId).toBe('client-1');
    expect(msal.auth.redirectUri).toBe('https://app.otunlink.com/auth/callback');
  });

  it('登录 scopes 包含 openid/profile/email 与 API scope（供 access token）', () => {
    const { loginScopes } = buildMsalConfig(input);
    expect(loginScopes).toContain('openid');
    expect(loginScopes).toContain('profile');
    expect(loginScopes).toContain('email');
    expect(loginScopes).toContain('api://client-1/OtunLink.API');
  });

  it('默认关闭 PII 日志', () => {
    const { msal } = buildMsalConfig(input);
    expect(msal.system?.loggerOptions?.piiLoggingEnabled).toBe(false);
  });
});
