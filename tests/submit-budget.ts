import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MythraProgram } from "../target/types/mythra_program";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("submit_budget", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  
  let organizer: Keypair;
  let contributor1: Keypair;
  let contributor2: Keypair;
  let eventPda: PublicKey;
  let campaignPda: PublicKey;
  let campaignEscrowPda: PublicKey;
  let budgetPda: PublicKey;
  let treasury: Keypair;
  
  const eventId = `test-budget-${Date.now()}`;
  
  before(async () => {
    organizer = Keypair.generate();
    contributor1 = Keypair.generate();
    contributor2 = Keypair.generate();
    treasury = Keypair.generate();
    
    // Airdrop SOL
    for (const wallet of [organizer, contributor1, contributor2]) {
      const sig = await provider.connection.requestAirdrop(
        wallet.publicKey,
        10 * anchor.web3.LAMPORTS_PER_SOL
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
    
    // Setup: Create event, campaign, and fund it
    const now = Math.floor(Date.now() / 1000);
    const startTs = new anchor.BN(now + 86400 * 30); // 30 days from now
    const endTs = new anchor.BN(now + 86400 * 31);
    
    await program.methods
      .createEvent(eventId, "https://example.com/metadata.json", startTs, endTs, 1000, 500)
      .accountsPartial({
        event: eventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // Create campaign
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
    
    // Fund campaign (2 contributors)
    for (const contributor of [contributor1, contributor2]) {
      const [contributionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("contribution"), campaignPda.toBuffer(), contributor.publicKey.toBuffer()],
        program.programId
      );
      
      await program.methods
        .contribute(new anchor.BN(6 * anchor.web3.LAMPORTS_PER_SOL))
        .accountsPartial({
          campaign: campaignPda,
          contribution: contributionPda,
          campaignEscrow: campaignEscrowPda,
          contributor: contributor.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([contributor])
        .rpc();
    }
    
    // Finalize campaign
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: campaignPda,
      })
      .rpc();
  });
  
  it("Submits a valid budget with 3 milestones", async () => {
    const totalAmount = new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL);
    const description = "Event budget for venue, marketing, and staff";
    
    const now = Math.floor(Date.now() / 1000);
    const milestones = [
      {
        description: "Venue deposit",
        releasePercentage: 5000, // 50%
        unlockDate: new anchor.BN(now + 86400 * 25), // 25 days from now
      },
      {
        description: "Marketing campaign",
        releasePercentage: 3000, // 30%
        unlockDate: new anchor.BN(now + 86400 * 28), // 28 days from now
      },
      {
        description: "Staff and operations",
        releasePercentage: 2000, // 20%
        unlockDate: new anchor.BN(now + 86400 * 32), // 32 days from now (after event)
      },
    ];
    
    await program.methods
      .submitBudget(totalAmount, description, milestones, new anchor.BN(10)) // 10 seconds for testing
      .accountsPartial({
        campaign: campaignPda,
        budget: budgetPda,
        organizer: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // Verify budget account
    const budget = await program.account.budget.fetch(budgetPda);
    
    expect(budget.campaign.toString()).to.equal(campaignPda.toString());
    expect(budget.totalAmount.toString()).to.equal(totalAmount.toString());
    expect(budget.description).to.equal(description);
    expect(budget.milestones.length).to.equal(3);
    expect(budget.status).to.deep.equal({ pending: {} });
    expect(budget.votesFor.toNumber()).to.equal(0);
    expect(budget.votesAgainst.toNumber()).to.equal(0);
    expect(budget.revisionCount).to.equal(0);
    
    // Check voting period (should be 10 seconds for testing)
    const votingDuration = budget.votingEnd.toNumber() - budget.createdAt.toNumber();
    expect(votingDuration).to.equal(10); // 10 seconds for testing
    
    console.log("✅ Budget submitted successfully");
    console.log(`   Voting ends at: ${new Date(budget.votingEnd.toNumber() * 1000).toISOString()}`);
  });
  
  it("Fails if budget exceeds campaign funds", async () => {
    // Airdrop more SOL to contributor for this test
    const airdropSig1 = await provider.connection.requestAirdrop(
      contributor1.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig1);
    
    const campaign = await program.account.campaign.fetch(campaignPda);
    const excessiveAmount = campaign.totalRaised.add(new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL));
    
    const newEventId = `test-exceed-${Date.now()}`;
    const [newEventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(newEventId)],
      program.programId
    );
    const [newCampaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), newEventPda.toBuffer()],
      program.programId
    );
    const [newBudgetPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget"), newCampaignPda.toBuffer()],
      program.programId
    );
    
    // Setup new campaign
    const now = Math.floor(Date.now() / 1000);
    await program.methods
      .createEvent(newEventId, "https://example.com/metadata.json", 
        new anchor.BN(now + 86400 * 30), new anchor.BN(now + 86400 * 31), 1000, 500)
      .accountsPartial({
        event: newEventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    await program.methods
      .createCampaign(new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL), new anchor.BN(now + 86400))
      .accountsPartial({
        event: newEventPda,
        campaign: newCampaignPda,
        organizer: organizer.publicKey,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    const [newEscrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_escrow"), newCampaignPda.toBuffer()],
      program.programId
    );
    
    const [newContributionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), newCampaignPda.toBuffer(), contributor1.publicKey.toBuffer()],
      program.programId
    );
    
    await program.methods
      .contribute(new anchor.BN(6 * anchor.web3.LAMPORTS_PER_SOL))
      .accountsPartial({
        campaign: newCampaignPda,
        contribution: newContributionPda,
        campaignEscrow: newEscrowPda,
        contributor: contributor1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor1])
      .rpc();
    
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: newCampaignPda,
      })
      .rpc();
    
    try {
      await program.methods
        .submitBudget(
          excessiveAmount,
          "Budget exceeds funds",
          [
            { description: "M1", releasePercentage: 5000, unlockDate: new anchor.BN(now + 86400) },
            { description: "M2", releasePercentage: 3000, unlockDate: new anchor.BN(now + 86400 * 2) },
            { description: "M3", releasePercentage: 2000, unlockDate: new anchor.BN(now + 86400 * 3) },
          ],
          new anchor.BN(10)
        )
        .accountsPartial({
          campaign: newCampaignPda,
          budget: newBudgetPda,
          organizer: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([organizer])
        .rpc();
      
      expect.fail("Should have failed with budget exceeds funds");
    } catch (err) {
      expect(err.message).to.include("BudgetExceedsFunds");
    }
  });
  
  it("Fails if milestone percentages don't sum to 100%", async () => {
    // Airdrop more SOL to contributor for this test
    const airdropSig2 = await provider.connection.requestAirdrop(
      contributor1.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig2);
    
    const newEventId = `test-percent-${Date.now()}`;
    const [newEventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(newEventId)],
      program.programId
    );
    const [newCampaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), newEventPda.toBuffer()],
      program.programId
    );
    const [newBudgetPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget"), newCampaignPda.toBuffer()],
      program.programId
    );
    
    const now = Math.floor(Date.now() / 1000);
    await program.methods
      .createEvent(newEventId, "https://example.com/metadata.json", 
        new anchor.BN(now + 86400 * 30), new anchor.BN(now + 86400 * 31), 1000, 500)
      .accountsPartial({
        event: newEventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    await program.methods
      .createCampaign(new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL), new anchor.BN(now + 86400))
      .accountsPartial({
        event: newEventPda,
        campaign: newCampaignPda,
        organizer: organizer.publicKey,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    const [newEscrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_escrow"), newCampaignPda.toBuffer()],
      program.programId
    );
    
    const [newContributionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), newCampaignPda.toBuffer(), contributor1.publicKey.toBuffer()],
      program.programId
    );
    
    await program.methods
      .contribute(new anchor.BN(6 * anchor.web3.LAMPORTS_PER_SOL))
      .accountsPartial({
        campaign: newCampaignPda,
        contribution: newContributionPda,
        campaignEscrow: newEscrowPda,
        contributor: contributor1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor1])
      .rpc();
    
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: newCampaignPda,
      })
      .rpc();
    
    try {
      await program.methods
        .submitBudget(
          new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL),
          "Invalid percentages",
          [
            { description: "M1", releasePercentage: 4000, unlockDate: new anchor.BN(now + 86400) }, // 40%
            { description: "M2", releasePercentage: 3000, unlockDate: new anchor.BN(now + 86400 * 2) }, // 30%
            { description: "M3", releasePercentage: 2000, unlockDate: new anchor.BN(now + 86400 * 3) }, // 20% = 90% total!
          ],
          new anchor.BN(10)
        )
        .accountsPartial({
          campaign: newCampaignPda,
          budget: newBudgetPda,
          organizer: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([organizer])
        .rpc();
      
      expect.fail("Should have failed with invalid percentages");
    } catch (err) {
      expect(err.message).to.include("InvalidMilestonePercentages");
    }
  });
});
