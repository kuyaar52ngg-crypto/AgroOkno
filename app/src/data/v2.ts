// v2-члены DataModule: регистрация и онбординг (R1–R8), чат-помощник (J1–J7), напоминания и push (J8).
import type {
  AssistantChat,
  DeadlineReminder,
  Farm,
  FarmLookup,
  JoinRequest,
  Mutation,
  NewFarmInput,
  OnboardingStep,
  Query,
  ReminderSettings,
  UserSettings,
  Uuid,
} from './contract';
import { useAssistantChatImpl } from './assistant';
import { useMut, useQ, useVersion } from './hooks';
import { createFarm, currentJoinRequest, findFarm, onboardingStepNow, requestAccess } from './onboarding';
import { currentReminderSettings, registerPushToken as registerToken, updateReminderSettings, upcomingDeadlines } from './reminders';

export { resendCode, signIn, signUp, verifySignUpCode } from './auth';

/** Шаг онбординга для редиректов в корневом layout: role → farm → pending_access → null. */
export function useOnboardingStep(): OnboardingStep {
  useVersion();
  return onboardingStepNow();
}

export const useCreateFarm = (): Mutation<NewFarmInput, Farm> => useMut((input: NewFarmInput) => createFarm(input));

export const useFindFarm = (): Mutation<{ code_or_inn: string }, FarmLookup | null> =>
  useMut(({ code_or_inn }: { code_or_inn: string }) => findFarm(code_or_inn));

export const useRequestAccess = (): Mutation<{ farm_id: Uuid }, JoinRequest> => useMut(({ farm_id }: { farm_id: Uuid }) => requestAccess(farm_id));

export const useMyJoinRequest = (): Query<JoinRequest | null> => useQ(() => currentJoinRequest(), [], { noFarm: true });

export const useAssistantChat = (): AssistantChat => useAssistantChatImpl();

export const useUpcomingDeadlines = (): Query<DeadlineReminder[]> => useQ(() => upcomingDeadlines(), []);

export const useReminderSettings = (): Query<ReminderSettings & Pick<UserSettings, 'push_enabled' | 'sound'>> =>
  useQ(() => currentReminderSettings(), []);

export const useUpdateReminderSettings = (): Mutation<ReminderSettings & Partial<Pick<UserSettings, 'push_enabled' | 'sound'>>, void> =>
  useMut((patch: ReminderSettings & Partial<Pick<UserSettings, 'push_enabled' | 'sound'>>) => updateReminderSettings(patch));

export const registerPushToken = (token: string, platform: 'ios' | 'android' | 'web'): Promise<void> => registerToken(token, platform);
