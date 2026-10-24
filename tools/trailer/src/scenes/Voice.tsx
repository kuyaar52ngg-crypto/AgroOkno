import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { AppHeader, Card, clamp, Icon, Phone, Rise, SoftBackground, typed, useSpring } from "../ui";

const PHRASE = "Сегодня коровы дали 120 литров молока";
// Запись голоса: кадры 12..72, затем распознанный текст уходит в чат.
const REC_END = 72;

const Wave: React.FC<{ bars: number; height: number; color: string; gap?: number; width?: number }> = ({ bars, height, color, gap = 5, width = 5 }) => {
  const frame = useCurrentFrame();
  const live = interpolate(frame, [10, 16, REC_END - 6, REC_END], [0, 1, 1, 0], clamp);
  return (
    <div style={{ display: "flex", alignItems: "center", gap, height }}>
      {Array.from({ length: bars }, (_, i) => {
        const env = Math.sin((i / (bars - 1)) * Math.PI) * 0.7 + 0.3;
        const v = Math.abs(Math.sin(frame / 3 + i * 0.9) * 0.6 + Math.sin(frame / 5.3 + i * 2.1) * 0.4) * (0.5 + random(`w${i}`) * 0.5);
        const h = Math.max(6, height * env * (0.18 + v * 0.82 * live));
        return <div key={i} style={{ width, height: h, borderRadius: width, background: color }} />;
      })}
    </div>
  );
};

const ChatScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const panel = interpolate(frame, [REC_END, REC_END + 10], [0, 1], clamp);
  const user = useSpring(REC_END + 4, 15);
  const bot = useSpring(REC_END + 26, 14);
  const saved = useSpring(REC_END + 44, 12);
  const secs = Math.min(3, Math.floor(interpolate(frame, [12, REC_END], [0, 4], clamp)));
  return (
    <>
      <AppHeader />
      <div style={{ padding: "16px 20px 0" }}>
        <div style={{ fontFamily: F.title, fontWeight: 600, fontSize: 26 }}>Чат-помощник</div>
        <div style={{ fontSize: 13, color: C.text2, marginTop: 4 }}>ЛПХ Ивановых · с. Намцы</div>
        <div style={{ textAlign: "center", fontSize: 12, color: C.text2, margin: "14px 0 10px" }}>23 октября 2026</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.primary, marginBottom: 6 }}>Помощник АгроОкно</div>
        <div style={{ background: "#E8EEFB", borderRadius: 14, padding: 14, fontSize: 14, lineHeight: 1.4 }}>
          <b style={{ fontWeight: 600 }}>Здравствуйте, Иван Иванов!</b>
          <br />
          Скажите, сколько молока получили сегодня. Я запишу надой в журнал.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14, opacity: user, transform: `translateY(${(1 - user) * 20}px)` }}>
          <div style={{ background: C.primary, color: "#fff", borderRadius: "16px 16px 4px 16px", padding: "12px 14px", fontSize: 14, maxWidth: 260, lineHeight: 1.4 }}>
            {typed(PHRASE, frame, REC_END + 4, REC_END + 22)}
          </div>
        </div>

        <div style={{ marginTop: 12, opacity: bot, transform: `translateY(${(1 - bot) * 20}px)` }}>
          <div style={{ background: "#E8EEFB", borderRadius: 14, padding: "12px 14px", fontSize: 14, fontWeight: 600 }}>Сохранил надой: 120 л за 23 октября</div>
          <Card style={{ marginTop: 10, padding: 14, fontSize: 13 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Сохраненное событие</div>
            {[
              ["Тип", "Надой"],
              ["Животные", "Коровы"],
              ["Количество", "120 л"],
              ["Дата", "23.10.2026"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: C.text2 }}>
                {k}
                <b style={{ color: C.text, fontWeight: 600 }}>{v}</b>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* Нижняя панель: запись голоса → поле ввода */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: "16px 20px 34px" }}>
        <div style={{ opacity: 1 - panel, height: 1 - panel > 0.01 ? "auto" : 0, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, fontSize: 15 }}>
            Идет запись <span style={{ color: C.primary }}>00:0{secs}</span>
          </div>
          <div style={{ marginTop: 10, background: C.info, borderRadius: 12, height: 64, display: "grid", placeItems: "center" }}>
            <Wave bars={30} height={48} color={C.primary} gap={4} width={4} />
          </div>
        </div>
        <div style={{ opacity: panel, display: "flex", gap: 10, marginTop: panel > 0.01 ? 0 : -999 }}>
          <div style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 12px", fontSize: 14, color: C.text2 }}>Напишите или скажите…</div>
          <div style={{ width: 56, borderRadius: 12, background: C.primary, display: "grid", placeItems: "center" }}>
            <Icon name="mic" size={22} color="#fff" />
          </div>
        </div>
      </div>

      {/* Тост «Надой сохранен» */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 20,
          right: 20,
          background: C.successBg,
          border: `1px solid #BBF7D0`,
          color: C.success,
          borderRadius: 14,
          padding: "12px 14px",
          display: "flex",
          gap: 10,
          alignItems: "center",
          fontWeight: 600,
          fontSize: 15,
          transform: `translateY(${(1 - saved) * -120}px)`,
          zIndex: 6,
        }}
      >
        <Icon name="check" size={20} color={C.success} stroke={2.6} /> Надой сохранен в журнал
      </div>
    </>
  );
};

