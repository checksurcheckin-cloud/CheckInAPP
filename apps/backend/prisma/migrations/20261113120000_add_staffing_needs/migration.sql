-- CreateEnum
CREATE TYPE "PlanningMode" AS ENUM ('free', 'needs');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "planning_mode" "PlanningMode" NOT NULL DEFAULT 'free';

-- CreateTable
CREATE TABLE "staffing_needs" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "day_of_week" INTEGER,
    "specific_date" DATE,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "role_needed" TEXT,
    "count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staffing_needs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staffing_need_dates" (
    "site_id" TEXT NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "staffing_need_dates_pkey" PRIMARY KEY ("site_id","date")
);

-- CreateIndex
CREATE INDEX "staffing_needs_site_id_day_of_week_idx" ON "staffing_needs"("site_id", "day_of_week");

-- CreateIndex
CREATE INDEX "staffing_needs_site_id_specific_date_idx" ON "staffing_needs"("site_id", "specific_date");

-- AddForeignKey
ALTER TABLE "staffing_needs" ADD CONSTRAINT "staffing_needs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_need_dates" ADD CONSTRAINT "staffing_need_dates_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
