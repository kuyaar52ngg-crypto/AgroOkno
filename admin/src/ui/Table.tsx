import { useNavigate } from 'react-router-dom';
import type { MouseEvent, ReactNode } from 'react';

import { fmtNum } from '../lib/format';
import { nextSort, pageCount, sortRows } from '../lib/query';
import type { SortState } from '../lib/query';
import { Button } from './Button';
import { Skeleton } from './Display';
import { Icon } from './Icons';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Есть значение для сортировки — заголовок кликабелен (сортировка в пределах загруженной страницы). */
  sortValue?: (row: T) => string | number | boolean | null | undefined;
  align?: 'left' | 'right' | 'center';
  width?: string;
  nowrap?: boolean;
}

interface TableProps<T> {
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /** Идёт повторная загрузка: таблица остаётся на месте, но приглушается. */
  loading?: boolean;
  /** Строка кликабельна и ведёт по адресу (первая ячейка при этом остаётся обычной ссылкой). */
  rowHref?: (row: T) => string | null;
  /** Строка кликабельна и вызывает действие (например, открывает панель). */
  onRowClick?: (row: T) => void;
  empty: ReactNode;
}

function pageWindow(current: number, last: number): (number | '…')[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const pages = new Set([1, last, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev > 1) out.push('…');
    out.push(p);
  });
  return out;
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const last = pageCount(total, pageSize);
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="pagination" aria-label="Страницы">
      <span className="caption">
        {fmtNum(from)}–{fmtNum(to)} из {fmtNum(total)}
      </span>
      {last > 1 ? (
        <div className="pagination__pages">
          <Button variant="ghost" size="sm" onClick={() => onChange(page - 1)} disabled={page <= 1} icon={<Icon name="chevronLeft" size={16} />}>
            Назад
          </Button>
          {pageWindow(page, last).map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} className="pagination__gap">
                …
              </span>
            ) : (
              <button key={p} type="button" className={`pagination__page${p === page ? ' is-active' : ''}`} aria-current={p === page ? 'page' : undefined} aria-label={`Страница ${p}`} onClick={() => onChange(p)}>
                {p}
              </button>
            ),
          )}
          <Button variant="ghost" size="sm" onClick={() => onChange(page + 1)} disabled={page >= last}>
            Вперёд
            <Icon name="chevronRight" size={16} />
          </Button>
        </div>
      ) : null}
    </nav>
  );
}

export function Table<T>({ caption, columns, rows, rowKey, total, page, pageSize, onPageChange, sort = null, onSortChange, loading = false, rowHref, onRowClick, empty }: TableProps<T>) {
  const navigate = useNavigate();
  const sorted = sortRows(rows, sort, (row, key) => columns.find((c) => c.key === key)?.sortValue?.(row));

  const clickable = !!rowHref || !!onRowClick;
  const activate = (e: MouseEvent<HTMLTableRowElement>, row: T) => {
    if (!clickable || (e.target as HTMLElement).closest('a, button, input, select, textarea')) return;
    if (onRowClick) {
      onRowClick(row);
      return;
    }
    const href = rowHref?.(row);
    if (href) navigate(href);
  };

  return (
    <div className={`table-wrap${loading ? ' is-loading' : ''}`} aria-busy={loading}>
      <div className="table-scroll">
        <table className="table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const sortable = !!c.sortValue && !!onSortChange;
                const active = sort?.key === c.key ? sort.dir : null;
                return (
                  <th key={c.key} scope="col" style={{ width: c.width, textAlign: c.align }} aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : undefined}>
                    {sortable ? (
                      <button type="button" className={`th-sort${active ? ' is-active' : ''}`} onClick={() => onSortChange(nextSort(sort, c.key))} title="Сортировка в пределах текущей страницы">
                        {c.header}
                        <Icon name={active === 'desc' ? 'sortDown' : 'sortUp'} size={14} />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={rowKey(row)} className={clickable ? 'is-clickable' : undefined} onClick={(e) => activate(e, row)}>
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align }} className={c.nowrap ? 'nowrap' : undefined}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <div className="table-empty">{empty}</div> : null}
      <Pagination page={page} pageSize={pageSize} total={total} onChange={onPageChange} />
    </div>
  );
}

export function TableSkeleton({ columns = 5, rows = 8 }: { columns?: number; rows?: number }) {
  return (
    <div className="table-wrap" role="status" aria-label="Загрузка таблицы">
      <div className="table-scroll">
        <table className="table">
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                {Array.from({ length: columns }, (_, c) => (
                  <td key={c}>
                    <Skeleton width={c === 0 ? '80%' : '60%'} height={14} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
