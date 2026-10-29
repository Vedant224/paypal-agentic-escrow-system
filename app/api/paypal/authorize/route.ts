/**
 * app/api/paypal/authorize/route.ts
 * -----------------------------------------------------------------------------
 * Convert an approved PayPal order into an active authorization and persist the
 * authorization id, expiry and the AUTHORIZED contract status.
 * -----------------------------------------------------------------------------
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AuthorizeOrderRequestSchema } from '@/lib/schemas';
import { apiError, parseBody, withErrorHandling } from '@/lib/api-response';
import { authorizePayPalOrder } from '@/lib/paypal-client';
import { log } from '@/lib/trace';

const FILE_NAME = 'api/paypal/authorize/route.ts';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const source = `${FILE_NAME}::POST`;

  return withErrorHandling(source, async (traceId) => {
    const parsed = await parseBody(req, AuthorizeOrderRequestSchema, source, traceId);

    if (!parsed.ok) {
      return parsed.response;
    }

    const { contractId, orderId } = parsed.data;

    const contract = await prisma.escrowContract.findUnique({
      where: { id: contractId },
    });

    if (contract === null) {
      return apiError(source, 'Contract not found', 'CONTRACT_NOT_FOUND', 404, traceId);
    }

    if (contract.paypalOrderId !== null && contract.paypalOrderId !== orderId) {
      return apiError(
        source,
        'Order id does not match the order created for this contract',
        'INVALID_REQUEST_BODY',
        400,
        traceId,
      );
    }

    try {
      const { authorizationId, expirationTime } = await authorizePayPalOrder(orderId, traceId);

      const authorizationExpiresAt =
        expirationTime === undefined ? null : new Date(expirationTime);

      await prisma.escrowContract.update({
        where: { id: contractId },
        data: {
          paypalOrderId: orderId,
          paypalAuthorizationId: authorizationId,
          authorizationExpiresAt,
          status: 'AUTHORIZED',
        },
      });

      log('INFO', traceId, source, 'Contract authorized', {
        contractId,
        orderId,
        authorizationId,
      });

      return NextResponse.json({
        contractId,
        orderId,
        authorizationId,
        authorizationExpiresAt:
          authorizationExpiresAt === null ? null : authorizationExpiresAt.toISOString(),
        status: 'AUTHORIZED',
      });
    } catch (error) {
      return apiError(
        source,
        'Failed to authorize PayPal order',
        'PAYPAL_AUTH_FAILED',
        502,
        traceId,
        { message: error instanceof Error ? error.message : String(error) },
      );
    }
  });
}
