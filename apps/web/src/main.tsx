import { Body1, Title1, FluentProvider, webLightTheme } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import { getMsalInstance } from './auth/msal';
import './index.css';

const queryClient = new QueryClient();

function ConfigMissing() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Title1 as="h1">OtunLink 未配置</Title1>
      <Body1>
        缺少 Entra ID 环境变量（VITE_ENTRA_TENANT_ID / VITE_ENTRA_CLIENT_ID），
        请参考 docs/auth-setup.md 创建 .env。
      </Body1>
    </div>
  );
}

const msalInstance = getMsalInstance();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        {msalInstance ? (
          <AuthProvider instance={msalInstance}>
            <App />
          </AuthProvider>
        ) : (
          <ConfigMissing />
        )}
      </QueryClientProvider>
    </FluentProvider>
  </React.StrictMode>,
);
