FROM oven/bun:1.3-debian AS build
WORKDIR /work
COPY package.json bun.lock bunfig.toml tsconfig.json ./
RUN bun install
COPY ./src ./src
RUN bun run build -j

FROM oven/bun:1.3-debian
ENV TZ=Asia/Shanghai
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Create user
RUN useradd -u 1200 -m -d /data -s /bin/bash manbot
USER manbot

WORKDIR /data
ENV WORKSPACE_FOLDER=/data/workspace \
    TERMINAL_ALLOWED=true

COPY --from=build /work/dist/index.js /manbot.js
EXPOSE 3000
ENTRYPOINT ["/bin/bash", "-c", "bun /manbot.js"]
