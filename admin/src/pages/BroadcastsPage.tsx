import { useState } from 'react';
import type { FormEvent } from 'react';

import { api } from '../api';
import type { AdminBroadcast, BroadcastResult, BroadcastTarget, LegalStatus } from '../api';
import { useAsync } from '../hooks/useAsync';
import { useDebounced } from '../hooks/useDebounced';
import { usePageTitle } from '../hooks/usePageTitle';
import { useUrlParams } from '../hooks/useUrlParams';
import { fmtCount, fmtDateTime, fmtNum, orDash } from '../lib/format';
import { describeBroadcastTarget, LEGAL_STATUS_LABELS, LEGAL_STATUSES, legalStatusLabel } from '../lib/labels';
import { offsetOf, readPage } from '../lib/query';
import { AsyncView } from '../ui/AsyncView';
import { Button, IconButton } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Card, PageHeader } from '../ui/Display';
import { Input, Segmented, Select, Textarea } from '../ui/Fields';
import { Icon } from '../ui/Icons';
import { Overlay } from '../ui/Overlay';
import { Alert, EmptyState } from '../ui/States';
import { Table, TableSkeleton } from '../ui/Table';
import type { Column } from '../ui/Table';
import { useToast } from '../ui/toast';

const HISTORY_PAGE = 10;
const MAX_TITLE = 80;
const MAX_BODY = 1000;
const FARM_WORDS: [string, string, string] = ['хозяйство', 'хозяйства', 'хозяйств'];

const TARGETS = [
  { value: 'all', label: 'Всем хозяйствам' },
  { value: 'status', label: 'По статусу' },
  { value: 'farms', label: 'Выбранным' },
] as const;

const STATUS_OPTIONS = LEGAL_STATUSES.map((s) => ({ value: s, label: LEGAL_STATUS_LABELS[s] }));

interface PickedFarm {
  id: string;
  name: string;
  inn: string | null;
}

