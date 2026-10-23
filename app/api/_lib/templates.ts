/// <reference types="node" />
// Каталог с бланками xlsx и шрифтами. Vercel: ./templates относительно cwd; Node-сервер: AGRO_TEMPLATES_DIR.
import path from 'node:path';

export const templatesDir = (): string => process.env.AGRO_TEMPLATES_DIR || path.join(process.cwd(), 'templates');
