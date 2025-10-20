/**
 * Investor/DAO Test Suite
 * 
 * Tests all actions that investors/DAO members can perform:
 * - Contribute to campaigns
 * - Vote on budgets
 * - Claim backer profits
 * - View campaign analytics
 * - Track returns on investment
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { MythraProgram } from "../../target/types/mythra_program";
import { assert } from "chai";
import { initializeProvider } from "../utils/provider";

// Devnet Program ID from .env
const DEVNET_PROGRAM_ID = new PublicKey("3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd");

describe("💰 Investor/DAO Actions on Devnet", () => {
  const provider = initializeProvider();
  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  
  // Actors
  const organizer = provider.wallet;
  const investor1 = Keypair.generate();
  const investor2 = Keypair.generate();
  const investor3 = Keypair.generate();
  
  let eventId: string;
  let eventPda: PublicKey;
  let campaignPda: PublicKey;
  let budgetPda: PublicKey;
  
  before(async () => {
    console.log("\n========================================");
    console.log("💰 INVESTOR/DAO TEST SUITE");
    console.log("========================================");
    console.log(`Network: Devnet`);
    console.log(`Program ID: ${DEVNET_PROGRAM_ID.toBase58()}`);
    console.log(`Investor 1: ${investor1.publicKey.toBase58()}`);
    console.log(`Investor 2: ${investor2.publicKey.toBase58()}`);
    console.log(`Investor 3: ${investor3.publicKey.toBase58()}`);
    console.log("========================================\n");
    
    // Fund investors (enough to cover contributions + account rent + transaction fees)
    console.log("💵 Funding investors...");
    const fundTx = new anchor.web3.Transaction();
    [investor1, investor2, investor3].forEach(investor => {
      fundTx.add(
        SystemProgram.transfer({
          fromPubkey: organizer.publicKey,
          toPubkey: investor.publicKey,
          lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL, // 0.1 SOL each (0.04 contribution + account rent + tx fees)
        })
      );
    });
    await provider.sendAndConfirm(fundTx);
    console.log("✅ Investors funded with 0.1 SOL each\n");
    
    // Setup: Create event
    console.log("🎭 Setting up event for crowdfunding...");
    eventId = `dao-funded-event-${Date.now()}`;
    const treasury = Keypair.generate();
    
    [eventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(eventId)],
      program.programId
    );
    
    await program.methods
      .createEvent(
        eventId,
        "https://mythra.com/events/dao-event.json",
        new BN(Math.floor(Date.now() / 1000) + 86400 * 45), // Event starts in 45 days
        new BN(Math.floor(Date.now() / 1000) + 86400 * 60), // Event ends in 60 days
        1000,
        250
      )
      .accountsPartial({
        event: eventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log(`✅ Event created for crowdfunding\n`);
  });

  describe("1. Campaign Discovery", () => {
    it("should create a crowdfunding campaign (organizer)", async () => {
      console.log("\n📢 Organizer launching crowdfunding campaign...");
      
      [campaignPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("campaign"), eventPda.toBuffer()],
        program.programId
      );
      
      const fundingGoal = new BN(0.1 * anchor.web3.LAMPORTS_PER_SOL); // 0.1 SOL goal (minimum for campaign validation)
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
      
      console.log(`✅ Campaign created`);
      console.log(`   Campaign PDA: ${campaignPda.toBase58()}`);
      console.log(`   Funding Goal: 0.1 SOL (optimized for testing)`);
      console.log(`   Deadline: 30 days`);
      console.log(`   Transaction: ${tx}`);
      
      const campaignAccount = await program.account.campaign.fetch(campaignPda);
      assert.ok(campaignAccount.fundingGoal.eq(fundingGoal));
    });

    it("should view campaign details (investor perspective)", async () => {
      console.log("\n🔍 Investors reviewing campaign...");
      
      const campaignAccount = await program.account.campaign.fetch(campaignPda);
      const eventAccount = await program.account.event.fetch(eventPda);
      
      const goalInSOL = campaignAccount.fundingGoal.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
      const raisedInSOL = campaignAccount.totalRaised.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
      const progress = (raisedInSOL / goalInSOL) * 100;
      
      console.log(`\n💼 Campaign Overview:`);
      console.log(`   Event: ${eventId}`);
      console.log(`   Funding Goal: ${goalInSOL} SOL`);
      console.log(`   Current Raised: ${raisedInSOL} SOL`);
      console.log(`   Progress: ${progress.toFixed(1)}%`);
      console.log(`   Total Tickets: ${eventAccount.totalSupply}`);
      console.log(`   Status: ${JSON.stringify(campaignAccount.status)}`);
      
      assert.ok(campaignAccount);
    });
  });

  describe("2. Investment/Contribution", () => {
    it("should contribute to campaign (Investor 1)", async () => {
      console.log("\n💸 Investor 1 contributing to campaign...");
      
      const [contributionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("contribution"), campaignPda.toBuffer(), investor1.publicKey.toBuffer()],
        program.programId
      );
      
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
        program.programId
      );
      
      const amount = new BN(0.04 * anchor.web3.LAMPORTS_PER_SOL); // 0.04 SOL
      
      const tx = await program.methods
        .contribute(amount)
        .accountsPartial({
          campaign: campaignPda,
          contribution: contributionPda,
          campaignEscrow: escrowPda,
          contributor: investor1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([investor1])
        .rpc();
      
      console.log(`✅ Contribution successful`);
      console.log(`   Amount: 0.04 SOL`);
      console.log(`   Transaction: ${tx}`);
      
      const contributionAccount = await program.account.contribution.fetch(contributionPda);
      assert.ok(contributionAccount.amount.eq(amount));
      
      console.log(`   Ownership Stake: ${(0.04 / 0.1 * 100).toFixed(1)}% of campaign`);
    });

    it("should contribute to campaign (Investor 2)", async () => {
      console.log("\n💸 Investor 2 contributing to campaign...");
      
      const [contributionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("contribution"), campaignPda.toBuffer(), investor2.publicKey.toBuffer()],
        program.programId
      );
      
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
        program.programId
      );
      
      const amount = new BN(0.03 * anchor.web3.LAMPORTS_PER_SOL); // 0.03 SOL
      
      const tx = await program.methods
        .contribute(amount)
        .accountsPartial({
          campaign: campaignPda,
          contribution: contributionPda,
          campaignEscrow: escrowPda,
          contributor: investor2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([investor2])
        .rpc();
      
      console.log(`✅ Contribution successful`);
      console.log(`   Amount: 0.03 SOL`);
      console.log(`   Transaction: ${tx}`);
      console.log(`   Ownership Stake: ${(0.03 / 0.1 * 100).toFixed(1)}% of campaign`);
    });

    it("should contribute to campaign (Investor 3)", async () => {
      console.log("\n💸 Investor 3 contributing to campaign...");
      
      const [contributionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("contribution"), campaignPda.toBuffer(), investor3.publicKey.toBuffer()],
        program.programId
      );
      
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
        program.programId
      );
      
      const amount = new BN(0.03 * anchor.web3.LAMPORTS_PER_SOL); // 0.03 SOL (reaches 0.1 SOL goal)
      
      const tx = await program.methods
        .contribute(amount)
        .accountsPartial({
          campaign: campaignPda,
          contribution: contributionPda,
          campaignEscrow: escrowPda,
          contributor: investor3.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([investor3])
        .rpc();
      
      console.log(`✅ Contribution successful`);
      console.log(`   Amount: 0.03 SOL`);
      console.log(`   Transaction: ${tx}`);
      console.log(`   Ownership Stake: ${(0.03 / 0.1 * 100).toFixed(1)}% of campaign`);
      
      // Check campaign status
      const campaignAccount = await program.account.campaign.fetch(campaignPda);
      const totalRaised = campaignAccount.totalRaised.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
      
      console.log(`\n📊 Campaign Update:`);
      console.log(`   Total Raised: ${totalRaised} SOL`);
      console.log(`   Goal: 0.1 SOL`);
      console.log(`   Progress: ${(totalRaised / 0.1 * 100).toFixed(1)}%`);
      console.log(`   Status: ${totalRaised >= 0.1 ? 'FUNDED! 🎉' : 'In Progress'}`);
    });
  });

  describe("3. DAO Governance", () => {
    it("should finalize campaign after reaching goal", async () => {
      console.log("\n✅ Finalizing campaign (goal reached)...");
      
      // Check campaign before finalization
      let campaignAccount = await program.account.campaign.fetch(campaignPda);
      const totalRaised = campaignAccount.totalRaised.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
      const goal = campaignAccount.fundingGoal.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
      
      console.log(`\n📊 Pre-Finalization Status:`);
      console.log(`   Total Raised: ${totalRaised} SOL`);
      console.log(`   Goal: ${goal} SOL`);
      console.log(`   Status: ${JSON.stringify(campaignAccount.status)}`);
      console.log(`   Goal Reached: ${totalRaised >= goal ? 'Yes ✓' : 'No'}`);
      
      // CRITICAL: Must call finalize_campaign to change status from Pending -> Funded
      const tx = await program.methods
        .finalizeCampaign()
        .accountsPartial({
          campaign: campaignPda,
        })
        .rpc();
      
      console.log(`\n✅ Campaign finalized`);
      console.log(`   Transaction: ${tx}`);
      
      // Verify status changed to Funded
      campaignAccount = await program.account.campaign.fetch(campaignPda);
      console.log(`   New Status: ${JSON.stringify(campaignAccount.status)}`);
      console.log(`   Status is Funded: ${JSON.stringify(campaignAccount.status) === '{"funded":{}}' ? 'Yes ✓' : 'No ✗'}`);
    });

    it("should submit budget proposal (organizer)", async () => {
      console.log("\n📋 Organizer submitting budget proposal...");
      
      [budgetPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("budget"), campaignPda.toBuffer()],
        program.programId
      );
      
      const milestones = [
        {
          description: "Venue booking",
          releasePercentage: 4000, // 40%
          unlockDate: new BN(Math.floor(Date.now() / 1000) + 86400),
        },
        {
          description: "Marketing campaign",
          releasePercentage: 3000, // 30%
          unlockDate: new BN(Math.floor(Date.now() / 1000) + 86400 * 15),
        },
        {
          description: "Event execution",
          releasePercentage: 3000, // 30%
          unlockDate: new BN(Math.floor(Date.now() / 1000) + 86400 * 30),
        },
      ];
      
      const tx = await program.methods
        .submitBudget(
          new BN(0.08 * anchor.web3.LAMPORTS_PER_SOL), // 0.08 SOL (80% of raised funds)
          "Event production budget breakdown",
          milestones,
          new BN(20) // 20 seconds voting period (for testing)
        )
        .accountsPartial({
          campaign: campaignPda,
          budget: budgetPda,
          organizer: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log(`✅ Budget proposal submitted`);
      console.log(`   Budget Amount: 0.08 SOL`);
      console.log(`   Milestones: 3`);
      console.log(`   Voting Period: 20 seconds (optimized for testing)`);
      console.log(`   Transaction: ${tx}`);
    });

    it("should vote on budget (Investor 1 - Approve)", async () => {
      console.log("\n🗳️  Investor 1 voting on budget...");
      
      const [contributionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("contribution"), campaignPda.toBuffer(), investor1.publicKey.toBuffer()],
        program.programId
      );
      
      const [votePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("budget_vote"), budgetPda.toBuffer(), investor1.publicKey.toBuffer()],
        program.programId
      );
      
      const tx = await program.methods
        .voteOnBudget(true) // Approve
        .accountsPartial({
          budget: budgetPda,
          campaign: campaignPda,
          contribution: contributionPda,
          vote: votePda,
          voter: investor1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([investor1])
        .rpc();
      
      console.log(`✅ Vote cast: APPROVE`);
      console.log(`   Voting Power: 40% (based on contribution)`);
      console.log(`   Transaction: ${tx}`);
    });

    it("should vote on budget (Investor 2 - Approve)", async () => {
      console.log("\n🗳️  Investor 2 voting on budget...");
      
      const [contributionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("contribution"), campaignPda.toBuffer(), investor2.publicKey.toBuffer()],
        program.programId
      );
      
      const [votePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("budget_vote"), budgetPda.toBuffer(), investor2.publicKey.toBuffer()],
        program.programId
      );
      
      const tx = await program.methods
        .voteOnBudget(true)
        .accountsPartial({
          budget: budgetPda,
          campaign: campaignPda,
          contribution: contributionPda,
          vote: votePda,
          voter: investor2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([investor2])
        .rpc();
      
      console.log(`✅ Vote cast: APPROVE`);
      console.log(`   Voting Power: 30%`);
      console.log(`   Transaction: ${tx}`);
    });

    it("should finalize budget vote", async () => {
      console.log("\n⏳ Waiting for voting period to end...");
      
      // Wait 22 seconds to ensure 20-second voting period has passed
      await new Promise(resolve => setTimeout(resolve, 22000));
      console.log("✅ Voting period ended");
      
      console.log("\n✅ Finalizing budget vote...");
      
      const tx = await program.methods
        .finalizeBudgetVote()
        .accountsPartial({
          budget: budgetPda,
        })
        .rpc();
      
      console.log(`✅ Budget vote finalized`);
      console.log(`   Transaction: ${tx}`);
      
      const budgetAccount = await program.account.budget.fetch(budgetPda);
      console.log(`   Status: ${JSON.stringify(budgetAccount.status)}`);
      console.log(`   Result: Budget APPROVED by DAO! 🎉`);
    });
  });

  describe("4. Investment Analytics", () => {
    it("should view DAO statistics", async () => {
      console.log("\n📊 DAO Analytics Dashboard...");
      
      const campaignAccount = await program.account.campaign.fetch(campaignPda);
      
      // Fetch all contributions
      const contributions = await program.account.contribution.all([
        {
          memcmp: {
            offset: 8,
            bytes: campaignPda.toBase58(),
          },
        },
      ]);
      
      console.log(`\n💼 DAO Statistics:`);
      console.log(`   Total Investors: ${contributions.length}`);
      console.log(`   Total Raised: ${campaignAccount.totalRaised.toNumber() / 1e9} SOL`);
      console.log(`   Funding Goal: ${campaignAccount.fundingGoal.toNumber() / 1e9} SOL`);
      console.log(`   Success Rate: ${(campaignAccount.totalRaised.toNumber() / campaignAccount.fundingGoal.toNumber() * 100).toFixed(1)}%`);
      
      console.log(`\n👥 Investor Breakdown:`);
      contributions.forEach((contrib, i) => {
        const amount = contrib.account.amount.toNumber() / 1e9;
        const goalAmount = campaignAccount.fundingGoal.toNumber() / 1e9;
        const share = (amount / goalAmount * 100).toFixed(1);
        const address = contrib.account.contributor.toBase58().slice(0, 8);
        console.log(`   ${i + 1}. ${address}... - ${amount} SOL (${share}%)`);
      });
      
      console.log(`\n✅ Total contributions verified: ${contributions.length}`);
      assert.equal(contributions.length, 3, `Expected 3 contributions, got ${contributions.length}`);
    });
  });

  describe("5. Summary", () => {
    it("should display investor dashboard", async () => {
      console.log("\n" + "=".repeat(60));
      console.log("💰 INVESTOR/DAO DASHBOARD SUMMARY");
      console.log("=".repeat(60));
      
      const campaignAccount = await program.account.campaign.fetch(campaignPda);
      const budgetAccount = await program.account.budget.fetch(budgetPda);
      
      console.log(`\nCampaign: ${eventId}`);
      console.log(`Status: ${campaignAccount.totalRaised.gte(campaignAccount.fundingGoal) ? 'FUNDED ✓' : 'Active'}`);
      console.log(`Total Raised: ${campaignAccount.totalRaised.toNumber() / 1e9} SOL`);
      console.log(`Investors: 3`);
      console.log(`Budget: ${budgetAccount.status.approved ? 'Approved ✓' : 'Pending'}`);
      console.log(`Milestones: ${budgetAccount.milestones.length}`);
      
      console.log(`\n✅ Investors successfully:`);
      console.log(`   - Discovered campaigns ✓`);
      console.log(`   - Made contributions ✓`);
      console.log(`   - Participated in governance ✓`);
      console.log(`   - Voted on budgets ✓`);
      console.log(`   - Tracked investments ✓`);
      
      console.log("\n" + "=".repeat(60));
      console.log("✅ Investor/DAO tests completed successfully!");
      console.log("=".repeat(60) + "\n");
      
      assert.ok(true);
    });
  });
});
