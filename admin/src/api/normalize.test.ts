import { describe, expect, it } from 'vitest';

import { normalizeFarmDetail, normalizePaged, normalizeStats, normalizeUserDetail } from './normalize';

describe('нормализация ответов RPC', () => {
  it('normalizePaged', () => {
    expect(normalizePaged({ total: 5, items: [{ id: 1 }] })).toEqual({ total: 5, items: [{ id: 1 }] });
    expect(normalizePaged({ total: '7', items: [] })).toEqual({ total: 7, items: [] });
    expect(normalizePaged({ items: [1, 2] })).toEqual({ total: 2, items: [1, 2] });
    expect(normalizePaged(null)).toEqual({ total: 0, items: [] });
  });

  it('normalizeStats подставляет нули и пустые массивы', () => {
    const empty = normalizeStats({});
    expect(empty.users_total).toBe(0);
    expect(empty.farms_by_status).toEqual({ kfh: 0, ip: 0, lph: 0 });
    expect(empty.reports_by_form).toEqual([]);
    expect(empty.daily).toEqual([]);

    const s = normalizeStats({
      users_total: 10,
      farms_by_status: { kfh: 2, ip: 1, lph: 7 },
      reports_by_form: [{ form_code: '1-tabun', count: '4' }],
      daily: [{ date: '2026-10-25', events: 12, new_users: 1 }],
    });
    expect(s.users_total).toBe(10);
    expect(s.farms_by_status.lph).toBe(7);
    expect(s.reports_by_form).toEqual([{ form_code: '1-tabun', count: 4 }]);
    expect(s.daily[0]).toEqual({ date: '2026-10-25', events: 12, new_users: 1 });
  });

  it('карточки пользователя и хозяйства без вложенных списков не падают', () => {
    const u = normalizeUserDetail({ id: 'u1', full_name: 'А' });
    expect(u.farms).toEqual([]);
    expect(u.tickets).toEqual([]);
    expect(u.events_30d).toBe(0);
    expect(u.is_admin).toBe(false);
    const f = normalizeFarmDetail({ id: 'f1', name: 'Х' });
    expect(f.members).toEqual([]);
    expect(f.join_requests).toEqual([]);
    expect(f.submissions).toEqual([]);
    expect(f.reports_submitted).toBe(0);
  });
});
