# KaraPlay — Correzioni e implementazioni per il completamento

Stato del progetto al 2026-06-11. Le voci spuntate `[x]` sono risolte nel branch corrente;
le voci `[ ]` restano da fare per arrivare a un progetto completo e funzionante su tutto.

---

## 1. Build e infrastruttura

- [x] **Frontend non buildava** (`npm run build` falliva):
  - `postcss.config.js` richiedeva `autoprefixer` (non installato): config residua di Tailwind v3,
    il progetto usa Tailwind v4 via `@tailwindcss/vite`. Rimossi `postcss.config.js` e `tailwind.config.js`.
    Il bug rompeva anche il CSS in modalità dev.
  - ~86 errori TypeScript causati da una generazione precedente di componenti mai instradati
    (vedi §2). Rimossi.
- [x] **Backend non buildava** (`tsc` falliva con 21 errori): `routes/comments.ts`, `routes/leaderboard.ts`,
  `routes/votes.ts`, `services/score.service.ts` erano scritti per la vecchia architettura Express,
  importavano `prisma` da `../index` (che non esporta nulla) e non erano montati in `app.ts`. Rimossi
  (da reimplementare, vedi §5).
- [x] **Seed duplicato**: rimosso `backend/src/prisma/seed.ts` (legacy, usava un `hostId` inesistente).
  Il seed attivo è `backend/prisma/seed.ts`.
- [ ] **Redis**: il `docker-compose.yml` avvia un container Redis e passa `REDIS_URL`, ma nessun codice
  lo usa. Rimuovere il servizio oppure usarlo (es. stato code YouTube / job persistenti).
- [ ] **CI**: aggiungere una GitHub Action che esegua `tsc` + build di entrambi i pacchetti per evitare
  regressioni della build.

## 2. Codice legacy frontend (rimosso)

- [x] Rimossi i file mai instradati da `App.tsx`, che usavano dipendenze non installate
  (`framer-motion`, `zustand`, `react-hot-toast`, `qrcode`), un default export inesistente di
  `api/client.ts`, endpoint inesistenti ed eventi socket mai emessi:
  - `views/Admin/`, `views/Display/`, `views/Join/`, `views/Stage/` (con i loro `components/`)
  - `components/CommentOverlay/`, `components/KaraokePlayer/`, `components/Leaderboard/`,
    `components/QRCode/`, `components/SongSearch/`, `components/VoteMeter/`
  - `hooks/useAuth.ts`, `hooks/useKaraokePlayer.ts`, `hooks/useSocket.ts`, `store/useStore.ts`

  Nota: quei file contenevano UI utili come riferimento (tab pubblico, overlay commenti, QR code,
  classifica animata): recuperarle dalla cronologia git quando si reimplementano le feature del §5.

## 3. MIDI + SoundFont SF2 (focus di questa iterazione)

- [x] **Riproduzione con SoundFont .sf2 reali** sul display tramite `spessasynth_lib`
  (sintetizzatore SF2/SF3/DLS in AudioWorklet):
  - upload di file `.sf2`/`.sf3` dal pannello admin (`POST /api/admin/soundfonts/sf2/upload`),
    elenco (`GET /api/admin/soundfonts/sf2`) ed eliminazione (`DELETE /api/admin/soundfonts/sf2/:file`);
  - i banchi SF2 caricati compaiono nel selettore "Banco sonoro" della serata con id `sf2:<file>`
    (campo `Event.soundfontBankId`, nessuna migrazione necessaria);
  - il player usa il synth SF2 (percussioni GM corrette sul canale 10, program change, pitch bend)
    quando il banco selezionato è un SF2; per i banchi Gleitz (`fluid_r3`, `musyng_kite`, `fatboy`)
    resta il player `soundfont-player` esistente con campioni mp3 pre-renderizzati;
  - il file SF2 è servito da `GET /api/media/sf2/:file` e messo in cache nel browser tra un brano
    e l'altro.
- [ ] Migliorare il player Gleitz di fallback: oggi le percussioni (canale 10) usano un
  `Tone.PolySynth` generico che suona note intonate: o scaricare un drum kit dedicato o
  deprecare i banchi Gleitz quando un SF2 è disponibile.
