import { CirclePlus } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Tag } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { Colors, Radius } from '@/constants/theme';
import { useAuth } from '@/data';
import type { LegalStatus } from '@/data/contract';
import { useOnboarding } from '@/hooks/onboarding';

const LEGAL_LABEL: Record<LegalStatus, string> = { lph: 'ЛПХ', kfh: 'КФХ', ip: 'ИП' };

/** R6 · Хозяйство создано */
export default function FarmCreatedScreen() {
  const auth = useAuth();
  const onboarding = useOnboarding();
  const farm = auth.farm;

  const finish = (addEvent: boolean) => {
    if (addEvent) onboarding.setNextRoute('/add');
    onboarding.setHoldOnboarding(false);
  };

  return (
    <Screen
      header="brand"
      back={{ label: 'Ваше хозяйство', fallback: '/choose-farm', onPress: () => finish(false) }}
      title="Хозяйство создано"
      subtitle="Можно начинать вести учет"
      safeBottom
    >
      <View style={styles.card}>
        <Tag label={farm ? LEGAL_LABEL[farm.legal_status] : 'ЛПХ'} />
        <Text variant="subtitle">{farm?.name ?? 'Новое хозяйство'}</Text>
        <View style={{ gap: 2 }}>
          <Text variant="caption" color={Colors.textSecondaryReadable}>
            Регион
          </Text>
          <Text variant="bodySemibold">{farm?.region ?? 'Республика Саха (Якутия)'}</Text>
        </View>
        <View style={{ gap: 2 }}>
          <Text variant="caption" color={Colors.textSecondaryReadable}>
            Населенный пункт
          </Text>
          <Text variant="bodySemibold">{farm?.settlement ?? ''}</Text>
        </View>
      </View>
      <Alert>Начните с первого события. Остальные сведения книги можно добавить в данных хозяйства.</Alert>
      <View style={{ gap: 12 }}>
        <Button title="Добавить первое событие" icon={CirclePlus} onPress={() => finish(true)} />
        <Button title="Открыть хозяйство" variant="secondary" onPress={() => finish(false)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 12,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
});
