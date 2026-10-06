-- AlterTable
ALTER TABLE "companies" ADD COLUMN "gps_clock_in_enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "gps_clock_in_enabled" BOOLEAN;
