import { Fragment, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractMidiMeta } from "../../lib/midiMeta";
import { notifyCatalogChanged, syncCatalogSelection } from "../../lib/catalogSelection";
import { useI18n } from "../../i18n/context";
import { MidiBulkImport } from "./MidiBulkImport";
import { SongCoverThumb } from "../SongCoverThumb";

const base = import.meta.env.VITE_API_URL ?? "";

export type SongDto = {
  id: string;
  title: string;
  artist: string;
  source: string;
  midiPath: string | null;
  lrcPath: string | null;
  duration: number | null;
  fileName?: string | null;
  year?: number | null;
  genre?: string | null;
  language?: string | null;
  coverUrl?: string | null;
};

type Props = {
  authHeader: () => Record<string, string>;
};

type CatalogView = "list" | "artist";
type PageSize = 25 | 50 | 100;

const PAGE_SIZES: PageSize[] = [25, 50, 100];

function CoverPreview({ url }: { url: string }) {
  if (!url.trim()) return null;
  return (
    <img
      src={url.trim()}
      alt=""
      className="h-16 w-16 shrink-0 rounded-lg border border-zinc-700 object-cover"
      loading="lazy"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

export function MidiCatalogSection({ authHeader }: Props) {
  const { t } = useI18n();
  const [songs, setSongs] = useState<SongDto[]>([]);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [language, setLanguage] = useState("");
  const [year, setYear] = useState("");
  const [genre, setGenre] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [editLookupBusy, setEditLookupBusy] = useState(false);
  const lookupSeqRef = useRef(0);
  /** Brano in modifica (pannello sotto la tabella). */
  const [editing, setEditing] = useState<SongDto | null>(null);
  const [edit, setEdit] = useState({ title: "", artist: "", year: "", genre: "", language: "", coverUrl: "" });
  const [editBusy, setEditBusy] = useState(false);
  const [midiFile, setMidiFile] = useState<File | null>(null);
  const [lrcFile, setLrcFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogView, setCatalogView] = useState<CatalogView>("list");
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [page, setPage] = useState(1);
  const [expandedArtists, setExpandedArtists] = useState<Set<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteBusy, setDeleteBusy] = useState(false);
  /** Ultimi valori precompilati dal file: si sovrascrivono solo se l'utente non li ha toccati. */
  const autoFillRef = useRef<{ title: string; artist: string; year: string }>({ title: "", artist: "", year: "" });
  const editPanelRef = useRef<HTMLFormElement>(null);
  const scrollRestoreRef = useRef(0);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  const filteredSongs = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        (s.fileName?.toLowerCase().includes(q) ?? false) ||
        (s.genre?.toLowerCase().includes(q) ?? false) ||
        (s.year != null && String(s.year).includes(q))
    );
  }, [songs, catalogQuery]);

  const filteredIds = useMemo(() => filteredSongs.map((s) => s.id), [filteredSongs]);

  const unknownArtistLabel = t("admin.catalog.unknownArtist");

  const artistGroups = useMemo(() => {
    const map = new Map<string, SongDto[]>();
    for (const s of filteredSongs) {
      const key = s.artist.trim() || unknownArtistLabel;
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map(([artist, groupSongs]) => ({
        artist,
        songs: groupSongs.sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
        ),
      }));
  }, [filteredSongs, unknownArtistLabel]);

  const totalPages = useMemo(() => {
    const count = catalogView === "list" ? filteredSongs.length : artistGroups.length;
    return Math.max(1, Math.ceil(count / pageSize));
  }, [catalogView, filteredSongs.length, artistGroups.length, pageSize]);

  const paginatedSongs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSongs.slice(start, start + pageSize);
  }, [filteredSongs, page, pageSize]);

  const paginatedGroups = useMemo(() => {
    const start = (page - 1) * pageSize;
    return artistGroups.slice(start, start + pageSize);
  }, [artistGroups, page, pageSize]);

  const pageSongIds = useMemo(() => {
    if (catalogView === "list") return paginatedSongs.map((s) => s.id);
    return paginatedGroups.flatMap((g) => g.songs.map((s) => s.id));
  }, [catalogView, paginatedSongs, paginatedGroups]);

  const allPageSelected = pageSongIds.length > 0 && pageSongIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageSongIds.some((id) => selectedIds.has(id));
  const someFilteredSelected = filteredIds.some((id) => selectedIds.has(id));

  useEffect(() => {
    setPage(1);
  }, [catalogQuery, pageSize, catalogView]);

  useEffect(() => {
    syncCatalogSelection([...selectedIds]);
  }, [selectedIds]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageSongIds) next.delete(id);
      } else {
        for (const id of pageSongIds) next.add(id);
      }
      return next;
    });
  }

  function toggleArtistExpand(artist: string) {
    setExpandedArtists((prev) => {
      const next = new Set(prev);
      if (next.has(artist)) next.delete(artist);
      else next.add(artist);
      return next;
    });
  }

  function toggleSelectArtistGroup(groupSongs: SongDto[]) {
    const ids = groupSongs.map((s) => s.id);
    const all = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (all) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  }

  async function deleteSongIds(ids: string[]) {
    if (ids.length === 0) return;
    setDeleteBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`${base}/api/admin/songs/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json().catch(() => ({}))) as { deleted?: number; errors?: string[]; error?: string };
      if (!res.ok) {
        setErr(data.error ?? t("admin.catalog.deleteFailed"));
        return;
      }
      const deleted = data.deleted ?? 0;
      const failed = data.errors?.length ?? 0;
      if (deleted === 1 && ids.length === 1) {
        const title = songs.find((s) => s.id === ids[0])?.title ?? "";
        setMsg(t("admin.catalog.deletedOne", { title }));
      } else if (deleted > 0 && failed === 0) {
        setMsg(t("admin.catalog.deletedMany", { n: deleted }));
      } else if (deleted > 0) {
        setMsg(t("admin.catalog.deletePartial", { deleted, failed }));
        if (data.errors?.length) setErr(data.errors.slice(0, 3).join(" · "));
      } else {
        setErr(data.errors?.[0] ?? t("admin.catalog.deleteFailed"));
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      if (editing && ids.includes(editing.id)) setEditing(null);
      await loadSongs();
      notifyCatalogChanged();
    } finally {
      setDeleteBusy(false);
    }
  }

  function confirmDeleteOne(s: SongDto) {
    if (!window.confirm(t("admin.catalog.deleteConfirmOne", { title: s.title }))) return;
    void deleteSongIds([s.id]);
  }

  function confirmDeleteSelected() {
    const ids = [...selectedIds].filter((id) => filteredIds.includes(id));
    if (ids.length === 0) return;
    if (!window.confirm(t("admin.catalog.deleteConfirmSelected", { n: ids.length }))) return;
    void deleteSongIds(ids);
  }

  function confirmDeleteFiltered() {
    const ids = filteredIds;
    if (ids.length === 0) return;
    if (!window.confirm(t("admin.catalog.deleteConfirmFiltered", { n: ids.length }))) return;
    void deleteSongIds(ids);
  }

  /** Alla scelta del file, titolo e artista si leggono dai metadati MIDI/.kar (modificabili). */
  async function onMidiPicked(f: File | null) {
    setMidiFile(f);
    if (!f) return;
    try {
      const meta = extractMidiMeta(await f.arrayBuffer(), f.name);
      setTitle((cur) => {
        if (meta.title && (cur.trim() === "" || cur === autoFillRef.current.title)) {
          autoFillRef.current.title = meta.title;
          return meta.title;
        }
        return cur;
      });
      setArtist((cur) => {
        if (meta.artist && (cur.trim() === "" || cur === autoFillRef.current.artist)) {
          autoFillRef.current.artist = meta.artist;
          return meta.artist;
        }
        return cur;
      });
      setYear((cur) => {
        const y = meta.year != null ? String(meta.year) : "";
        if (y && (cur.trim() === "" || cur === autoFillRef.current.year)) {
          autoFillRef.current.year = y;
          return y;
        }
        return cur;
      });
      if (meta.title || meta.artist) {
        setMsg(t("admin.catalog.readFromFile"));
      }
    } catch {
      /* file illeggibile: i campi restano come sono */
    }
  }

  const loadSongs = useCallback(async () => {
    const res = await fetch(`${base}/api/admin/songs`, { headers: { ...authHeader() } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setSongs((data as { songs: SongDto[] }).songs ?? []);
  }, [authHeader]);

  useEffect(() => {
    startTransition(() => {
      void loadSongs();
    });
  }, [loadSongs]);

  useEffect(() => {
    const onCatalogChanged = () => void loadSongs();
    window.addEventListener("karaplay:catalog-changed", onCatalogChanged);
    return () => window.removeEventListener("karaplay:catalog-changed", onCatalogChanged);
  }, [loadSongs]);

  /** Genere/anno/copertina/artista da iTunes (via backend): precompila i campi ancora vuoti. */
  const fetchMetaLookup = useCallback(
    async (
      lookupTitle: string,
      lookupArtist: string,
      fileName: string | undefined,
      onResult: (data: {
        genre?: string | null;
        year?: number | null;
        coverUrl?: string | null;
        foundArtist?: string | null;
      }) => void,
      opts: {
        fillGenre: boolean;
        fillYear: boolean;
        fillCover: boolean;
        fillArtist: boolean;
        busy?: "upload" | "edit";
      }
    ) => {
      if (
        !lookupTitle.trim() ||
        (!opts.fillGenre && !opts.fillYear && !opts.fillCover && !opts.fillArtist)
      ) {
        return;
      }
      const seq = ++lookupSeqRef.current;
      const setBusy = opts.busy === "edit" ? setEditLookupBusy : setLookupBusy;
      setBusy(true);
      setErr(null);
      try {
        const qs = new URLSearchParams({ title: lookupTitle.trim() });
        if (lookupArtist.trim()) qs.set("artist", lookupArtist.trim());
        if (fileName) qs.set("fileName", fileName);
        const res = await fetch(`${base}/api/admin/songs-meta-lookup?${qs}`, { headers: { ...authHeader() } });
        const data = (await res.json().catch(() => ({}))) as {
          genre?: string | null;
          year?: number | null;
          coverUrl?: string | null;
          foundArtist?: string | null;
          error?: string;
        };
        if (seq !== lookupSeqRef.current) return;
        if (!res.ok) {
          setErr(data.error ?? t("admin.catalog.lookupFailed"));
          return;
        }
        onResult(data);
        if (data.genre || data.year || data.coverUrl || data.foundArtist) {
          setMsg(
            t("admin.catalog.foundOnline", {
              details: [
                data.foundArtist && opts.fillArtist ? data.foundArtist : null,
                data.genre,
                data.year,
                data.coverUrl ? t("admin.catalog.coverShort") : null,
              ]
                .filter(Boolean)
                .join(" · "),
            })
          );
        }
      } finally {
        if (seq === lookupSeqRef.current) setBusy(false);
      }
    },
    [authHeader, t]
  );

  async function retrieveEditMeta() {
    if (!edit.title.trim()) {
      setErr(t("admin.catalog.retrieveNeedTitle"));
      return;
    }
    const fillGenre = !edit.genre.trim();
    const fillYear = !edit.year.trim();
    const fillCover = !edit.coverUrl.trim();
    const fillArtist = !edit.artist.trim();
    if (!fillGenre && !fillYear && !fillCover && !fillArtist) {
      setMsg(t("admin.catalog.retrieveFull"));
      return;
    }
    setMsg(null);
    await fetchMetaLookup(
      edit.title,
      edit.artist,
      editing?.fileName ?? undefined,
      (data) => {
        setEdit((cur) => ({
          ...cur,
          artist: data.foundArtist && fillArtist ? data.foundArtist : cur.artist,
          genre: data.genre && fillGenre ? data.genre : cur.genre,
          year: data.year && fillYear ? String(data.year) : cur.year,
          coverUrl: data.coverUrl && fillCover ? data.coverUrl : cur.coverUrl,
        }));
      },
      { fillGenre, fillYear, fillCover, fillArtist, busy: "edit" }
    );
  }

  /** Lookup automatico nel form di caricamento. */
  useEffect(() => {
    const fillGenre = !genre.trim();
    const fillYear = !year.trim();
    const fillCover = !coverUrl.trim();
    const fillArtist = !artist.trim();
    if (!title.trim() || (!fillGenre && !fillYear && !fillCover && !fillArtist)) return;
    const timer = window.setTimeout(() => {
      void fetchMetaLookup(
        title,
        artist,
        midiFile?.name,
        (data) => {
          if (data.foundArtist && fillArtist) {
            autoFillRef.current.artist = data.foundArtist;
            setArtist(data.foundArtist);
          }
          if (data.genre && fillGenre) setGenre(data.genre);
          if (data.year && fillYear) setYear(String(data.year));
          if (data.coverUrl && fillCover) setCoverUrl(data.coverUrl);
        },
        { fillGenre, fillYear, fillCover, fillArtist }
      );
    }, 700);
    return () => window.clearTimeout(timer);
  }, [title, artist, genre, year, coverUrl, midiFile?.name, fetchMetaLookup]);

  function scrollToCatalogRow(songId: string) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const row = rowRefs.current.get(songId);
        if (row) {
          row.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        window.scrollTo({ top: scrollRestoreRef.current, behavior: "smooth" });
      });
    });
  }

  function startEdit(s2: SongDto) {
    scrollRestoreRef.current = window.scrollY;
    setEditing(s2);
    setEdit({
      title: s2.title,
      artist: s2.artist,
      year: s2.year != null ? String(s2.year) : "",
      genre: s2.genre ?? "",
      language: s2.language ?? "",
      coverUrl: s2.coverUrl ?? "",
    });
  }

  function cancelEdit() {
    const songId = editing?.id;
    setEditing(null);
    if (songId) scrollToCatalogRow(songId);
  }

  useEffect(() => {
    if (!editing) return;
    window.requestAnimationFrame(() => {
      editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      editPanelRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    });
  }, [editing?.id]);

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditBusy(true);
    setErr(null);
    try {
      const y = edit.year.trim() ? Number.parseInt(edit.year.trim(), 10) : null;
      const res = await fetch(`${base}/api/admin/songs/${encodeURIComponent(editing.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          title: edit.title.trim(),
          artist: edit.artist.trim(),
          year: Number.isInteger(y) ? y : null,
          genre: edit.genre.trim() || null,
          language: edit.language.trim() || null,
          coverUrl: edit.coverUrl.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error ?? t("admin.catalog.saveFailed"));
        return;
      }
      setMsg(t("admin.catalog.updated", { title: edit.title.trim() }));
      const songId = editing.id;
      setEditing(null);
      await loadSongs();
      scrollToCatalogRow(songId);
    } finally {
      setEditBusy(false);
    }
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !artist.trim() || !midiFile) {
      setErr(t("admin.catalog.requiredFields"));
      return;
    }
    setErr(null);
    setMsg(null);
    setLoading(true);
    const body = new FormData();
    body.append("title", title.trim());
    body.append("artist", artist.trim());
    if (language.trim()) body.append("language", language.trim());
    if (year.trim()) body.append("year", year.trim());
    if (genre.trim()) body.append("genre", genre.trim());
    if (coverUrl.trim()) body.append("coverUrl", coverUrl.trim());
    body.append("midi", midiFile);
    if (lrcFile) body.append("lrc", lrcFile);
    const res = await fetch(`${base}/api/admin/songs/upload`, {
      method: "POST",
      headers: authHeader(),
      body,
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setErr((data as { error?: string }).error ?? t("admin.catalog.uploadFailed"));
      return;
    }
    setMsg(t("admin.catalog.uploaded", { title: (data as SongDto).title }));
    setTitle("");
    setArtist("");
    setLanguage("");
    setYear("");
    setGenre("");
    setCoverUrl("");
    autoFillRef.current = { title: "", artist: "", year: "" };
    setMidiFile(null);
    setLrcFile(null);
    await loadSongs();
  }

  function renderSongRow(s: SongDto, opts?: { nested?: boolean }) {
    return (
      <tr
        key={s.id}
        ref={(el) => {
          if (el) rowRefs.current.set(s.id, el);
          else rowRefs.current.delete(s.id);
        }}
        className={`border-b border-zinc-800/80 ${editing?.id === s.id ? "bg-fuchsia-500/10" : ""} ${opts?.nested ? "bg-zinc-950/40" : ""}`}
      >
        <td className={`py-2 pr-2 ${opts?.nested ? "pl-8" : ""}`}>
          <input
            type="checkbox"
            checked={selectedIds.has(s.id)}
            onChange={() => toggleSelect(s.id)}
            aria-label={s.title}
            className="accent-fuchsia-500"
          />
        </td>
        <td className="py-2 pr-3">
          <SongCoverThumb url={s.coverUrl} size="xs" />
        </td>
        <td className={`py-2 pr-4 font-medium text-white ${opts?.nested ? "pl-2" : ""}`}>{s.title}</td>
        <td className="py-2 pr-4">{catalogView === "artist" && opts?.nested ? "—" : s.artist}</td>
        <td className="py-2 pr-4">{s.year ?? "—"}</td>
        <td className="py-2 pr-4">{s.genre ?? "—"}</td>
        <td
          className="max-w-[14rem] truncate py-2 pr-4 font-mono text-xs text-zinc-500"
          title={s.fileName ?? undefined}
        >
          {s.fileName ?? "—"}
        </td>
        <td className="py-2 pr-4">{s.lrcPath ? t("admin.catalog.lrcYes") : "—"}</td>
        <td className="py-2">
          <div className="flex gap-1">
            <button
              type="button"
              title={t("admin.catalog.editTitle")}
              onClick={() => startEdit(s)}
              className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              ✏️
            </button>
            <button
              type="button"
              title={t("admin.catalog.deleteOne")}
              disabled={deleteBusy}
              onClick={() => confirmDeleteOne(s)}
              className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-200 hover:bg-red-950/40 disabled:opacity-40"
            >
              🗑
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <section className="kg-card mt-8 p-6 md:p-8">
      <h2 className="font-display text-lg font-semibold text-white">{t("admin.catalog.title")}</h2>
      <p className="mt-2 text-sm text-zinc-400">{t("admin.catalog.intro")}</p>

      {msg && <p className="mt-4 text-sm text-emerald-400">{msg}</p>}
      {err && <p className="mt-4 text-sm text-red-400">{err}</p>}

      <div className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold text-white">{t("admin.catalog.searchTitle")}</h3>
            <p className="mt-1 text-xs text-zinc-500">
              {songs.length === 1
                ? t("admin.catalog.songCountOne")
                : t("admin.catalog.songCount", { n: songs.length })}
              {catalogQuery.trim()
                ? ` · ${t("admin.catalog.results", { n: filteredSongs.length })}`
                : ""}
              {selectedIds.size > 0 ? ` · ${t("admin.catalog.selected", { n: selectedIds.size })}` : ""}
            </p>
          </div>
          <label className="flex min-w-[min(100%,20rem)] flex-1 flex-col gap-1 text-sm sm:max-w-md">
            <span className="sr-only">{t("admin.catalog.searchTitle")}</span>
            <input
              className="kg-input"
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder={t("admin.catalog.searchPlaceholder")}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-zinc-700 p-0.5">
            <button
              type="button"
              onClick={() => setCatalogView("list")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                catalogView === "list" ? "bg-fuchsia-600 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              {t("admin.catalog.viewList")}
            </button>
            <button
              type="button"
              onClick={() => setCatalogView("artist")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                catalogView === "artist" ? "bg-fuchsia-600 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              {t("admin.catalog.viewArtist")}
            </button>
          </div>
        </div>

        {songs.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={deleteBusy || !someFilteredSelected}
              onClick={() => confirmDeleteSelected()}
              className="rounded-lg border border-red-500/50 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-950/40 disabled:opacity-40"
            >
              {deleteBusy ? t("admin.catalog.deleting") : t("admin.catalog.deleteSelected")}
            </button>
            {catalogQuery.trim() && (
              <button
                type="button"
                disabled={deleteBusy || filteredIds.length === 0}
                onClick={() => confirmDeleteFiltered()}
                className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300/90 hover:bg-red-950/30 disabled:opacity-40"
              >
                {t("admin.catalog.deleteFiltered")}
              </button>
            )}
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="w-10 py-2 pr-2">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageSelected && !allPageSelected;
                    }}
                    onChange={toggleSelectAllPage}
                    disabled={pageSongIds.length === 0}
                    aria-label={t("admin.catalog.selectAllPage")}
                    className="accent-fuchsia-500"
                  />
                </th>
                <th className="w-14 py-2 pr-3">{t("admin.catalog.colCover")}</th>
                <th className="py-2 pr-4">{t("admin.catalog.colTitle")}</th>
                <th className="py-2 pr-4">{t("admin.catalog.colArtist")}</th>
                <th className="py-2 pr-4">{t("admin.catalog.colYear")}</th>
                <th className="py-2 pr-4">{t("admin.catalog.colGenre")}</th>
                <th className="py-2 pr-4">{t("admin.catalog.colFile")}</th>
                <th className="py-2 pr-4">{t("admin.catalog.colLrc")}</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {catalogView === "list" &&
                paginatedSongs.map((s) => renderSongRow(s))}
              {catalogView === "artist" &&
                paginatedGroups.map((group) => {
                  const expanded = expandedArtists.has(group.artist);
                  const groupAllSelected =
                    group.songs.length > 0 && group.songs.every((s) => selectedIds.has(s.id));
                  const groupSomeSelected = group.songs.some((s) => selectedIds.has(s.id));
                  return (
                    <Fragment key={`artist-${group.artist}`}>
                      <tr key={`artist-${group.artist}`} className="border-b border-zinc-800 bg-zinc-900/60">
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={groupAllSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = groupSomeSelected && !groupAllSelected;
                            }}
                            onChange={() => toggleSelectArtistGroup(group.songs)}
                            aria-label={group.artist}
                            className="accent-fuchsia-500"
                          />
                        </td>
                        <td colSpan={8} className="py-2 pr-4">
                          <button
                            type="button"
                            onClick={() => toggleArtistExpand(group.artist)}
                            className="flex w-full items-center gap-2 text-left font-medium text-white hover:text-fuchsia-200"
                            aria-expanded={expanded}
                          >
                            <span className="text-zinc-500">{expanded ? "▼" : "▶"}</span>
                            <span>{group.artist}</span>
                            <span className="text-xs font-normal text-zinc-500">
                              {t("admin.catalog.songsInGroup", { n: group.songs.length })}
                            </span>
                          </button>
                        </td>
                      </tr>
                      {expanded && group.songs.map((s) => renderSongRow(s, { nested: true }))}
                    </Fragment>
                  );
                })}
              {songs.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-zinc-500">
                    {t("admin.catalog.empty")}
                  </td>
                </tr>
              )}
              {songs.length > 0 && filteredSongs.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-zinc-500">
                    {t("admin.catalog.noResults", { q: catalogQuery.trim() })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {songs.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4">
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <span>{t("admin.catalog.pageSizeLabel")}</span>
              <select
                className="kg-input w-auto min-w-[5rem] py-1.5 text-sm"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-zinc-500">
                {t(songs.length === 1 ? "admin.catalog.totalSongsOne" : "admin.catalog.totalSongs", {
                  n: songs.length,
                })}
              </span>
            </label>
            {filteredSongs.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                >
                  {t("admin.catalog.prevPage")}
                </button>
                <span className="px-1 text-xs text-zinc-400">
                  {t("admin.catalog.pageOf", { page, total: totalPages })}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                >
                  {t("admin.catalog.nextPage")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <form
          ref={editPanelRef}
          onSubmit={(e) => void saveEdit(e)}
          className="mt-6 scroll-mt-6 rounded-xl border border-fuchsia-500/30 bg-zinc-950/60 p-4"
        >
          <p className="text-sm font-medium text-fuchsia-200">{t("admin.catalog.editPanel", { title: editing.title })}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-400">{t("admin.catalog.titleLabel")}</span>
              <input className="kg-input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-400">{t("admin.catalog.artistLabel")}</span>
              <input className="kg-input" value={edit.artist} onChange={(e) => setEdit({ ...edit, artist: e.target.value })} required />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-400">{t("admin.catalog.colYear")}</span>
              <input className="kg-input" value={edit.year} onChange={(e) => setEdit({ ...edit, year: e.target.value })} inputMode="numeric" maxLength={4} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-400">{t("admin.catalog.colGenre")}</span>
              <input className="kg-input" value={edit.genre} onChange={(e) => setEdit({ ...edit, genre: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-400">{t("admin.catalog.editLanguageLabel")}</span>
              <input className="kg-input" value={edit.language} onChange={(e) => setEdit({ ...edit, language: e.target.value })} placeholder={t("admin.catalog.languagePlaceholder")} />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-zinc-400">{t("admin.catalog.editCoverLabel")}</span>
              <div className="flex flex-wrap items-start gap-3">
                <input
                  className="kg-input min-w-0 flex-1 font-mono text-xs"
                  value={edit.coverUrl}
                  onChange={(e) => setEdit({ ...edit, coverUrl: e.target.value })}
                  placeholder={t("admin.catalog.editCoverPlaceholder")}
                />
                <CoverPreview url={edit.coverUrl} />
              </div>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={editLookupBusy || !edit.title.trim()}
              onClick={() => void retrieveEditMeta()}
              className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-40"
            >
              {editLookupBusy ? t("admin.catalog.retrieving") : t("admin.catalog.retrieveMeta")}
            </button>
            <p className="text-xs text-zinc-500">{t("admin.catalog.retrieveHint")}</p>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={editBusy || !edit.title.trim() || !edit.artist.trim()} className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-500 disabled:opacity-40">
              {editBusy ? t("admin.catalog.saving") : t("admin.catalog.saveEdit")}
            </button>
            <button type="button" onClick={cancelEdit} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
              {t("admin.catalog.cancel")}
            </button>
          </div>
        </form>
      )}

      <form
        onSubmit={(e) => void upload(e)}
        className="mt-8 flex flex-col gap-4 border-t border-zinc-800 pt-8"
      >
        <h3 className="font-display text-base font-semibold text-white">{t("admin.catalog.uploadTitle")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">{t("admin.catalog.titleLabel")}</span>
            <input
              className="kg-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">{t("admin.catalog.artistLabel")}</span>
            <input
              className="kg-input"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              required
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">{t("admin.catalog.languageLabel")}</span>
            <input
              className="kg-input"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder={t("admin.catalog.languagePlaceholder")}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">{t("admin.catalog.yearLabel")}</span>
            <input
              className="kg-input"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder={t("admin.catalog.yearPlaceholder")}
              inputMode="numeric"
              maxLength={4}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
            <span className="text-zinc-400">{t("admin.catalog.genreLabel")}</span>
            <input
              className="kg-input"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder={t("admin.catalog.genrePlaceholder")}
            />
          </label>
          {lookupBusy && (
            <p className="pb-2.5 text-xs text-cyan-300/80">{t("admin.catalog.lookupBusy")}</p>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <span className="text-zinc-400">{t("admin.catalog.coverLabel")}</span>
            <input
              className="kg-input font-mono text-xs"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder={t("admin.catalog.coverPlaceholder")}
            />
          </label>
          <CoverPreview url={coverUrl} />
        </div>
        <p className="text-xs text-zinc-500">{t("admin.catalog.metaHint")}</p>
        <div className="flex flex-wrap gap-4">
          <label className="cursor-pointer rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20">
            {t("admin.catalog.midiFile")}
            <input
              type="file"
              accept=".mid,audio/midi"
              className="hidden"
              onChange={(e) => void onMidiPicked(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="cursor-pointer rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
            {t("admin.catalog.lrcFile")}
            <input
              type="file"
              accept=".lrc,text/plain"
              className="hidden"
              onChange={(e) => setLrcFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {midiFile && <p className="text-xs text-zinc-500">{t("admin.catalog.midiSelected", { name: midiFile.name })}</p>}
        {lrcFile && <p className="text-xs text-zinc-500">{t("admin.catalog.lrcSelected", { name: lrcFile.name })}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-fit rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-40"
        >
          {loading ? t("admin.catalog.uploading") : t("admin.catalog.uploadBtn")}
        </button>
      </form>

      <MidiBulkImport
        authHeader={authHeader}
        existingFileNames={songs.map((s2) => (s2.fileName ?? "").toLowerCase()).filter(Boolean)}
        onDone={() => {
          void loadSongs();
          notifyCatalogChanged();
        }}
      />
    </section>
  );
}
