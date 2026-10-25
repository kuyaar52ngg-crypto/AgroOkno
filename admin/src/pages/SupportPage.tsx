import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api';
import type { AdminTicket, TicketStatus } from '../api';
import { toApiError } from '../api/errors';
import { useAsync } from '../hooks/useAsync';
import { usePageTitle } from '../hooks/usePageTitle';
import { useUrlParams } from '../hooks/useUrlParams';
import { fmtDate, fmtDateTime, orDash } from '../lib/format';
import { isTicketStatus, TICKET_STATUS_LABELS, TICKET_STATUSES, ticketStatusLabel, ticketStatusTone } from '../lib/labels';
import { offsetOf, PAGE_SIZE, readPage, readSort } from '../lib/query';
import { AsyncView } from '../ui/AsyncView';
import { Button } from '../ui/Button';
import { Badge, DefinitionList, PageHeader, SkeletonBlock } from '../ui/Display';
import { Select, Textarea } from '../ui/Fields';
import { Overlay } from '../ui/Overlay';
import { SearchBox } from '../ui/SearchBox';
import { Alert, EmptyState } from '../ui/States';
import { Table, TableSkeleton } from '../ui/Table';
import type { Column } from '../ui/Table';
import { useToast } from '../ui/toast';

const SORT_KEYS = ['number', 'status', 'created'] as const;
const STATUS_OPTIONS = [{ value: '', label: 'Все статусы' }, ...TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS_LABELS[s] }))];
const STATUS_FORM_OPTIONS = TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS_LABELS[s] }));
const FORM_ID = 'ticket-form';
const MAX_REPLY = 2000;

function TicketPanel({ ticket, onClose, onSaved, fromAnotherPage }: { ticket: AdminTicket; onClose: () => void; onSaved: () => void; fromAnotherPage: boolean }) {
  const toast = useToast();
  const [reply, setReply] = useState(ticket.admin_reply ?? '');
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const text = reply.trim();
  const unchangedReply = text !== '' && text === (ticket.admin_reply ?? '').trim();
  const changed = status !== ticket.status || text !== (ticket.admin_reply ?? '').trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === 'answered' && text === '') {
      setFieldError('Для статуса «Отвечено» напишите ответ');
      return;
    }
    setFieldError(null);
    setBusy(true);
    setError(null);
    // null — оставить прежний ответ без нового уведомления; новый текст уйдёт пользователю уведомлением
    const newReply = text !== '' && !unchangedReply ? text : null;
    try {
      await api.replyTicket(ticket.id, newReply, status);
      toast.success(newReply !== null ? 'Ответ сохранён и отправлен пользователю уведомлением' : 'Статус обращения обновлён');
      onSaved();
      onClose();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay
      open
      variant="drawer"
      size="lg"
      title={ticket.number}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Закрыть
          </Button>
          <Button type="submit" form={FORM_ID} loading={busy} loadingLabel="Сохраняем…" disabled={!changed}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="stack stack--lg">
        {fromAnotherPage ? <p className="caption">Обращение открыто по ссылке и не входит в текущую страницу списка.</p> : null}
        <div className="stack stack--sm">
          <div className="row">
            <Badge tone={ticketStatusTone(ticket.status)}>{ticketStatusLabel(ticket.status)}</Badge>
            <span className="caption">Создано {fmtDateTime(ticket.created_at)}</span>
          </div>
          <h3>{ticket.topic}</h3>
          <p className="ticket-message">{ticket.message}</p>
        </div>
        <DefinitionList
          items={[
            { label: 'Раздел приложения', value: orDash(ticket.related_section) },
            { label: 'Хозяйство', value: <Link to={`/farms/${ticket.farm_id}`}>{ticket.farm_name ?? 'Без названия'}</Link> },
            { label: 'Автор', value: orDash(ticket.user_full_name) },
            { label: 'Email', value: orDash(ticket.user_email) },
            { label: 'Ответ отправлен', value: ticket.replied_at ? fmtDateTime(ticket.replied_at) : 'Ещё нет' },
          ]}
        />
        <form id={FORM_ID} className="stack" onSubmit={submit} noValidate>
          <Select label="Статус" options={STATUS_FORM_OPTIONS} value={status} onChange={(e) => isTicketStatus(e.target.value) && setStatus(e.target.value)} />
          <Textarea
            label="Ответ администратора"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={6}
            maxLength={MAX_REPLY}
            error={fieldError}
            hint="Непустой ответ уйдёт пользователю уведомлением в приложении «Ответ поддержки»."
          />
          {unchangedReply ? <Alert tone="info">Текст ответа не изменился: при сохранении обновится только статус, повторное уведомление пользователю не уйдёт.</Alert> : null}
          {error ? <Alert tone="error">{error}</Alert> : null}
        </form>
      </div>
    </Overlay>
  );
}

