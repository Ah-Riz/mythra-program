import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MythraProgram } from "../target/types/mythra_program";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("claim_refund", () => {
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
  
  it("Contributors can claim refunds from failed campaign", async () => {
    const eventId = `test-event-refund-${Date.now()}`;
    
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
    
    // Create event
    const now = Math.floor(Date.now() / 1000);
    const startTs = new anchor.BN(now + 86400 * 30);
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
    
    // Create campaign with short deadline
    const fundingGoal = new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL);
    const shortDeadline = new anchor.BN(now + 2);
    
    await program.methods
      .createCampaign(fundingGoal, shortDeadline)
      .accountsPartial({
        event: eventPda,
        campaign: campaignPda,
        organizer: organizer.publicKey,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // Create contributors and make contributions
    const contributor1 = Keypair.generate();
    const contributor2 = Keypair.generate();
    
    for (const contributor of [contributor1, contributor2]) {
      const sig = await provider.connection.requestAirdrop(
        contributor.publicKey,
        5 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }
    
    const contribution1Amount = new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL);
    const contribution2Amount = new anchor.BN(3 * anchor.web3.LAMPORTS_PER_SOL);
    
    const [contribution1Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), contributor1.publicKey.toBuffer()],
      program.programId
    );
    
    const [contribution2Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), contributor2.publicKey.toBuffer()],
      program.programId
    );
    
    await program.methods
      .contribute(contribution1Amount)
      .accountsPartial({
        campaign: campaignPda,
        contribution: contribution1Pda,
        campaignEscrow: campaignEscrowPda,
        contributor: contributor1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor1])
      .rpc();
    
    await program.methods
      .contribute(contribution2Amount)
      .accountsPartial({
        campaign: campaignPda,
        contribution: contribution2Pda,
        campaignEscrow: campaignEscrowPda,
        contributor: contributor2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor2])
      .rpc();
    
    // Wait for deadline
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Finalize campaign as failed
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: campaignPda,
      })
      .rpc();
    
    const campaign = await program.account.campaign.fetch(campaignPda);
    expect(campaign.status).to.deep.equal({ failed: {} });
    
    // Claim refunds
    const contrib1BalanceBefore = await provider.connection.getBalance(contributor1.publicKey);
    const contrib2BalanceBefore = await provider.connection.getBalance(contributor2.publicKey);
    
    await program.methods
      .claimRefund()
      .accountsPartial({
        campaign: campaignPda,
        contribution: contribution1Pda,
        campaignEscrow: campaignEscrowPda,
        contributor: contributor1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor1])
      .rpc();
    
    await program.methods
      .claimRefund()
      .accountsPartial({
        campaign: campaignPda,
        contribution: contribution2Pda,
        campaignEscrow: campaignEscrowPda,
        contributor: contributor2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor2])
      .rpc();
    
    // Verify refunds received
    const contrib1BalanceAfter = await provider.connection.getBalance(contributor1.publicKey);
    const contrib2BalanceAfter = await provider.connection.getBalance(contributor2.publicKey);
    
    // Account for transaction fees (approximate check)
    const contrib1Refund = contrib1BalanceAfter - contrib1BalanceBefore;
    const contrib2Refund = contrib2BalanceAfter - contrib2BalanceBefore;
    
    expect(contrib1Refund).to.be.closeTo(contribution1Amount.toNumber(), 10000); // Within 0.00001 SOL
    expect(contrib2Refund).to.be.closeTo(contribution2Amount.toNumber(), 10000);
    
    // Verify contribution records updated
    const contribution1 = await program.account.contribution.fetch(contribution1Pda);
    const contribution2 = await program.account.contribution.fetch(contribution2Pda);
    
    expect(contribution1.refunded).to.be.true;
    expect(contribution2.refunded).to.be.true;
  });
  
  it("Fails to claim refund twice", async () => {
    const eventId = `test-event-double-refund-${Date.now()}`;
    
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
    
    // Setup
    const now = Math.floor(Date.now() / 1000);
    const startTs = new anchor.BN(now + 86400 * 30);
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
    const sig = await provider.connection.requestAirdrop(
      contributor.publicKey,
      3 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
    
    const [contributionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), contributor.publicKey.toBuffer()],
      program.programId
    );
    
    await program.methods
      .contribute(new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL))
      .accountsPartial({
        campaign: campaignPda,
        contribution: contributionPda,
        campaignEscrow: campaignEscrowPda,
        contributor: contributor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor])
      .rpc();
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: campaignPda,
      })
      .rpc();
    
    // First refund claim
    await program.methods
      .claimRefund()
      .accountsPartial({
        campaign: campaignPda,
        contribution: contributionPda,
        campaignEscrow: campaignEscrowPda,
        contributor: contributor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor])
      .rpc();
    
    // Try to claim again
    try {
      await program.methods
        .claimRefund()
        .accountsPartial({
          campaign: campaignPda,
          contribution: contributionPda,
          campaignEscrow: campaignEscrowPda,
          contributor: contributor.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([contributor])
        .rpc();
      
      expect.fail("Should have failed with already refunded");
    } catch (err) {
      expect(err.message).to.include("ContributionAlreadyRefunded");
    }
  });
  
  it("Fails to claim refund from successful campaign", async () => {
    const eventId = `test-event-no-refund-${Date.now()}`;
    
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
    
    // Setup successful campaign
    const now = Math.floor(Date.now() / 1000);
    const startTs = new anchor.BN(now + 86400 * 30);
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
    
    await program.methods
      .createCampaign(new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL), new anchor.BN(now + 86400))
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
    const sig = await provider.connection.requestAirdrop(
      contributor.publicKey,
      5 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
    
    const [contributionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), contributor.publicKey.toBuffer()],
      program.programId
    );
    
    // Contribute enough to reach goal
    await program.methods
      .contribute(new anchor.BN(3 * anchor.web3.LAMPORTS_PER_SOL))
      .accountsPartial({
        campaign: campaignPda,
        contribution: contributionPda,
        campaignEscrow: campaignEscrowPda,
        contributor: contributor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor])
      .rpc();
    
    // Finalize as successful
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: campaignPda,
      })
      .rpc();
    
    const campaign = await program.account.campaign.fetch(campaignPda);
    expect(campaign.status).to.deep.equal({ funded: {} });
    
    // Try to claim refund
    try {
      await program.methods
        .claimRefund()
        .accountsPartial({
          campaign: campaignPda,
          contribution: contributionPda,
          campaignEscrow: campaignEscrowPda,
          contributor: contributor.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([contributor])
        .rpc();
      
      expect.fail("Should have failed - cannot refund successful campaign");
    } catch (err) {
      expect(err.message).to.include("CannotRefundFundedCampaign");
    }
  });
});
