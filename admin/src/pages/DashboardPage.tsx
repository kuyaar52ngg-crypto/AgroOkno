import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { api } from '../api';
import type { AdminStats } from '../api';
import { useAsync } from '../hooks/useAsync';
import { usePageTitle } from '../hooks/usePageTitle';
import { useUrlParams } from '../hooks/useUrlParams';
import { fmtCount, fmtDate, fmtDayMonth, fmtNum, rangeForDays } from '../lib/format';
import { formLabel, LEGAL_STATUS_LABELS } from '../lib/labels';
import { readEnum } from '../lib/query';
import { AsyncView } from '../ui/AsyncView';
import { Card, PageHeader, Skeleton, StatCard } from '../ui/Display';
import { Segmented } from '../ui/Fields';

const PERIODS = [
  { value: '7', label: '7 дней' },
  { value: '30', label: '30 дней' },
  { value: '90', label: '90 дней' },
] as const;
type Period = (typeof PERIODS)[number]['value'];
const PERIOD_VALUES: readonly Period[] = ['7', '30', '90'];

const FARM_WORDS: [string, string, string] = ['хозяйство', 'хозяйства', 'хозяйств'];
const AXIS = { fontSize: 12, fill: '#475569' } as const;
const TOOLTIP_STYLE = { borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(0,0,0,0.08)', fontSize: 13 } as const;

function ChartCard({ title, caption, table, children }: { title: string; caption?: string; table: { headers: string[]; rows: ReactNode[][] }; children: ReactNode }) {
  return (
    <Card title={title}>
      {caption ? <p className="caption chart-caption">{caption}</p> : null}
      <div className="chart">{children}</div>
      <details className="chart-table">
        <summary>Данные таблицей</summary>
        <div className="chart-table__scroll">
          <table className="table table--compact">
            <thead>
              <tr>
                {table.headers.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="stack stack--lg">
      <div className="stat-grid">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="stat">
            <Skeleton width="55%" height={13} />
            <Skeleton width="40%" height={30} />
            <Skeleton width="70%" height={13} />
          </div>
        ))}
      </div>
      <div className="chart-grid">
        <Skeleton height={300} radius={16} />
        <Skeleton height={300} radius={16} />
      </div>
    </div>
  );
}

