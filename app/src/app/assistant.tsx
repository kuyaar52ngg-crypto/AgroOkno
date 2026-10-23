import { useLocalSearchParams, useRouter } from 'expo-router';
import { House, Settings2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatCardView } from '@/components/assistant/ChatCards';
import { Composer, VoicePanel } from '@/components/assistant/Composer';
import { initialsOf } from '@/components/Screen';
import { OfflineBanner } from '@/components/OfflineBanner';
import { AppHeader } from '@/components/ui/AppHeader';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { fmtDateLong, fmtDateOfTime, fmtTime } from '@/constants/format';
import { Colors, Layout, Radius } from '@/constants/theme';
import { useAssistantChat, useAuth, useFarm } from '@/data';
import type { ChatMessage, DeadlineReminder } from '@/data/contract';
import { MAX_VOICE_MS, useVoiceRecorder } from '@/hooks/useVoiceRecorder';

function isoOfMessage(message: ChatMessage | undefined): string {
  const display = fmtDateOfTime(message?.created_at);
  if (!display) return '';
  const [d, m, y] = display.split('.');
  return `${y}-${m}-${d}`;
}

function AssistantText({ message, first }: { message: ChatMessage; first: boolean }) {
  const [head, ...rest] = message.text.split('\n');
  const hasCards = (message.cards?.length ?? 0) > 0;
  const savedEvent = message.cards?.some((c) => c.kind === 'saved_event') ?? false;
  // J6: ответ с карточками — простой текст над карточками; остальное — «пузырь» помощника.
  if (hasCards && !savedEvent && !first) {
    return (
      <Text variant="body" color={Colors.text}>
        {message.text}
      </Text>
    );
  }
  return (
    <View style={styles.bubble}>
      <Text variant="bodySemibold" style={{ lineHeight: 22 }}>
        {head}
      </Text>
      {rest.length > 0 ? (
        <Text variant={first ? 'bodyLg' : 'small'} color={first ? Colors.text : Colors.textSecondaryReadable} style={first ? { lineHeight: 24 } : { lineHeight: 21 }}>
          {rest.join('\n')}
        </Text>
      ) : null}
    </View>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  const failed = message.status === 'failed';
  const time = fmtTime(message.created_at);
  const status = failed ? 'Не отправлено' : 'Отправлено';
  return (
    <View style={styles.userWrap}>
      <View style={[styles.userBubble, failed && styles.userBubbleFailed]}>
        <Text variant="bodyLg" color={failed ? Colors.textErrorReadable : Colors.onPrimary} style={{ lineHeight: 22 }}>
          {message.text}
        </Text>
      </View>
      <Text variant="caption" color={failed ? Colors.textErrorReadable : Colors.textSecondaryReadable} style={{ textAlign: 'right' }}>
        {`Вы · ${time}${message.from_voice ? ' · голосом' : ''} · ${status}`}
      </Text>
    </View>
  );
}

/** J1–J7 · Чат-помощник. */
export default function AssistantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ record?: string }>();
  const auth = useAuth();
  const farm = useFarm();
  const chat = useAssistantChat();
  const voice = useVoiceRecorder();
  const [draft, setDraft] = useState('');
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const stick = useRef(false);
  const autostarted = useRef(false);

  const messages = chat.messages;
  const hasUserMessage = messages.some((m) => m.role === 'user');
  const last = messages[messages.length - 1];
  const lastSaved = last?.role === 'assistant' ? last.cards?.find((c) => c.kind === 'saved_event') : undefined;
  const awaitingQuantity = last?.role === 'assistant' && /литров/i.test(last.text) && /\?/.test(last.text);
  const recording = voice.status === 'recording' || voice.status === 'starting' || voiceBusy;
  const hint = draft.trim().length > 0 && /молок|надо/i.test(draft) ? 'Нажмите «Отправить» — запишу надой в журнал.' : null;
  const farmName = farm.data?.name ?? auth.farm?.name ?? 'Хозяйство';
  const region = farm.data?.region ?? auth.farm?.region ?? null;
  const place = [farm.data?.settlement ?? auth.farm?.settlement, region?.includes('Якутия') ? 'Якутия' : region].filter(Boolean).join(' · ');

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    stick.current = true;
    setDraft('');
    setNotice(null);
    voice.dismiss();
    await chat.send(text);
  };

  const startRecording = async () => {
    setNotice(null);
    if (!chat.available) {
      setNotice('Нет связи: голосовое сообщение не дойдет до помощника. Напишите текстом — сообщение сохранится как «Не отправлено» — или запишите голос, когда появится интернет.');
      return;
    }
    stick.current = true;
    await voice.start();
  };

  const finishRecording = async () => {
    if (voiceBusy) return;
    setVoiceBusy(true);
    try {
      const clip = await voice.finish();
      if (!clip) {
        setNotice('Не удалось сохранить запись. Попробуйте еще раз или напишите текстом.');
        return;
      }
      stick.current = true;
      await chat.sendVoice(clip);
    } finally {
      setVoiceBusy(false);
    }
  };

  const cancelRecording = async () => {
    await voice.cancel();
  };

  const openSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      setNotice('Не удалось открыть настройки. Откройте настройки устройства вручную и разрешите доступ к микрофону для АгроОкно.');
    }
  };

  const writeText = () => {
    voice.dismiss();
    setNotice(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // «Микрофон» на главной открывает чат и сразу начинает запись.
  const { start: startVoice } = voice;
  useEffect(() => {
    if (params.record === '1' && !autostarted.current) {
      autostarted.current = true;
      void startVoice();
    }
  }, [params.record, startVoice]);

  // Лимит записи — 60 секунд: по достижении сохраняем автоматически.
  const limitHit = recording && voice.status === 'recording' && voice.elapsedMs >= MAX_VOICE_MS;
  useEffect(() => {
    if (!limitHit) return undefined;
    const timer = setTimeout(() => void finishRecording(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitHit]);

  const openReport = (reminder: DeadlineReminder) => router.navigate({ pathname: '/reports/[form]', params: { form: reminder.form_code } });

  const undo = async (entryId: string) => {
    setUndoing(true);
    try {
      await chat.undoEvent(entryId);
    } finally {
      setUndoing(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ height: insets.top }} />
      <AppHeader initials={initialsOf(auth.profile?.full_name)} onAvatarPress={() => router.navigate('/profile')} />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          if (stick.current) scrollRef.current?.scrollToEnd({ animated: true });
        }}
      >
        <View style={styles.titleBlock}>
          <View style={styles.navRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Моё хозяйство"
              onPress={() => router.navigate('/')}
              style={styles.homeButton}
            >
              <Icon icon={House} size={24} color={Colors.primary} />
              <Text variant="button" color={Colors.primary} style={{ fontSize: 16, lineHeight: 24 }}>
                Моё хозяйство
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Настроить напоминания"
              onPress={() => router.push('/reminders')}
              style={styles.settingsButton}
            >
              <Icon icon={Settings2} size={20} color={Colors.primary} />
            </Pressable>
          </View>
          <Text variant="h1" accessibilityRole="header">
            Чат-помощник
          </Text>
          <View style={styles.farmRow}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="label">{farmName}</Text>
              {place ? (
                <Text variant="caption" color={Colors.textSecondaryReadable}>
                  {place}
                </Text>
              ) : null}
            </View>
            <Text variant="caption" color={Colors.primary} style={{ fontFamily: 'Onest_500Medium' }}>
              Бот
            </Text>
          </View>
        </View>

        {!chat.available ? <OfflineBanner /> : null}

        <View style={{ gap: 12 }}>
          {messages.length > 0 ? (
            <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
              {fmtDateLong(isoOfMessage(messages[0]))}
            </Text>
          ) : null}
          {messages.map((message, index) => {
            if (message.role === 'user') return <UserMessage key={message.id} message={message} />;
            const needsFooter = message.cards?.some((c) => c.kind === 'how_to') ?? false;
            return (
              <View key={message.id} style={{ gap: 12 }}>
                <Text variant="label" color={Colors.primary}>
                  Помощник АгроОкно
                </Text>
                <AssistantText message={message} first={index === 0} />
                {message.cards?.map((card, cardIndex) => (
                  <ChatCardView key={`${message.id}-${cardIndex}`} card={card} deadlineVariant={index === 0 ? 'brief' : 'full'} onOpenReport={openReport} />
                ))}
                {needsFooter ? (
                  <View style={{ gap: 6 }}>
                    <Text variant="caption" color={Colors.textSecondaryReadable}>
                      {`Перед отправкой уточните актуальную применимость форм для ${farmName}. Помощник не отправляет отчеты за вас.`}
                    </Text>
                    <Text variant="caption" color={Colors.textSecondaryReadable}>
                      {`По данным ваших отчетов · ${fmtDateOfTime(message.created_at)}`}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
          {chat.sending ? (
            <View style={{ gap: 12 }} accessibilityLiveRegion="polite" accessibilityLabel="Помощник отвечает">
              <Text variant="label" color={Colors.primary}>
                Помощник АгроОкно
              </Text>
              <View style={styles.bubble}>
                <Text variant="small" color={Colors.textSecondaryReadable}>
                  Печатает…
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {!hasUserMessage && !recording && voice.status !== 'denied' ? (
          <View style={{ gap: 8 }}>
            <Text variant="label" color={Colors.textSecondaryReadable}>
              Спросите помощника
            </Text>
            {chat.suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                title={suggestion}
                variant="secondary"
                disabled={chat.sending}
                onPress={async () => {
                  stick.current = true;
                  await chat.send(suggestion);
                }}
              />
            ))}
            <Text variant="caption" color={Colors.textSecondaryReadable}>
              Отправку отчета вы подтверждаете сами, после проверки данных.
            </Text>
          </View>
        ) : null}

        {voice.status === 'denied' ? (
          <View style={{ gap: 12 }}>
            <Alert tone="warning" title="Микрофон недоступен">
              Доступ не предоставлен. Разрешите доступ к микрофону в настройках устройства.
            </Alert>
            <Button title="Открыть настройки" onPress={openSettings} />
            <Button title="Написать текстом" variant="secondary" onPress={writeText} />
            <Text variant="caption" color={Colors.textSecondaryReadable}>
              Вы можете задать вопрос в поле ниже, без микрофона.
            </Text>
          </View>
        ) : null}
        {voice.status === 'error' ? (
          <Alert tone="error" title="Не удалось начать запись">
            Попробуйте еще раз или напишите текстом.
          </Alert>
        ) : null}
        {notice ? <Alert tone="warning">{notice}</Alert> : null}
        {chat.error ? <Alert tone={chat.available ? 'error' : 'warning'}>{chat.error}</Alert> : null}
      </ScrollView>

      <View style={[styles.panel, { paddingBottom: 8 + Math.max(insets.bottom, 12) }]}>
        {recording ? (
          <VoicePanel elapsedMs={voice.elapsedMs} levels={voice.levels} busy={voiceBusy} onDone={finishRecording} onCancel={cancelRecording} />
        ) : (
          <View style={{ gap: 12 }}>
            {lastSaved && lastSaved.kind === 'saved_event' ? (
              <Text variant="title" style={{ fontSize: 16, lineHeight: 22 }}>
                Надой сохранен
              </Text>
            ) : null}
            <Composer
              value={draft}
              onChangeText={setDraft}
              onSend={send}
              onMic={startRecording}
              disabled={chat.sending}
              hint={hint}
              placeholder={awaitingQuantity ? 'Скажите или напишите количество' : 'Напишите или скажите…'}
              inputRef={inputRef}
            />
            {lastSaved && lastSaved.kind === 'saved_event' ? (
              <View style={{ gap: 8 }}>
                <View style={styles.actionsRow}>
                  <Button
                    title="Изменить"
                    variant="secondary"
                    compact
                    style={{ flex: 1 }}
                    onPress={() => router.navigate({ pathname: '/journal/[id]', params: { id: lastSaved.entry_id } })}
                  />
                  <Button
                    title="Отменить запись"
                    variant="ghost"
                    compact
                    style={{ flex: 1 }}
                    loading={undoing}
                    loadingTitle="Отменяем…"
                    onPress={() => undo(lastSaved.entry_id)}
                  />
                </View>
                <Button title="Открыть журнал" onPress={() => router.navigate('/journal')} />
              </View>
            ) : null}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { flexGrow: 1, paddingHorizontal: Layout.screenPadding, paddingTop: 4, paddingBottom: 24, gap: 20 },
  titleBlock: { gap: 12 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  homeButton: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
  },
  settingsButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  farmRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bubble: { padding: 16, gap: 6, borderRadius: Radius.xl, backgroundColor: Colors.surfaceInfoSoft },
  userWrap: { alignItems: 'flex-end', gap: 6 },
  userBubble: {
    maxWidth: '88%',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: Radius.xl,
    borderBottomRightRadius: 6,
    backgroundColor: Colors.primary,
  },
  userBubbleFailed: { backgroundColor: Colors.surfaceError, borderWidth: 1, borderColor: Colors.error },
  panel: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  actionsRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
});
