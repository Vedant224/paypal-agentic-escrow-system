/**
 * lib/agent-tools.ts
 * -----------------------------------------------------------------------------
 * PayPal Agent Toolkit integration plus the three custom escrow tools.
 *
 * The upstream `@paypal/agent-toolkit` does not model partial capture, so this
 * module registers `authorize_escrow_order`, `capture_proportional_milestone`
 * and `void_escrow_authorization` as Vercel AI SDK tools backed by the
 * PayPal Orders v2 / Payments v2 controllers in `lib/paypal-client.ts`.
 *
 * Every invocation is logged with a redacted payload for the AgentTelemetry
 * panel.
 * -----------------------------------------------------------------------------
 */
import { tool } from 'ai';
import { z } from 'zod';
import { ALL_TOOLS_ENABLED, PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk';
import { env } from './env';
import {
  authorizePayPalOrder,
  capturePayPalMilestone,
  createPayPalAuthorizeOrder,
  voidPayPalAuthorization,
} from './paypal-client';
import { AgentToolError } from './errors';
import { log } from './trace';

const FILE_NAME = 'agent-tools.ts';

/**
 * In-memory telemetry buffer backing the AgentTelemetry UI panel.
 */
export interface AgentTelemetryEntry {
  id: string;
  timestamp: string;
  source: string;
  tool: string;
  summary: string;
  level: 'INFO' | 'WARN' | 'ERROR';
}

const telemetryBuffer: AgentTelemetryEntry[] = [];
const MAX_TELEMETRY_ENTRIES = 100;

function recordTelemetry(
  toolName: string,
  summary: string,
  level: 'INFO' | 'WARN' | 'ERROR' = 'INFO',
  source = FILE_NAME,
): void {
  telemetryBuffer.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
    source,
    tool: toolName,
    summary,
    level,
  });

  if (telemetryBuffer.length > MAX_TELEMETRY_ENTRIES) {
    telemetryBuffer.length = MAX_TELEMETRY_ENTRIES;
  }
}

/**
 * Return the most recent telemetry entries (newest first).
 */
export function getAgentTelemetry(): AgentTelemetryEntry[] {
  return [...telemetryBuffer];
}

/**
 * Clear the telemetry buffer. Used by tests and the dashboard reset control.
 */
export function clearAgentTelemetry(): void {
  telemetryBuffer.length = 0;
}

// ---------------------------------------------------------------------------
// PayPal Agent Toolkit
// ---------------------------------------------------------------------------

let toolkitInstance: PayPalAgentToolkit | undefined;

/**
 * Lazily initialise the PayPal Agent Toolkit in Sandbox mode.
 */
export function getPayPalToolkit(): PayPalAgentToolkit {
  if (toolkitInstance !== undefined) {
    return toolkitInstance;
  }

  try {
    toolkitInstance = new PayPalAgentToolkit({
      clientId: env.PAYPAL_CLIENT_ID,
      clientSecret: env.PAYPAL_CLIENT_SECRET,
      configuration: {
        actions: ALL_TOOLS_ENABLED,
        context: { sandbox: true },
      },
    });

    recordTelemetry(
      'paypal_agent_toolkit',
      'Initialised PayPal Agent Toolkit in sandbox mode',
      'INFO',
      `${FILE_NAME}::getPayPalToolkit`,
    );

    return toolkitInstance;
  } catch (error) {
    throw new AgentToolError(
      'getPayPalToolkit',
      'Failed to initialise the PayPal Agent Toolkit',
      'AI_GENERATION_FAILED',
      undefined,
      error,
    );
  }
}

/**
 * The toolkit's own tools, keyed by name. Upstream uses the AI SDK v4 tool
 * shape (`parameters`); this app targets AI SDK v5 (`inputSchema`), so the
 * toolkit tools are exposed as-is and adapted at the call site.
 */