function Dashboard({ stats, days, from, to }: { stats: AdminStats; days: number; from: string; to: string }) {
  const reportsTotal = stats.reports_by_form.reduce((sum, r) => sum + r.count, 0);
  const period = `за ${days} дней`;
  const farmsData = [
    { key: 'kfh', name: LEGAL_STATUS_LABELS.kfh, value: stats.farms_by_status.kfh, fill: 'var(--chart-1)' },
    { key: 'ip', name: LEGAL_STATUS_LABELS.ip, value: stats.farms_by_status.ip, fill: 'var(--chart-2)' },
    { key: 'lph', name: LEGAL_STATUS_LABELS.lph, value: stats.farms_by_status.lph, fill: 'var(--chart-3)' },
  ];
  const formsData = stats.reports_by_form
    .map((r) => ({ name: formLabel(r.form_code).replace('Форма ', ''), full: formLabel(r.form_code), value: r.count }))
    .sort((a, b) => b.value - a.value);
  const noReports = reportsTotal === 0;

  return (
    <div className="stack stack--lg">
      <div className="stat-grid">
        <StatCard label="Пользователи" value={fmtNum(stats.users_total)} hint={`+${fmtNum(stats.users_new)} новых ${period}`} to="/users" tone="primary" />
        <StatCard label="Хозяйства" value={fmtNum(stats.farms_total)} hint={`КФХ ${stats.farms_by_status.kfh} · ИП ${stats.farms_by_status.ip} · ЛПХ ${stats.farms_by_status.lph}`} to="/farms" />
        <StatCard label="События журнала" value={fmtNum(stats.events_count)} hint={period} />
        <StatCard label="Сдано отчётов" value={fmtNum(reportsTotal)} hint={period} to="/reports" />
        <StatCard label="Подключён «Меркурий»" value={fmtNum(stats.mercury_connected)} hint={`из ${fmtCount(stats.farms_total, FARM_WORDS)}`} />
        <StatCard label="Подключён «Хорриот»" value={fmtNum(stats.horriot_connected)} hint={`из ${fmtCount(stats.farms_total, FARM_WORDS)}`} />
        <StatCard label="Сообщения помощнику" value={fmtNum(stats.assistant_messages)} hint={period} />
        <StatCard label="Открытые обращения" value={fmtNum(stats.open_tickets)} hint="новые и в работе" to="/support?status=new" />
      </div>

      <div className="chart-grid">
        <ChartCard
          title="События журнала по дням"
          caption={`${fmtDate(from)} — ${fmtDate(to)}`}
          table={{ headers: ['Дата', 'События'], rows: stats.daily.map((d) => [fmtDate(d.date), fmtNum(d.events)]) }}
        >
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={stats.daily} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDayMonth} tick={AXIS} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => fmtDate(String(l))} formatter={(v) => [fmtNum(Number(v)), 'События']} />
              <Area type="monotone" dataKey="events" stroke="var(--chart-1)" strokeWidth={2} fill="var(--chart-1)" fillOpacity={0.14} dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Новые пользователи по дням"
          caption={`${fmtDate(from)} — ${fmtDate(to)}`}
          table={{ headers: ['Дата', 'Новые пользователи'], rows: stats.daily.map((d) => [fmtDate(d.date), fmtNum(d.new_users)]) }}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.daily} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDayMonth} tick={AXIS} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'rgba(15,23,42,0.05)' }} contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => fmtDate(String(l))} formatter={(v) => [fmtNum(Number(v)), 'Новые пользователи']} />
              <Bar dataKey="new_users" fill="var(--chart-3)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Хозяйства по статусу" table={{ headers: ['Статус', 'Хозяйств'], rows: farmsData.map((f) => [f.name, fmtNum(f.value)]) }}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={farmsData} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={44} />
              <Tooltip cursor={{ fill: 'rgba(15,23,42,0.05)' }} contentStyle={TOOLTIP_STYLE} formatter={(v) => [fmtNum(Number(v)), 'Хозяйств']} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28} isAnimationActive={false}>
                <LabelList dataKey="value" position="right" fill="#0F172A" fontSize={13} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Сданные отчёты по формам"
          caption={period}
          table={{ headers: ['Форма', 'Сдано'], rows: formsData.map((f) => [f.full, fmtNum(f.value)]) }}
        >
          {formsData.length === 0 || noReports ? (
            <p className="muted small chart-empty">За выбранный период отчёты не сдавались.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, formsData.length * 34 + 16)}>
              <BarChart data={formsData} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={96} interval={0} />
                <Tooltip cursor={{ fill: 'rgba(15,23,42,0.05)' }} contentStyle={TOOLTIP_STYLE} labelFormatter={(_l, p) => String(p?.[0]?.payload?.full ?? '')} formatter={(v) => [fmtNum(Number(v)), 'Сдано']} />
                <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                  <LabelList dataKey="value" position="right" fill="#0F172A" fontSize={13} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

export function DashboardPage() {
  usePageTitle('Сводка');
  const [params, update] = useUrlParams();
  const period = readEnum(params.get('days'), PERIOD_VALUES, '30');
  const days = Number(period);
  const range = useMemo(() => rangeForDays(days), [days]);
  const state = useAsync(`stats:${range.from}:${range.to}`, () => api.stats(range.from, range.to));

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Сводка"
        subtitle={`Период: ${fmtDate(range.from)} — ${fmtDate(range.to)}`}
        actions={<Segmented label="Период" options={PERIODS} value={period} onChange={(v) => update({ days: v === '30' ? null : v }, { resetPage: false })} />}
      />
      <AsyncView state={state} skeleton={<DashboardSkeleton />}>
        {(stats) => (
          <div className={state.loading ? 'is-dim' : undefined}>
            <Dashboard stats={stats} days={days} from={range.from} to={range.to} />
          </div>
        )}
      </AsyncView>
    </div>
  );
}
