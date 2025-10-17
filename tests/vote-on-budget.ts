import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MythraProgram } from "../target/types/mythra_program";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("vote_on_budget", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  
  let organizer: Keypair;
  let contributor1: Keypair;
  let contributor2: Keypair;
  let contributor3: Keypair;
  let eventPda: PublicKey;
  let campaignPda: PublicKey;
  let budgetPda: PublicKey;
  
  const eventId = `vote-test-${Date.now()}`;
  
  before(async () => {
    organizer = Keypair.generate();
    contributor1 = Keypair.generate();
    contributor2 = Keypair.generate();
    contributor3 = Keypair.generate();
    
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
    
    [budgetPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget"), campaignPda.toBuffer()],
      program.programId
    );
    
    // Setup: Create event, campaign, fund it, and submit budget
    const treasury = Keypair.generate();
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
      .createCampaign(new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL), new anchor.BN(now + 86400 * 7))
      .accountsPartial({
        event: eventPda,
        campaign: campaignPda,
        organizer: organizer.publicKey,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
    
    // 3 contributors with different amounts
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
      program.programId
    );
    
    const contributions = [
      { contributor: contributor1, amount: new anchor.BN(5 * anchor.web3.LAMPORTS_PER_SOL) },
      { contributor: contributor2, amount: new anchor.BN(3 * anchor.web3.LAMPORTS_PER_SOL) },
      { contributor: contributor3, amount: new anchor.BN(3 * anchor.web3.LAMPORTS_PER_SOL) },
    ];
    
    for (const { contributor, amount } of contributions) {
      const [contributionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("contribution"), campaignPda.toBuffer(), contributor.publicKey.toBuffer()],
        program.programId
      );
      
      await program.methods
        .contribute(amount)
        .accountsPartial({
          campaign: campaignPda,
          contribution: contributionPda,
          campaignEscrow: escrowPda,
          contributor: contributor.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([contributor])
        .rpc();
    }
    
    await program.methods
      .finalizeCampaign()
      .accountsPartial({
        campaign: campaignPda,
      })
      .rpc();
    
    // Submit budget
    await program.methods
      .submitBudget(
        new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL),
        "Test budget for voting",
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
  });
  
  it("Contributor votes YES on budget", async () => {
    const [contribution1Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), contributor1.publicKey.toBuffer()],
      program.programId
    );
    
    const [vote1Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget_vote"), budgetPda.toBuffer(), contributor1.publicKey.toBuffer()],
      program.programId
    );
    
    await program.methods
      .voteOnBudget(true) // Approve
      .accountsPartial({
        budget: budgetPda,
        campaign: campaignPda,
        contribution: contribution1Pda,
        vote: vote1Pda,
        voter: contributor1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor1])
      .rpc();
    
    // Verify vote record
    const vote = await program.account.budgetVote.fetch(vote1Pda);
    expect(vote.budget.toString()).to.equal(budgetPda.toString());
    expect(vote.voter.toString()).to.equal(contributor1.publicKey.toString());
    expect(vote.approve).to.be.true;
    expect(vote.contributionAmount.toNumber()).to.equal(5 * anchor.web3.LAMPORTS_PER_SOL);
    
    // Verify budget vote tally updated
    const budget = await program.account.budget.fetch(budgetPda);
    expect(budget.votesFor.toNumber()).to.equal(5 * anchor.web3.LAMPORTS_PER_SOL);
    expect(budget.votesAgainst.toNumber()).to.equal(0);
    
    console.log("✅ Contributor 1 voted YES with 5 SOL voting power");
  });
  
  it("Contributor votes NO on budget", async () => {
    const [contribution2Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), contributor2.publicKey.toBuffer()],
      program.programId
    );
    
    const [vote2Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget_vote"), budgetPda.toBuffer(), contributor2.publicKey.toBuffer()],
      program.programId
    );
    
    await program.methods
      .voteOnBudget(false) // Reject
      .accountsPartial({
        budget: budgetPda,
        campaign: campaignPda,
        contribution: contribution2Pda,
        vote: vote2Pda,
        voter: contributor2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor2])
      .rpc();
    
    // Verify vote record
    const vote = await program.account.budgetVote.fetch(vote2Pda);
    expect(vote.approve).to.be.false;
    
    // Verify budget tally
    const budget = await program.account.budget.fetch(budgetPda);
    expect(budget.votesFor.toNumber()).to.equal(5 * anchor.web3.LAMPORTS_PER_SOL);
    expect(budget.votesAgainst.toNumber()).to.equal(3 * anchor.web3.LAMPORTS_PER_SOL);
    
    console.log("✅ Contributor 2 voted NO with 3 SOL voting power");
    console.log(`   Current tally: ${budget.votesFor.toNumber() / anchor.web3.LAMPORTS_PER_SOL} FOR vs ${budget.votesAgainst.toNumber() / anchor.web3.LAMPORTS_PER_SOL} AGAINST`);
  });
  
  it("Third contributor votes YES (majority achieved)", async () => {
    const [contribution3Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), contributor3.publicKey.toBuffer()],
      program.programId
    );
    
    const [vote3Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget_vote"), budgetPda.toBuffer(), contributor3.publicKey.toBuffer()],
      program.programId
    );
    
    await program.methods
      .voteOnBudget(true) // Approve
      .accountsPartial({
        budget: budgetPda,
        campaign: campaignPda,
        contribution: contribution3Pda,
        vote: vote3Pda,
        voter: contributor3.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([contributor3])
      .rpc();
    
    // Verify final tally
    const budget = await program.account.budget.fetch(budgetPda);
    expect(budget.votesFor.toNumber()).to.equal(8 * anchor.web3.LAMPORTS_PER_SOL); // 5 + 3
    expect(budget.votesAgainst.toNumber()).to.equal(3 * anchor.web3.LAMPORTS_PER_SOL);
    
    console.log("✅ Contributor 3 voted YES");
    console.log(`   Final tally: 8 SOL FOR vs 3 SOL AGAINST`);
    console.log(`   Budget will be APPROVED (majority reached)`);
  });
  
  it("Fails if contributor tries to vote twice", async () => {
    const [contribution1Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), contributor1.publicKey.toBuffer()],
      program.programId
    );
    
    const [vote1Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget_vote"), budgetPda.toBuffer(), contributor1.publicKey.toBuffer()],
      program.programId
    );
    
    try {
      await program.methods
        .voteOnBudget(false)
        .accountsPartial({
          budget: budgetPda,
          campaign: campaignPda,
          contribution: contribution1Pda,
          vote: vote1Pda,
          voter: contributor1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([contributor1])
        .rpc();
      
      expect.fail("Should have failed with already voted");
    } catch (err) {
      // Vote PDA already exists, will fail at init
      expect(err.message).to.include("already in use");
    }
  });
  
  it("Fails if non-contributor tries to vote", async () => {
    const nonContributor = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      nonContributor.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
    
    // This will fail because contribution PDA doesn't exist
    const [fakeContributionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), nonContributor.publicKey.toBuffer()],
      program.programId
    );
    
    const [votePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("budget_vote"), budgetPda.toBuffer(), nonContributor.publicKey.toBuffer()],
      program.programId
    );
    
    try {
      await program.methods
        .voteOnBudget(true)
        .accountsPartial({
          budget: budgetPda,
          campaign: campaignPda,
          contribution: fakeContributionPda,
          vote: votePda,
          voter: nonContributor.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([nonContributor])
        .rpc();
      
      expect.fail("Should have failed with not a contributor");
    } catch (err) {
      // Will fail because contribution account doesn't exist
      expect(err.message).to.include("AccountNotInitialized");
    }
  });
});