function TicketLookup({ number, items, onClose, onSaved }: { number: string; items: AdminTicket[]; onClose: () => void; onSaved: () => void }) {
  const inList = items.find((t) => t.number === number);
  const fetched = useAsync(`ticket:${number}:${inList ? 'skip' : 'fetch'}`, async () => {
    if (inList) return null;
    const res = await api.listTickets({ status: null, search: number, limit: 5, offset: 0 });
    return res.items.find((t) => t.number === number) ?? null;
  });
  const ticket = inList ?? fetched.data ?? null;

  if (ticket) return <TicketPanel key={ticket.id} ticket={ticket} onClose={onClose} onSaved={onSaved} fromAnotherPage={!inList} />;
  return (
    <Overlay open variant="drawer" size="lg" title={number} onClose={onClose}>
      {fetched.error ? <Alert tone="error">{fetched.error.message}</Alert> : fetched.loading ? <SkeletonBlock lines={6} /> : <EmptyState title="Обращение не найдено">Возможно, оно удалено или номер указан неверно.</EmptyState>}
    </Overlay>
  );
}

export function SupportPage() {
  usePageTitle('Поддержка');
  const [params, update] = useUrlParams();
  const q = params.get('q') ?? '';
  const statusParam = params.get('status');
  const status: TicketStatus | null = isTicketStatus(statusParam) ? statusParam : null;
  const page = readPage(params.get('page'));
  const sort = readSort(params, SORT_KEYS);
  const openNumber = params.get('ticket');
  const state = useAsync(`tickets:${q}:${status ?? ''}:${page}`, () => api.listTickets({ status, search: q, limit: PAGE_SIZE, offset: offsetOf(page) }));

  const open = (t: AdminTicket) => update({ ticket: t.number }, { resetPage: false, replace: false });
  const columns: Column<AdminTicket>[] = [
    { key: 'number', header: 'Обращение', sortValue: (t) => t.number, nowrap: true, render: (t) => <button type="button" className="link-btn" onClick={() => open(t)}>{t.number}</button> },
    {
      key: 'topic',
      header: 'Тема',
      render: (t) => (
        <div className="cell-main">
          <span>{t.topic}</span>
          <span className="caption clamp">{t.message}</span>
        </div>
      ),
    },
    {
      key: 'farm',
      header: 'Хозяйство и автор',
      render: (t) => (
        <div className="cell-main">
          <Link to={`/farms/${t.farm_id}`}>{t.farm_name ?? 'Без названия'}</Link>
          <span className="caption">{t.user_full_name ?? t.user_email ?? '—'}</span>
        </div>
      ),
    },
    { key: 'status', header: 'Статус', sortValue: (t) => t.status, render: (t) => <Badge tone={ticketStatusTone(t.status)}>{ticketStatusLabel(t.status)}</Badge> },
    { key: 'created', header: 'Создано', nowrap: true, sortValue: (t) => t.created_at, render: (t) => fmtDate(t.created_at) },
    { key: 'replied', header: 'Ответ', nowrap: true, render: (t) => (t.replied_at ? fmtDate(t.replied_at) : <span className="muted">Нет</span>) },
  ];

  return (
    <div className="stack stack--lg">
      <PageHeader title="Поддержка" subtitle="Обращения пользователей: ответ приходит им уведомлением в приложении" />
      <div className="toolbar">
        <SearchBox label="Поиск обращений" placeholder="Номер, тема, хозяйство, автор" value={q} onChange={(v) => update({ q: v })} />
        <div className="toolbar__select">
          <Select label="Статус обращения" options={STATUS_OPTIONS} value={status ?? ''} onChange={(e) => update({ status: e.target.value })} />
        </div>
      </div>
      <AsyncView state={state} skeleton={<TableSkeleton columns={6} />}>
        {(data) => (
          <>
            <Table
              caption="Обращения в поддержку"
              columns={columns}
              rows={data.items}
              rowKey={(t) => t.id}
              onRowClick={open}
              total={data.total}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={(p) => update({ page: p === 1 ? null : p }, { resetPage: false, replace: false })}
              sort={sort}
              onSortChange={(s) => update({ sort: s?.key, dir: s?.dir === 'desc' ? 'desc' : null }, { resetPage: false })}
              loading={state.loading}
              empty={<EmptyState title={q || status ? 'Обращений не найдено' : 'Обращений пока нет'}>{q || status ? 'Измените запрос или статус.' : 'Здесь появятся обращения из приложения.'}</EmptyState>}
            />
            {openNumber ? <TicketLookup key={openNumber} number={openNumber} items={data.items} onClose={() => update({ ticket: null }, { resetPage: false, replace: true })} onSaved={state.reload} /> : null}
          </>
        )}
      </AsyncView>
    </div>
  );
}
