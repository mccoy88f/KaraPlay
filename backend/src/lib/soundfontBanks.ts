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
