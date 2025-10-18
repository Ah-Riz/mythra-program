/**
 * Mythra Platform - Program Connection Library
 * 
 * This file provides the core functionality to connect to the deployed
 * Mythra program on Solana devnet from a Next.js frontend.
 */

import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { AnchorWallet } from '@solana/wallet-adapter-react';

/**
 * Deployed Program ID on Devnet
 */
export const PROGRAM_ID = new PublicKey('3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd');

/**
 * Devnet RPC endpoint
 * You can replace this with Helius, QuickNode, or other providers for better performance
 */
export const DEVNET_ENDPOINT = 'https://api.devnet.solana.com';

/**
 * Program Interface Type
 * Import your generated types from target/types/mythra_program.ts
 */
export type MythraProgram = any; // Replace with actual type

/**
 * Initialize the Mythra program instance
 * 
 * @param connection - Solana connection instance
 * @param wallet - Connected wallet adapter
 * @param idl - Program IDL (import from target/idl/mythra_program.json)
 * @returns Program instance
 */
export function getProgram(
  connection: Connection,
  wallet: AnchorWallet,
  idl: any
): Program<MythraProgram> {
  const provider = new AnchorProvider(
    connection,
    wallet,
    { 
      commitment: 'confirmed',
      preflightCommitment: 'confirmed'
    }
  );
  
  return new Program<MythraProgram>(
    idl,
    PROGRAM_ID,
    provider
  );
}

/**
 * PDA Derivation Functions
 * These functions help you derive Program Derived Addresses
 */

export function getEventPDA(
  organizer: PublicKey,
  eventId: string
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('event'),
      organizer.toBuffer(),
      Buffer.from(eventId)
    ],
    PROGRAM_ID
  );
}

export function getCampaignPDA(
  eventPda: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('campaign'),
      eventPda.toBuffer()
    ],
    PROGRAM_ID
  );
}

export function getContributionPDA(
  campaignPda: PublicKey,
  contributor: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('contribution'),
      campaignPda.toBuffer(),
      contributor.toBuffer()
    ],
    PROGRAM_ID
  );
}

export function getCampaignEscrowPDA(
  campaignPda: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('campaign_escrow'),
      campaignPda.toBuffer()
    ],
    PROGRAM_ID
  );
}

export function getBudgetPDA(
  campaignPda: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('budget'),
      campaignPda.toBuffer()
    ],
    PROGRAM_ID
  );
}

export function getBudgetVotePDA(
  budgetPda: PublicKey,
  voter: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('budget_vote'),
      budgetPda.toBuffer(),
      voter.toBuffer()
    ],
    PROGRAM_ID
  );
}

export function getTicketTierPDA(
  eventPda: PublicKey,
  tierId: string
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('tier'),
      eventPda.toBuffer(),
      Buffer.from(tierId)
    ],
    PROGRAM_ID
  );
}

/**
 * Instruction Builder Class
 * Provides a clean interface for building transactions
 */
export class MythraClient {
  program: Program<MythraProgram>;
  connection: Connection;
  wallet: AnchorWallet;

  constructor(connection: Connection, wallet: AnchorWallet, idl: any) {
    this.connection = connection;
    this.wallet = wallet;
    this.program = getProgram(connection, wallet, idl);
  }

  // ===== EVENT OPERATIONS =====

