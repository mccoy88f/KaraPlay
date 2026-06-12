# KaraPlay 🎤

Web app per serate karaoke gamificate: prenotazioni dal pubblico, coda live, voti e commenti,
classifica, schermo sala e console per l'host.

## Avvio rapido

```bash
docker compose up -d --build
docker compose exec -T api npx prisma migrate deploy
```

Apri `http://localhost:8083` nel browser. Le variabili (JWT_SECRET, SMTP…) sono opzionali per
provare: hanno default di sviluppo, personalizzale con un file `.env` (vedi `.env.example`).

## Avvio con Portainer

Lo stack si avvia direttamente dal repository, senza clonare nulla a mano:

1. **Stacks → Add stack → Repository**
2. Repository URL: `https://github.com/mccoy88f/KaraPlay`, reference `refs/heads/main`
3. Compose path: `docker-compose.yml`
4. (Opzionale) aggiungi le env `JWT_SECRET`, `SMTP_*` nella sezione *Environment variables*
5. **Deploy the stack** — Portainer builda le immagini di frontend e backend da solo

Al primo avvio il backend applica le migrazioni e il seed: serata demo con PIN `000000` e
**super admin `admin` / `admin`** (cambia subito la password da `/admin` → Account).
L'app è su `http://<host>:8083`.

## Interfacce

| URL | Chi la usa |
|-----|------------|
| `/join` | Pubblico (smartphone): prenotazioni, voti, commenti, classifica |
| `/display` | Proiettore / TV (login admin): palco, testi, video, QR, punteggi |
| `/admin` | Host / DJ: coda live, conduzione serata, catalogo, impostazioni tecniche |

## Funzionalità principali

### Pubblico (`/join`)

