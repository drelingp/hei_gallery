-- AlterTable
ALTER TABLE "GalleryRoom" ADD COLUMN     "signSubtitle" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "signTitle" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "zoneKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GalleryRoom_zoneKey_key" ON "GalleryRoom"("zoneKey");
