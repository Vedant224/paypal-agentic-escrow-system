/**
 * prisma/seed.ts
 * -----------------------------------------------------------------------------
 * Standalone entry point for `npm run prisma:seed`. Seeds the deterministic
 * demo contract used by the hackathon demo flow.
 * -----------------------------------------------------------------------------
 */
import { prisma } from '../lib/prisma';
import { seedDemoContract } from '../lib/demo-seed';

async function main(): Promise<void> {
  const contractId = await seedDemoContract();
  console.log(`Demo contract seeded: ${contractId}`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
