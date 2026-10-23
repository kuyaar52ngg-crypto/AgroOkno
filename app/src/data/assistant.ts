// Чат-помощник (J1–J7): запрос к Node.js-серверу, сохранение предложенных событий тем же путём, что useCreateEvent
// (офлайн-очередь, журнал), карточка «Сохранённое событие» (J4) и отмена записи (мягкое удаление).
// Сервер событий не пишет — только предлагает. История чата — таблица chat_messages (синхронизируется).
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';

import { ApiCallError, serverBase, serverFetch } from '../lib/api';
import { nowIso, todayIso } from '../lib/clock';
import { newId } from '../lib/ids';
import { fmtDate, headsWord, fmtNum } from '../reports/format';
import { computeDeadlineReminders } from '../reports/reminders';
import { kgToLiters } from '../reports/period';
import * as actions from './actions';
import { emitChange } from './bus';
import type {
  AssistantChat,
  ChatCard,
  ChatMessage,
  JournalEntry,
  NewEvent,
  Uuid,
  VoiceClip,
} from './contract';
import { currentFarm, currentFarmData, findEntry } from './entities';
import { net } from './net';
import { currentUserId, session } from './session';
import { getDoc, putLocal, rows, softDelete, type Row } from './store';
import { requestSync } from './sync';
import { useVersion } from './hooks';

const SUGGESTIONS = ['Какие отчеты скоро сдавать?', 'Как проверить отчет?', 'Записать надой'];
const RETENTION_MS = 90 * 24 * 3600_000;
const HISTORY_LIMIT = 8;

// ─── Состояние чата вне React ───────────────────────────────────────────────

interface Runtime {
  sending: boolean;
  error: string | null;
  /** Сообщение пользователя, пока идёт запрос (ещё не сохранено в истории). */
  pending: ChatMessage | null;
  /** Не отправленные сообщения (нет сети / сервер недоступен) — только в памяти. */
  failed: ChatMessage[];
  /** Сервер помощника отвечает: null — ещё не проверяли. */
  reachable: boolean | null;
  greetingAt: string;
}

const runtime: Runtime = { sending: false, error: null, pending: null, failed: [], reachable: null, greetingAt: nowIso() };

function patch(p: Partial<Runtime>): void {
  Object.assign(runtime, p);
  emitChange();
}

