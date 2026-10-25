import { useLocalSearchParams, useRouter } from 'expo-router';
import Check from 'lucide-react-native/icons/check';
import Milk from 'lucide-react-native/icons/milk';
import Wheat from 'lucide-react-native/icons/wheat';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { buildEvent, formFromEntry, initialForm, validate } from '@/components/event-form';
import type { FormState, FormTab, LivestockMode } from '@/components/event-form';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { DestinationsCard } from '@/components/ui/Cards';
import { Chips, Counter, SegmentedTabs } from '@/components/ui/Controls';
import { DateField } from '@/components/ui/DateField';
import { Alert } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { fmtHeads, fmtNum, parseNumber, todayIso } from '@/constants/format';
import {
  CROP_OPERATION_LABEL,
  CROPS,
  FEED_LABEL,
  FEED_OPERATION_LABEL,
  FORM_MOVEMENTS,
  MOVEMENT_LABEL,
  SPECIES,
  defaultGroup,
} from '@/constants/labels';
import type { SpeciesKey } from '@/constants/labels';
import { Colors } from '@/constants/theme';
import {
  getEventDestinations,
  useCreateEvent,
  useFarm,
  useHerd,
  useJournalEntry,
  useUpdateEvent,
} from '@/data';
import type { CropOperation, FeedKind, FeedOperation, LivestockGroup, MovementKind } from '@/data/contract';

const TAB_OPTIONS: { value: FormTab; label: string }[] = [
  { value: 'livestock', label: 'Животноводство' },
  { value: 'crop', label: 'Растениеводство' },
  { value: 'feed', label: 'Корма' },
];

const MODE_OPTIONS: { value: LivestockMode; label: string }[] = [
  ...FORM_MOVEMENTS.map((kind) => ({ value: kind as LivestockMode, label: MOVEMENT_LABEL[kind] })),
  { value: 'milk' as LivestockMode, label: 'Надой' },
];

function isMovement(value: string | undefined): value is MovementKind {
  return value !== undefined && value in MOVEMENT_LABEL;
}

