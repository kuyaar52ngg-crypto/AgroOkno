// npm run open — открывает окно Chrome MCP с Google Flow для ручного входа в Google.
import { launchChrome } from "./chrome.js";
import { PROFILE_DIR } from "./paths.js";

await launchChrome(process.argv[2]);
console.log(`Окно Flow открыто (профиль: ${PROFILE_DIR}). Войдите в Google и откройте проект — окно можно не закрывать.`);
process.exit(0);
