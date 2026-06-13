import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookCatalog } from "../components/BookCatalog";
import { LiveTab } from "../components/join/LiveTab";
import { TurnAlertBar } from "../components/join/TurnAlertBar";
import { LeaderboardTab } from "../components/join/LeaderboardTab";
import { ProfileTab } from "../components/join/ProfileTab";
import { getStoredEvent, getStoredNickname, getStoredToken } from "../api/client";
import { reconcileGuestSession } from "../lib/authSession";

type Tab = "live" | "book" | "leaderboard" | "profile";

const TABS: { id: Tab; label: string }[] = [
  { id: "live", label: "🎤 Live" },
  { id: "book", label: "🎵 Prenota" },
  { id: "leaderboard", label: "🏆 Classifica" },
  { id: "profile", label: "👤 Profilo" },
];

export function JoinHome() {
  const [sessionOk, setSessionOk] = useState(false);
  const [tab, setTab] = useState<Tab>("book");

  useEffect(() => {
    setSessionOk(reconcileGuestSession());
    const onExpired = () => setSessionOk(false);
    window.addEventListener("karaplay:session-expired", onExpired);
    return () => window.removeEventListener("karaplay:session-expired", onExpired);
  }, []);

  const token = sessionOk ? getStoredToken() : null;
  const event = sessionOk ? getStoredEvent() : null;
  const nickname = sessionOk ? (getStoredNickname() ?? undefined) : undefined;

  return (
    <div className="kg-page-bg min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-8 md:max-w-xl">
        <header className="text-center">
          <p className="font-display text-xs uppercase tracking-[0.35em] text-fuchsia-400/90">Area pubblico</p>
          <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">KaraPlay</h1>
          {token && event ? (
            <p className="mt-2 text-sm text-zinc-400">
              {event.name}
              {nickname && (
                <>
                  {" "}
                  · sei <span className="text-zinc-200">{nickname}</span>
                </>
              )}
            </p>
          ) : (
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
              Entra con PIN e nickname per prenotare i brani, votare e commentare.
            </p>
          )}
        </header>

        {!token && (
          <Link
            to="/join/enter"
            className="font-display rounded-2xl bg-gradient-to-r from-fuchsia-600 to-fuchsia-500 px-6 py-4 text-center text-lg font-semibold text-white shadow-lg shadow-fuchsia-950/40 transition hover:from-fuchsia-500 hover:to-fuchsia-400"
          >
            Entra nella serata
          </Link>
        )}

        {token && event && (
          <>
            <nav className="grid grid-cols-4 gap-1 rounded-xl border border-zinc-800 bg-zinc-950/70 p-1 text-sm" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={
                    tab === t.id
                      ? "rounded-lg bg-zinc-700/80 px-1 py-2 font-medium text-white"
                      : "rounded-lg px-1 py-2 text-zinc-500 hover:text-zinc-300"
                  }
                >
                  {t.label}
                </button>
              ))}
            </nav>

            <TurnAlertBar eventId={event.id} />

            <section className="kg-card overflow-hidden p-0">
              {tab === "live" && <LiveTab eventId={event.id} userNickname={nickname} />}
              {tab === "book" && <BookCatalog />}
              {tab === "leaderboard" && <LeaderboardTab eventId={event.id} userNickname={nickname} />}
              {tab === "profile" && <ProfileTab />}
            </section>
          </>
        )}

        <footer className="mt-auto border-t border-zinc-800/80 pt-6 text-sm text-zinc-500">
          <nav className="flex items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link to="/join/enter" className="hover:text-white">
                Cambia nickname
              </Link>
              {token && event && (
                <>
                  <span aria-hidden="true" className="text-zinc-700">
                    ·
                  </span>
                  <Link
                    to="/display"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white"
                    title="Testi e video sincronizzati al proiettore, senza audio"
                  >
                    Gobbo
                  </Link>
                </>
              )}
            </div>
            <Link to="/admin" className="shrink-0 hover:text-white">
              Admin
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
