// Точка входа слоя данных. По умолчанию — реальная offline-first реализация (expo-sqlite + Supabase, ./impl).
//
// Сборка с EXPO_PUBLIC_DATA_MODE=mock подключает демо-реализацию ./mock (состояние в памяти, без сети):
// на ней работают E2E-тесты Playwright (npm run test:e2e) и скриншоты. Значение подставляется Metro на этапе сборки,
// поэтому в обычной сборке условие превращается в `require('./impl')`, а ./mock в бандл не попадает.
// Подробности: app/e2e/README в разделе «E2E-тесты» файла app/README.md.
import type { DataModule } from './contract';
import type * as impl from './impl';
import type * as mock from './mock';

// Проверка на этапе компиляции: обе реализации полностью соответствуют контракту.
// Только типы: в бандл не попадает ни одного выражения (declare const оставил бы в нём голое обращение к несуществующей переменной).
type Satisfies<Actual extends Expected, Expected> = Actual;
export type ImplMatchesContract = Satisfies<typeof impl, DataModule>;
export type MockMatchesContract = Satisfies<typeof mock, DataModule>;

// Литерал process.env.EXPO_PUBLIC_DATA_MODE должен остаться прямым обращением: только его Metro заменяет значением.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- синхронный require нужен, чтобы Metro вырезал неиспользуемую ветку
const data: DataModule = process.env.EXPO_PUBLIC_DATA_MODE === 'mock' ? require('./mock') : require('./impl');

export const {
  DataProvider,
  useAuth,
  useSyncStatus,
  useFarm,
  useUpdateFarm,
  useUpdateProfile,
  useDashboard,
  useJournal,
  useJournalEntry,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  getEventDestinations,
  useHerd,
  useHorseHerd,
  useReports,
  useReportPreview,
  useSubmitReport,
  getReportDownloadUrl,
  getReceiptUrl,
  useHousehold,
  useAddHouseholdMember,
  useHouseholdExtract,
  useMercury,
  useMercuryDocument,
  useMercuryConnect,
  useMercuryRefresh,
  useNotifications,
  useMarkNotificationsRead,
  useSettings,
  useUpdateSettings,
  useFaq,
  useCreateSupportTicket,
  signIn,
  signUp,
  verifySignUpCode,
  resendCode,
  useOnboardingStep,
  useCreateFarm,
  useFindFarm,
  useRequestAccess,
  useMyJoinRequest,
  useAssistantChat,
  useUpcomingDeadlines,
  useReminderSettings,
  useUpdateReminderSettings,
  registerPushToken,
  useHorriot,
  useHorriotConnect,
  useHorriotRefresh,
  useIsAdmin,
  useAssistantModelSettings,
  useAssistantModelOptions,
  useUpdateAssistantModelSettings,
} = data;
