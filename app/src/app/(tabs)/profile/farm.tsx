import { useRouter } from 'expo-router';
import { Check, Lock } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { Colors } from '@/constants/theme';
import { useAuth, useFarm, useUpdateFarm, useUpdateProfile } from '@/data';
import type { LegalStatus } from '@/data/contract';

const LEGAL_LABEL: Record<LegalStatus, string> = {
  lph: 'Личное подсобное хозяйство (ЛПХ)',
  kfh: 'Крестьянское (фермерское) хозяйство (КФХ)',
  ip: 'Индивидуальный предприниматель (ИП)',
};

interface FormValues {
  name: string;
  status: LegalStatus;
  region: string;
  settlement: string;
  address: string;
  email: string;
  phone: string;
}

/** F2 · Данные хозяйства. */
export default function FarmDataScreen() {
  const router = useRouter();
  const auth = useAuth();
  const farmQuery = useFarm();
  const updateFarm = useUpdateFarm();
  const updateProfile = useUpdateProfile();
  const farm = farmQuery.data;
  const [values, setValues] = useState<FormValues | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (farm && !initialized.current) {
      initialized.current = true;
      setValues({
        name: farm.name,
        status: farm.legal_status,
        region: farm.region ?? '',
        settlement: farm.settlement ?? '',
        address: farm.address ?? '',
        email: auth.profile?.email ?? '',
        phone: auth.profile?.phone ?? '',
      });
    }
  }, [farm, auth.profile]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((v) => (v ? { ...v, [key]: value } : v));
    setSaved(false);
  };

  const errors = values
    ? {
        name: values.name.trim() === '' ? 'Укажите название хозяйства' : null,
        email: values.email.trim() !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email.trim()) ? 'Проверьте email: например, ivan@example.com' : null,
        phone: values.phone.trim() !== '' && values.phone.replace(/\D/g, '').length < 10 ? 'Телефон: не менее 10 цифр' : null,
      }
    : { name: null, email: null, phone: null };
  const valid = !errors.name && !errors.email && !errors.phone;
  const show = (key: keyof typeof errors) => (showErrors ? errors[key] : null);

  const save = async () => {
    if (!values) return;
    setShowErrors(true);
    setError(null);
    if (!valid) return;
    try {
      await updateFarm.run({
        name: values.name.trim(),
        legal_status: values.status,
        region: values.region.trim() || null,
        settlement: values.settlement.trim() || null,
        address: values.address.trim() || null,
      });
      await updateProfile.run({ email: values.email.trim() || null, phone: values.phone.trim() || null });
      setSaved(true);
    } catch {
      setError('Не удалось сохранить изменения. Данные формы не потеряны — повторите попытку.');
    }
  };

  const pending = updateFarm.pending || updateProfile.pending;

  return (
    <Screen
      title="Данные хозяйства"
      subtitle="Проверьте сведения вашей записи"
      back={{ label: 'Профиль', fallback: '/profile' }}
      loading={farmQuery.loading || !values}
    >
      {values && farm ? (
        <>
          <View style={{ gap: 20 }}>
            <Input label="Название хозяйства" value={values.name} onChangeText={(v) => set('name', v)} error={show('name')} />
            <Select
              label="Правовой статус"
              value={values.status}
              options={(Object.keys(LEGAL_LABEL) as LegalStatus[]).map((s) => ({ value: s, label: LEGAL_LABEL[s] }))}
              onChange={(v) => set('status', v)}
            />
            {farm.book_record_no ? (
              <Input
                label="Номер записи книги"
                value={farm.book_record_no}
                disabled
                trailingIcon={Lock}
                hint="Связанная запись · только для просмотра"
              />
            ) : null}
            {farm.inn ? <Input label="ИНН хозяйства" value={farm.inn} disabled hint="Изменение недоступно" /> : null}
            <Input label="Регион" value={values.region} onChangeText={(v) => set('region', v)} />
            <Input label="Населенный пункт" value={values.settlement} onChangeText={(v) => set('settlement', v)} />
            <Input label="Адрес участка" value={values.address} onChangeText={(v) => set('address', v)} />
            <Input
              label="Email · учебный контакт"
              value={values.email}
              onChangeText={(v) => set('email', v)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              hint="Для демонстрации восстановления доступа"
              error={show('email')}
            />
            <Input
              label="Телефон · необязательно"
              value={values.phone}
              onChangeText={(v) => set('phone', v)}
              keyboardType="phone-pad"
              placeholder="Не указан"
              error={show('phone')}
            />
          </View>
          <Alert>ИНН не обязателен для каждого ЛПХ. Вход по учебному ИНН относится к демонстрационному рабочему пространству.</Alert>
          {saved ? <Alert tone="success">Изменения сохранены.</Alert> : null}
          {error ? <Alert tone="error">{error}</Alert> : null}
          <View style={{ gap: 12 }}>
            <Button title="Сохранить изменения" icon={Check} onPress={save} loading={pending} loadingTitle="Сохраняем…" />
            <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
              Учебные контакты · не для реальной связи
            </Text>
            {saved ? <Button title="Вернуться в профиль" variant="secondary" onPress={() => router.back()} /> : null}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
