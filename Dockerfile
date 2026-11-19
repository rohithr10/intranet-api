# Multi-stage build: the toolchain and dev dependencies stay out of the image
# that actually runs.
FROM node:20.19-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20.19-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY seed-assets ./seed-assets

# Uploads must be a mounted volume: anything written into the container's own
# filesystem is lost when it is replaced.
RUN mkdir -p /var/data/uploads && chown -R node:node /var/data/uploads
ENV STORAGE_LOCAL_DIR=/var/data/uploads
VOLUME ["/var/data/uploads"]

# Drop root before running application code.
USER node
EXPOSE 4000

# Compiled JS, so no shell wrapper: signals reach Node directly and the
# graceful shutdown in server.ts actually runs.
CMD ["node", "dist/server.js"]
