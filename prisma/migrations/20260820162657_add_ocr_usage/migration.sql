-- CreateTable
CREATE TABLE "OcrUsage" (
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OcrUsage_pkey" PRIMARY KEY ("day")
);