export const Voice: React.FC = () => {
  const frame = useCurrentFrame();
  const phone = useSpring(0, 16);
  const ring = (offset: number) => {
    const t = ((frame + offset) % 36) / 36;
    const on = interpolate(frame, [8, 14, REC_END - 4, REC_END + 4], [0, 1, 1, 0], clamp);
    return { transform: `scale(${1 + t * 1.6})`, opacity: (1 - t) * 0.5 * on };
  };
  return (
    <AbsoluteFill>
      <SoftBackground tint="#E0E9FF" />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 150px", gap: 130 }}>
        <div style={{ position: "relative", transform: `translateX(${(1 - phone) * -700}px) scale(1.08)` }}>
          <Phone>
            <ChatScreen />
          </Phone>
          {/* Пульс микрофона рядом с телефоном */}
          <div style={{ position: "absolute", right: -70, bottom: 120, width: 120, height: 120 }}>
            {[0, 12, 24].map((o) => (
              <div key={o} style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `3px solid ${C.primary}`, ...ring(o) }} />
            ))}
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: C.primary, display: "grid", placeItems: "center", boxShadow: "0 20px 40px rgba(30,58,138,.35)" }}>
              <Icon name="mic" size={56} color="#fff" stroke={2} />
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <Rise delay={4}>
            <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: 30, color: C.primary, letterSpacing: 3, textTransform: "uppercase" }}>Голосовой ввод</div>
          </Rise>
          <div style={{ fontFamily: F.title, fontWeight: 600, fontSize: 68, lineHeight: 1.18, color: C.text, marginTop: 24, minHeight: 250 }}>
            «{typed(PHRASE, frame, 14, REC_END - 4)}
            {frame < REC_END - 4 ? <span style={{ opacity: Math.floor(frame / 8) % 2 === 0 ? 1 : 0, color: C.primary }}>|</span> : null}»
          </div>
          <div style={{ marginTop: 26, opacity: interpolate(frame, [REC_END, REC_END + 12], [1, 0], clamp) }}>
            <Wave bars={44} height={90} color={C.primary} gap={7} width={7} />
          </div>
          <Rise delay={REC_END + 30}>
            <div style={{ fontFamily: F.body, fontSize: 36, color: C.text2, marginTop: 30 }}>Помощник сам запишет надой в журнал</div>
          </Rise>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
