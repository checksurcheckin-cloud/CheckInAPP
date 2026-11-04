-- CreateEnum
CREATE TYPE "MarketScope" AS ENUM ('site', 'all_sites', 'sites', 'employees');

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "market_scope" "MarketScope" NOT NULL DEFAULT 'site',
ADD COLUMN     "market_site_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "market_user_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
