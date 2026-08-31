import { Body1, FluentProvider, Title1, webLightTheme } from '@fluentui/react-components';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { createQueryClient } from './api/queryClient';
import { AuthProvider } from './auth/AuthProvider';
import { getMsalInstance } from './auth/msal';
import { SessionProvider } from './auth/SessionProvider';
import { initI18n } from './i18n';
import { LocaleProvider } from './i18n/LocaleProvider';
import './index.css';

initI18n();
const queryClient = createQueryClient();
const msalInstance = getMsalInstance();

function ConfigMissing() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Title1 as="h1">{t('app.name')}</Title1>
      <Body1>{t('login.unconfigured')}</Body1>
    </div>
  );
}

function Root() {
  return (
    <FluentProvider theme={webLightTheme}>
      <LocaleProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            {msalInstance ? (
              <AuthProvider instance={msalInstance}>
                <SessionProvider>
                  <App />
                </SessionProvider>
              </AuthProvider>
            ) : (
              <ConfigMissing />
            )}
          </BrowserRouter>
        </QueryClientProvider>
      </LocaleProvider>
    </FluentProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
