import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

/** Общий layout вложенных стеков вкладок: шапка и «назад» рисуются самими экранами. */
export default function StackLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />;
}
