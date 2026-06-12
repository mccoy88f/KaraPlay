# KaraPlay — Correzioni e implementazioni per il completamento

Stato del progetto al 2026-06-11 (aggiornato dopo la seconda iterazione: voti, commenti,
classifica, palco, QR e creazione serate). Le voci spuntate `[x]` sono risolte;
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
- [x] **Testi karaoke incorporati nel MIDI** (meta-eventi lyric FF05/FF01 dei file .kar,
  come da spec): estratti e sincronizzati automaticamente quando manca il file .lrc
  (il .lrc, se caricato, ha priorità). Funziona su display e palco.
- [x] **Robustezza player Gleitz**: caricamento strumenti in parallelo con progresso
  visibile ("Carico strumenti… 3/11"), errori di scheduling mostrati a schermo invece
  di interrompere in silenzio (prima un'eccezione su una nota lasciava il pulsante
  "Avvia" senza alcun feedback), note problematiche saltate senza fermare il brano.
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
- [x] **Flusso di approvazione YouTube nel pannello admin**: pulsanti **Approva / Rifiuta**
  per le prenotazioni `PENDING`; una volta approvate si avviano direttamente.
- [x] **Riproduzione YouTube ibrida sul display**: di base il video parte subito
  nell'iframe embed (può mostrare la pubblicità di YouTube); in alternativa l'admin può
  pre-scaricare il **video mp4** con yt-dlp (pulsante "No ads ⬇" in coda) — in quel caso
  il display riproduce il file dal server (`/api/media/yt/:bookingId`, con supporto Range
  per il seeking) **senza pubblicità**. Non si scarica più solo l'audio né si cercano
  testi su LRCLIB: il video karaoke contiene già tutto.
- [ ] Ricerca nel catalogo MIDI lato server per cataloghi grandi (oggi il filtro è client-side;
  l'endpoint `GET /api/songs?q=` esiste già).
- [ ] Metadati migliori per i risultati YouTube (durata talvolta assente con `--flat-playlist`).
- [ ] Limite/risparmio chiamate: cache breve dei risultati di ricerca YouTube lato server.

## 5. Funzionalità previste dalla spec (reimplementate su Fastify + Socket.io + JWT)

- [x] **Voti del pubblico**: `POST/GET /api/performances/:id/votes` (1-10, un voto per utente,
  niente auto-voto, solo a esibizione in corso), evento socket `vote:update`, slider di voto
  nel tab Live di /join, media live su display e palco.
- [x] **Commenti live**: `POST/GET /api/performances/:id/comments` (max 120 caratteri + emoji
  rapide), evento `comment:new`, overlay commenti sul display (scompaiono dopo ~9s).
  - [ ] Moderazione admin (muto/kick) ancora da fare.
- [x] **Punteggio e classifica**: a fine esibizione il punteggio (media voti ×0.8 + bonus
  commenti ×0.2) aggiorna la tabella `Leaderboard`; endpoint classifica serata
  (`GET /api/events/:id/leaderboard`), globale (`GET /api/leaderboard/global`) e statistiche
  personali (`GET /api/users/me/stats`); evento `leaderboard:update`; widget su display
  (schermata d'attesa) e tab Classifica su /join (serata + storica).
  - [ ] La classifica storica usa la media semplice; la spec chiede una media pesata
    sulle esibizioni recenti.
- [x] **Vista palco `/stage`**: countdown 3-2-1 all'avvio, testo sincronizzato ingrandito
  (clock condiviso: il display rilancia il tempo del player via socket `transport:tick`,
  il palco interpola tra i tick), media voti live, prossimi cantanti in attesa.
- [x] **Verifica email/OTP**: tab Profilo su /join con statistiche personali e flusso
  email → codice OTP → verifica (richiede SMTP configurato per l'invio reale).
- [x] **QR code sul display**: nella schermata di attesa, con PIN e link diretto
  `/join/enter?pin=…` (campo PIN precompilato).
- [x] **Creazione serate da admin** con `GET /api/admin/events`.
- [x] **Pannello host ridisegnato per chi presenta** (non per tecnici): due aree,
  **Conduzione** (scelta serata da menu — niente più PIN da digitare —, scaletta che si
  aggiorna da sola via socket, richieste in attesa con Approva/Rifiuta a un tap e
  miniatura YouTube, card "Ora sul palco" con voti live e pulsante Concludi, stato
  serata con etichette parlanti, impostazioni audio richiudibili) e **Tecnico**
  (catalogo MIDI, debug, cookies — cose da fare una volta sola).
- [x] **Anteprima brani per il pubblico**: nel catalogo MIDI un tasto ▶ suona ~25s del
  brano (3 strumenti principali, banco Fluid R3); nei risultati YouTube la miniatura
  apre il video in anteprima inline prima di richiederlo.

## 6. Robustezza e sicurezza

- [ ] `ADMIN_TOKEN` statico come unica autenticazione admin: valutare login host con password + JWT.
- [ ] Rate limiting su endpoint pubblici (join, ricerca YouTube) — es. `@fastify/rate-limit`.
- [ ] Validazione/dimensione upload MIDI-LRC più stringente e scansione dei tag del file.
- [ ] Test automatici (oggi assenti): unit per servizi backend, e2e per il flusso prenotazione.
