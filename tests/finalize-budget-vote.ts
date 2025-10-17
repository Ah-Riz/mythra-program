import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MythraProgram } from "../target/types/mythra_program";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("finalize_budget_vote", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  
  let organizer: Keypair;
  let treasury: Keypair;
  
  before(async () => {
    organizer = Keypair.generate();
    treasury = Keypair.generate();
    
    const sig = await provider.connection.requestAirdrop(
      organizer.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
  });
  
  it("Finalizes approved budget (votes_for > votes_against)", async () => {
    const eventId = `finalize-approve-${Date.now()}`;
    const [eventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(eventId)],
      program.programId
    );
    const [campaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), eventPda.toBuffer()],
      program.programId
    );
    const [budgetPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget"), campaignPda.toBuffer()],
      program.programId
    );
    
    // Setup
    const now = Math.floor(Date.now() / 1000);
    await program.methods
      .createEvent(eventId, "https://example.com/metadata.json", 
        new anchor.BN(now + 86400 * 30), new anchor.BN(now + 86400 * 31), 1000, 500)
      .accountsPartial({
        event: eventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    await program.methods
      .createCampaign(new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL), new anchor.BN(now + 2))
      .accountsPartial({
        event: eventPda,
        campaign: campaignPda,
        organizer: organizer.publicKey,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // Fund and finalize campaign
    const contributor = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(contributor.publicKey, 15 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
    
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
      program.programId
    );
    const [contributionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), contributor.publicKey.toBuffer()],
      program.programId
    );
    
    await program.methods
      .contribute(new anchor.BN(12 * anchor.web3.LAMPORTS_PER_SOL))
      .accountsPartial({
        campaign: campaignPda,
        contribution: contributionPda,
        campaignEscrow: escrowPda,
        contributor: contributor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor])
      .rpc();
    
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: campaignPda,
      })
      .rpc();
    
    // Submit budget with short voting period
    await program.methods
      .submitBudget(
        new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL),
        "Budget with short vote",
        [
          { description: "M1", releasePercentage: 5000, unlockDate: new anchor.BN(now + 86400 * 25) },
          { description: "M2", releasePercentage: 3000, unlockDate: new anchor.BN(now + 86400 * 28) },
          { description: "M3", releasePercentage: 2000, unlockDate: new anchor.BN(now + 86400 * 32) },
        ],
        new anchor.BN(10) // 10 seconds for testing
      )
      .accountsPartial({
        campaign: campaignPda,
        budget: budgetPda,
        organizer: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // Vote YES
    const [votePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget_vote"), budgetPda.toBuffer(), contributor.publicKey.toBuffer()],
      program.programId
    );
    
    await program.methods
      .voteOnBudget(true)
      .accountsPartial({
        budget: budgetPda,
        campaign: campaignPda,
        contribution: contributionPda,
        vote: votePda,
        voter: contributor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor])
      .rpc();
    
    // Wait for voting period (10 seconds + buffer)
    await new Promise(resolve => setTimeout(resolve, 11000));
    
    // Finalize
    await program.methods
      .finalizeBudgetVote()
      .accountsPartial({
        budget: budgetPda,
      })
      .rpc();
    
    // Verify approved
    const budget = await program.account.budget.fetch(budgetPda);
    expect(budget.status).to.deep.equal({ approved: {} });
    console.log("✅ Budget APPROVED after voting period");
  });
  
  it("Finalizes rejected budget (votes_against > votes_for)", async () => {
    const eventId = `finalize-reject-${Date.now()}`;
    const [eventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(eventId)],
      program.programId
    );
    const [campaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), eventPda.toBuffer()],
      program.programId
    );
    const [budgetPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget"), campaignPda.toBuffer()],
      program.programId
    );
    
    // Setup
    const now = Math.floor(Date.now() / 1000);
    await program.methods
      .createEvent(eventId, "https://example.com/metadata.json", 
        new anchor.BN(now + 86400 * 30), new anchor.BN(now + 86400 * 31), 1000, 500)
      .accountsPartial({
        event: eventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    await program.methods
      .createCampaign(new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL), new anchor.BN(now + 2))
      .accountsPartial({
        event: eventPda,
        campaign: campaignPda,
        organizer: organizer.publicKey,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    const contributor = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(contributor.publicKey, 15 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
    
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
      program.programId
    );
    const [contributionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), contributor.publicKey.toBuffer()],
      program.programId
    );
    
    await program.methods
      .contribute(new anchor.BN(12 * anchor.web3.LAMPORTS_PER_SOL))
      .accountsPartial({
        campaign: campaignPda,
        contribution: contributionPda,
        campaignEscrow: escrowPda,
        contributor: contributor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor])
      .rpc();
    
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: campaignPda,
      })
      .rpc();
    
    await program.methods
      .submitBudget(
        new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL),
        "Budget to reject",
        [
          { description: "M1", releasePercentage: 5000, unlockDate: new anchor.BN(now + 86400 * 25) },
          { description: "M2", releasePercentage: 3000, unlockDate: new anchor.BN(now + 86400 * 28) },
          { description: "M3", releasePercentage: 2000, unlockDate: new anchor.BN(now + 86400 * 32) },
        ],
        new anchor.BN(10) // 10 seconds for testing
      )
      .accountsPartial({
        campaign: campaignPda,
        budget: budgetPda,
        organizer: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // Vote NO
    const [votePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget_vote"), budgetPda.toBuffer(), contributor.publicKey.toBuffer()],
      program.programId
    );
    
    await program.methods
      .voteOnBudget(false) // Reject
      .accountsPartial({
        budget: budgetPda,
        campaign: campaignPda,
        contribution: contributionPda,
        vote: votePda,
        voter: contributor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor])
      .rpc();
    
    // Wait for voting period (10 seconds + buffer)
    await new Promise(resolve => setTimeout(resolve, 11000));
    
    // Finalize
    await program.methods
      .finalizeBudgetVote()
      .accountsPartial({
        budget: budgetPda,
      })
      .rpc();
    
    // Verify rejected
    const budget = await program.account.budget.fetch(budgetPda);
    expect(budget.status).to.deep.equal({ rejected: {} });
    console.log("✅ Budget REJECTED after voting period");
  });
  
  it("Fails if voting period hasn't ended yet", async () => {
    const eventId = `finalize-early-${Date.now()}`;
    const [eventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(eventId)],
      program.programId
    );
    const [campaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), eventPda.toBuffer()],
      program.programId
    );
    const [budgetPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget"), campaignPda.toBuffer()],
      program.programId
    );
    
    const now = Math.floor(Date.now() / 1000);
    await program.methods
      .createEvent(eventId, "https://example.com/metadata.json", 
        new anchor.BN(now + 86400 * 30), new anchor.BN(now + 86400 * 31), 1000, 500)
      .accountsPartial({
        event: eventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    await program.methods
      .createCampaign(new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL), new anchor.BN(now + 2))
      .accountsPartial({
        event: eventPda,
        campaign: campaignPda,
        organizer: organizer.publicKey,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    const contributor = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(contributor.publicKey, 15 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
    
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
      program.programId
    );
    const [contributionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), contributor.publicKey.toBuffer()],
      program.programId
    );
    
    await program.methods
      .contribute(new anchor.BN(12 * anchor.web3.LAMPORTS_PER_SOL))
      .accountsPartial({
        campaign: campaignPda,
        contribution: contributionPda,
        campaignEscrow: escrowPda,
        contributor: contributor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor])
      .rpc();
    
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: campaignPda,
      })
      .rpc();
    
    await program.methods
      .submitBudget(
        new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL),
        "Budget with full voting period",
        [
          { description: "M1", releasePercentage: 5000, unlockDate: new anchor.BN(now + 86400 * 25) },
          { description: "M2", releasePercentage: 3000, unlockDate: new anchor.BN(now + 86400 * 28) },
          { description: "M3", releasePercentage: 2000, unlockDate: new anchor.BN(now + 86400 * 32) },
        ],
        new anchor.BN(259200) // 3 days in seconds for testing that finalization fails before period ends
      )
      .accountsPartial({
        campaign: campaignPda,
        budget: budgetPda,
        organizer: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // Try to finalize immediately (should fail)
    try {
      await program.methods
        .finalizeBudgetVote()
        .accountsPartial({
          budget: budgetPda,
        })
        .rpc();
      
      expect.fail("Should have failed with voting period not ended");
    } catch (err) {
      expect(err.message).to.include("VotingPeriodNotEnded");
    }
  });
});
