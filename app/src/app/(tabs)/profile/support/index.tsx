import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { Paperclip, Send, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { SUPPORT_SECTIONS, SUPPORT_TOPICS } from '@/constants/labels';
import { Colors, Radius } from '@/constants/theme';
import { useCreateSupportTicket } from '@/data';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** F6 · Обращение в поддержку. */
export default function SupportScreen() {
  const router = useRouter();
  const create = useCreateSupportTicket();
  const [topic, setTopic] = useState<string>(SUPPORT_TOPICS[0]);
  const [section, setSection] = useState<string | null>(SUPPORT_SECTIONS[0]);
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<{ uri: string; name: string } | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messageError = message.trim().length < 10 ? 'Опишите вопрос подробнее — не менее 10 символов' : null;

  const pick = async () => {
    setAttachmentError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > MAX_ATTACHMENT_BYTES) {
        setAttachmentError('Файл больше 5 МБ. Выберите файл поменьше.');
        return;
      }
      setAttachment({ uri: asset.uri, name: asset.name });
    } catch {
      setAttachmentError('Не удалось выбрать файл. Попробуйте еще раз.');
    }
  };

  const submit = async () => {
    setShowErrors(true);
    setError(null);
    if (messageError) return;
    try {
      const ticket = await create.run({
        topic,
        related_section: section,
        message: message.trim(),
        attachment_uri: attachment?.uri ?? null,
      });
      router.replace({
        pathname: '/profile/support/sent',
        params: { number: ticket.number, topic: ticket.topic, section: ticket.related_section ?? '', at: ticket.created_at },
      });
    } catch {
      setError('Не удалось отправить обращение. Текст не потерян — повторите попытку.');
    }
  };

  return (
    <Screen
      title="Обращение в поддержку"
      subtitle="Опишите вопрос — так проще разобраться"
      back={{ label: 'Помощь', fallback: '/profile/help' }}
    >
      <View style={{ gap: 20 }}>
        <Select label="Тема" value={topic} options={SUPPORT_TOPICS.map((t) => ({ value: t, label: t }))} onChange={setTopic} />
        <Select
          label="Связанная форма / раздел"
          value={section}
          options={SUPPORT_SECTIONS.map((s) => ({ value: s, label: s }))}
          onChange={setSection}
        />
        <Input
          label="Сообщение"
          value={message}
          onChangeText={setMessage}
          multiline
          minHeight={120}
          placeholder="Например: вижу просрочку 1-ТАБУН на 3 дня. Подскажите, как проверить данные и отправить отчет после установленного срока?"
          error={showErrors ? messageError : null}
        />
        <View style={styles.attachment}>
          <Text variant="label" style={{ fontSize: 13 }}>
            Вложение · необязательно
          </Text>
          <Text variant="caption" color={Colors.textSecondaryReadable}>
            {attachment ? attachment.name : 'Можно приложить снимок экрана без личных данных. Файл пока не выбран.'}
          </Text>
          {attachment ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Убрать вложение"
              onPress={() => setAttachment(null)}
              style={styles.remove}
            >
              <Icon icon={X} size={18} color={Colors.primary} />
              <Text variant="smallMedium" color={Colors.primary}>
                Убрать файл
              </Text>
            </Pressable>
          ) : (
            <Button title="Прикрепить файл" icon={Paperclip} variant="secondary" compact onPress={pick} />
          )}
          {attachmentError ? (
            <Text variant="caption" color={Colors.textErrorReadable}>
              {attachmentError}
            </Text>
          ) : null}
        </View>
      </View>
      <Alert tone="warning">
        Не отправляйте пароли, коды доступа, ключи API и лишние персональные данные. Проверьте вложение перед отправкой.
      </Alert>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <View style={{ gap: 12 }}>
        <Button title="Отправить обращение" icon={Send} onPress={submit} loading={create.pending} loadingTitle="Отправляем…" />
        <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
          Демонстрационная форма · обращение еще не отправлено
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  attachment: {
    padding: 16,
    gap: 8,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' },
});
