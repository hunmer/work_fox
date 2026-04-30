# ====== Stage 1: Build frontend and backend ======
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json pnpm-lock.yaml ./
COPY shared/ shared/

# Install all dependencies (including devDependencies for build tools)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY backend/ backend/
COPY src/ src/
COPY resources/ resources/
COPY preload/ preload/
COPY electron/ electron/
COPY index-web.html vite.web.config.ts tsconfig.backend.json tsconfig.web.json tsconfig.json tsconfig.node.json ./

# Build backend (TypeScript -> out/backend/)
RUN pnpm run build:backend

# Build web frontend (Vue SPA -> dist-web/)
RUN pnpm run build:web

# Install plugin dependencies (plugins with their own package.json)
RUN for dir in resources/plugins/*/; do \
      if [ -f "$dir/package.json" ]; then \
        echo "Installing deps for $dir" && \
        cd "$dir" && npm install --production 2>/dev/null || true && \
        cd /app; \
      fi; \
    done

# ====== Target: backend (Node.js runtime) ======
FROM node:20-alpine AS backend

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy package manifests for production install
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy compiled backend
COPY --from=builder /app/out/backend/ ./out/backend/

# Copy compiled shared modules (backend JS imports from ../../shared/)
COPY --from=builder /app/out/shared/ ./out/shared/

# Copy compiled src modules (backend chat imports from ../../src/)
COPY --from=builder /app/out/src/ ./out/src/

# Copy compiled electron modules (backend imports from ../../electron/)
COPY --from=builder /app/out/electron/ ./out/electron/

# Copy built web frontend (for standalone mode with WORKFOX_SERVE_WEB=1)
COPY --from=builder /app/dist-web/ ./dist-web/

# Copy built-in plugins (with their installed node_modules)
COPY --from=builder /app/resources/plugins/ ./resources/plugins/

# Create data directory
RUN mkdir -p /app/backend/data

# Environment defaults for Docker
ENV NODE_ENV=production \
    WORKFOX_BACKEND_HOST=0.0.0.0 \
    WORKFOX_BACKEND_PORT=9123 \
    WORKFOX_USER_DATA_DIR=/app/backend/data \
    WORKFOX_LOG_LEVEL=info

EXPOSE 9123

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:9123/health || exit 1

CMD ["node", "out/backend/main.js"]

# ====== Target: web (nginx frontend) ======
FROM nginx:1.27-alpine AS web

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built web frontend from builder stage
COPY --from=builder /app/dist-web/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1
