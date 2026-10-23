import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { OtpInput } from '@/components/ui/OtpInput';
import { Text } from '@/components/ui/Text';
import { Colors, Radius } from '@/constants/theme';
import { useAuth } from '@/data';
import { useRecovery } from '@/hooks/recovery';

const RESEND_SECONDS = 42;

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** A5 · Подтверждение кода */
export default function CodeScreen() {
  const router = useRouter();
  const auth = useAuth();
  const recovery = useRecovery();
  const [code, setCode] = useState(recovery.demoCode);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const confirm = async () => {
    if (code.length < 6) {
      setError('Введите все 6 цифр');
      return;
    }
    setPending(true);
    const result = await auth.verifyRecoveryCode(recovery.contact, code);
    setPending(false);
    if (!result.ok) {
      setError(result.message || 'Неверный код. Проверьте цифры');
      return;
    }
    router.replace('/new-password');
  };

  const resend = async () => {
    const result = await auth.requestRecovery(recovery.contact);
    if (result.ok) {
      recovery.setDemoCode(result.demoCode ?? '');
      setCode(result.demoCode ?? '');
      setError(null);
      setSeconds(RESEND_SECONDS);
    }
  };

  return (
    <Screen
      header="brand"
      back={{ label: 'Изменить контакт', fallback: '/recovery' }}
      title="Подтверждение кода"
      subtitle="Введите 6 цифр из сообщения"
      safeBottom
    >
      <View style={styles.contact}>
        <Text variant="label" style={{ fontSize: 13 }}>
          {recovery.maskedContact || 'Контакт не указан'}
        </Text>
        <Text variant="caption" color={Colors.textSecondaryReadable}>
          Маскированный учебный контакт из профиля
        </Text>
      </View>
      <View style={{ gap: 8 }}>
        <OtpInput
          label="Код из сообщения"
          value={code}
          onChange={(value) => {
            setCode(value);
            setError(null);
          }}
          error={error}
        />
        {seconds > 0 ? (
          <Text variant="caption" color={Colors.textSecondaryReadable} accessibilityLiveRegion="polite">
            Отправить код повторно через {mmss(seconds)}
          </Text>
        ) : (
          <Pressable accessibilityRole="button" onPress={resend} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
            <Text variant="smallMedium" color={Colors.primary}>
              Отправить код повторно
            </Text>
          </Pressable>
        )}
      </View>
      <Button title="Подтвердить" onPress={confirm} loading={pending} loadingTitle="Проверяем…" />
      <Alert>Учебный код показан для примера. Реальная отправка сообщений в макете не выполняется.</Alert>
    </Screen>
  );
}

const styles = StyleSheet.create({
  contact: {
    padding: 16,
    gap: 4,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
});
