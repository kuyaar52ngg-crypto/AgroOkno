import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { Colors, Radius } from '@/constants/theme';
import { useFindFarm, useRequestAccess } from '@/data';
import type { FarmLookup } from '@/data/contract';

/** R7 · Запросить доступ */
export default function JoinFarmScreen() {
  const router = useRouter();
  const find = useFindFarm();
  const request = useRequestAccess();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<FarmLookup | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [searching, setSearching] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const seq = useRef(0);
  const findRun = find.run;

  const search = async (value: string) => {
    const current = ++seq.current;
    setSearching(true);
    try {
      const result = await findRun({ code_or_inn: value.trim() });
      if (current !== seq.current) return;
      setFound(result);
      setNotFound(result === null);
    } catch {
      if (current !== seq.current) return;
      setFound(null);
      setBanner('Не удалось выполнить поиск. Проверьте подключение и попробуйте еще раз.');
    } finally {
      if (current === seq.current) setSearching(false);
    }
  };

  // Поиск запускается сам, когда код или ИНН набраны целиком.
  useEffect(() => {
    const value = query.trim();
    if (value.length < 9) return undefined;
    const timer = setTimeout(() => {
      void search(value);
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const onChange = (value: string) => {
    seq.current += 1;
    setQuery(value);
    setFound(null);
    setNotFound(false);
    setBanner(null);
    setSearching(false);
  };

  const submit = async () => {
    if (!found) return;
    setBanner(null);
    try {
      await request.run({ farm_id: found.farm_id });
      router.replace('/join-sent');
    } catch (e) {
      setBanner(e instanceof Error && e.message ? e.message : 'Не удалось отправить запрос. Попробуйте еще раз.');
    }
  };

  return (
    <Screen
      header="brand"
      back={{ label: 'Ваше хозяйство', fallback: '/choose-farm' }}
      title="Запросить доступ"
      subtitle="Найдите хозяйство, к которому хотите присоединиться"
      safeBottom
    >
      <Input
        label="Код приглашения или ИНН хозяйства"
        value={query}
        onChangeText={onChange}
        placeholder="AGRO-0142"
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={() => query.trim() && search(query)}
        error={notFound ? 'Хозяйство не найдено. Проверьте код приглашения или ИНН.' : null}
        hint={searching ? 'Ищем хозяйство…' : undefined}
        testID="join-query"
      />
      {found ? (
        <View style={styles.card} accessibilityLiveRegion="polite">
          <Text variant="caption" color={Colors.textSecondaryReadable}>
            Найдено хозяйство
          </Text>
          <Text variant="bodySemibold">{`${found.name}${found.settlement ? ` · ${found.settlement}` : ''}`}</Text>
          {found.region ? (
            <Text variant="caption" color={Colors.textSecondaryReadable}>
              {found.region}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Alert>Доступ откроется после подтверждения владельца или уполномоченного специалиста.</Alert>
      {banner ? <Alert tone="error">{banner}</Alert> : null}
      <View style={{ gap: 12 }}>
        <Button title="Запросить доступ" onPress={submit} disabled={!found} loading={request.pending} loadingTitle="Отправляем…" />
        <Button
          title="Вернуться"
          variant="secondary"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/choose-farm'))}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 8,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
});
