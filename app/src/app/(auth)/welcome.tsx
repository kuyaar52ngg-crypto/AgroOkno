import { useRouter } from 'expo-router';
import BookOpen from 'lucide-react-native/icons/book-open';
import CirclePlus from 'lucide-react-native/icons/circle-plus';
import FileText from 'lucide-react-native/icons/file-text';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Colors, Radius } from '@/constants/theme';

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: BookOpen, title: 'Все сведения вместе', text: 'Животные, участок и члены ЛПХ.' },
  { icon: CirclePlus, title: 'Один журнал учета', text: 'Надой, корма и урожай без повторного ввода.' },
  { icon: FileText, title: 'Отчеты под контролем', text: 'Сроки, проверка и квитанции в одном месте.' },
];

/** A1 · Добро пожаловать */
export default function WelcomeScreen() {
  const router = useRouter();
  return (
    <Screen header="brand" title="Добро пожаловать в АгроОкно" subtitle="Единый учет и отчетность вашего хозяйства" safeBottom>
      <View style={styles.hero}>
        <Text variant="h2" color={Colors.onPrimary} style={styles.heroTitle}>
          Один раз ввел — везде сдал
        </Text>
        <Text variant="small" color={Colors.onPrimary} style={styles.heroText}>
          Записывайте события хозяйства. Проверяйте подготовленные данные и подтверждайте отправку отчетов.
        </Text>
      </View>
      <View style={styles.features}>
        {FEATURES.map((item) => (
          <View key={item.title} style={styles.feature}>
            <Icon icon={item.icon} size={20} color={Colors.primary} />
            <View style={styles.flex}>
              <Text variant="label" style={{ fontSize: 13 }}>
                {item.title}
              </Text>
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                {item.text}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ gap: 12 }}>
        <Button title="Начать работу" onPress={() => router.push('/sign-in')} />
        <Button title="Создать аккаунт" variant="secondary" onPress={() => router.push('/sign-up')} />
      </View>
      <Alert>Демонстрационное хозяйство: Республика Саха (Якутия), с. Намцы. Новые сведения в макетах — учебные.</Alert>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  hero: { padding: 20, gap: 12, borderRadius: Radius.xl, backgroundColor: Colors.primary },
  heroTitle: { lineHeight: 30 },
  heroText: { lineHeight: 20, opacity: 0.92 },
  features: { padding: 16, gap: 14, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  feature: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
});
