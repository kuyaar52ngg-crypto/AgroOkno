import { useRouter } from 'expo-router';
import BookOpen from 'lucide-react-native/icons/book-open';
import Carrot from 'lucide-react-native/icons/carrot';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CirclePlus from 'lucide-react-native/icons/circle-plus';
import FilePenLine from 'lucide-react-native/icons/file-pen-line';
import Milk from 'lucide-react-native/icons/milk';
import PawPrint from 'lucide-react-native/icons/paw-print';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Sprout from 'lucide-react-native/icons/sprout';
import Wheat from 'lucide-react-native/icons/wheat';
import { Pressable, StyleSheet, View } from 'react-native';

import { AssistantBlock } from '@/components/AssistantBlock';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Card, DataTable, QuickAction } from '@/components/ui/Cards';
import { Alert, Skeleton } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { fmtDate, fmtDateTime, fmtHeads, fmtNum, fmtTime, todayIso } from '@/constants/format';
import { Colors, Radius } from '@/constants/theme';
import { useAuth, useDashboard, useHerd, useReports, useSyncStatus } from '@/data';
import type { HerdSummary, ReportObligation } from '@/data/contract';

function HomeSkeleton() {
  return (
    <View style={{ gap: 24 }}>
      <View style={styles.skeletonHero}>
        <Skeleton height={14} width="55%" />
        <View style={styles.row}>
          <Skeleton height={12} width="30%" />
          <Skeleton height={12} width="20%" />
        </View>
        <Skeleton height={4} />
        <Skeleton height={32} radius={10} />
      </View>
      <Skeleton height={20} width="40%" />
      <View style={{ gap: 12 }}>
        {[0, 1, 2].map((r) => (
          <View key={r} style={styles.row}>
            {[0, 1].map((c) => (
              <View key={c} style={styles.skeletonCard}>
                <Skeleton height={20} width={20} radius={6} />
                <Skeleton height={12} width="85%" />
                <Skeleton height={10} width="65%" />
              </View>
            ))}
          </View>
        ))}
      </View>
      <Skeleton height={20} width="28%" />
      <View style={styles.skeletonRow}>
        <Skeleton height={44} width={44} radius={12} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton height={12} width="70%" />
          <Skeleton height={10} width="85%" />
          <Skeleton height={10} width="45%" />
        </View>
      </View>
      <View style={styles.syncRow}>
        <Icon icon={RefreshCw} size={16} color={Colors.primary} />
        <Text variant="caption" color={Colors.textSecondaryReadable}>
          Загружаем учет и статусы отчетов…
        </Text>
      </View>
    </View>
  );
}

function sum(herd: HerdSummary | undefined, groups: string[]): number {
  return (herd?.groups ?? []).filter((g) => groups.includes(g.group)).reduce((s, g) => s + g.heads, 0);
}

function statusLine(item: ReportObligation): { title: string; sub: string; overdue: boolean } {
  const name = item.title.replace('Форма ', '');
  const due = fmtDate(item.due_on);
  if (item.status === 'submitted') {
    return {
      title: `${name} · сдан ${fmtDate(item.submitted_at?.slice(0, 10))}`,
      sub: item.scope === 'regional' ? `${fmtDate(item.submitted_at?.slice(0, 10))} · предыдущий период` : item.has_official_blank ? 'Учебный респондент КФХ / ИП' : 'Квитанция в сохраненной версии',
      overdue: false,
    };
  }
  if (item.status === 'overdue') {
    return { title: `${name} · просрочен`, sub: `Срок ${due}`, overdue: true };
  }
  return { title: `${name} · ${item.status === 'draft' ? 'черновик' : 'не начат'}`, sub: `Срок до ${due}`, overdue: false };
}

