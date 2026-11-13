CREATE TABLE "CategoryAccess" (
    "accountKey" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "category" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CategoryAccess_pkey" PRIMARY KEY ("accountKey", "questionnaireId", "category")
);

CREATE INDEX "CategoryAccess_expiresAt_idx" ON "CategoryAccess"("expiresAt");
