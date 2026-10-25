import { Link } from 'react-router-dom';

import { api } from '../api';
import type { AdminFarm, LegalStatus } from '../api';
import { useAsync } from '../hooks/useAsync';
import { usePageTitle } from '../hooks/usePageTitle';
import { useUrlParams } from '../hooks/useUrlParams';
import { fmtDateTime, orDash } from '../lib/format';
import { connectionLabel, connectionTone, isLegalStatus, LEGAL_STATUS_LABELS, LEGAL_STATUSES, legalStatusLabel } from '../lib/labels';
import { offsetOf, PAGE_SIZE, readPage, readSort } from '../lib/query';
import { AsyncView } from '../ui/AsyncView';
import { Badge, PageHeader } from '../ui/Display';
import { Select } from '../ui/Fields';
import { SearchBox } from '../ui/SearchBox';
import { EmptyState } from '../ui/States';
import { Table, TableSkeleton } from '../ui/Table';
import type { Column } from '../ui/Table';

const SORT_KEYS = ['name', 'status', 'members', 'reports', 'activity'] as const;

const STATUS_OPTIONS = [{ value: '', label: 'Все статусы' }, ...LEGAL_STATUSES.map((s) => ({ value: s, label: LEGAL_STATUS_LABELS[s] }))];

const COLUMNS: Column<AdminFarm>[] = [
  {
    key: 'name',
    header: 'Хозяйство',
    sortValue: (f) => f.name,
    render: (f) => (
      <div className="cell-main">
        <Link to={`/farms/${f.id}`}>{f.name}</Link>
        <span className="caption">ИНН {orDash(f.inn)}</span>
      </div>
    ),
  },
  { key: 'status', header: 'Статус', sortValue: (f) => f.legal_status, render: (f) => <Badge tone="info">{legalStatusLabel(f.legal_status)}</Badge> },
  {
    key: 'place',
    header: 'Расположение',
    render: (f) => (
      <div className="cell-main">
        <span>{orDash(f.settlement)}</span>
        <span className="caption">{orDash(f.region)}</span>
      </div>
    ),
  },
  {
    key: 'owner',
    header: 'Владелец',
    render: (f) =>
      f.owner ? (
        <div className="cell-main">
          <Link to={`/users/${f.owner.id}`}>{f.owner.full_name?.trim() || 'Без имени'}</Link>
          <span className="caption">{orDash(f.owner.email)}</span>
        </div>
      ) : (
        '—'
      ),
  },
  { key: 'members', header: 'Участников', align: 'right', sortValue: (f) => f.members_count, render: (f) => f.members_count },
  { key: 'mercury', header: 'Меркурий', render: (f) => <Badge tone={connectionTone(f.mercury_status)}>{connectionLabel(f.mercury_status)}</Badge> },
  { key: 'horriot', header: 'Хорриот', render: (f) => <Badge tone={connectionTone(f.horriot_status)}>{connectionLabel(f.horriot_status)}</Badge> },
  { key: 'reports', header: 'Отчётов сдано', align: 'right', sortValue: (f) => f.reports_submitted, render: (f) => f.reports_submitted },
  { key: 'activity', header: 'Активность', nowrap: true, sortValue: (f) => f.last_activity_at, render: (f) => (f.last_activity_at ? fmtDateTime(f.last_activity_at) : <span className="muted">Нет данных</span>) },
];

export function FarmsPage() {
  usePageTitle('Хозяйства');
  const [params, update] = useUrlParams();
  const q = params.get('q') ?? '';
  const statusParam = params.get('status');
  const status: LegalStatus | null = isLegalStatus(statusParam) ? statusParam : null;
  const page = readPage(params.get('page'));
  const sort = readSort(params, SORT_KEYS);
  const state = useAsync(`farms:${q}:${status ?? ''}:${page}`, () => api.listFarms({ search: q, status, limit: PAGE_SIZE, offset: offsetOf(page) }));

  return (
    <div className="stack stack--lg">
      <PageHeader title="Хозяйства" subtitle="КФХ, ИП и личные подсобные хозяйства" />
      <div className="toolbar">
        <SearchBox label="Поиск хозяйств" placeholder="Название, ИНН, населённый пункт" value={q} onChange={(v) => update({ q: v })} />
        <div className="toolbar__select">
          <Select label="Статус хозяйства" options={STATUS_OPTIONS} value={status ?? ''} onChange={(e) => update({ status: e.target.value })} />
        </div>
      </div>
      <AsyncView state={state} skeleton={<TableSkeleton columns={8} />}>
        {(data) => (
          <Table
            caption="Хозяйства"
            columns={COLUMNS}
            rows={data.items}
            rowKey={(f) => f.id}
            rowHref={(f) => `/farms/${f.id}`}
            total={data.total}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={(p) => update({ page: p === 1 ? null : p }, { resetPage: false, replace: false })}
            sort={sort}
            onSortChange={(s) => update({ sort: s?.key, dir: s?.dir === 'desc' ? 'desc' : null }, { resetPage: false })}
            loading={state.loading}
            empty={<EmptyState title={q || status ? 'Хозяйств не найдено' : 'Хозяйств пока нет'}>{q || status ? 'Измените запрос или фильтр по статусу.' : 'Здесь появятся созданные хозяйства.'}</EmptyState>}
          />
        )}
      </AsyncView>
    </div>
  );
}
