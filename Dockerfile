FROM oven/bun:1.3-debian AS base
ENV TZ=Asia/Shanghai
RUN apt-get update && apt-get install -y \
    curl \
    git \
    nano \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.11.7 /uv /uvx /usr/local/bin

FROM oven/bun:1.3-debian AS build
WORKDIR /work
COPY package.json bun.lock bunfig.toml tsconfig.json ./
RUN bun install
COPY ./src ./src
RUN bun run build -j

FROM base
# Create user
RUN useradd -u 1200 -m -d /data -s /bin/bash manbot
USER manbot
WORKDIR /data
EXPOSE 3000
ENV NODE_ENV=production
ENV BUN_INSTALL_BIN="~/.bun/bin"
ENV PATH="$BUN_INSTALL_BIN:~/.local/bin:$PATH"

COPY --from=build /work/dist/index.js /manbot.js
ENTRYPOINT ["/bin/bash", "-c", "bun /manbot.js"]