- Entrata con nickname e PIN serata
- Prenotazione brani **MIDI** (catalogo dell'admin) o **YouTube** (ricerca integrata)
- Anteprima MIDI (~25 s) e anteprima YouTube inline
- Voto 1–10 e commenti durante l'esibizione in corso
- Classifica serata e storica

### Schermo sala (`/display`)

- Login admin (stesso account del pannello); chiusura automatica a fine brano
- **Palco unificato**: stessa cornice per MIDI, video scaricati e embed YouTube
- Overlay iniziale «Avvia» (tap-to-start richiesto dal browser per l'audio)
- **Karaoke MIDI**: testi a 4 righe (paging a coppie), evidenziazione riga corrente
- **Barra trasporto** in basso (MIDI e video scaricati): slider, pausa, ricomincia, tempo;
  compare al movimento del mouse/touch
- QR code e PIN nella schermata d'attesa; coriandoli sul punteggio; commenti live in overlay

### Console host (`/admin`)

- **Conduzione**: scaletta live, approvazione richieste, «Ora sul palco», voti, concludi esibizione
- **Coda**: anticipa/posticipa, elimina, avvia sul palco, bis (↻ ripeti)
- **Video YouTube**: download «no ads» con yt-dlp; rinomina titolo; fallback embed se download fallisce
- **Tonalità e voce (MIDI)**:
  - Selettore **muta traccia** (voce guida, di solito traccia 4) — effetto live sul display
  - Selettore **tonalità in semitoni** (−12…+12) — effetto live sul display
- **Tonalità (video scaricati)**: stesso selettore semitoni; audio processato con SoundTouchJS
- **Catalogo MIDI**: upload singolo, import massivo da ZIP, metadati da file (.mid), genere, modifica brani
- **Audio**: banchi soundfont Gleitz o SF2 caricati; sync campioni; cookies YouTube per admin
- Stati serata: In preparazione → Prenotazioni aperte → Live → Conclusa (con pulizia video yt)

### Backend

- API REST (Fastify) + Socket.io per coda, voti, commenti, classifica, mute/tonalità live
- PostgreSQL (Prisma); JWT per pubblico e admin
- yt-dlp + ffmpeg per ricerca/download video; file serviti da `/api/media/…`

## Audio e riproduzione

| Tipo | Motore | Tonalità live | Voce guida |
|------|--------|---------------|------------|
| MIDI (banco Gleitz) | soundfont-player + Web Audio | Sì (note trasposte) | Mute traccia MIDI |
| MIDI (banco SF2) | spessasynth_lib | Sì (`transpose` master) | Mute canale MIDI |
| Video scaricato | `<video>` + **SoundTouchJS** | Sì (`pitchSemitones`) | — (mix già nel file) |
| YouTube embed | IFrame API | No | — |

I valori `Song.transposeSemitones` e `Song.mutedTrack` sono persistiti per brano e propagati in
live via socket (`song:transpose-semitones`, `song:muted-track`).

## Sviluppo locale

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
cd frontend && npm install && npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`
- MailHog (email test): `http://localhost:8025`

## Stack

- **Frontend**: React 19, Vite, Tailwind CSS 4, Socket.io client
- **Backend**: Node.js, Fastify, Prisma, PostgreSQL, Socket.io
- **MIDI**: `@tonejs/midi`, `soundfont-player`, `spessasynth_lib`
- **Pitch video**: `@soundtouchjs/audio-worklet` (MPL-2.0)
- **YouTube**: yt-dlp, ffmpeg (container API)
- **Infra**: Docker Compose, Nginx

## Configurazione

Copia `.env.example` in `.env` e configura:

```env
JWT_SECRET=chiave_segreta_lunga
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tua@email.com
SMTP_PASS=password_app
YOUTUBE_COOKIES_PATH=
```

## Aggiungere canzoni MIDI

1. Vai su `/admin` → **Tecnico** → Catalogo (o import ZIP massivo)
2. Carica file `.mid` + `.lrc` opzionale
3. Titolo/artista/anno possono essere letti dal file; il brano appare nel catalogo prenotazioni

## Cosmos Cloud / reverse proxy

Configura il reverse proxy verso la porta `80` del container `karaoke-frontend`.
**Importante**: abilita il passthrough WebSocket per Socket.io (header `Upgrade: websocket`).

---

## Licenze e crediti

KaraPlay è un **prodotto commerciale**. Il codice applicativo del repository è proprietario
(salvo diversa indicazione nei singoli file). Le librerie e gli strumenti elencati sotto hanno
licenze open source **compatibili con uso commerciale**, ciascuna con i propri obblighi.

### Librerie JavaScript (frontend)

| Componente | Pacchetto | Licenza | Uso in KaraPlay |
|------------|-----------|---------|-----------------|
| Parsing MIDI | [@tonejs/midi](https://github.com/Tonejs/Midi) | MIT | Lettura file `.mid`, testi incorporati |
| Campioni GM (Gleitz) | [soundfont-player](https://github.com/danigb/soundfont-player) | MIT | Playback MIDI con banchi mp3/ogg |
| Sintesi SF2 | [spessasynth_lib](https://github.com/spessasus/spessasynth_lib) | Apache-2.0 | Playback MIDI con file `.sf2` |
| Pitch shift video | [@soundtouchjs/audio-worklet](https://github.com/cutterbl/SoundTouchJS) | **MPL-2.0** | Trasposizione semitoni su video scaricati |
| UI / rete | React, Vite, Tailwind, socket.io-client, qrcode, canvas-confetti, jszip | MIT / Apache-2.0 | Interfaccia e realtime |

**SoundTouchJS (MPL-2.0)** — obblighi principali per un prodotto chiuso:

- Puoi usare e distribuire il bundle minificato in un'app a pagamento.
- Se **modifichi i file** del pacchetto `@soundtouchjs/*`, devi rendere disponibili quelle modifiche
  sotto MPL-2.0.
- Includi l'avviso di copyright e un link alla licenza MPL (es. sezione crediti in app o file
  `THIRD_PARTY_LICENSES`).

### Strumenti server (backend / Docker)

| Strumento | Licenza tipica | Uso |
|-----------|----------------|-----|
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Unlicense | Ricerca e download video YouTube |
| [ffmpeg](https://ffmpeg.org/) | LGPL/GPL (build dipendente) | Merge/remux video; invocato come **processo esterno**, non linkato nel codice Node |
| PostgreSQL, Node.js | Licenze rispettive | Runtime |

Per ffmpeg in produzione commerciale: usa build e modalità d'uso (subprocess vs link statico)
coerenti con la tua policy legale; in KaraPlay ffmpeg è chiamato da yt-dlp/shell, non embedded
nel binario dell'app.

### SoundFont e contenuti

- I banchi **Fluid R3 / Musyng Kite / Fatboy** (campioni Gleitz) e i file **SF2** caricati
  dagli admin sono **contenuti musicali separati** dal codice: verifica sempre diritti e licenze
  delle soundfont e dei brani MIDI/video usati in serata.
- I video YouTube scaricati restano responsabilità dell'organizzatore della serata (termini
  YouTube, diritti d'autore, SIAE).

### Crediti suggeriti (schermata «Informazioni» o README distribuito)

```
KaraPlay — karaoke gamificato
Audio: SoundTouchJS © Steve Blades (MPL-2.0)
MIDI: spessasynth © SpessaSus (Apache-2.0), soundfont-player © danigb (MIT)
MIDI parser: @tonejs/midi (MIT)
```

Per un elenco completo delle dipendenze npm: `npm ls --all` in `frontend/` e `backend/`.

---

## Repository

https://github.com/mccoy88f/KaraPlay
