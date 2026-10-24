// Токены из дизайн-системы Figma (docs/TZ-agents.md §5).
export const C = {
  primary: "#1E3A8A",
  logo: "#0057C2",
  success: "#16A34A",
  error: "#DC2626",
  warning: "#F59E0B",
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  text: "#0F172A",
  text2: "#64748B",
  border: "#E2E8F0",
  info: "#EFF6FF",
  successBg: "#F0FDF4",
  errorBg: "#FEF2F2",
  warnBg: "#FFFBEB",
  errText: "#991B1B",
  mint: "#6EE7B7",
  night: "#0B1530",
} as const;

export const F = { title: "Unbounded", body: "Onest" } as const;

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const TRANSITION = 15;

// Длительности сцен в кадрах; сумма минус 7 переходов = 1200 кадров = 40 с.
export const SCENES = {
  alas: 180,
  paper: 165,
  logo: 105,
  home: 135,
  voice: 165,
  fanout: 150,
  farmer: 195,
  end: 210,
} as const;

export const TOTAL =
  Object.values(SCENES).reduce((a, b) => a + b, 0) - (Object.keys(SCENES).length - 1) * TRANSITION;
