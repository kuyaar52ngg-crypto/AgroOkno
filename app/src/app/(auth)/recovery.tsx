import { useRouter } from 'expo-router';
import Lock from 'lucide-react-native/icons/lock';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { Colors, Radius } from '@/constants/theme';
import { useAuth } from '@/data';
import { useRecovery } from '@/hooks/recovery';
import { useSingleFlight } from '@/hooks/useSingleFlight';

/** A4 · Восстановление доступа */
export default function RecoveryScreen() {
  const router = useRouter();
  const auth = useAuth();
  const recovery = useRecovery();
  const [contact, setContact] = useState(recovery.contact);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = useSingleFlight(async () => {
    const value = contact.trim();
    if (value.length === 0) {
      setError('Укажите телефон или email');
      return;
    }
    setPending(true);
    const result = await auth.requestRecovery(value);
    setPending(false);
    if (!result.ok) {
      setError(result.message || 'Контакт не найден. Проверьте телефон или email');
      return;
    }
    recovery.setContact(value);
    recovery.setMaskedContact(result.maskedContact ?? value);
    recovery.setDemoCode(result.demoCode ?? '');
    recovery.setRecovering(true);
    router.push('/code');
  });

  return (
    <Screen
      header="brand"
      back={{ label: 'Ко входу', fallback: '/sign-in' }}
      title="Восстановление доступа"
      subtitle="Поможем вернуться в ваше хозяйство"
      safeBottom
    >
      <View style={styles.card}>
        <Icon icon={Lock} size={24} color={Colors.primary} />
        <Text variant="label" style={{ fontSize: 13 }}>
          Используйте контакт из профиля
        </Text>
        <Text variant="caption" color={Colors.textSecondaryReadable}>
          Укажите телефон или email, который вы добавили в данных хозяйства.
        </Text>
      </View>
      <Input
        label="Телефон или email"
        value={contact}
        onChangeText={(value) => {
          setContact(value);
          setError(null);
        }}
        placeholder="ivan@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        error={error}
        hint="Код придёт письмом на email из профиля"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title="Получить код" onPress={submit} loading={pending} loadingTitle="Отправляем…" />
      <Alert>По коду из письма вы войдёте в хозяйство и сможете задать новый пароль.</Alert>
      <Button
        title="Вернуться ко входу"
        variant="secondary"
        onPress={() => {
          recovery.setRecovering(false);
          router.replace('/sign-in');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 8,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
});
