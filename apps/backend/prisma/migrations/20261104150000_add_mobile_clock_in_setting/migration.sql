-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "mobile_clock_in_enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mobile_clock_in_enabled" BOOLEAN;
