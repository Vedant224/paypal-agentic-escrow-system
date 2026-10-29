/**
 * app/api/contract/[id]/route.ts
 * -----------------------------------------------------------------------------
 * GET the full state of a contract: criteria, capture ledger, verification runs
 * and the computed settlement figures.
 *
 * `id === "default"` returns (and seeds if missing) the deterministic demo
 * contract so the dashboard has something to render on first load.
 * -----------------------------------------------------------------------------
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { seedDemoContract } from '@/lib/demo-seed';
import { apiError, withErrorHandling } from '@/lib/api-response';
import { log } from '@/lib/trace';

const FILE_NAME = 'api/contract/[id]/route.ts';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const source = `${FILE_NAME}::GET`;

  return withErrorHandling(source, async (traceId) => {
    const { id } = await context.params;

    if (typeof id !== 'string' || id.trim().length === 0) {
      return apiError(
        source,
        'Contract id is required',
        'INVALID_REQUEST_BODY',
        400,
        traceId,
      );
    }

    const contractId = id === 'default' ? await seedDemoContract() : id;

    const contract = await prisma.escrowContract.findUnique({
      where: { id: contractId },
      include: {
        criteria: { orderBy: { assertionIndex: 'asc' } },
        captureLedger: { orderBy: { capturedAt: 'desc' } },
        verificationRuns: { orderBy: { runAt: 'desc' } },
      },
    });

    if (contract === null) {
      return apiError(source, 'Contract not found', 'CONTRACT_NOT_FOUND', 404, traceId);
    }

    const totalCapturedCents = contract.captureLedger.reduce(
      (sum, entry) => sum + entry.amountCents,
      0,
    );

    const remainingAuthorizedCents = Math.max(
      contract.totalBudgetCents - totalCapturedCents,
      0,
    );

    const passedCriteria = contract.criteria.filter(
      (criterion) => criterion.status === 'PASSED',
    );

    const passedWeight = passedCriteria.reduce((sum, criterion) => {
      const assertion = JSON.parse(criterion.assertionJson) as { weight?: unknown };
      return sum + (typeof assertion.weight === 'number' ? assertion.weight : 0);
    }, 0);

    const passPercentage =
      contract.criteria.length === 0 ? 0 : Math.round((passedWeight / 100) * 100);

    log('INFO', traceId, source, 'Loaded contract state', {
      contractId: contract.id,
      status: contract.status,
    });

    return NextResponse.json({
      contract: {
        id: contract.id,
        clientId: contract.clientId,
        freelancerId: contract.freelancerId,
        projectRequirements: contract.projectRequirements,
        totalBudgetCents: contract.totalBudgetCents,
        currency: contract.currency,
        paypalOrderId: contract.paypalOrderId,
        paypalAuthorizationId: contract.paypalAuthorizationId,
        authorizationExpiresAt: contract.authorizationExpiresAt,
        status: contract.status,
        verificationInProgress: contract.verificationInProgress,
      },
      criteria: contract.criteria.map((criterion) => {
        const assertion = JSON.parse(criterion.assertionJson) as Record<string, unknown>;

        const target =
          typeof assertion.selector === 'string'
            ? assertion.selector
            : typeof assertion.url === 'string'
              ? assertion.url
              : typeof assertion.viewportWidth === 'number'
                ? `viewport ${String(assertion.viewportWidth)}px`
                : '—';

        const expectedValue =
          typeof assertion.expectedValue === 'string'
            ? assertion.expectedValue
            : typeof assertion.property === 'string'
              ? `${assertion.property}: ${String(assertion.expectedValue ?? '')}`
              : '—';

        return {
          id: criterion.id,
          assertionIndex: criterion.assertionIndex,
          assertionType: String(assertion.type ?? 'unknown'),
          description: String(assertion.description ?? ''),
          target,
          expectedValue,
          weight: typeof assertion.weight === 'number' ? assertion.weight : 0,
          dollarValueCents: criterion.dollarValueCents,
          status: criterion.status,
          actualResult: criterion.actualResult,
          captureId: criterion.captureId,
          captureTimestamp: criterion.captureTimestamp,
        };
      }),
      captureLedger: contract.captureLedger.map((entry) => ({
        id: entry.id,
        captureId: entry.captureId,
        amountCents: entry.amountCents,
        finalCapture: entry.finalCapture,
        capturedAt: entry.capturedAt.toISOString(),
        verificationRunId: entry.verificationRunId,
      })),
      verificationRuns: contract.verificationRuns.map((run) => ({
        id: run.id,
        deploymentUrl: run.deploymentUrl,
        runAt: run.runAt.toISOString(),
        passCount: run.passCount,
        failCount: run.failCount,
      })),
      totalCapturedCents,
      remainingAuthorizedCents,
      passPercentage,
    });
  });
}
