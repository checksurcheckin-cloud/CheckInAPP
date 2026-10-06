-- CreateTable
CREATE TABLE "shift_offer_candidates" (
    "id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_offer_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shift_offer_candidates_offer_id_user_id_key" ON "shift_offer_candidates"("offer_id", "user_id");

-- AddForeignKey
ALTER TABLE "shift_offer_candidates" ADD CONSTRAINT "shift_offer_candidates_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "shift_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_offer_candidates" ADD CONSTRAINT "shift_offer_candidates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
