-- Catalogo MIDI per-admin: ogni canzone appartiene a chi la carica
ALTER TABLE "Song" ADD COLUMN "adminId" TEXT;

ALTER TABLE "Song" ADD CONSTRAINT "Song_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Traccia MIDI da silenziare (voce guida / ghost track, di solito la 4)
ALTER TABLE "Song" ADD COLUMN "mutedTrack" INTEGER;
