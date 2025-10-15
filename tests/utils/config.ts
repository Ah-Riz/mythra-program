import * as dotenv from "dotenv";
import { clusterApiUrl } from "@solana/web3.js";
import * as path from "path";

// Load environment variables from project root
dotenv.config({ path: path.join(process.cwd(), ".env") });

export type SolanaNetwork = "localnet" | "devnet" | "testnet" | "mainnet-beta";

export interface Config {
  network: SolanaNetwork;
  rpcUrl: string;
  walletPath: string;
  programId: string;
  testTimeout: number;
  skipPreflight: boolean;
  airdropAmount: number;
  minBalance: number;
  debug: boolean;
  logLevel: string;
}

/**
 * Get the RPC URL for the specified network
 */
function getRpcUrl(network: SolanaNetwork): string {
  const envKey = `${network.toUpperCase().replace("-", "_")}_RPC_URL`;
  const envUrl = process.env[envKey];

  if (envUrl) {
    return envUrl;
  }

  // Check for Helius API key
  if (process.env.HELIUS_API_KEY) {
    return `https://${network}.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  }

  // Check for Quicknode endpoint
  if (process.env.QUICKNODE_ENDPOINT) {
    return process.env.QUICKNODE_ENDPOINT;
  }

  // Default RPC URLs
  if (network === "localnet") {
    return "http://127.0.0.1:8899";
  }

  return clusterApiUrl(network);
}

/**
 * Get the program ID for the specified network
 */
function getProgramId(network: SolanaNetwork): string {
  const envKey = `${network.toUpperCase().replace("-", "_")}_PROGRAM_ID`;
  const programId = process.env[envKey];

  if (!programId) {
    throw new Error(
      `Program ID not found for network: ${network}. Please set ${envKey} in .env`
    );
  }

  return programId;
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  const network = (process.env.SOLANA_NETWORK || "localnet") as SolanaNetwork;

  return {
    network,
    rpcUrl: getRpcUrl(network),
    walletPath: process.env.WALLET_PATH || "~/.config/solana/id.json",
    programId: getProgramId(network),
    testTimeout: parseInt(process.env.TEST_TIMEOUT || "1000000", 10),
    skipPreflight: process.env.SKIP_PREFLIGHT === "true",
    airdropAmount: parseInt(process.env.AIRDROP_AMOUNT || "5", 10),
    minBalance: parseInt(process.env.MIN_BALANCE || "2", 10),
    debug: process.env.DEBUG === "true",
    logLevel: process.env.LOG_LEVEL || "info",
  };
}

/**
 * Get the current configuration
 */
export const config = loadConfig();

/**
 * Check if running on a remote cluster (not localnet)
 */
export function isRemoteCluster(): boolean {
  return config.network !== "localnet";
}

/**
 * Check if running on devnet
 */
export function isDevnet(): boolean {
  return config.network === "devnet";
}

/**
 * Check if running on mainnet
 */
export function isMainnet(): boolean {
  return config.network === "mainnet-beta";
}

/**
 * Log configuration (without sensitive data)
 */
export function logConfig(): void {
  console.log("\n========================================");
  console.log("Configuration");
  console.log("========================================");
  console.log(`Network: ${config.network}`);
  console.log(`RPC URL: ${config.rpcUrl}`);
  console.log(`Program ID: ${config.programId}`);
  console.log(`Wallet Path: ${config.walletPath}`);
  console.log(`Debug Mode: ${config.debug}`);
  console.log("========================================\n");
}
