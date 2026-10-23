import { useLocalSearchParams, useRouter } from 'expo-router';
import { ExternalLink } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/Cards';
import { Alert, Badge } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { fmtDate, fmtNum } from '@/constants/format';
import { Colors, Radius } from '@/constants/theme';
import { useMercuryDocument } from '@/data';

/** E3 · Ветеринарный документ. */
export default function MercuryDocumentScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useMercuryDocument(id);
  const doc = query.data;
  const [info, setInfo] = useState(false);
  const back = { label: 'Документы Меркурия', fallback: '/mercury' } as const;

  if (!query.loading && !doc) {
    return (
      <Screen title="Документ не найден" back={back}>
        <Alert tone="warning">Документ недоступен. Вернитесь к списку и обновите его.</Alert>
        <Button title="К документам" onPress={() => router.navigate('/mercury')} />
      </Screen>
    );
  }

  return (
    <Screen title="Ветеринарный документ" subtitle={doc ? `Учебное превью · ${doc.number}` : undefined} back={back} loading={query.loading}>
      {doc ? (
        <>
          <View style={styles.card}>
            <Badge tone={doc.status === 'issued' ? 'success' : 'neutral'} label={doc.status === 'issued' ? 'Оформлен · учебный' : 'Погашен · учебный'} />
            <Text variant="subtitle">{doc.number}</Text>
            <Text variant="caption" color={Colors.textSecondaryReadable}>
              {`Дата документа: ${fmtDate(doc.issued_on)}`}
            </Text>
          </View>
          <DataTable
            title="Продукция"
            rows={[
              { label: 'Наименование', value: doc.product },
              { label: 'Количество', value: `${fmtNum(doc.quantity)} ${doc.unit}` },
              ...(doc.produced_on ? [{ label: 'Дата производства', value: fmtDate(doc.produced_on) }] : []),
            ]}
          />
          <View style={styles.card}>
            <View style={{ gap: 4 }}>
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                Отправитель
              </Text>
              <Text variant="label">{doc.sender}</Text>
            </View>
            <View style={{ gap: 4 }}>
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                Получатель
              </Text>
              <Text variant="label">{doc.recipient}</Text>
            </View>
          </View>
          <Alert>
            Отдельный учебный документ. Запись надоя сама не создает ветеринарную транзакцию. Юридическое подтверждение операции не представлено.
          </Alert>
          {info ? <Alert tone="warning">В демонстрации внешний переход в Меркурий не выполняется.</Alert> : null}
          <View style={{ gap: 12 }}>
            <Button title="Открыть в Меркурии" icon={ExternalLink} onPress={() => setInfo(true)} />
            <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
              Внешний переход показан как действие макета
            </Text>
          </View>
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
});
