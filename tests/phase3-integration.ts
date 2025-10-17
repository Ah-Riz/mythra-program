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

describe("Phase 3: Crowdfunding + Ticket Integration", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  
  let organizer: Keypair;
  let backer1: Keypair;
  let backer2: Keypair;
  let ticketBuyer: Keypair;
  let treasury: Keypair;
  let eventPda: PublicKey;
  let campaignPda: PublicKey;
  let campaignEscrowPda: PublicKey;
  let budgetPda: PublicKey;
  let ticketMint: PublicKey;
  let tierPda: PublicKey;
  
  const eventId = `phase3-integration-${Date.now()}`;
  const tierId = new anchor.BN(1);
  
  it("Complete flow: Campaign → Budget → Ticket Sales", async () => {
    console.log("\n🚀 Starting Phase 3 Integration Test...\n");
    
    // ========================================
    // STEP 1: Setup Accounts
    // ========================================
    console.log("Step 1: Setting up accounts...");
    organizer = Keypair.generate();
    backer1 = Keypair.generate();
    backer2 = Keypair.generate();
    ticketBuyer = Keypair.generate();
    treasury = Keypair.generate();
    
    // Airdrop SOL
    for (const wallet of [organizer, backer1, backer2, ticketBuyer]) {
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
    
    console.log("✅ Accounts created and funded\n");
    
    // ========================================
    // STEP 2: Create Event
    // ========================================
    console.log("Step 2: Creating event...");
    const now = Math.floor(Date.now() / 1000);
    const startTs = new anchor.BN(now + 86400 * 30); // 30 days from now
    const endTs = new anchor.BN(now + 86400 * 31);
    
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
    
    const event = await program.account.event.fetch(eventPda);
    expect(event.crowdfundingEnabled).to.be.false;
    expect(event.ticketRevenue.toNumber()).to.equal(0);
    console.log("✅ Event created\n");
    
    // ========================================
    // STEP 3: Create Campaign
    // ========================================
    console.log("Step 3: Creating crowdfunding campaign...");
    const fundingGoal = new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL);
    const deadline = new anchor.BN(now + 86400 * 7);
    
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
    
    const eventAfterCampaign = await program.account.event.fetch(eventPda);
    expect(eventAfterCampaign.crowdfundingEnabled).to.be.true;
    expect(eventAfterCampaign.campaign).to.not.be.null;
    console.log("✅ Campaign created (crowdfunding enabled on event)\n");
    
    // ========================================
    // STEP 4: Fund Campaign
    // ========================================
    console.log("Step 4: Backers funding campaign...");
    const contributions = [
      { backer: backer1, amount: new anchor.BN(6 * anchor.web3.LAMPORTS_PER_SOL) },
      { backer: backer2, amount: new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL) },
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
    
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: campaignPda,
      })
      .rpc();
    
    const campaign = await program.account.campaign.fetch(campaignPda);
    expect(campaign.status).to.deep.equal({ funded: {} });
    console.log("✅ Campaign FUNDED\n");
    
    // ========================================
    // STEP 5: Submit & Approve Budget
    // ========================================
    console.log("Step 5: Submitting and approving budget...");
    await program.methods
      .submitBudget(
        new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL),
        "Event operational budget",
        [
          { description: "M1", releasePercentage: 5000, unlockDate: new anchor.BN(now + 86400 * 25) },
          { description: "M2", releasePercentage: 3000, unlockDate: new anchor.BN(now + 86400 * 28) },
          { description: "M3", releasePercentage: 2000, unlockDate: new anchor.BN(now + 86400 * 32) },
        ],
        new anchor.BN(10) // 10 seconds voting period
      )
      .accountsPartial({
        campaign: campaignPda,
        budget: budgetPda,
        organizer: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // Backers vote YES
    for (const { backer } of contributions) {
      const [contributionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("contribution"), campaignPda.toBuffer(), backer.publicKey.toBuffer()],
        program.programId
      );
      
      const [votePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("budget_vote"), budgetPda.toBuffer(), backer.publicKey.toBuffer()],
        program.programId
      );
      
      await program.methods
        .voteOnBudget(true)
        .accountsPartial({
          budget: budgetPda,
          campaign: campaignPda,
          contribution: contributionPda,
          vote: votePda,
          voter: backer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([backer])
        .rpc();
    }
    
    // Wait for voting period
    await new Promise(resolve => setTimeout(resolve, 11000));
    
    await program.methods
      .finalizeBudgetVote()
      .accountsPartial({
        budget: budgetPda,
      })
      .rpc();
    
    const budget = await program.account.budget.fetch(budgetPda);
    expect(budget.status).to.deep.equal({ approved: {} });
    console.log("✅ Budget APPROVED\n");
    
    // ========================================
    // STEP 6: Create Ticket Tier
    // ========================================
    console.log("Step 6: Creating ticket tier...");
    await program.methods
      .createTicketTier(
        "tier-1", // tier_id: String
        "https://example.com/tier1.json", // metadata_uri
        new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL), // price_lamports
        50, // max_supply
        500, // royalty_bps (5%)
        0, // tier_index
        true // resale_enabled
      )
      .accountsPartial({
        event: eventPda,
        tier: tierPda,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    console.log("✅ Ticket tier created (2 SOL per ticket)\n");
    
    // ========================================
    // STEP 7: Register Ticket (WITH CAMPAIGN CHECK)
    // ========================================
    console.log("Step 7: Registering ticket (testing campaign validation)...");
    
    // Create NFT mint
    ticketMint = await createMint(
      provider.connection,
      ticketBuyer,
      ticketBuyer.publicKey,
      null,
      0 // 0 decimals for NFT
    );
    
    const buyerTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      ticketBuyer,
      ticketMint,
      ticketBuyer.publicKey
    );
    
    await mintTo(
      provider.connection,
      ticketBuyer,
      ticketMint,
      buyerTokenAccount.address,
      ticketBuyer,
      1
    );
    
    const [ticketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), ticketMint.toBuffer()],
      program.programId
    );
    
    // Register ticket WITH campaign validation
    await program.methods
      .registerMint()
      .accountsPartial({
        event: eventPda,
        tier: tierPda,
        mint: ticketMint,
        buyerTokenAccount: buyerTokenAccount.address,
        buyer: ticketBuyer.publicKey,
        authority: organizer.publicKey,
        campaign: campaignPda, // ← IMPORTANT: Campaign must be provided and funded
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([organizer])
      .rpc();
    
    // Verify ticket revenue tracked
    const eventAfterTicket = await program.account.event.fetch(eventPda);
    expect(eventAfterTicket.ticketRevenue.toNumber()).to.equal(2 * anchor.web3.LAMPORTS_PER_SOL);
    
    console.log("✅ Ticket registered successfully!");
    console.log(`   Ticket revenue: ${eventAfterTicket.ticketRevenue.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL\n`);
    
    // ========================================
    // STEP 8: Verification
    // ========================================
    console.log("Step 8: Final verifications...");
    
    const ticket = await program.account.ticket.fetch(ticketPda);
    expect(ticket.owner.toString()).to.equal(ticketBuyer.publicKey.toString());
    expect(ticket.event.toString()).to.equal(eventPda.toString());
    
    const tier = await program.account.ticketTier.fetch(tierPda);
    expect(tier.currentSupply).to.equal(1);
    
    console.log("✅ All verifications passed!\n");
    
    // ========================================
    // Summary
    // ========================================
    console.log("============================================================");
    console.log("🎉 PHASE 3 INTEGRATION TEST SUCCESS!");
    console.log("============================================================");
    console.log("Summary:");
    console.log(`- Campaign raised: ${campaign.totalRaised.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`- Budget approved: ${budget.totalAmount.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`- Tickets sold: ${tier.currentSupply}`);
    console.log(`- Ticket revenue: ${eventAfterTicket.ticketRevenue.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`- Campaign status: FUNDED ✅`);
    console.log(`- Budget status: APPROVED ✅`);
    console.log(`- Crowdfunding enabled: ${eventAfterTicket.crowdfundingEnabled} ✅`);
    console.log("============================================================\n");
  });
  
  it("Fails to register ticket if campaign not funded", async () => {
    console.log("\n🧪 Testing ticket registration fails without funded campaign...\n");
    
    // Create new event WITHOUT funded campaign
    const unfundedEventId = `unfunded-${Date.now()}`;
    const [unfundedEventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(unfundedEventId)],
      program.programId
    );
    
    const now = Math.floor(Date.now() / 1000);
    await program.methods
      .createEvent(unfundedEventId, "https://example.com/unfunded.json", 
        new anchor.BN(now + 86400 * 30), new anchor.BN(now + 86400 * 31), 100, 500)
      .accountsPartial({
        event: unfundedEventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // Create campaign but DON'T fund it
    const [unfundedCampaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), unfundedEventPda.toBuffer()],
      program.programId
    );
    
    await program.methods
      .createCampaign(new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL), new anchor.BN(now + 86400 * 7))
      .accountsPartial({
        event: unfundedEventPda,
        campaign: unfundedCampaignPda,
        organizer: organizer.publicKey,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // Create tier
    const [unfundedTierPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tier"), unfundedEventPda.toBuffer(), Buffer.from("tier-1")],
      program.programId
    );
    
    await program.methods
      .createTicketTier("tier-1", "https://example.com/tier.json", new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL), 10, 500, 0, true)
      .accountsPartial({
        event: unfundedEventPda,
        tier: unfundedTierPda,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // Try to register ticket - should FAIL
    const unfundedMint = await createMint(provider.connection, ticketBuyer, ticketBuyer.publicKey, null, 0);
    const unfundedBuyerToken = await getOrCreateAssociatedTokenAccount(provider.connection, ticketBuyer, unfundedMint, ticketBuyer.publicKey);
    await mintTo(provider.connection, ticketBuyer, unfundedMint, unfundedBuyerToken.address, ticketBuyer, 1);
    
    const [unfundedTicketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), unfundedMint.toBuffer()],
      program.programId
    );
    
    try {
      await program.methods
        .registerMint()
        .accountsPartial({
          event: unfundedEventPda,
          tier: unfundedTierPda,
          mint: unfundedMint,
          buyerTokenAccount: unfundedBuyerToken.address,
          buyer: ticketBuyer.publicKey,
          authority: organizer.publicKey,
          campaign: unfundedCampaignPda,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([organizer])
        .rpc();
      
      expect.fail("Should have failed - campaign not funded");
    } catch (err) {
      expect(err.message).to.include("CampaignNotFunded");
      console.log("✅ Correctly blocked ticket registration (campaign not funded)\n");
    }
  });
});
