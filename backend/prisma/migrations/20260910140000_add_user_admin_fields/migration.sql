-- SCRUM-34: admin user management.
--
-- Additive only: every column is nullable or carries a default, so the migration
-- is safe on a populated table and needs no backfill. `isActive` already exists
-- from 20260910120000_add_customer_and_password_reset and is NOT re-added here.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "name" TEXT;
ALTER TABLE "User" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deactivatedById" TEXT;

-- AddForeignKey
-- ON DELETE SET NULL, not CASCADE: removing the admin who disabled an account
-- must never remove the account they disabled.
ALTER TABLE "User" ADD CONSTRAINT "User_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "User_isActive_branchId_departmentId_idx" ON "User"("isActive", "branchId", "departmentId");
