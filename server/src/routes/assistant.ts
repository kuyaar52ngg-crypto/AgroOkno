import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { loadAssistantContext } from '../assistant/context';
import { requireUser, userDb } from '../auth';
import type { Deps } from '../deps';
import { HttpError } from '../errors';
import { SttFormatError, SttProviderError, SttUnavailableError } from '../stt';
import { todayIn } from '../time';

const body = z.object({
  farm_id: z.string().uuid(),
  text: z.string().trim().min(1, 'Напишите сообщение').max(1000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(2000) }))
    .max(20)
    .optional(),
  from_voice: z.boolean().optional(),
});

const MAX_AUDIO_MS = 60_000;

export const assistantRoutes =
  (deps: Deps): FastifyPluginAsync =>
  async (instance) => {
    const app = instance.withTypeProvider<ZodTypeProvider>();
    app.addHook('preHandler', requireUser(deps));

    app.post(
      '/messages',
      {
        schema: {
          tags: ['assistant'],
          summary: 'Сообщение помощнику',
          description:
            'Разбирает фразу (Claude или правила). Возвращает ответ, предложенные события (NewEvent) и признак уточнения. ' +
            'Сервер ничего не сохраняет — события записывает приложение.',
          security: [{ bearer: [] }],
          body,
        },
      },
      async (req) => {
        const { farm_id, text, history } = req.body;
        const today = todayIn(deps.env.TZ_REGION, deps.clock());
        const context = await loadAssistantContext(userDb(deps, req), farm_id, req.user!.id, today);
        const out = await deps.assistant.respond({ text, context, history: history ?? [] });
        return { reply: out.reply, proposed_events: out.proposed_events, needs_clarification: out.needs_clarification, engine: out.engine_used };
      },
    );

    app.post(
      '/transcribe',
      {
        schema: {
          tags: ['assistant'],
          summary: 'Распознавание голосового сообщения',
          description: 'multipart/form-data: поле audio (аудио ≤ 5 МБ), необязательное duration_ms (≤ 60000). Провайдер задаёт STT_PROVIDER.',
          security: [{ bearer: [] }],
          consumes: ['multipart/form-data'],
        },
      },
      async (req) => {
        if (!req.isMultipart()) throw new HttpError(400, 'Отправьте аудио как multipart/form-data (поле audio)', 'bad_request');
        let audio: Buffer | null = null;
        let mime = '';
        let filename: string | undefined;
        let durationMs: number | null = null;
        for await (const part of req.parts()) {
          if (part.type === 'file') {
            if (part.fieldname !== 'audio' || audio) {
              await part.toBuffer().catch(() => undefined);
              continue;
            }
            mime = (part.mimetype || '').toLowerCase();
            filename = part.filename || undefined;
            audio = await part.toBuffer(); // выбросит FST_REQ_FILE_TOO_LARGE при > 5 МБ
          } else if (part.fieldname === 'duration_ms') {
            const n = Number(part.value);
            if (Number.isFinite(n)) durationMs = n;
          }
        }
        if (!audio || audio.length === 0) throw new HttpError(400, 'Не нашли запись: передайте аудио в поле audio', 'no_audio');
        if (!/^audio\//.test(mime) && !/^video\/(mp4|webm)$/.test(mime) && mime !== 'application/ogg') {
          throw new HttpError(415, 'Нужна аудиозапись (audio/*)', 'unsupported_media');
        }
        if (durationMs !== null && durationMs > MAX_AUDIO_MS) throw new HttpError(413, 'Запись длиннее 60 секунд — запишите короче', 'too_long');

        try {
          const text = await deps.stt.transcribe(audio, mime, filename);
          if (!text) throw new HttpError(422, 'Не удалось разобрать речь — повторите или напишите текстом', 'empty_transcript');
          return { text };
        } catch (e) {
          if (e instanceof SttUnavailableError) throw new HttpError(503, e.message, 'stt_unavailable');
          if (e instanceof SttFormatError) throw new HttpError(415, e.message, 'unsupported_format');
          if (e instanceof SttProviderError) throw new HttpError(502, 'Сервис распознавания речи вернул ошибку — напишите текстом', 'stt_error');
          throw e;
        }
      },
    );
  };
