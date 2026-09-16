FROM node:22-bookworm-slim AS build
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY apps/desktop/package.json apps/desktop/package.json
RUN npm ci --workspace apps/admin-web --include-workspace-root
COPY apps/admin-web apps/admin-web
ENV API_INTERNAL_URL=http://api:8000
RUN npm run build --workspace apps/admin-web
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 API_INTERNAL_URL=http://api:8000
COPY --from=build --chown=node:node /repo/apps/admin-web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/admin-web/.next/static ./apps/admin-web/.next/static
COPY --from=build --chown=node:node /repo/apps/admin-web/public ./apps/admin-web/public
USER node
EXPOSE 3000
CMD ["node", "apps/admin-web/server.js"]
