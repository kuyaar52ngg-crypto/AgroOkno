// Клиентские uuid (записи создаются офлайн и доезжают до сервера с тем же id).
import { randomUUID } from 'expo-crypto';

export const newId = (): string => randomUUID();
