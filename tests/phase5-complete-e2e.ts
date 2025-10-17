import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MythraProgram } from "../target/types/mythra_program";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

describe("Phase 5: Complete End-to-End Platform Test", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  
  it("Complete platform lifecycle from campaign to profit distribution", async () => {
    console.log("\n🎬 STARTING COMPLETE END-TO-END PLATFORM TEST\n");
    console.log("=" .repeat(70));
    
    // ==========================================
    // SETUP: Accounts & Keypairs
    // ==========================================
    console.log("\n📋 PHASE 1: Account Setup");
    console.log("-".repeat(70));
    
    const organizer = Keypair.generate();
    const backer1 = Keypair.generate();
    const backer2 = Keypair.generate();
    const backer3 = Keypair.generate();
    const buyer1 = Keypair.generate();
    const buyer2 = Keypair.generate();
    const buyer3 = Keypair.generate();
    const treasury = Keypair.generate();
    
    console.log("Airdropping SOL to all participants...");
    for (const wallet of [organizer, backer1, backer2, backer3, buyer1, buyer2, buyer3]) {
      const sig = await provider.connection.requestAirdrop(
        wallet.publicKey,
        30 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }
    console.log("✅ All accounts funded with 30 SOL each\n");
    
    const eventId = `e2e-test-${Date.now()}`;
    const [eventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(eventId)],
      program.programId
    );
    
    const [campaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), eventPda.toBuffer()],
      program.programId
    );
    
    const [campaignEscrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
      program.programId
    );
    
    const [budgetPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget"), campaignPda.toBuffer()],
      program.programId
    );
    
    const [tierPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tier"), eventPda.toBuffer(), Buffer.from("vip-tier")],
      program.programId
    );
    
    // ==========================================
    // STEP 1: Create Event
    // ==========================================
    console.log("📅 PHASE 2: Event Creation");
    console.log("-".repeat(70));
    
    const now = Math.floor(Date.now() / 1000);
    const eventStart = new anchor.BN(now + 30);
    const eventEnd = new anchor.BN(now + 35);
    
    await program.methods
      .createEvent(eventId, "https://event.example.com/metadata.json", 
        eventStart, eventEnd, 100, 500)
      .accountsPartial({
        event: eventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    const event = await program.account.event.fetch(eventPda);
    console.log("✅ Event created:");
    console.log(`   Total supply: ${event.totalSupply}`);
    console.log(`   Platform split: ${event.platformSplitBps / 100}%`);
    console.log(`   Crowdfunding: ${event.crowdfundingEnabled}\n`);
    
    // ==========================================
    // STEP 2: Create Crowdfunding Campaign
    // ==========================================
    console.log("💰 PHASE 3: Crowdfunding Campaign");
    console.log("-".repeat(70));
    
    const fundingGoal = new anchor.BN(30 * anchor.web3.LAMPORTS_PER_SOL);
    const campaignDeadline = new anchor.BN(now + 15);
    
    await program.methods
      .createCampaign(fundingGoal, campaignDeadline)
      .accountsPartial({
        event: eventPda,
        campaign: campaignPda,
        organizer: organizer.publicKey,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    console.log(`✅ Campaign created with ${fundingGoal.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL goal\n`);
    
    // ==========================================
    // STEP 3: Backers Contribute
    // ==========================================
    console.log("🤝 PHASE 4: Backer Contributions");
    console.log("-".repeat(70));
    
    const contributions = [
      { backer: backer1, amount: new anchor.BN(15 * anchor.web3.LAMPORTS_PER_SOL), name: "Backer 1" },
      { backer: backer2, amount: new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL), name: "Backer 2" },
      { backer: backer3, amount: new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL), name: "Backer 3" },
    ];
    
    const contributionPdas: PublicKey[] = [];
    
    for (const { backer, amount, name } of contributions) {
      const [contributionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("contribution"), campaignPda.toBuffer(), backer.publicKey.toBuffer()],
        program.programId
      );
      contributionPdas.push(contributionPda);
      
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
      
      console.log(`✅ ${name} contributed ${amount.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    }
    
    const campaign = await program.account.campaign.fetch(campaignPda);
    console.log(`\n📊 Total raised: ${campaign.totalRaised.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`   Goal reached: ${campaign.totalRaised.gte(fundingGoal) ? "YES ✅" : "NO"}\n`);
    
    // ==========================================
    // STEP 4: Finalize Campaign
    // ==========================================
    console.log("🎯 PHASE 5: Campaign Finalization");
    console.log("-".repeat(70));
    
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: campaignPda,
      })
      .rpc();
    
    const campaignFinalized = await program.account.campaign.fetch(campaignPda);
    console.log(`✅ Campaign finalized with status: ${JSON.stringify(campaignFinalized.status)}\n`);
    
    // ==========================================
    // STEP 5: Submit Budget
    // ==========================================
    console.log("📝 PHASE 6: Budget Submission");
    console.log("-".repeat(70));
    
    const budgetAmount = new anchor.BN(25 * anchor.web3.LAMPORTS_PER_SOL);
    const milestones = [
      { description: "Venue & Setup", releasePercentage: 5000, unlockDate: new anchor.BN(now + 86400) },
      { description: "Marketing & Promo", releasePercentage: 3000, unlockDate: new anchor.BN(now + 86400 * 2) },
      { description: "Operations & Staff", releasePercentage: 2000, unlockDate: new anchor.BN(now + 86400 * 3) },
    ];
    
    await program.methods
      .submitBudget(budgetAmount, "Event operational budget", milestones, new anchor.BN(10))
      .accountsPartial({
        campaign: campaignPda,
        budget: budgetPda,
        organizer: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    console.log(`✅ Budget submitted: ${budgetAmount.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`   Milestones: ${milestones.length}`);
    console.log(`   Voting period: 10 seconds\n`);
    
    // ==========================================
    // STEP 6: Backers Vote on Budget
    // ==========================================
    console.log("🗳️  PHASE 7: Budget Voting");
    console.log("-".repeat(70));
    
    for (let i = 0; i < contributions.length; i++) {
      const [votePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("budget_vote"), budgetPda.toBuffer(), contributions[i].backer.publicKey.toBuffer()],
        program.programId
      );
      
      const voteChoice = i < 2; // First 2 vote YES, last votes NO
      
      await program.methods
        .voteOnBudget(voteChoice)
        .accountsPartial({
          budget: budgetPda,
          campaign: campaignPda,
          contribution: contributionPdas[i],
          vote: votePda,
          voter: contributions[i].backer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([contributions[i].backer])
        .rpc();
      
      console.log(`✅ ${contributions[i].name} voted ${voteChoice ? "YES" : "NO"}`);
    }
    
    const budgetAfterVoting = await program.account.budget.fetch(budgetPda);
    console.log(`\n📊 Voting results:`);
    console.log(`   FOR: ${budgetAfterVoting.votesFor.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`   AGAINST: ${budgetAfterVoting.votesAgainst.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL\n`);
    
    // ==========================================
    // STEP 7: Finalize Budget Vote
    // ==========================================
    console.log("⏳ PHASE 8: Vote Finalization");
    console.log("-".repeat(70));
    console.log("Waiting for voting period to end...");
    
    await new Promise(resolve => setTimeout(resolve, 11000));
    
    await program.methods
      .finalizeBudgetVote()
      .accountsPartial({
        budget: budgetPda,
      })
      .rpc();
    
    const budget = await program.account.budget.fetch(budgetPda);
    console.log(`✅ Budget finalized with status: ${JSON.stringify(budget.status)}\n`);
    
    // ==========================================
    // STEP 8: Create Ticket Tier
    // ==========================================
    console.log("🎫 PHASE 9: Ticket Tier Creation");
    console.log("-".repeat(70));
    
    const ticketPrice = new anchor.BN(3 * anchor.web3.LAMPORTS_PER_SOL);
    
    await program.methods
      .createTicketTier("vip-tier", "https://tickets.example.com/vip.json",
        ticketPrice, 50, 500, 0, true)
      .accountsPartial({
        event: eventPda,
        tier: tierPda,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    console.log(`✅ VIP tier created at ${ticketPrice.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL per ticket\n`);
    
    // ==========================================
    // STEP 9: Sell Tickets
    // ==========================================
    console.log("🛒 PHASE 10: Ticket Sales");
    console.log("-".repeat(70));
    
    const buyers = [buyer1, buyer2, buyer3];
    const ticketMints: PublicKey[] = [];
    
    for (let i = 0; i < buyers.length; i++) {
      const buyer = buyers[i];
      const ticketMint = await createMint(provider.connection, buyer, buyer.publicKey, null, 0);
      ticketMints.push(ticketMint);
      
      const buyerToken = await getOrCreateAssociatedTokenAccount(
        provider.connection, buyer, ticketMint, buyer.publicKey
      );
      
      await mintTo(provider.connection, buyer, ticketMint, buyerToken.address, buyer, 1);
      
      await program.methods
        .registerMint()
        .accountsPartial({
          event: eventPda,
          tier: tierPda,
          mint: ticketMint,
          buyerTokenAccount: buyerToken.address,
          buyer: buyer.publicKey,
          authority: organizer.publicKey,
          campaign: campaignPda,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([organizer])
        .rpc();
      
      console.log(`✅ Ticket ${i + 1} sold to Buyer ${i + 1}`);
    }
    
    const eventAfterSales = await program.account.event.fetch(eventPda);
    const totalRevenue = eventAfterSales.ticketRevenue.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
    console.log(`\n📊 Total ticket revenue: ${totalRevenue} SOL\n`);
    
    // ==========================================
    // STEP 10: Wait for Event to End
    // ==========================================
    console.log("⏰ PHASE 11: Event Timeline");
    console.log("-".repeat(70));
    console.log("Waiting for event to end...");
    
    await new Promise(resolve => setTimeout(resolve, 40000));
    
    console.log("✅ Event has ended\n");
    
    // ==========================================
    // STEP 11: Calculate Distribution
    // ==========================================
    console.log("💸 PHASE 12: Profit Distribution Calculation");
    console.log("-".repeat(70));
    
    await program.methods
      .calculateDistribution()
      .accountsPartial({
        campaign: campaignPda,
        event: eventPda,
        authority: organizer.publicKey,
      })
      .signers([organizer])
      .rpc();
    
    const campaignWithDistribution = await program.account.campaign.fetch(campaignPda);
    
    const revenue = campaignWithDistribution.totalRevenue.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
    const expenses = campaignWithDistribution.totalExpenses.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
    const profit = revenue - expenses;
    const backerPool = campaignWithDistribution.backerPool.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
    const organizerPool = campaignWithDistribution.organizerPool.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
    const platformPool = campaignWithDistribution.platformPool.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
    
    console.log("✅ Distribution calculated:");
    console.log(`   Revenue: ${revenue} SOL`);
    console.log(`   Expenses: ${expenses} SOL`);
    console.log(`   Profit: ${profit} SOL`);
    console.log(`   Backer pool (60%): ${backerPool} SOL`);
    console.log(`   Organizer pool (35%): ${organizerPool} SOL`);
    console.log(`   Platform pool (5%): ${platformPool} SOL\n`);
    
    // Verify math
    const expectedBackerPool = profit * 0.60;
    const expectedOrganizerPool = profit * 0.35;
    const expectedPlatformPool = profit * 0.05;
    
    expect(Math.abs(backerPool - expectedBackerPool)).to.be.lessThan(0.01);
    expect(Math.abs(organizerPool - expectedOrganizerPool)).to.be.lessThan(0.01);
    expect(Math.abs(platformPool - expectedPlatformPool)).to.be.lessThan(0.01);
    console.log("✅ Math verification passed: 60/35/5 split correct\n");
    
    // ==========================================
    // STEP 12: Backers Claim Profits
    // ==========================================
    console.log("💰 PHASE 13: Backer Profit Claims");
    console.log("-".repeat(70));
    
    const totalRaised = campaignWithDistribution.totalRaised.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
    
    for (let i = 0; i < contributions.length; i++) {
      const contribution = await program.account.contribution.fetch(contributionPdas[i]);
      const contributionAmount = contribution.amount.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
      const expectedShare = (contributionAmount / totalRaised) * backerPool;
      
      await program.methods
        .claimBackerProfit()
        .accountsPartial({
          campaign: campaignPda,
          contribution: contributionPdas[i],
          campaignEscrow: campaignEscrowPda,
          contributor: contributions[i].backer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([contributions[i].backer])
        .rpc();
      
      const contributionAfterClaim = await program.account.contribution.fetch(contributionPdas[i]);
      const actualShare = contributionAfterClaim.profitShare.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
      
      console.log(`✅ ${contributions[i].name} claimed ${actualShare.toFixed(2)} SOL`);
      console.log(`   Contribution: ${contributionAmount} SOL (${(contributionAmount / totalRaised * 100).toFixed(1)}%)`);
      console.log(`   Expected: ${expectedShare.toFixed(2)} SOL`);
      console.log(`   Difference: ${Math.abs(actualShare - expectedShare).toFixed(4)} SOL`);
      
      expect(Math.abs(actualShare - expectedShare)).to.be.lessThan(0.01);
    }
    
    console.log("\n✅ All backer claims verified: Proportional distribution correct\n");
    
    // ==========================================
    // STEP 13: Organizer Claims Profit
    // ==========================================
    console.log("🏢 PHASE 14: Organizer Profit Claim");
    console.log("-".repeat(70));
    
    await program.methods
      .claimOrganizerProfit()
      .accountsPartial({
        campaign: campaignPda,
        campaignEscrow: campaignEscrowPda,
        organizer: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    console.log(`✅ Organizer claimed ${organizerPool} SOL (35% of profit)\n`);
    
    // ==========================================
    // FINAL VERIFICATION
    // ==========================================
    console.log("🔍 PHASE 15: Final Verification");
    console.log("-".repeat(70));
    
    const finalCampaign = await program.account.campaign.fetch(campaignPda);
    const finalBudget = await program.account.budget.fetch(budgetPda);
    const finalEvent = await program.account.event.fetch(eventPda);
    
    // Verify all states
    expect(finalCampaign.distributionComplete).to.be.true;
    expect(finalCampaign.organizerClaimed).to.be.true;
    expect(finalCampaign.status).to.deep.equal({ completed: {} });
    expect(finalBudget.status).to.deep.equal({ approved: {} });
    expect(finalEvent.crowdfundingEnabled).to.be.true;
    
    console.log("✅ Campaign status: Completed");
    console.log("✅ Budget status: Approved");
    console.log("✅ Distribution: Complete");
    console.log("✅ Organizer claimed: Yes");
    console.log("✅ All backers claimed: Yes");
    
    // Verify math totals
    const totalDistributed = backerPool + organizerPool + platformPool;
    expect(Math.abs(totalDistributed - profit)).to.be.lessThan(0.01);
    console.log("✅ Total distribution math verified\n");
    
    // ==========================================
    // FINAL SUMMARY
    // ==========================================
    console.log("=" .repeat(70));
    console.log("🎉 END-TO-END TEST COMPLETE - ALL PHASES SUCCESSFUL!");
    console.log("=" .repeat(70));
    console.log("\n📊 FINAL SUMMARY:\n");
    console.log(`Campaign Phase:`);
    console.log(`  • Raised: ${totalRaised} SOL from 3 backers`);
    console.log(`  • Goal: ${fundingGoal.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL (${totalRaised >= fundingGoal.toNumber() / anchor.web3.LAMPORTS_PER_SOL ? "✅ MET" : "❌ NOT MET"})`);
    console.log(`\nBudget Phase:`);
    console.log(`  • Budget: ${budgetAmount.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`  • Votes FOR: ${budgetAfterVoting.votesFor.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`  • Votes AGAINST: ${budgetAfterVoting.votesAgainst.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`  • Status: ${JSON.stringify(budget.status)}`);
    console.log(`\nTicket Sales:`);
    console.log(`  • Tickets sold: ${buyers.length}`);
    console.log(`  • Price per ticket: ${ticketPrice.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`  • Total revenue: ${revenue} SOL`);
    console.log(`\nProfit Distribution:`);
    console.log(`  • Revenue: ${revenue} SOL`);
    console.log(`  • Expenses: ${expenses} SOL`);
    console.log(`  • Profit: ${profit} SOL`);
    console.log(`  • Backer pool: ${backerPool} SOL (60%)`);
    console.log(`  • Organizer pool: ${organizerPool} SOL (35%)`);
    console.log(`  • Platform pool: ${platformPool} SOL (5%)`);
    console.log(`\nAll Systems: ✅ OPERATIONAL`);
    console.log("=" .repeat(70));
    console.log("\n");
  });
});
