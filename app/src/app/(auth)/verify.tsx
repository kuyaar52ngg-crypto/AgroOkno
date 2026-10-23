import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { OtpInput } from '@/components/ui/OtpInput';
import { Text } from '@/components/ui/Text';
import { Colors, Radius } from '@/constants/theme';
import { resendCode, verifySignUpCode } from '@/data';
import { useOnboarding } from '@/hooks/onboarding';

const RESEND_SECONDS = 42;

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** R2 · Подтвердите контакт */
export default function VerifyScreen() {
  const router = useRouter();
  const onboarding = useOnboarding();
  const [code, setCode] = useState(onboarding.demoCode);
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
    const result = await verifySignUpCode(onboarding.contact, code);
    setPending(false);
    // При успехе пользователь в сессии: корневой layout открывает онбординг (R3).
    if (!result.ok) setError(result.message || 'Неверный код. Проверьте цифры');
  };

  const resend = async () => {
    const result = await resendCode(onboarding.contact, 'signup');
    if (result.ok) {
      setCode(result.demoCode ?? '');
      setError(null);
      setSeconds(RESEND_SECONDS);
    }
  };

  return (
    <Screen
      header="brand"
      back={{ label: 'Создать аккаунт', fallback: '/sign-up' }}
      title="Подтвердите контакт"
      subtitle="Введите код из письма"
      safeBottom
    >
      <View style={styles.contact}>
        <Text variant="caption" color={Colors.textSecondaryReadable}>
          Код отправлен на
        </Text>
        <Text variant="bodySemibold">{onboarding.maskedContact || 'Контакт не указан'}</Text>
      </View>
      <OtpInput
        label="Код из 6 цифр"
        value={code}
        onChange={(value) => {
          setCode(value);
          setError(null);
        }}
        error={error}
      />
      <Button title="Подтвердить" onPress={confirm} loading={pending} loadingTitle="Проверяем…" />
      <View style={{ alignItems: 'center', gap: 0 }}>
        {seconds > 0 ? (
          <Text variant="small" color={Colors.textSecondaryReadable} accessibilityLiveRegion="polite" style={{ minHeight: 44, textAlignVertical: 'center', paddingTop: 12 }}>
            {`Отправить код повторно через ${mmss(seconds)}`}
          </Text>
        ) : (
          <Pressable accessibilityRole="button" onPress={resend} style={styles.link}>
            <Text variant="smallMedium" color={Colors.primary}>
              Отправить код повторно
            </Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="link" onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-up'))} style={styles.link}>
          <Text variant="smallMedium" color={Colors.primary}>
            Изменить контакт
          </Text>
        </Pressable>
      </View>
      <Alert>После подтверждения выберите роль — затем создайте хозяйство или запросите доступ.</Alert>
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
  link: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
});
