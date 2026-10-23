import { Tabs } from 'expo-router/js-tabs';

import { BottomNavigation, NAV_ITEMS } from '@/components/ui/BottomNavigation';
import { Colors } from '@/constants/theme';

// Порядок кнопок в нижней панели (как в макете). Он не совпадает с порядком экранов ниже:
// экраны объявлены в порядке сортировки файлов, иначе Expo Router при монтировании шлёт
// ROUTE_NAMES_CHANGED, которое никто не обрабатывает (dev-предупреждение).
const TAB_ORDER = ['(home)', 'add', 'reports', 'profile'];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: Colors.background } }}
      tabBar={({ state, navigateToTab }) => (
        <BottomNavigation
          items={TAB_ORDER.filter((name) => state.routes.some((r) => r.name === name)).map((name) => NAV_ITEMS[name])}
          activeKey={state.routes[state.index]?.name ?? '(home)'}
          onPress={(key) => {
            const route = state.routes.find((r) => r.name === key);
            if (!route) return;
            navigateToTab(route.key);
          }}
        />
      )}
    >
      <Tabs.Screen name="(home)" options={{ title: 'Хозяйство' }} />
      <Tabs.Screen name="add" options={{ title: 'Добавить' }} />
      <Tabs.Screen name="profile" options={{ title: 'Профиль' }} />
      <Tabs.Screen name="reports" options={{ title: 'Отчеты' }} />
    </Tabs>
  );
}
