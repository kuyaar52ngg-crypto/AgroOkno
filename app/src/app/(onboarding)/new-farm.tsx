import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { digitsOnly, isValidInn } from '@/constants/format';
import { useAuth, useCreateFarm } from '@/data';
import type { LegalStatus, UserRole } from '@/data/contract';
import { useOnboarding } from '@/hooks/onboarding';

const LEGAL_OPTIONS: { value: LegalStatus; label: string }[] = [
  { value: 'lph', label: 'ЛПХ' },
  { value: 'kfh', label: 'КФХ' },
  { value: 'ip', label: 'ИП' },
];

const REGIONS = [{ value: 'Республика Саха (Якутия)', label: 'Республика Саха (Якутия)' }];

const SETTLEMENTS = ['с. Намцы', 'г. Якутск', 'с. Чурапча', 'с. Хатассы', 'п. Жатай', 'с. Маган', 'с. Покровск', 'с. Эльгяй'].map((s) => ({
  value: s,
  label: s,
}));

const ROLE_TEXT: Record<UserRole, string> = {
  farm_head: 'Ваша роль — глава КФХ / ИП',
  lph_owner: 'Ваша роль — владелец ЛПХ',
  council_specialist: 'Ваша роль — специалист сельсовета',
};

/** R5 · Новое хозяйство */
export default function NewFarmScreen() {
  const router = useRouter();
  const auth = useAuth();
  const onboarding = useOnboarding();
  const createFarm = useCreateFarm();
  const role = auth.profile?.role ?? null;
  const [name, setName] = useState('');
  const [status, setStatus] = useState<LegalStatus>(role === 'farm_head' ? 'kfh' : 'lph');
  const [region, setRegion] = useState(REGIONS[0].value);
  const [settlement, setSettlement] = useState('с. Намцы');
  const [inn, setInn] = useState('');
  const [errors, setErrors] = useState<{ name?: string; inn?: string }>({});
  const [banner, setBanner] = useState<string | null>(null);

  const submit = async () => {
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = 'Введите название хозяйства';
    if (status !== 'lph' && !isValidInn(inn)) next.inn = 'ИНН — 10 или 12 цифр';
    setErrors(next);
    setBanner(null);
    if (Object.keys(next).length > 0) return;
    // Держим онбординг, пока пользователь не закроет экран R6 «Хозяйство создано».
    onboarding.setHoldOnboarding(true);
    try {
      await createFarm.run({ name: name.trim(), legal_status: status, region, settlement, inn: status === 'lph' ? null : inn });
      router.replace('/farm-created');
    } catch (e) {
      onboarding.setHoldOnboarding(false);
      setBanner(e instanceof Error && e.message ? e.message : 'Не удалось создать хозяйство. Данные в полях сохранены — попробуйте еще раз.');
    }
  };

  return (
    <Screen
      header="brand"
      back={{ label: 'Ваше хозяйство', fallback: '/choose-farm' }}
      title="Новое хозяйство"
      subtitle={role ? ROLE_TEXT[role] : undefined}
      safeBottom
    >
      <View style={{ gap: 20 }}>
        <Input
          label="Название хозяйства"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setErrors((e) => ({ ...e, name: undefined }));
          }}
          placeholder="ЛПХ Ивановых"
          error={errors.name}
          testID="farm-name"
        />
        <Select label="Правовой статус" value={status} options={LEGAL_OPTIONS} onChange={setStatus} />
        {status !== 'lph' ? (
          <Input
            label="ИНН хозяйства"
            value={inn}
            onChangeText={(value) => {
              setInn(digitsOnly(value).slice(0, 12));
              setErrors((e) => ({ ...e, inn: undefined }));
            }}
            placeholder="10 или 12 цифр"
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={12}
            error={errors.inn}
            hint="Учебный пример ИНН · не реальные данные"
          />
        ) : null}
        <Select label="Регион" value={region} options={REGIONS} onChange={setRegion} />
        <Select label="Населенный пункт" value={settlement} options={SETTLEMENTS} onChange={setSettlement} />
        <Alert>
          {status === 'lph'
            ? 'Для ЛПХ ИНН не обязателен. Остальные сведения похозяйственной книги заполните позже.'
            : 'ИНН нужен для отчетности КФХ / ИП. Остальные сведения заполните позже в данных хозяйства.'}
        </Alert>
        {banner ? <Alert tone="error">{banner}</Alert> : null}
        <Button title="Создать хозяйство" onPress={submit} loading={createFarm.pending} loadingTitle="Создаем…" testID="create-farm" />
      </View>
    </Screen>
  );
}
