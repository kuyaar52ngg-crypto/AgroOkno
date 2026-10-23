import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { CheckBox } from '@/components/ui/Controls';
import { Alert } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { Colors, Radius } from '@/constants/theme';
import { useAuth } from '@/data';
import { useRecovery } from '@/hooks/recovery';

/** A6 · Новый пароль */
export default function NewPasswordScreen() {
  const router = useRouter();
  const auth = useAuth();
  const recovery = useRecovery();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const lengthOk = password.length >= 8;
  const mixOk = /[A-Za-zА-Яа-яЁё]/.test(password) && /\d/.test(password);
  const matchOk = password.length > 0 && password === repeat;
  const valid = lengthOk && mixOk && matchOk;

  const save = async () => {
    if (!valid) {
      setError('Проверьте требования к паролю');
      return;
    }
    setPending(true);
    const result = await auth.setNewPassword(password);
    if (!result.ok) {
      setPending(false);
      setError(result.message);
      return;
    }
    // Пользователь после проверки кода уже в сессии — выходим, чтобы войти с новым паролем.
    await auth.signOut();
    setPending(false);
    recovery.setRecovering(false);
    router.replace('/sign-in');
  };

  return (
    <Screen
      header="brand"
      back={{ label: 'Подтверждение кода', fallback: '/code' }}
      title="Новый пароль"
      subtitle="Придумайте надежный пароль для входа"
      safeBottom
    >
      <View style={{ gap: 20 }}>
        <Input
          label="Новый пароль"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setError(null);
          }}
          secure
          autoCapitalize="none"
          autoComplete="new-password"
        />
        <Input
          label="Повторите пароль"
          value={repeat}
          onChangeText={(value) => {
            setRepeat(value);
            setError(null);
          }}
          secure
          autoCapitalize="none"
          autoComplete="new-password"
          error={error}
        />
      </View>
      <View style={styles.requirements} accessibilityLiveRegion="polite">
        <Text variant="label" style={{ fontSize: 13 }}>
          Требования к паролю
        </Text>
        <CheckBox checked={lengthOk} tone="success" label="Не менее 8 символов" />
        <CheckBox checked={mixOk} tone="success" label="Есть буквы и цифры" />
        <CheckBox checked={matchOk} tone="success" label="Пароли совпадают" />
      </View>
      <Button title="Сохранить пароль" onPress={save} loading={pending} disabled={!valid} loadingTitle="Сохраняем…" />
      <Alert>После сохранения вернитесь ко входу и используйте новый пароль. Это демонстрационный сценарий.</Alert>
    </Screen>
  );
}

const styles = StyleSheet.create({
  requirements: {
    padding: 16,
    gap: 6,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
});
