// Yandex SpeechKit (синхронное распознавание, до 30 с и 1 МБ в одном запросе v1; длиннее — используйте openai или асинхронный API).
// https://yandex.cloud/ru/docs/speechkit/stt/request
import { SttFormatError, SttProviderError, SttUnavailableError, type SttProvider } from './types';

export interface YandexOptions {
  apiKey: string;
  folderId: string;
  fetchImpl?: typeof fetch;
}

function formatFor(mime: string): { format: string; extra: string } {
  const m = mime.toLowerCase();
  if (/ogg|opus/.test(m)) return { format: 'oggopus', extra: '' };
  if (/mpeg|mp3/.test(m)) return { format: 'mp3', extra: '' };
  if (/wav|l16|lpcm|pcm/.test(m)) return { format: 'lpcm', extra: '&sampleRateHertz=48000' };
  throw new SttFormatError(
    `Формат записи ${mime} не поддерживается Yandex SpeechKit. Используйте OGG/Opus, MP3 или WAV, либо STT_PROVIDER=openai`,
  );
}

export function createYandexStt(options: YandexOptions): SttProvider {
  const doFetch = options.fetchImpl ?? fetch;
  return {
    name: 'yandex',
    async transcribe(audio, mimeType) {
      const { format, extra } = formatFor(mimeType);
      const url =
        `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?lang=ru-RU&topic=general&format=${format}` +
        `&folderId=${encodeURIComponent(options.folderId)}${extra}`;
      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: { Authorization: `Api-Key ${options.apiKey}`, 'Content-Type': 'application/octet-stream' },
          body: new Uint8Array(audio),
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new SttUnavailableError('Сервис распознавания речи недоступен — напишите текстом');
      }
      const body = (await res.json().catch(() => ({}))) as { result?: string; error_message?: string };
      if (!res.ok) throw new SttProviderError(body.error_message ?? `SpeechKit вернул ${res.status}`);
      return (body.result ?? '').trim();
    },
  };
}