/** «Новое событие»: Животноводство (46:4708, B4), Растениеводство (B6), Корма (B5). Редактирование — та же форма. */
export default function AddEventScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; group?: string; mode?: string; tab?: string; from?: string; edit?: string }>();
  const farm = useFarm();
  const herd = useHerd();
  const editId = params.edit;
  const entry = useJournalEntry(editId ?? '');
  const create = useCreateEvent();
  const update = useUpdateEvent();

  const defaultPlot = `Огород · участок ${farm.data?.name ?? 'хозяйства'}`;
  const [form, setForm] = useState<FormState>(() => initialForm());
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const appliedKey = useRef<string>('');

  // Применяем параметры маршрута: предзаполнение (D3, быстрые действия) и редактирование (B3).
  const paramsKey = `${params.kind ?? ''}|${params.group ?? ''}|${params.mode ?? ''}|${params.tab ?? ''}|${editId ?? ''}`;
  useEffect(() => {
    if (editId) {
      if (entry.data && appliedKey.current !== `edit:${editId}`) {
        appliedKey.current = `edit:${editId}`;
        setForm(formFromEntry(entry.data));
        setShowErrors(false);
      }
      return;
    }
    if (appliedKey.current === paramsKey) return;
    appliedKey.current = paramsKey;
    const next = initialForm();
    if (params.tab === 'feed' || params.tab === 'crop') next.tab = params.tab;
    if (params.mode === 'milk') next.mode = 'milk';
    if (isMovement(params.kind)) {
      next.mode = params.kind;
      const group = SPECIES.flatMap((s) => s.groups).find((g) => g.group === params.group)?.group;
      if (group) {
        next.group = group;
        next.species = SPECIES.find((s) => s.groups.some((g) => g.group === group))?.key ?? 'cattle';
      } else {
        next.group = defaultGroup(next.species, params.kind);
      }
    }
    setForm(next);
    setShowErrors(false);
    setSubmitError(null);
  }, [paramsKey, editId, entry.data, params.kind, params.group, params.mode, params.tab]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const errors = useMemo(() => validate(form, herd.data), [form, herd.data]);
  const hasErrors = Object.keys(errors).length > 0;
  const event = useMemo(() => buildEvent(form, defaultPlot), [form, defaultPlot]);
  const destinations = getEventDestinations(event, farm.data ?? null).map((d) => d.label);
  const editing = Boolean(editId);
  const pending = create.pending || update.pending;
  const err = (key: keyof typeof errors) => (showErrors ? (errors[key] ?? null) : null);

  const groupOptions = (species: SpeciesKey) =>
    (SPECIES.find((s) => s.key === species)?.groups ?? []).map((g) => {
      const heads = herd.data?.groups.find((x) => x.group === g.group)?.heads;
      return { value: g.group, label: heads !== undefined ? `${g.label} · ${fmtHeads(heads)}` : g.label };
    });
  const cattleCowGroups = (herd.data?.groups ?? []).filter((g) => ['cattle_cows', 'sheep', 'goats', 'horses_mares'].includes(g.group));
  const milkOptions = (cattleCowGroups.length > 0 ? cattleCowGroups : [{ group: 'cattle_cows' as LivestockGroup, label: 'Коровы', heads: 0, hint: '' }]).map((g) => ({
    value: g.group,
    label: `${g.label} · ${fmtHeads(g.heads)}`,
  }));

  const save = async () => {
    setShowErrors(true);
    setSubmitError(null);
    if (hasErrors) return;
    try {
      const saved = editing && editId ? await update.run({ id: editId, input: event }) : await create.run(event);
      setForm(initialForm());
      setShowErrors(false);
      appliedKey.current = '';
      router.push({ pathname: '/add/saved', params: { id: saved.id } });
    } catch {
      setSubmitError('Не удалось сохранить событие. Данные не потеряны — повторите попытку.');
    }
  };

  const caption =
    editing
      ? 'Изменения вступят в силу после сохранения. Сданные отчеты не изменятся.'
      : form.tab === 'feed'
        ? 'Учебный пример · еще не сохранено. Сданные отчеты не изменятся.'
        : form.tab === 'crop'
          ? 'Учебный пример ввода · еще не сохранено'
          : form.mode === 'milk'
            ? 'Учебный пример ввода · еще не сохранено. Сохраненные записи не дублируются.'
            : 'Новое событие · еще не сохранено';

  const area = parseNumber(form.areaHa);
  const plotArea = farm.data?.plot_area_m2;
  const showPlotNote = farm.data?.legal_status === 'lph' && form.tab === 'crop' && area !== null && area > 0 && plotArea;

  return (
    <Screen
      title={editing ? 'Редактировать событие' : 'Новое событие'}
      subtitle="Внесите данные один раз — мы подготовим их для нужных систем."
      back={params.from === 'journal' || editing ? { label: 'Журнал учета', fallback: '/journal' } : undefined}
      loading={farm.loading}
    >
      <SegmentedTabs options={TAB_OPTIONS} value={form.tab} onChange={(tab) => set('tab', tab)} />

      {form.tab === 'livestock' ? (
        <View style={styles.form}>
          {form.mode !== 'milk' ? (
            <Chips
              label="Вид животного"
              options={SPECIES.map((s) => ({ value: s.key, label: s.label }))}
              value={form.species}
              onChange={(species) => setForm((f) => ({ ...f, species, group: defaultGroup(species, f.mode as MovementKind) }))}
            />
          ) : null}
          <Chips
            label="Событие"
            options={MODE_OPTIONS}
            value={form.mode}
            onChange={(mode) =>
              setForm((f) => ({
                ...f,
                mode,
                group: mode === 'milk' ? f.group : defaultGroup(f.species, mode),
              }))
            }
          />
          {form.mode === 'milk' ? (
            <>
              <Select
                label="Группа животных"
                value={form.milkGroup}
                options={milkOptions}
                onChange={(g) => set('milkGroup', g as LivestockGroup)}
              />
              <Input
                label="Объем, л"
                value={form.liters}
                onChangeText={(v) => set('liters', v)}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="Например, 40"
                trailingIcon={Milk}
                error={err('liters')}
              />
              <DateField label="Дата события" value={form.date} onChange={(v) => set('date', v)} maxDate={todayIso()} error={err('date')} />
              <Input label="Заметка · необязательно" value={form.note} onChangeText={(v) => set('note', v)} placeholder="Например, утренний и вечерний надой" />
            </>
          ) : (
            <>
              {(SPECIES.find((s) => s.key === form.species)?.groups.length ?? 0) > 1 ? (
                <Select
                  label="Группа животных"
                  value={form.group}
                  options={groupOptions(form.species)}
                  onChange={(g) => set('group', g as LivestockGroup)}
                />
              ) : null}
              <View style={{ gap: 8 }}>
                <Text variant="label">Количество, голов</Text>
                <Counter value={form.heads} onChange={(v) => set('heads', v)} min={1} label="Количество голов" />
                {err('heads') ? (
                  <Text variant="caption" color={Colors.textErrorReadable}>
                    {err('heads')}
                  </Text>
                ) : null}
              </View>
              <DateField label="Дата события" value={form.date} onChange={(v) => set('date', v)} maxDate={todayIso()} inline error={err('date')} />
              {err('date') ? (
                <Text variant="caption" color={Colors.textErrorReadable}>
                  {err('date')}
                </Text>
              ) : null}
              {form.mode === 'sale' || form.mode === 'purchase' ? (
                <>
                  <Input
                    label={form.mode === 'sale' ? 'Покупатель · необязательно' : 'Продавец · необязательно'}
                    value={form.counterparty}
                    onChangeText={(v) => set('counterparty', v)}
                  />
                  <Input
                    label="Сумма, ₽ · необязательно"
                    value={form.amountRub}
                    onChangeText={(v) => set('amountRub', v)}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    error={err('amountRub')}
                  />
                </>
              ) : null}
              {form.mode === 'slaughter' ? (
                <Input
                  label="Живой вес, кг · необязательно"
                  value={form.liveWeight}
                  onChangeText={(v) => set('liveWeight', v)}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                />
              ) : null}
              <Input label="Заметка · необязательно" value={form.note} onChangeText={(v) => set('note', v)} />
            </>
          )}
        </View>
      ) : null}

      {form.tab === 'crop' ? (
        <View style={styles.form}>
          <Select
            label="Поле / участок"
            value={form.plot || defaultPlot}
            options={[
              { value: defaultPlot, label: defaultPlot },
              { value: 'Другое поле', label: 'Другое поле' },
            ]}
            onChange={(v) => set('plot', v)}
          />
          {showPlotNote && plotArea ? (
            <Alert>{`${fmtNum(area ?? 0, 2)} га = ${fmtNum(Math.round((area ?? 0) * 10000))} кв.м — часть существующего участка ${fmtNum(plotArea)} кв.м. Новый участок не создается.`}</Alert>
          ) : null}
          <Select label="Культура" value={form.crop} options={CROPS.map((c) => ({ value: c, label: c }))} onChange={(v) => set('crop', v)} />
          <Select
            label="Операция"
            value={form.cropOp}
            options={(Object.keys(CROP_OPERATION_LABEL) as CropOperation[]).map((op) => ({ value: op, label: CROP_OPERATION_LABEL[op] }))}
            onChange={(v) => set('cropOp', v as CropOperation)}
          />
          <View style={styles.pair}>
            <Input
              style={styles.half}
              label="Площадь, га"
              value={form.areaHa}
              onChangeText={(v) => set('areaHa', v)}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder="0,10"
              error={err('areaHa')}
            />
            {form.cropOp === 'harvest' ? (
              <Input
                style={styles.half}
                label="Урожай, т"
                value={form.yieldT}
                onChangeText={(v) => set('yieldT', v)}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="1,8"
                error={err('yieldT')}
              />
            ) : null}
          </View>
          <DateField label="Дата события" value={form.date} onChange={(v) => set('date', v)} maxDate={todayIso()} error={err('date')} />
        </View>
      ) : null}

      {form.tab === 'feed' ? (
        <View style={styles.form}>
          <Select
            label="Культура / корм"
            value={form.feedKind}
            options={(Object.keys(FEED_LABEL) as FeedKind[]).map((k) => ({ value: k, label: FEED_LABEL[k] }))}
            onChange={(v) => set('feedKind', v as FeedKind)}
          />
          <Select
            label="Операция"
            value={form.feedOp}
            options={(Object.keys(FEED_OPERATION_LABEL) as FeedOperation[]).map((k) => ({ value: k, label: FEED_OPERATION_LABEL[k] }))}
            onChange={(v) => set('feedOp', v as FeedOperation)}
          />
          <Input
            label="Количество, т"
            value={form.qtyT}
            onChangeText={(v) => set('qtyT', v)}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="2,5"
            trailingIcon={Wheat}
            error={err('qtyT')}
          />
          <DateField label="Дата события" value={form.date} onChange={(v) => set('date', v)} maxDate={todayIso()} error={err('date')} />
          <Input
            label="Место хранения"
            value={form.storage}
            onChangeText={(v) => set('storage', v)}
            hint="Учебное наименование места хранения"
            placeholder="Сеновал хозяйства"
          />
        </View>
      ) : null}

      <DestinationsCard items={destinations} />
      {submitError ? <Alert tone="error">{submitError}</Alert> : null}
      {showErrors && hasErrors ? <Alert tone="error">Проверьте выделенные поля — событие пока не сохранено.</Alert> : null}
      <View style={{ gap: 12 }}>
        <Button title="Сохранить" icon={Check} onPress={save} loading={pending} loadingTitle="Сохраняем…" />
        <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
          {caption}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 20 },
  pair: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
});
