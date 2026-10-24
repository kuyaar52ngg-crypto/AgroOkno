import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { Badge, Card, clamp, Headline, Icon, SoftBackground, useSpring } from "../ui";

// Одно событие из журнала расходится по ведомствам: линия рисуется, по ней летит документ, у ведомства загорается «Сдан».
const SRC = { x: 720, y: 600 };
const AGENCIES = [
  { name: "Росстат", forms: "3-фермер · 10-СХ · 1-ИСО-р", y: 330 },
  { name: "Минсельхоз", forms: "1-КФХ · отраслевая отчётность", y: 600 },
  { name: "Сахастат", forms: "1-ТАБУН · 3-фермер (рег)", y: 870 },
];
const DST_X = 1230;

const bezier = (t: number, y2: number) => {
  const p0 = SRC;
  const p1 = { x: (SRC.x + DST_X) / 2, y: SRC.y };
  const p2 = { x: (SRC.x + DST_X) / 2, y: y2 };
  const p3 = { x: DST_X, y: y2 };
  const u = 1 - t;
  return {
    x: u ** 3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * p3.x,
    y: u ** 3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * p3.y,
  };
};

const EVENTS = [
  ["milk", "Надой", "120 л · коровы"],
  ["plus", "Приплод", "+6 жеребят"],
  ["wheat", "Корма", "Сено 18 т"],
] as const;

export const Fanout: React.FC = () => {
  const frame = useCurrentFrame();
  const card = useSpring(0, 16);
  return (
    <AbsoluteFill>
      <SoftBackground />
      <div style={{ position: "absolute", left: 140, top: 80 }}>
        <Headline size={58}>Росстат, Минсельхоз, Сахастат — автоматически</Headline>
      </div>

      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        {AGENCIES.map((a, i) => {
          const start = 22 + i * 10;
          const draw = interpolate(frame, [start, start + 30], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 2 });
          const d = `M${SRC.x},${SRC.y} C${(SRC.x + DST_X) / 2},${SRC.y} ${(SRC.x + DST_X) / 2},${a.y} ${DST_X},${a.y}`;
          return (
            <path key={a.name} d={d} pathLength={1} fill="none" stroke={C.primary} strokeOpacity={0.35} strokeWidth={4} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
          );
        })}
      </svg>

      {/* Летящие документы */}
      {AGENCIES.map((a, i) => {
        const start = 30 + i * 10;
        const t = interpolate(frame, [start, start + 30], [0, 1], { ...clamp, easing: (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2) });
        const visible = t > 0 && t < 1;
        const p = bezier(t, a.y);
        return (
          <div
            key={a.name}
            style={{ position: "absolute", left: p.x - 28, top: p.y - 28, width: 56, height: 56, borderRadius: 14, background: C.primary, display: "grid", placeItems: "center", opacity: visible ? 1 : 0, boxShadow: "0 10px 24px rgba(30,58,138,.35)" }}
          >
            <Icon name="doc" size={30} color="#fff" />
          </div>
        );
      })}

      {/* Журнал учета — источник */}
      <div style={{ position: "absolute", left: 140, top: SRC.y - 210, width: 580, opacity: card, transform: `translateX(${(1 - card) * -80}px)` }}>
        <Card style={{ padding: 28, borderRadius: 24, fontFamily: F.body }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontFamily: F.title, fontWeight: 600, fontSize: 30, color: C.text }}>Журнал учета</div>
            <span style={{ fontSize: 20, color: C.text2 }}>Октябрь 2026</span>
          </div>
          {EVENTS.map(([icon, title, sub], i) => {
            const p = interpolate(frame, [6 + i * 5, 16 + i * 5], [0, 1], clamp);
            return (
              <div key={title} style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 22, opacity: p, transform: `translateX(${(1 - p) * -30}px)` }}>
                <div style={{ width: 60, height: 60, borderRadius: 14, background: C.info, display: "grid", placeItems: "center" }}>
                  <Icon name={icon} size={32} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 26, color: C.text }}>{title}</div>
                  <div style={{ fontSize: 21, color: C.text2, marginTop: 2 }}>{sub}</div>
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 24, fontSize: 19, color: C.text2 }}>Введено один раз</div>
        </Card>
      </div>

      {/* Ведомства */}
      {AGENCIES.map((a, i) => {
        const appear = interpolate(frame, [14 + i * 6, 28 + i * 6], [0, 1], clamp);
        const done = 60 + i * 10;
        const badge = interpolate(frame, [done, done + 8, done + 14], [0, 1.25, 1], clamp);
        const glow = interpolate(frame, [done, done + 6, done + 30], [0, 1, 0], clamp);
        return (
          <div key={a.name} style={{ position: "absolute", left: DST_X + 10, top: a.y - 85, width: 540, opacity: appear, transform: `translateX(${(1 - appear) * 60}px)` }}>
            <Card style={{ padding: 26, borderRadius: 22, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: `0 0 0 ${glow * 10}px rgba(22,163,74,${glow * 0.25}), 0 2px 6px rgba(0,0,0,.04)` }}>
              <div>
                <div style={{ fontFamily: F.title, fontWeight: 600, fontSize: 32, color: C.text }}>{a.name}</div>
                <div style={{ fontFamily: F.body, fontSize: 21, color: C.text2, marginTop: 8 }}>{a.forms}</div>
              </div>
              <div style={{ transform: `scale(${badge * 1.4})`, opacity: badge > 0 ? 1 : 0 }}>
                <Badge kind="success">Сдан</Badge>
              </div>
            </Card>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
