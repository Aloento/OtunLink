import { Body1, Title1 } from '@fluentui/react-components';
import { APP_NAME } from '@otunlink/shared';

export default function App() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2">
      <Title1 as="h1">{APP_NAME}</Title1>
      <Body1>仓储库存 ERP 脚手架（ck-00）</Body1>
    </div>
  );
}
