// Напоминания: правила типов, тексты, настройки J8, отсутствие дублей, push и чат (in-memory Supabase).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DeadlineReminder } from '../../app/src/data/contract';
import type { PushMessage, PushSender } from '../src/reminders/push';
import { DEFAULT_MEMBER_SETTINGS, kindEnabled, kindFor, reminderText, runReminders } from '../src/reminders/run';
import { hourIn, todayIn } from '../src/time';
import { FARM_ID, seedFarm, USER_ID } from './helpers/fixtures';

const NOW = new Date('2026-10-23T05:00:00Z'); // 14:00 в Якутске, 23 октября

const rem = (days_left: number): DeadlineReminder => ({
  form_code: '1-iso-r',
  title: '1-ИСО-р',
  due_on: '2026-10-30',
  days_left,
  status: days_left < 0 ? 'overdue' : 'draft',
});

class FakePush implements PushSender {
  sent: PushMessage[] = [];
  async send(messages: PushMessage[]) {
    this.sent.push(...messages);
    return messages.map((m) => ({ token: m.to, ok: !m.to.includes('dead'), invalidToken: m.to.includes('dead') }));
  }
}

describe('правила напоминаний', () => {
  it('kindFor: 7 дней, 1 день, просрочка', () => {
    assert.equal(kindFor(10), null);
    assert.equal(kindFor(8), null);
    assert.equal(kindFor(7), '7d');
    assert.equal(kindFor(2), '7d');
    assert.equal(kindFor(1), '1d');
    assert.equal(kindFor(0), '1d');
    assert.equal(kindFor(-1), 'overdue');
  });
  it('kindEnabled учитывает J8', () => {
    const s = { user_id: 'u', ...DEFAULT_MEMBER_SETTINGS };
    assert.equal(kindEnabled(s, '7d'), true);
    assert.equal(kindEnabled({ ...s, remind_7_days: false }, '7d'), false);
    assert.equal(kindEnabled({ ...s, remind_1_day: false }, '1d'), false);
    assert.equal(kindEnabled({ ...s, remind_1_day: false }, 'overdue'), true);
    assert.equal(kindEnabled({ ...s, deadline_reminders: false }, 'overdue'), false);
  });
  it('тексты как в макете', () => {
    assert.equal(reminderText(rem(7), '7d').title, 'До сдачи 1-ИСО-р осталось 7 дней');
    assert.equal(reminderText(rem(1), '1d').title, 'До сдачи 1-ИСО-р осталось 1 день');
    assert.equal(reminderText(rem(0), '1d').title, 'Сегодня последний день сдачи 1-ИСО-р');
    assert.equal(reminderText(rem(-3), 'overdue').title, '1-ИСО-р · просрочен на 3 дня');
    assert.match(reminderText(rem(7), '7d').body, /Срок: 30\.10\.2026/);
  });
  it('время хозяйства: Якутск UTC+9', () => {
    assert.equal(todayIn('Asia/Yakutsk', new Date('2026-10-23T16:00:00Z')), '2026-10-24');
    assert.equal(hourIn('Asia/Yakutsk', new Date('2026-10-23T00:00:00Z')), 9);
  });
});

describe('runReminders', () => {
  it('создаёт уведомления, сообщения в чат и push; повторный запуск не дублирует', async () => {
    const db = seedFarm();
    db.tables.push_tokens = [
      { user_id: USER_ID, token: 'ExponentPushToken[alive]', platform: 'ios' },
      { user_id: USER_ID, token: 'ExponentPushToken[dead]', platform: 'ios' },
    ];
    const push = new FakePush();
    const first = await runReminders({ svc: db.client(), push, tz: 'Asia/Yakutsk', now: NOW });
    assert.equal(first.today, '2026-10-23');
    assert.equal(first.errors.length, 0);
    assert.ok(first.notifications >= 2);
    assert.equal(db.rows('notifications').length, first.notifications);
    assert.equal(db.rows('reminder_log').length, first.notifications);
    assert.equal(db.rows('chat_messages').length, first.notifications);
    const titles = db.rows('notifications').map((n) => n.title);
    assert.ok(titles.includes('До сдачи 1-ИСО-р осталось 7 дней'));
    assert.ok(titles.includes('1-ТАБУН · просрочен на 3 дня'));
    const chat = db.rows('chat_messages')[0]!;
    assert.equal(chat.role, 'assistant');
    assert.equal(chat.user_id, USER_ID);
    assert.equal((chat.cards as { kind: string }[])[0]!.kind, 'deadline');
    // push: на первое уведомление 2 токена, мёртвый токен удаляется — на следующие остаётся один
    assert.equal(push.sent.length, 2 + (first.notifications - 1));
    assert.equal(push.sent[0]!.sound, null);
    assert.ok(!db.rows('push_tokens').some((t) => t.token === 'ExponentPushToken[dead]'));

    const second = await runReminders({ svc: db.client(), push, tz: 'Asia/Yakutsk', now: NOW });
    assert.equal(second.notifications, 0);
    assert.equal(second.skipped_duplicates, first.notifications);
    assert.equal(db.rows('notifications').length, first.notifications);
  });

  it('настройки J8: чат и push отключены, «за 7 дней» выключено', async () => {
    const db = seedFarm();
    db.tables.user_settings = [
      { user_id: USER_ID, push_enabled: false, sound: false, deadline_reminders: true, reminders_in_chat: false, remind_7_days: false, remind_1_day: true, deleted_at: null },
    ];
    db.tables.push_tokens = [{ user_id: USER_ID, token: 'ExponentPushToken[alive]', platform: 'ios' }];
    const push = new FakePush();
    const res = await runReminders({ svc: db.client(), push, tz: 'Asia/Yakutsk', now: NOW });
    assert.equal(res.chat_messages, 0);
    assert.equal(push.sent.length, 0);
    const titles = db.rows('notifications').map((n) => n.title);
    assert.ok(!titles.includes('До сдачи 1-ИСО-р осталось 7 дней'), 'напоминание за 7 дней выключено');
    assert.ok(titles.includes('1-ТАБУН · просрочен на 3 дня'));
  });

  it('звук включён → sound: default; dry_run ничего не пишет', async () => {
    const db = seedFarm();
    db.tables.user_settings = [{ user_id: USER_ID, push_enabled: true, sound: true, deadline_reminders: true, deleted_at: null }];
    db.tables.push_tokens = [{ user_id: USER_ID, token: 'ExponentPushToken[alive]', platform: 'android' }];
    const dry = await runReminders({ svc: db.client(), push: new FakePush(), tz: 'Asia/Yakutsk', now: NOW, dryRun: true });
    assert.ok(dry.notifications > 0);
    assert.equal(db.rows('notifications').length, 0);
    assert.equal(db.rows('reminder_log').length, 0);
    const push = new FakePush();
    await runReminders({ svc: db.client(), push, tz: 'Asia/Yakutsk', now: NOW });
    assert.equal(push.sent[0]!.sound, 'default');
  });

  it('участники получают свои сообщения в чат; уведомление хозяйства одно', async () => {
    const SECOND = 'a0000000-0000-4000-8000-0000000000bb';
    const db = seedFarm(undefined, FARM_ID, [USER_ID, SECOND]);
    const res = await runReminders({ svc: db.client(), push: new FakePush(), tz: 'Asia/Yakutsk', now: NOW });
    assert.equal(db.rows('notifications').length, res.notifications);
    assert.equal(db.rows('chat_messages').length, res.notifications * 2);
  });
});
