// OpenAI Whisper (audio/transcriptions). Принимает m4a, mp3, mp4, wav, webm, ogg.
import { SttProviderError, SttUnavailableError, type SttProvider } from './types';

export interface OpenAiSttOptions {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}

const EXT: Record<string, string> = {
  'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mp4': 'm4a', 'audio/aac': 'm4a', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/ogg': 'ogg', 'video/mp4': 'mp4',
};

export function createOpenAiStt(options: OpenAiSttOptions): SttProvider {
  const doFetch = options.fetchImpl ?? fetch;
  return {
    name: 'openai',
    async transcribe(audio, mimeType, filename) {
      const ext = EXT[mimeType.toLowerCase().split(';')[0]!.trim()] ?? 'm4a';
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), filename ?? `voice.${ext}`);
      form.append('model', options.model);
      form.append('language', 'ru');
      form.append('response_format', 'json');
      let res: Response;
      try {
        res = await doFetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${options.apiKey}` },
          body: form,
          signal: AbortSignal.timeout(45_000),
        });
      } catch {
        throw new SttUnavailableError('Сервис распознавания речи недоступен — напишите текстом');
      }
      const body = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
      if (!res.ok) throw new SttProviderError(body.error?.message ?? `OpenAI вернул ${res.status}`);
      return (body.text ?? '').trim();
    },
  };
}
