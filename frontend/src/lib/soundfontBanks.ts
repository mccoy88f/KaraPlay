export type SoundfontBankId = "fluid_r3" | "musyng_kite" | "fatboy";

export type SoundfontBankMeta = {
  id: SoundfontBankId;
  /** Cartella su gleitz.github.io/midi-js-soundfonts/ */
  gleitzFolder: string;
  label: string;
  shortLabel: string;
  description: string;
};

export const SOUNDFONT_BANKS: SoundfontBankMeta[] = [
  {
    id: "fluid_r3",
    gleitzFolder: "FluidR3_GM",
    label: "Fluid R3 GM",
    shortLabel: "Fluid R3",
    description: "Suono GM classico, leggero e veloce da caricare.",
  },
  {
    id: "musyng_kite",
    gleitzFolder: "MusyngKite",
    label: "Musyng Kite",
    shortLabel: "Musyng",
    description: "Qualità superiore (file più grandi). Buon default per serate.",
  },
  {
    id: "fatboy",
    gleitzFolder: "FatBoy",
    label: "FatBoy",
    shortLabel: "FatBoy",
    description: "Variazione timbrica alternativa (stesso schema GM).",
  },
];

export function getSoundfontBank(id: SoundfontBankId | string | null | undefined): SoundfontBankMeta {
  const found = SOUNDFONT_BANKS.find((b) => b.id === id);
  return found ?? SOUNDFONT_BANKS[0];
}

/** URL sample gleitz (mp3/ogg). */
export function gleitzInstrumentUrl(
  gleitzFolder: string,
  instrumentName: string,
  format: "mp3" | "ogg" = "mp3"
): string {
  return `https://gleitz.github.io/midi-js-soundfonts/${gleitzFolder}/${instrumentName}-${format}.js`;
}
