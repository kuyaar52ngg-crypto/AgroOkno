import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { registerPushToken } from '@/data';

function debug(message: string, error?: unknown): void {
  if (__DEV__) console.log(`[push] ${message}`, error ?? '');
}

/**
 * Разрешение → Expo push-токен → registerPushToken.
 * Всё «мягкое»: в вебе, на симуляторе, в Expo Go на Android (SDK 53+ не поддерживает push) и при любой ошибке
 * регистрация тихо пропускается — приложение работает без push. Модуль expo-notifications подгружается лениво,
 * чтобы в Expo Go на Android его импорт даже не выполнялся.
 */
async function registerForPush(): Promise<void> {
  try {
    if (Platform.OS === 'web') return debug('web: пропуск');
    if (!Device.isDevice) return debug('не физическое устройство: пропуск');
    if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      return debug('Expo Go на Android не поддерживает push: пропуск');
    }
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Напоминания об отчетах',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!granted) return debug('разрешение не выдано: пропуск');
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await registerPushToken(token.data, Platform.OS === 'ios' ? 'ios' : 'android');
  } catch (error) {
    debug('регистрация push пропущена', error);
  }
}

/** Регистрирует push-токен один раз за запуск, когда пользователь вошёл и прошёл онбординг. */
export function usePushRegistration(enabled: boolean): void {
  const started = useRef(false);
  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    void registerForPush();
  }, [enabled]);
}
