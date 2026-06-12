-- Trasposizione globale del brano MIDI in semitoni (-12…+12).
ALTER TABLE "Song" ADD COLUMN "transposeSemitones" INTEGER NOT NULL DEFAULT 0;
