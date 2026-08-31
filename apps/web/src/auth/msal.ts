import {
  PublicClientApplication,
  type IPublicClientApplication,
} from '@azure/msal-browser';

import { envAuthConfig } from './msalConfig';

let instance: IPublicClientApplication | null = null;

/** 惰性单例：仅在浏览器环境实例化（测试/SSR 不触发）。 */
export function getMsalInstance(): IPublicClientApplication | null {
  if (instance) return instance;
  const config = envAuthConfig();
  if (!config) return null;
  instance = new PublicClientApplication(config.msal);
  return instance;
}

/** 测试/注入用：替换单例。 */
export function setMsalInstance(next: IPublicClientApplication): void {
  instance = next;
}
