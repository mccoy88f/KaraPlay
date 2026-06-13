/**
 * Id banco sonoro: uno dei banchi Gleitz pre-renderizzati ("fluid_r3" | "musyng_kite" | "fatboy")
 * oppure un file SoundFont caricato dall'admin nella forma "sf2:<nomefile>.sf2".
 */
export type SoundfontBankId = string;

export type SoundfontBankMeta = {
  id: SoundfontBankId;
  kind: "gleitz" | "sf2";
  /** Cartella su gleitz.github.io/midi-js-soundfonts/ (solo kind "gleitz"). */
  gleitzFolder: string;
  /** Nome file .sf2/.sf3 sul server (solo kind "sf2"). */
  sf2File: string | null;
  label: string;
  shortLabel: string;
  description: string;
};

export const SOUNDFONT_BANKS: SoundfontBankMeta[] = [
  {
    id: "fluid_r3",
    kind: "gleitz",
    gleitzFolder: "FluidR3_GM",
    sf2File: null,
    label: "Fluid R3 GM",
    shortLabel: "Fluid R3",
    description: "Suono GM classico, leggero e veloce da caricare.",
  },
  {
    id: "musyng_kite",
    kind: "gleitz",
    gleitzFolder: "MusyngKite",
    sf2File: null,
    label: "Musyng Kite",
    shortLabel: "Musyng",
    description: "Qualità superiore (file più grandi). Buon default per serate.",
  },
  {
    id: "fatboy",
    kind: "gleitz",
    gleitzFolder: "FatBoy",
    sf2File: null,
    label: "FatBoy",
    shortLabel: "FatBoy",
    description: "Variazione timbrica alternativa (stesso schema GM).",
  },
];

export const SF2_BANK_PREFIX = "sf2:";

/** Limite upload .sf2/.sf3 (allineato al backend). */
export const SF2_MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const SF2_MAX_UPLOAD_LABEL = "500 MB";

export function isSf2BankId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(SF2_BANK_PREFIX) && id.length > SF2_BANK_PREFIX.length;
}

export function sf2BankId(file: string): SoundfontBankId {
  return `${SF2_BANK_PREFIX}${file}`;
}

export function sf2BankMeta(id: string): SoundfontBankMeta {
  const file = id.slice(SF2_BANK_PREFIX.length);
  const short = file.replace(/\.(sf2|sf3)$/i, "");
  return {
    id,
    kind: "sf2",
    gleitzFolder: "",
    sf2File: file,
    label: `${short} (SF2)`,
    shortLabel: short,
    description: "SoundFont caricato dall'host: sintesi completa (batteria GM inclusa).",
  };
}

export function getSoundfontBank(id: SoundfontBankId | string | null | undefined): SoundfontBankMeta {
  if (isSf2BankId(id)) return sf2BankMeta(id as string);
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
