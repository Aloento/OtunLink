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
import './pwa/registerSw';
import { TooltipProvider } from './ui/tooltip';
import './index.css';

initI18n();
const queryClient = createQueryClient();
const msalInstance = getMsalInstance();

function ConfigMissing() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('app.name')}</h1>
      <p className="text-sm text-ink-muted">{t('login.unconfigured')}</p>
    </div>
  );
}

function Root() {
  return (
    <LocaleProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={400} skipDelayDuration={200}>
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
        </TooltipProvider>
      </QueryClientProvider>
    </LocaleProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
