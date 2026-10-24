# Veil chat service — deploy-anywhere container.
# Platforms inject PORT (Render, Koyeb, Fly); without it the service
# defaults to 3003, same as local dev.
# Health check / keep-alive URL (socket.io owns "/" and 400s plain GETs):
#   GET /?EIO=4&transport=polling  →  200 + {"sid":...}
FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY index.ts ./
EXPOSE 3003
CMD ["bun", "index.ts"]
