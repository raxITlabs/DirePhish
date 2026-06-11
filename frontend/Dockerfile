# DirePhish frontend (Next.js 16 + Vercel Workflow SDK).
# Build context = frontend/ (this directory). NEXT_PUBLIC_* are BUILD args so
# they inline into the client bundle (Cloud Run runtime env is invisible to it).
FROM node:20-bookworm-slim

RUN npm install -g pnpm@9.15.9

WORKDIR /app

# Dependency layer (cached unless the lockfile changes). devDeps are needed for
# the build (tailwind/postcss/etc.).
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Backend URL baked in at build time (both client vars point at the backend).
ARG NEXT_PUBLIC_FLASK_API_URL
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_FLASK_API_URL=${NEXT_PUBLIC_FLASK_API_URL} \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NODE_ENV=production \
    PORT=8080

COPY . .
RUN pnpm run build

EXPOSE 8080

CMD ["sh", "-c", "exec pnpm exec next start -H 0.0.0.0 -p ${PORT}"]
