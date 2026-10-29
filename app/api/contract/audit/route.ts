/**
 * app/api/contract/audit/route.ts
 * -----------------------------------------------------------------------------
 * Audit a persisted contract's assertions with the Freelancer_Agent and persist
 * any concrete revisions that keep the 100% weight invariant intact.
 * -----------------------------------------------------------------------------
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AuditContractRequestSchema } from '@/lib/schemas';
import { apiError, parseBody, withErrorHandling } from '@/lib/api-response';
import { applyAuditRevisions, auditAssertions } from '@/lib/contract-compiler';
import { prettyPrintContract } from '@/lib/pretty-printer';
import { log } from '@/lib/trace';

const FILE_NAME = 'api/contract/audit/route.ts';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const source = `${FILE_NAME}::POST`;

  return withErrorHandling(source, async (traceId) => {
    const parsed = await parseBody(req, AuditContractRequestSchema, source, traceId);

    if (!parsed.ok) {
      return parsed.response;
    }

    const { contractId } = parsed.data;

    const contract = await prisma.escrowContract.findUnique({
      where: { id: contractId },
      include: { criteria: { orderBy: { assertionIndex: 'asc' } } },
    });

    if (contract === null) {
      return apiError(source, 'Contract not found', 'CONTRACT_NOT_FOUND', 404, traceId);
    }

    let assertions: ReturnType<typeof JSON.parse>;

    try {
      assertions = JSON.parse(contract.assertionsJson) as ReturnType<typeof JSON.parse>;
    } catch (error) {
      return apiError(
        source,
        'Stored contract assertions are corrupt',
        'PARSER_ERROR',
        500,
        traceId,
        { message: error instanceof Error ? error.message : String(error) },
      );
    }

    const { result, usedFallback } = await auditAssertions(assertions, traceId);
    const revised = applyAuditRevisions(assertions, result);

    if (JSON.stringify(revised) !== JSON.stringify(assertions)) {
      await prisma.$transaction(async (tx) => {
        await tx.escrowContract.update({
          where: { id: contractId },
          data: { assertionsJson: prettyPrintContract(revised) },
        });

        for (const criterion of contract.criteria) {
          const assertion = revised[criterion.assertionIndex];

          if (assertion !== undefined) {
            await tx.criterion.update({
              where: { id: criterion.id },
              data: { assertionJson: JSON.stringify(assertion) },
            });
          }
        }
      });
    }

    log('INFO', traceId, source, 'Audited contract assertions', {
      contractId,
      approved: result.approved,
      issueCount: result.issues.length,
      usedFallback,
    });

    return NextResponse.json({
      contractId,
      approved: result.approved,
      issues: result.issues,
      suggestedRevisions: result.suggestedRevisions,
      revisedAssertions: revised,
      usedFallback,
      readyForAuthorization: result.approved,
    });
  });
}
