import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MythraProgram } from "../target/types/mythra_program";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("create_campaign", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  
  let organizer: Keypair;
  let eventPda: PublicKey;
  let campaignPda: PublicKey;
  let treasury: Keypair;
  
  const eventId = `test-event-${Date.now()}`;
  const metadataUri = "https://example.com/metadata.json";
  
  before(async () => {
    organizer = Keypair.generate();
    treasury = Keypair.generate();
    
    // Airdrop SOL to organizer
    const signature = await provider.connection.requestAirdrop(
      organizer.publicKey,
      5 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature);
    
    // Derive event PDA
    [eventPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("event"),
        organizer.publicKey.toBuffer(),
        Buffer.from(eventId),
      ],
      program.programId
    );
    
    // Derive campaign PDA
    [campaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), eventPda.toBuffer()],
      program.programId
    );
    
    // Create event first
    const now = Math.floor(Date.now() / 1000);
    const startTs = new anchor.BN(now + 86400 * 30); // 30 days from now
    const endTs = new anchor.BN(now + 86400 * 31); // 31 days from now
    
    await program.methods
      .createEvent(
        eventId,
        metadataUri,
        startTs,
        endTs,
        1000, // total supply
        500   // 5% platform fee
      )
      .accountsPartial({
        event: eventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
  });
  
  it("Creates a campaign successfully", async () => {
    const now = Math.floor(Date.now() / 1000);
    const fundingGoal = new anchor.BN(100 * anchor.web3.LAMPORTS_PER_SOL); // 100 SOL
    const deadline = new anchor.BN(now + 86400 * 7); // 7 days from now
    
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
    
    // Verify campaign account
    const campaign = await program.account.campaign.fetch(campaignPda);
    
    expect(campaign.event.toString()).to.equal(eventPda.toString());
    expect(campaign.organizer.toString()).to.equal(organizer.publicKey.toString());
    expect(campaign.fundingGoal.toString()).to.equal(fundingGoal.toString());
    expect(campaign.totalRaised.toString()).to.equal("0");
    expect(campaign.deadline.toString()).to.equal(deadline.toString());
    expect(campaign.status).to.deep.equal({ pending: {} });
    expect(campaign.totalContributors).to.equal(0);
    
    // Verify event was updated
    const event = await program.account.event.fetch(eventPda);
    expect(event.crowdfundingEnabled).to.be.true;
    expect(event.campaign.toString()).to.equal(campaignPda.toString());
  });
  
  it("Fails if deadline is in the past", async () => {
    const now = Math.floor(Date.now() / 1000);
    const fundingGoal = new anchor.BN(100 * anchor.web3.LAMPORTS_PER_SOL);
    const pastDeadline = new anchor.BN(now - 86400); // 1 day ago
    
    const newEventId = `test-event-past-${Date.now()}`;
    const [newEventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(newEventId)],
      program.programId
    );
    const [newCampaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), newEventPda.toBuffer()],
      program.programId
    );
    
    // Create new event
    const startTs = new anchor.BN(now + 86400 * 30);
    const endTs = new anchor.BN(now + 86400 * 31);
    
    await program.methods
      .createEvent(newEventId, metadataUri, startTs, endTs, 1000, 500)
      .accountsPartial({
        event: newEventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    try {
      await program.methods
        .createCampaign(fundingGoal, pastDeadline)
        .accountsPartial({
          event: newEventPda,
          campaign: newCampaignPda,
          organizer: organizer.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([organizer])
        .rpc();
      
      expect.fail("Should have failed with deadline in past");
    } catch (err) {
      expect(err.message).to.include("DeadlineInPast");
    }
  });
  
  it("Fails if deadline is after event start time", async () => {
    const now = Math.floor(Date.now() / 1000);
    const fundingGoal = new anchor.BN(100 * anchor.web3.LAMPORTS_PER_SOL);
    const lateDeadline = new anchor.BN(now + 86400 * 35); // After event starts
    
    const newEventId = `test-event-late-${Date.now()}`;
    const [newEventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(newEventId)],
      program.programId
    );
    const [newCampaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), newEventPda.toBuffer()],
      program.programId
    );
    
    // Create new event
    const startTs = new anchor.BN(now + 86400 * 30);
    const endTs = new anchor.BN(now + 86400 * 31);
    
    await program.methods
      .createEvent(newEventId, metadataUri, startTs, endTs, 1000, 500)
      .accountsPartial({
        event: newEventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    try {
      await program.methods
        .createCampaign(fundingGoal, lateDeadline)
        .accountsPartial({
          event: newEventPda,
          campaign: newCampaignPda,
          organizer: organizer.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([organizer])
        .rpc();
      
      expect.fail("Should have failed with deadline after event start");
    } catch (err) {
      expect(err.message).to.include("DeadlineAfterEventStart");
    }
  });
  
  it("Fails if non-organizer tries to create campaign", async () => {
    const now = Math.floor(Date.now() / 1000);
    const fundingGoal = new anchor.BN(100 * anchor.web3.LAMPORTS_PER_SOL);
    const deadline = new anchor.BN(now + 86400 * 7);
    
    const nonOrganizer = Keypair.generate();
    
    // Airdrop to non-organizer
    const sig = await provider.connection.requestAirdrop(
      nonOrganizer.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
    
    const newEventId = `test-event-unauth-${Date.now()}`;
    const [newEventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(newEventId)],
      program.programId
    );
    const [newCampaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), newEventPda.toBuffer()],
      program.programId
    );
    
    // Create new event
    const startTs = new anchor.BN(now + 86400 * 30);
    const endTs = new anchor.BN(now + 86400 * 31);
    
    await program.methods
      .createEvent(newEventId, metadataUri, startTs, endTs, 1000, 500)
      .accountsPartial({
        event: newEventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    try {
      await program.methods
        .createCampaign(fundingGoal, deadline)
        .accountsPartial({
          event: newEventPda,
          campaign: newCampaignPda,
          organizer: nonOrganizer.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([nonOrganizer])
        .rpc();
      
      expect.fail("Should have failed with unauthorized");
    } catch (err) {
      expect(err.message).to.include("UnauthorizedCampaignAction");
    }
  });
});
