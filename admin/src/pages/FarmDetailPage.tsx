import { Link, useParams } from 'react-router-dom';

import { api } from '../api';
import type { AdminFarmDetail } from '../api';
import { useAsync } from '../hooks/useAsync';
import { usePageTitle } from '../hooks/usePageTitle';
import { fmtDate, fmtDateTime, fmtPeriod, orDash } from '../lib/format';
import { connectionLabel, connectionTone, formLabel, joinStatusLabel, joinStatusTone, legalStatusLabel, memberRoleLabel } from '../lib/labels';
import { AsyncView } from '../ui/AsyncView';
import { Button } from '../ui/Button';
import { Badge, Card, DefinitionList, PageHeader, SkeletonBlock } from '../ui/Display';
import { EmptyState } from '../ui/States';
import { useToast } from '../ui/toast';

function FarmCard({ farm }: { farm: AdminFarmDetail }) {
  const toast = useToast();

  const copy = async () => {
    if (!farm.invite_code) return;
    try {
      await navigator.clipboard.writeText(farm.invite_code);
      toast.success('Код приглашения скопирован');
    } catch {
      toast.error('Не удалось скопировать. Выделите код и скопируйте вручную');
    }
  };

  return (
    <div className="stack stack--lg">
      <PageHeader
        title={farm.name}
        subtitle={
          <span className="badges">
            <Badge tone="info">{legalStatusLabel(farm.legal_status)}</Badge>
            <span>ИНН {orDash(farm.inn)}</span>
          </span>
        }
        back={{ to: '/farms', label: 'Хозяйства' }}
      />

      <div className="two-col">
        <Card title="Реквизиты">
          <DefinitionList
            items={[
              { label: 'ИНН', value: orDash(farm.inn) },
              { label: 'ОГРН', value: orDash(farm.ogrn) },
              { label: 'ОКТМО', value: orDash(farm.oktmo) },
              { label: 'Регион', value: orDash(farm.region) },
              { label: 'Населённый пункт', value: orDash(farm.settlement) },
              { label: 'Адрес', value: orDash(farm.address) },
              { label: 'Запись в похозяйственной книге', value: orDash(farm.book_record_no) },
              {
                label: 'Код приглашения',
                value: farm.invite_code ? (
                  <span className="row">
                    <code>{farm.invite_code}</code>
                    <Button variant="ghost" size="sm" onClick={copy}>
                      Копировать
                    </Button>
                  </span>
                ) : (
                  '—'
                ),
              },
              { label: 'Создано', value: fmtDateTime(farm.created_at) },
            ]}
          />
        </Card>

        <Card title="Состояние">
          <DefinitionList
            items={[
              { label: 'Меркурий', value: <Badge tone={connectionTone(farm.mercury_status)}>{connectionLabel(farm.mercury_status)}</Badge> },
              { label: 'Хорриот', value: <Badge tone={connectionTone(farm.horriot_status)}>{connectionLabel(farm.horriot_status)}</Badge> },
              { label: 'Сдано отчётов', value: farm.reports_submitted },
              { label: 'Последняя активность', value: farm.last_activity_at ? fmtDateTime(farm.last_activity_at) : 'Нет данных' },
              {
                label: 'Владелец',
                value: farm.owner ? (
                  <span>
                    <Link to={`/users/${farm.owner.id}`}>{farm.owner.full_name?.trim() || 'Без имени'}</Link>
                    <br />
                    <span className="caption">{orDash(farm.owner.email)}</span>
                  </span>
                ) : (
                  '—'
                ),
              },
            ]}
          />
        </Card>
      </div>

      <Card title={`Участники (${farm.members.length})`} flush>
        {farm.members.length === 0 ? (
          <EmptyState title="Участников нет" />
        ) : (
          <ul className="list">
            {farm.members.map((m) => (
              <li key={m.user_id} className="list__item">
                <div className="cell-main">
                  <Link to={`/users/${m.user_id}`}>{m.full_name?.trim() || 'Без имени'}</Link>
                  <span className="caption">{orDash(m.email)}</span>
                </div>
                <Badge tone={m.role === 'owner' ? 'info' : 'neutral'}>{memberRoleLabel(m.role)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Запросы доступа (${farm.join_requests.length})`} flush>
        {farm.join_requests.length === 0 ? (
          <EmptyState title="Запросов нет">Никто не просил добавить его в это хозяйство.</EmptyState>
        ) : (
          <ul className="list">
            {farm.join_requests.map((r) => (
              <li key={r.id} className="list__item">
                <div className="cell-main">
                  <Link to={`/users/${r.user_id}`}>{r.full_name?.trim() || 'Без имени'}</Link>
                  <span className="caption">{fmtDateTime(r.created_at)}</span>
                </div>
                <Badge tone={joinStatusTone(r.status)}>{joinStatusLabel(r.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Сданные отчёты (${farm.submissions.length})`} flush>
        {farm.submissions.length === 0 ? (
          <EmptyState title="Отчёты не сдавались" />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Форма</th>
                  <th scope="col">Период</th>
                  <th scope="col">Квитанция</th>
                  <th scope="col">Сдан</th>
                </tr>
              </thead>
              <tbody>
                {farm.submissions.map((s) => (
                  <tr key={s.id}>
                    <td>{formLabel(s.form_code)}</td>
                    <td>{fmtPeriod(s.period_year, s.period_month)}</td>
                    <td>{s.receipt_no ? <code>{s.receipt_no}</code> : '—'}</td>
                    <td className="nowrap">{fmtDate(s.submitted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export function FarmDetailPage() {
  const { id = '' } = useParams();
  const state = useAsync(`farm:${id}`, () => api.getFarm(id));
  usePageTitle(state.data?.name ?? 'Хозяйство');

  return (
    <AsyncView
      state={state}
      skeleton={
        <div className="stack stack--lg">
          <PageHeader title="Хозяйство" back={{ to: '/farms', label: 'Хозяйства' }} />
          <Card>
            <SkeletonBlock lines={6} />
          </Card>
        </div>
      }
    >
      {(farm) => <FarmCard farm={farm} />}
    </AsyncView>
  );
}
