FROM node:20-alpine

RUN apk add --no-cache ffmpeg python3 py3-pip curl
RUN pip3 install yt-dlp --break-system-packages

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# Create storage directories
RUN mkdir -p /app/storage/midi /app/storage/lrc /app/storage/yt

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
