import { Redirect } from 'expo-router';

import { useAuth } from '@/data';

/** Защищённые маршруты вне доступа (например, «/» без входа) и неизвестные адреса ведут на подходящий экран. */
export default function NotFound() {
  const auth = useAuth();
  if (auth.status === 'signed_in') {
    return auth.profile?.role ? <Redirect href="/" /> : <Redirect href="/role" />;
  }
  return <Redirect href="/welcome" />;
}
