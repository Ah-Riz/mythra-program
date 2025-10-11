import { AnchorProvider } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

/**
 * Retry a function with exponential backoff
 * Useful for handling transient RPC errors on devnet
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
  } = options;

  let lastError: any;
  let delayMs = initialDelayMs;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      
      // Don't retry on certain errors
      const errorMsg = err?.message || err?.toString() || "";
      if (
        errorMsg.includes("User rejected") ||
        errorMsg.includes("Invalid") ||
        errorMsg.includes("already in use")
      ) {
        throw err;
      }

      if (attempt < maxRetries - 1) {
        console.log(
          `[Retry ${attempt + 1}/${maxRetries}] Error: ${errorMsg.slice(0, 100)}`
        );
        console.log(`Retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
      }
    }
  }

  console.error(`All ${maxRetries} retry attempts failed`);
  throw lastError;
}

/**
 * Ensure wallet has sufficient balance for testing
 * Requests airdrop if needed (devnet/testnet only)
 */
export async function ensureSufficientBalance(
  provider: AnchorProvider,
  minBalanceSol: number = 2
): Promise<void> {
  const minBalanceLamports = minBalanceSol * LAMPORTS_PER_SOL;
  const balance = await provider.connection.getBalance(
    provider.wallet.publicKey
  );

  console.log(
    `\nWallet Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`
  );

  if (balance < minBalanceLamports) {
    const needed = minBalanceLamports - balance;
    console.log(
      `Insufficient balance. Need ${(needed / LAMPORTS_PER_SOL).toFixed(4)} more SOL`
    );
    console.log(`Requesting airdrop...`);

    try {
      // Devnet airdrop limit is typically 2-5 SOL per request
      const airdropAmount = Math.min(needed, 2 * LAMPORTS_PER_SOL);
      const airdropSig = await provider.connection.requestAirdrop(
        provider.wallet.publicKey,
        airdropAmount
      );

      console.log(`Airdrop signature: ${airdropSig}`);
      await provider.connection.confirmTransaction(airdropSig, "confirmed");

      const newBalance = await provider.connection.getBalance(
        provider.wallet.publicKey
      );
      console.log(
        `✅ Airdrop successful. New balance: ${(newBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`
      );

      // If still insufficient, request again
      if (newBalance < minBalanceLamports) {
        console.log(
          `Still insufficient. Requesting additional airdrop after delay...`
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await ensureSufficientBalance(provider, minBalanceSol);
      }
    } catch (err: any) {
      console.error(`❌ Airdrop failed: ${err.message}`);
      console.log(`Please fund wallet manually:`);
      console.log(`  solana airdrop 5 ${provider.wallet.publicKey} --url devnet`);
      throw new Error(
        `Insufficient balance and airdrop failed. Please fund wallet manually.`
      );
    }
  } else {
    console.log(`✅ Sufficient balance for testing\n`);
  }
}

/**
 * Check if running on devnet/testnet (not localnet)
 */
export function isRemoteCluster(provider: AnchorProvider): boolean {
  const endpoint = provider.connection.rpcEndpoint;
  return endpoint.includes("devnet") || endpoint.includes("testnet");
}

/**
 * Get cluster name for logging
 */
export function getClusterName(provider: AnchorProvider): string {
  const endpoint = provider.connection.rpcEndpoint;
  if (endpoint.includes("devnet")) return "devnet";
  if (endpoint.includes("testnet")) return "testnet";
  if (endpoint.includes("mainnet")) return "mainnet-beta";
  return "localnet";
}

/**
 * Sleep for specified milliseconds
 * Useful for rate limiting on public RPCs
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate expected rent for an account
 */
export async function calculateRent(
  provider: AnchorProvider,
  dataSize: number
): Promise<number> {
  return await provider.connection.getMinimumBalanceForRentExemption(dataSize);
}

/**
 * Log test environment info
 */
export async function logTestEnvironment(
  provider: AnchorProvider
): Promise<void> {
  const cluster = getClusterName(provider);
  const balance = await provider.connection.getBalance(
    provider.wallet.publicKey
  );
  const version = await provider.connection.getVersion();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Test Environment Info`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Cluster: ${cluster}`);
  console.log(`RPC Endpoint: ${provider.connection.rpcEndpoint}`);
  console.log(`Solana Version: ${version["solana-core"]}`);
  console.log(`Wallet: ${provider.wallet.publicKey.toBase58()}`);
  console.log(`Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log(`${"=".repeat(60)}\n`);
}

/**
 * Wrapper for RPC calls with automatic retry
 */
export async function withRpcRetry<T>(
  fn: () => Promise<T>,
  context: string = "RPC call"
): Promise<T> {
  return withRetry(fn, {
    maxRetries: 5,
    initialDelayMs: 500,
    maxDelayMs: 5000,
  }).catch((err) => {
    console.error(`${context} failed after retries: ${err.message}`);
    throw err;
  });
}
