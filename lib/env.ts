/**
 * lib/env.ts
 * -----------------------------------------------------------------------------
 * Validates every required environment variable exactly once, at module load.
 * A missing/invalid variable crashes the process immediately with an actionable
 * message instead of surfacing as a confusing runtime failure on first request.
 * -----------------------------------------------------------------------------
 */
import { z } from 'zod';

const EnvSchema = z.object({
  PAYPAL_CLIENT_ID: z.string().min(1, 'PAYPAL_CLIENT_ID is required'),
  PAYPAL_CLIENT_SECRET: z.string().min(1, 'PAYPAL_CLIENT_SECRET is required'),
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: z.string().min(1, 'NEXT_PUBLIC_PAYPAL_CLIENT_ID is required'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url('NEXT_PUBLIC_APP_URL must be a valid URL')
    .default('http://localhost:3000'),
  KERNEL_WS_ENDPOINT: z
    .string()
    .optional()
    .transform((value) => (value === undefined || value.trim() === '' ? undefined : value.trim())),
});

export type Env = z.infer<typeof EnvSchema>;

function validateEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    console.error('[env.ts::validateEnv] Invalid environment variables:', JSON.stringify(details));
    throw new Error(
      `[env.ts::validateEnv] Missing or invalid environment variables: ${Object.keys(details).join(', ')}`,
    );
  }

  return parsed.data;
}

export const env: Env = validateEnv();

/** True when a remote Kernel cloud browser endpoint has been configured. */
export const hasKernelEndpoint = (): boolean => env.KERNEL_WS_ENDPOINT !== undefined;
