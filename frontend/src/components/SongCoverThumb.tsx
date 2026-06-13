type Props = {
  url?: string | null;
  size?: "xs" | "sm" | "lg";
  className?: string;
};

/** Miniatura copertina brano (fallback 🎵). */
export function SongCoverThumb({ url, size = "sm", className = "" }: Props) {
  const dim =
    size === "lg" ? "h-28 w-28 rounded-lg text-4xl" : size === "xs" ? "h-10 w-10 text-base" : "h-12 w-12 text-lg";
  if (url?.trim()) {
    return (
      <img
        src={url.trim()}
        alt=""
        className={`shrink-0 rounded object-cover ${dim} ${className}`}
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.visibility = "hidden";
        }}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded bg-amber-500/15 text-amber-200/80 ${dim} ${className}`}
      aria-hidden
    >
      🎵
    </div>
  );
}
