import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { CheckBox } from '@/components/ui/Controls';
import { DateField } from '@/components/ui/DateField';
import { Alert } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { todayIso } from '@/constants/format';
import { RELATIONS } from '@/constants/labels';
import { Colors, Radius } from '@/constants/theme';
import { useAddHouseholdMember, useHousehold } from '@/data';

/** D2 · Добавить члена ЛПХ. */
export default function AddMemberScreen() {
  const router = useRouter();
  const household = useHousehold();
  const add = useAddHouseholdMember();
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [relation, setRelation] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const trimmed = name.trim();
  const errors = {
    name: trimmed.split(/\s+/).filter(Boolean).length < 2 ? 'Укажите фамилию и имя' : null,
    birth: !birth ? 'Выберите дату рождения' : birth > todayIso() ? 'Дата не может быть в будущем' : null,
    relation: relation ? null : 'Выберите отношение к главе ЛПХ',
    consent: consent ? null : 'Нужно подтвердить согласие на внесение сведений',
  };
  const valid = !errors.name && !errors.birth && !errors.relation && !errors.consent;
  const show = <K extends keyof typeof errors>(key: K) => (showErrors ? errors[key] : null);

  const members = household.data?.members ?? [];
  const names = members.map((m) => m.full_name.split(' ')[0]);
  const family = members[0]?.full_name.split(' ')[1] ?? '';
  const composition =
    names.length > 1
      ? `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}${family ? ` ${family}${family.endsWith('ов') ? 'ы' : ''}` : ''}`
      : names[0] ?? '';

  const save = async () => {
    setShowErrors(true);
    setSubmitError(null);
    if (!valid || !relation) return;
    try {
      await add.run({ full_name: trimmed, birth_date: birth, relation, consent, note: 'Член семьи главы хозяйства' });
      router.replace({ pathname: '/household', params: { tab: 'members' } });
    } catch {
      setSubmitError('Не удалось сохранить участника. Данные формы не потеряны — повторите попытку.');
    }
  };

  return (
    <Screen
      title="Добавить члена ЛПХ"
      subtitle={`${household.data?.farm.name ?? 'Хозяйство'}${household.data?.farm.book_record_no ? ` · запись № ${household.data.farm.book_record_no}` : ''}`}
      back={{ label: 'Члены ЛПХ', fallback: { pathname: '/household', params: { tab: 'members' } } }}
    >
      <View style={{ gap: 20 }}>
        <Input
          label="Фамилия, имя, отчество"
          value={name}
          onChangeText={setName}
          placeholder="Иванова Анна"
          autoCapitalize="words"
          autoComplete="name"
          hint="Учебный пример · отчество при наличии"
          error={show('name')}
        />
        <DateField label="Дата рождения" format="short" value={birth} onChange={setBirth} maxDate={todayIso()} hint="Учебная дата" error={show('birth')} />
        <Select
          label="Отношение к главе ЛПХ"
          value={relation}
          options={RELATIONS.map((r) => ({ value: r, label: r }))}
          onChange={setRelation}
          placeholder="Выберите"
          error={show('relation')}
        />
        <View style={[styles.consent, show('consent') ? { borderColor: Colors.error } : null]}>
          <CheckBox checked={consent} onChange={setConsent} label="Согласие на внесение сведений получено" />
          <Text variant="caption" color={Colors.textSecondaryReadable}>
            Вносите только сведения, необходимые для учета членов хозяйства.
          </Text>
          {show('consent') ? (
            <Text variant="caption" color={Colors.textErrorReadable}>
              {errors.consent}
            </Text>
          ) : null}
        </View>
      </View>
      <Alert>{`Новый участник еще не сохранен. В текущем составе хозяйства остаются ${composition}.`}</Alert>
      {submitError ? <Alert tone="error">{submitError}</Alert> : null}
      <View style={{ gap: 12 }}>
        <Button title="Сохранить" icon={Check} onPress={save} loading={add.pending} loadingTitle="Сохраняем…" />
        <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
          Демонстрационная форма · без паспортов и СНИЛС
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  consent: {
    padding: 16,
    gap: 8,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
});
