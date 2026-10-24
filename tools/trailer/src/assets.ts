import { getStaticFiles, staticFile } from "remotion";

// Ролики Flow и музыка необязательны: scripts/prepare.mjs кладёт их в public/, если они есть в media/trailer.
const names = new Set(getStaticFiles().map((f) => f.name));

export const clip = (name: string): string | null =>
  names.has(`clips/${name}.mp4`) ? staticFile(`clips/${name}.mp4`) : null;

export const music: string | null = names.has("music.mp3") ? staticFile("music.mp3") : null;
