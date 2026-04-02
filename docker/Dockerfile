FROM python:3.11-bookworm

# Debian's default nodejs is too old; Next.js 16 needs Node >= 20.9
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates git gnupg \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9.15.9

COPY --from=ghcr.io/astral-sh/uv:0.9.26 /uv /uvx /bin/

WORKDIR /app

# Backend pulls PyTorch (via camel-oasis → sentence-transformers). The wheel is large;
# the Docker VM needs several GB free or uv extract fails with "No space left on device".
# Free space: Docker Desktop → Troubleshoot → Clean / Purge data, or increase disk in Settings → Resources.
ENV UV_NO_CACHE=1

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/pnpm-lock.yaml ./frontend/
COPY backend/pyproject.toml backend/uv.lock ./backend/

RUN npm ci \
  && cd frontend && pnpm install --frozen-lockfile \
  && cd ../backend && uv sync --frozen \
  && rm -rf /root/.cache/uv

COPY . .

EXPOSE 3000 5001

CMD ["npm", "run", "dev"]
