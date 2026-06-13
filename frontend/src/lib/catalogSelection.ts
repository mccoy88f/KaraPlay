const SELECTED_KEY = "karaplay_catalog_selected";

export function syncCatalogSelection(ids: string[]): void {
  sessionStorage.setItem(SELECTED_KEY, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent("karaplay:catalog-selection"));
}

export function readCatalogSelection(): string[] {
  try {
    const raw = sessionStorage.getItem(SELECTED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function notifyCatalogChanged(): void {
  window.dispatchEvent(new CustomEvent("karaplay:catalog-changed"));
}
