import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { Colors } from '@/constants/theme';
import { useOnboardingStep } from '@/data';
import { useOnboarding } from '@/hooks/onboarding';

export const unstable_settings = { anchor: 'role' };

/** Какие экраны онбординга допустимы на каждом шаге; всё остальное перенаправляется на экран шага по умолчанию. */
function resolve(step: ReturnType<typeof useOnboardingStep>, hold: boolean): { target: string; allowed: string[] } | null {
  if (step === 'role') return { target: '/role', allowed: ['/role'] };
  if (step === 'farm') return { target: '/choose-farm', allowed: ['/role', '/choose-farm', '/new-farm', '/join-farm'] };
  if (step === 'pending_access') return { target: '/join-sent', allowed: ['/join-sent', '/join-farm', '/choose-farm', '/new-farm'] };
  if (hold) return { target: '/farm-created', allowed: ['/farm-created'] };
  return null;
}

/** R3–R8: роль → «Ваше хозяйство» → создание (R5, R6) или запрос доступа (R7, R8). */
export default function OnboardingLayout() {
  const step = useOnboardingStep();
  const { holdOnboarding } = useOnboarding();
  const pathname = usePathname();
  const router = useRouter();
  const rule = resolve(step, holdOnboarding);
  const target = rule?.target;
  const allowed = rule ? rule.allowed.includes(pathname) : true;

  useEffect(() => {
    if (target && !allowed) router.replace(target as '/role');
  }, [target, allowed, router]);

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />;
}
