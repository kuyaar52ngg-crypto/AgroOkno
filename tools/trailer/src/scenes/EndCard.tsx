import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F } from "../theme";
import { clamp, Logo, Rise, useSpring } from "../ui";

export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const tile = useSpring(6, 12);
  const fadeOut = interpolate(frame, [durationInFrames - 20, durationInFrames], [0, 1], clamp);
  const lx = 50 + Math.sin(frame / 50) * 20;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at ${lx}% 30%, #2B4FB8, ${C.primary} 45%, #142a66)`, overflow: "hidden" }}>
      {Array.from({ length: 70 }, (_, i) => {
        const x = random(`ex${i}`) * 1920;
        const y = ((random(`ey${i}`) * 1200 + frame * (0.4 + random(`es${i}`))) % 1200) - 60;
        const r = 1 + random(`er${i}`) * 2.5;
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: r * 2, height: r * 2, borderRadius: r, background: "#fff", opacity: 0.25 }} />;
      })}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div style={{ transform: `scale(${tile})`, borderRadius: 56, boxShadow: "0 30px 80px rgba(0,0,0,.35)", background: "#F5F7FB" }}>
          <Logo size={220} radius={56} />
        </div>
        <Rise delay={18}>
          <div style={{ fontFamily: F.title, fontWeight: 600, fontSize: 120, color: "#fff", marginTop: 44 }}>АгроОкно</div>
        </Rise>
        <Rise delay={30}>
          <div style={{ fontFamily: F.body, fontWeight: 500, fontSize: 46, color: C.mint, marginTop: 10 }}>Один раз ввёл — везде сдал</div>
        </Rise>
        <Rise delay={50}>
          <div style={{ fontFamily: F.body, fontSize: 30, color: "rgba(255,255,255,.75)", marginTop: 70, letterSpacing: 1 }}>
            Хакатон · Республика Саха (Якутия) · 2026
          </div>
        </Rise>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: C.night, opacity: fadeOut }} />
    </AbsoluteFill>
  );
};
