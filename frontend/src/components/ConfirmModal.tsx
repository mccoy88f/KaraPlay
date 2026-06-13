import { useEffect, useId, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "danger" | "default";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const confirmClass =
    tone === "danger"
      ? "rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-40"
      : "rounded-xl bg-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-fuchsia-500 disabled:opacity-40";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="kg-card relative z-10 w-full max-w-md border border-zinc-700/80 p-6 shadow-2xl shadow-black/60"
      >
        <h2 id={titleId} className="font-display text-lg font-semibold text-white">
          {title}
        </h2>
        <p id={descId} className="mt-3 text-sm leading-relaxed text-zinc-400">
          {description}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className={confirmClass}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
