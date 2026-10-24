import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { AppHeader, BottomNav, Card, clamp, count, Headline, Icon, Phone, Rise, SoftBackground, useSpring } from "../ui";

const QUICK = [
  ["plus", "Добавить приплод", "Рождение животных"],
  ["milk", "Надой", "Надой: 1200 л · октябрь"],
  ["wheat", "Заготовка кормов", "Сено, сенаж и зерно"],
  ["shield", "ВетИС Меркурий", "Ветеринарный учет"],
] as const;

const Segment: React.FC<{ fill: number }> = ({ fill }) => (
  <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,.22)", overflow: "hidden" }}>
    <div style={{ width: `${fill * 100}%`, height: "100%", background: C.mint }} />
  </div>
);

const HomeScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const seg1 = interpolate(frame, [30, 45], [0, 1], clamp);
  const seg2 = interpolate(frame, [42, 57], [0, 1], clamp);
  const sent = frame > 57 ? 2 : frame > 45 ? 1 : 0;
  const scroll = interpolate(frame, [80, 125], [0, -150], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 });
  return (
    <>
      <div style={{ transform: `translateY(${scroll}px)` }}>
        <AppHeader />
        <div style={{ padding: "18px 20px 0" }}>
          <div style={{ fontSize: 15, color: C.text2 }}>Здравствуйте, Иван Иванов</div>
          <div style={{ fontFamily: F.title, fontWeight: 600, fontSize: 28, marginTop: 6 }}>Моё хозяйство</div>
          <div style={{ fontSize: 14, color: C.primary, marginTop: 4 }}>Один раз ввёл — везде сдал</div>

          <Rise delay={18} dy={30}>
            <div style={{ marginTop: 16, background: C.primary, borderRadius: 20, padding: 18, color: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16 }}>
                <b style={{ fontWeight: 600 }}>Ваша отчетность</b>
                <span style={{ opacity: 0.75, fontSize: 13 }}>Октябрь 2026</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginTop: 14 }}>
                <span>Федеральные:</span>
                <b style={{ fontWeight: 600 }}>{sent} из 3 сдано</b>
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                <Segment fill={seg1} />
                <Segment fill={seg2} />
                <Segment fill={0} />
              </div>
              <div style={{ marginTop: 14, background: C.errorBg, color: C.errText, borderRadius: 10, padding: "10px 12px", fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                <Icon name="alert" size={16} color={C.error} />
                Республиканские: 1 просрочен
              </div>
            </div>
          </Rise>

          <div style={{ fontWeight: 600, fontSize: 18, marginTop: 20 }}>Быстрые действия</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            {QUICK.map(([icon, title, sub], i) => (
              <Rise key={title} delay={34 + i * 5} dy={24}>
                <Card style={{ padding: 14, height: 104 }}>
                  <Icon name={icon} size={22} />
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 10 }}>{title}</div>
                  <div style={{ fontSize: 12, color: C.text2, marginTop: 3 }}>{sub}</div>
                </Card>
              </Rise>
            ))}
          </div>

          <div style={{ fontWeight: 600, fontSize: 18, marginTop: 20 }}>Моё ЛПХ</div>
          <Rise delay={56} dy={24}>
            <Card style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: C.info, display: "grid", placeItems: "center" }}>
                <Icon name="book" size={22} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>ЛПХ Ивановых</div>
                <div style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>
                  Коровы: {count(frame, 60, 90, 15)} голов · Лошади: {count(frame, 60, 95, 32)}
                </div>
                <div style={{ fontSize: 13, color: C.primary, marginTop: 2 }}>В похозяйственную книгу</div>
              </div>
            </Card>
          </Rise>

          <div style={{ fontWeight: 600, fontSize: 18, marginTop: 20 }}>Помощник</div>
          <Card style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>До сдачи 1-ИСО-р осталось 7 дней</div>
            <div style={{ fontSize: 13, color: C.text2, marginTop: 3 }}>Срок: 30 октября 2026</div>
          </Card>
        </div>
      </div>
      <BottomNav active={0} />
    </>
  );
};

export const Home: React.FC = () => {
  const phone = useSpring(4, 16);
  const frame = useCurrentFrame();
  const tilt = interpolate(frame, [0, 135], [-4, 2], clamp);
  return (
    <AbsoluteFill>
      <SoftBackground />
      <AbsoluteFill style={{ padding: "0 140px", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ width: 1000 }}>
          <Headline delay={8} size={80}>
            Всё хозяйство&nbsp;—
            <br />в одном окне
          </Headline>
          <Rise delay={22}>
            <div style={{ fontFamily: F.body, fontSize: 36, color: C.text2, marginTop: 30, lineHeight: 1.35 }}>
              Скот, надои, корма, отчёты и сроки —
              <br />
              на одном экране
            </div>
          </Rise>
        </div>
        <div style={{ transform: `translateY(${(1 - phone) * 700}px) rotate(${tilt}deg) scale(1.08)`, marginRight: 80 }}>
          <Phone>
            <HomeScreen />
          </Phone>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
