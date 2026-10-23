import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { CheckBox } from '@/components/ui/Controls';
import { Alert } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { Colors } from '@/constants/theme';
import { signUp } from '@/data';
import { useOnboarding } from '@/hooks/onboarding';

const PRIVACY_TEXT =
  'Учебная версия документа. В АгроОкно вносятся только сведения, необходимые для учета хозяйства и подготовки отчетов. Паспортные данные и СНИЛС не запрашиваются.';

function looksLikeContact(value: string): boolean {
  const trimmed = value.trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed) || trimmed.replace(/\D/g, '').length >= 10;
}

/** R1 · Создать аккаунт */
export default function SignUpScreen() {
  const router = useRouter();
  const onboarding = useOnboarding();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; contact?: string; password?: string; repeat?: string; consent?: string }>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [esiaInfo, setEsiaInfo] = useState(false);
  const [policy, setPolicy] = useState(false);

  const lengthOk = password.length >= 8;
  const mixOk = /[A-Za-zА-Яа-яЁё]/.test(password) && /\d/.test(password);

  const submit = async () => {
    const next: typeof errors = {};
    if (name.trim().split(/\s+/).filter(Boolean).length < 2) next.name = 'Укажите имя и фамилию';
    if (!looksLikeContact(contact)) next.contact = 'Проверьте телефон или email';
    if (!lengthOk || !mixOk) next.password = 'Пароль не подходит под требования ниже';
    if (repeat !== password || repeat.length === 0) next.repeat = 'Пароли не совпадают';
    if (!consent) next.consent = 'Нужно согласие на обработку персональных данных';
    setErrors(next);
    setBanner(null);
    if (Object.keys(next).length > 0) return;
    setPending(true);
    const result = await signUp({ full_name: name.trim(), contact: contact.trim(), password, consent });
    setPending(false);
    if (!result.ok) {
      if (result.error === 'network') setBanner('Нет подключения к сети. Проверьте интернет и повторите. Введенные данные сохранены в полях.');
      else if (result.error === 'weak_password') setErrors({ password: result.message });
      else if (result.error === 'contact_not_found') setErrors({ contact: result.message });
      else setBanner(result.message);
      return;
    }
    onboarding.setSignUpContact({
      contact: contact.trim(),
      maskedContact: result.maskedContact ?? contact.trim(),
      demoCode: result.demoCode ?? '',
    });
    router.push('/verify');
  };

  return (
    <Screen
      header="brand"
      back={{ label: 'Вход', fallback: '/sign-in' }}
      title="Создать аккаунт"
      subtitle="Зарегистрируйтесь, чтобы вести учет хозяйства"
      safeBottom
    >
      <View style={{ gap: 20 }}>
        <Input
          label="Имя и фамилия"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setErrors((e) => ({ ...e, name: undefined }));
          }}
          placeholder="Иван Иванов"
          autoComplete="name"
          textContentType="name"
          error={errors.name}
          testID="signup-name"
        />
        <Input
          label="Телефон или email"
          value={contact}
          onChangeText={(value) => {
            setContact(value);
            setErrors((e) => ({ ...e, contact: undefined }));
          }}
          placeholder="ivan@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          error={errors.contact}
          testID="signup-contact"
        />
        <Input
          label="Пароль"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setErrors((e) => ({ ...e, password: undefined }));
          }}
          secure
          autoCapitalize="none"
          autoComplete="new-password"
          error={errors.password}
          testID="signup-password"
        />
        <Input
          label="Повторите пароль"
          value={repeat}
          onChangeText={(value) => {
            setRepeat(value);
            setErrors((e) => ({ ...e, repeat: undefined }));
          }}
          secure
          autoCapitalize="none"
          autoComplete="new-password"
          error={errors.repeat}
          testID="signup-repeat"
        />
        <View style={{ gap: 4, marginTop: -8 }} accessibilityLabel="Требования к паролю">
          <Text variant="caption" color={password.length > 0 && lengthOk ? Colors.successReadable : Colors.textSecondaryReadable}>
            • Не менее 8 символов
          </Text>
          <Text variant="caption" color={password.length > 0 && mixOk ? Colors.successReadable : Colors.textSecondaryReadable}>
            • Буквы и хотя бы одна цифра
          </Text>
        </View>
        <View style={{ gap: 4 }}>
          <CheckBox
            checked={consent}
            onChange={(value) => {
              setConsent(value);
              setErrors((e) => ({ ...e, consent: undefined }));
            }}
            label="Согласен на обработку персональных данных"
          />
          <Pressable accessibilityRole="link" onPress={() => setPolicy(true)} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
            <Text variant="caption" color={Colors.primary}>
              Политика обработки персональных данных
            </Text>
          </Pressable>
          {errors.consent ? (
            <Text variant="caption" color={Colors.textErrorReadable} accessibilityLiveRegion="polite">
              {errors.consent}
            </Text>
          ) : null}
        </View>
        {banner ? <Alert tone="error">{banner}</Alert> : null}
        <Button title="Создать аккаунт" onPress={submit} loading={pending} loadingTitle="Создаем…" testID="signup-submit" />
        <Pressable accessibilityRole="link" onPress={() => router.replace('/sign-in')} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'center' }}>
          <Text variant="smallMedium" color={Colors.primary}>
            Уже есть аккаунт? Войти
          </Text>
        </Pressable>
        <Button title="Через Госуслуги (ЕСИА)" variant="secondary" onPress={() => setEsiaInfo(true)} />
        {esiaInfo ? <Alert tone="warning">Подключение к ЕСИА в демонстрации не выполняется. Создайте аккаунт по телефону или email.</Alert> : null}
        <Text variant="caption" color={Colors.textSecondaryReadable}>
          При первом входе через ЕСИА аккаунт создастся автоматически.
        </Text>
      </View>
      <Sheet visible={policy} title="Политика обработки персональных данных" onClose={() => setPolicy(false)}>
        <Text variant="small" style={{ paddingHorizontal: 8, paddingBottom: 16, lineHeight: 22 }}>
          {PRIVACY_TEXT}
        </Text>
      </Sheet>
    </Screen>
  );
}
