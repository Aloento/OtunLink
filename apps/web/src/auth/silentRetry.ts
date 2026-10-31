// 静默令牌获取失败后的「自动重新认证」闸门。
//
// 背景：cacheLocation 改为 localStorage 后，浏览器重启后仍保留旧的 MSAL account。
// 一旦访问令牌过期且静默刷新被 AAD 拒绝（授权过期、管理员撤销会话、需要重新同意…），
// 应用既不会自动重新登录，也不会说明原因，只会停在「服务器或网络异常」。
//
// 修复：需要交互时自动整页重定向到 Entra 重新认证一次；闸门保证同一标签页会话内
// 不会无限「加载 → 重定向 → 加载」，第二次仍失败就展示错误页由用户手动重试。

const STORAGE_KEY = 'otunlink.auth.silentRedirect';
/** 同一标签页会话内允许的自动重定向次数（1 次：够恢复，不足以成环）。 */
export const MAX_AUTO_REDIRECTS = 1;
/** 计数有效期：超过该时间视为新一轮故障。 */
export const WINDOW_MS = 10 * 60 * 1000;

interface RetryState {
  attempts: number;
  at: number;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null; // 隐私模式/禁用存储：退化为「每次都允许」，由 AAD 侧兜底。
  }
}

function read(store: Storage | null): RetryState | null {
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RetryState>;
    if (typeof parsed.attempts !== 'number' || typeof parsed.at !== 'number') return null;
    return { attempts: parsed.attempts, at: parsed.at };
  } catch {
    return null;
  }
}

/** 是否还允许自动重定向（未尝试过，或上次尝试已超出时间窗口）。 */
export function shouldAutoRedirect(now = Date.now()): boolean {
  const state = read(storage());
  if (!state) return true;
  if (now - state.at > WINDOW_MS) return true;
  return state.attempts < MAX_AUTO_REDIRECTS;
}

/** 记录一次自动重定向。 */
export function markAutoRedirect(now = Date.now()): void {
  const store = storage();
  if (!store) return;
  const state = read(store);
  const attempts = state && now - state.at <= WINDOW_MS ? state.attempts + 1 : 1;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify({ attempts, at: now }));
  } catch {
    // 写入失败不影响流程。
  }
}

/** 清除计数（会话恢复正常、或用户主动重新登录时调用）。 */
export function clearAutoRedirect(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // 忽略。
  }
}
