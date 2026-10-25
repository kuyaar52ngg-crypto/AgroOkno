import { useRouter } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import ExternalLink from 'lucide-react-native/icons/external-link';
import FileCheck from 'lucide-react-native/icons/file-check';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Search from 'lucide-react-native/icons/search';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { SegmentedTabs } from '@/components/ui/Controls';
import { Alert, Badge } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { fmtDate, fmtDateOfTime, fmtNum, fmtTime } from '@/constants/format';
import { Colors, Radius } from '@/constants/theme';
import { useMercury, useMercuryConnect, useMercuryRefresh } from '@/data';
import type { MercuryDocument } from '@/data/contract';

type Filter = 'all' | 'issued' | 'redeemed';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'issued', label: 'Оформлены' },
  { value: 'redeemed', label: 'Погашены' },
];

const STEPS = [
  '1. Перейдите на защищенную страницу провайдера.',
  '2. Войдите и проверьте запрашиваемый доступ.',
  '3. Подтвердите и вернитесь в АгроОкно.',
];

function docStatusLine(doc: MercuryDocument): string {
  return `${doc.status === 'redeemed' ? 'Погашен' : 'Оформлен'} · ${fmtDate(doc.issued_on)} · учебный`;
}

/** E1 · Меркурий — подключение, E2 · Меркурий — документы. */
export default function MercuryScreen() {
  const router = useRouter();
  const mercury = useMercury();
  const connect = useMercuryConnect();
  const refresh = useMercuryRefresh();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const connected = mercury.data?.connection.status === 'connected_demo';
  const syncedAt = mercury.data?.connection.synced_at ?? null;
  const q = query.trim().toLowerCase();
  const docs = (mercury.data?.documents ?? [])
    .filter((d) => filter === 'all' || d.status === filter)
    .filter((d) => q === '' || d.number.toLowerCase().includes(q) || d.product.toLowerCase().includes(q));

  const runConnect = async () => {
    setError(null);
    try {
      await connect.run();
    } catch {
      setError('Не удалось подключить Меркурий. Повторите попытку позже.');
    }
  };
  const runRefresh = async () => {
    setError(null);
    try {
      await refresh.run();
    } catch {
      setError('Не удалось обновить документы. Повторите попытку позже.');
    }
  };

  return (
    <Screen
      title="ВетИС Меркурий"
      subtitle={connected ? 'Документы · демонстрационное подключение' : 'Ветеринарные документы хозяйства'}
      back={{ label: 'Мое хозяйство', fallback: '/' }}
      loading={mercury.loading}
      fromCache={mercury.fromCache}
    >
      {mercury.data && !connected ? (
        <>
          <View style={styles.card}>
            <View style={styles.topRow}>
              <Icon icon={ShieldCheck} size={28} color={Colors.primary} />
              <Badge tone="neutral" label="Не подключено" />
            </View>
            <Text variant="label">Документы в одном разделе</Text>
            <Text variant="small" color={Colors.textSecondaryReadable} style={{ lineHeight: 21 }}>
              Подключите учетную запись провайдера, чтобы просматривать доступные ветеринарные документы.
            </Text>
          </View>
          <View style={styles.card}>
            <Text variant="bodyLg" style={{ fontFamily: 'Onest_600SemiBold' }}>
              Как подключить
            </Text>
            {STEPS.map((step) => (
              <Text key={step} variant="small">
                {step}
              </Text>
            ))}
          </View>
          <Alert>Не вводите пароль Меркурия или ключи API в АгроОкно. Авторизация проходит на стороне провайдера.</Alert>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button title="Подключить Меркурий" icon={ExternalLink} onPress={runConnect} loading={connect.pending} loadingTitle="Подключаем…" />
          <Pressable accessibilityRole="button" onPress={() => router.push('/profile/help')} style={styles.helpRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodySemibold">Помощь с подключением</Text>
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                Что подготовить и какие права проверить
              </Text>
            </View>
            <Icon icon={ChevronRight} size={20} color={Colors.primary} />
          </Pressable>
          <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
            Демонстрационный сценарий интеграции. Реальное подключение в макете не выполняется.
          </Text>
        </>
      ) : null}

      {mercury.data && connected ? (
        <>
          <View style={styles.card}>
            <Badge tone="success" label="Подключено · демо" />
            <Text variant="caption" color={Colors.textSecondaryReadable}>
              {`Синхронизация: ${fmtDateOfTime(syncedAt)} в ${fmtTime(syncedAt)}`}
            </Text>
          </View>
          <Input label="Поиск документов" value={query} onChangeText={setQuery} placeholder="Номер или продукция" trailingIcon={Search} autoCapitalize="none" />
          <SegmentedTabs options={FILTERS} value={filter} onChange={setFilter} />
          <View style={{ gap: 12 }}>
            {docs.map((doc) => (
              <Pressable
                key={doc.id}
                accessibilityRole="button"
                accessibilityLabel={`${doc.number}. ${doc.product}, ${fmtNum(doc.quantity)} ${doc.unit}. ${docStatusLine(doc)}`}
                onPress={() => router.push({ pathname: '/mercury/[id]', params: { id: doc.id } })}
                style={styles.doc}
              >
                <Icon icon={FileCheck} size={24} color={Colors.primary} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="bodySemibold">{doc.number}</Text>
                  <Text variant="small">{`${doc.product} · ${fmtNum(doc.quantity)} ${doc.unit}`}</Text>
                  <Text variant="caption" color={Colors.textSecondaryReadable}>
                    {docStatusLine(doc)}
                  </Text>
                </View>
                <Icon icon={ChevronRight} size={20} color={Colors.primary} />
              </Pressable>
            ))}
            {docs.length === 0 ? (
              <Text variant="small" color={Colors.textSecondaryReadable} align="center">
                Документы не найдены. Измените запрос или фильтр.
              </Text>
            ) : null}
          </View>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button title="Обновить документы" icon={RefreshCw} onPress={runRefresh} loading={refresh.pending} loadingTitle="Обновляем…" />
          <Alert>Учебные документы и время синхронизации. Статусы иллюстрируют интерфейс, а не реальные ветеринарные операции.</Alert>
        </>
      ) : null}
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
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  helpRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 12,
  },
  doc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
});
