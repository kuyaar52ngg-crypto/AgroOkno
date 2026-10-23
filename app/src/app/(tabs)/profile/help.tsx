import { useRouter } from 'expo-router';
import { ChevronDown, ChevronRight, ChevronUp, MessageCircle, Search } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { Colors, Radius } from '@/constants/theme';
import { useFaq } from '@/data';

/** F5 · Помощь. */
export default function HelpScreen() {
  const router = useRouter();
  const faq = useFaq();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>('faq-1');
  const q = query.trim().toLowerCase();
  const items = (faq.data ?? []).filter((i) => q === '' || i.question.toLowerCase().includes(q) || i.answer.toLowerCase().includes(q));

  return (
    <Screen
      title="Помощь"
      subtitle="Ответы на частые вопросы о хозяйстве"
      back={{ label: 'Профиль', fallback: '/profile' }}
      loading={faq.loading}
      fromCache={faq.fromCache}
    >
      <Input label="Поиск по вопросам" value={query} onChangeText={setQuery} placeholder="Например, как исправить событие" trailingIcon={Search} />
      <Text variant="title" accessibilityRole="header">
        Частые вопросы
      </Text>
      <View style={styles.card}>
        {items.map((item, index) => {
          const open = openId === item.id || (q !== '' && items.length === 1);
          return (
            <View key={item.id} style={[styles.item, index < items.length - 1 && styles.border]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={item.question}
                onPress={() => setOpenId(open ? null : item.id)}
                style={styles.question}
              >
                <Text variant="bodySemibold" style={{ flex: 1 }}>
                  {item.question}
                </Text>
                <Icon icon={open ? ChevronUp : ChevronRight} size={20} color={Colors.primary} />
              </Pressable>
              {open
                ? item.answer.split('\n\n').map((paragraph) => (
                    <Text key={paragraph} variant="caption" color={Colors.textSecondaryReadable} style={styles.answer}>
                      {paragraph}
                    </Text>
                  ))
                : null}
            </View>
          );
        })}
        {items.length === 0 ? (
          <Text variant="small" color={Colors.textSecondaryReadable} style={{ paddingVertical: 16 }}>
            По запросу ничего не найдено. Напишите в поддержку — мы поможем.
          </Text>
        ) : null}
      </View>
      <Button title="Написать в поддержку" icon={MessageCircle} onPress={() => router.push('/profile/support')} />
      <Alert>В обращении укажите раздел и опишите проблему. Не отправляйте пароли и лишние персональные данные.</Alert>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 16,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  item: { paddingVertical: 4, gap: 4 },
  border: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  question: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  answer: { lineHeight: 19, paddingBottom: 8 },
});

void ChevronDown;
