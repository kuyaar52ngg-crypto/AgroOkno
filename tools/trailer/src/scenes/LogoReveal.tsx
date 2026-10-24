import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { clamp, Logo, SoftBackground, useSpring } from "../ui";

const WORD = "АгроОкно";

const Letter: React.FC<{ ch: string; i: number }> = ({ ch, i }) => {
  const p = useSpring(10 + i * 2.5, 15);
  return (
    <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 70}px)`, opacity: Math.min(1, p * 1.5) }}>{ch}</span>
  );
};

export const LogoReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const tile = useSpring(0, 11);
  const tag = useSpring(38, 18);
  const underline = interpolate(frame, [48, 72], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <SoftBackground />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 56 }}>
        <div
          style={{
            transform: `scale(${tile}) rotate(${(1 - tile) * -25}deg)`,
            borderRadius: 64,
            boxShadow: "0 30px 70px rgba(30,58,138,.22)",
            background: "#F5F7FB",
          }}
        >
          <Logo size={280} radius={64} />
        </div>
        <div>
          <div style={{ fontFamily: F.title, fontWeight: 600, fontSize: 132, color: C.primary, lineHeight: 1 }}>
            {WORD.split("").map((ch, i) => (
              <Letter key={i} ch={ch} i={i} />
            ))}
          </div>
          <div style={{ position: "relative", display: "inline-block", marginTop: 30, opacity: tag, transform: `translateY(${(1 - tag) * 20}px)` }}>
            <span style={{ fontFamily: F.body, fontWeight: 500, fontSize: 46, color: C.text }}>Один раз ввёл — везде сдал</span>
            <div style={{ position: "absolute", left: 0, bottom: -12, height: 8, borderRadius: 4, width: `${underline * 100}%`, background: C.mint }} />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
