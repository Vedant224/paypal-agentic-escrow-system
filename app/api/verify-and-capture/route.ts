/**
 * app/api/verify-and-capture/route.ts
 * -----------------------------------------------------------------------------
 * The core escrow route.
 *
 * 1. Validates the request body with Zod.
 * 2. Atomically acquires the `verificationInProgress` lock (HTTP 409 if busy).
 * 3. Runs every uncaptured assertion in a headless browser with guaranteed
 *    `try/finally` cleanup of both the context and the browser.
 * 4. Captures only the *delta* — the criteria that newly passed and have not
 *    been captured before — so the client is never double-charged.
 * 5. Persists criteria, the VerificationRun, the CaptureLedger and the contract
 *    status inside a single `prisma.$transaction`.
 * 6. Always releases the lock in a `finally` block.
 * -----------------------------------------------------------------------------
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { AssertionPrimitiveSchema, VerifyAndCaptureRequestSchema } from '@/lib/schemas';
import { apiError, parseBody, withErrorHandling } from '@/lib/api-response';
import { closeBrowser, connectBrowser } from '@/lib/browser-connector';
import {
  executeAssertionSafe,
  sortCriteriaForExecution,
} from '@/lib/verification-engine';
import type { VerificationResult } from '@/lib/verification-engine';
import { capturePayPalMilestone } from '@/lib/paypal-client';
import { log } from '@/lib/trace';

const FILE_NAME = 'api/verify-and-capture/route.ts';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const source = `${FILE_NAME}::POST`;

  return withErrorHandling(source, async (traceId) => {
    const parsed = await parseBody(req, VerifyAndCaptureRequestSchema, source, traceId);

    if (!parsed.ok) {
      return parsed.response;
    }

    const { contractId, deploymentUrl } = parsed.data;

    // --- 1. Atomic lock acquisition -----------------------------------------
    const lockAcquired = await prisma.escrowContract.updateMany({
      where: { id: contractId, verificationInProgress: false },
      data: { verificationInProgress: true },
    });

    if (lockAcquired.count === 0) {
      const existing = await prisma.escrowContract.findUnique({
        where: { id: contractId },
      });

      if (existing === null) {
        return apiError(source, 'Contract not found', 'CONTRACT_NOT_FOUND', 404, traceId);
      }

      return apiError(
        source,
        'A verification run is already in progress for this contract',
        'VERIFICATION_IN_PROGRESS',
        409,
        traceId,
      );
    }

    try {
      // --- 2. Load and validate the contract --------------------------------
      const contract = await prisma.escrowContract.findUnique({
        where: { id: contractId },
        include: {
          criteria: { orderBy: { assertionIndex: 'asc' } },
          captureLedger: true,
        },
      });

      if (contract === null) {
        return apiError(source, 'Contract not found', 'CONTRACT_NOT_FOUND', 404, traceId);
      }

      if (contract.paypalAuthorizationId === null) {
        return apiError(
          source,
          'Contract has no active PayPal authorization',
          'CONTRACT_NOT_AUTHORIZED',
          400,
          traceId,
        );
      }

      if (contract.status !== 'AUTHORIZED' && contract.status !== 'PARTIALLY_CAPTURED') {
        return apiError(
          source,
          `Contract status is "${contract.status}". Must be AUTHORIZED or PARTIALLY_CAPTURED.`,
          'CONTRACT_NOT_AUTHORIZED',
          400,
          traceId,
        );
      }

      if (
        contract.authorizationExpiresAt !== null &&
        contract.authorizationExpiresAt.getTime() < Date.now()
      ) {
        return apiError(
          source,
          'PayPal authorization has expired (29-day limit exceeded)',
          'AUTHORIZATION_EXPIRED',
          400,
          traceId,
        );
      }

      // --- 3. Execute the assertions -----------------------------------------
      const resultsById = new Map<string, VerificationResult>();
      const newlyPassedIds: string[] = [];

      const browser = await connectBrowser(traceId);

      try {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

        try {
          const page = await context.newPage();
          await page.goto(deploymentUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });

          const parsedCriteria = contract.criteria.map((criterion) => ({
            criterion,
            assertion: AssertionPrimitiveSchema.parse(JSON.parse(criterion.assertionJson)),
          }));

          const sorted = sortCriteriaForExecution(parsedCriteria);

          for (const { criterion, assertion } of sorted) {
            // Never re-evaluate an assertion that is already settled.
            if (criterion.status === 'PASSED' && criterion.captureId !== null) {
              resultsById.set(criterion.id, {
                criterionId: criterion.id,
                passed: true,
                actualResult: criterion.actualResult ?? 'Previously verified & settled',
                skipped: true,
              });
              continue;
            }

            const result = await executeAssertionSafe(page, criterion.id, assertion);
            resultsById.set(criterion.id, result);

            if (result.passed) {
              newlyPassedIds.push(criterion.id);
            }
          }
        } finally {
          await context.close();
        }
      } finally {
        await closeBrowser(browser, traceId);
      }

      // --- 4. Compute the proportional delta ---------------------------------
      const orderedResults: VerificationResult[] = contract.criteria.map(
        (criterion) =>
          resultsById.get(criterion.id) ?? {
            criterionId: criterion.id,
            passed: false,
            actualResult: 'Not evaluated',
            skipped: false,
          },
      );

      const newlyPassedCriteria = contract.criteria.filter((criterion) =>
        newlyPassedIds.includes(criterion.id),
      );

      const deltaCaptureCents = newlyPassedCriteria.reduce(
        (sum, criterion) => sum + criterion.dollarValueCents,
        0,
      );

      const totalCapturedSoFarCents = contract.captureLedger.reduce(
        (sum, entry) => sum + entry.amountCents,
        0,
      );

      const isFinalCapture =
        totalCapturedSoFarCents + deltaCaptureCents >= contract.totalBudgetCents;

      // The run id is generated up front so EVERY run is recorded, even when
      // nothing new passed and no capture happens.
      const verificationRunId = randomUUID();
      let captureId: string | undefined;

      if (deltaCaptureCents > 0) {
        captureId = await capturePayPalMilestone({
          authorizationId: contract.paypalAuthorizationId,
          amountCents: deltaCaptureCents,
          isFinalCapture,
          requestId: verificationRunId,
          traceId,
        });
      }

      const passCount = orderedResults.filter((result) => result.passed).length;
      const failCount = orderedResults.length - passCount;

      // --- 5. Atomic persistence ---------------------------------------------
      await prisma.$transaction(async (tx) => {
        for (const result of orderedResults) {
          if (result.skipped) {
            continue;
          }

          const settledCaptureId = captureId;

          await tx.criterion.update({
            where: { id: result.criterionId },
            data:
              result.passed && settledCaptureId !== undefined
                ? {
                    status: 'PASSED',
                    actualResult: result.actualResult,
                    captureId: settledCaptureId,
                    captureTimestamp: new Date(),
                  }
                : {
                    status: result.passed ? 'PASSED' : 'FAILED',
                    actualResult: result.actualResult,
                  },
          });
        }

        await tx.verificationRun.create({
          data: {
            id: verificationRunId,
            contractId,
            deploymentUrl,
            passCount,
            failCount,
            resultsJson: JSON.stringify(orderedResults),
          },
        });

        if (deltaCaptureCents > 0 && captureId !== undefined) {
          await tx.captureLedger.create({
            data: {
              contractId,
              captureId,
              amountCents: deltaCaptureCents,
              finalCapture: isFinalCapture,
              verificationRunId,
              criteriaIdsJson: JSON.stringify(newlyPassedIds),
            },
          });

          await tx.escrowContract.update({
            where: { id: contractId },
            data: {
              status: isFinalCapture ? 'COMPLETED' : 'PARTIALLY_CAPTURED',
            },
          });
        }
      });

      log('INFO', traceId, source, 'Verification run completed', {
        contractId,
        verificationRunId,
        passCount,
        failCount,
        deltaCaptureCents,
        captureId: captureId ?? null,
      });

      return NextResponse.json({
        verificationRunId,
        results: orderedResults,
        deltaCaptureCents,
        captureId: captureId ?? null,
        totalCapturedCents: totalCapturedSoFarCents + deltaCaptureCents,
        status: isFinalCapture
          ? 'COMPLETED'
          : deltaCaptureCents > 0
            ? 'PARTIALLY_CAPTURED'
            : contract.status,
      });
    } finally {
      // --- 6. Always release the lock ---------------------------------------
      await prisma.escrowContract.updateMany({
        where: { id: contractId },
        data: { verificationInProgress: false },
      });
    }
  });
}