/** Поиск хозяйств и выбор нескольких: результаты — через admin_list_farms с дебаунсом. */
function FarmPicker({ selected, onChange, error }: { selected: PickedFarm[]; onChange: (farms: PickedFarm[]) => void; error?: string | null }) {
  const [text, setText] = useState('');
  const query = useDebounced(text.trim());
  const found = useAsync(`picker:${query}`, async () => (query.length < 2 ? null : api.listFarms({ search: query, status: null, limit: 8, offset: 0 })));
  const chosen = new Set(selected.map((f) => f.id));

  return (
    <div className="stack stack--sm">
      <Input label="Найти хозяйство" value={text} onChange={(e) => setText(e.target.value)} placeholder="Название или ИНН (от 2 символов)" error={error} />
      {found.error ? <Alert tone="error">{found.error.message}</Alert> : null}
      {found.data && found.data.items.length > 0 ? (
        <ul className="list list--bordered">
          {found.data.items.map((f) => (
            <li key={f.id} className="list__item">
              <div className="cell-main">
                <span>{f.name}</span>
                <span className="caption">
                  {legalStatusLabel(f.legal_status)} · ИНН {orDash(f.inn)}
                </span>
              </div>
              <Button variant="secondary" size="sm" disabled={chosen.has(f.id)} onClick={() => onChange([...selected, { id: f.id, name: f.name, inn: f.inn }])}>
                {chosen.has(f.id) ? 'Добавлено' : 'Добавить'}
              </Button>
            </li>
          ))}
        </ul>
      ) : found.data ? (
        <p className="caption">Ничего не найдено.</p>
      ) : null}
      {selected.length > 0 ? (
        <div className="chips" aria-label="Выбранные хозяйства">
          {selected.map((f) => (
            <span key={f.id} className="chip">
              {f.name}
              <IconButton label={`Убрать: ${f.name}`} onClick={() => onChange(selected.filter((x) => x.id !== f.id))}>
                <Icon name="close" size={14} />
              </IconButton>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface FormErrors {
  title?: string;
  body?: string;
  farms?: string;
}

function BroadcastForm({ onSent }: { onSent: (r: BroadcastResult) => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<BroadcastTarget>('all');
  const [status, setStatus] = useState<LegalStatus>('kfh');
  const [farms, setFarms] = useState<PickedFarm[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [confirm, setConfirm] = useState(false);

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (title.trim() === '') next.title = 'Укажите заголовок';
    if (body.trim() === '') next.body = 'Напишите текст уведомления';
    if (target === 'farms' && farms.length === 0) next.farms = 'Выберите хотя бы одно хозяйство';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (validate()) setConfirm(true);
  };

  const recipients =
    target === 'all' ? 'Все хозяйства' : target === 'status' ? `Все хозяйства со статусом «${LEGAL_STATUS_LABELS[status]}»` : fmtCount(farms.length, ['выбранное хозяйство', 'выбранных хозяйства', 'выбранных хозяйств']);

  const send = async () => {
    const result = await api.broadcast({
      title: title.trim(),
      body: body.trim(),
      target,
      status: target === 'status' ? status : null,
      farm_ids: target === 'farms' ? farms.map((f) => f.id) : null,
    });
    toast.success(`Рассылка отправлена: ${fmtCount(result.farms_count, FARM_WORDS)}, push — ${fmtNum(result.push_sent)}`);
    setConfirm(false);
    setTitle('');
    setBody('');
    setFarms([]);
    setErrors({});
    onSent(result);
  };

  return (
    <Card title="Новая рассылка">
      <form className="stack" onSubmit={submit} noValidate>
        <div className="stack stack--sm">
          <span className="field__label">Кому</span>
          <Segmented label="Получатели" options={TARGETS} value={target} onChange={(v) => setTarget(v)} />
        </div>
        {target === 'status' ? <Select label="Статус хозяйства" options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value as LegalStatus)} /> : null}
        {target === 'farms' ? <FarmPicker selected={farms} onChange={setFarms} error={errors.farms} /> : null}
        <Input label="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TITLE} error={errors.title} hint={`${title.length} из ${MAX_TITLE}`} />
        <Textarea label="Текст уведомления" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={MAX_BODY} error={errors.body} hint={`${body.length} из ${MAX_BODY}`} />
        <div className="notice-preview" aria-label="Предпросмотр уведомления">
          <span className="caption">Так уведомление увидят в приложении</span>
          <strong>{title.trim() || 'Заголовок уведомления'}</strong>
          <span className="small">{body.trim() || 'Текст уведомления появится здесь.'}</span>
        </div>
        <Alert tone="info">Уведомление появится в разделе «Уведомления» приложения; push придёт тем, у кого он включён. Отправленное нельзя отозвать.</Alert>
        <div>
          <Button type="submit">Отправить рассылку</Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirm}
        title={target === 'all' ? 'Отправить всем хозяйствам?' : 'Отправить рассылку?'}
        tone={target === 'all' ? 'danger' : 'primary'}
        confirmLabel="Отправить"
        busyLabel="Отправляем…"
        onCancel={() => setConfirm(false)}
        onConfirm={send}
      >
        <p>
          Получатели: <strong>{recipients}</strong>.
        </p>
        <div className="notice-preview">
          <strong>{title.trim()}</strong>
          <span className="small">{body.trim()}</span>
        </div>
        {target === 'all' ? <Alert tone="warning">Сообщение получат все пользователи приложения. Это действие нельзя отменить.</Alert> : <p className="caption">Рассылку нельзя отозвать после отправки.</p>}
        <p className="caption">Отправку выполняет сервер: если он простаивал, ответ может прийти не сразу.</p>
      </ConfirmDialog>
    </Card>
  );
}

const HISTORY_COLUMNS = (open: (b: AdminBroadcast) => void): Column<AdminBroadcast>[] => [
  { key: 'date', header: 'Отправлена', nowrap: true, render: (b) => fmtDateTime(b.created_at) },
  {
    key: 'title',
    header: 'Заголовок',
    render: (b) => (
      <div className="cell-main">
        <button type="button" className="link-btn" onClick={() => open(b)}>
          {b.title}
        </button>
        <span className="caption clamp">{b.body}</span>
      </div>
    ),
  },
  { key: 'target', header: 'Кому', render: (b) => describeBroadcastTarget(b.target) },
  { key: 'farms', header: 'Хозяйств', align: 'right', render: (b) => fmtNum(b.farms_count) },
  { key: 'push', header: 'Push', align: 'right', render: (b) => fmtNum(b.push_sent) },
  { key: 'by', header: 'Автор', render: (b) => orDash(b.created_by_email) },
];

export function BroadcastsPage() {
  usePageTitle('Рассылки');
  const [params, update] = useUrlParams();
  const page = readPage(params.get('page'));
  const [last, setLast] = useState<BroadcastResult | null>(null);
  const [opened, setOpened] = useState<AdminBroadcast | null>(null);
  const history = useAsync(`broadcasts:${page}`, () => api.listBroadcasts({ limit: HISTORY_PAGE, offset: offsetOf(page, HISTORY_PAGE) }));

  const onSent = (result: BroadcastResult) => {
    setLast(result);
    if (page !== 1) update({ page: null }, { resetPage: false });
    history.reload();
  };

  return (
    <div className="stack stack--lg">
      <PageHeader title="Рассылки" subtitle="Уведомления хозяйствам в приложении и push" />
      <div className="stack stack--lg">
        <div className="stack readable">
          <BroadcastForm onSent={onSent} />
          {last ? (
            <Alert tone={last.push_sent > 0 ? 'success' : 'warning'} title={`Рассылка отправлена: ${fmtCount(last.farms_count, FARM_WORDS)}`}>
              {last.push_sent > 0 ? `Push отправлен ${fmtNum(last.push_sent)} устройствам.` : 'Push не отправлялся: нет подходящих устройств или на сервере не задан сервисный ключ. Уведомления в приложении доставлены.'}
            </Alert>
          ) : null}
        </div>
        <div className="stack">
          <h2>История рассылок</h2>
          <AsyncView state={history} skeleton={<TableSkeleton columns={5} rows={5} />}>
            {(data) => (
              <Table
                caption="История рассылок"
                columns={HISTORY_COLUMNS(setOpened)}
                rows={data.items}
                rowKey={(b) => b.id}
                onRowClick={setOpened}
                total={data.total}
                page={page}
                pageSize={HISTORY_PAGE}
                onPageChange={(p) => update({ page: p === 1 ? null : p }, { resetPage: false, replace: false })}
                loading={history.loading}
                empty={<EmptyState title="Рассылок пока не было">Отправленные рассылки появятся здесь.</EmptyState>}
              />
            )}
          </AsyncView>
        </div>
      </div>

      {opened ? (
        <Overlay open title={opened.title} onClose={() => setOpened(null)} footer={<Button variant="secondary" onClick={() => setOpened(null)}>Закрыть</Button>}>
          <div className="stack">
            <p className="ticket-message">{opened.body}</p>
            <p className="caption">
              {describeBroadcastTarget(opened.target)} · {fmtCount(opened.farms_count, FARM_WORDS)} · push {fmtNum(opened.push_sent)} · {fmtDateTime(opened.created_at)}
              {opened.created_by_email ? ` · ${opened.created_by_email}` : ''}
            </p>
          </div>
        </Overlay>
      ) : null}
    </div>
  );
}
