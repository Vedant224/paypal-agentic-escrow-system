/**
 * lib/paypal-client.ts
 * -----------------------------------------------------------------------------
 * Server-side PayPal Orders v2 / Payments v2 integration using the official
 * `@paypal/paypal-server-sdk` v2 controllers. Every call is wrapped in
 * `withRetry` and every failure surfaces as a `PayPalClientError` carrying a
 * machine-readable error code.
 * -----------------------------------------------------------------------------
 */
import {
  CheckoutPaymentIntent,
  Client,
  Environment,
  OrdersController,
  PaymentsController,
} from '@paypal/paypal-server-sdk';
import { env } from './env';
import { formatCentsToPayPalValue } from './format';
import { PayPalClientError } from './errors';
import { withRetry } from './retry';
import { log } from './trace';

const FILE_NAME = 'paypal-client.ts';

const paypalClient = new Client({
  clientCredentialsAuthCredentials: {
    oAuthClientId: env.PAYPAL_CLIENT_ID,
    oAuthClientSecret: env.PAYPAL_CLIENT_SECRET,
  },
  timeout: 0,
  environment: Environment.Sandbox,
});

export const ordersController = new OrdersController(paypalClient);
export const paymentsController = new PaymentsController(paypalClient);

/**
 * Create a PayPal order with `AUTHORIZE` intent so funds are held but not
 * captured. Returns the PayPal order id.
 */
export async function createPayPalAuthorizeOrder(
  contractId: string,
  totalBudgetCents: number,
  traceId = 'paypal-client',
): Promise<string> {
  const fnName = `${FILE_NAME}::createPayPalAuthorizeOrder`;

  try {
    const { result } = await withRetry(
      () =>
        ordersController.createOrder({
          body: {
            intent: CheckoutPaymentIntent.Authorize,
            purchaseUnits: [
              {
                referenceId: contractId,
                amount: {
                  currencyCode: 'USD',
                  value: formatCentsToPayPalValue(totalBudgetCents),
                },
              },
            ],
          },
          prefer: 'return=representation',
        }),
      { label: 'createPayPalAuthorizeOrder', maxRetries: 3 },
    );

    if (result.id === undefined || result.id === null || result.id === '') {
      throw new Error('Missing order.id in PayPal response');
    }

    log('INFO', traceId, fnName, 'Created PayPal authorize order', {
      contractId,
      totalBudgetCents,
      orderId: result.id,
    });

    return result.id;
  } catch (error) {
    throw new PayPalClientError(
      'createPayPalAuthorizeOrder',
      'Failed to create PayPal order with AUTHORIZE intent',
      'PAYPAL_ORDER_FAILED',
      { contractId, totalBudgetCents },
      error,
    );
  }
}

/**
 * Convert an approved order into an active authorization and return the
 * authorization id plus its expiry timestamp.
 */
export async function authorizePayPalOrder(
  orderId: string,
  traceId = 'paypal-client',
): Promise<{ authorizationId: string; expirationTime?: string }> {
  const fnName = `${FILE_NAME}::authorizePayPalOrder`;

  try {
    const { result } = await withRetry(
      () =>
        ordersController.authorizeOrder({
          id: orderId,
          prefer: 'return=representation',
        }),
      { label: 'authorizePayPalOrder', maxRetries: 3 },
    );

    const authorization = result.purchaseUnits?.[0]?.payments?.authorizations?.[0];

    if (authorization?.id === undefined || authorization.id === null) {
      throw new Error('Missing authorization ID in PayPal response');
    }

    const expirationTime = authorization.expirationTime;

    log('INFO', traceId, fnName, 'Authorized PayPal order', {
      orderId,
      authorizationId: authorization.id,
    });

    return {
      authorizationId: authorization.id,
      ...(expirationTime === undefined || expirationTime === null
        ? {}
        : { expirationTime }),
    };
  } catch (error) {
    throw new PayPalClientError(
      'authorizePayPalOrder',
      'Failed to authorize approved PayPal order',
      'PAYPAL_AUTH_FAILED',
      { orderId },
      error,
    );
  }
}

/**
 * Capture a proportional slice of an authorized payment. Returns the PayPal
 * capture id.
 */
export async function capturePayPalMilestone(params: {
  authorizationId: string;
  amountCents: number;
  isFinalCapture: boolean;
  requestId: string;
  traceId?: string;
}): Promise<string> {
  const fnName = `${FILE_NAME}::capturePayPalMilestone`;
  const traceId = params.traceId ?? 'paypal-client';

  try {
    const { result } = await withRetry(
      () =>
        paymentsController.captureAuthorizedPayment({
          authorizationId: params.authorizationId,
          paypalRequestId: params.requestId,
          prefer: 'return=representation',
          body: {
            amount: {
              currencyCode: 'USD',
              value: formatCentsToPayPalValue(params.amountCents),
            },
            finalCapture: params.isFinalCapture,
          },
        }),
      { label: 'capturePayPalMilestone', maxRetries: 3 },
    );

    if (result.id === undefined || result.id === null || result.id === '') {
      throw new Error('Missing capture.id in PayPal response');
    }

    log('INFO', traceId, fnName, 'Captured PayPal milestone', {
      amountCents: params.amountCents,
      isFinalCapture: params.isFinalCapture,
      captureId: result.id,
    });

    return result.id;
  } catch (error) {
    throw new PayPalClientError(
      'capturePayPalMilestone',
      'Failed to execute PayPal partial capture',
      'PAYPAL_CAPTURE_FAILED',
      {
        authorizationId: params.authorizationId,
        amountCents: params.amountCents,
        isFinalCapture: params.isFinalCapture,
      },
      error,
    );
  }
}

/**
 * Void an authorization, releasing the remaining held funds.
 */
export async function voidPayPalAuthorization(
  authorizationId: string,
  traceId = 'paypal-client',
): Promise<void> {
  const fnName = `${FILE_NAME}::voidPayPalAuthorization`;

  try {
    await withRetry(
      () => paymentsController.voidPayment({ authorizationId }),
      { label: 'voidPayPalAuthorization', maxRetries: 3 },
    );

    log('INFO', traceId, fnName, 'Voided PayPal authorization', {
      authorizationId,
    });
  } catch (error) {
    throw new PayPalClientError(
      'voidPayPalAuthorization',
      'Failed to void PayPal authorization',
      'PAYPAL_VOID_FAILED',
      { authorizationId },
      error,
    );
  }
}
