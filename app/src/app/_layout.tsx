import { Onest_400Regular, Onest_500Medium, Onest_600SemiBold } from '@expo-google-fonts/onest';
import { Unbounded_600SemiBold } from '@expo-google-fonts/unbounded';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FontScaleProvider } from '@/components/ui/Text';
import { Colors, FontScale, Layout } from '@/constants/theme';
import { DataProvider, useAuth, useOnboardingStep, useSettings } from '@/data';
import { OnboardingProvider, useOnboarding } from '@/hooks/onboarding';
import { usePushRegistration } from '@/hooks/usePushRegistration';
import { RecoveryProvider, useRecovery } from '@/hooks/recovery';

SplashScreen.preventAutoHideAsync();

function AppShell() {
  const auth = useAuth();
  const settings = useSettings();
  const { recovering } = useRecovery();
  const { holdOnboarding, nextRoute, setNextRoute } = useOnboarding();
  const router = useRouter();
  const step = useOnboardingStep();
  const scale = FontScale[settings.data?.text_size ?? 'standard'];

  const signedOut = auth.status === 'signed_out';
  const signedIn = auth.status === 'signed_in';
  // Онбординг: роль (R3) → хозяйство (R4–R8) → экран «Хозяйство создано» (R6, пока его не закроют).
  const onboarding = signedIn && !recovering && (step !== null || holdOnboarding);
  const inApp = signedIn && !recovering && step === null && !holdOnboarding;
  const authReady = auth.status !== 'loading';

  usePushRegistration(inApp);

  // Переход, отложенный до выхода из онбординга («Добавить первое событие» на R6).
  useEffect(() => {
    if (inApp && nextRoute) {
      router.navigate(nextRoute);
      setNextRoute(null);
    }
  }, [inApp, nextRoute, router, setNextRoute]);

  useEffect(() => {
    if (authReady) SplashScreen.hideAsync();
  }, [authReady]);

  if (!authReady) return null;

  return (
    <FontScaleProvider value={scale}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
        <Stack.Protected guard={signedOut || recovering}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={onboarding}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={inApp}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="assistant" />
          <Stack.Screen name="delete-event" options={{ presentation: 'transparentModal', animation: 'fade' }} />
          <Stack.Screen name="reminders" />
        </Stack.Protected>
      </Stack>
    </FontScaleProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Unbounded_600SemiBold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <View style={styles.page}>
        <View style={styles.column}>
          <DataProvider>
            <RecoveryProvider>
              <OnboardingProvider>
                <AppShell />
              </OnboardingProvider>
            </RecoveryProvider>
          </DataProvider>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Platform.OS === 'web' ? Colors.border : Colors.background, alignItems: 'center' },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: Layout.maxWidth,
    backgroundColor: Colors.background,
    ...(Platform.OS === 'web' ? { overflow: 'hidden' as const } : null),
  },
});
