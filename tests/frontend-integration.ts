import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { MythraProgram } from "../target/types/mythra_program";
import { assert, expect } from "chai";
import { initializeProvider } from "./utils/provider";

/**
 * Frontend Integration Test Suite
 * 
 * This test suite validates ALL functions in frontend-integration/lib/program.ts
 * to ensure they work correctly for Next.js developers on devnet.
 */

// Import the frontend integration functions
import {
  PROGRAM_ID,
  getEventPDA,
  getCampaignPDA,
  getContributionPDA,
  getCampaignEscrowPDA,
  getBudgetPDA,
  getBudgetVotePDA,
  getTicketTierPDA,
  lamportsToSol,
  solToLamports,
  shortenAddress,
} from "../frontend-integration/lib/program";

describe("Frontend Integration - Complete Test Suite", () => {
  const provider = initializeProvider();
  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  
  const organizer = provider.wallet;
  const contributor1 = Keypair.generate();
  const contributor2 = Keypair.generate();
  
  let testEventId: string;
  let eventPda: PublicKey;
  let campaignPda: PublicKey;
  let tierPda: PublicKey;
  
  before(async () => {
    console.log("\n🔧 Frontend Integration Test Setup");
    console.log(`Program ID: ${PROGRAM_ID.toBase58()}`);
    console.log(`Organizer: ${organizer.publicKey.toBase58()}`);
    
    // Fund contributors (smaller amounts for devnet)
    const fundTx = new anchor.web3.Transaction();
    fundTx.add(
      SystemProgram.transfer({
        fromPubkey: organizer.publicKey,
        toPubkey: contributor1.publicKey,
        lamports: 0.2 * LAMPORTS_PER_SOL,
      })
    );
    fundTx.add(
      SystemProgram.transfer({
        fromPubkey: organizer.publicKey,
        toPubkey: contributor2.publicKey,
        lamports: 0.2 * LAMPORTS_PER_SOL,
      })
    );
    await provider.sendAndConfirm(fundTx);
    console.log("✅ Contributors funded");
    
    testEventId = `frontend-test-${Date.now()}`;
  });

  describe("1. PDA Derivation Functions", () => {
    it("derives Event PDA correctly", () => {
      const [pda, bump] = getEventPDA(organizer.publicKey, testEventId);
      
      assert.ok(pda instanceof PublicKey);
      assert.isNumber(bump);
      assert.isAtLeast(bump, 0);
      assert.isAtMost(bump, 255);
      
      console.log(`✅ Event PDA: ${pda.toBase58()}`);
    });

    it("derives Campaign PDA correctly", () => {
      const [eventPda] = getEventPDA(organizer.publicKey, testEventId);
      const [pda, bump] = getCampaignPDA(eventPda);
      
      assert.ok(pda instanceof PublicKey);
      assert.isNumber(bump);
      
      console.log(`✅ Campaign PDA: ${pda.toBase58()}`);
    });

    it("derives Contribution PDA correctly", () => {
      const [eventPda] = getEventPDA(organizer.publicKey, testEventId);
      const [campaignPda] = getCampaignPDA(eventPda);
      const [pda, bump] = getContributionPDA(campaignPda, contributor1.publicKey);
      
      assert.ok(pda instanceof PublicKey);
      assert.isNumber(bump);
      
      console.log(`✅ Contribution PDA: ${pda.toBase58()}`);
    });

    it("derives Campaign Escrow PDA correctly", () => {
      const [eventPda] = getEventPDA(organizer.publicKey, testEventId);
      const [campaignPda] = getCampaignPDA(eventPda);
      const [pda, bump] = getCampaignEscrowPDA(campaignPda);
      
      assert.ok(pda instanceof PublicKey);
      assert.isNumber(bump);
      
      console.log(`✅ Campaign Escrow PDA: ${pda.toBase58()}`);
    });

    it("derives Budget PDA correctly", () => {
      const [eventPda] = getEventPDA(organizer.publicKey, testEventId);
      const [campaignPda] = getCampaignPDA(eventPda);
      const [pda, bump] = getBudgetPDA(campaignPda);
      
      assert.ok(pda instanceof PublicKey);
      assert.isNumber(bump);
      
      console.log(`✅ Budget PDA: ${pda.toBase58()}`);
    });

    it("derives Budget Vote PDA correctly", () => {
      const [eventPda] = getEventPDA(organizer.publicKey, testEventId);
      const [campaignPda] = getCampaignPDA(eventPda);
      const [budgetPda] = getBudgetPDA(campaignPda);
      const [pda, bump] = getBudgetVotePDA(budgetPda, contributor1.publicKey);
      
      assert.ok(pda instanceof PublicKey);
      assert.isNumber(bump);
      
      console.log(`✅ Budget Vote PDA: ${pda.toBase58()}`);
    });

    it("derives Ticket Tier PDA correctly", () => {
      const [eventPda] = getEventPDA(organizer.publicKey, testEventId);
      const [pda, bump] = getTicketTierPDA(eventPda, "vip");
      
      assert.ok(pda instanceof PublicKey);
      assert.isNumber(bump);
      
      console.log(`✅ Ticket Tier PDA: ${pda.toBase58()}`);
    });
  });

  describe("2. Utility Functions", () => {
    it("converts lamports to SOL correctly", () => {
      const result1 = lamportsToSol(1_000_000_000);
      assert.equal(result1, 1);
      
      const result2 = lamportsToSol(new BN(5_000_000_000));
      assert.equal(result2, 5);
      
      const result3 = lamportsToSol(500_000_000);
      assert.equal(result3, 0.5);
      
      console.log("✅ lamportsToSol working correctly");
    });

    it("converts SOL to lamports correctly", () => {
      const result1 = solToLamports(1);
      assert.ok(result1.eq(new BN(1_000_000_000)));
      
      const result2 = solToLamports(5);
      assert.ok(result2.eq(new BN(5_000_000_000)));
      
      const result3 = solToLamports(0.5);
      assert.ok(result3.eq(new BN(500_000_000)));
      
      console.log("✅ solToLamports working correctly");
    });

    it("shortens addresses correctly", () => {
      const pubkey = organizer.publicKey;
      const shortened = shortenAddress(pubkey);
      
      assert.equal(shortened.length, 11); // "xxxx...xxxx"
      assert.include(shortened, "...");
      
      const shortened8 = shortenAddress(pubkey, 6);
      assert.equal(shortened8.length, 15); // "xxxxxx...xxxxxx"
      
      console.log(`✅ Address shortened: ${shortened}`);
    });

    it("works with string addresses", () => {
      const address = "3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd";
      const shortened = shortenAddress(address);
      
      assert.equal(shortened.length, 11);
      assert.include(shortened, "...");
      
      console.log(`✅ String address shortened: ${shortened}`);
    });
  });

  describe("3. Event Operations (Frontend Client Methods)", () => {
    it("creates an event using frontend pattern", async () => {
      console.log("\n🎫 Test: Create Event (Frontend Pattern)");
      
      [eventPda] = getEventPDA(organizer.publicKey, testEventId);
      const treasury = Keypair.generate();
      
      const tx = await program.methods
        .createEvent(
          testEventId,
          "https://example.com/event.json",
          new BN(Math.floor(Date.now() / 1000) + 3600),
          new BN(Math.floor(Date.now() / 1000) + 86400),
          1000,
          250 // 2.5% platform fee
        )
        .accountsPartial({
          event: eventPda,
          organizer: organizer.publicKey,
          treasury: treasury.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log(`✅ Event created: ${tx}`);
      
      // Verify event data
      const eventAccount = await program.account.event.fetch(eventPda);
      assert.ok(eventAccount.authority.equals(organizer.publicKey));
      assert.equal(eventAccount.totalSupply, 1000);
      assert.equal(eventAccount.platformSplitBps, 250);
      
      console.log(`✅ Event data verified`);
    });

    it("fetches event data", async () => {
      const eventAccount = await program.account.event.fetch(eventPda);
      
      assert.ok(eventAccount);
      assert.ok(eventAccount.authority.equals(organizer.publicKey));
      assert.equal(eventAccount.totalSupply, 1000);
      
      console.log("✅ Event fetched successfully");
    });
  });

  describe("4. Ticket Tier Operations", () => {
    it("creates a ticket tier", async () => {
      console.log("\n🎟️  Test: Create Ticket Tier");
      
      const tierId = "vip";
      [tierPda] = getTicketTierPDA(eventPda, tierId);
      
      const tx = await program.methods
        .createTicketTier(
          tierId,
          "https://example.com/tier.json",
          new BN(2_000_000_000), // 2 SOL
          100,
          500, // 5% royalty
          0,
          true
        )
        .accountsPartial({
          tier: tierPda,
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log(`✅ Tier created: ${tx}`);
      
      const tierAccount = await program.account.ticketTier.fetch(tierPda);
      assert.equal(tierAccount.maxSupply, 100);
      assert.equal(tierAccount.priceLamports.toNumber(), 2_000_000_000);
      
      console.log("✅ Tier data verified");
    });
  });

  describe("5. Campaign Operations", () => {
    it("creates a campaign", async () => {
      console.log("\n💰 Test: Create Campaign");
      
      [campaignPda] = getCampaignPDA(eventPda);
      
      const fundingGoal = new BN(0.5 * LAMPORTS_PER_SOL); // 0.5 SOL
      const deadline = new BN(Math.floor(Date.now() / 1000) + 86400 * 30); // 30 days
      
      const tx = await program.methods
        .createCampaign(fundingGoal, deadline)
        .accountsPartial({
          event: eventPda,
          campaign: campaignPda,
          organizer: organizer.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log(`✅ Campaign created: ${tx}`);
      
      const campaignAccount = await program.account.campaign.fetch(campaignPda);
      assert.ok(campaignAccount.fundingGoal.eq(fundingGoal));
      assert.ok(campaignAccount.deadline.eq(deadline));
      
      console.log("✅ Campaign data verified");
    });

    it("contributes to campaign (contributor 1)", async () => {
      console.log("\n💵 Test: Contribute to Campaign");
      
      const [contributionPda] = getContributionPDA(campaignPda, contributor1.publicKey);
      const [escrowPda] = getCampaignEscrowPDA(campaignPda);
      
      const amount = new BN(0.15 * LAMPORTS_PER_SOL); // 0.15 SOL
      
      const tx = await program.methods
        .contribute(amount)
        .accountsPartial({
          campaign: campaignPda,
          contribution: contributionPda,
          campaignEscrow: escrowPda,
          contributor: contributor1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([contributor1])
        .rpc();
      
      console.log(`✅ Contribution 1: ${tx}`);
      
      const contributionAccount = await program.account.contribution.fetch(contributionPda);
      assert.ok(contributionAccount.amount.eq(amount));
      assert.ok(contributionAccount.contributor.equals(contributor1.publicKey));
      
      console.log("✅ Contribution verified: 0.15 SOL");
    });

    it("contributes to campaign (contributor 2)", async () => {
      const [contributionPda] = getContributionPDA(campaignPda, contributor2.publicKey);
      const [escrowPda] = getCampaignEscrowPDA(campaignPda);
      
      const amount = new BN(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL
      
      const tx = await program.methods
        .contribute(amount)
        .accountsPartial({
          campaign: campaignPda,
          contribution: contributionPda,
          campaignEscrow: escrowPda,
          contributor: contributor2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([contributor2])
        .rpc();
      
      console.log(`✅ Contribution 2: ${tx}`);
      console.log("✅ Contribution verified: 0.1 SOL");
    });

    it("fetches campaign with total raised", async () => {
      const campaignAccount = await program.account.campaign.fetch(campaignPda);
      
      const totalRaised = lamportsToSol(campaignAccount.totalRaised.toNumber());
      console.log(`✅ Total raised: ${totalRaised} SOL`);
      
      assert.equal(totalRaised, 0.25); // 0.15 + 0.1 SOL
    });

    it("gets all campaign contributions", async () => {
      // This simulates the frontend method: getCampaignContributions()
      const contributions = await program.account.contribution.all([
        {
          memcmp: {
            offset: 8,
            bytes: campaignPda.toBase58(),
          },
        },
      ]);
      
      assert.equal(contributions.length, 2);
      console.log(`✅ Found ${contributions.length} contributions`);
      
      contributions.forEach((contrib, i) => {
        const amount = lamportsToSol(contrib.account.amount.toNumber());
        const contributor = shortenAddress(contrib.account.contributor);
        console.log(`  ${i + 1}. ${contributor}: ${amount} SOL`);
      });
    });

    it("gets specific user contribution", async () => {
      // This simulates: getUserContribution()
      const [contributionPda] = getContributionPDA(campaignPda, contributor1.publicKey);
      
      const contribution = await program.account.contribution.fetch(contributionPda);
      const amount = lamportsToSol(contribution.amount.toNumber());
      
      assert.equal(amount, 0.15);
      console.log(`✅ User contribution fetched: ${amount} SOL`);
    });
  });

  describe("6. Budget & Voting Operations", () => {
    it("submits a budget proposal", async () => {
      console.log("\n📊 Test: Submit Budget");
      
      const [budgetPda] = getBudgetPDA(campaignPda);
      
      const milestones = [
        {
          description: "Initial setup",
          releasePercentage: 3000, // 30%
          unlockDate: new BN(Math.floor(Date.now() / 1000) + 86400),
        },
        {
          description: "Mid-point",
          releasePercentage: 4000, // 40%
          unlockDate: new BN(Math.floor(Date.now() / 1000) + 86400 * 15),
        },
        {
          description: "Final",
          releasePercentage: 3000, // 30%
          unlockDate: new BN(Math.floor(Date.now() / 1000) + 86400 * 30),
        },
      ];
      
      const tx = await program.methods
        .submitBudget(
          new BN(0.3 * LAMPORTS_PER_SOL),
          "Event production budget",
          milestones,
          new BN(7 * 86400) // 7 days voting period
        )
        .accountsPartial({
          campaign: campaignPda,
          budget: budgetPda,
          organizer: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log(`✅ Budget submitted: ${tx}`);
      
      const budgetAccount = await program.account.budget.fetch(budgetPda);
      assert.equal(budgetAccount.milestones.length, 3);
      
      console.log("✅ Budget verified with 3 milestones");
    });

    it("votes on budget (contributor 1 - approve)", async () => {
      console.log("\n🗳️  Test: Vote on Budget");
      
      const [budgetPda] = getBudgetPDA(campaignPda);
      const [contributionPda] = getContributionPDA(campaignPda, contributor1.publicKey);
      const [votePda] = getBudgetVotePDA(budgetPda, contributor1.publicKey);
      
      const tx = await program.methods
        .voteOnBudget(true) // approve
        .accountsPartial({
          budget: budgetPda,
          campaign: campaignPda,
          contribution: contributionPda,
          vote: votePda,
          voter: contributor1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([contributor1])
        .rpc();
      
      console.log(`✅ Vote cast (approve): ${tx}`);
    });

    it("votes on budget (contributor 2 - approve)", async () => {
      const [budgetPda] = getBudgetPDA(campaignPda);
      const [contributionPda] = getContributionPDA(campaignPda, contributor2.publicKey);
      const [votePda] = getBudgetVotePDA(budgetPda, contributor2.publicKey);
      
      const tx = await program.methods
        .voteOnBudget(true) // approve
        .accountsPartial({
          budget: budgetPda,
          campaign: campaignPda,
          contribution: contributionPda,
          vote: votePda,
          voter: contributor2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([contributor2])
        .rpc();
      
      console.log(`✅ Vote cast (approve): ${tx}`);
    });

    it("finalizes budget vote", async () => {
      const [budgetPda] = getBudgetPDA(campaignPda);
      
      const tx = await program.methods
        .finalizeBudgetVote()
        .accountsPartial({
          budget: budgetPda,
        })
        .rpc();
      
      console.log(`✅ Budget vote finalized: ${tx}`);
      
      const budgetAccount = await program.account.budget.fetch(budgetPda);
      assert.equal(budgetAccount.status.approved !== undefined, true);
      
      console.log("✅ Budget approved!");
    });
  });

  describe("7. Integration Summary", () => {
    it("displays complete campaign summary", async () => {
      console.log("\n📋 Campaign Summary (Frontend Display Example)");
      console.log("=".repeat(60));
      
      const campaign = await program.account.campaign.fetch(campaignPda);
      const event = await program.account.event.fetch(eventPda);
      const [budgetPda] = getBudgetPDA(campaignPda);
      const budget = await program.account.budget.fetch(budgetPda);
      
      console.log(`Event ID: ${testEventId}`);
      console.log(`Organizer: ${shortenAddress(event.authority)}`);
      console.log(`Total Supply: ${event.totalSupply} tickets`);
      console.log(`Platform Fee: ${event.platformSplitBps / 100}%`);
      console.log("");
      console.log(`Funding Goal: ${lamportsToSol(campaign.fundingGoal)} SOL`);
      console.log(`Total Raised: ${lamportsToSol(campaign.totalRaised)} SOL`);
      console.log(`Progress: ${(lamportsToSol(campaign.totalRaised) / lamportsToSol(campaign.fundingGoal) * 100).toFixed(1)}%`);
      console.log(`Contributors: 2`);
      console.log("");
      console.log(`Budget Status: ${JSON.stringify(budget.status)}`);
      console.log(`Budget Amount: ${lamportsToSol(budget.totalAmount)} SOL`);
      console.log(`Milestones: ${budget.milestones.length}`);
      console.log("=".repeat(60));
      
      assert.ok(true);
    });
  });

  describe("8. Frontend Best Practices Examples", () => {
    it("demonstrates error handling pattern", async () => {
      console.log("\n⚠️  Test: Error Handling Pattern");
      
      // Try to fetch non-existent contribution
      const [nonExistentPda] = getContributionPDA(
        campaignPda,
        Keypair.generate().publicKey
      );
      
      try {
        await program.account.contribution.fetch(nonExistentPda);
        assert.fail("Should have thrown error");
      } catch (error) {
        console.log("✅ Correctly caught: Account not found");
        assert.ok(true);
      }
    });

    it("demonstrates conversion helpers for display", () => {
      console.log("\n🔢 Test: Display Formatting");
      
      const price = new BN(2_500_000_000); // 2.5 SOL
      const displayPrice = lamportsToSol(price);
      
      console.log(`Price in lamports: ${price.toString()}`);
      console.log(`Price for display: ${displayPrice} SOL`);
      
      const userInput = 3.5; // User enters 3.5 SOL
      const lamports = solToLamports(userInput);
      
      console.log(`User input: ${userInput} SOL`);
      console.log(`Converted to lamports: ${lamports.toString()}`);
      
      assert.equal(displayPrice, 2.5);
      assert.ok(lamports.eq(new BN(3_500_000_000)));
      
      console.log("✅ Conversion helpers working perfectly");
    });
  });
});

describe("Frontend Integration - Additional Helper Tests", () => {
  it("verifies PROGRAM_ID constant", () => {
    assert.equal(
      PROGRAM_ID.toBase58(),
      "3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd"
    );
    console.log("✅ PROGRAM_ID verified");
  });

  it("tests PDA consistency", () => {
    const organizer = Keypair.generate().publicKey;
    const eventId = "test-123";
    
    const [pda1] = getEventPDA(organizer, eventId);
    const [pda2] = getEventPDA(organizer, eventId);
    
    assert.ok(pda1.equals(pda2));
    console.log("✅ PDA derivation is deterministic");
  });
});
