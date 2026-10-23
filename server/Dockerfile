# АгроОкно · Node.js-сервер. Сборка из КОРНЯ репозитория (серверу нужен общий код из app/):
#   docker build -f server/Dockerfile -t agro-okno-server .
#   docker run --rm -p 3001:3001 --env-file server/.env agro-okno-server

FROM node:22-alpine AS build
WORKDIR /repo/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
# Общий код: мапперы отчётов, обработчики app/api (бандлятся в dist), типы контракта.
COPY app/src /repo/app/src
COPY app/api /repo/app/api
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    AGRO_TEMPLATES_DIR=/app/templates
WORKDIR /app
COPY --from=build /repo/server/node_modules ./node_modules
COPY --from=build /repo/server/dist ./dist
COPY server/package.json ./package.json
# Бланки xlsx и шрифты для PDF.
COPY app/templates ./templates
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:3001/health >/dev/null || exit 1
USER node
CMD ["node", "dist/index.js"]
