FROM node:20-alpine
RUN apk add --no-cache openssl libc6-compat ffmpeg python3 py3-pip
RUN pip3 install --break-system-packages yt-dlp
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/index.js"]
