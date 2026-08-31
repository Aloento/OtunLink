import type { IPublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { useEffect, useState, type ReactNode } from 'react';

import { FullPageSpinner } from '../components/FullPageSpinner';

// 登录初始化（ck-02/ck-07 修复）：
// 之前直接渲染 MsalProvider，由其内部执行 initialize() + handleRedirectPromise()。但默认
// navigateToLoginRequestUrl=true 时，MSAL 会在 /auth/callback 拿到 code 后整页跳回起始页 /，
// 期望起始页再次 handleRedirectPromise 兑换；若 code 未能被成功兑换/清理（残留 interaction 状态），
// 就会在 / 与 /login 之间反复整页刷新，形成死循环。
//
// 修复：
// 1. 把 navigateToLoginRequestUrl=false 作为 handleRedirectPromise(options) 选项传入（v5 起不再是
//    system 配置项），MSAL 在回调页当场完成兑换并清理状态，不再整页跳转；登录成功后由 SPA 路由自行跳转。
// 2. 此处启动时显式 initialize() + handleRedirectPromise() 一次（吞掉兑换失败），确保初始化完成、
//    残留交互状态被清理后再挂载 MsalProvider，避免与 MsalProvider 内部处理竞争。
export function AuthProvider({
  instance,
  children,
}: {
  instance: IPublicClientApplication;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      await instance.initialize();
      try {
        await instance.handleRedirectPromise({ navigateToLoginRequestUrl: false });
      } catch {
        // 兑换失败：由登录流程处理；此处仅保证交互状态被清理，不阻断启动。
      }
      if (!cancelled) setReady(true);
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [instance]);

  if (!ready) return <FullPageSpinner />;
  return <MsalProvider instance={instance}>{children}</MsalProvider>;
}
