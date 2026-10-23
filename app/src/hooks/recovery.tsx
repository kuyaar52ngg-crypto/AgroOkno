import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface RecoveryState {
  /** Идёт восстановление пароля (A4–A6): после проверки кода пользователь уже в сессии, но на экраны приложения его пускать рано. */
  recovering: boolean;
  setRecovering: (value: boolean) => void;
  /** Контакт, на который отправлен код (шаги A4 → A5). */
  contact: string;
  setContact: (value: string) => void;
  maskedContact: string;
  setMaskedContact: (value: string) => void;
  demoCode: string;
  setDemoCode: (value: string) => void;
}

const RecoveryContext = createContext<RecoveryState | null>(null);

export function RecoveryProvider({ children }: { children: ReactNode }) {
  const [recovering, setRecovering] = useState(false);
  const [contact, setContact] = useState('');
  const [maskedContact, setMaskedContact] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const value = useMemo(
    () => ({ recovering, setRecovering, contact, setContact, maskedContact, setMaskedContact, demoCode, setDemoCode }),
    [recovering, contact, maskedContact, demoCode],
  );
  return <RecoveryContext.Provider value={value}>{children}</RecoveryContext.Provider>;
}

export function useRecovery(): RecoveryState {
  const ctx = useContext(RecoveryContext);
  if (!ctx) throw new Error('useRecovery должен использоваться внутри RecoveryProvider');
  return ctx;
}
