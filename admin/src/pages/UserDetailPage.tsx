import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api } from '../api';
import type { AdminUserDetail } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { usePageTitle } from '../hooks/usePageTitle';
import { fmtDate, fmtDateTime, fmtNum, orDash } from '../lib/format';
import { legalStatusLabel, memberRoleLabel, roleLabel, ticketStatusLabel, ticketStatusTone } from '../lib/labels';
import { buildSearch } from '../lib/query';
import { banLabel, isBanned } from '../lib/users';
import { AsyncView } from '../ui/AsyncView';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Badge, Card, DefinitionList, PageHeader, SkeletonBlock } from '../ui/Display';
import { Textarea } from '../ui/Fields';
import { Alert, EmptyState } from '../ui/States';
import { useToast } from '../ui/toast';
import { UserStatusBadges } from './UsersPage';

type Action = 'block' | 'unblock' | 'grant' | 'revoke' | null;

function UserCard({ user, onChanged }: { user: AdminUserDetail; onChanged: () => void }) {
  const { session } = useAuth();
  const toast = useToast();
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState('');
  const isSelf = session?.userId === user.id;
  const banned = isBanned(user.banned_until);
  const name = user.full_name?.trim() || 'Без имени';

  const close = () => {
    setAction(null);
    setReason('');
  };

  const done = (message: string) => {
    toast.success(message);
    close();
    onChanged();
  };

  return (
    <div className="stack stack--lg">
      <PageHeader
        title={name}
        subtitle={<UserStatusBadges user={user} />}
        back={{ to: '/users', label: 'Пользователи' }}
        actions={
          <>
            {banned ? (
              <Button variant="secondary" onClick={() => setAction('unblock')}>
                Разблокировать
              </Button>
            ) : (
              <Button variant="danger" onClick={() => setAction('block')} disabled={isSelf} title={isSelf ? 'Нельзя заблокировать себя' : undefined}>
                Заблокировать
              </Button>
            )}
            {user.is_admin ? (
              <Button variant="secondary" onClick={() => setAction('revoke')} disabled={isSelf} title={isSelf ? 'Нельзя снять права с себя' : undefined}>
                Снять права администратора
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setAction('grant')}>
                Выдать права администратора
              </Button>
            )}
          </>
        }
      />

      {banned ? (
        <Alert tone="warning" title="Учётная запись заблокирована">
          Пользователь не может войти в приложение. Разблокировать можно кнопкой выше.
        </Alert>
      ) : null}

      <div className="two-col">
        <Card title="Основное">
          <DefinitionList
            items={[
              { label: 'Роль', value: roleLabel(user.role) },
              { label: 'Email', value: orDash(user.email) },
              { label: 'Телефон', value: orDash(user.phone) },
              { label: 'Населённый пункт', value: orDash(user.settlement) },
              { label: 'Дата регистрации', value: fmtDateTime(user.created_at) },
              { label: 'Последний вход', value: user.last_sign_in_at ? fmtDateTime(user.last_sign_in_at) : 'Не входил' },
              { label: 'Событий за 30 дней', value: fmtNum(user.events_30d) },
              { label: 'Блокировка', value: banLabel(user.banned_until, fmtDate) ?? 'Нет' },
            ]}
          />
        </Card>

        <Card title={`Хозяйства (${user.farms.length})`} flush>
          {user.farms.length === 0 ? (
            <EmptyState title="Хозяйств нет">Пользователь пока не создал хозяйство и не вступил в чужое.</EmptyState>
          ) : (
            <ul className="list">
              {user.farms.map((f) => (
                <li key={f.id} className="list__item">
                  <div className="cell-main">
                    <Link to={`/farms/${f.id}`}>{f.name}</Link>
                    <span className="caption">ИНН {orDash(f.inn)}</span>
                  </div>
                  <span className="badges">
                    <Badge tone="info">{legalStatusLabel(f.legal_status)}</Badge>
                    <Badge>{memberRoleLabel(f.member_role)}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={`Обращения в поддержку (${user.tickets.length})`} flush>
        {user.tickets.length === 0 ? (
          <EmptyState title="Обращений нет" />
        ) : (
          <ul className="list">
            {user.tickets.map((t) => (
              <li key={t.id} className="list__item">
                <div className="cell-main">
                  <Link to={`/support${buildSearch({ ticket: t.number })}`}>{t.number}</Link>
                  <span className="caption">{t.topic}</span>
                </div>
                <span className="badges">
                  <Badge tone={ticketStatusTone(t.status)}>{ticketStatusLabel(t.status)}</Badge>
                  <span className="caption nowrap">{fmtDate(t.created_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={action === 'block'}
        title="Заблокировать пользователя?"
        confirmLabel="Заблокировать"
        busyLabel="Блокируем…"
        onCancel={close}
        onConfirm={async () => {
          await api.blockUser(user.id, reason);
          done('Пользователь заблокирован');
        }}
      >
        <p>
          <strong>{name}</strong> не сможет войти в приложение, пока вы не разблокируете учётную запись. Действие попадёт в журнал.
        </p>
        <Textarea label="Причина (необязательно)" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} hint="Сохраняется в журнале действий." />
        <p className="caption">Действие выполняет сервер: если он простаивал, ответ может прийти не сразу.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={action === 'unblock'}
        title="Разблокировать пользователя?"
        tone="primary"
        confirmLabel="Разблокировать"
        busyLabel="Разблокируем…"
        onCancel={close}
        onConfirm={async () => {
          await api.unblockUser(user.id);
          done('Пользователь разблокирован');
        }}
      >
        <p>
          <strong>{name}</strong> снова сможет входить в приложение.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={action === 'grant'}
        title="Выдать права администратора?"
        tone="primary"
        confirmLabel="Выдать права"
        busyLabel="Выдаём…"
        onCancel={close}
        onConfirm={async () => {
          await api.setAdmin(user.id, true);
          done('Права администратора выданы');
        }}
      >
        <p>
          <strong>{name}</strong> получит доступ к этой панели: просмотр данных всех хозяйств, рассылки, смена модели помощника.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={action === 'revoke'}
        title="Снять права администратора?"
        confirmLabel="Снять права"
        busyLabel="Снимаем…"
        onCancel={close}
        onConfirm={async () => {
          await api.setAdmin(user.id, false);
          done('Права администратора сняты');
        }}
      >
        <p>
          <strong>{name}</strong> потеряет доступ к панели администратора.
        </p>
      </ConfirmDialog>
    </div>
  );
}

export function UserDetailPage() {
  const { id = '' } = useParams();
  const state = useAsync(`user:${id}`, () => api.getUser(id));
  usePageTitle(state.data?.full_name?.trim() || 'Пользователь');

  return (
    <AsyncView
      state={state}
      skeleton={
        <div className="stack stack--lg">
          <PageHeader title="Пользователь" back={{ to: '/users', label: 'Пользователи' }} />
          <Card>
            <SkeletonBlock lines={6} />
          </Card>
        </div>
      }
    >
      {(user) => <UserCard user={user} onChanged={state.reload} />}
    </AsyncView>
  );
}
