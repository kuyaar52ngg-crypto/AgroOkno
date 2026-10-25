import { useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api';
import type { AdminAuditEntry } from '../api';
import { useAsync } from '../hooks/useAsync';
import { usePageTitle } from '../hooks/usePageTitle';
import { useUrlParams } from '../hooks/useUrlParams';
import { fmtDateTime, orDash } from '../lib/format';
import { actionLabel, AUDIT_ACTIONS, targetPath, targetTypeLabel } from '../lib/labels';
import { offsetOf, readPage, readSort } from '../lib/query';
import { AsyncView } from '../ui/AsyncView';
import { Button } from '../ui/Button';
import { PageHeader } from '../ui/Display';
import { Overlay } from '../ui/Overlay';
import { Select } from '../ui/Fields';
import { EmptyState } from '../ui/States';
import { Table, TableSkeleton } from '../ui/Table';
import type { Column } from '../ui/Table';

const AUDIT_PAGE = 25;
const SORT_KEYS = ['when', 'admin', 'action'] as const;

function hasDetails(details: unknown): boolean {
  if (details === null || details === undefined) return false;
  if (typeof details === 'object') return Object.keys(details as object).length > 0;
  return String(details) !== '';
}

function DetailsView({ entry, onClose }: { entry: AdminAuditEntry; onClose: () => void }) {
  return (
    <Overlay open title={actionLabel(entry.action)} onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Закрыть</Button>}>
      <div className="stack">
        <p className="caption">
          {fmtDateTime(entry.created_at)} · {orDash(entry.admin_email)}
        </p>
        <pre className="json">{typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details, null, 2)}</pre>
      </div>
    </Overlay>
  );
}

export function AuditPage() {
  usePageTitle('Журнал действий');
  const [params, update] = useUrlParams();
  const action = (params.get('action') ?? '').trim();
  const page = readPage(params.get('page'));
  const sort = readSort(params, SORT_KEYS);
  const [opened, setOpened] = useState<AdminAuditEntry | null>(null);
  const state = useAsync(`audit:${action}:${page}`, () => api.listAudit({ action: action || null, limit: AUDIT_PAGE, offset: offsetOf(page, AUDIT_PAGE) }));

  // подтверждённые коды действий; незнакомый код из адреса тоже остаётся в списке
  const actionOptions = [
    { value: '', label: 'Все действия' },
    ...[...AUDIT_ACTIONS, ...(action && !(AUDIT_ACTIONS as readonly string[]).includes(action) ? [action] : [])].map((code) => ({ value: code, label: actionLabel(code) })),
  ];

  const columns: Column<AdminAuditEntry>[] = [
    { key: 'when', header: 'Когда', nowrap: true, sortValue: (e) => e.created_at, render: (e) => fmtDateTime(e.created_at) },
    {
      key: 'admin',
      header: 'Администратор',
      sortValue: (e) => e.admin_email,
      render: (e) => (e.admin_id ? <Link to={`/users/${e.admin_id}`}>{orDash(e.admin_email)}</Link> : orDash(e.admin_email)),
    },
    {
      key: 'action',
      header: 'Действие',
      sortValue: (e) => actionLabel(e.action),
      render: (e) => (
        <div className="cell-main">
          <span>{actionLabel(e.action)}</span>
          {actionLabel(e.action) !== e.action ? <code className="caption">{e.action}</code> : null}
        </div>
      ),
    },
    {
      key: 'target',
      header: 'Объект',
      render: (e) => {
        const path = targetPath(e.target_type, e.target_id);
        return (
          <div className="cell-main">
            <span>{targetTypeLabel(e.target_type)}</span>
            {e.target_id ? path ? <Link to={path} className="caption mono">{e.target_id}</Link> : <code className="caption clamp">{e.target_id}</code> : null}
          </div>
        );
      },
    },
    {
      key: 'details',
      header: 'Детали',
      render: (e) =>
        hasDetails(e.details) ? (
          <Button variant="ghost" size="sm" onClick={() => setOpened(e)}>
            Показать
          </Button>
        ) : (
          <span className="muted">—</span>
        ),
    },
  ];

  return (
    <div className="stack stack--lg">
      <PageHeader title="Журнал действий" subtitle="Все изменения, которые делают администраторы" />
      <div className="toolbar">
        <div className="toolbar__select toolbar__select--wide">
          <Select label="Действие" options={actionOptions} value={action} onChange={(e) => update({ action: e.target.value })} />
        </div>
      </div>
      <AsyncView state={state} skeleton={<TableSkeleton columns={5} />}>
        {(data) => (
          <Table
            caption="Журнал действий администраторов"
            columns={columns}
            rows={data.items}
            rowKey={(e) => e.id}
            total={data.total}
            page={page}
            pageSize={AUDIT_PAGE}
            onPageChange={(p) => update({ page: p === 1 ? null : p }, { resetPage: false, replace: false })}
            sort={sort}
            onSortChange={(s) => update({ sort: s?.key, dir: s?.dir === 'desc' ? 'desc' : null }, { resetPage: false })}
            loading={state.loading}
            empty={<EmptyState title={action ? 'Действий не найдено' : 'Журнал пока пуст'}>{action ? 'Проверьте код действия или сбросьте фильтр.' : 'Здесь появятся действия администраторов.'}</EmptyState>}
          />
        )}
      </AsyncView>
      {opened ? <DetailsView entry={opened} onClose={() => setOpened(null)} /> : null}
    </div>
  );
}