let probing = false;
/** Быстрая проверка /health: определяет флаг available (офлайн-плашка J1). */
export async function probeAssistant(): Promise<void> {
  const base = serverBase();
  if (probing) return;
  if (!base) {
    patch({ reachable: false });
    return;
  }
  probing = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${base}/health`, { signal: controller.signal });
    patch({ reachable: res.ok });
  } catch {
    patch({ reachable: false });
  } finally {
    clearTimeout(timer);
    probing = false;
  }
}

// ─── Сообщения ──────────────────────────────────────────────────────────────

function toChatMessage(r: Row): ChatMessage {
  const role = r.role === 'user' ? 'user' : 'assistant';
  const cards = Array.isArray(r.cards) ? (r.cards as ChatCard[]) : undefined;
  return {
    id: String(r.id),
    role,
    text: String(r.text),
    created_at: String(r.created_at),
    ...(cards && cards.length > 0 ? { cards } : {}),
    ...(role === 'user' ? { status: 'sent' as const } : {}),
    ...(r.from_voice ? { from_voice: true } : {}),
  };
}

/** История текущего пользователя в его хозяйстве за последние 90 дней, по возрастанию времени. */
function persisted(): ChatMessage[] {
  const me = currentUserId();
  const farm = currentFarm();
  const from = new Date(Date.now() - RETENTION_MS).toISOString();
  return rows('chat_messages')
    .filter((r) => r.user_id === me && (!farm || r.farm_id === farm.id) && String(r.created_at) >= from)
    .map(toChatMessage)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function greeting(first: ChatMessage | undefined): ChatMessage {
  const farmData = currentFarmData();
  const name = (getDoc('profiles', currentUserId() ?? '')?.data.full_name as string | null | undefined)?.trim();
  const reminders = farmData ? computeDeadlineReminders({ data: farmData, today: todayIso() }).slice(0, 3) : [];
  return {
    id: 'greeting',
    role: 'assistant',
    text: `Здравствуйте${name ? `, ${name}` : ''}!\nСкажите: «Сегодня коровы дали 120 литров молока». Я запишу надой в журнал.`,
    created_at: first ? new Date(Date.parse(first.created_at) - 1).toISOString() : runtime.greetingAt,
    ...(reminders.length > 0 ? { cards: reminders.map((reminder): ChatCard => ({ kind: 'deadline', reminder })) } : {}),
  };
}

export function chatMessages(): ChatMessage[] {
  const saved = persisted();
  const tail = [...runtime.failed, ...(runtime.pending ? [runtime.pending] : [])];
  const merged = [...saved, ...tail].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return [greeting(merged[0]), ...merged];
}

function putChat(msg: { id?: string; role: 'user' | 'assistant'; text: string; cards?: ChatCard[]; from_voice?: boolean; created_at?: string }): ChatMessage {
  const farm = currentFarm();
  const user = currentUserId();
  if (!farm || !user) throw new Error('Хозяйство не найдено. Дождитесь загрузки данных');
  const now = nowIso();
  const row: Row = {
    id: msg.id ?? newId(),
    farm_id: farm.id,
    user_id: user,
    role: msg.role,
    text: msg.text,
    cards: msg.cards && msg.cards.length > 0 ? msg.cards : null,
    from_voice: msg.from_voice ?? false,
    created_at: msg.created_at ?? now,
    updated_at: now,
    deleted_at: null,
  };
  putLocal('chat_messages', 'id', row);
  requestSync();
  return toChatMessage(row);
}

// ─── Карточка «Сохранённое событие» (J4) ────────────────────────────────────

const GROUP_NAMES: Record<string, string> = {
  cattle_cows: 'Коровы', cattle_calves: 'Телята', cattle_other: 'КРС прочие', pigs_sows: 'Свиноматки', pigs_other: 'Свиньи',
  sheep: 'Овцы', goats: 'Козы', horses_mares: 'Кобылы', horses_young: 'Молодняк лошадей', horses_stallions: 'Жеребцы',
  horses_other: 'Лошади', deer: 'Олени', poultry: 'Птица', rabbits: 'Кролики',
};
const KIND_NAMES: Record<string, string> = {
  birth: 'Приплод', death: 'Падёж', slaughter: 'Забой', sale: 'Продажа', sale_slaughter: 'Продажа на убой', purchase: 'Покупка',
  transfer_in: 'Перевод в группу', transfer_out: 'Перевод из группы', opening_balance: 'Остаток',
};
const PRODUCT_UNITS: Record<string, string> = { milk: 'л', eggs: 'шт', wool: 'кг', honey: 'кг' };
const FEED_NAMES: Record<string, string> = { hay: 'Сено', haylage: 'Сенаж', silage: 'Силос', grain: 'Зерно', other: 'Корма' };

export function savedEventCard(entry: JournalEntry): ChatCard {
  const rowsOut: { label: string; value: string }[] = [];
  const add = (label: string, value: string) => rowsOut.push({ label, value });
  switch (entry.type) {
    case 'product_output':
    case 'product_sale': {
      const qty = entry.product === 'milk' ? `${fmtNum(kgToLiters(entry.quantity))} л` : `${fmtNum(entry.quantity)} ${PRODUCT_UNITS[entry.product]}`;
      add('Тип', entry.type === 'product_sale' ? 'Продажа' : { milk: 'Надой', eggs: 'Яйца', wool: 'Шерсть', honey: 'Мёд' }[entry.product]);
      if (entry.type === 'product_output' && entry.source_group) add('Животные', GROUP_NAMES[entry.source_group] ?? entry.source_group);
      add('Количество', qty);
      break;
    }
    case 'livestock':
      add('Тип', KIND_NAMES[entry.kind] ?? 'Событие');
      add('Животные', GROUP_NAMES[entry.animal_group] ?? entry.animal_group);
      add('Количество', `${entry.heads} ${headsWord(entry.heads)}`);
      break;
    case 'feed':
      add('Тип', 'Корма');
      add('Корм', FEED_NAMES[entry.feed] ?? entry.feed);
      add('Количество', `${fmtNum(entry.quantity_t)} т`);
      break;
    case 'crop':
      add('Тип', 'Растениеводство');
      add('Культура', entry.crop);
      add('Площадь', `${fmtNum(entry.area_ha)} га`);
      break;
  }
  add('Дата', fmtDate(entry.occurred_on));
  add('Журнал', 'Журнал учета');
  return { kind: 'saved_event', entry_id: entry.id, rows: rowsOut };
}

// ─── Отправка ───────────────────────────────────────────────────────────────

interface AssistantApiResponse {
  reply: ChatMessage;
  proposed_events: NewEvent[];
  needs_clarification: boolean;
}

function recentHistory(): { role: 'user' | 'assistant'; text: string }[] {
  return persisted()
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role, text: m.text.slice(0, 1500) }));
}

function failMessage(text: string, fromVoice: boolean, error: string): void {
  const message: ChatMessage = { id: newId(), role: 'user', text, created_at: nowIso(), status: 'failed', ...(fromVoice ? { from_voice: true } : {}) };
  patch({ pending: null, sending: false, error, failed: [...runtime.failed, message] });
}

async function deliver(text: string, fromVoice: boolean): Promise<void> {
  const farm = currentFarm();
  const created_at = nowIso();
  if (!farm) {
    patch({ error: 'Хозяйство не найдено. Дождитесь загрузки данных' });
    return;
  }
  const history = recentHistory();
  patch({
    sending: true,
    error: null,
    failed: runtime.failed.filter((m) => m.text !== text),
    pending: { id: newId(), role: 'user', text, created_at, status: 'sent', ...(fromVoice ? { from_voice: true } : {}) },
  });
  try {
    const res = await serverFetch<AssistantApiResponse>('/v1/assistant/messages', {
      json: { farm_id: farm.id, text, history, from_voice: fromVoice },
      timeoutMs: 30_000,
    });
    runtime.reachable = true;

    const cards: ChatCard[] = [...(res.reply.cards ?? [])];
    const errors: string[] = [];
    for (const event of res.proposed_events) {
      try {
        cards.push(savedEventCard(actions.createEvent(event)));
      } catch (e) {
        errors.push(e instanceof Error ? e.message : 'Не удалось сохранить событие');
      }
    }
    let replyText = res.reply.text;
    if (res.proposed_events.length > 0 && errors.length === res.proposed_events.length) {
      replyText = `Не удалось сохранить: ${errors[0]}. Ничего не записано — проверьте данные и повторите.`;
    } else if (errors.length > 0) {
      replyText = `${replyText}\nЧасть записей не сохранена: ${errors.join('; ')}`;
    }
    // Сначала снимаем «ожидающее» сообщение, затем сохраняем пару в историю — без мигания дубля.
    runtime.pending = null;
    putChat({ role: 'user', text, from_voice: fromVoice, created_at });
    putChat({ id: res.reply.id, role: 'assistant', text: replyText, cards });
    patch({ sending: false });
  } catch (e) {
    const err = e instanceof ApiCallError ? e : null;
    if (err && err.status === 0) runtime.reachable = false;
    const message =
      err?.status === 0
        ? 'Нет связи. Сообщение не отправлено — повторите, когда появится интернет.'
        : (err?.message ?? 'Не удалось отправить сообщение. Попробуйте ещё раз');
    failMessage(text, fromVoice, message);
  }
}

async function send(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || runtime.sending) return;
  await deliver(trimmed, false);
}

async function buildAudioForm(clip: VoiceClip): Promise<FormData> {
  const form = new FormData();
  const ext = /webm/.test(clip.mimeType) ? 'webm' : /ogg|opus/.test(clip.mimeType) ? 'ogg' : /wav/.test(clip.mimeType) ? 'wav' : /mpeg|mp3/.test(clip.mimeType) ? 'mp3' : 'm4a';
  if (Platform.OS === 'web') {
    const blob = await (await fetch(clip.uri)).blob();
    form.append('audio', blob, `voice.${ext}`);
  } else {
    // React Native: файл по uri отправляется как часть multipart.
    form.append('audio', { uri: clip.uri, name: `voice.${ext}`, type: clip.mimeType } as unknown as Blob);
  }
  form.append('duration_ms', String(Math.round(clip.durationMs)));
  return form;
}

async function sendVoice(clip: VoiceClip): Promise<void> {
  if (runtime.sending) return;
  patch({ sending: true, error: null });
  try {
    const { text } = await serverFetch<{ text: string }>('/v1/assistant/transcribe', { form: await buildAudioForm(clip), timeoutMs: 60_000 });
    runtime.reachable = true;
    runtime.sending = false;
    await deliver(text.trim(), true);
  } catch (e) {
    const err = e instanceof ApiCallError ? e : null;
    if (err?.status === 0) {
      runtime.reachable = false;
      const message: ChatMessage = { id: newId(), role: 'user', text: 'Голосовое сообщение', created_at: nowIso(), status: 'failed', from_voice: true };
      patch({ sending: false, error: 'Нет связи. Голосовое сообщение не отправлено — запишите еще раз, когда появится интернет, или напишите текстом.', failed: [...runtime.failed, message] });
      return;
    }
    // 503 «Распознавание речи не настроено — напишите текстом», 413/415/422 — текст ошибки показывает UI.
    patch({ sending: false, error: err?.message ?? 'Не удалось распознать запись. Попробуйте ещё раз или напишите текстом.' });
  }
}

async function undoEvent(entryId: Uuid): Promise<void> {
  const entry = findEntry(entryId);
  const label = entry ? savedLabel(entry) : 'Событие';
  if (entry) actions.deleteEvent(entryId, entry.type);
  // Убираем карточку из сообщений и добавляем подтверждение.
  const me = currentUserId();
  for (const r of rows('chat_messages')) {
    if (r.user_id !== me || !Array.isArray(r.cards)) continue;
    const cards = (r.cards as ChatCard[]).filter((c) => !(c.kind === 'saved_event' && c.entry_id === entryId));
    if (cards.length !== (r.cards as ChatCard[]).length) {
      putLocal('chat_messages', 'id', { ...r, cards: cards.length > 0 ? cards : null, updated_at: nowIso() });
    }
  }
  putChat({ role: 'assistant', text: `Запись отменена. ${label} удален из журнала.` });
  requestSync();
}

function savedLabel(entry: JournalEntry): string {
  if (entry.type === 'product_output') return entry.product === 'milk' ? 'Надой' : 'Сбор продукции';
  if (entry.type === 'livestock') return KIND_NAMES[entry.kind] ?? 'Событие';
  if (entry.type === 'product_sale') return 'Продажа';
  return 'Запись';
}

function reset(): void {
  const me = currentUserId();
  const at = nowIso();
  for (const r of rows('chat_messages')) if (r.user_id === me) softDelete('chat_messages', String(r.id), at);
  requestSync();
  patch({ failed: [], pending: null, error: null, sending: false });
}

/** Состояние чата для хука useAssistantChat. */
export function useAssistantChatImpl(): AssistantChat {
  const version = useVersion();
  useEffect(() => {
    void probeAssistant();
    // Пока сервер не отвечает, пробуем снова — плашка «нет связи» снимется сама.
    const timer = setInterval(() => {
      if (runtime.reachable !== true) void probeAssistant();
    }, 10_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net.online]);
  return useMemo(
    (): AssistantChat => ({
      messages: session.status === 'signed_in' ? chatMessages() : [],
      suggestions: SUGGESTIONS,
      sending: runtime.sending,
      error: runtime.error,
      available: net.online && runtime.reachable !== false,
      send,
      sendVoice,
      undoEvent,
      reset,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );
}
