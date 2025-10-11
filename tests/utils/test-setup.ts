/**
 * Common test setup utilities
 * Import this at the top of test files for devnet-ready testing
 */

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  ensureSufficientBalance,
  isRemoteCluster,
  logTestEnvironment,
  sleep,
} from "./devnet-helpers";

/**
 * Setup test environment with devnet compatibility
 * Call this in a before() hook
 */
export async function setupTestEnvironment(
  provider: AnchorProvider
): Promise<void> {
  await logTestEnvironment(provider);

  if (isRemoteCluster(provider)) {
    console.log("🌐 Remote cluster detected - enabling devnet mode");
    await ensureSufficientBalance(provider, 3); // Ensure 3 SOL minimum
  }
}

/**
 * Add delay between tests on remote clusters to avoid rate limiting
 */
export async function postTestCleanup(provider: AnchorProvider): Promise<void> {
  if (isRemoteCluster(provider)) {
    await sleep(200); // 200ms delay between tests
  }
}

/**
 * Increase clock tolerance for devnet
 */
export function getClockTolerance(provider: AnchorProvider): number {
  return isRemoteCluster(provider) ? 30 : 10; // 30s for devnet, 10s for localnet
}

/**
 * Example usage in a test file:
 * 
 * ```typescript
 * import * as anchor from "@coral-xyz/anchor";
 * import { Program } from "@coral-xyz/anchor";
 * import { setupTestEnvironment, postTestCleanup } from "./utils/test-setup";
 * 
 * describe("my tests", () => {
 *   const provider = anchor.AnchorProvider.env();
 *   anchor.setProvider(provider);
 * 
 *   before(async () => {
 *     await setupTestEnvironment(provider);
 *   });
 * 
 *   afterEach(async () => {
 *     await postTestCleanup(provider);
 *   });
 * 
 *   it("should pass on devnet", async () => {
 *     // your test code
 *   });
 * });
 * ```
 */
