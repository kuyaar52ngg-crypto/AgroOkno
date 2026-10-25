import ArrowRight from 'lucide-react-native/icons/arrow-right';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Tag } from '@/components/ui/Tag';
import type { TagTone } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { daysWord, fmtDateLong } from '@/constants/format';
import { Colors, Radius } from '@/constants/theme';
import type { ChatCard, DeadlineReminder } from '@/data/contract';

type DeadlineVariant = 'brief' | 'full';

const STATUS_TAG: Partial<Record<DeadlineReminder['status'], { label: string; tone: TagTone }>> = {
  draft: { label: 'Черновик', tone: 'warning' },
  not_started: { label: 'Не начат', tone: 'info' },
  overdue: { label: 'Просрочен', tone: 'error' },
  failed: { label: 'Не отправлен', tone: 'error' },
};

/** Напоминание о сроке отчета: J1 (brief) и J6 (full). */
export function DeadlineCard({ reminder, variant, onOpen }: { reminder: DeadlineReminder; variant: DeadlineVariant; onOpen: () => void }) {
  const overdue = reminder.days_left < 0;
  const late = Math.abs(reminder.days_left);
  const due = fmtDateLong(reminder.due_on);
  const tag = STATUS_TAG[overdue ? 'overdue' : reminder.status];

  if (overdue && variant === 'brief') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${reminder.title} просрочен на ${late} ${daysWord(late)}. Срок истек ${due}. Открыть отчет`}
        onPress={onOpen}
        style={styles.overdueStrip}
      >
        <Text variant="label" color={Colors.textErrorReadable}>
          {`${reminder.title} · просрочен на ${late} ${daysWord(late)}`}
        </Text>
        <Text variant="caption" color={Colors.textErrorReadable}>
          {`Срок истек ${due}`}
        </Text>
      </Pressable>
    );
  }

  const title =
    variant === 'brief' ? `До сдачи ${reminder.title}\nосталось ${reminder.days_left} ${daysWord(reminder.days_left)}` : reminder.title;
  const meta =
    variant === 'brief'
      ? `Срок: ${due}`
      : overdue
        ? `Срок истек ${due}`
        : `До ${due} · осталось ${reminder.days_left} ${daysWord(reminder.days_left)}`;
  const action = variant === 'brief' ? 'Открыть черновик' : overdue ? `Разобрать ${reminder.title}` : `Открыть ${reminder.title}`;
  const a11y = `${reminder.title}. ${meta}${overdue ? `. Просрочка ${late} ${daysWord(late)}` : ''}. ${action}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onOpen}
      style={[styles.card, overdue && { borderColor: Colors.error }]}
    >
      <View style={styles.cardHead}>
        <Text variant="subtitle" style={[styles.cardTitle, variant === 'brief' && { lineHeight: 24 }]}>
          {title}
        </Text>
        {tag ? <Tag label={tag.label} tone={tag.tone} /> : null}
      </View>
      <Text variant="small" color={overdue && variant === 'full' ? Colors.textErrorReadable : Colors.textSecondaryReadable}>
        {meta}
      </Text>
      {overdue && variant === 'full' ? (
        <Text variant="small" color={Colors.textErrorReadable}>
          {`Просрочка ${late} ${daysWord(late)}`}
        </Text>
      ) : null}
      <View style={styles.cardLink}>
        <Text variant="bodySemibold" color={Colors.primary} style={{ flex: 1 }}>
          {action}
        </Text>
        <Icon icon={ArrowRight} size={16} color={Colors.primary} />
      </View>
    </Pressable>
  );
}

/** J4 · карточка «Сохраненное событие». */
export function SavedEventCard({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <View style={styles.card} accessibilityLabel={`Сохраненное событие. ${rows.map((r) => `${r.label}: ${r.value}`).join('. ')}`}>
      <Text variant="bodySemibold">Сохраненное событие</Text>
      <View style={{ gap: 10 }}>
        {rows.map((row) => (
          <View key={row.label} style={styles.eventRow}>
            <Text variant="small" color={Colors.textSecondaryReadable}>
              {row.label}
            </Text>
            <Text variant="smallMedium" style={{ flexShrink: 1, textAlign: 'right' }}>
              {row.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** J6 · «Как подготовить отчет». */
export function HowToCard({ title, steps }: { title: string; steps: string[] }) {
  return (
    <View style={styles.howTo} accessibilityLabel={`${title}. ${steps.map((s, i) => `${i + 1}. ${s}`).join(' ')}`}>
      <Text variant="bodySemibold">{title}</Text>
      <View style={{ gap: 6 }}>
        {steps.map((step, index) => (
          <View key={step} style={{ flexDirection: 'row', gap: 10 }}>
            <Text variant="small" color={Colors.primary} style={{ width: 18, fontFamily: 'Onest_600SemiBold' }}>
              {`${index + 1}.`}
            </Text>
            <Text variant="small" style={{ flex: 1 }}>
              {step}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Выбор карточки по виду. */
export function ChatCardView({
  card,
  deadlineVariant,
  onOpenReport,
}: {
  card: ChatCard;
  deadlineVariant: DeadlineVariant;
  onOpenReport: (reminder: DeadlineReminder) => void;
}) {
  switch (card.kind) {
    case 'deadline':
      return <DeadlineCard reminder={card.reminder} variant={deadlineVariant} onOpen={() => onOpenReport(card.reminder)} />;
    case 'saved_event':
      return <SavedEventCard rows={card.rows} />;
    case 'how_to':
      return <HowToCard title={card.title} steps={card.steps} />;
  }
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 10,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardTitle: { flex: 1 },
  cardLink: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  overdueStrip: { padding: 14, gap: 4, borderRadius: 10, backgroundColor: Colors.surfaceError, minHeight: 44 },
  eventRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  howTo: { padding: 16, gap: 10, borderRadius: Radius.lg, backgroundColor: Colors.surfaceInfoSoft },
});
