import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

export const unstable_settings = { anchor: 'welcome' };

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />;
}