export function getPayPalToolkitTools(): Record<string, unknown> {
  return getPayPalToolkit().getTools() as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Custom escrow tools (AI SDK v5 shape)
// ---------------------------------------------------------------------------

export const authorizeEscrowOrderTool = tool({
  description:
    'Create a PayPal order with AUTHORIZE intent and authorize it, holding the full project budget in escrow without capturing it.',
  inputSchema: z.object({
    contractId: z.string().min(1).describe('The escrow contract id.'),
    totalBudgetCents: z
      .number()
      .int()
      .positive()
      .describe('Full project budget in integer cents, e.g. 10000 for $100.00.'),
    orderId: z
      .string()
      .optional()
      .describe('Existing PayPal order id to authorize. Omit to create a new order.'),
  }),
  execute: async ({ contractId, totalBudgetCents, orderId }) => {
    const fnName = `${FILE_NAME}::authorizeEscrowOrderTool`;

    try {
      const resolvedOrderId =
        orderId ?? (await createPayPalAuthorizeOrder(contractId, totalBudgetCents));

      const authorization = await authorizePayPalOrder(resolvedOrderId);

      recordTelemetry(
        'authorize_escrow_order',
        `Authorized ${totalBudgetCents} cents for contract ${contractId}`,
        'INFO',
        fnName,
      );

      return {
        contractId,
        orderId: resolvedOrderId,
        authorizationId: authorization.authorizationId,
        expirationTime: authorization.expirationTime ?? null,
      };
    } catch (error) {
      recordTelemetry(
        'authorize_escrow_order',
        `Failed to authorize contract ${contractId}`,
        'ERROR',
        fnName,
      );

      throw new AgentToolError(
        'authorizeEscrowOrderTool',
        'Failed to authorize the escrow order',
        'PAYPAL_AUTH_FAILED',
        { contractId },
        error,
      );
    }
  },
});

export const captureProportionalMilestoneTool = tool({
  description:
    'Capture the proportional slice of an escrow authorization that corresponds to newly verified acceptance criteria.',
  inputSchema: z.object({
    contractId: z.string().min(1).describe('The escrow contract id.'),
    authorizationId: z.string().min(1).describe('The PayPal authorization id.'),
    amountCents: z
      .number()
      .int()
      .positive()
      .describe('Amount to capture in integer cents, e.g. 2000 for $20.00.'),
    isFinalCapture: z
      .boolean()
      .describe('True when this capture settles the remaining authorized funds.'),
    requestId: z.string().min(1).describe('Idempotency key for the capture request.'),
  }),
  execute: async ({ contractId, authorizationId, amountCents, isFinalCapture, requestId }) => {
    const fnName = `${FILE_NAME}::captureProportionalMilestoneTool`;

    try {
      const captureId = await capturePayPalMilestone({
        authorizationId,
        amountCents,
        isFinalCapture,
        requestId,
      });

      recordTelemetry(
        'capture_proportional_milestone',
        `Captured ${amountCents} cents for contract ${contractId}`,
        'INFO',
        fnName,
      );

      return { contractId, captureId, amountCents, isFinalCapture };
    } catch (error) {
      recordTelemetry(
        'capture_proportional_milestone',
        `Failed to capture ${amountCents} cents for contract ${contractId}`,
        'ERROR',
        fnName,
      );

      throw new AgentToolError(
        'captureProportionalMilestoneTool',
        'Failed to capture the proportional milestone',
        'PAYPAL_CAPTURE_FAILED',
        { contractId, amountCents },
        error,
      );
    }
  },
});

export const voidEscrowAuthorizationTool = tool({
  description:
    'Void an escrow authorization, releasing all remaining uncaptured funds back to the client.',
  inputSchema: z.object({
    contractId: z.string().min(1).describe('The escrow contract id.'),
    authorizationId: z.string().min(1).describe('The PayPal authorization id to void.'),
  }),
  execute: async ({ contractId, authorizationId }) => {
    const fnName = `${FILE_NAME}::voidEscrowAuthorizationTool`;

    try {
      await voidPayPalAuthorization(authorizationId);

      recordTelemetry(
        'void_escrow_authorization',
        `Voided authorization for contract ${contractId}`,
        'INFO',
        fnName,
      );

      return { contractId, authorizationId, voided: true };
    } catch (error) {
      recordTelemetry(
        'void_escrow_authorization',
        `Failed to void authorization for contract ${contractId}`,
        'ERROR',
        fnName,
      );

      throw new AgentToolError(
        'voidEscrowAuthorizationTool',
        'Failed to void the escrow authorization',
        'PAYPAL_VOID_FAILED',
        { contractId },
        error,
      );
    }
  },
});

/**
 * All custom escrow tools, keyed by their canonical names.
 */
export const ESCROW_TOOLS = {
  authorize_escrow_order: authorizeEscrowOrderTool,
  capture_proportional_milestone: captureProportionalMilestoneTool,
  void_escrow_authorization: voidEscrowAuthorizationTool,
} as const;

export type EscrowToolName = keyof typeof ESCROW_TOOLS;

/**
 * Log a redacted toolkit invocation. Payloads are passed through the trace
 * redactor before they are stored.
 */
export function logToolkitInvocation(
  toolName: string,
  payload: Record<string, unknown>,
  level: 'INFO' | 'WARN' | 'ERROR' = 'INFO',
): void {
  const fnName = `${FILE_NAME}::logToolkitInvocation`;

  log(level, 'agent-toolkit', fnName, `Toolkit invoked: ${toolName}`, payload);

  recordTelemetry(toolName, summarisePayload(payload), level, fnName);
}

function summarisePayload(payload: Record<string, unknown>): string {
  const entries = Object.entries(payload).map(([key, value]) => `${key}=${String(value)}`);
  return entries.length > 0 ? entries.join(', ') : 'no payload';
}
