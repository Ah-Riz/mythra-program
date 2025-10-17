/**
 * Provider setup that reads from .env configuration
 * This ensures tests use the custom RPC URL (e.g., Helius) instead of public endpoints
 */

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import { config } from "./config";
import * as fs from "fs";
import * as os from "os";

/**
 * Load wallet from file path
 */
function loadWallet(walletPath: string): Keypair {
  // Expand ~ to home directory
  const expandedPath = walletPath.replace(/^~/, os.homedir());
  
  try {
    const keypairData = JSON.parse(fs.readFileSync(expandedPath, "utf-8"));
    return Keypair.fromSecretKey(new Uint8Array(keypairData));
  } catch (error) {
    throw new Error(
      `Failed to load wallet from ${expandedPath}: ${error.message}`
    );
  }
}

/**
 * Create a provider using configuration from .env
 * This provider will use the custom RPC URL (e.g., Helius) to avoid rate limits
 */
export function getProvider(): AnchorProvider {
  console.log(`\n🔧 Creating provider with custom configuration...`);
  console.log(`   Network: ${config.network}`);
  console.log(`   RPC URL: ${config.rpcUrl}`);
  
  // Create connection with custom RPC URL
  const connection = new Connection(config.rpcUrl, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000, // 60 seconds
  });

  // Load wallet
  const wallet = new Wallet(loadWallet(config.walletPath));

  // Create provider
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
    skipPreflight: config.skipPreflight,
  });

  console.log(`   Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`✅ Provider created successfully\n`);

  return provider;
}

/**
 * Initialize provider and set as default for Anchor
 */
export function initializeProvider(): AnchorProvider {
  const provider = getProvider();
  anchor.setProvider(provider);
  return provider;
}
