import React from "react";
import { AbsoluteFill, interpolate, interpolateColors, random, useCurrentFrame, useVideoConfig } from "remotion";
import { clip } from "../assets";
import { F } from "../theme";
import { clamp, ClipOr, Rise } from "../ui";

// Линия гор/холма по ширине кадра: детерминированный «шум» из синусов.
const ridge = (seed: number, base: number, amp: number, width = 2400) => {
  const pts: string[] = [];
  for (let x = 0; x <= width; x += 40) {
    const y = base + Math.sin(x / 260 + seed) * amp + Math.sin(x / 90 + seed * 3) * amp * 0.25;
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return `M0,1080 L${pts.join(" L")} L${width},1080 Z`;
};

// Тайга на дальнем холме: ряд узких лиственниц.
const forest = (base: number, width = 2400) => {
  let d = "";
  for (let i = 0; i < 160; i++) {
    const x = i * 15 + random(`tree-x-${i}`) * 8;
    const h = 22 + random(`tree-h-${i}`) * 34;
    const y = base + Math.sin(x / 260 + 1.3) * 26;
    d += `M${x - 5},${y} L${x},${y - h} L${x + 5},${y} Z `;
  }
  return d;
};

const Snow: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {Array.from({ length: 140 }, (_, i) => {
        const x = random(`sx${i}`) * 1920;
        const speed = 0.6 + random(`ss${i}`) * 1.4;
        const y = (random(`sy${i}`) * 1200 + frame * speed) % 1200 - 60;
        const r = 1.5 + random(`sr${i}`) * 3;
        const sway = Math.sin(frame / 25 + i) * 12;
        return (
          <div
            key={i}
            style={{ position: "absolute", left: x + sway, top: y, width: r * 2, height: r * 2, borderRadius: r, background: "#fff", opacity: 0.35 + random(`so${i}`) * 0.5 }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const AlasMotion: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = interpolate(frame, [0, durationInFrames], [0, 1], clamp);
  const sky = (a: string, b: string) => interpolateColors(t, [0, 1], [a, b]);
  const sunY = interpolate(t, [0, 1], [760, 470]);
  const zoom = interpolate(t, [0, 1], [1, 1.07]);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <AbsoluteFill
          style={{ background: `linear-gradient(180deg, ${sky("#0B1530", "#33407A")} 0%, ${sky("#1E2A55", "#C98AA6")} 45%, ${sky("#2B3A6B", "#FFD4A0")} 75%)` }}
        />
        <div
          style={{
            position: "absolute",
            left: 1325 - 600,
            top: sunY + 85 - 600,
            width: 1200,
            height: 1200,
            background: "radial-gradient(circle, rgba(255,214,150,.55) 0%, rgba(255,190,140,.22) 25%, rgba(255,190,140,0) 60%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 1240,
            top: sunY,
            width: 170,
            height: 170,
            borderRadius: "50%",
            background: "#FFE9C4",
            boxShadow: "0 0 60px 20px rgba(255,214,150,.5)",
          }}
        />
        <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute" }}>
          <g transform={`translate(${-frame * 0.3},0)`}>
            <path d={ridge(0.4, 640, 40)} fill={sky("#2E3B66", "#B9B4D6")} />
          </g>
          <g transform={`translate(${-frame * 0.6},0)`}>
            <path d={forest(700)} fill={sky("#1B2547", "#5B5F8C")} />
            <path d={ridge(1.3, 700, 26)} fill={sky("#3E4C7C", "#DCD9EC")} />
          </g>
          <g transform={`translate(${-frame * 1.1},0)`}>
            <path d={ridge(2.1, 800, 30)} fill={sky("#5A6A9A", "#EEF0F8")} />
          </g>
          <g transform={`translate(${-frame * 1.8},0)`}>
            <path d={ridge(3.7, 900, 22)} fill={sky("#7E8DBA", "#FAFBFF")} />
          </g>
        </svg>
        <Snow />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(11,21,48,.45))" }} />
    </AbsoluteFill>
  );
};

export const Alas: React.FC = () => (
  <AbsoluteFill>
    <ClipOr src={clip("01-alas-dawn")} fallback={<AlasMotion />} />
    <AbsoluteFill style={{ padding: "100px 120px", color: "#fff" }}>
      <Rise delay={20}>
        <div style={{ fontFamily: F.title, fontWeight: 600, fontSize: 40, textShadow: "0 4px 24px rgba(0,0,0,.35)" }}>Республика Саха (Якутия)</div>
      </Rise>
      <Rise delay={32}>
        <div style={{ fontFamily: F.body, fontWeight: 500, fontSize: 30, marginTop: 12, opacity: 0.9 }}>06:40 · −42 °C · с. Намцы</div>
      </Rise>
    </AbsoluteFill>
  </AbsoluteFill>
);
