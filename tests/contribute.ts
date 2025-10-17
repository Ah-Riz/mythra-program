import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MythraProgram } from "../target/types/mythra_program";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("contribute", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  
  let organizer: Keypair;
  let contributor1: Keypair;
  let contributor2: Keypair;
  let contributor3: Keypair;
  let eventPda: PublicKey;
  let campaignPda: PublicKey;
  let campaignEscrowPda: PublicKey;
  let treasury: Keypair;
  
  const eventId = `test-event-contrib-${Date.now()}`;
  
  before(async () => {
    organizer = Keypair.generate();
    contributor1 = Keypair.generate();
    contributor2 = Keypair.generate();
    contributor3 = Keypair.generate();
    treasury = Keypair.generate();
    
    // Airdrop SOL
    for (const wallet of [organizer, contributor1, contributor2, contributor3]) {
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
    const fundingGoal = new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL); // 10 SOL
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
  });
  
  it("Contributor can contribute to campaign", async () => {
    const [contributionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), contributor1.publicKey.toBuffer()],
      program.programId
    );
    
    const amount = new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL); // 2 SOL
    
    const escrowBalanceBefore = await provider.connection.getBalance(campaignEscrowPda);
    
    await program.methods
      .contribute(amount)
      .accountsPartial({
        campaign: campaignPda,
        contribution: contributionPda,
        campaignEscrow: campaignEscrowPda,
        contributor: contributor1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor1])
      .rpc();
    
    // Verify contribution account
    const contribution = await program.account.contribution.fetch(contributionPda);
    expect(contribution.campaign.toString()).to.equal(campaignPda.toString());
    expect(contribution.contributor.toString()).to.equal(contributor1.publicKey.toString());
    expect(contribution.amount.toString()).to.equal(amount.toString());
    expect(contribution.refunded).to.be.false;
    expect(contribution.profitClaimed).to.be.false;
    
    // Verify campaign updated
    const campaign = await program.account.campaign.fetch(campaignPda);
    expect(campaign.totalRaised.toString()).to.equal(amount.toString());
    expect(campaign.totalContributors).to.equal(1);
    
    // Verify escrow received funds
    const escrowBalanceAfter = await provider.connection.getBalance(campaignEscrowPda);
    expect(escrowBalanceAfter - escrowBalanceBefore).to.equal(amount.toNumber());
  });
  
  it("Multiple contributors can contribute", async () => {
    const [contribution2Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), contributor2.publicKey.toBuffer()],
      program.programId
    );
    
    const [contribution3Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), contributor3.publicKey.toBuffer()],
      program.programId
    );
    
    const amount2 = new anchor.BN(3 * anchor.web3.LAMPORTS_PER_SOL);
    const amount3 = new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL);
    
    // Contributor 2
    await program.methods
      .contribute(amount2)
      .accountsPartial({
        campaign: campaignPda,
        contribution: contribution2Pda,
        campaignEscrow: campaignEscrowPda,
        contributor: contributor2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor2])
      .rpc();
    
    // Contributor 3
    await program.methods
      .contribute(amount3)
      .accountsPartial({
        campaign: campaignPda,
        contribution: contribution3Pda,
        campaignEscrow: campaignEscrowPda,
        contributor: contributor3.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor3])
      .rpc();
    
    // Verify campaign totals
    const campaign = await program.account.campaign.fetch(campaignPda);
    const expectedTotal = 2 + 3 + 5; // 10 SOL total
    expect(campaign.totalRaised.toNumber() / anchor.web3.LAMPORTS_PER_SOL).to.equal(expectedTotal);
    expect(campaign.totalContributors).to.equal(3);
    
    // Goal should be reached (10 SOL raised, 10 SOL goal)
    const goalReached = campaign.totalRaised.gte(campaign.fundingGoal);
    expect(goalReached).to.be.true;
  });
  
  it("Fails if contribution amount is zero", async () => {
    const newContributor = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      newContributor.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
    
    const [contributionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), newContributor.publicKey.toBuffer()],
      program.programId
    );
    
    try {
      await program.methods
        .contribute(new anchor.BN(0))
        .accountsPartial({
          campaign: campaignPda,
          contribution: contributionPda,
          campaignEscrow: campaignEscrowPda,
          contributor: newContributor.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([newContributor])
        .rpc();
      
      expect.fail("Should have failed with zero amount");
    } catch (err) {
      expect(err.message).to.include("InvalidContributionAmount");
    }
  });
  
  it("Fails if campaign deadline has passed", async () => {
    // Create a new campaign with past deadline
    const pastEventId = `test-event-past-${Date.now()}`;
    const [pastEventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(pastEventId)],
      program.programId
    );
    const [pastCampaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), pastEventPda.toBuffer()],
      program.programId
    );
    
    const now = Math.floor(Date.now() / 1000);
    const startTs = new anchor.BN(now + 86400 * 30);
    const endTs = new anchor.BN(now + 86400 * 31);
    
    await program.methods
      .createEvent(pastEventId, "https://example.com/metadata.json", startTs, endTs, 1000, 500)
      .accountsPartial({
        event: pastEventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // Create campaign with very short deadline (1 second)
    const shortDeadline = new anchor.BN(now + 1);
    await program.methods
      .createCampaign(new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL), shortDeadline)
      .accountsPartial({
        event: pastEventPda,
        campaign: pastCampaignPda,
        organizer: organizer.publicKey,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // Wait for deadline to pass
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const [pastEscrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_escrow"), pastCampaignPda.toBuffer()],
      program.programId
    );
    
    const [contributionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), pastCampaignPda.toBuffer(), contributor1.publicKey.toBuffer()],
      program.programId
    );
    
    try {
      await program.methods
        .contribute(new anchor.BN(anchor.web3.LAMPORTS_PER_SOL))
        .accountsPartial({
          campaign: pastCampaignPda,
          contribution: contributionPda,
          campaignEscrow: pastEscrowPda,
          contributor: contributor1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([contributor1])
        .rpc();
      
      expect.fail("Should have failed with deadline passed");
    } catch (err) {
      expect(err.message).to.include("CampaignDeadlinePassed");
    }
  });
});
