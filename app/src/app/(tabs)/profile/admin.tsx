import { useRouter } from 'expo-router';
import ArrowDown from 'lucide-react-native/icons/arrow-down';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import Check from 'lucide-react-native/icons/check';
import Plus from 'lucide-react-native/icons/plus';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { SegmentedTabs } from '@/components/ui/Controls';
import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Tag } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { fmtDateTime, plural } from '@/constants/format';
import { Colors, Radius } from '@/constants/theme';
import { useAssistantModelOptions, useAssistantModelSettings, useIsAdmin, useUpdateAssistantModelSettings } from '@/data';
import type { AssistantModelOption } from '@/data/contract';

type ModelFilter = 'all' | 'free';

const FILTERS: { value: ModelFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'free', label: 'Бесплатные' },
];

const MAX_FALLBACKS = 3;
const PAGE = 20;
const MODEL_WORD: [string, string, string] = ['модель', 'модели', 'моделей'];

interface Draft {
  model: string;
  fallbacks: string[];
}

/** 200000 → «200 тыс. токенов», 1048576 → «1 млн токенов». */
function fmtContext(tokens: number | null): string {
  if (!tokens) return '';
  if (tokens >= 1_000_000) return `${String(Math.round(tokens / 100_000) / 10).replace('.', ',')} млн токенов`;
  return `${Math.round(tokens / 1000)} тыс. токенов`;
}

function fmtOrder(ids: string[], nameOf: (id: string) => string): string {
  return ids.map(nameOf).join(' → ');
}

function InfoBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.info}>
      <Text variant="caption" color={Colors.textSecondaryReadable}>
        {label}
      </Text>
      {children}
    </View>
  );
}

interface ModelRowProps {
  option: AssistantModelOption;
  isPrimary: boolean;
  /** Позиция среди запасных (с 0) или -1. */
  fallbackIndex: number;
  canAddFallback: boolean;
  onPrimary: () => void;
  onFallback: () => void;
}

