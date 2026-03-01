FROM oven/bun:alpine AS build
WORKDIR /work
COPY package.json bun.lock bunfig.toml tsconfig.json ./
RUN bun install
COPY ./src ./src
RUN bun run build -j

FROM oven/bun:alpine
RUN apk add --no-cache libstdc++
ENV NTP_SERVER=pool.ntp.org \
  TZ=Asia/Shanghai
RUN echo "ntpd -d -q -n -p \$NTP_SERVER" > /usr/local/bin/ntp.sh \
  && chmod +x /usr/local/bin/ntp.sh \
  && echo "*/30 * * * * ntp.sh" >> /etc/crontabs/root \
  && apk add --no-cache tzdata \
  && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
  && echo "Asia/Shanghai" > /etc/timezone \
  && apk del tzdata
RUN apk add --no-cache bash curl wget uv
RUN adduser manbot -D -u 1200 -h /data
USER manbot
WORKDIR /data
ENV WORKSPACE_FOLDER=/data/workspace \
    TERMINAL_ALLOWED=true
COPY --from=build /work/dist/index.js /manbot.js
EXPOSE 3000
ENTRYPOINT ["/bin/bash", "-c", "crond && bun /manbot.js"]
