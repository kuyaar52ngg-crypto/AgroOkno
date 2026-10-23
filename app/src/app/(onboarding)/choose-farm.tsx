import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { RadioCard } from '@/components/ui/Controls';
import { Alert } from '@/components/ui/Feedback';

type Choice = 'create' | 'join';

/** R4 · Ваше хозяйство */
export default function ChooseFarmScreen() {
  const router = useRouter();
  const [choice, setChoice] = useState<Choice>('create');

  return (
    <Screen
      header="brand"
      back={{ label: 'Выбор роли', fallback: '/role', onPress: () => router.replace('/role') }}
      title="Ваше хозяйство"
      subtitle="Подключите хозяйство, чтобы вести его книгу и записывать события."
      safeBottom
    >
      <View style={{ gap: 12 }} accessibilityRole="radiogroup">
        <RadioCard
          selected={choice === 'create'}
          onSelect={() => setChoice('create')}
          title="Создать хозяйство"
          description="Начните свою запись. Основные сведения можно заполнить за один шаг."
        />
        <RadioCard
          selected={choice === 'join'}
          onSelect={() => setChoice('join')}
          title="Присоединиться к существующему"
          description="Найдите хозяйство по приглашению или ИНН и запросите доступ."
        />
      </View>
      <Alert>Доступ к существующему хозяйству откроется только после подтверждения запроса.</Alert>
      <Button title="Продолжить" onPress={() => router.push(choice === 'create' ? '/new-farm' : '/join-farm')} />
    </Screen>
  );
}
