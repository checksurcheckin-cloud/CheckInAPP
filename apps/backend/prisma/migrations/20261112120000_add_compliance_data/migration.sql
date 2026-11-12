-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('full_time', 'part_time', 'student', 'flexi_job');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "joint_committee" TEXT;

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "joint_committee" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "contract_type" "ContractType",
ADD COLUMN     "weekly_contract_hours" DOUBLE PRECISION;
