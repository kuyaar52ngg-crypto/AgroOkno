import { useState } from 'react';
import type { FormEvent } from 'react';

import { api } from '../api';
import type { ReportDeadline } from '../api';
import { toApiError } from '../api/errors';
import { useAsync } from '../hooks/useAsync';
import { usePageTitle } from '../hooks/usePageTitle';
import { useUrlParams } from '../hooks/useUrlParams';
import { buildPatch, describeDeadline, toDraft, validateDraft } from '../lib/deadlines';
import type { DeadlineDraft, DeadlineErrors } from '../lib/deadlines';
import { authorityLabel, formLabel, periodKindLabel } from '../lib/labels';
import { AsyncView } from '../ui/AsyncView';
import { Button } from '../ui/Button';
import { Badge, PageHeader } from '../ui/Display';
import { Input, Textarea } from '../ui/Fields';
import { Overlay } from '../ui/Overlay';
import { Alert, EmptyState } from '../ui/States';
import { Table, TableSkeleton } from '../ui/Table';
import type { Column } from '../ui/Table';
import { useToast } from '../ui/toast';

const FORM_ID = 'deadline-form';

function DeadlineDrawer({ deadline, onClose, onSaved }: { deadline: ReportDeadline; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<DeadlineDraft>(() => toDraft(deadline));
  const [errors, setErrors] = useState<DeadlineErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const patch = buildPatch(draft, deadline);
  const changed = Object.keys(patch).length > 0;
  const set = (key: keyof DeadlineDraft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateDraft(draft, deadline);
    setErrors(found);
    if (Object.keys(found).length > 0 || !changed) return;
    setBusy(true);
    setFormError(null);
    try {
      await api.updateDeadline(deadline.form_code, patch);
      toast.success(`Срок формы «${formLabel(deadline.form_code)}» обновлён`);
      onSaved();
      onClose();
    } catch (err) {
      setFormError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const preview = (() => {
    const day = Number(draft.due_day);
    const m = draft.due_month.trim() === '' ? null : Number(draft.due_month);
    const mo = Number(draft.due_month_offset);
    const yo = Number(draft.due_year_offset);
    if (![day, mo, yo].every(Number.isFinite) || (m !== null && !Number.isFinite(m)) || (m !== null && (m < 1 || m > 12))) return null;
    return describeDeadline({ period_kind: deadline.period_kind, due_day: day, due_month: m, due_month_offset: mo, due_year_offset: yo });
  })();

  return (
    <Overlay
      open
      variant="drawer"
      title={formLabel(deadline.form_code)}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button type="submit" form={FORM_ID} loading={busy} loadingLabel="Сохраняем…" disabled={!changed}>
            Сохранить
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className="stack" onSubmit={submit} noValidate>
        <p className="caption">
          {authorityLabel(deadline.authority)} · {periodKindLabel(deadline.period_kind)} · код <code>{deadline.form_code}</code>
        </p>
        <Input label="Название" value={draft.title} onChange={set('title')} error={errors.title} maxLength={200} />
        <Textarea label="Описание" value={draft.description} onChange={set('description')} error={errors.description} rows={3} maxLength={500} />
        <Textarea label="Комментарий" value={draft.comment} onChange={set('comment')} error={errors.comment} rows={3} maxLength={500} hint="Показывается пользователю рядом со сроком. Можно оставить пустым." />
        <div className="grid-2">
          <Input label="Число месяца (1–31)" inputMode="numeric" value={draft.due_day} onChange={set('due_day')} error={errors.due_day} />
          <Input
            label="Месяц срока (1–12)"
            inputMode="numeric"
            value={draft.due_month}
            onChange={set('due_month')}
            error={errors.due_month}
            hint={deadline.period_kind === 'year' ? 'Обязателен для годовой формы' : 'Пусто — срок считается от отчётного месяца'}
          />
          <Input label="Смещение месяца" inputMode="numeric" value={draft.due_month_offset} onChange={set('due_month_offset')} error={errors.due_month_offset} hint="От 0 до 12: 0 — тот же месяц, 1 — следующий" />
          <Input label="Смещение года" inputMode="numeric" value={draft.due_year_offset} onChange={set('due_year_offset')} error={errors.due_year_offset} hint="От 0 до 3: 0 — тот же год, 1 — следующий" />
        </div>
        {preview ? (
          <Alert tone="info" title="Итоговый срок">
            Отчёт нужно сдать {preview}.
          </Alert>
        ) : null}
        {formError ? <Alert tone="error">{formError}</Alert> : null}
      </form>
    </Overlay>
  );
}

export function DeadlinesPage() {
  usePageTitle('Сроки отчётов');
  const [params, update] = useUrlParams();
  const editCode = params.get('edit');
  const state = useAsync('deadlines', () => api.listDeadlines());

  const columns: Column<ReportDeadline>[] = [
    {
      key: 'form',
      header: 'Форма',
      sortValue: (d) => d.title,
      render: (d) => (
        <div className="cell-main">
          <strong>{d.title}</strong>
          <span className="caption">{d.description}</span>
        </div>
      ),
    },
    { key: 'authority', header: 'Ведомство', render: (d) => authorityLabel(d.authority) },
    { key: 'scope', header: 'Уровень', render: (d) => <Badge tone={d.scope === 'regional' ? 'warning' : 'info'}>{d.scope === 'regional' ? 'Региональная' : 'Федеральная'}</Badge> },
    { key: 'kind', header: 'Периодичность', render: (d) => periodKindLabel(d.period_kind) },
    { key: 'due', header: 'Срок', render: (d) => describeDeadline(d) },
    { key: 'comment', header: 'Комментарий', render: (d) => <span className="caption">{d.comment || '—'}</span> },
    {
      key: 'edit',
      header: '',
      align: 'right',
      render: (d) => (
        <Button variant="secondary" size="sm" onClick={() => update({ edit: d.form_code }, { resetPage: false, replace: false })}>
          Изменить
        </Button>
      ),
    },
  ];

  return (
    <div className="stack stack--lg">
      <PageHeader title="Сроки отчётов" subtitle="Справочник сроков: изменения сразу видны во всех приложениях" />
      <AsyncView state={state} skeleton={<TableSkeleton columns={6} rows={9} />}>
        {(rows) => {
          const editing = editCode ? rows.find((d) => d.form_code === editCode) : undefined;
          return (
            <>
              <Table
                caption="Сроки отчётов"
                columns={columns}
                rows={rows}
                rowKey={(d) => d.form_code}
                total={rows.length}
                page={1}
                pageSize={Math.max(rows.length, 1)}
                onPageChange={() => undefined}
                loading={state.loading}
                empty={<EmptyState title="Справочник пуст">В базе нет ни одной формы отчётности.</EmptyState>}
              />
              {editing ? (
                <DeadlineDrawer key={editing.form_code} deadline={editing} onClose={() => update({ edit: null }, { resetPage: false, replace: true })} onSaved={state.reload} />
              ) : null}
            </>
          );
        }}
      </AsyncView>
    </div>
  );
}
