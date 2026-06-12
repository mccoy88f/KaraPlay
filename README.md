# KaraPlay 🎤

Web app per serate karaoke gamificate.

## Avvio rapido

```bash
docker compose up -d --build
```

Apri `http://localhost:8083` nel browser. Le variabili (JWT_SECRET, SMTP…) sono
opzionali per provare: hanno default di sviluppo, personalizzale con un file `.env`
(vedi `.env.example`).

## Avvio con Portainer

Lo stack si avvia direttamente dal repository, senza clonare nulla a mano:

1. **Stacks → Add stack → Repository**
2. Repository URL: `https://github.com/mccoy88f/KaraPlay`, reference `refs/heads/main`
3. Compose path: `docker-compose.yml`
4. (Opzionale) aggiungi le env `JWT_SECRET`, `SMTP_*` nella sezione *Environment variables*
5. **Deploy the stack** — Portainer builda le immagini di frontend e backend da solo

Al primo avvio il backend applica le migrazioni e il seed: serata demo con PIN
`000000` e **super admin `admin` / `admin`** (cambia subito la password da
`/admin` → Account). L'app è su `http://<host>:8083`.

## Interfacce

| URL | Chi la usa |
|---|---|
| `/join` | Pubblico (smartphone) |
| `/display` | Proiettore / TV |
| `/admin` | Host / DJ (login richiesto) |

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
- **Backend**: Node.js + Fastify + Prisma + PostgreSQL
- **Audio**: MIDI (Tone.js / spessasynth SF2) + YouTube (embed o yt-dlp + ffmpeg)
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
