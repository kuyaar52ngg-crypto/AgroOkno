import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { clip } from "../assets";
import { C, F } from "../theme";
import { Badge, Caption, Card, clamp, ClipOr, count, Headline, Icon, Logo, SoftBackground, useSpring } from "../ui";

/** Push-уведомление о сроке, как в F3/J8. */
const Push: React.FC<{ delay: number; style?: React.CSSProperties }> = ({ delay, style }) => {
  const p = useSpring(delay, 13);
  return (
    <div
      style={{
        position: "absolute",
        width: 640,
        padding: "22px 26px",
        borderRadius: 30,
        background: "rgba(255,255,255,.94)",
        boxShadow: "0 24px 60px rgba(15,23,42,.25)",
        display: "flex",
        gap: 20,
        alignItems: "center",
        fontFamily: F.body,
        transform: `translateX(${(1 - p) * 900}px)`,
        ...style,
      }}
    >
      <Logo size={64} radius={16} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: C.text2 }}>
          <span>АГРООКНО</span>
          <span>сейчас</span>
        </div>
        <div style={{ fontWeight: 600, fontSize: 26, color: C.text, marginTop: 4 }}>До сдачи 1-ИСО-р осталось 7 дней</div>
        <div style={{ fontSize: 22, color: C.text2, marginTop: 2 }}>Черновик готов — проверьте и отправьте</div>
      </div>
    </div>
  );
};

const VSD = ["Молоко сырое · 120 л", "Молоко сырое · 115 л", "Говядина · 180 кг"];
const BOOK = [
  ["Коровы", 15],
  ["Телята", 8],
  ["Лошади", 32],
  ["Овцы", 24],
] as const;

const FarmerMotion: React.FC = () => {
  const frame = useCurrentFrame();
  const left = useSpring(14, 16);
  const right = useSpring(24, 16);
  return (
    <AbsoluteFill>
      <SoftBackground tint="#FFF3DC" />
      <div style={{ position: "absolute", left: 140, top: 90 }}>
        <Headline size={60}>
          Меркурий и похозяйственная
          <br />
          книга — там же
        </Headline>
      </div>
      <div style={{ position: "absolute", left: 140, top: 330, display: "flex", gap: 40, fontFamily: F.body }}>
        <div style={{ width: 720, opacity: left, transform: `translateY(${(1 - left) * 60}px)` }}>
          <Card style={{ padding: 32, borderRadius: 26 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, background: C.info, display: "grid", placeItems: "center" }}>
                  <Icon name="shield" size={36} />
                </div>
                <div style={{ fontFamily: F.title, fontWeight: 600, fontSize: 32 }}>ВетИС «Меркурий»</div>
              </div>
              <Badge kind="success">Подключено</Badge>
            </div>
            {VSD.map((v, i) => {
              const p = interpolate(frame, [40 + i * 10, 50 + i * 10], [0, 1], clamp);
              return (
                <div
                  key={v}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22, paddingTop: 20, borderTop: `1px solid ${C.border}`, opacity: 0.3 + p * 0.7 }}
                >
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 600 }}>ВСД № 2026-10-{231 - i * 7}</div>
                    <div style={{ fontSize: 22, color: C.text2, marginTop: 4 }}>{v}</div>
                  </div>
                  <div
                    style={{ width: 44, height: 44, borderRadius: 22, background: p > 0.5 ? C.success : C.border, display: "grid", placeItems: "center", transform: `scale(${0.6 + p * 0.4})` }}
                  >
                    <Icon name="check" size={26} color="#fff" stroke={3} />
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
        <div style={{ width: 560, opacity: right, transform: `translateY(${(1 - right) * 60}px)` }}>
          <Card style={{ padding: 32, borderRadius: 26 }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: C.info, display: "grid", placeItems: "center" }}>
                <Icon name="book" size={36} />
              </div>
              <div>
                <div style={{ fontFamily: F.title, fontWeight: 600, fontSize: 28 }}>Похозяйственная книга</div>
                <div style={{ fontSize: 21, color: C.text2, marginTop: 4 }}>Запись № 0142 · с. Намцы</div>
              </div>
            </div>
            {BOOK.map(([k, v], i) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 26, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                <span style={{ color: C.text2 }}>{k}</span>
                <b style={{ fontWeight: 600 }}>{count(frame, 40 + i * 6, 75 + i * 6, v)}</b>
              </div>
            ))}
          </Card>
        </div>
      </div>
      <Push delay={95} style={{ right: 100, bottom: 60 }} />
    </AbsoluteFill>
  );
};

export const Farmer: React.FC = () => {
  const src = clip("07-happy-farmer");
  return (
    <AbsoluteFill>
      <ClipOr src={src} fallback={<FarmerMotion />} />
      {src ? (
        <>
          <Caption text="Меркурий и похозяйственная книга — там же" sub="И напоминания о сроках — заранее" />
          <Push delay={60} style={{ right: 100, top: 70 }} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};
