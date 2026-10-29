/**
 * app/api/contract/compile/route.ts
 * -----------------------------------------------------------------------------
 * Compile a natural-language project brief into a validated escrow contract
 * using the Client_Agent, then persist it with integer-cent allocations.
 * -----------------------------------------------------------------------------
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CompileContractRequestSchema } from '@/lib/schemas';
import { parseBody, withErrorHandling } from '@/lib/api-response';
import {
  allocateBudget,
  assertCompileResult,
  compileAssertions,
} from '@/lib/contract-compiler';
import { prettyPrintContract } from '@/lib/pretty-printer';
import { log } from '@/lib/trace';

const FILE_NAME = 'api/contract/compile/route.ts';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const source = `${FILE_NAME}::POST`;

  return withErrorHandling(source, async (traceId) => {
    const parsed = await parseBody(req, CompileContractRequestSchema, source, traceId);

    if (!parsed.ok) {
      return parsed.response;
    }

    const { projectRequirements, totalBudgetCents, clientId } = parsed.data;

    const compiled = await compileAssertions(projectRequirements, totalBudgetCents, traceId);

    assertCompileResult(compiled.assertions);

    const allocations = allocateBudget(compiled.assertions, totalBudgetCents);

    const contract = await prisma.$transaction(async (tx) => {
      const created = await tx.escrowContract.create({
        data: {
          clientId,
          projectRequirements,
          assertionsJson: prettyPrintContract(compiled.assertions),
          totalBudgetCents,
          currency: 'USD',
          status: 'DRAFT',
          criteria: {
            create: compiled.assertions.map((assertion, index) => ({
              assertionIndex: index,
              assertionJson: JSON.stringify(assertion),
              status: 'PENDING',
              dollarValueCents: allocations[index] ?? 0,
            })),
          },
        },
        include: { criteria: { orderBy: { assertionIndex: 'asc' } } },
      });

      return created;
    });

    log('INFO', traceId, source, 'Compiled and persisted contract', {
      contractId: contract.id,
      usedFallback: compiled.usedFallback,
    });

    return NextResponse.json({
      contractId: contract.id,
      status: contract.status,
      totalBudgetCents: contract.totalBudgetCents,
      usedFallback: compiled.usedFallback,
      assertions: compiled.assertions,
      criteria: contract.criteria.map((criterion) => ({
        id: criterion.id,
        assertionIndex: criterion.assertionIndex,
        dollarValueCents: criterion.dollarValueCents,
        status: criterion.status,
      })),
    });
  });
}
