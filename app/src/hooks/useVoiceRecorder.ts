import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { VoiceClip } from '@/data/contract';

export type VoiceStatus = 'idle' | 'starting' | 'recording' | 'denied' | 'error';

/** Максимальная длина записи (серверный лимит ≤ 60 с). */
export const MAX_VOICE_MS = 60_000;
const TICK_MS = 90;
/** Не более столько последних значений уровня хранится для осциллограммы. */
const MAX_LEVELS = 40;

const MIME_TYPE = Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a';

/** dB (−160…0) → 0…1. Без метринга (веб, часть устройств) рисуем мягкую «живую» волну. */
function toLevel(metering: number | undefined, elapsedMs: number): number {
  if (typeof metering === 'number' && Number.isFinite(metering)) {
    return Math.max(0.08, Math.min(1, (metering + 55) / 55));
  }
  return 0.2 + 0.55 * Math.abs(Math.sin(elapsedMs / 170) * Math.cos(elapsedMs / 61));
}

export interface VoiceRecorder {
  status: VoiceStatus;
  /** Миллисекунды с начала записи. */
  elapsedMs: number;
  /** Последние уровни звука 0…1 (новые — справа). */
  levels: number[];
  /** Запросить микрофон и начать запись. Итог — в status ('recording' | 'denied' | 'error'). */
  start: () => Promise<void>;
  /** Остановить запись и вернуть клип; null — запись пустая или не удалась. */
  finish: () => Promise<VoiceClip | null>;
  /** Остановить и выбросить запись. */
  cancel: () => Promise<void>;
  /** Сбросить статус 'denied' / 'error' (например, «Написать текстом»). */
  dismiss: () => void;
}

/** Запись голоса через expo-audio (работает в Expo Go): разрешение, таймер, метринг для осциллограммы. */
export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const startedAt = useRef(0);
  const active = useRef(false);

  useEffect(() => {
    if (status !== 'recording') return undefined;
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      setElapsedMs(elapsed);
      let metering: number | undefined;
      try {
        metering = recorder.getStatus().metering;
      } catch {
        metering = undefined;
      }
      setLevels((prev) => [...prev.slice(-(MAX_LEVELS - 1)), toLevel(metering, elapsed)]);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [status, recorder]);

  const resetAudioMode = useCallback(async () => {
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      // режим звука не критичен после остановки записи
    }
  }, []);

  const start = useCallback(async () => {
    if (active.current) return;
    setStatus('starting');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setStatus('denied');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: MAX_VOICE_MS / 1000 });
      startedAt.current = Date.now();
      active.current = true;
      setElapsedMs(0);
      setLevels([]);
      setStatus('recording');
    } catch (error) {
      if (__DEV__) console.log('[voice] не удалось начать запись', error);
      // На вебе отказ в доступе приходит исключением NotAllowedError — это тоже «микрофон недоступен».
      const name = error instanceof Error ? error.name : '';
      setStatus(name === 'NotAllowedError' || name === 'SecurityError' || name === 'NotFoundError' ? 'denied' : 'error');
    }
  }, [recorder]);

  const stopRecorder = useCallback(async (): Promise<{ uri: string | null; durationMs: number }> => {
    const durationMs = Math.max(0, Date.now() - startedAt.current);
    active.current = false;
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch (error) {
      if (__DEV__) console.log('[voice] не удалось остановить запись', error);
    }
    await resetAudioMode();
    return { uri, durationMs };
  }, [recorder, resetAudioMode]);

  const finish = useCallback(async (): Promise<VoiceClip | null> => {
    if (!active.current) return null;
    const { uri, durationMs } = await stopRecorder();
    setStatus('idle');
    if (!uri) return null;
    return { uri, mimeType: MIME_TYPE, durationMs };
  }, [stopRecorder]);

  const cancel = useCallback(async () => {
    if (active.current) await stopRecorder();
    setStatus('idle');
  }, [stopRecorder]);

  const dismiss = useCallback(() => setStatus('idle'), []);

  return { status, elapsedMs, levels, start, finish, cancel, dismiss };
}