  async createEvent(params: {
    eventId: string;
    metadataUri: string;
    startTs: number;
    endTs: number;
    totalSupply: number;
    platformSplitBps: number;
    treasury: PublicKey;
  }) {
    const [eventPda] = getEventPDA(this.wallet.publicKey, params.eventId);

    return await this.program.methods
      .createEvent(
        params.eventId,
        params.metadataUri,
        new anchor.BN(params.startTs),
        new anchor.BN(params.endTs),
        params.totalSupply,
        params.platformSplitBps
      )
      .accountsPartial({
        event: eventPda,
        organizer: this.wallet.publicKey,
        treasury: params.treasury,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async getEvent(organizer: PublicKey, eventId: string) {
    const [eventPda] = getEventPDA(organizer, eventId);
    return await this.program.account.event.fetch(eventPda);
  }

  // ===== CAMPAIGN OPERATIONS =====

  async createCampaign(params: {
    eventId: string;
    fundingGoal: number; // in SOL
    deadline: number; // unix timestamp
  }) {
    const [eventPda] = getEventPDA(this.wallet.publicKey, params.eventId);
    const [campaignPda] = getCampaignPDA(eventPda);

    const goalInLamports = new anchor.BN(params.fundingGoal * anchor.web3.LAMPORTS_PER_SOL);

    return await this.program.methods
      .createCampaign(goalInLamports, new anchor.BN(params.deadline))
      .accountsPartial({
        event: eventPda,
        campaign: campaignPda,
        organizer: this.wallet.publicKey,
        authority: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async contribute(params: {
    organizer: PublicKey;
    eventId: string;
    amount: number; // in SOL
  }) {
    const [eventPda] = getEventPDA(params.organizer, params.eventId);
    const [campaignPda] = getCampaignPDA(eventPda);
    const [contributionPda] = getContributionPDA(campaignPda, this.wallet.publicKey);
    const [escrowPda] = getCampaignEscrowPDA(campaignPda);

    const amountInLamports = new anchor.BN(params.amount * anchor.web3.LAMPORTS_PER_SOL);

    return await this.program.methods
      .contribute(amountInLamports)
      .accountsPartial({
        campaign: campaignPda,
        contribution: contributionPda,
        campaignEscrow: escrowPda,
        contributor: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async getCampaign(organizer: PublicKey, eventId: string) {
    const [eventPda] = getEventPDA(organizer, eventId);
    const [campaignPda] = getCampaignPDA(eventPda);
    return await this.program.account.campaign.fetch(campaignPda);
  }

  // ===== BUDGET & VOTING =====

  async submitBudget(params: {
    eventId: string;
    amount: number; // in SOL
    description: string;
    milestones: Array<{
      description: string;
      releasePercentage: number; // basis points (5000 = 50%)
      unlockDate: number; // unix timestamp
    }>;
    votingPeriod: number; // in seconds
  }) {
    const [eventPda] = getEventPDA(this.wallet.publicKey, params.eventId);
    const [campaignPda] = getCampaignPDA(eventPda);
    const [budgetPda] = getBudgetPDA(campaignPda);

    const amountInLamports = new anchor.BN(params.amount * anchor.web3.LAMPORTS_PER_SOL);

    return await this.program.methods
      .submitBudget(
        amountInLamports,
        params.description,
        params.milestones,
        new anchor.BN(params.votingPeriod)
      )
      .accountsPartial({
        campaign: campaignPda,
        budget: budgetPda,
        organizer: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async voteOnBudget(params: {
    organizer: PublicKey;
    eventId: string;
    approve: boolean;
  }) {
    const [eventPda] = getEventPDA(params.organizer, params.eventId);
    const [campaignPda] = getCampaignPDA(eventPda);
    const [budgetPda] = getBudgetPDA(campaignPda);
    const [contributionPda] = getContributionPDA(campaignPda, this.wallet.publicKey);
    const [votePda] = getBudgetVotePDA(budgetPda, this.wallet.publicKey);

    return await this.program.methods
      .voteOnBudget(params.approve)
      .accountsPartial({
        budget: budgetPda,
        campaign: campaignPda,
        contribution: contributionPda,
        vote: votePda,
        voter: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  // ===== PROFIT DISTRIBUTION =====

  async claimBackerProfit(params: {
    organizer: PublicKey;
    eventId: string;
  }) {
    const [eventPda] = getEventPDA(params.organizer, params.eventId);
    const [campaignPda] = getCampaignPDA(eventPda);
    const [contributionPda] = getContributionPDA(campaignPda, this.wallet.publicKey);
    const [escrowPda] = getCampaignEscrowPDA(campaignPda);

    return await this.program.methods
      .claimBackerProfit()
      .accountsPartial({
        campaign: campaignPda,
        contribution: contributionPda,
        campaignEscrow: escrowPda,
        contributor: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async claimOrganizerProfit(params: {
    eventId: string;
  }) {
    const [eventPda] = getEventPDA(this.wallet.publicKey, params.eventId);
    const [campaignPda] = getCampaignPDA(eventPda);
    const [escrowPda] = getCampaignEscrowPDA(campaignPda);

    return await this.program.methods
      .claimOrganizerProfit()
      .accountsPartial({
        campaign: campaignPda,
        campaignEscrow: escrowPda,
        organizer: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  // ===== UTILITY FUNCTIONS =====

  /**
   * Get all contributions for a campaign
   */
  async getCampaignContributions(organizer: PublicKey, eventId: string) {
    const [eventPda] = getEventPDA(organizer, eventId);
    const [campaignPda] = getCampaignPDA(eventPda);

    // Fetch all contribution accounts for this campaign
    const contributions = await this.program.account.contribution.all([
      {
        memcmp: {
          offset: 8, // After discriminator
          bytes: campaignPda.toBase58(),
        },
      },
    ]);

    return contributions;
  }

  /**
   * Get user's contribution to a campaign
   */
  async getUserContribution(
    organizer: PublicKey,
    eventId: string,
    contributor: PublicKey
  ) {
    const [eventPda] = getEventPDA(organizer, eventId);
    const [campaignPda] = getCampaignPDA(eventPda);
    const [contributionPda] = getContributionPDA(campaignPda, contributor);

    try {
      return await this.program.account.contribution.fetch(contributionPda);
    } catch {
      return null; // User hasn't contributed yet
    }
  }
}

/**
 * Helper function to convert lamports to SOL
 */
export function lamportsToSol(lamports: number | anchor.BN): number {
  const value = typeof lamports === 'number' ? lamports : lamports.toNumber();
  return value / anchor.web3.LAMPORTS_PER_SOL;
}

/**
 * Helper function to convert SOL to lamports
 */
export function solToLamports(sol: number): anchor.BN {
  return new anchor.BN(sol * anchor.web3.LAMPORTS_PER_SOL);
}

/**
 * Format public key for display
 */
export function shortenAddress(address: PublicKey | string, chars = 4): string {
  const addr = typeof address === 'string' ? address : address.toString();
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}
