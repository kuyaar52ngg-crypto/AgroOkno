import { Link } from 'react-router-dom';

import { api } from '../api';
import type { AdminUser } from '../api';
import { useAsync } from '../hooks/useAsync';
import { usePageTitle } from '../hooks/usePageTitle';
import { useUrlParams } from '../hooks/useUrlParams';
import { fmtDate, fmtDateTime, orDash } from '../lib/format';
import { roleLabel } from '../lib/labels';
import { offsetOf, PAGE_SIZE, readPage, readSort } from '../lib/query';
import { banLabel } from '../lib/users';
import { AsyncView } from '../ui/AsyncView';
import { Badge, PageHeader } from '../ui/Display';
import { SearchBox } from '../ui/SearchBox';
import { EmptyState } from '../ui/States';
import { Table, TableSkeleton } from '../ui/Table';
import type { Column } from '../ui/Table';

const SORT_KEYS = ['name', 'role', 'farms', 'created', 'login'] as const;

export function UserStatusBadges({ user }: { user: Pick<AdminUser, 'banned_until' | 'is_admin'> }) {
  const ban = banLabel(user.banned_until, fmtDate);
  return (
    <span className="badges">
      {ban ? <Badge tone="error">{ban}</Badge> : <Badge tone="success">Активен</Badge>}
      {user.is_admin ? <Badge tone="info">Администратор</Badge> : null}
    </span>
  );
}

const COLUMNS: Column<AdminUser>[] = [
  {
    key: 'name',
    header: 'Пользователь',
    sortValue: (u) => u.full_name,
    render: (u) => (
      <div className="cell-main">
        <Link to={`/users/${u.id}`}>{u.full_name?.trim() || 'Без имени'}</Link>
        <span className="caption">{orDash(u.email)}</span>
      </div>
    ),
  },
  { key: 'phone', header: 'Телефон', nowrap: true, render: (u) => orDash(u.phone) },
  { key: 'role', header: 'Роль', sortValue: (u) => u.role, render: (u) => roleLabel(u.role) },
  { key: 'farms', header: 'Хозяйств', align: 'right', sortValue: (u) => u.farms_count, render: (u) => u.farms_count },
  { key: 'created', header: 'Регистрация', nowrap: true, sortValue: (u) => u.created_at, render: (u) => fmtDate(u.created_at) },
  { key: 'login', header: 'Последний вход', nowrap: true, sortValue: (u) => u.last_sign_in_at, render: (u) => (u.last_sign_in_at ? fmtDateTime(u.last_sign_in_at) : <span className="muted">Не входил</span>) },
  { key: 'status', header: 'Статус', render: (u) => <UserStatusBadges user={u} /> },
];

export function UsersPage() {
  usePageTitle('Пользователи');
  const [params, update] = useUrlParams();
  const q = params.get('q') ?? '';
  const page = readPage(params.get('page'));
  const sort = readSort(params, SORT_KEYS);
  const state = useAsync(`users:${q}:${page}`, () => api.listUsers({ search: q, limit: PAGE_SIZE, offset: offsetOf(page) }));

  return (
    <div className="stack stack--lg">
      <PageHeader title="Пользователи" subtitle="Поиск по ФИО, email, телефону и ИНН хозяйства" />
      <div className="toolbar">
        <SearchBox label="Поиск пользователей" placeholder="ФИО, email, телефон или ИНН" value={q} onChange={(v) => update({ q: v })} />
      </div>
      <AsyncView state={state} skeleton={<TableSkeleton columns={7} />}>
        {(data) => (
          <Table
            caption="Пользователи"
            columns={COLUMNS}
            rows={data.items}
            rowKey={(u) => u.id}
            rowHref={(u) => `/users/${u.id}`}
            total={data.total}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={(p) => update({ page: p === 1 ? null : p }, { resetPage: false, replace: false })}
            sort={sort}
            onSortChange={(s) => update({ sort: s?.key, dir: s?.dir === 'desc' ? 'desc' : null }, { resetPage: false })}
            loading={state.loading}
            empty={<EmptyState title={q ? 'Никого не нашли' : 'Пользователей пока нет'}>{q ? 'Проверьте запрос: можно искать по части ФИО, email, телефона или ИНН.' : 'Здесь появятся зарегистрированные пользователи.'}</EmptyState>}
          />
        )}
      </AsyncView>
    </div>
  );
}
