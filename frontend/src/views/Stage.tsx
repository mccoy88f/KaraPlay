import { Link } from "react-router-dom";

export function Stage() {
  return (
    <div className="kg-page-bg flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
        <p className="font-display text-xs uppercase tracking-[0.4em] text-cyan-400/90">Palco</p>
        <h1 className="font-display mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Vista cantante
        </h1>
        <p className="mt-6 max-w-lg text-zinc-400">
          Qui andranno testo ingrandito, countdown e punteggio in tempo reale. Il timbro MIDI sullo schermo
          principale segue il <strong className="text-zinc-300">banco sonoro</strong> impostato dall&apos;host nella
          sezione <strong className="text-zinc-300">Coda live</strong> del pannello admin.
        </p>
      </div>

      <footer className="border-t border-zinc-800/80 py-4 text-center text-sm text-zinc-500">
        <Link to="/join" className="hover:text-white">
          Pubblico
        </Link>
        <span className="mx-3 text-zinc-800">·</span>
        <Link to="/display" className="hover:text-white">
          Display
        </Link>
      </footer>
    </div>
  );
}
