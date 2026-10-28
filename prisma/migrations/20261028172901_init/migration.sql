-- CreateTable
CREATE TABLE "EscrowContract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "freelancerId" TEXT,
    "projectRequirements" TEXT NOT NULL,
    "assertionsJson" TEXT NOT NULL,
    "totalBudgetCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paypalOrderId" TEXT,
    "paypalAuthorizationId" TEXT,
    "authorizationExpiresAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "verificationInProgress" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Criterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "assertionIndex" INTEGER NOT NULL,
    "assertionJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "captureId" TEXT,
    "captureTimestamp" DATETIME,
    "actualResult" TEXT,
    "dollarValueCents" INTEGER NOT NULL,
    CONSTRAINT "Criterion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "EscrowContract" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "deploymentUrl" TEXT NOT NULL,
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passCount" INTEGER NOT NULL,
    "failCount" INTEGER NOT NULL,
    "resultsJson" TEXT NOT NULL,
    CONSTRAINT "VerificationRun_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "EscrowContract" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaptureLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "finalCapture" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationRunId" TEXT NOT NULL,
    "criteriaIdsJson" TEXT NOT NULL,
    CONSTRAINT "CaptureLedger_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "EscrowContract" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EscrowContract_status_idx" ON "EscrowContract"("status");

-- CreateIndex
CREATE INDEX "Criterion_contractId_idx" ON "Criterion"("contractId");

-- CreateIndex
CREATE INDEX "VerificationRun_contractId_idx" ON "VerificationRun"("contractId");

-- CreateIndex
CREATE INDEX "CaptureLedger_contractId_idx" ON "CaptureLedger"("contractId");

-- CreateIndex
CREATE INDEX "CaptureLedger_verificationRunId_idx" ON "CaptureLedger"("verificationRunId");
