import { Link, useSearchParams } from "react-router-dom";
import { KaraokePlayer } from "../components/KaraokePlayer";

const MODUGNO_MIDI = "https://digilander.libero.it/orac/Meraviglioso_Domenico_Modugno.mid";
const GS_TEST_MIDI = "https://gsarchive.net/html/sounds/test.mid";

export function TestMidi() {
  const [searchParams] = useSearchParams();
  const midiParam = searchParams.get("midi") ?? "modugno";
  const useShort = midiParam === "short" || midiParam === "gs";
  const remoteMidiUrl = useShort ? GS_TEST_MIDI : MODUGNO_MIDI;
  const meta = useShort
    ? { title: "test.mid (gsarchive)", artist: "Brano di prova corto" }
    : { title: "Meraviglioso", artist: "Domenico Modugno" };

  return (
    <div className="kg-page-bg flex min-h-dvh flex-col items-center px-4 py-10">
      <div className="w-full max-w-5xl space-y-6">
        <div className="text-center">
          <p className="font-display text-xs uppercase tracking-[0.35em] text-amber-300/90">Test MIDI</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Karaoke integrato (demo)</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Stesso player della sala: MIDI via proxy API. Brani lunghi caricano molti strumenti GM in sequenza
            (evita sovraccarichi rispetto al caricamento parallelo). Senza .lrc compare solo la base.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Richiede il banco sonoro già copiato sul server. File attuale:{" "}
            <span className="text-zinc-300">{useShort ? "test.mid (corto)" : "Modugno — Meraviglioso"}</span>
          </p>
          <p className="mt-3 flex flex-wrap justify-center gap-3 text-xs">
            <Link
              to="/test-midi?midi=modugno"
              className={!useShort ? "font-medium text-fuchsia-300" : "text-fuchsia-400/80 underline"}
            >
              Modugno (lungo)
            </Link>
            <span className="text-zinc-600">|</span>
            <Link
              to="/test-midi?midi=short"
              className={useShort ? "font-medium text-fuchsia-300" : "text-fuchsia-400/80 underline"}
            >
              test.mid corto (gsarchive)
            </Link>
          </p>
        </div>

        <KaraokePlayer
          key={remoteMidiUrl}
          songId="test"
          remoteMidiUrl={remoteMidiUrl}
          title={meta.title}
          artist={meta.artist}
          lrcPath={null}
        />

        <p className="text-center text-xs text-zinc-600">
          <Link to="/join" className="text-fuchsia-400 hover:underline">
            Torna al pubblico
          </Link>
        </p>
      </div>
    </div>
  );
}