- [ ] Pre-caricamento del banco SF2 sul display prima dell'avvio dell'esibizione (oggi il download
  parte al primo "Avvia karaoke"; con SF2 grandi conviene il prefetch all'apertura della pagina).
- [ ] Pausa / seek durante l'esibizione (il Sequencer di spessasynth supporta `currentTime` e `pause()`).
- [ ] Evidenziazione karaoke a livello di parola (oggi LRC a livello di riga; valutare Enhanced LRC).

## 4. Libreria brani e YouTube (focus di questa iterazione)

- [x] **Ricerca YouTube integrata**: `GET /api/youtube/search?q=` (autenticata, usa `yt-dlp ytsearch`)
  e UI nel catalogo pubblico (`BookCatalog`) con doppia scheda **Catalogo MIDI / YouTube**:
  il pubblico cerca un brano e lo prenota; la prenotazione entra in coda come `PENDING`.
- [x] **Flusso di approvazione YouTube completato nel pannello admin** (prima esisteva solo l'API):
  - pulsanti **Approva / Rifiuta** per le prenotazioni `PENDING`;
  - pulsante **Scarica audio** (avvio `yt-dlp`) per le prenotazioni YouTube `APPROVED`,
    con stato `PROCESSING` ed eventuale errore (`ytProcessError`) visibile in coda.
- [x] **Riproduzione YouTube sul display**: per i brani con sorgente YouTube il display ora riproduce
  l'audio scaricato (`/api/media/yt/:bookingId`) con testi LRC sincronizzati (da LRCLIB) quando trovati.
- [ ] Ricerca nel catalogo MIDI lato server per cataloghi grandi (oggi il filtro è client-side;
  l'endpoint `GET /api/songs?q=` esiste già).
- [ ] Metadati migliori per i risultati YouTube (durata talvolta assente con `--flat-playlist`).
- [ ] Limite/risparmio chiamate: cache breve dei risultati di ricerca YouTube lato server.

## 5. Funzionalità previste dalla spec ma assenti (da implementare)

Tutte le parti seguenti erano presenti solo come codice legacy rotto e sono state rimosse;
vanno reimplementate sull'architettura attuale (Fastify + Socket.io + JWT):

- [ ] **Voti del pubblico** (`POST /api/performances/:id/votes`, evento socket `vote:update`,
  widget VoteMeter su display e UI di voto su /join durante l'esibizione).
- [ ] **Commenti live** (`POST /api/performances/:id/comments`, evento `comment:new`,
  overlay commenti sul display, moderazione admin).
- [ ] **Punteggio e classifica** (calcolo punteggio a fine esibizione — la formula base esiste già
  in `performances.ts` —, tabella `Leaderboard` aggiornata, endpoint classifica serata/globale,
  widget classifica su display e tab su /join). I modelli Prisma `Vote`, `Comment`, `Leaderboard`
  esistono già nello schema.
- [ ] **Vista palco `/stage`**: oggi è un placeholder. Servono: testo ingrandito sincronizzato,
  countdown di inizio, prossimo cantante.
- [ ] **Verifica email/OTP**: il backend espone `/api/auth/request-otp` e `/api/auth/verify-otp`
  con invio email (SMTP), ma nessuna UI li usa. Aggiungere il flusso nel profilo utente
  (necessario per il "premio serata" della spec).
- [ ] **QR code sul display** per il join rapido (componente legacy rimosso, da rifare).
- [ ] **Pagina admin per la creazione serate**: l'API `POST /api/admin/events` esiste,
  ma dall'admin UI non si può creare una serata (oggi solo via seed o API).

## 6. Robustezza e sicurezza

- [ ] `ADMIN_TOKEN` statico come unica autenticazione admin: valutare login host con password + JWT.
- [ ] Rate limiting su endpoint pubblici (join, ricerca YouTube) — es. `@fastify/rate-limit`.
- [ ] Validazione/dimensione upload MIDI-LRC più stringente e scansione dei tag del file.
- [ ] Persistenza dei job YouTube (oggi in memoria: un riavvio del backend perde lo stato).
- [ ] Test automatici (oggi assenti): unit per servizi backend, e2e per il flusso prenotazione.
