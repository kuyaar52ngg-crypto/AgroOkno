import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  OffthreadVideo,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { music } from "./assets";
import { C, F } from "./theme";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Пружина, стартующая с кадра `delay`. */
export const useSpring = (delay = 0, damping = 14, durationInFrames?: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping }, durationInFrames });
};

/** Появление: снизу вверх с прозрачностью. */
export const Rise: React.FC<{ delay?: number; dy?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay = 0,
  dy = 40,
  children,
  style,
}) => {
  const p = useSpring(delay, 16);
  return (
    <div style={{ opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * dy}px)`, ...style }}>{children}</div>
  );
};

/** Печать текста посимвольно между кадрами from..to. */
export const typed = (text: string, frame: number, from: number, to: number) =>
  text.slice(0, Math.round(interpolate(frame, [from, to], [0, text.length], clamp)));

export const count = (frame: number, from: number, to: number, value: number) =>
  Math.round(interpolate(frame, [from, to], [0, value], clamp)).toLocaleString("ru-RU");

// ---------- Иконки (линейные, как в макете) ----------

type IconName = "plus" | "milk" | "wheat" | "shield" | "book" | "mic" | "check" | "home" | "doc" | "send" | "bell" | "alert";

const ICONS: Record<IconName, React.ReactNode> = {
  plus: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  milk: <path d="M9 3h6M10 3v3l-2 3v11a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V9l-2-3V3M8 12h8" />,
  wheat: <path d="M12 21V9M12 9c0-3 2-5 4-6 0 3-2 5-4 6Zm0 0C12 6 10 4 8 3c0 3 2 5 4 6Zm0 5c2-1 5-1 6-3-2-1-5 0-6 3Zm0 0c-2-1-5-1-6-3 2-1 5 0 6 3Z" />,
  shield: (
    <>
      <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  book: <path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2V5Zm16 0a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2V5Z" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4" />
    </>
  ),
  check: <path d="m5 12 5 5 9-10" />,
  home: <path d="M4 11 12 4l8 7v9H4v-9Zm6 9v-6h4v6" />,
  doc: <path d="M7 3h7l5 5v13H7V3Zm7 0v5h5M10 13h6M10 17h6" />,
  send: <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" />,
  bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Zm4 4h4" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5v.5" />
    </>
  ),
};

export const Icon: React.FC<{ name: IconName; size?: number; color?: string; stroke?: number }> = ({
  name,
  size = 24,
  color = C.primary,
  stroke = 1.8,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {ICONS[name]}
  </svg>
);

// ---------- Телефон и элементы интерфейса приложения ----------

export const PHONE_W = 410;
export const PHONE_H = 864;

export const Phone: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      width: PHONE_W,
      height: PHONE_H,
      borderRadius: 64,
      background: "#0F172A",
      padding: 10,
      boxShadow: "0 50px 100px rgba(15,23,42,.28), 0 10px 30px rgba(15,23,42,.18)",
      ...style,
    }}
  >
    <div
      style={{
        position: "relative",
        width: PHONE_W - 20,
        height: PHONE_H - 20,
        borderRadius: 54,
        overflow: "hidden",
        background: C.bg,
        fontFamily: F.body,
        color: C.text,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 30px",
          fontWeight: 600,
          fontSize: 16,
          background: C.bg,
          zIndex: 5,
        }}
      >
        <span>9:41</span>
        <div style={{ position: "absolute", left: "50%", top: 11, width: 112, height: 32, marginLeft: -56, borderRadius: 20, background: "#000" }} />
        <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <span style={{ width: 17, height: 11, borderRadius: 2, background: `linear-gradient(90deg, ${C.text} 0 22%, transparent 22% 26%, ${C.text} 26% 48%, transparent 48% 52%, ${C.text} 52% 74%, transparent 74% 78%, ${C.text} 78%)` }} />
          <span style={{ width: 24, height: 12, borderRadius: 3, border: `1.5px solid ${C.text}`, padding: 1 }}>
            <span style={{ display: "block", width: "80%", height: "100%", background: C.text, borderRadius: 1 }} />
          </span>
        </span>
      </div>
      {children}
      <div style={{ position: "absolute", bottom: 8, left: "50%", width: 134, height: 5, marginLeft: -67, borderRadius: 3, background: C.text, zIndex: 5 }} />
    </div>
  </div>
);

export const Logo: React.FC<{ size: number; radius?: number; style?: React.CSSProperties }> = ({ size, radius = 0, style }) => (
  <Img src={staticFile("logo.png")} style={{ width: size, height: size, borderRadius: radius, display: "block", ...style }} />
);

export const AppHeader: React.FC = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "58px 20px 0" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Logo size={34} radius={6} style={{ mixBlendMode: "multiply" }} />
      <span style={{ fontFamily: F.title, fontWeight: 600, fontSize: 23, color: C.primary }}>АгроОкно</span>
    </div>
    <div style={{ width: 38, height: 38, borderRadius: 19, background: C.info, display: "grid", placeItems: "center", fontWeight: 600, fontSize: 14, color: C.primary }}>
      ИИ
    </div>
  </div>
);

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 16,
      boxShadow: "0 2px 6px rgba(0,0,0,.04)",
      ...style,
    }}
  >
    {children}
  </div>
);

export const Badge: React.FC<{ kind: "success" | "error" | "warning"; children: React.ReactNode; scale?: number }> = ({
  kind,
  children,
  scale = 1,
}) => {
  const colors = {
    success: [C.successBg, C.success],
    error: [C.errorBg, C.error],
    warning: [C.warnBg, "#B45309"],
  }[kind];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 100,
        background: colors[0],
        color: colors[1],
        fontFamily: F.body,
        fontWeight: 600,
        fontSize: 15,
        transform: `scale(${scale})`,
        whiteSpace: "nowrap",
      }}
    >
      {kind === "success" ? <Icon name="check" size={16} color={colors[1]} stroke={2.4} /> : null}
      {children}
    </span>
  );
};

export const BottomNav: React.FC<{ active?: number }> = ({ active = 0 }) => (
  <div
    style={{
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 92,
      background: C.surface,
      borderTop: `1px solid ${C.border}`,
      display: "flex",
      justifyContent: "space-around",
      paddingTop: 10,
      zIndex: 4,
    }}
  >
    {(
      [
        ["home", "Хозяйство"],
        ["plus", "Добавить"],
        ["doc", "Отчеты"],
        ["alert", "Профиль"],
      ] as const
    ).map(([icon, label], i) => (
      <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontSize: 12, fontWeight: i === active ? 600 : 400, color: i === active ? C.primary : C.text2 }}>
        <div style={{ width: 52, height: 30, borderRadius: 15, display: "grid", placeItems: "center", background: i === active ? C.info : "transparent" }}>
          <Icon name={icon} size={20} color={i === active ? C.primary : C.text2} />
        </div>
        {label}
      </div>
    ))}
  </div>
);

// ---------- Ролик Flow с запасным моушн-вариантом ----------

/** Ролик из Flow (медленный наезд), а если его ещё нет — запасная графика. */
export const ClipOr: React.FC<{ src: string | null; fallback: React.ReactNode; zoom?: [number, number] }> = ({
  src,
  fallback,
  zoom = [1, 1.08],
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (!src) return <>{fallback}</>;
  const scale = interpolate(frame, [0, durationInFrames], zoom, clamp);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <OffthreadVideo
        src={src}
        volume={music ? 0 : 0.6}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }}
      />
    </AbsoluteFill>
  );
};

/** Подпись поверх видео: полоса затемнения снизу и крупный текст. */
export const Caption: React.FC<{ text: string; delay?: number; sub?: string }> = ({ text, delay = 10, sub }) => {
  const p = useSpring(delay, 18);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 55%, rgba(11,21,48,.75))", opacity: p }} />
      <div style={{ padding: "0 120px 110px", opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
        <div style={{ width: interpolate(p, [0, 1], [0, 120]), height: 6, borderRadius: 3, background: C.mint, marginBottom: 28 }} />
        <div style={{ fontFamily: F.title, fontWeight: 600, fontSize: 64, lineHeight: 1.15, color: "#fff", maxWidth: 1400 }}>{text}</div>
        {sub ? <div style={{ fontFamily: F.body, fontSize: 32, color: "rgba(255,255,255,.85)", marginTop: 18 }}>{sub}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

/** Заголовок сцены на светлом фоне. */
export const Headline: React.FC<{ children: React.ReactNode; delay?: number; size?: number; color?: string; style?: React.CSSProperties }> = ({
  children,
  delay = 0,
  size = 72,
  color = C.primary,
  style,
}) => (
  <Rise delay={delay} style={{ fontFamily: F.title, fontWeight: 600, fontSize: size, lineHeight: 1.12, color, ...style }}>
    {children}
  </Rise>
);

/** Мягкие цветные пятна для светлых сцен. */
export const SoftBackground: React.FC<{ tint?: string }> = ({ tint = C.info }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 40) * 30;
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 1100, height: 1100, borderRadius: "50%", background: tint, filter: "blur(40px)", right: -250 + drift, top: -300 }} />
      <div style={{ position: "absolute", width: 700, height: 700, borderRadius: "50%", background: "#ECFDF5", filter: "blur(60px)", left: -200, bottom: -300 - drift, opacity: 0.8 }} />
    </AbsoluteFill>
  );
};
