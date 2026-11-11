-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "group_count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "group_key" TEXT;
