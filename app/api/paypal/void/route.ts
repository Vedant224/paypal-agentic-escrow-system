/**
 * app/api/paypal/void/route.ts
 * -----------------------------------------------------------------------------
 * Void the remaining uncaptured funds on a contract, releasing them back to the
 * client and marking the contract VOIDED.
 * -----------------------------------------------------------------------------
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { VoidOrderRequestSchema } from '@/lib/schemas';
import { apiError, parseBody, withErrorHandling } from '@/lib/api-response';
import { voidPayPalAuthorization } from '@/lib/paypal-client';
import { log } from '@/lib/trace';

const FILE_NAME = 'api/paypal/void/route.ts';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const source = `${FILE_NAME}::POST`;

  return withErrorHandling(source, async (traceId) => {
    const parsed = await parseBody(req, VoidOrderRequestSchema, source, traceId);

    if (!parsed.ok) {
      return parsed.response;
    }

    const { contractId } = parsed.data;

    const contract = await prisma.escrowContract.findUnique({
      where: { id: contractId },
    });

    if (contract === null) {
      return apiError(source, 'Contract not found', 'CONTRACT_NOT_FOUND', 404, traceId);
    }

    if (contract.paypalAuthorizationId === null) {
      return apiError(
        source,
        'Contract has no active authorization to void',
        'CONTRACT_NOT_AUTHORIZED',
        400,
        traceId,
      );
    }

    if (contract.status === 'VOIDED') {
      return apiError(
        source,
        'Contract is already voided',
        'CONTRACT_NOT_AUTHORIZED',
        400,
        traceId,
      );
    }

    try {
      await voidPayPalAuthorization(contract.paypalAuthorizationId, traceId);

      await prisma.escrowContract.update({
        where: { id: contractId },
        data: { status: 'VOIDED' },
      });

      log('INFO', traceId, source, 'Contract voided', {
        contractId,
        authorizationId: contract.paypalAuthorizationId,
      });

      return NextResponse.json({
        contractId,
        status: 'VOIDED',
        voidedAuthorizationId: contract.paypalAuthorizationId,
      });
    } catch (error) {
      return apiError(
        source,
        'Failed to void PayPal authorization',
        'PAYPAL_VOID_FAILED',
        502,
        traceId,
        { message: error instanceof Error ? error.message : String(error) },
      );
    }
  });
}
