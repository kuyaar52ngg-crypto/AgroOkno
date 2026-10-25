import { useRouter } from 'expo-router';
import Bot from 'lucide-react-native/icons/bot';
import LogOut from 'lucide-react-native/icons/log-out';
import { StyleSheet, View } from 'react-native';

import { initialsOf, Screen } from '@/components/Screen';
import { ListGroup, ListRow } from '@/components/ui/Cards';
import { Alert } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { Colors, Radius } from '@/constants/theme';
import { useAuth, useIsAdmin, useNotifications } from '@/data';
import type { UserRole } from '@/data/contract';

const ROLE_LABEL: Record<UserRole, string> = {
  farm_head: 'Глава КФХ / ИП',
  lph_owner: 'Владелец ЛПХ',
  council_specialist: 'Специалист сельсовета',
};

/** F1 · Профиль. */
export default function ProfileScreen() {
  const router = useRouter();
  const auth = useAuth();
  const notifications = useNotifications();
  const isAdmin = useIsAdmin();
  const overdue = (notifications.data ?? []).filter((n) => n.kind === 'overdue' && !n.read).length;
  const unread = (notifications.data ?? []).filter((n) => !n.read).length;
  const farm = auth.farm;
  const profile = auth.profile;

  const notificationsHint =
    overdue > 0
      ? `${overdue} просроченный отчет требует внимания`
      : unread > 0
        ? `Новых уведомлений: ${unread}`
        : 'Нет новых уведомлений';

  const signOut = async () => {
    await auth.signOut();
    router.replace('/welcome');
  };

  return (
    <Screen title="Профиль" subtitle="Ваш доступ и настройки приложения">
      <View style={styles.userCard}>
        <View style={styles.avatar}>
          <Text variant="subtitle" color={Colors.primary}>
            {initialsOf(profile?.full_name)}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="subtitle">{profile?.full_name ?? 'Пользователь'}</Text>
          <Text variant="caption" color={Colors.textSecondaryReadable}>
            {farm?.name}
          </Text>
          <Text variant="caption" color={Colors.primary} style={{ fontFamily: 'Onest_500Medium' }}>
            {profile?.role ? ROLE_LABEL[profile.role] : ''}
          </Text>
          <Text variant="caption" color={Colors.textSecondaryReadable}>
            {[farm?.book_record_no ? `Запись книги № ${farm.book_record_no}` : null, farm?.settlement].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      <ListGroup>
        <ListRow title="Данные хозяйства" subtitle="Название, адрес и контакты" onPress={() => router.push('/profile/farm')} />
        <ListRow title="Уведомления" subtitle={notificationsHint} onPress={() => router.push('/profile/notifications')} />
        <ListRow title="Настройки" subtitle="Напоминания, доступность, безопасность" onPress={() => router.push('/profile/settings')} />
        <ListRow title="Помощь" subtitle="Ответы и обращение в поддержку" onPress={() => router.push('/profile/help')} last />
      </ListGroup>

      {isAdmin.data === true ? (
        <ListGroup>
          <ListRow
            title="Модель помощника"
            subtitle="Администратор · выбор модели для всех пользователей"
            icon={Bot}
            onPress={() => router.push('/profile/admin')}
            last
          />
        </ListGroup>
      ) : null}

      <ListGroup>
        <ListRow title="Выйти" icon={LogOut} destructive onPress={signOut} last />
      </ListGroup>

      <Alert>Демонстрационное рабочее пространство. Учебные контакты и документы не являются реальными персональными данными.</Alert>
    </Screen>
  );
}

const styles = StyleSheet.create({
  userCard: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    padding: 16,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  avatar: { width: 64, height: 64, borderRadius: 20, backgroundColor: Colors.surfaceInfo, alignItems: 'center', justifyContent: 'center' },
});
