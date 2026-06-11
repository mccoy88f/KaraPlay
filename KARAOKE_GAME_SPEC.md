# 🎤 KaraokeGame — Specifiche Complete di Progetto

> Documento di specifica tecnica e funzionale completo.  
> Destinato a un'intelligenza artificiale o sviluppatore per implementare il progetto da zero.

---

## 📌 Panoramica

**KaraokeGame** è una web application per serate karaoke gamificate.  
Il gestore (admin/host) crea una **Serata**, gli utenti accedono via browser con QR code o PIN, prenotano canzoni, votano le esibizioni, inviano commenti live e vedono la classifica in tempo reale.

Il sistema è composto da **quattro interfacce web distinte** e un **backend centralizzato**, tutto deployato su Docker.

---

## 🗺️ Interfacce

| URL | Chi la usa | Descrizione |
|---|---|---|
| `/display` | Proiettore / TV | Schermo principale della serata — player karaoke, commenti overlay, voti live |
| `/admin` | Host / DJ | Gestione serata, coda prenotazioni, approvazioni YouTube, avvio playback |
| `/stage` | Cantante sul palco | Prossima canzone, testo di riferimento, countdown |
| `/join` | Pubblico (smartphone) | Accesso alla serata, prenotazione, voti, commenti, classifica |

---

## 🧱 Stack Tecnologico

### Frontend
- **React** (Vite) — SPA unica con routing per le 4 views
- **Tailwind CSS** — styling
- **Socket.io-client** — real-time
- **Tone.js** + **@tonejs/midi** — playback MIDI con GM soundfont
- **soundfont-player** o **WebAudioFont** — GM soundbanks in browser
- **Framer Motion** — animazioni (commenti overlay, celebrazioni)

### Backend
- **Node.js** con **Fastify** — REST API
- **Socket.io** — WebSocket real-time
- **Prisma** ORM — accesso al database
- **PostgreSQL** — database principale
- **Redis** — stato sessioni real-time, pub/sub Socket.io
- **yt-dlp** — estrazione audio da YouTube (eseguito lato server)
- **ffmpeg** — transcodifica audio YouTube → formato web (opus/webm)
- **nodemailer** — invio OTP via email
- **lrclib.net API** — recupero automatico file LRC sincronizzati