function ModelRow({ option, isPrimary, fallbackIndex, canAddFallback, onPrimary, onFallback }: ModelRowProps) {
  const isFallback = fallbackIndex >= 0;
  const context = fmtContext(option.context_length);
  const blocked = !isFallback && !canAddFallback;
  return (
    <View style={[styles.model, isPrimary && styles.modelPrimary]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: isPrimary }}
        accessibilityLabel={`${option.name}${option.free ? ', бесплатная' : ''}. Сделать основной`}
        onPress={onPrimary}
        style={styles.modelHead}
      >
        <View style={[styles.radio, { borderColor: isPrimary ? Colors.primary : Colors.borderControl }]}>{isPrimary ? <View style={styles.radioDot} /> : null}</View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="bodySemibold">{option.name}</Text>
          <Text variant="caption" color={Colors.textSecondaryReadable} style={{ flexShrink: 1 }}>
            {option.id}
          </Text>
          <View style={styles.tags}>
            {option.free ? <Tag label="Бесплатно" tone="success" /> : null}
            {isPrimary ? <Tag label="Основная" tone="info" /> : null}
            {context ? (
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                {context}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
      {isPrimary ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isFallback ? `Убрать из запасных: ${option.name}` : `Добавить в запасные: ${option.name}`}
          accessibilityState={{ disabled: blocked }}
          disabled={blocked}
          onPress={onFallback}
          style={[styles.fallbackBtn, isFallback && styles.fallbackBtnOn, blocked && { opacity: 0.5 }]}
        >
          <Icon icon={isFallback ? Check : Plus} size={18} color={Colors.primary} />
          <Text variant="label" color={Colors.primary}>
            {isFallback ? `Запасная ${fallbackIndex + 1} · убрать` : blocked ? `Запасных уже ${MAX_FALLBACKS}` : 'В запасные'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** Админ-панель: модель помощника для всех пользователей (OpenRouter). Только для администраторов. */
export default function AdminModelScreen() {
  const router = useRouter();
  const admin = useIsAdmin();
  const settings = useAssistantModelSettings();
  const options = useAssistantModelOptions();
  const update = useUpdateAssistantModelSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ModelFilter>('all');
  const [shown, setShown] = useState(PAGE);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = admin.data === true;
  const stored = settings.data;
  const list = options.data ?? [];
  const nameOf = (id: string) => list.find((o) => o.id === id)?.name ?? id;
  const current: Draft | null = draft ?? (stored ? { model: stored.model, fallbacks: stored.fallback_models } : null);
  const dirty = draft !== null && stored !== undefined && (draft.model !== stored.model || draft.fallbacks.join('|') !== stored.fallback_models.join('|'));

  const q = query.trim().toLowerCase();
  const filtered = list
    .filter((o) => filter === 'all' || o.free)
    .filter((o) => q === '' || o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q));
  const visible = filtered.slice(0, shown);

  const edit = (next: Draft) => {
    setSaved(false);
    setError(null);
    setDraft(next);
  };
  const selectPrimary = (id: string) => {
    if (!current || current.model === id) return;
    edit({ model: id, fallbacks: current.fallbacks.filter((f) => f !== id) });
  };
  const toggleFallback = (id: string) => {
    if (!current || current.model === id) return;
    if (current.fallbacks.includes(id)) edit({ ...current, fallbacks: current.fallbacks.filter((f) => f !== id) });
    else if (current.fallbacks.length < MAX_FALLBACKS) edit({ ...current, fallbacks: [...current.fallbacks, id] });
  };
  const moveFallback = (index: number, delta: -1 | 1) => {
    if (!current) return;
    const target = index + delta;
    if (target < 0 || target >= current.fallbacks.length) return;
    const next = [...current.fallbacks];
    [next[index], next[target]] = [next[target], next[index]];
    edit({ ...current, fallbacks: next });
  };
  const reset = () => {
    setDraft(null);
    setError(null);
    setSaved(false);
  };
  const changeFilter = (value: ModelFilter) => {
    setFilter(value);
    setShown(PAGE);
  };
  const changeQuery = (value: string) => {
    setQuery(value);
    setShown(PAGE);
  };

  const save = async () => {
    if (!current) return;
    setError(null);
    try {
      await update.run({ model: current.model, fallback_models: current.fallbacks });
    } catch (e) {
      setError(e instanceof Error && /[А-Яа-яЁё]/.test(e.message) ? e.message : 'Не удалось сохранить настройки. Повторите попытку позже.');
      return;
    }
    try {
      await settings.refetch();
    } catch {
      // настройка уже сохранена; список обновится при следующем открытии
    }
    setDraft(null);
    setConfirm(false);
    setSaved(true);
  };

  const refetchAll = async () => {
    await Promise.all([admin.refetch(), settings.refetch(), options.refetch()]);
  };

  const loading = admin.loading || (isAdmin && (settings.loading || options.loading));

  return (
    <Screen
      title="Модель помощника"
      subtitle="Настройка ИИ-помощника для всех пользователей"
      back={{ label: 'Профиль', fallback: '/profile' }}
      loading={loading}
      fromCache={settings.fromCache}
      onRefresh={isAdmin ? refetchAll : undefined}
      footer={
        isAdmin && dirty ? (
          <Button title="Сохранить для всех пользователей" onPress={() => setConfirm(true)} testID="admin-model-save" />
        ) : isAdmin && saved ? (
          <Alert tone="success" title="Сохранено">
            Новая модель действует для всех пользователей. Изменение применится к следующим сообщениям помощника.
          </Alert>
        ) : undefined
      }
    >
      {!admin.loading && !isAdmin ? (
        <>
          <Alert tone="error" title="Нет доступа">
            Раздел доступен только администраторам. Если права должны быть у вас, проверьте, что вы вошли под почтой администратора, и подключитесь к сети.
          </Alert>
          <Button title="В профиль" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
        </>
      ) : null}

      {isAdmin ? (
        <>
          <Alert tone="warning" title="Изменение действует на всех пользователей">
            Выбранная модель будет отвечать всем пользователям АгроОкно. Бесплатные модели могут работать нестабильно: отвечать медленно или быть недоступными, поэтому добавьте запасные.
          </Alert>

          {!settings.loading && !stored ? (
            <>
              <Alert tone="error">Не удалось загрузить текущую настройку модели. Проверьте подключение и повторите попытку.</Alert>
              <Button title="Повторить" variant="secondary" onPress={() => settings.refetch()} />
            </>
          ) : null}

          {stored ? (
            <View style={styles.card}>
              <Text variant="bodyLg" style={{ fontFamily: 'Onest_600SemiBold' }} accessibilityRole="header">
                Сейчас используется
              </Text>
              <InfoBlock label="Основная модель">
                <Text variant="bodySemibold">{nameOf(stored.model)}</Text>
                <Text variant="caption" color={Colors.textSecondaryReadable}>
                  {stored.model}
                </Text>
              </InfoBlock>
              <InfoBlock label="Запасные модели">
                {stored.fallback_models.length === 0 ? (
                  <Text variant="small">Не выбраны</Text>
                ) : (
                  stored.fallback_models.map((id, i) => (
                    <Text key={id} variant="small">{`${i + 1}. ${nameOf(id)}`}</Text>
                  ))
                )}
              </InfoBlock>
              <InfoBlock label="Кто и когда изменил">
                <Text variant="small">
                  {stored.updated_at || stored.updated_by
                    ? [stored.updated_by, fmtDateTime(stored.updated_at)].filter(Boolean).join(' · ')
                    : 'Значение по умолчанию, еще не менялось'}
                </Text>
              </InfoBlock>
            </View>
          ) : null}

          {current ? (
            <View style={[styles.card, dirty && { borderColor: Colors.primary }]}>
              <View style={styles.cardHead}>
                <Text variant="bodyLg" style={{ fontFamily: 'Onest_600SemiBold', flexShrink: 1 }} accessibilityRole="header">
                  Ваш выбор
                </Text>
                {dirty ? <Tag label="Есть изменения" tone="warning" /> : null}
              </View>
              <InfoBlock label="Основная модель">
                <Text variant="bodySemibold">{nameOf(current.model)}</Text>
                <Text variant="caption" color={Colors.textSecondaryReadable}>
                  {current.model}
                </Text>
              </InfoBlock>
              <InfoBlock label={`Запасные модели · ${current.fallbacks.length} из ${MAX_FALLBACKS}, по порядку`}>
                {current.fallbacks.length === 0 ? (
                  <Text variant="small" color={Colors.textSecondaryReadable}>
                    Не выбраны. Если основная модель недоступна, помощник ответит по простым правилам. Добавьте запасные из списка ниже.
                  </Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    {current.fallbacks.map((id, i) => (
                      <View key={id} style={styles.fallbackItem}>
                        <View style={styles.order}>
                          <Text variant="label" color={Colors.primary}>
                            {i + 1}
                          </Text>
                        </View>
                        <Text variant="small" style={styles.fallbackName}>
                          {nameOf(id)}
                        </Text>
                        <IconButton icon={ArrowUp} size={44} accessibilityLabel={`Выше: ${nameOf(id)}`} disabled={i === 0} onPress={() => moveFallback(i, -1)} />
                        <IconButton
                          icon={ArrowDown}
                          size={44}
                          accessibilityLabel={`Ниже: ${nameOf(id)}`}
                          disabled={i === current.fallbacks.length - 1}
                          onPress={() => moveFallback(i, 1)}
                        />
                        <IconButton icon={X} size={44} accessibilityLabel={`Убрать из запасных: ${nameOf(id)}`} onPress={() => toggleFallback(id)} />
                      </View>
                    ))}
                  </View>
                )}
              </InfoBlock>
              {dirty ? <Button title="Сбросить изменения" variant="secondary" compact onPress={reset} /> : null}
            </View>
          ) : null}

          {error && !confirm ? <Alert tone="error">{error}</Alert> : null}

          <View style={{ gap: 12 }}>
            <Text variant="title" accessibilityRole="header">
              Модели OpenRouter
            </Text>
            <Text variant="caption" color={Colors.textSecondaryReadable}>
              Только модели с поддержкой вызова инструментов. Радио слева делает модель основной, кнопка под ней добавляет в запасные.
            </Text>
            <Input label="Поиск модели" value={query} onChangeText={changeQuery} placeholder="Название или идентификатор" trailingIcon={Search} autoCapitalize="none" autoCorrect={false} />
            <SegmentedTabs options={FILTERS} value={filter} onChange={changeFilter} />
            {options.loading ? null : !options.data ? (
              <>
                <Alert tone="error">Не удалось загрузить список моделей OpenRouter. Проверьте подключение и повторите попытку.</Alert>
                <Button title="Повторить" variant="secondary" onPress={() => options.refetch()} />
              </>
            ) : (
              <View style={{ gap: 12 }} accessibilityRole="radiogroup" accessibilityLabel="Основная модель">
                {visible.map((option) => (
                  <ModelRow
                    key={option.id}
                    option={option}
                    isPrimary={current?.model === option.id}
                    fallbackIndex={current ? current.fallbacks.indexOf(option.id) : -1}
                    canAddFallback={(current?.fallbacks.length ?? 0) < MAX_FALLBACKS}
                    onPrimary={() => selectPrimary(option.id)}
                    onFallback={() => toggleFallback(option.id)}
                  />
                ))}
                {filtered.length === 0 ? (
                  <Text variant="small" color={Colors.textSecondaryReadable} align="center">
                    Модели не найдены. Измените запрос или фильтр.
                  </Text>
                ) : null}
                {filtered.length > visible.length ? (
                  <Button title={`Показать еще (${filtered.length - visible.length})`} variant="secondary" compact onPress={() => setShown((n) => n + PAGE)} />
                ) : null}
                {filtered.length > 0 ? (
                  <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
                    {`Найдено: ${filtered.length} ${plural(filtered.length, MODEL_WORD)}`}
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        </>
      ) : null}

      <Sheet visible={confirm} title="Сохранить для всех пользователей?" onClose={() => (update.pending ? undefined : setConfirm(false))}>
        <View style={{ gap: 12, paddingHorizontal: 8, paddingBottom: 8 }}>
          <Text variant="small" style={{ lineHeight: 22 }}>
            {`Помощник у всех пользователей будет работать на модели «${current ? nameOf(current.model) : ''}».`}
          </Text>
          <Text variant="small" color={Colors.textSecondaryReadable} style={{ lineHeight: 22 }}>
            {current && current.fallbacks.length > 0 ? `Запасные по порядку: ${fmtOrder(current.fallbacks, nameOf)}.` : 'Запасные модели не выбраны.'}
          </Text>
          <Alert tone="warning">Изменение вступит в силу сразу для всех. Вернуть прежний выбор можно здесь же.</Alert>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button title="Сохранить для всех" onPress={save} loading={update.pending} loadingTitle="Сохраняем…" testID="admin-model-confirm" />
          <Button title="Отмена" variant="secondary" disabled={update.pending} onPress={() => setConfirm(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 14,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  info: { gap: 4 },
  model: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  modelPrimary: { borderColor: Colors.primary, borderWidth: 1.5, backgroundColor: Colors.surfaceInfoSoft },
  modelHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 16, minHeight: 72 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  fallbackBtn: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  fallbackBtnOn: { backgroundColor: Colors.surfaceInfo },
  // При крупном шрифте кнопки перемещения уходят под название.
  fallbackItem: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  fallbackName: { flexGrow: 1, flexBasis: 100, flexShrink: 1 },
  order: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.surfaceInfoSoft, alignItems: 'center', justifyContent: 'center' },
});
