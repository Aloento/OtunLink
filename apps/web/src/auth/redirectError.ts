// 记录 handleRedirectPromise 的失败信息（例如 AAD 直接回跳 error=access_denied /
// AADSTS65001 consent_required 等），由登录页展示。
//
// 之前 AuthProvider 只是 `catch {}` 掉兑换失败：用户点「登录」→ 回到应用 → 什么都没变，
// 也看不到原因，表现为「OAuth 登录不上」。这里保留最后一次失败原因（状态保存在模块内，
// AuthProvider 在挂载子组件前写入，登录页读取时已是最终值）。

export interface AuthRedirectError {
  /** MSAL/AAD 错误码，如 access_denied、interaction_required、AADSTS65001。 */
  code?: string;
  message?: string;
}

let lastError: AuthRedirectError | null = null;

export function setAuthRedirectError(next: AuthRedirectError | null): void {
  lastError = next;
}

export function getAuthRedirectError(): AuthRedirectError | null {
  return lastError;
}

export function clearAuthRedirectError(): void {
  lastError = null;
}

/** 把错误码与描述拼成一行可复制的诊断文本。 */
export function formatAuthRedirectError(error: AuthRedirectError): string {
  const parts: string[] = [];
  if (error.code) parts.push(error.code);
  if (error.message) parts.push(error.message.slice(0, 300));
  return parts.join(' · ') || 'unknown_error';
}
