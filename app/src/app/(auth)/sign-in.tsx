import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { DEMO_LOGIN } from '@/constants/demo';
import { Colors } from '@/constants/theme';
import { signIn } from '@/data';

/** A2 · Вход, A3 · Вход — ошибка */
export default function SignInScreen() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [innError, setInnError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [esiaInfo, setEsiaInfo] = useState(false);

  const failed = Boolean(innError || banner);

  const submit = async () => {
    setBanner(null);
    setPasswordError(null);
    if (identifier.trim().length === 0) {
      setInnError('Введите ИНН, email или телефон');
      setBanner('Не удалось войти. Пароль сохранен в поле — повторно вводить его не нужно.');
      return;
    }
    setInnError(null);
    if (password.length === 0) {
      setPasswordError('Введите пароль');
      return;
    }
    setPending(true);
    const result = await signIn(identifier.trim(), password);
    setPending(false);
    // При успехе корневой layout сам откроет онбординг (роль, хозяйство) или приложение.
    if (result.ok) return;
    if (result.error === 'invalid_inn') {
      setInnError('Неверный ИНН. Проверьте цифры');
    } else if (result.error === 'network') {
      setBanner('Нет подключения к сети. Проверьте интернет и повторите вход. Пароль сохранен в поле.');
    } else {
      setPasswordError(result.message || 'Неверный логин или пароль');
      setBanner('Не удалось войти. Пароль сохранен в поле — повторно вводить его не нужно.');
    }
  };

  return (
    <Screen
      header="brand"
      back={{ label: 'Добро пожаловать', fallback: '/welcome' }}
      title="Вход"
      subtitle={failed ? 'Исправьте данные и попробуйте еще раз' : 'Войдите в рабочее пространство хозяйства'}
      safeBottom
    >
      <View style={{ gap: 20 }}>
        <Input
          label="ИНН, email или телефон"
          value={identifier}
          onChangeText={(value) => {
            setIdentifier(value);
            setInnError(null);
          }}
          placeholder="ИНН хозяйства, email или телефон"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          error={innError}
          hint="Учебный пример ИНН · не реальные данные"
          testID="inn-input"
        />
        {innError ? (
          <Text variant="caption" color={Colors.textSecondaryReadable} style={{ marginTop: -12 }}>
            Учебный пример ИНН · не реальные данные
          </Text>
        ) : null}
        <Input
          label="Пароль"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setPasswordError(null);
          }}
          secure
          autoComplete="current-password"
          autoCapitalize="none"
          error={passwordError}
          returnKeyType="go"
          onSubmitEditing={submit}
          testID="password-input"
        />
        <Pressable accessibilityRole="link" onPress={() => router.push('/recovery')} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <Text variant="small" color={Colors.primary}>
            Забыли пароль?
          </Text>
        </Pressable>
        <Button title="Войти" onPress={submit} loading={pending} loadingTitle="Входим…" testID="sign-in-button" />
        <Button title="Войти через Госуслуги (ЕСИА)" variant="secondary" onPress={() => setEsiaInfo(true)} />
        <Pressable accessibilityRole="link" onPress={() => router.push('/sign-up')} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'center' }}>
          <Text variant="smallMedium" color={Colors.primary}>
            Нет аккаунта? Создать аккаунт
          </Text>
        </Pressable>
        <Alert>Демонстрационный доступ. Вход через ЕСИА показан как сценарий, без реального подключения и официального одобрения.</Alert>
        {esiaInfo ? <Alert tone="warning">Подключение к ЕСИА в демонстрации не выполняется. Войдите по ИНН, email или телефону и паролю.</Alert> : null}
        {banner ? <Alert tone="error">{banner}</Alert> : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setIdentifier(DEMO_LOGIN.inn);
            setPassword(DEMO_LOGIN.password);
            setInnError(null);
            setPasswordError(null);
            setBanner(null);
          }}
          style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
        >
          <Text variant="small" color={Colors.primary}>
            Подставить учебные данные для входа
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
