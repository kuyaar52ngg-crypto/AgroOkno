// Отправка кодов письмом через Gmail SMTP (порт 465 — 25 и 587 в Edge Functions закрыты).
// Секреты функции: GMAIL_USER (адрес отправителя) и GMAIL_APP_PASSWORD (пароль приложения Google).
// Пока секретов нет, работает демо-режим: код возвращается в ответе как demoCode.
import nodemailer from 'npm:nodemailer@7.0.13';

const user = Deno.env.get('GMAIL_USER') ?? '';
const pass = (Deno.env.get('GMAIL_APP_PASSWORD') ?? '').replace(/\s/g, '');

/** Почта настроена: коды уходят письмом, demoCode в ответах не возвращается. */
export const mailEnabled = Boolean(user && pass);

const transport = mailEnabled
  ? nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } })
  : null;

const COPY = {
  signup: {
    subject: 'код подтверждения регистрации в АгроОкно',
    lead: 'Вы регистрируетесь в АгроОкно. Введите этот код в приложении, чтобы подтвердить email:',
  },
  recovery: {
    subject: 'код входа в АгроОкно',
    lead: 'Запрошен вход в АгроОкно по коду. Введите этот код в приложении:',
  },
} as const;

/** Отправляет 6-значный код; false — письмо не ушло (подробности в логах функции). */
export async function sendCode(to: string, code: string, purpose: keyof typeof COPY): Promise<boolean> {
  if (!transport) return false;
  const { subject, lead } = COPY[purpose];
  const text = `${lead}\n\n${code}\n\nКод действует 10 минут. Если вы ничего не запрашивали, просто удалите это письмо.\n\nАгроОкно — один раз ввёл, везде сдал`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#0F172A">
  <p style="font-size:20px;font-weight:bold;color:#1E3A8A;margin:0 0 16px">АгроОкно</p>
  <p style="font-size:15px;line-height:1.5">${lead}</p>
  <p style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#1E3A8A;background:#EFF6FF;border-radius:12px;padding:16px;text-align:center">${code}</p>
  <p style="font-size:13px;color:#64748B;line-height:1.5">Код действует 10 минут. Если вы ничего не запрашивали, просто удалите это письмо.</p>
</div>`;
  try {
    await transport.sendMail({ from: `"АгроОкно" <${user}>`, to, subject: `${code} — ${subject}`, text, html });
    return true;
  } catch (e) {
    console.error('sendCode failed:', e instanceof Error ? e.message : e);
    return false;
  }
}
