import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Href } from 'expo-router';

interface OnboardingState {
  /** Контакт, на который отправлен код регистрации (R1 → R2). */
  contact: string;
  maskedContact: string;
  /** Учебный код: в демо-режиме подставляется в ячейки. */
  demoCode: string;
  setSignUpContact: (value: { contact: string; maskedContact: string; demoCode: string }) => void;
  /**
   * Пока true, корневой layout держит пользователя в онбординге, даже если шаг уже null:
   * нужен для экрана R6 «Хозяйство создано», который показывается после создания хозяйства.
   */
  holdOnboarding: boolean;
  setHoldOnboarding: (value: boolean) => void;
  /** Куда перейти сразу после выхода из онбординга (например, «Добавить первое событие»). */
  nextRoute: Href | null;
  setNextRoute: (value: Href | null) => void;
}

const OnboardingContext = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [signUp, setSignUp] = useState({ contact: '', maskedContact: '', demoCode: '' });
  const [holdOnboarding, setHoldOnboarding] = useState(false);
  const [nextRoute, setNextRoute] = useState<Href | null>(null);
  const value = useMemo<OnboardingState>(
    () => ({
      ...signUp,
      setSignUpContact: setSignUp,
      holdOnboarding,
      setHoldOnboarding,
      nextRoute,
      setNextRoute,
    }),
    [signUp, holdOnboarding, nextRoute],
  );
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingState {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding должен использоваться внутри OnboardingProvider');
  return ctx;
}
