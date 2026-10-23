import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Корень репозитория АгроОкно: tools/flow-mcp/dist/paths.js → ../../..
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// Всё состояние MCP (профиль Chrome, загрузки) — вне репозитория, чтобы сессия Google не попала в git.
export const HOME_DIR = process.env.AGRO_FLOW_HOME ?? join(homedir(), ".agro-flow-mcp");
export const PROFILE_DIR = join(HOME_DIR, "chrome-profile");
export const DOWNLOAD_DIR = join(HOME_DIR, "downloads");

export const OUTPUT_ROOT = process.env.AGRO_FLOW_OUTPUT ?? join(REPO_ROOT, "media", "trailer");

export const FONT_TITLE =
  process.env.AGRO_FONT_TITLE ??
  join(REPO_ROOT, "app", "node_modules", "@expo-google-fonts", "unbounded", "600SemiBold", "Unbounded_600SemiBold.ttf");
export const FONT_BODY =
  process.env.AGRO_FONT_BODY ??
  join(REPO_ROOT, "app", "node_modules", "@expo-google-fonts", "onest", "500Medium", "Onest_500Medium.ttf");
