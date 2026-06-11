import { Link } from "react-router-dom";
import { BookCatalog } from "../components/BookCatalog";
import { getStoredToken } from "../api/client";

export function JoinHome() {
  const token = getStoredToken();

  return (
    <div className="kg-page-bg min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-8 px-4 py-10 md:max-w-xl">
        <header className="text-center">
          <p className="font-display text-xs uppercase tracking-[0.35em] text-fuchsia-400/90">Area pubblico</p>
          <h1 className="font-display mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">KaraokeGame</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
            {token
              ? "Sei in sala: prenota dal catalogo. Il timbro MIDI sul display è impostato dall’host (admin)."
              : "Entra con PIN e nickname per prenotare i brani."}
          </p>
        </header>

        {!token && (
          <Link
            to="/join/enter"
            className="font-display rounded-2xl bg-gradient-to-r from-fuchsia-600 to-fuchsia-500 px-6 py-4 text-center text-lg font-semibold text-white shadow-lg shadow-fuchsia-950/40 transition hover:from-fuchsia-500 hover:to-fuchsia-400"
          >
            Entra nella serata
          </Link>
        )}

        {token && (
          <section className="kg-card overflow-hidden p-0">
            <BookCatalog />
          </section>
        )}

        <footer className="mt-auto border-t border-zinc-800/80 pt-8 text-sm text-zinc-500">
          <p className="font-medium text-zinc-400">Host / tecnico</p>
          <p className="mt-2 leading-relaxed">
            Catalogo MIDI, coda, stato serata e banco sonoro:{" "}
            <Link to="/admin" className="text-fuchsia-400 underline-offset-2 hover:underline">
              pannello admin
            </Link>
            .
          </p>
          <nav className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-zinc-500">
            <Link to="/display" className="hover:text-white">
              Schermo
            </Link>
            <span aria-hidden="true" className="text-zinc-700">
              ·
            </span>
            <Link to="/stage" className="hover:text-white">
              Palco
            </Link>
            <span aria-hidden="true" className="text-zinc-700">
              ·
            </span>
            <Link to="/join/enter" className="hover:text-white">
              Cambia nickname
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