/** G2 · Нет подключения: главная в офлайне. */
function OfflineHome() {
  const router = useRouter();
  const sync = useSyncStatus();
  const dashboard = useDashboard();
  const herd = useHerd();
  const reports = useReports(2026);
  const total = herd.data?.total ?? 0;
  const cows = sum(herd.data, ['cattle_cows']);
  const calves = sum(herd.data, ['cattle_calves']);
  const horses = sum(herd.data, ['horses_mares', 'horses_young', 'horses_stallions', 'horses_other']);
  const sheep = sum(herd.data, ['sheep']);
  const federal = (reports.data ?? []).filter((r) => r.scope === 'federal');
  const submitted = federal.filter((r) => r.status === 'submitted').length;
  const cachedAt = fmtDateTime(sync.last_synced_at);

  return (
    <Screen
      title="Нет подключения"
      subtitle="Сохраненные данные хозяйства доступны"
      offlineBanner={false}
      loading={dashboard.loading || herd.loading || reports.loading}
    >
      <Alert tone="warning" title="Вы офлайн">
        {`Данные из кеша на ${cachedAt}. Отправка отчетов недоступна. Новый локальный черновик можно сохранить.`}
      </Alert>
      <Button title="Повторить" icon={RefreshCw} onPress={() => sync.retry()} />
      <DataTable
        title={`${dashboard.data?.household?.name ?? 'Хозяйство'} · из кеша`}
        rows={[
          { label: 'Поголовье', value: fmtHeads(total) },
          { label: 'Коровы / телята', value: `${cows} / ${calves}` },
          { label: 'Лошади / овцы', value: `${horses} / ${sheep}` },
          { label: 'Надой за октябрь', value: `${fmtNum(dashboard.data?.milk_month_l ?? 0)} л` },
        ]}
      />
      <View style={styles.statusCard}>
        <Text variant="bodyLg" style={{ fontFamily: 'Onest_600SemiBold' }}>
          Отчетность · сохраненные статусы
        </Text>
        <Text variant="caption" color={Colors.textSecondaryReadable} style={{ marginTop: 8 }}>
          {`Федеральные · ${submitted} из ${federal.length} сдано`}
        </Text>
        {(reports.data ?? []).map((item, index, all) => {
          const line = statusLine(item);
          return (
            <Pressable
              key={item.form_code}
              accessibilityRole="button"
              accessibilityLabel={`${line.title}. ${line.sub}`}
              onPress={() => router.push({ pathname: '/reports/[form]', params: { form: item.form_code } })}
              style={[styles.statusRow, index < all.length - 1 && styles.statusBorder]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="bodySemibold" color={line.overdue ? Colors.textErrorReadable : Colors.text}>
                  {line.title}
                </Text>
                <Text variant="caption" color={Colors.textSecondaryReadable}>
                  {line.sub}
                </Text>
              </View>
              <Icon icon={ChevronRight} size={20} color={line.overdue ? Colors.error : Colors.primary} />
            </Pressable>
          );
        })}
      </View>
      <Button title="Сохранить локальный черновик" variant="secondary" icon={FilePenLine} onPress={() => router.navigate('/add')} />
      <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
        Демонстрационное офлайн-состояние. После восстановления связи проверьте данные перед отправкой.
      </Text>
    </Screen>
  );
}

/** Главная: «Мое хозяйство» (46:4636), G1 при первой загрузке, G2 без связи. */
export default function HomeScreen() {
  const router = useRouter();
  const auth = useAuth();
  const sync = useSyncStatus();
  const dashboard = useDashboard();

  if (!sync.online) return <OfflineHome />;

  const data = dashboard.data;
  const segments = Math.max(data?.federal.total ?? 0, 1);
  const submitted = data?.federal.submitted ?? 0;
  const overdue = data?.regional.overdue ?? 0;
  const updated = data?.updated_at;
  const updatedText = updated ? `${fmtDate(updated.slice(0, 10)) === fmtDate(todayIso()) ? 'сегодня' : fmtDate(updated.slice(0, 10))} в ${fmtTime(updated)}` : '';

  return (
    <Screen
      eyebrow={dashboard.loading ? undefined : auth.profile?.full_name ? `Здравствуйте, ${auth.profile.full_name}` : 'Здравствуйте'}
      title="Мое хозяйство"
      tagline={dashboard.loading ? undefined : 'Один раз ввел — везде сдал'}
      subtitle={dashboard.loading ? 'Обновляем данные хозяйства' : undefined}
      loading={dashboard.loading}
      skeleton={<HomeSkeleton />}
      fromCache={dashboard.fromCache}
      onRefresh={dashboard.refetch}
    >
      {data ? (
        <>
          <View style={styles.hero}>
            <View style={styles.heroHead}>
              <Text variant="subtitle" color={Colors.onPrimary}>
                Ваша отчетность
              </Text>
              <Text variant="caption" color={Colors.onPrimaryMuted}>
                {data.month_label}
              </Text>
            </View>
            <View style={{ gap: 8 }}>
              <View style={styles.heroHead}>
                <Text variant="small" color={Colors.onPrimary}>
                  Федеральные:
                </Text>
                <Text variant="label" color={Colors.onPrimary}>
                  {`${submitted} из ${data.federal.total} сдано`}
                </Text>
              </View>
              <View style={styles.progress} accessibilityLabel={`Сдано ${submitted} из ${data.federal.total}`}>
                {Array.from({ length: segments }, (_, i) => (
                  <View key={i} style={[styles.segment, { backgroundColor: i < submitted ? Colors.successOnDark : Colors.primaryTrack }]} />
                ))}
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={overdue > 0 ? `Республиканские: ${overdue} просрочен. Открыть отчеты` : 'Открыть отчеты'}
              onPress={() => router.navigate('/reports')}
              style={[styles.heroAlert, overdue === 0 && { backgroundColor: Colors.surfaceSuccess }]}
            >
              <Icon icon={overdue > 0 ? CircleAlert : CircleCheck} size={19} color={overdue > 0 ? Colors.error : Colors.success} />
              <Text variant="caption" color={overdue > 0 ? Colors.textErrorReadable : Colors.successReadable} style={{ flex: 1 }}>
                {overdue > 0 ? `Республиканские: ${overdue} просрочен` : 'Республиканские: просрочек нет'}
              </Text>
              <Icon icon={ChevronRight} size={16} color={overdue > 0 ? Colors.error : Colors.success} />
            </Pressable>
          </View>

          <View style={{ gap: 16 }}>
            <Text variant="title" accessibilityRole="header">
              Быстрые действия
            </Text>
            <View style={{ gap: 12 }}>
              <View style={styles.row}>
                <QuickAction
                  icon={CirclePlus}
                  title="Добавить приплод"
                  description="Рождение животных"
                  onPress={() => router.navigate({ pathname: '/add', params: { kind: 'birth' } })}
                />
                <QuickAction
                  icon={Milk}
                  title="Надой"
                  description={`Надой: ${fmtNum(data.milk_month_l)} л · октябрь`}
                  onPress={() => router.navigate({ pathname: '/add', params: { mode: 'milk' } })}
                />
              </View>
              <View style={styles.row}>
                <QuickAction
                  icon={Wheat}
                  title="Заготовка кормов"
                  description="Сено, сенаж и зерно"
                  onPress={() => router.navigate({ pathname: '/add', params: { tab: 'feed' } })}
                />
                <QuickAction
                  icon={Carrot}
                  title="Урожай"
                  description="Картофель и овощи"
                  onPress={() => router.navigate({ pathname: '/add', params: { tab: 'crop' } })}
                />
              </View>
              <View style={styles.row}>
                <QuickAction icon={ShieldCheck} title="ВетИС Меркурий" description="Ветеринарный учет" onPress={() => router.push('/mercury')} />
                <QuickAction icon={PawPrint} title="ВетИС Хорриот" description="Учет животных" onPress={() => router.push('/horriot')} />
              </View>
            </View>
          </View>

          <Card onPress={() => router.push('/journal')} accessibilityLabel="Журнал учета. События хозяйства">
            <View style={styles.listCard}>
              <View style={styles.iconBox}>
                <Icon icon={Sprout} size={24} color={Colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="bodySemibold">Журнал учета</Text>
                <Text variant="caption" color={Colors.textSecondaryReadable}>
                  Надой, корма, урожай и движение скота
                </Text>
              </View>
              <Icon icon={ChevronRight} size={20} color={Colors.primary} />
            </View>
          </Card>

          {data.household ? (
            <View style={{ gap: 16 }}>
              <Text variant="title" accessibilityRole="header">
                Мое ЛПХ
              </Text>
              <Card onPress={() => router.push('/household')} accessibilityLabel={`${data.household.name}. В похозяйственную книгу`}>
                <View style={styles.listCard}>
                  <View style={styles.iconBox}>
                    <Icon icon={BookOpen} size={24} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text variant="bodySemibold">{data.household.name}</Text>
                    <Text variant="caption" color={Colors.textSecondaryReadable}>
                      {`Коровы: ${fmtHeads(data.household.cows)} · Лошади: ${data.household.horses}`}
                    </Text>
                    <Text variant="caption" color={Colors.primary}>
                      В похозяйственную книгу
                    </Text>
                  </View>
                  <Icon icon={ChevronRight} size={20} color={Colors.primary} />
                </View>
              </Card>
            </View>
          ) : null}

          {updatedText ? (
            <View style={styles.syncRow}>
              <Icon icon={CircleCheck} size={14} color={Colors.success} />
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                {`Данные обновлены ${updatedText}`}
              </Text>
            </View>
          ) : null}

          <AssistantBlock />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  hero: { padding: 20, gap: 16, borderRadius: Radius.xl, backgroundColor: Colors.primary },
  heroHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  progress: { flexDirection: 'row', gap: 1, height: 5 },
  segment: { flex: 1, height: 5, borderRadius: 3 },
  heroAlert: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: Colors.errorOnDark,
  },
  listCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.surfaceInfoSoft, alignItems: 'center', justifyContent: 'center' },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skeletonHero: { padding: 20, gap: 14, borderRadius: Radius.xl, backgroundColor: Colors.surfaceInfoSoft },
  skeletonCard: {
    flex: 1,
    padding: 16,
    gap: 10,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    minHeight: 112,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  statusCard: {
    padding: 16,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10 },
  statusBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
});
