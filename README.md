# KaraPlay 🎤

Web app per serate karaoke gamificate.

## Avvio rapido

```bash
cp .env.example .env
# Modifica .env con le tue credenziali SMTP e JWT_SECRET

docker compose up -d
```

Apri `http://localhost` nel browser.

## Interfacce

| URL | Chi la usa |
|---|---|
| `/join` | Pubblico (smartphone) |
| `/display` | Proiettore / TV |
| `/admin` | Host / DJ |
| `/stage` | Cantante sul palco |

## Sviluppo locale

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`
- MailHog (email test): `http://localhost:8025`

## Stack

- **Frontend**: React + Vite + Tailwind + Tone.js + Socket.io
- **Backend**: Node.js + Fastify + Prisma + PostgreSQL + Redis
- **Audio**: MIDI (Tone.js) + YouTube (yt-dlp + ffmpeg)
- **Infra**: Docker Compose + Nginx

## Configurazione

Copia `.env.example` in `.env` e configura:

```env
JWT_SECRET=chiave_segreta_lunga
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tua@email.com
SMTP_PASS=password_app
ADMIN_TOKEN=token_admin_segreto
```

## Aggiungere canzoni MIDI

1. Vai su `/admin` → tab "Canzoni"
2. Carica file `.mid` + `.lrc` opzionale
3. La canzone appare nel catalogo per le prenotazioni

## Cosmos Cloud / reverse proxy

Configura il reverse proxy verso la porta `80` del container `karaoke-frontend`.
**Importante**: abilita il passthrough WebSocket per Socket.io (header `Upgrade: websocket`).
