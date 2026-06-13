-- LIVE era ridondante rispetto a OPEN: riallinea i dati e semplifica l'enum.
UPDATE "Event" SET "status" = 'OPEN' WHERE "status" = 'LIVE';

CREATE TYPE "EventStatus_new" AS ENUM ('DRAFT', 'OPEN', 'ENDED');

ALTER TABLE "Event" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Event" ALTER COLUMN "status" TYPE "EventStatus_new" USING ("status"::text::"EventStatus_new");
ALTER TABLE "Event" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "EventStatus";
ALTER TYPE "EventStatus_new" RENAME TO "EventStatus";
