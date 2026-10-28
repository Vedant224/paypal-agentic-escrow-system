/**
 * lib/demo-seed.ts
 * -----------------------------------------------------------------------------
 * Idempotent seeder for the deterministic demo contract.
 *
 * The five assertions below match the exact selectors and styles rendered by
 * `/demo/v1-broken` and `/demo/v2-fixed`, so the hackathon demo never depends
 * on live AI generation to produce a working contract.
 * -----------------------------------------------------------------------------
 */
import { prisma } from './prisma';
import { prettyPrintContract } from './pretty-printer';
import { allocateCriterionCents } from './schemas';
import type { AssertionPrimitive } from './schemas';
import { log } from './trace';

const FILE_NAME = 'demo-seed.ts';

export const DEMO_CONTRACT_ID = '00000000-0000-4000-8000-000000000001';
export const DEMO_CLIENT_ID = 'demo-client-1';
export const DEMO_PROJECT_REQUIREMENTS =
  'Build a responsive task management landing page with a green primary call-to-action button.';
export const DEMO_TOTAL_BUDGET_CENTS = 10_000;

/**
 * The canonical five demo assertions. Weights are 20% each so the budget
 * splits into five clean $20.00 milestones.
 */
export const DEMO_ASSERTIONS: AssertionPrimitive[] = [
  {
    type: 'dom_exists',
    description: 'Main heading is present on the page',
    selector: '#main-heading',
    weight: 20,
  },
  {
    type: 'text_contains',
    description: 'Welcome copy mentions task management',
    selector: '.welcome-text',
    expectedValue: 'task management',
    weight: 20,
  },
  {
    type: 'no_horizontal_overflow',
    description: 'No horizontal overflow at a 375px mobile viewport',
    viewportWidth: 375,
    weight: 20,
  },
  {
    type: 'computed_style',
    description: 'Primary button uses the agreed green background colour',
    selector: '.primary-button',
    property: 'background-color',
    expectedValue: 'rgb(34, 139, 34)',
    weight: 20,
  },
  {
    type: 'http_status_ok',
    description: 'Deployed URL responds with a 2xx status code',
    url: 'http://localhost:3000/demo/v1-broken',
    weight: 20,
  },
];

/**
 * Build the demo contract object in the same shape the API returns.
 */
export function buildDemoAssertions(): AssertionPrimitive[] {
  return DEMO_ASSERTIONS.map((assertion) => ({ ...assertion }));
}

/**
 * Seed the default demo contract if it does not already exist.
 *
 * Idempotent: calling this repeatedly is safe and never duplicates rows.
 * Returns the contract id.
 */
export async function seedDemoContract(): Promise<string> {
  const fnName = `${FILE_NAME}::seedDemoContract`;

  const existing = await prisma.escrowContract.findUnique({
    where: { id: DEMO_CONTRACT_ID },
  });

  if (existing !== null) {
    return existing.id;
  }

  const assertions = buildDemoAssertions();
  const allocations = allocateCriterionCents(assertions, DEMO_TOTAL_BUDGET_CENTS);
  const assertionsJson = prettyPrintContract(assertions);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.escrowContract.create({
        data: {
          id: DEMO_CONTRACT_ID,
          clientId: DEMO_CLIENT_ID,
          projectRequirements: DEMO_PROJECT_REQUIREMENTS,
          assertionsJson,
          totalBudgetCents: DEMO_TOTAL_BUDGET_CENTS,
          currency: 'USD',
          status: 'DRAFT',
          criteria: {
            create: assertions.map((assertion, index) => ({
              assertionIndex: index,
              assertionJson: JSON.stringify(assertion),
              status: 'PENDING',
              dollarValueCents: allocations[index] ?? 0,
            })),
          },
        },
      });
    });
  } catch (error) {
    // A concurrent seed may have won the race — that is not a failure.
    const raceWinner = await prisma.escrowContract.findUnique({
      where: { id: DEMO_CONTRACT_ID },
    });

    if (raceWinner !== null) {
      return raceWinner.id;
    }

    throw error;
  }

  log('INFO', 'seed-demo-contract', fnName, 'Seeded deterministic demo contract', {
    contractId: DEMO_CONTRACT_ID,
    totalBudgetCents: DEMO_TOTAL_BUDGET_CENTS,
  });

  return DEMO_CONTRACT_ID;
}

/**
 * Ensure a demo contract exists and return its id.
 */
export async function ensureDemoContractId(): Promise<string> {
  return seedDemoContract();
}
