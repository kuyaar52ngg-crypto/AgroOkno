import { describe, expect, it } from 'vitest';

import {
  AUDIT_ACTIONS,
  actionLabel,
  authorityLabel,
  connectionLabel,
  connectionTone,
  describeBroadcastTarget,
  formLabel,
  isLegalStatus,
  isTicketStatus,
  joinStatusLabel,
  legalStatusLabel,
  memberRoleLabel,
  roleLabel,
  submissionStatusLabel,
  targetPath,
  targetTypeLabel,
  ticketStatusLabel,
  ticketStatusTone,
} from './labels';

describe('роли и статусы по-русски', () => {
  it('роли пользователей', () => {
    expect(roleLabel('farm_head')).toBe('Глава КФХ');
    expect(roleLabel('lph_owner')).toBe('Владелец ЛПХ');
    expect(roleLabel('council_specialist')).toBe('Специалист сельсовета');
    expect(roleLabel(null)).toBe('Не выбрана');
    expect(roleLabel('unknown_role')).toBe('unknown_role');
  });

  it('статусы хозяйств КФХ/ИП/ЛПХ', () => {
    expect(legalStatusLabel('kfh')).toBe('КФХ');
    expect(legalStatusLabel('ip')).toBe('ИП');
    expect(legalStatusLabel('lph')).toBe('ЛПХ');
    expect(legalStatusLabel(null)).toBe('—');
    expect(isLegalStatus('kfh')).toBe(true);
    expect(isLegalStatus('llc')).toBe(false);
    expect(isLegalStatus(null)).toBe(false);
  });

  it('роли в хозяйстве', () => {
    expect(memberRoleLabel('owner')).toBe('Владелец');
    expect(memberRoleLabel('member')).toBe('Участник');
  });

  it('статусы обращений и их тон', () => {
    expect(ticketStatusLabel('new')).toBe('Новое');
    expect(ticketStatusLabel('in_progress')).toBe('В работе');
    expect(ticketStatusLabel('answered')).toBe('Отвечено');
    expect(ticketStatusLabel('closed')).toBe('Закрыто');
    expect(ticketStatusLabel('weird')).toBe('weird');
    expect(ticketStatusTone('new')).toBe('warning');
    expect(ticketStatusTone('answered')).toBe('success');
    expect(ticketStatusTone('weird')).toBe('neutral');
    expect(isTicketStatus('closed')).toBe(true);
    expect(isTicketStatus('')).toBe(false);
  });

  it('подключения Меркурия и Хорриота', () => {
    expect(connectionLabel('connected_demo')).toBe('Подключено (демо)');
    expect(connectionLabel('not_connected')).toBe('Не подключено');
    expect(connectionLabel(null)).toBe('Не подключено');
    expect(connectionTone('connected_demo')).toBe('success');
    expect(connectionTone('not_connected')).toBe('neutral');
  });

  it('запросы доступа и отчёты', () => {
    expect(joinStatusLabel('pending')).toBe('Ожидает решения');
    expect(submissionStatusLabel('submitted')).toBe('Сдан');
    expect(submissionStatusLabel('failed')).toBe('Ошибка отправки');
  });

  it('формы и ведомства', () => {
    expect(formLabel('1-tabun')).toBe('Форма 1-ТАБУН');
    expect(formLabel('x-form')).toBe('x-form');
    expect(authorityLabel('rosstat')).toBe('Росстат');
  });
});

describe('журнал действий', () => {
  it('известные коды переводятся, незнакомые остаются как есть', () => {
    expect(actionLabel('user.block')).toBe('Блокировка пользователя');
    expect(actionLabel('user.revoke_admin')).toBe('Снятие прав администратора');
    expect(actionLabel('deadline.update')).toBe('Изменение срока отчёта');
    expect(actionLabel('ticket.reply')).toBe('Ответ на обращение');
    expect(actionLabel('broadcast.send')).toBe('Рассылка');
    expect(actionLabel('some.new_action')).toBe('some.new_action');
    expect(AUDIT_ACTIONS.every((code) => actionLabel(code) !== code)).toBe(true);
    expect(targetTypeLabel('user')).toBe('Пользователь');
    expect(targetTypeLabel(null)).toBe('—');
  });

  it('ссылка на объект только для пользователей и хозяйств', () => {
    expect(targetPath('user', 'abc')).toBe('/users/abc');
    expect(targetPath('farm', 'f1')).toBe('/farms/f1');
    expect(targetPath('ticket', 't1')).toBeNull();
    expect(targetPath('user', null)).toBeNull();
  });
});

describe('получатели рассылки', () => {
  it('разные формы jsonb', () => {
    expect(describeBroadcastTarget({ target: 'all' })).toBe('Все хозяйства');
    expect(describeBroadcastTarget('all')).toBe('Все хозяйства');
    expect(describeBroadcastTarget({ type: 'status', status: 'kfh' })).toBe('Хозяйства со статусом КФХ');
    expect(describeBroadcastTarget({ target: 'farms', farm_ids: ['a', 'b', 'c'] })).toBe('Выбранные хозяйства (3)');
    expect(describeBroadcastTarget({ target: 'farms' })).toBe('Выбранные хозяйства');
    expect(describeBroadcastTarget(null)).toBe('—');
    expect(describeBroadcastTarget({})).toBe('—');
  });
});
