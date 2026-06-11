import type { SoundfontBankId } from "../lib/soundfontBanks";
import { SOUNDFONT_BANKS, isSf2BankId, sf2BankId, sf2BankMeta } from "../lib/soundfontBanks";

type Props = {
  value: SoundfontBankId;
  onChange: (id: SoundfontBankId) => void;
  /** File .sf2/.sf3 caricati sul server (mostrati come banchi aggiuntivi). */
  sf2Files?: string[];
  id?: string;
  className?: string;
  /** Etichetta sopra il select */
  label?: string;
  variant?: "default" | "compact";
};

export function SoundfontSelect({
  value,
  onChange,
  sf2Files = [],
  id = "karaoke-soundfont",
  className = "",
  label = "Banco sonoro (SF2 / GM)",
  variant = "default",
}: Props) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </label>
      )}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as SoundfontBankId)}
        className={
          variant === "compact"
            ? "w-full max-w-xs rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-fuchsia-500/30 focus:ring-2"
            : "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 shadow-inner outline-none ring-fuchsia-500/30 focus:ring-2"
        }
      >
        <optgroup label="Banchi GM pre-renderizzati (mp3)">
          {SOUNDFONT_BANKS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label} — {b.description}
            </option>
          ))}
        </optgroup>
        {(sf2Files.length > 0 || isSf2BankId(value)) && (
          <optgroup label="SoundFont caricati (.sf2)">
            {sf2Files.map((f) => (
              <option key={f} value={sf2BankId(f)}>
                {sf2BankMeta(sf2BankId(f)).label}
              </option>
            ))}
            {isSf2BankId(value) && !sf2Files.includes(sf2BankMeta(value).sf2File ?? "") && (
              <option value={value}>{sf2BankMeta(value).label} — file mancante sul server</option>
            )}
          </optgroup>
        )}
      </select>
    </div>
  );
}
