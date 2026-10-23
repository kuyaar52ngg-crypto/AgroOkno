import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, Download, MapPin, UserPlus, Users } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { herdRows } from '@/components/herd';
import type { HerdRow } from '@/components/herd';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Cards';
import { Counter, SegmentedTabs } from '@/components/ui/Controls';
import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { fmtDate, fmtHeads, fmtNum, plural, todayIso } from '@/constants/format';
import { defaultGroup } from '@/constants/labels';
import { Colors, Radius } from '@/constants/theme';
import { useHousehold } from '@/data';
import type { HouseholdMember } from '@/data/contract';

type TabKey = 'plot' | 'members' | 'herd';

const TABS: { value: TabKey; label: string }[] = [
  { value: 'plot', label: 'Участок' },
  { value: 'members', label: 'Члены ЛПХ' },
  { value: 'herd', label: 'Скот' },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function relationLine(member: HouseholdMember): string {
  return member.is_head ? member.relation : `Член ЛПХ · ${member.relation.toLowerCase()}`;
}

function memberNames(members: HouseholdMember[]): string {
  const first = members.map((m) => m.full_name.split(' ')[0]);
  const family = members[0]?.full_name.split(' ')[1]?.replace(/$/, '') ?? '';
  if (first.length === 0) return '';
  const list = first.length > 1 ? `${first.slice(0, -1).join(', ')} и ${first[first.length - 1]}` : first[0];
  return family ? `${list} ${family.endsWith('ов') ? `${family}ы` : family}` : list;
}

function HerdList({ rows, onAdjust }: { rows: HerdRow[]; onAdjust: (row: HerdRow, direction: 'plus' | 'minus') => void }) {
  return (
    <View style={styles.herd}>
      {rows.map((row, index) => (
        <View key={row.key} style={[styles.herdRow, index < rows.length - 1 && styles.herdBorder]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodySemibold">{row.label}</Text>
            <Text variant="caption" color={Colors.textSecondaryReadable}>
              {row.hint}
            </Text>
          </View>
          <Counter
            size="sm"
            value={row.heads}
            onChange={(value) => onAdjust(row, value > row.heads ? 'plus' : 'minus')}
            min={0}
            max={row.heads + 1}
            label={row.label}
            decrementLabel={`Падеж, забой или продажа: ${row.label}`}
            incrementLabel={`Приплод или покупка: ${row.label}`}
          />
        </View>
      ))}
    </View>
  );
}

/** Мое ЛПХ: вкладки «Участок» (46:4954), «Члены ЛПХ» (D1), «Скот» (D3). */
export default function HouseholdScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const tab: TabKey = params.tab === 'members' || params.tab === 'herd' ? params.tab : 'plot';
  const household = useHousehold();
  const data = household.data;
  const farm = data?.farm;
  const rows = herdRows(data?.livestock);
  const total = data?.livestock.total ?? 0;
  const setTab = (value: TabKey) => router.setParams({ tab: value });
  const adjust = (row: HerdRow, direction: 'plus' | 'minus') =>
    router.navigate({
      pathname: '/add',
      params: {
        kind: direction === 'plus' ? 'birth' : 'death',
        group: direction === 'plus' ? defaultGroup(row.species, 'birth') : row.group,
        from: 'journal',
      },
    });
  const extract = () => router.push('/household/extract');

  return (
    <Screen
      title="Мое ЛПХ"
      subtitle={farm?.book_record_no ? `Похозяйственная книга · запись № ${farm.book_record_no}` : 'Похозяйственная книга'}
      back={{ label: 'Мое хозяйство', fallback: '/' }}
      loading={household.loading}
      fromCache={household.fromCache}
      onRefresh={household.refetch}
    >
      <SegmentedTabs options={TABS} value={tab} onChange={setTab} />

      {data && farm && tab === 'plot' ? (
        <>
          <View style={styles.plot}>
            <View style={styles.plotHead}>
              <Icon icon={MapPin} size={20} color={Colors.primary} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="label">{[farm.settlement, farm.region].filter(Boolean).join(', ')}</Text>
                <Text variant="caption" color={Colors.textSecondaryReadable}>
                  {[farm.address, farm.name].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
            <View style={styles.plotRow}>
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                Кадастровый номер
              </Text>
              <Text variant="label" style={{ flex: 1 }} align="right">
                {farm.cadastral_no ?? '—'}
              </Text>
              {farm.plot_area_m2 !== null ? (
                <Text variant="caption" color={Colors.textSecondaryReadable}>{`${fmtNum(farm.plot_area_m2)} кв.м`}</Text>
              ) : null}
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Члены ЛПХ, ${data.members.length} ${plural(data.members.length, ['человек', 'человека', 'человек'])}`}
            onPress={() => setTab('members')}
            style={styles.membersLink}
          >
            <View style={styles.avatarBox}>
              <Icon icon={Users} size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label">{`Члены ЛПХ · ${data.members.length} ${plural(data.members.length, ['человек', 'человека', 'человек'])}`}</Text>
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                {memberNames(data.members)}
              </Text>
            </View>
            <Icon icon={ChevronRight} size={20} color={Colors.primary} />
          </Pressable>
          <View style={{ gap: 16 }}>
            <View style={styles.sectionHead}>
              <Text variant="title" accessibilityRole="header">
                Скот
              </Text>
              <Text variant="caption" color={Colors.textSecondaryReadable}>{`${fmtHeads(total)} всего`}</Text>
            </View>
            <HerdList rows={rows} onAdjust={adjust} />
            <Text variant="caption" color={Colors.textSecondaryReadable}>
              Изменения поголовья попадут в отчеты. Приплод и выбытие фиксируйте как новое событие.
            </Text>
          </View>
          <View style={{ gap: 12 }}>
            <Button title="Выписка из книги" icon={Download} onPress={extract} />
            <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
              {`PDF · актуальные сведения на ${fmtDate(todayIso())}`}
            </Text>
          </View>
        </>
      ) : null}

      {data && tab === 'members' ? (
        <>
          <Text variant="title" accessibilityRole="header">
            {`Члены ЛПХ · ${data.members.length} ${plural(data.members.length, ['человек', 'человека', 'человек'])}`}
          </Text>
          <View style={{ gap: 12 }}>
            {data.members.map((member) => (
              <Card key={member.id}>
                <View style={styles.member}>
                  <View style={styles.avatarBox}>
                    <Text variant="label" color={Colors.primary}>
                      {initials(member.full_name)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text variant="bodySemibold">{member.full_name}</Text>
                    <Text variant="caption" color={Colors.primary}>
                      {relationLine(member)}
                    </Text>
                    {member.note ? (
                      <Text variant="caption" color={Colors.textSecondaryReadable}>
                        {member.note}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Card>
            ))}
          </View>
          <Button title="Добавить члена" icon={UserPlus} onPress={() => router.push('/household/add-member')} />
          <Alert>Родственные отношения показаны как учебные сведения. Паспорт и СНИЛС для этого макета не требуются.</Alert>
          <Button title="Выписка из книги" icon={Download} variant="secondary" onPress={extract} />
        </>
      ) : null}

      {data && tab === 'herd' ? (
        <>
          <View style={styles.sectionHead}>
            <Text variant="title" accessibilityRole="header">
              Скот
            </Text>
            <Text variant="caption" color={Colors.textSecondaryReadable}>{`${fmtHeads(total)} всего`}</Text>
          </View>
          <HerdList rows={rows} onAdjust={adjust} />
          <Alert>
            Нажатие + или − открывает событие учета. Поголовье изменится после его сохранения; события попадут в данные отчетов.
          </Alert>
          <View style={{ gap: 12 }}>
            <Button title="Выписка из книги" icon={Download} onPress={extract} />
            <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
              {`PDF · актуальные сведения на ${fmtDate(todayIso())}`}
            </Text>
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  plot: {
    padding: 16,
    gap: 14,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  plotHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  plotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  membersLink: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  avatarBox: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.surfaceInfoSoft, alignItems: 'center', justifyContent: 'center' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  herd: {
    paddingHorizontal: 16,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  herdRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  herdBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  member: { flexDirection: 'row', gap: 12, alignItems: 'center' },
});
