import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import { clip } from "../assets";
import { C, F } from "../theme";
import { Caption, clamp, ClipOr, useSpring } from "../ui";

const FORMS = [
  ["1-ИСО-р", "Росстат · поголовье"],
  ["10-СХ", "Росстат · корма"],
  ["1-ИП", "Росстат · деятельность"],
  ["3-фермер", "Сахастат · продукция"],
  ["1-ТАБУН", "Сахастат · табун"],
] as const;

const Sheet: React.FC<{ i: number; code: string; sub: string }> = ({ i, code, sub }) => {
  const delay = 8 + i * 11;
  const p = useSpring(delay, 13);
  const rot = (random(`rot${i}`) - 0.5) * 16;
  const dx = (random(`dx${i}`) - 0.5) * 90;
  return (
    <div
      style={{
        position: "absolute",
        left: 1090 + dx,
        top: 230 + i * 14,
        width: 440,
        height: 580,
        background: "#FFFDF8",
        borderRadius: 10,
        padding: 36,
        boxShadow: "0 20px 50px rgba(0,0,0,.35)",
        transform: `translateY(${(1 - p) * -900}px) rotate(${rot * p + (1 - p) * 30}deg)`,
        opacity: p > 0.02 ? 1 : 0,
        fontFamily: F.body,
      }}
    >
      <div style={{ fontSize: 15, color: C.text2, letterSpacing: 1 }}>ОТЧЁТНАЯ ФОРМА · БЛАНК</div>
      <div style={{ fontFamily: F.title, fontWeight: 600, fontSize: 46, color: C.text, marginTop: 18 }}>{code}</div>
      <div style={{ fontSize: 20, color: C.text2, marginTop: 6 }}>{sub}</div>
      <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 16 }}>
        {Array.from({ length: 9 }, (_, r) => (
          <div key={r} style={{ display: "flex", gap: 14 }}>
            <div style={{ flex: 3, height: 10, borderRadius: 5, background: "#E7E2D6" }} />
            <div style={{ flex: 1, height: 10, borderRadius: 5, background: "#EFEBE1" }} />
          </div>
        ))}
      </div>
    </div>
  );
};

const Stamp: React.FC = () => {
  const p = useSpring(78, 9);
  return (
    <div
      style={{
        position: "absolute",
        left: 1120,
        top: 560,
        padding: "16px 34px",
        border: `8px solid ${C.error}`,
        borderRadius: 14,
        color: C.error,
        fontFamily: F.title,
        fontWeight: 600,
        fontSize: 56,
        letterSpacing: 2,
        transform: `rotate(-14deg) scale(${interpolate(p, [0, 1], [2.6, 1])})`,
        opacity: p > 0.02 ? 0.92 : 0,
        mixBlendMode: "multiply",
      }}
    >
      ПРОСРОЧЕН
    </div>
  );
};

const Line: React.FC<{ delay: number; children: React.ReactNode }> = ({ delay, children }) => {
  const p = useSpring(delay, 18);
  return (
    <div style={{ overflow: "hidden", paddingBottom: 8 }}>
      <div style={{ transform: `translateY(${(1 - p) * 110}%)`, fontFamily: F.title, fontWeight: 600, fontSize: 92, lineHeight: 1.12, color: "#fff" }}>
        {children}
      </div>
    </div>
  );
};

const PaperMotion: React.FC = () => {
  const frame = useCurrentFrame();
  // Лёгкая тряска в момент удара штампа.
  const shake = interpolate(frame, [78, 82, 86, 90], [0, 10, -6, 0], clamp);
  const agencies = useSpring(100, 18);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 70% 40%, #1E293B, #0B1120 70%)", overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translate(${shake}px, ${shake * 0.6}px)` }}>
        {FORMS.map(([code, sub], i) => (
          <Sheet key={code} i={i} code={code} sub={sub} />
        ))}
        <Stamp />
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 120, top: 250 }}>
        <Line delay={6}>
          <span style={{ color: C.warning }}>5</span> форм.
        </Line>
        <Line delay={30}>
          <span style={{ color: C.warning }}>3</span> ведомства.
        </Line>
        <Line delay={54}>Каждый месяц.</Line>
        <div style={{ display: "flex", gap: 14, marginTop: 40, opacity: agencies, transform: `translateY(${(1 - agencies) * 20}px)` }}>
          {["Росстат", "Минсельхоз", "Сахастат"].map((a) => (
            <span key={a} style={{ padding: "10px 22px", borderRadius: 100, border: "2px solid rgba(255,255,255,.35)", color: "rgba(255,255,255,.9)", fontFamily: F.body, fontWeight: 500, fontSize: 28 }}>
              {a}
            </span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Paperwork: React.FC = () => {
  const src = clip("02-paperwork");
  return (
    <AbsoluteFill>
      <ClipOr src={src} fallback={<PaperMotion />} />
      {src ? <Caption text="5 форм. 3 ведомства. Каждый месяц." /> : null}
    </AbsoluteFill>
  );
};
