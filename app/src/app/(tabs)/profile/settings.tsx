import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { ListGroup, ListRow } from '@/components/ui/Cards';
import { Toggle } from '@/components/ui/Controls';
import { Alert } from '@/components/ui/Feedback';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { Colors, Radius } from '@/constants/theme';
import { useReminderSettings, useSettings, useUpdateReminderSettings, useUpdateSettings } from '@/data';
import type { ReminderSettings, UserSettings } from '@/data/contract';

type Info = 'password' | 'privacy' | 'consent';

const INFO: Record<Info, { title: string; text: string }> = {
  password: {
    title: 'Изменить пароль',
    text: 'В демонстрации пароль меняется через «Забыли пароль?» на экране входа: код подтверждения и новый пароль. Прямая смена пароля в профиле не подключена.',
  },
  privacy: {
    title: 'Обработка персональных данных',
    text: 'Учебная версия документа. В АгроОкно вносятся только сведения, необходимые для учета хозяйства и подготовки отчетов. Паспортные данные и СНИЛС не запрашиваются.',
  },
  consent: {
    title: 'Согласие на обработку данных',
    text: 'Учебное согласие, данное при создании рабочего пространства. Реальные согласия и условия в демонстрации не оформляются.',
  },
};

/** F4 · Настройки. */
export default function SettingsScreen() {
  const router = useRouter();
  const settings = useSettings();
  const reminders = useReminderSettings();
  const update = useUpdateSettings();
  const updateReminders = useUpdateReminderSettings();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = settings.data;
  // Те же значения, что на экране J8 «Напоминания об отчетах»: push, звук и сроки хранятся в одних настройках.
  const rem = reminders.data;
  const deadlineOn = Boolean(rem?.remind_7_days ?? true) || Boolean(rem?.remind_1_day ?? true);

  const changeReminders = async (patch: ReminderSettings & Partial<Pick<UserSettings, 'push_enabled' | 'sound'>>) => {
    setError(null);
    try {
      await updateReminders.run(patch);
    } catch {
      setError('Не удалось сохранить настройку. Попробуйте еще раз.');
    }
  };

  const change = async (patch: Partial<UserSettings>) => {
    setError(null);
    try {
      await update.run(patch);
    } catch {
      setError('Не удалось сохранить настройку. Попробуйте еще раз.');
    }
  };

  return (
    <Screen
      title="Настройки"
      subtitle="Напоминания, доступность и безопасность"
      back={{ label: 'Профиль', fallback: '/profile' }}
      loading={settings.loading || reminders.loading}
      fromCache={settings.fromCache}
    >
      {data ? (
        <>
          <View style={{ gap: 16 }}>
            <Text variant="title" accessibilityRole="header">
              Уведомления
            </Text>
            <View style={styles.card}>
              <Toggle
                label="Push-уведомления"
                description="Важные события и обновления учета"
                value={rem?.push_enabled ?? data.push_enabled}
                onChange={(v) => changeReminders({ push_enabled: v })}
              />
              <Toggle
                label="Напоминания о сроках"
                description="За 7 дней и за день до срока"
                value={rem ? deadlineOn : data.deadline_reminders}
                onChange={(v) => changeReminders({ remind_7_days: v, remind_1_day: v })}
              />
              <Toggle
                label="Звук уведомлений"
                description="Тихие уведомления без звука"
                value={rem?.sound ?? data.sound}
                onChange={(v) => changeReminders({ sound: v })}
              />
            </View>
            <Button title="Настроить напоминания" variant="secondary" onPress={() => router.push('/reminders')} />
          </View>

          <View style={{ gap: 16 }}>
            <Text variant="title" accessibilityRole="header">
              Доступность
            </Text>
            <Select
              label="Размер текста"
              value={data.text_size}
              options={[
                { value: 'standard', label: 'Стандартный' },
                { value: 'large', label: 'Крупный' },
              ]}
              onChange={(v) => change({ text_size: v })}
              hint="Можно увеличить для комфортного чтения"
            />
          </View>

          <View style={{ gap: 8 }}>
            <Text variant="bodyLg" style={{ fontFamily: 'Onest_600SemiBold' }}>
              Безопасность и данные
            </Text>
            <ListGroup>
              <ListRow title="Изменить пароль" subtitle="Обновление пароля для входа" onPress={() => setInfo('password')} />
              <ListRow title="Обработка персональных данных" subtitle="Документ · учебная версия" onPress={() => setInfo('privacy')} />
              <ListRow title="Согласие на обработку данных" subtitle="Просмотр условий и согласий" onPress={() => setInfo('consent')} last />
            </ListGroup>
          </View>

          {error ? <Alert tone="error">{error}</Alert> : null}
          <Alert>Показаны состояния настроек в макете: напоминания включены, звук выключен. Настоящие уведомления не отправляются.</Alert>
        </>
      ) : null}
      <Sheet visible={info !== null} title={info ? INFO[info].title : undefined} onClose={() => setInfo(null)}>
        <Text variant="small" style={{ paddingHorizontal: 8, paddingBottom: 16, lineHeight: 22 }}>
          {info ? INFO[info].text : ''}
        </Text>
        <Button title="Закрыть" variant="secondary" compact onPress={() => setInfo(null)} style={{ marginBottom: 8 }} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
});