### Infrastruttura
- **Docker + Docker Compose** — tutti i servizi containerizzati
- **Nginx** — serve il frontend React buildato
- **Cosmos Cloud** — reverse proxy HTTPS (già presente sull'host)
- **Portainer** — gestione container (già presente sull'host)

---

## 🗃️ Schema Database (Prisma)

```prisma
model User {
  id            String        @id @default(cuid())
  nickname      String
  email         String?       @unique
  emailVerified Boolean       @default(false)
  phone         String?
  marketingOk   Boolean       @default(false)
  createdAt     DateTime      @default(now())
  sessionToken  String?       @unique

  bookings      Booking[]
  votes         Vote[]
  comments      Comment[]
  performances  Performance[]
}

model OtpCode {
  id        String   @id @default(cuid())
  email     String
  code      String
  expiresAt DateTime
  used      Boolean  @default(false)
  createdAt DateTime @default(now())
}

model Event {
  id          String      @id @default(cuid())
  name        String      -- es. "Karaoke Night #12 - Carnevale 2026"
  location    String      -- es. "Bar dello Sport, Pontecorvo"
  date        DateTime
  status      EventStatus @default(DRAFT)
  joinCode    String      @unique  -- PIN 6 cifre o codice alfanumerico
  hostId      String
  createdAt   DateTime    @default(now())

  bookings    Booking[]
  performances Performance[]
}

enum EventStatus {
  DRAFT     -- creata ma non aperta
  OPEN      -- prenotazioni aperte, non ancora live
  LIVE      -- serata in corso
  ENDED     -- terminata
}

model Song {
  id          String     @id @default(cuid())
  title       String
  artist      String
  source      SongSource
  midiPath    String?    -- path relativo nel volume Docker
  lrcPath     String?    -- path relativo nel volume Docker
  mp3Path     String?    -- path relativo (se backing track MP3)
  duration    Int?       -- secondi
  language    String?    -- "it", "en", ecc.
  tags        String[]
  createdAt   DateTime   @default(now())

  bookings    Booking[]
}

enum SongSource {
  MIDI       -- dal database MIDI personale
  YOUTUBE    -- estratto via yt-dlp
}

model Booking {
  id          String        @id @default(cuid())
  eventId     String
  userId      String
  songId      String?       -- null se canzone YouTube non ancora processata
  ytUrl       String?       -- URL YouTube originale (se source = YOUTUBE)
  ytTitle     String?       -- titolo rilevato da yt-dlp
  ytLrcFound  Boolean?      -- se lrclib ha trovato il testo
  position    Int           -- ordine in coda
  status      BookingStatus @default(PENDING)
  adminNote   String?
  createdAt   DateTime      @default(now())

  event       Event   @relation(fields: [eventId], references: [id])
  user        User    @relation(fields: [userId], references: [id])
  song        Song?   @relation(fields: [songId], references: [id])
  performance Performance?
}

enum BookingStatus {
  PENDING    -- in attesa di approvazione admin (solo YouTube)
  APPROVED   -- in coda
  PROCESSING -- yt-dlp in elaborazione
  READY      -- pronto per andare in scena
  PERFORMING -- esibizione in corso
  DONE       -- completata
  SKIPPED    -- saltata dall'admin
  REJECTED   -- rifiutata dall'admin
}

model Performance {
  id             String   @id @default(cuid())
  eventId        String
  bookingId      String   @unique
  userId         String
  startedAt      DateTime?
  endedAt        DateTime?
  scoreTotal     Float?   -- punteggio finale calcolato
  votesAvg       Float?
  commentsCount  Int      @default(0)
  bonusEngagement Float?
  createdAt      DateTime @default(now())

  event     Event   @relation(fields: [eventId], references: [id])
  booking   Booking @relation(fields: [bookingId], references: [id])
  user      User    @relation(fields: [userId], references: [id])
  votes     Vote[]
  comments  Comment[]
}

model Vote {
  id            String      @id @default(cuid())
  performanceId String
  userId        String
  value         Int         -- 1-10
  createdAt     DateTime    @default(now())

  performance   Performance @relation(fields: [performanceId], references: [id])
  user          User        @relation(fields: [userId], references: [id])

  @@unique([performanceId, userId])  -- un voto per esibizione per utente
}

model Comment {
  id            String      @id @default(cuid())
  performanceId String
  userId        String
  text          String      @db.VarChar(120)
  emoji         String?
  createdAt     DateTime    @default(now())

  performance   Performance @relation(fields: [performanceId], references: [id])
  user          User        @relation(fields: [userId], references: [id])
}

model Leaderboard {
  -- Vista o tabella materializzata per classifica cross-serata
  -- Calcolata a fine di ogni Performance
  userId        String   @id
  totalScore    Float    @default(0)
  performances  Int      @default(0)
  bestScore     Float?
  updatedAt     DateTime @updatedAt
}
```

---

## 🔐 Sistema di Autenticazione

### Flusso principale — Accesso libero con registrazione opzionale

```
1. Utente scansiona QR o inserisce PIN serata
2. Chiede solo il NICKNAME → entra subito (sessione anonima, token in localStorage)
3. Banner non invasivo: "Registrati per salvare i tuoi punteggi tra le serate"
4. Se vuole registrarsi:
   a. Inserisce EMAIL
   b. Riceve OTP a 6 cifre via email (validità 10 minuti)
   c. Inserisce OTP → email verificata
   d. Opzionalmente inserisce NUMERO DI CELLULARE
   e. Checkbox esplicito (non pre-spuntato): 
      "Acconsento a ricevere comunicazioni promozionali via SMS" (GDPR)
   f. Sessione anonima collegata all'account permanente
5. Ai login successivi: inserisce email → OTP → dentro
```

### Token di sessione
- JWT firmato con secret server
- Payload: `{ userId, nickname, eventId, role }`
- Durata: 8 ore (una serata)
- Stored in `localStorage` nel browser

### Ruoli
| Ruolo | Accesso |
|---|---|
| `guest` | Accesso anonimo, solo alla serata corrente |
| `user` | Account registrato, storico punteggi |
| `admin` | Pannello admin, gestione serata |

---

## 📡 API REST (Fastify)

### Auth
```
POST /api/auth/join          -- nickname + eventJoinCode → token guest
POST /api/auth/request-otp  -- email → invia OTP
POST /api/auth/verify-otp   -- email + code → token user registrato
POST /api/auth/link-phone   -- phone + marketingOk → aggiorna profilo
```

### Events
```
GET  /api/events/:joinCode        -- info serata pubblica
POST /api/admin/events            -- crea serata
PUT  /api/admin/events/:id        -- modifica serata
PUT  /api/admin/events/:id/status -- cambia status (open/live/ended)
```

### Songs (DB MIDI)
```
GET  /api/songs?q=:query          -- ricerca nel catalogo MIDI
GET  /api/songs/:id               -- dettaglio canzone
POST /api/admin/songs             -- upload nuova canzone MIDI+LRC
```

### Bookings
```
GET  /api/events/:eventId/queue           -- coda prenotazioni corrente
POST /api/events/:eventId/bookings        -- prenota canzone (MIDI o YouTube)
GET  /api/users/me/bookings               -- prenotazioni utente corrente
PUT  /api/admin/bookings/:id/approve      -- approva prenotazione YouTube
PUT  /api/admin/bookings/:id/reject       -- rifiuta
PUT  /api/admin/bookings/:id/position     -- riordina coda (drag & drop)
PUT  /api/admin/bookings/:id/skip         -- salta
```

### YouTube Processing
```
POST /api/youtube/preview     -- dato URL, ritorna titolo+durata senza scaricare
GET  /api/youtube/lrc?title=:t&artist=:a  -- cerca LRC su lrclib.net
POST /api/admin/youtube/process/:bookingId  -- avvia yt-dlp download
GET  /api/admin/youtube/status/:bookingId   -- stato elaborazione (SSE)
```

### Performance
```
POST /api/admin/performances/start/:bookingId  -- avvia esibizione
POST /api/admin/performances/:id/end           -- termina esibizione
GET  /api/performances/:id                     -- dettaglio
```

### Votes & Comments
```
POST /api/performances/:id/votes     -- vota (1-10), una sola volta
POST /api/performances/:id/comments  -- commento live
GET  /api/performances/:id/comments  -- lista commenti
```

### Leaderboard
```
GET /api/events/:eventId/leaderboard   -- classifica serata
GET /api/leaderboard/global            -- classifica storica cross-serata
GET /api/users/:id/stats               -- statistiche utente
```

---

## 📡 Socket.io — Eventi Real-Time

### Rooms
- `event:{eventId}` — tutti i connessi a una serata
- `admin:{eventId}` — solo admin
- `display:{eventId}` — schermo principale
- `stage:{eventId}` — cantante

### Eventi Server → Client

```javascript
// Gestione serata
'event:status'        { status }                    // cambio stato serata
'queue:update'        { queue: Booking[] }          // coda aggiornata

// Playback karaoke
'performance:start'   { performance, song, booking, user }
'performance:end'     { performance, score }
'lyric:highlight'     { wordIndex, lineIndex, text } // parola corrente
'lyric:line'          { line, nextLine }             // riga corrente

// Social
'comment:new'         { comment, user }             // nuovo commento
'vote:update'         { avg, count, distribution }  // voti aggiornati
'leaderboard:update'  { top10 }                     // classifica aggiornata

// YouTube processing
'youtube:processing'  { bookingId, progress }
'youtube:ready'       { bookingId }
'youtube:error'       { bookingId, error }
```

### Eventi Client → Server

```javascript
'comment:send'   { text, emoji }
'vote:cast'      { value }          // 1-10
'display:ready'  {}                 // display si connette
'stage:ready'    {}
```

---

## 🎵 Sorgenti Audio e Playback

### Sorgente 1 — MIDI dal Database Personale

```
File: .mid con lyric meta-events (tipo 0x05)
      + .lrc opzionale come fallback/override

Playback:
  @tonejs/midi    → parsing MIDI, estrazione note + lyric events
  Tone.js Sampler → riproduzione note con GM soundfont
                    (usa gleitz/midi-js-soundfonts da CDN o volume locale)
  
Sync testi:
  Lyric events schedulati su Tone.Transport
  → emit socket 'lyric:highlight' ogni parola
  → il display anima l'highlight

Soundfont GM consigliato:
  gleitz/midi-js-soundfonts (GitHub, MIT license)
  Hosted su: https://gleitz.github.io/midi-js-soundfonts/
  Caricamento lazy per strumento
```

### Sorgente 2 — YouTube via yt-dlp

```
Flusso di elaborazione (backend):

1. Admin approva booking YouTube
2. Server avvia job asincrono:
   yt-dlp --extract-audio --audio-format opus \
          --audio-quality 0 \
          -o "storage/yt/{bookingId}.opus" \
          "{url}"
3. ffmpeg transcodifica se necessario → webm/opus
4. Cerca LRC su lrclib.net (per titolo/artista rilevato)
5. Salva metadata nel DB, aggiorna booking status → READY
6. Emit socket 'youtube:ready'

Playback lato browser (Display):
  <audio> element con src → /api/media/yt/{bookingId}
  (stream dal server, file già processato)
  Se LRC trovato → sync testo come sopra
  Se LRC non trovato → solo audio, testo "Free Style"

Badge visivo sul display:
  MIDI = "⭐ Karaoke Ufficiale"
  YouTube con LRC = "🎬 Free Style con testo"
  YouTube senza LRC = "🎬 Free Style"
```

### Sincronizzazione Testi (LRC)

```
Formato LRC standard:
  [mm:ss.xx]testo della riga

Formato LRC esteso (word-level):
  [mm:ss.xx]<mm:ss.xx>parola <mm:ss.xx>per <mm:ss.xx>parola

Parser: lrclib usa formato esteso quando disponibile
Libreria consigliata: lrc-kit (npm) o parser custom
```

---

## 🎮 Sistema Punteggio

```
Punteggio finale esibizione:

  score = (voti_medi × 0.8) + (bonus_engagement × 0.2)

  bonus_engagement = min(10, commenti_ricevuti / 2)
  -- max 10 punti bonus per engagement

  Range finale: 0-10

Classifica serata:
  → media dei punteggi di tutte le esibizioni del cantante nella serata

Classifica storica (cross-serata):
  → media pesata: esibizioni recenti contano di più
  → aggiornata a fine di ogni Performance

Regole voti:
  → aperto solo durante l'esibizione (status PERFORMING)
  → un solo voto per utente per esibizione
  → i guest anonimi possono votare (ma non compare nel loro storico)
  → l'admin non può votare
  → il cantante non può votare la propria esibizione
```

---

## 🖥️ Dettaglio Interfacce

### `/display` — Schermo Principale

**Layout durante esibizione:**
```
┌─────────────────────────────────────────────┐
│  🎤 Marco sta cantando: "Bohemian Rhapsody" │
│                              ★ 8.4  (23 voti)│
├─────────────────────────────────────────────┤
│                                             │
│   Is this the real life?                   │
│   Is this just ~~fantasy~~                 │  ← parola corrente evidenziata
│                                             │
│   ████████████░░░░░░░░  2:34 / 5:54        │  ← progress bar
│                                             │
├─────────────────────────────────────────────┤
│  💬 [Luca]: Vai Marco!! 🔥                  │  ← commenti in overlay
│  💬 [Sara]: Bellissimo ❤️                   │  ← scorrono dal basso
└─────────────────────────────────────────────┘
```

**Layout in attesa / tra un'esibizione e l'altra:**
```
┌─────────────────────────────────────────────┐
│           🎤 KARAOKE NIGHT                  │
│        Bar dello Sport · 15 Mar 2026        │
├──────────────────┬──────────────────────────┤
│  PROSSIMO        │  CLASSIFICA              │
│  ──────────      │  ──────────              │
│  👤 Marco        │  1. 🥇 Giulia  9.2      │
│  "Bohemian..."   │  2. 🥈 Marco   8.7      │
│                  │  3. 🥉 Sara    8.1      │
│  Dopo ancora:    │  4.    Luca    7.9      │
│  Sara - "...Vivo │                          │
│  per lei"        │                          │
└──────────────────┴──────────────────────────┘
```

**Fine esibizione — schermata celebrativa (5 secondi):**
- Animazione confetti
- Punteggio finale grande al centro
- Podio se è in top 3
- Commenti più votati in evidenza

---

### `/join` — App Pubblica (Smartphone)

**Tab 1 — Home/Live:**
- In tempo reale: chi sta cantando, punteggio live, slider voto
- Campo commento con emoji picker
- Countdown prossima esibizione

**Tab 2 — Prenota:**
- Barra di ricerca nel catalogo MIDI (`/api/songs?q=`)
- Card risultati con titolo, artista, badge MIDI/YouTube, durata
- Campo "URL YouTube" con preview automatico (titolo + durata)
- Bottone "Prenota" → toast di conferma con posizione in coda

**Tab 3 — Classifica:**
- Top 10 della serata, aggiornata in real-time
- La propria posizione evidenziata
- Tab secondario: classifica storica globale

**Tab 4 — Profilo:**
- Nickname corrente
- Statistiche: esibizioni, media voti, best score
- CTA registrazione se guest anonimo
- Form email → OTP → telefono (opzionale)

---

### `/admin` — Pannello Host

**Sezione 1 — Controllo Serata:**
- Status serata (DRAFT/OPEN/LIVE/ENDED) con bottoni cambio stato
- QR code + PIN serata (per proiettarli)
- Contatore utenti connessi

**Sezione 2 — Coda Prenotazioni:**
- Lista drag & drop dei booking in status APPROVED/READY
- Per ogni booking: utente, canzone, sorgente (badge), durata, status elaborazione YouTube
- Azioni: ▶️ Avvia · ⏭️ Salta · 🗑️ Rimuovi · ↕️ Riordina

**Sezione 3 — Approvazioni YouTube:**
- Lista booking YouTube in status PENDING
- Per ognuno: URL, titolo rilevato, durata, LRC trovato sì/no
- Azioni: ✅ Approva (avvia yt-dlp) · ❌ Rifiuta

**Sezione 4 — Esibizione Corrente:**
- Controlli playback: ▶️ Play · ⏸️ Pause · ⏹️ Stop/Fine
- Punteggio live, voti, commenti in arrivo
- Bottone "Termina esibizione" → calcolo score finale

**Sezione 5 — Gestione Utenti:**
- Lista utenti connessi con nickname
- Azioni: 🔇 Muto commenti · 🚫 Kick dalla serata

---

### `/stage` — App Cantante

- Nome canzone e artista in grande
- Countdown prima di iniziare (3-2-1)
- Testo sincronizzato (più grande, per leggere da lontano)
- Indicatore: "La tua prossima canzone: ..."
- Punteggio parziale live (voti in arrivo)

---

## 🐳 Docker Compose

```yaml
version: '3.9'

services:
  frontend:
    build: ./frontend
    container_name: karaoke-frontend
    restart: unless-stopped
    # Nginx serve la build React

  api:
    build: ./backend
    container_name: karaoke-api
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://karaoke:password@db:5432/karaokedb
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      SMTP_FROM: ${SMTP_FROM}
      STORAGE_PATH: /app/storage
    volumes:
      - karaoke-storage:/app/storage   # MIDI, LRC, audio YouTube
    depends_on:
      - db
      - redis

  db:
    image: postgres:16-alpine
    container_name: karaoke-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: karaoke
      POSTGRES_PASSWORD: password
      POSTGRES_DB: karaokedb
    volumes:
      - karaoke-pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: karaoke-redis
    restart: unless-stopped
    volumes:
      - karaoke-redis-data:/data

volumes:
  karaoke-storage:
  karaoke-pgdata:
  karaoke-redis-data:
```

**Cosmos Cloud:** configurare reverse proxy per `karaoke.tuodominio.it` → porta container `frontend:80`, con WebSocket passthrough abilitato (necessario per Socket.io).

---

## 📁 Struttura Repository

```
karaoke-game/
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
│
├── frontend/                    # React + Vite
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── src/
│   │   ├── views/
│   │   │   ├── Display/         # /display
│   │   │   ├── Join/            # /join
│   │   │   ├── Admin/           # /admin
│   │   │   └── Stage/           # /stage
│   │   ├── components/
│   │   │   ├── KaraokePlayer/   # player MIDI + sync testi
│   │   │   ├── CommentOverlay/  # commenti animati
│   │   │   ├── VoteMeter/       # voti live
│   │   │   ├── Leaderboard/
│   │   │   ├── Queue/
│   │   │   └── SongSearch/
│   │   ├── hooks/
│   │   │   ├── useSocket.ts
│   │   │   ├── useKaraokePlayer.ts
│   │   │   └── useAuth.ts
│   │   ├── store/               # Zustand o Redux Toolkit
│   │   └── api/                 # client REST
│
├── backend/                     # Node.js + Fastify
│   ├── Dockerfile
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── events.ts
│   │   │   ├── songs.ts
│   │   │   ├── bookings.ts
│   │   │   ├── performances.ts
│   │   │   ├── votes.ts
│   │   │   ├── comments.ts
│   │   │   ├── youtube.ts
│   │   │   ├── media.ts         # stream file audio/MIDI
│   │   │   └── leaderboard.ts
│   │   ├── services/
│   │   │   ├── ytdlp.service.ts      # wrappa yt-dlp
│   │   │   ├── lrclib.service.ts     # fetch LRC da lrclib.net
│   │   │   ├── otp.service.ts        # generazione e verifica OTP
│   │   │   ├── mail.service.ts       # nodemailer
│   │   │   ├── score.service.ts      # calcolo punteggi
│   │   │   └── playback.service.ts   # stato playback server-side
│   │   ├── socket/
│   │   │   ├── index.ts         # setup Socket.io
│   │   │   ├── handlers/
│   │   │   └── emitters/
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── middleware/
│   │       ├── auth.ts
│   │       └── admin.ts
│
└── storage/                     # montato come volume Docker
    ├── midi/                    # file .mid del catalogo personale
    ├── lrc/                     # file .lrc del catalogo personale
    └── yt/                      # audio estratti da YouTube ({bookingId}.opus)
```

---

## ⚙️ Dipendenze yt-dlp nel Container API

Il container `api` deve avere `yt-dlp` e `ffmpeg` installati:

```dockerfile
# backend/Dockerfile
FROM node:20-alpine

RUN apk add --no-cache ffmpeg python3 py3-pip
RUN pip3 install yt-dlp --break-system-packages

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

CMD ["node", "dist/index.js"]
```

**Comando yt-dlp usato dal servizio:**
```bash
yt-dlp \
  --extract-audio \
  --audio-format opus \
  --audio-quality 0 \
  --no-playlist \
  --output "%(id)s.%(ext)s" \
  --no-warnings \
  "{url}"
```

---

## 🔗 Integrazione lrclib.net

```typescript
// lrclib.service.ts
const BASE = 'https://lrclib.net/api'

async function getLrc(title: string, artist: string, duration?: number) {
  const params = new URLSearchParams({ track_name: title, artist_name: artist })
  if (duration) params.set('duration', String(duration))
  
  const res = await fetch(`${BASE}/get?${params}`)
  if (!res.ok) return null
  
  const data = await res.json()
  // data.syncedLyrics → formato LRC esteso con timestamp per parola
  // data.plainLyrics  → testo semplice, fallback
  return data.syncedLyrics || data.plainLyrics || null
}
```

---

## 🛠️ Ordine di Implementazione Consigliato

### Fase 1 — Foundation (priorità massima)
1. Setup Docker Compose con tutti i servizi
2. Schema Prisma + migration
3. Backend: auth (join anonimo + OTP email)
4. Backend: CRUD events e songs
5. Frontend: routing base, join flow, vista display placeholder

### Fase 2 — Core Karaoke
6. Upload e catalogazione file MIDI nel backend
7. KaraokePlayer component (Tone.js + MIDI parsing + sync LRC)
8. Backend: gestione performance (start/end)
9. Socket.io: eventi lyric:highlight, performance:start/end
10. Display: player visivo con testo animato

### Fase 3 — Social & Gamification
11. Sistema voti (API + socket + UI)
12. Sistema commenti live (API + socket + overlay animato)
13. Calcolo score finale + classifica
14. Display: schermata celebrativa fine esibizione

### Fase 4 — YouTube
15. Integrazione yt-dlp (servizio + job asincrono)
16. Integrazione lrclib.net
17. Admin: pannello approvazione YouTube
18. Playback audio YouTube nel display

### Fase 5 — Admin & UX
19. Pannello admin completo (coda drag & drop, controlli playback)
20. App /stage per cantante
21. Registrazione utente (email OTP → account permanente)
22. Classifica storica cross-serata

### Fase 6 — Polish
23. QR code generato dinamicamente per join serata
24. Animazioni (Framer Motion)
25. PWA manifest per "aggiungi a schermata home"
26. Tema scuro ottimizzato per proiettore

---

## 📋 Note Finali

- **GDPR**: il consenso marketing SMS deve essere esplicito, separato, non pre-spuntato. Conservare log del consenso con timestamp.
- **Autenticazione admin**: usare variabile d'ambiente `ADMIN_TOKEN` o tabella separata con password hashata bcrypt per le route `/api/admin/*`.
- **WebSocket e Cosmos**: verificare che Cosmos Cloud abbia il passthrough WebSocket abilitato (header `Upgrade: websocket`).
- **File MIDI**: il catalogo personale va caricato manualmente nel volume `storage/midi/` o tramite upload dall'admin panel. Formato atteso: `.mid` standard, con lyric meta-events incorporati (type 0x05).
- **Scalabilità**: per serate con oltre 100 persone contemporaneamente, valutare Redis adapter per Socket.io (già previsto nell'architettura).
- **Backup**: configurare backup automatico del volume `karaoke-pgdata` (pg_dump schedulato via cron nel container o esterno).
