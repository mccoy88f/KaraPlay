import { useCallback, useEffect, useState } from "react";
import {
  apiAdminBookMidi,
  apiAdminBookYoutube,
  apiAdminGetParticipants,
  type EventParticipant,
} from "../../api/client";
import { useI18n } from "../../i18n/context";
import { ADMIN_EVENT_KEY } from "../../lib/adminEvent";
import {
  getAdminSingerNickname,
  GROUP_SINGER_NICKNAME,
  setAdminSingerNickname,
} from "../../lib/adminBooking";
import { BookCatalogCore } from "../BookCatalog";

const base = import.meta.env.VITE_API_URL ?? "";

type AdminEvent = {
  id: string;
  name: string;
  location: string;
  date: string;
  status: string;
  joinCode: string;
};

type AssignMode = "group" | "participant" | "custom" | "self";

type Props = {
  authHeader: () => Record<string, string>;
  adminUsername?: string;
};

export function AdminBookSection({ authHeader, adminUsername }: Props) {
  const { t } = useI18n();
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventId, setEventId] = useState<string | null>(() => localStorage.getItem(ADMIN_EVENT_KEY));
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [assignMode, setAssignMode] = useState<AssignMode>("group");
  const [assignUserId, setAssignUserId] = useState("");
  const [customNickname, setCustomNickname] = useState("");
  const [selfNickname, setSelfNickname] = useState(() => getAdminSingerNickname(adminUsername));
  const [selfNicknameDraft, setSelfNicknameDraft] = useState(() => getAdminSingerNickname(adminUsername));
  const [err, setErr] = useState<string | null>(null);

  const event = events.find((e) => e.id === eventId) ?? null;
  const groupLabel = t("admin.book.groupNickname");

  useEffect(() => {
    const saved = getAdminSingerNickname(adminUsername);
    setSelfNickname(saved);
    setSelfNicknameDraft(saved);
  }, [adminUsername]);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/admin/events`, { headers: { ...authHeader() } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setEvents(((data as { events: AdminEvent[] }).events ?? []));
    } catch {
      setErr(t("admin.book.eventsUnavailable"));
    }
  }, [authHeader, t]);

  const loadParticipants = useCallback(async () => {
    if (!eventId) {
      setParticipants([]);
      return;
    }
    try {
      const list = await apiAdminGetParticipants(eventId, authHeader);
      setParticipants(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("admin.book.participantsUnavailable"));
    }
  }, [eventId, authHeader, t]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (!eventId) return;
    localStorage.setItem(ADMIN_EVENT_KEY, eventId);
    setAssignMode("group");
    setAssignUserId("");
    setCustomNickname("");
    void loadParticipants();
  }, [eventId, loadParticipants]);

  function saveSelfNickname() {
    if (!adminUsername) return;
    const trimmed = selfNicknameDraft.trim();
    setAdminSingerNickname(adminUsername, trimmed);
    setSelfNickname(trimmed);
    if (trimmed) setAssignMode("self");
  }

  function resolveAssignee(): { userId?: string; nickname?: string } {
    if (assignMode === "custom") {
      const nick = customNickname.trim();
      if (!nick) throw new Error(t("admin.book.customNicknameRequired"));
      return { nickname: nick };
    }
    if (assignMode === "self") {
      const nick = selfNickname.trim();
      if (!nick) throw new Error(t("admin.book.selfNicknameRequired"));
      return { nickname: nick };
    }
    if (assignMode === "participant") {
      if (!assignUserId) throw new Error(t("admin.book.participantRequired"));
      return { userId: assignUserId };
    }
    return { nickname: GROUP_SINGER_NICKNAME };
  }

  function assigneeLabel(): string {
    if (assignMode === "custom") return customNickname.trim() || "…";
    if (assignMode === "self") return selfNickname.trim() || "…";
    if (assignMode === "participant") {
      return participants.find((p) => p.id === assignUserId)?.nickname ?? "…";
    }
    return groupLabel;
  }

  if (events.length === 0 && !eventId) {
    return (
      <div className="kg-card p-6 text-sm text-zinc-400">
        {t("admin.book.noEventHintPrefix")}{" "}
        <strong className="text-zinc-200">{t("admin.book.consoleTab")}</strong>,{" "}
        {t("admin.book.noEventHintSuffix")}{" "}
        <strong className="text-zinc-200">{groupLabel}</strong>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="kg-card flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-[min(100%,16rem)] flex-1 flex-col gap-1 text-sm">
          <span className="text-zinc-400">{t("admin.book.event")}</span>
          <select
            className="kg-input"
            value={eventId ?? ""}
            onChange={(e) => setEventId(e.target.value || null)}
          >
            <option value="">{t("admin.book.chooseOption")}</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} ({ev.status})
              </option>
            ))}
          </select>
        </label>
      </div>

      {event && eventId && (
        <div className="kg-card overflow-hidden p-0">
          <BookCatalogCore
            eventId={eventId}
            eventName={event.name}
            onBooked={() => void loadParticipants()}
            assignBar={
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                <p className="text-sm font-medium text-cyan-100">{t("admin.book.assignTitle")}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {t("admin.book.activeBooking")}{" "}
                  <span className="text-zinc-300">{assigneeLabel()}</span>
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setAssignMode("group")}
                    className={
                      assignMode === "group"
                        ? "rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white"
                        : "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-cyan-500/40"
                    }
                  >
                    {groupLabel}
                  </button>
                  {selfNickname && (
                    <button
                      type="button"
                      onClick={() => setAssignMode("self")}
                      className={
                        assignMode === "self"
                          ? "rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white"
                          : "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-cyan-500/40"
                      }
                    >
                      {selfNickname}
                    </button>
                  )}
                </div>

                {adminUsername && (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm">
                      <span className="text-zinc-400">{t("admin.book.selfNicknameLabel")}</span>
                      <input
                        className="kg-input"
                        value={selfNicknameDraft}
                        onChange={(e) => setSelfNicknameDraft(e.target.value)}
                        placeholder={t("admin.book.selfNicknamePlaceholder")}
                        maxLength={40}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={saveSelfNickname}
                      disabled={!selfNicknameDraft.trim()}
                      className="rounded-lg border border-zinc-600 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                    >
                      {t("admin.book.saveAndUse")}
                    </button>
                  </div>
                )}

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-zinc-400">{t("admin.book.participantLabel")}</span>
                    <select
                      className="kg-input"
                      value={assignMode === "participant" ? assignUserId : ""}
                      onChange={(e) => {
                        const id = e.target.value;
                        if (!id) return;
                        setAssignUserId(id);
                        setAssignMode("participant");
                        setCustomNickname("");
                      }}
                    >
                      <option value="">{t("admin.book.chooseOption")}</option>
                      {participants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nickname}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-zinc-400">{t("admin.book.customNicknameLabel")}</span>
                    <input
                      className="kg-input"
                      value={customNickname}
                      onChange={(e) => {
                        setCustomNickname(e.target.value);
                        if (e.target.value.trim()) setAssignMode("custom");
                      }}
                      placeholder={t("admin.book.customNicknamePlaceholder")}
                      maxLength={40}
                    />
                  </label>
                </div>

                <p className="mt-2 text-xs text-zinc-500">
                  {t("admin.book.groupHint", { group: groupLabel })}
                </p>
              </div>
            }
            bookMidi={async (songId) => {
              await apiAdminBookMidi(eventId, songId, resolveAssignee(), authHeader);
            }}
            bookYoutube={async (url, title) => {
              await apiAdminBookYoutube(eventId, url, { ...resolveAssignee(), ytTitle: title }, authHeader);
            }}
            midiBookedMessage={(title) => t("admin.book.addedToQueue", { title, assignee: assigneeLabel() })}
            ytBookedMessage={(title) => t("admin.book.addedToQueue", { title, assignee: assigneeLabel() })}
          />
        </div>
      )}
    </div>
  );
}
