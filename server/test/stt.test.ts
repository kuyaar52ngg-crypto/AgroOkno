// Провайдеры распознавания речи: mock (503 с понятным текстом), openai, yandex — с подменённым fetch.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSttProvider, SttFormatError, SttProviderError, SttUnavailableError } from '../src/stt';
import { mockStt } from '../src/stt/mock';
import { createOpenAiStt } from '../src/stt/openai';
import { createYandexStt } from '../src/stt/yandex';
import { parseEnv } from '../src/env';

const BASE_ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key' };
const audio = Buffer.from([1, 2, 3, 4]);

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('mock', () => {
  it('бросает SttUnavailableError с текстом «напишите текстом»', async () => {
    await assert.rejects(
      () => mockStt.transcribe(audio, 'audio/m4a'),
      (e: unknown) => e instanceof SttUnavailableError && e.status === 503 && /Распознавание речи не настроено — напишите текстом/.test(e.message),
    );
  });
  it('выбирается по умолчанию (STT_PROVIDER не задан)', () => {
    assert.equal(createSttProvider(parseEnv(BASE_ENV)).name, 'mock');
  });
});

describe('openai', () => {
  it('отправляет multipart с моделью и языком ru и возвращает текст', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const stt = createOpenAiStt({
      apiKey: 'sk-test',
      model: 'whisper-1',
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return jsonResponse({ text: ' Сегодня коровы дали 120 литров молока ' });
      }) as unknown as typeof fetch,
    });
    assert.equal(await stt.transcribe(audio, 'audio/m4a'), 'Сегодня коровы дали 120 литров молока');
    assert.equal(seen!.url, 'https://api.openai.com/v1/audio/transcriptions');
    const form = seen!.init.body as FormData;
    assert.equal(form.get('language'), 'ru');
    assert.equal(form.get('model'), 'whisper-1');
    assert.equal((form.get('file') as File).name, 'voice.m4a');
    assert.equal((seen!.init.headers as Record<string, string>).Authorization, 'Bearer sk-test');
  });
  it('ошибка провайдера → SttProviderError; сеть → SttUnavailableError', async () => {
    const bad = createOpenAiStt({ apiKey: 'k', model: 'm', fetchImpl: (async () => jsonResponse({ error: { message: 'quota' } }, 429)) as unknown as typeof fetch });
    await assert.rejects(() => bad.transcribe(audio, 'audio/mpeg'), SttProviderError);
    const down = createOpenAiStt({ apiKey: 'k', model: 'm', fetchImpl: (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch });
    await assert.rejects(() => down.transcribe(audio, 'audio/mpeg'), SttUnavailableError);
  });
});

describe('yandex', () => {
  it('SpeechKit v1: lang=ru-RU, формат по MIME, Api-Key', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const stt = createYandexStt({
      apiKey: 'yk',
      folderId: 'b1gfolder',
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return jsonResponse({ result: 'надой сто литров' });
      }) as unknown as typeof fetch,
    });
    assert.equal(await stt.transcribe(audio, 'audio/ogg'), 'надой сто литров');
    assert.match(seen!.url, /stt\.api\.cloud\.yandex\.net\/speech\/v1\/stt:recognize\?lang=ru-RU/);
    assert.match(seen!.url, /format=oggopus/);
    assert.match(seen!.url, /folderId=b1gfolder/);
    assert.equal((seen!.init.headers as Record<string, string>).Authorization, 'Api-Key yk');
  });
  it('m4a не поддерживается → SttFormatError с подсказкой', async () => {
    const stt = createYandexStt({ apiKey: 'yk', folderId: 'f', fetchImpl: (async () => jsonResponse({})) as unknown as typeof fetch });
    await assert.rejects(() => stt.transcribe(audio, 'audio/m4a'), SttFormatError);
  });
});

describe('конфигурация провайдера', () => {
  it('yandex без ключей и openai без ключа → понятная ошибка env', () => {
    assert.throws(() => parseEnv({ ...BASE_ENV, STT_PROVIDER: 'yandex' }), /YANDEX_API_KEY/);
    assert.throws(() => parseEnv({ ...BASE_ENV, STT_PROVIDER: 'openai' }), /OPENAI_API_KEY/);
    assert.equal(createSttProvider(parseEnv({ ...BASE_ENV, STT_PROVIDER: 'openai', OPENAI_API_KEY: 'k' })).name, 'openai');
    assert.equal(createSttProvider(parseEnv({ ...BASE_ENV, STT_PROVIDER: 'yandex', YANDEX_API_KEY: 'k', YANDEX_FOLDER_ID: 'f' })).name, 'yandex');
  });
  it('пустые значения env игнорируются, некорректный URL — ошибка на русском', () => {
    const env = parseEnv({ ...BASE_ENV, OPENROUTER_API_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '  ' });
    assert.equal(env.OPENROUTER_API_KEY, undefined);
    assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert.equal(env.PORT, 3001);
    assert.equal(env.TZ_REGION, 'Asia/Yakutsk');
    assert.throws(() => parseEnv({ SUPABASE_URL: 'not-a-url', SUPABASE_PUBLISHABLE_KEY: 'x' }), /Некорректная конфигурация/);
  });
});
