export type SoundfontBankId = "fluid_r3" | "musyng_kite" | "fatboy";

export type SoundfontBankMeta = {
  id: SoundfontBankId;
  gleitzFolder: string;
  label: string;
};

export const SOUNDFONT_BANKS: SoundfontBankMeta[] = [
  { id: "fluid_r3", gleitzFolder: "FluidR3_GM", label: "Fluid R3 GM" },
  { id: "musyng_kite", gleitzFolder: "MusyngKite", label: "Musyng Kite" },
  { id: "fatboy", gleitzFolder: "FatBoy", label: "FatBoy" },
];

const ALLOWED_FOLDERS = new Set(SOUNDFONT_BANKS.map((b) => b.gleitzFolder));

export function isAllowedGleitzFolder(folder: string): boolean {
  return ALLOWED_FOLDERS.has(folder);
}

export function getSoundfontBankById(id: string | null | undefined): SoundfontBankMeta {
  const found = SOUNDFONT_BANKS.find((b) => b.id === id);
  return found ?? SOUNDFONT_BANKS[0];
}

/** Banchi SF2 caricati dall'admin: id = "sf2:<nomefile>". */
export const SF2_BANK_PREFIX = "sf2:";

/** Nome file consentito per i banchi caricati (niente path, estensione .sf2/.sf3). */
export const SF2_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,150}\.(sf2|sf3)$/i;

export function isSf2BankId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(SF2_BANK_PREFIX) && isValidSf2FileName(id.slice(SF2_BANK_PREFIX.length));
}

export function sf2FileFromBankId(id: string): string {
  return id.slice(SF2_BANK_PREFIX.length);
}

export function isValidSf2FileName(file: string): boolean {
  return SF2_FILE_RE.test(file) && !file.includes("/") && !file.includes("\\") && !file.includes("..");
}

export function isValidSoundfontBankId(id: string): boolean {
  return SOUNDFONT_BANKS.some((b) => b.id === id) || isSf2BankId(id);
}
