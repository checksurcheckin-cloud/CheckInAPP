-- CreateTable
CREATE TABLE "managed_sites" (
    "user_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,

    CONSTRAINT "managed_sites_pkey" PRIMARY KEY ("user_id","site_id")
);

-- AddForeignKey
ALTER TABLE "managed_sites" ADD CONSTRAINT "managed_sites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_sites" ADD CONSTRAINT "managed_sites_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
