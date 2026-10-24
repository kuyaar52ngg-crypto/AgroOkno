import React from "react";
import { AbsoluteFill, Audio, interpolate } from "remotion";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import "./fonts";
import { music } from "./assets";
import { Alas } from "./scenes/Alas";
import { EndCard } from "./scenes/EndCard";
import { Fanout } from "./scenes/Fanout";
import { Farmer } from "./scenes/Farmer";
import { Home } from "./scenes/Home";
import { LogoReveal } from "./scenes/LogoReveal";
import { Paperwork } from "./scenes/Paperwork";
import { Voice } from "./scenes/Voice";
import { SCENES, TOTAL, TRANSITION } from "./theme";
import { clamp } from "./ui";

const timing = linearTiming({ durationInFrames: TRANSITION });

export const Trailer: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SCENES.alas}>
        <Alas />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={SCENES.paper}>
        <Paperwork />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-left" })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={SCENES.logo}>
        <LogoReveal />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={SCENES.home}>
        <Home />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={SCENES.voice}>
        <Voice />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={SCENES.fanout}>
        <Fanout />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={SCENES.farmer}>
        <Farmer />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={SCENES.end}>
        <EndCard />
      </TransitionSeries.Sequence>
    </TransitionSeries>
    {music ? <Audio src={music} volume={(f) => interpolate(f, [0, 15, TOTAL - 45, TOTAL], [0, 0.8, 0.8, 0], clamp)} /> : null}
  </AbsoluteFill>
);
