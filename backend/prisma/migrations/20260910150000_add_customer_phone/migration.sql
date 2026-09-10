-- SCRUM-5: the agent-facing customer profile shows contact details, and the
-- story names email AND phone. Only email existed on `customers`.
--
-- Additive and nullable, so the migration is safe on a populated table and
-- needs no backfill: every existing customer simply has no phone on record and
-- the profile renders a dash for them.

-- AlterTable
ALTER TABLE "customers" ADD COLUMN "phone" TEXT;
