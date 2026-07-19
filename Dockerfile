# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app

# better-sqlite3 falls back to a source build when a matching musl prebuild is unavailable.
RUN apk add --no-cache g++ make python3
COPY package.json package-lock.json ./
RUN npm ci \
    && test -f node_modules/better-sqlite3/build/Release/better_sqlite3.node

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate \
    && test -f node_modules/.prisma/client/index.js \
    && npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The Alpine better-sqlite3 binding links against libstdc++; su-exec lets the
# root entrypoint chown the mounted volume and drop to the app user.
RUN apk add --no-cache libstdc++ su-exec \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

# Keep runtime dependencies available for startup migrations and optional pilot seeding.
# The standalone tree is copied over them and remains the application entry point.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma CLI inputs and the two seed-script imports are not part of Next's server trace.
COPY --from=builder --chown=nextjs:nodejs /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts /app/tsconfig.json ./
COPY --from=builder --chown=nextjs:nodejs /app/lib/db.ts /app/lib/health.ts /app/lib/password.ts ./lib/
COPY --chown=nextjs:nodejs deploy/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod 755 ./docker-entrypoint.sh \
    && test -f node_modules/.prisma/client/index.js \
    && test -f node_modules/better-sqlite3/build/Release/better_sqlite3.node

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
