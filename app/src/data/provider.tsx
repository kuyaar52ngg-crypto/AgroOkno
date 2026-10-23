// DataProvider: инициализирует локальную БД, сессию и фоновую синхронизацию при старте приложения.
import { useEffect, type ReactNode } from 'react';

import { initData } from './session';

export function DataProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void initData();
  }, []);
  return <>{children}</>;
}
