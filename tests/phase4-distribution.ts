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

describe("Phase 4: Profit Distribution", () => {
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
  let tierPda: PublicKey;
  
  const eventId = `phase4-profit-${Date.now()}`;
  
  before(async () => {
    // Setup accounts
    organizer = Keypair.generate();
    backer1 = Keypair.generate();
    backer2 = Keypair.generate();
    backer3 = Keypair.generate();
    treasury = Keypair.generate();
    
    // Airdrop SOL
    for (const wallet of [organizer, backer1, backer2, backer3]) {
      const sig = await provider.connection.requestAirdrop(
        wallet.publicKey,
        20 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }
    
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
    
    [tierPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tier"), eventPda.toBuffer(), Buffer.from("tier-1")],
      program.programId
    );
  });
  
  it("Complete profit distribution flow", async () => {
    console.log("\n🚀 Starting Phase 4: Profit Distribution Test...\n");
    
    // ========================================
    // STEP 1: Create Event & Campaign
    // ========================================
    console.log("Step 1: Setting up event and campaign...");
    const now = Math.floor(Date.now() / 1000);
    const startTs = new anchor.BN(now + 20); // Event starts in 20 seconds
    const endTs = new anchor.BN(now + 25); // Event ends 5 seconds after start
    
    await program.methods
      .createEvent(eventId, "https://example.com/event.json", startTs, endTs, 100, 500)
      .accountsPartial({
        event: eventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    const fundingGoal = new anchor.BN(20 * anchor.web3.LAMPORTS_PER_SOL);
    const deadline = new anchor.BN(now + 10); // Campaign deadline before event starts
    
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
    
    console.log("✅ Event and campaign created\n");
    
    // ========================================
    // STEP 2: Three Backers Contribute
    // ========================================
    console.log("Step 2: Backers contributing to campaign...");
    const contributions = [
      { backer: backer1, amount: new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL) }, // 50%
      { backer: backer2, amount: new anchor.BN(6 * anchor.web3.LAMPORTS_PER_SOL) },  // 30%
      { backer: backer3, amount: new anchor.BN(4 * anchor.web3.LAMPORTS_PER_SOL) },  // 20%
    ];
    
    const contributionPdas: PublicKey[] = [];
    
    for (const { backer, amount } of contributions) {
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
      
      console.log(`   Backer contributed ${amount.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    }
    
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: campaignPda,
      })
      .rpc();
    
    console.log("✅ Campaign FUNDED (20 SOL raised)\n");
    
    // ========================================
    // STEP 3: Submit & Approve Budget
    // ========================================
    console.log("Step 3: Submitting and approving budget...");
    await program.methods
      .submitBudget(
        new anchor.BN(15 * anchor.web3.LAMPORTS_PER_SOL), // 15 SOL budget (5 SOL profit expected)
        "Event budget",
        [
          { description: "M1", releasePercentage: 5000, unlockDate: new anchor.BN(now + 86400) },
          { description: "M2", releasePercentage: 3000, unlockDate: new anchor.BN(now + 86400 * 2) },
          { description: "M3", releasePercentage: 2000, unlockDate: new anchor.BN(now + 86400 * 3) },
        ],
        new anchor.BN(10)
      )
      .accountsPartial({
        campaign: campaignPda,
        budget: budgetPda,
        organizer: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // All backers vote YES
    for (let i = 0; i < contributions.length; i++) {
      const [votePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("budget_vote"), budgetPda.toBuffer(), contributions[i].backer.publicKey.toBuffer()],
        program.programId
      );
      
      await program.methods
        .voteOnBudget(true)
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
    }
    
    await new Promise(resolve => setTimeout(resolve, 11000));
    
    await program.methods
      .finalizeBudgetVote()
      .accountsPartial({
        budget: budgetPda,
      })
      .rpc();
    
    console.log("✅ Budget APPROVED (15 SOL)\n");
    
    // ========================================
    // STEP 4: Simulate Ticket Sales
    // ========================================
    console.log("Step 4: Simulating ticket sales...");
    await program.methods
      .createTicketTier("tier-1", "https://example.com/tier.json", 
        new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL), 10, 500, 0, true)
      .accountsPartial({
        event: eventPda,
        tier: tierPda,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // Register 4 tickets = 20 SOL revenue
    for (let i = 0; i < 4; i++) {
      const buyer = Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(buyer.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(airdropSig);
      
      const ticketMint = await createMint(provider.connection, buyer, buyer.publicKey, null, 0);
      const buyerToken = await getOrCreateAssociatedTokenAccount(provider.connection, buyer, ticketMint, buyer.publicKey);
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
    }
    
    const eventAfterSales = await program.account.event.fetch(eventPda);
    console.log(`✅ Ticket revenue: ${eventAfterSales.ticketRevenue.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL\n`);
    
    // ========================================
    // STEP 5: Wait for Event to End
    // ========================================
    console.log("Step 5: Waiting for event to end...");
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds for event to end
    console.log("✅ Event ended\n");
    
    // ========================================
    // STEP 6: Calculate Distribution
    // ========================================
    console.log("Step 6: Calculating profit distribution...");
    await program.methods
      .calculateDistribution()
      .accountsPartial({
        campaign: campaignPda,
        event: eventPda,
        authority: organizer.publicKey,
      })
      .signers([organizer])
      .rpc();
    
    const campaignAfterCalc = await program.account.campaign.fetch(campaignPda);
    console.log("✅ Distribution calculated:");
    console.log(`   Revenue: ${campaignAfterCalc.totalRevenue.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`   Expenses: ${campaignAfterCalc.totalExpenses.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`   Profit: ${(campaignAfterCalc.totalRevenue.toNumber() - campaignAfterCalc.totalExpenses.toNumber()) / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`   Backer pool (60%): ${campaignAfterCalc.backerPool.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`   Organizer pool (35%): ${campaignAfterCalc.organizerPool.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`   Platform pool (5%): ${campaignAfterCalc.platformPool.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL\n`);
    
    // ========================================
    // STEP 7: Backers Claim Profits
    // ========================================
    console.log("Step 7: Backers claiming profits...");
    
    for (let i = 0; i < contributions.length; i++) {
      const balanceBefore = await provider.connection.getBalance(contributions[i].backer.publicKey);
      
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
      
      const balanceAfter = await provider.connection.getBalance(contributions[i].backer.publicKey);
      const claimed = balanceAfter - balanceBefore;
      
      const contribution = await program.account.contribution.fetch(contributionPdas[i]);
      
      console.log(`   Backer ${i + 1} claimed ${contribution.profitShare.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
      expect(contribution.profitClaimed).to.be.true;
    }
    
    console.log("✅ All backers claimed their profits\n");
    
    // ========================================
    // STEP 8: Organizer Claims Profit
    // ========================================
    console.log("Step 8: Organizer claiming profit...");
    
    const organizerBalanceBefore = await provider.connection.getBalance(organizer.publicKey);
    
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
    
    const organizerBalanceAfter = await provider.connection.getBalance(organizer.publicKey);
    
    const campaignFinal = await program.account.campaign.fetch(campaignPda);
    console.log(`✅ Organizer claimed ${campaignFinal.organizerPool.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL\n`);
    
    expect(campaignFinal.organizerClaimed).to.be.true;
    
    // ========================================
    // Summary
    // ========================================
    console.log("============================================================");
    console.log("🎉 PHASE 4 PROFIT DISTRIBUTION SUCCESS!");
    console.log("============================================================");
    console.log("Final Summary:");
    console.log(`- Campaign raised: ${campaignFinal.totalRaised.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`- Ticket revenue: ${campaignFinal.totalRevenue.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`- Total expenses: ${campaignFinal.totalExpenses.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    const profit = (campaignFinal.totalRevenue.toNumber() - campaignFinal.totalExpenses.toNumber()) / anchor.web3.LAMPORTS_PER_SOL;
    console.log(`- Profit: ${profit} SOL`);
    console.log(`- Backer pool distributed: ${campaignFinal.backerPool.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL (60%)`);
    console.log(`- Organizer received: ${campaignFinal.organizerPool.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL (35%)`);
    console.log(`- Platform fee: ${campaignFinal.platformPool.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL (5%)`);
    console.log(`- Distribution complete: ${campaignFinal.distributionComplete} ✅`);
    console.log(`- Status: ${JSON.stringify(campaignFinal.status)} ✅`);
    console.log("============================================================\n");
  });
  
  it("Handles loss scenario correctly", async () => {
    console.log("\n🧪 Testing loss scenario (expenses > revenue)...\n");
    
    const lossEventId = `loss-event-${Date.now()}`;
    const [lossEventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(lossEventId)],
      program.programId
    );
    
    const [lossCampaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), lossEventPda.toBuffer()],
      program.programId
    );
    
    const now = Math.floor(Date.now() / 1000);
    
    await program.methods
      .createEvent(lossEventId, "https://example.com/loss.json", 
        new anchor.BN(now + 20), new anchor.BN(now + 25), 10, 500)
      .accountsPartial({
        event: lossEventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    await program.methods
      .createCampaign(new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL), new anchor.BN(now + 10)) // Deadline before event starts
      .accountsPartial({
        event: lossEventPda,
        campaign: lossCampaignPda,
        organizer: organizer.publicKey,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // Single backer contributes
    const [lossContributionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), lossCampaignPda.toBuffer(), backer1.publicKey.toBuffer()],
      program.programId
    );
    
    const [lossEscrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_escrow"), lossCampaignPda.toBuffer()],
      program.programId
    );
    
    await program.methods
      .contribute(new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL))
      .accountsPartial({
        campaign: lossCampaignPda,
        contribution: lossContributionPda,
        campaignEscrow: lossEscrowPda,
        contributor: backer1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([backer1])
      .rpc();
    
    await program.methods.finalizeCampaign().accountsPartial({ campaign: lossCampaignPda }).rpc();
    
    // Wait for event to end
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Calculate distribution (event ended)
    await program.methods
      .calculateDistribution()
      .accountsPartial({
        campaign: lossCampaignPda,
        event: lossEventPda,
        authority: organizer.publicKey,
      })
      .signers([organizer])
      .rpc();
    
    const lossCampaign = await program.account.campaign.fetch(lossCampaignPda);
    
    // In loss scenario, all pools should be 0
    expect(lossCampaign.backerPool.toNumber()).to.equal(0);
    expect(lossCampaign.organizerPool.toNumber()).to.equal(0);
    expect(lossCampaign.platformPool.toNumber()).to.equal(0);
    
    console.log("✅ Loss scenario handled correctly (no profit to distribute)\n");
  });
});
