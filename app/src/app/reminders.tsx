import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Controls';
import { Alert } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { daysWord, fmtDateLong } from '@/constants/format';
import { Colors, Radius } from '@/constants/theme';
import { useAuth, useFarm, useReminderSettings, useUpcomingDeadlines, useUpdateReminderSettings } from '@/data';
import type { DeadlineReminder, ReminderSettings, UserSettings } from '@/data/contract';

type Values = Required<ReminderSettings> & Pick<UserSettings, 'push_enabled' | 'sound'>;

function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="title" accessibilityRole="header">
      {children}
    </Text>
  );
}

function PreviewItem({ reminder }: { reminder: DeadlineReminder }) {
  const overdue = reminder.days_left < 0;
  const late = Math.abs(reminder.days_left);
  const due = fmtDateLong(reminder.due_on);
  if (overdue) {
    return (
      <View style={[styles.preview, { backgroundColor: Colors.surfaceError }]}>
        <Text variant="label" color={Colors.textErrorReadable}>{`${reminder.title} · Срок истек`}</Text>
        <Text variant="caption" color={Colors.textErrorReadable}>{`${due} · просрочка ${late} ${daysWord(late)}`}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.preview, { backgroundColor: Colors.surfaceInfoSoft }]}>
      <Text variant="label" color={Colors.primary}>{`До сдачи ${reminder.title} осталось ${reminder.days_left} ${daysWord(reminder.days_left)}`}</Text>
      <Text variant="caption" color={Colors.primary}>{`до ${due}`}</Text>
    </View>
  );
}

/** J8 · Напоминания об отчетах (настройки, общие с F4). */
export default function RemindersScreen() {
  const router = useRouter();
  const auth = useAuth();
  const farm = useFarm();
  const settings = useReminderSettings();
  const deadlines = useUpcomingDeadlines();
  const update = useUpdateReminderSettings();
  const [draft, setDraft] = useState<Partial<Values>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stored = settings.data;
  const values: Values | null = stored
    ? {
        reminders_in_chat: stored.reminders_in_chat ?? true,
        remind_7_days: stored.remind_7_days ?? true,
        remind_1_day: stored.remind_1_day ?? true,
        push_enabled: stored.push_enabled,
        sound: stored.sound,
        ...draft,
      }
    : null;

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setSaved(false);
    setError(null);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const save = async () => {
    if (!values) return;
    setError(null);
    try {
      await update.run(values);
      setDraft({});
      setSaved(true);
    } catch {
      setError('Не удалось сохранить настройки. Попробуйте еще раз.');
    }
  };

  const farmName = farm.data?.name ?? auth.farm?.name ?? 'Хозяйство';
  const place = [farm.data?.settlement ?? auth.farm?.settlement, (farm.data?.region ?? '').includes('Якутия') ? 'Якутия' : farm.data?.region].filter(Boolean).join(' · ');
  const preview = (deadlines.data ?? []).slice(0, 3);

  return (
    <Screen
      loading={settings.loading}
      fromCache={settings.fromCache}
      safeBottom
      footer={
        <Button
          title="Сохранить"
          onPress={save}
          loading={update.pending}
          loadingTitle="Сохраняем…"
          disabled={!values}
          testID="reminders-save"
        />
      }
    >
      <View style={{ gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="К помощнику"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/assistant'))}
          style={styles.backButton}
        >
          <Text variant="button" color={Colors.primary} style={{ fontSize: 15 }}>
            К помощнику
          </Text>
        </Pressable>
        <Text variant="h1" accessibilityRole="header">
          Напоминания об отчетах
        </Text>
        <View style={{ gap: 3 }}>
          <Text variant="label">{farmName}</Text>
          {place ? (
            <Text variant="caption" color={Colors.textSecondaryReadable}>
              {place}
            </Text>
          ) : null}
        </View>
      </View>

      {values ? (
        <>
          <View style={{ gap: 12 }}>
            <SectionTitle>Где напоминать</SectionTitle>
            <View style={styles.card}>
              <Toggle
                label="Уведомления в чате"
                description="В переписке с помощником"
                value={values.reminders_in_chat}
                onChange={(v) => set('reminders_in_chat', v)}
              />
              <Toggle
                label="Push-уведомления"
                description="Нужно разрешение устройства"
                value={values.push_enabled}
                onChange={(v) => set('push_enabled', v)}
              />
              <Toggle
                label="Звук уведомлений"
                description={values.sound ? 'Включен · уведомления со звуком' : 'Выключен · тихие уведомления'}
                value={values.sound}
                onChange={(v) => set('sound', v)}
              />
            </View>
          </View>

          <View style={{ gap: 12 }}>
            <SectionTitle>Когда напоминать</SectionTitle>
            <View style={styles.card}>
              <Toggle label="За 7 дней до срока" value={values.remind_7_days} onChange={(v) => set('remind_7_days', v)} />
              <Toggle label="За 1 день до срока" value={values.remind_1_day} onChange={(v) => set('remind_1_day', v)} />
            </View>
          </View>

          <View style={{ gap: 12 }}>
            <SectionTitle>Предпросмотр</SectionTitle>
            {preview.length > 0 ? (
              preview.map((reminder) => <PreviewItem key={reminder.form_code} reminder={reminder} />)
            ) : (
              <Alert>Ближайших сроков по отчетам нет.</Alert>
            )}
          </View>

          {saved ? <Alert tone="success">Настройки напоминаний сохранены.</Alert> : null}
          {error ? <Alert tone="error">{error}</Alert> : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 24,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  card: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  preview: { padding: 14, gap: 4, borderRadius: 10 },
});
