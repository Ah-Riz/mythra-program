import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MythraProgram } from "../target/types/mythra_program";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("finalize_campaign", () => {
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
  
  it("Finalizes a successful campaign (goal reached)", async () => {
    const eventId = `test-event-success-${Date.now()}`;
    
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
    
    // Create campaign
    const fundingGoal = new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL);
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
    
    // Create contributors
    const contributors = [Keypair.generate(), Keypair.generate()];
    for (const contributor of contributors) {
      const sig = await provider.connection.requestAirdrop(
        contributor.publicKey,
        5 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }
    
    // Make contributions to reach goal
    for (const contributor of contributors) {
      const [contributionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("contribution"), campaignPda.toBuffer(), contributor.publicKey.toBuffer()],
        program.programId
      );
      
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
    }
    
    // Finalize campaign
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: campaignPda,
      })
      .rpc();
    
    // Verify campaign is funded
    const campaign = await program.account.campaign.fetch(campaignPda);
    expect(campaign.status).to.deep.equal({ funded: {} });
    expect(campaign.totalRaised.toNumber()).to.be.greaterThan(campaign.fundingGoal.toNumber());
  });
  
  it("Finalizes a failed campaign (goal not reached)", async () => {
    const eventId = `test-event-fail-${Date.now()}`;
    
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
    const shortDeadline = new anchor.BN(now + 2); // 2 seconds
    
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
    
    // Make small contribution (not enough to reach goal)
    const contributor = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      contributor.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
    
    const [contributionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), contributor.publicKey.toBuffer()],
      program.programId
    );
    
    await program.methods
      .contribute(new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL))
      .accountsPartial({
        campaign: campaignPda,
        contribution: contributionPda,
        campaignEscrow: campaignEscrowPda,
        contributor: contributor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor])
      .rpc();
    
    // Wait for deadline to pass
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Finalize campaign
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: campaignPda,
      })
      .rpc();
    
    // Verify campaign failed
    const campaign = await program.account.campaign.fetch(campaignPda);
    expect(campaign.status).to.deep.equal({ failed: {} });
    expect(campaign.totalRaised.toNumber()).to.be.lessThan(campaign.fundingGoal.toNumber());
  });
  
  it("Can finalize early if goal reached before deadline", async () => {
    const eventId = `test-event-early-${Date.now()}`;
    
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
    
    // Create campaign with long deadline
    const fundingGoal = new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL);
    const longDeadline = new anchor.BN(now + 86400 * 7); // 7 days
    
    await program.methods
      .createCampaign(fundingGoal, longDeadline)
      .accountsPartial({
        event: eventPda,
        campaign: campaignPda,
        organizer: organizer.publicKey,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // Reach goal immediately
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
    
    // Finalize immediately (don't wait for deadline)
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: campaignPda,
      })
      .rpc();
    
    // Verify campaign is funded
    const campaign = await program.account.campaign.fetch(campaignPda);
    expect(campaign.status).to.deep.equal({ funded: {} });
  });
  
  it("Fails to finalize if already finalized", async () => {
    const eventId = `test-event-double-${Date.now()}`;
    
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
    
    // Create event and campaign
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
    
    // Contribute to reach goal
    const contributor = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(contributor.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
    
    const [contributionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), contributor.publicKey.toBuffer()],
      program.programId
    );
    
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
    
    // Finalize first time
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: campaignPda,
      })
      .rpc();
    
    // Try to finalize again
    try {
      await program.methods
        .finalizeCampaign()
        .accountsPartial({
          campaign: campaignPda,
        })
        .rpc();
      
      expect.fail("Should have failed with already finalized");
    } catch (err) {
      expect(err.message).to.include("AlreadyFinalized");
    }
  });
});
