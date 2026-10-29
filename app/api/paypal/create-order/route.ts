/**
 * app/api/paypal/create-order/route.ts
 * -----------------------------------------------------------------------------
 * Create a PayPal order with AUTHORIZE intent for the contract's full budget
 * and persist the order id so the client can approve it in the PayPal popup.
 * -----------------------------------------------------------------------------
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CreateOrderRequestSchema } from '@/lib/schemas';
import { apiError, parseBody, withErrorHandling } from '@/lib/api-response';
import { createPayPalAuthorizeOrder } from '@/lib/paypal-client';
import { log } from '@/lib/trace';

const FILE_NAME = 'api/paypal/create-order/route.ts';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const source = `${FILE_NAME}::POST`;

  return withErrorHandling(source, async (traceId) => {
    const parsed = await parseBody(req, CreateOrderRequestSchema, source, traceId);

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

    if (contract.status === 'COMPLETED' || contract.status === 'VOIDED') {
      return apiError(
        source,
        `Contract is ${contract.status} and can no longer be funded`,
        'CONTRACT_NOT_AUTHORIZED',
        400,
        traceId,
      );
    }

    try {
      const orderId = await createPayPalAuthorizeOrder(
        contract.id,
        contract.totalBudgetCents,
        traceId,
      );

      await prisma.escrowContract.update({
        where: { id: contract.id },
        data: { paypalOrderId: orderId },
      });

      log('INFO', traceId, source, 'Created PayPal order', {
        contractId: contract.id,
        orderId,
      });

      return NextResponse.json({
        contractId: contract.id,
        orderId,
        totalBudgetCents: contract.totalBudgetCents,
        currency: contract.currency,
      });
    } catch (error) {
      return apiError(
        source,
        'Failed to create PayPal order',
        'PAYPAL_ORDER_FAILED',
        502,
        traceId,
        { message: error instanceof Error ? error.message : String(error) },
      );
    }
  });
}
