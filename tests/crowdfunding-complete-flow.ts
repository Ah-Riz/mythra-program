import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MythraProgram } from "../target/types/mythra_program";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("Crowdfunding Complete Flow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  
  let organizer: Keypair;
  let backer1: Keypair;
  let backer2: Keypair;
  let backer3: Keypair;
  let treasury: Keypair;
  let eventPda: PublicKey;
  let campaignPda: PublicKey;
  let campaignEscrowPda: PublicKey;
  let budgetPda: PublicKey;
  
  const eventId = `complete-flow-${Date.now()}`;
  
  it("Complete crowdfunding flow: Campaign → Budget → Vote → Milestone Release", async () => {
    console.log("\n🚀 Starting complete crowdfunding flow test...\n");
    
    // ========================================
    // STEP 1: Setup Accounts & Airdrop
    // ========================================
    console.log("Step 1: Setting up accounts...");
    organizer = Keypair.generate();
    backer1 = Keypair.generate();
    backer2 = Keypair.generate();
    backer3 = Keypair.generate();
    treasury = Keypair.generate();
    
    for (const wallet of [organizer, backer1, backer2, backer3]) {
      const sig = await provider.connection.requestAirdrop(
        wallet.publicKey,
        20 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }
    
    // Derive PDAs
    [eventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(eventId)],
      program.programId
    );
    
    [campaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), eventPda.toBuffer()],
      program.programId
    );
    
    [campaignEscrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
      program.programId
    );
    
    [budgetPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget"), campaignPda.toBuffer()],
      program.programId
    );
    
    console.log("✅ Accounts created and funded\n");
    
    // ========================================
    // STEP 2: Create Event
    // ========================================
    console.log("Step 2: Creating event...");
    const now = Math.floor(Date.now() / 1000);
    const startTs = new anchor.BN(now + 86400 * 30); // 30 days from now
    const endTs = new anchor.BN(now + 86400 * 31); // 31 days from now
    
    await program.methods
      .createEvent(eventId, "https://example.com/event-metadata.json", startTs, endTs, 1000, 500)
      .accountsPartial({
        event: eventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    const event = await program.account.event.fetch(eventPda);
    console.log(`✅ Event created: ${event.metadataUri}\n`);
    
    // ========================================
    // STEP 3: Create Campaign
    // ========================================
    console.log("Step 3: Creating crowdfunding campaign...");
    const fundingGoal = new anchor.BN(15 * anchor.web3.LAMPORTS_PER_SOL); // 15 SOL goal
    const deadline = new anchor.BN(now + 86400 * 7); // 7 days to fund
    
    await program.methods
      .createCampaign(fundingGoal, deadline)
      .accountsPartial({
        event: eventPda,
        campaign: campaignPda,
        organizer: organizer.publicKey,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    const campaign = await program.account.campaign.fetch(campaignPda);
    console.log(`✅ Campaign created with ${campaign.fundingGoal.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL goal\n`);
    
    // ========================================
    // STEP 4: Backers Contribute
    // ========================================
    console.log("Step 4: Backers contributing...");
    const contributions = [
      { backer: backer1, amount: new anchor.BN(6 * anchor.web3.LAMPORTS_PER_SOL) },
      { backer: backer2, amount: new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL) },
      { backer: backer3, amount: new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL) },
    ];
    
    for (const { backer, amount } of contributions) {
      const [contributionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("contribution"), campaignPda.toBuffer(), backer.publicKey.toBuffer()],
        program.programId
      );
      
      await program.methods
        .contribute(amount)
        .accountsPartial({
          campaign: campaignPda,
          contribution: contributionPda,
          campaignEscrow: campaignEscrowPda,
          contributor: backer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([backer])
        .rpc();
      
      console.log(`   Backer contributed ${amount.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    }
    
    const updatedCampaign = await program.account.campaign.fetch(campaignPda);
    console.log(`✅ Total raised: ${updatedCampaign.totalRaised.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL (Goal reached!)\n`);
    
    // ========================================
    // STEP 5: Finalize Campaign
    // ========================================
    console.log("Step 5: Finalizing campaign...");
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: campaignPda,
      })
      .rpc();
    
    const finalizedCampaign = await program.account.campaign.fetch(campaignPda);
    expect(finalizedCampaign.status).to.deep.equal({ funded: {} });
    console.log("✅ Campaign finalized: FUNDED\n");
    
    // ========================================
    // STEP 6: Submit Budget
    // ========================================
    console.log("Step 6: Organizer submitting budget...");
    const budgetAmount = new anchor.BN(12 * anchor.web3.LAMPORTS_PER_SOL);
    const milestones = [
      {
        description: "Venue deposit payment",
        releasePercentage: 5000, // 50% = 6 SOL
        unlockDate: new anchor.BN(now + 10), // Unlock in 10 seconds for testing
      },
      {
        description: "Marketing and promotion",
        releasePercentage: 3000, // 30% = 3.6 SOL
        unlockDate: new anchor.BN(now + 20), // Unlock in 20 seconds
      },
      {
        description: "Staff and operations",
        releasePercentage: 2000, // 20% = 2.4 SOL
        unlockDate: new anchor.BN(now + 30), // Unlock in 30 seconds
      },
    ];
    
    await program.methods
      .submitBudget(budgetAmount, "Event operational budget", milestones, new anchor.BN(10)) // 10 seconds for testing
      .accountsPartial({
        campaign: campaignPda,
        budget: budgetPda,
        organizer: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    const budget = await program.account.budget.fetch(budgetPda);
    console.log(`✅ Budget submitted: ${budget.totalAmount.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`   Voting period: 3 days\n`);
    
    // ========================================
    // STEP 7: Backers Vote on Budget
    // ========================================
    console.log("Step 7: Backers voting on budget...");
    
    // Backer 1: YES (6 SOL voting power)
    const [vote1Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget_vote"), budgetPda.toBuffer(), backer1.publicKey.toBuffer()],
      program.programId
    );
    const [contrib1Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), backer1.publicKey.toBuffer()],
      program.programId
    );
    
    await program.methods
      .voteOnBudget(true)
      .accountsPartial({
        budget: budgetPda,
        campaign: campaignPda,
        contribution: contrib1Pda,
        vote: vote1Pda,
        voter: backer1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([backer1])
      .rpc();
    console.log("   Backer 1: YES (6 SOL voting power)");
    
    // Backer 2: YES (5 SOL voting power)
    const [vote2Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget_vote"), budgetPda.toBuffer(), backer2.publicKey.toBuffer()],
      program.programId
    );
    const [contrib2Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), backer2.publicKey.toBuffer()],
      program.programId
    );
    
    await program.methods
      .voteOnBudget(true)
      .accountsPartial({
        budget: budgetPda,
        campaign: campaignPda,
        contribution: contrib2Pda,
        vote: vote2Pda,
        voter: backer2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([backer2])
      .rpc();
    console.log("   Backer 2: YES (5 SOL voting power)");
    
    // Backer 3: NO (5 SOL voting power)
    const [vote3Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget_vote"), budgetPda.toBuffer(), backer3.publicKey.toBuffer()],
      program.programId
    );
    const [contrib3Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), backer3.publicKey.toBuffer()],
      program.programId
    );
    
    await program.methods
      .voteOnBudget(false)
      .accountsPartial({
        budget: budgetPda,
        campaign: campaignPda,
        contribution: contrib3Pda,
        vote: vote3Pda,
        voter: backer3.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([backer3])
      .rpc();
    console.log("   Backer 3: NO (5 SOL voting power)");
    
    const votedBudget = await program.account.budget.fetch(budgetPda);
    console.log(`✅ Voting complete: ${votedBudget.votesFor.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL FOR vs ${votedBudget.votesAgainst.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL AGAINST\n`);
    
    // ========================================
    // STEP 8: Finalize Budget Vote
    // ========================================
    console.log("Step 8: Waiting for voting period to end...");
    await new Promise(resolve => setTimeout(resolve, 11000)); // Wait 11 seconds for 10-second voting period
    
    console.log("Finalizing budget vote...");
    await program.methods
      .finalizeBudgetVote()
      .accountsPartial({
        budget: budgetPda,
      })
      .rpc();
    
    const finalBudget = await program.account.budget.fetch(budgetPda);
    expect(finalBudget.status).to.deep.equal({ approved: {} });
    console.log("✅ Budget APPROVED (11 SOL FOR > 5 SOL AGAINST)\n");
    
    // ========================================
    // STEP 9: Release Milestones
    // ========================================
    console.log("Step 9: Releasing milestones as they unlock...");
    
    const organizerBalanceBefore = await provider.connection.getBalance(organizer.publicKey);
    
    // Wait for milestone 1 to unlock (10 seconds)
    console.log("   Waiting for milestone 1 to unlock...");
    await new Promise(resolve => setTimeout(resolve, 11000));
    
    console.log("   Releasing milestone 1 (50% = 6 SOL)...");
    await program.methods
      .releaseMilestone(0)
      .accountsPartial({
        event: eventPda,
        campaign: campaignPda,
        budget: budgetPda,
        campaignEscrow: campaignEscrowPda,
        organizer: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    const organizerBalance1 = await provider.connection.getBalance(organizer.publicKey);
    const released1 = organizerBalance1 - organizerBalanceBefore;
    console.log(`   ✅ Milestone 1 released: ~${(released1 / anchor.web3.LAMPORTS_PER_SOL).toFixed(2)} SOL\n`);
    
    // ========================================
    // STEP 10: Verify Final State
    // ========================================
    console.log("Step 10: Verifying final state...");
    
    const finalBudgetState = await program.account.budget.fetch(budgetPda);
    expect(finalBudgetState.milestones[0].released).to.be.true;
    expect(finalBudgetState.milestones[1].released).to.be.false;
    expect(finalBudgetState.milestones[2].released).to.be.false;
    
    const finalCampaignState = await program.account.campaign.fetch(campaignPda);
    expect(finalCampaignState.totalExpenses.toNumber()).to.be.greaterThan(0);
    
    console.log("✅ All verifications passed!");
    console.log("\n" + "=".repeat(60));
    console.log("🎉 COMPLETE CROWDFUNDING FLOW SUCCESS!");
    console.log("=".repeat(60));
    console.log(`\nSummary:`);
    console.log(`- Campaign goal: ${fundingGoal.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`- Total raised: ${finalCampaignState.totalRaised.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`- Budget: ${budgetAmount.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`- Milestones released: 1/3`);
    console.log(`- Total expenses: ${(finalCampaignState.totalExpenses.toNumber() / anchor.web3.LAMPORTS_PER_SOL).toFixed(2)} SOL`);
    console.log(`- Organizer received: ~${(released1 / anchor.web3.LAMPORTS_PER_SOL).toFixed(2)} SOL\n`);
  });
});
