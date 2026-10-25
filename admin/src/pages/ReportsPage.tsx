import { Link } from 'react-router-dom';

import { api } from '../api';
import type { AdminSubmission } from '../api';
import { useAsync } from '../hooks/useAsync';
import { usePageTitle } from '../hooks/usePageTitle';
import { useUrlParams } from '../hooks/useUrlParams';
import { fmtDate, fmtPeriod, orDash } from '../lib/format';
import { FORM_CODES, FORM_LABELS, formLabel } from '../lib/labels';
import { offsetOf, PAGE_SIZE, readEnum, readInt, readPage, readSort } from '../lib/query';
import { AsyncView } from '../ui/AsyncView';
import { PageHeader } from '../ui/Display';
import { Select } from '../ui/Fields';
import { SearchBox } from '../ui/SearchBox';
import { EmptyState } from '../ui/States';
import { Table, TableSkeleton } from '../ui/Table';
import type { Column } from '../ui/Table';

const SORT_KEYS = ['farm', 'form', 'period', 'submitted'] as const;
const FORM_OPTIONS = [{ value: '', label: 'Все формы' }, ...FORM_CODES.map((c) => ({ value: c, label: FORM_LABELS[c] ?? c }))];

function yearOptions(): { value: string; label: string }[] {
  const current = new Date().getFullYear();
  const years = [];
  for (let y = current + 1; y >= current - 4; y--) years.push({ value: String(y), label: String(y) });
  return [{ value: '', label: 'Все годы' }, ...years];
}

const COLUMNS: Column<AdminSubmission>[] = [
  {
    key: 'farm',
    header: 'Хозяйство',
    sortValue: (s) => s.farm_name,
    render: (s) => (
      <div className="cell-main">
        <Link to={`/farms/${s.farm_id}`}>{s.farm_name}</Link>
        <span className="caption">ИНН {orDash(s.inn)}</span>
      </div>
    ),
  },
  { key: 'form', header: 'Форма', sortValue: (s) => formLabel(s.form_code), render: (s) => formLabel(s.form_code) },
  { key: 'period', header: 'Период', nowrap: true, sortValue: (s) => s.period_year * 100 + (s.period_month ?? 0), render: (s) => fmtPeriod(s.period_year, s.period_month) },
  { key: 'recipient', header: 'Получатель', render: (s) => orDash(s.recipient) },
  { key: 'receipt', header: 'Квитанция', nowrap: true, render: (s) => (s.receipt_no ? <code>{s.receipt_no}</code> : '—') },
  { key: 'submitted', header: 'Дата сдачи', nowrap: true, sortValue: (s) => s.submitted_at, render: (s) => (s.submitted_at ? fmtDate(s.submitted_at) : '—') },
];

export function ReportsPage() {
  usePageTitle('Отчёты');
  const [params, update] = useUrlParams();
  const q = params.get('q') ?? '';
  const form = readEnum(params.get('form'), ['', ...FORM_CODES], '') || null;
  const year = readInt(params.get('year'), 0, 2000, 2100) || null;
  const page = readPage(params.get('page'));
  const sort = readSort(params, SORT_KEYS);
  const state = useAsync(`submissions:${q}:${form ?? ''}:${year ?? ''}:${page}`, () => api.listSubmissions({ form, year, search: q, limit: PAGE_SIZE, offset: offsetOf(page) }));
  const filtered = !!(q || form || year);

  return (
    <div className="stack stack--lg">
      <PageHeader title="Отчёты" subtitle="Сданные отчёты всех хозяйств: форма, период, квитанция и дата сдачи" />
      <div className="toolbar">
        <SearchBox label="Поиск по хозяйству" placeholder="Название или ИНН хозяйства" value={q} onChange={(v) => update({ q: v })} />
        <div className="toolbar__select">
          <Select label="Форма" options={FORM_OPTIONS} value={form ?? ''} onChange={(e) => update({ form: e.target.value })} />
        </div>
        <div className="toolbar__select toolbar__select--narrow">
          <Select label="Год" options={yearOptions()} value={year ? String(year) : ''} onChange={(e) => update({ year: e.target.value })} />
        </div>
      </div>
      <AsyncView state={state} skeleton={<TableSkeleton columns={6} />}>
        {(data) => (
          <Table
            caption="Отчёты хозяйств"
            columns={COLUMNS}
            rows={data.items}
            rowKey={(s) => s.id}
            total={data.total}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={(p) => update({ page: p === 1 ? null : p }, { resetPage: false, replace: false })}
            sort={sort}
            onSortChange={(s) => update({ sort: s?.key, dir: s?.dir === 'desc' ? 'desc' : null }, { resetPage: false })}
            loading={state.loading}
            empty={<EmptyState title={filtered ? 'Отчётов не найдено' : 'Отчёты пока не сдавались'}>{filtered ? 'Измените форму, год или запрос.' : 'Сданные отчёты хозяйств появятся здесь.'}</EmptyState>}
          />
        )}
      </AsyncView>
    </div>
  );
}
