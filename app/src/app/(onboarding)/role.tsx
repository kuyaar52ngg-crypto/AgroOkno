import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { RadioCard } from '@/components/ui/Controls';
import { Alert } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/data';
import type { UserRole } from '@/data/contract';

const ROLES: { role: UserRole; title: string; description: string; summary: string }[] = [
  { role: 'farm_head', title: 'Глава КФХ / ИП', description: 'Учет хозяйства и формы своего респондента.', summary: 'Выбрана роль главы КФХ / ИП.' },
  { role: 'lph_owner', title: 'Владелец ЛПХ', description: 'Личная книга, животные, участок и события.', summary: 'Выбрана роль владельца ЛПХ.' },
  {
    role: 'council_specialist',
    title: 'Специалист сельсовета',
    description: 'Работа с записями похозяйственной книги.',
    summary: 'Выбрана роль специалиста сельсовета.',
  },
];

/** R3 (бывший A7) · Выбор роли */
export default function RoleScreen() {
  const auth = useAuth();
  const router = useRouter();
  const initial: UserRole = auth.farm?.legal_status === 'lph' ? 'lph_owner' : 'farm_head';
  const [role, setRole] = useState<UserRole>(auth.profile?.role ?? initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = ROLES.find((r) => r.role === role) ?? ROLES[0];
  const farm = auth.farm;

  const submit = async () => {
    setPending(true);
    const result = await auth.setRole(role);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    // Хозяйство уже есть (демо-аккаунт) — корневой layout сам откроет приложение.
    // Иначе — R4: создать хозяйство или присоединиться.
    if (!auth.farm) router.replace('/choose-farm');
  };

  return (
    <Screen
      header="brand"
      back={{
        label: 'Назад',
        fallback: '/sign-in',
        onPress: async () => {
          await auth.signOut();
          router.replace('/sign-in');
        },
      }}
      title="Выбор роли"
      subtitle="Подберем разделы под ваши задачи"
      safeBottom
    >
      <View style={{ gap: 12 }} accessibilityRole="radiogroup">
        {ROLES.map((item) => (
          <RadioCard
            key={item.role}
            selected={item.role === role}
            onSelect={() => setRole(item.role)}
            title={item.title}
            description={item.description}
          />
        ))}
      </View>
      {farm ? (
        <Alert title={farm.name}>
          {`${selected.summary}${farm.book_record_no ? ` Запись книги № ${farm.book_record_no}` : ''}${farm.settlement ? ` · ${farm.settlement}.` : ''}`}
        </Alert>
      ) : (
        <Alert title="Подключите хозяйство">Создайте новую запись или запросите доступ к существующему хозяйству.</Alert>
      )}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button title="Продолжить" onPress={submit} loading={pending} loadingTitle="Сохраняем…" />
      <Text variant="caption" color={Colors.textSecondaryReadable}>
        Роль определяет доступные разделы, но не создает новых обязанностей по отчетности.
      </Text>
    </Screen>
  );
}
