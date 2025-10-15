import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MythraProgram } from "../target/types/mythra_program";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import { initializeProvider } from "./utils/provider";
import { setupTestEnvironment, postTestCleanup } from "./utils/test-setup";

describe("close_event", () => {
  const provider = initializeProvider();

  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  const connection = provider.connection;

  // Test accounts
  const organizer = provider.wallet;
  const treasury = anchor.web3.Keypair.generate();

  before(async () => {
    await setupTestEnvironment(provider);
  });

  it("successfully closes an event with empty escrow", async () => {
    // Create a unique event that has already ended
    const eventId = `event-${Date.now().toString().slice(-8)}`;
    const now = Math.floor(Date.now() / 1000);
    const eventPda = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(eventId)],
      program.programId
    )[0];

    await program.methods
      .createEvent(
        eventId,
        "https://example.com/event",
        new anchor.BN(now - 86400), // Started 1 day ago
        new anchor.BN(now - 3600), // Ended 1 hour ago
        100, // total_supply
        250 // platform_split_bps (2.5%)
      )
      .accountsPartial({
        event: eventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    // Get event account before closing
    const eventBefore = await program.account.event.fetch(eventPda);
    
    // Close the event
    await program.methods
      .closeEvent()
      .accountsPartial({
        event: eventPda,
        escrow: PublicKey.findProgramAddressSync(
          [Buffer.from("escrow"), eventPda.toBuffer()],
          program.programId
        )[0],
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Verify the event account no longer exists
    try {
      await program.account.event.fetch(eventPda);
      assert.fail("Event account should no longer exist");
    } catch (err) {
      // Expected error - account not found
      assert.include(err.message, "Account does not exist", "Expected account to be closed but it still exists");
    }
  });

  it("fails to close event before it has ended", async () => {
    // Create a new event that hasn't ended yet
    const futureEventId = `event-${Date.now().toString().slice(-8)}`;
    const futureEventPda = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(futureEventId)],
      program.programId
    )[0];

    const now = Math.floor(Date.now() / 1000);
    
    await program.methods
      .createEvent(
        futureEventId,
        "https://example.com/future-event",
        new anchor.BN(now - 3600), // Started 1 hour ago
        new anchor.BN(now + 3600), // Ends in 1 hour
        100,
        250
      )
      .accountsPartial({
        event: futureEventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Attempt to close (should fail)
    try {
      await program.methods
        .closeEvent()
        .accountsPartial({
          event: futureEventPda,
          escrow: PublicKey.findProgramAddressSync(
            [Buffer.from("escrow"), futureEventPda.toBuffer()],
            program.programId
          )[0],
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([organizer])
        .rpc();

      assert.fail("Transaction should have failed");
    } catch (err) {
      assert.include(err.message, "EventNotEnded");
    }
  });

  it("fails to close event with outstanding funds in escrow", async () => {
    // Create a new event
    const fundedEventId = `event-${Date.now().toString().slice(-8)}`;
    const fundedEventPda = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(fundedEventId)],
      program.programId
    )[0];

    const now = Math.floor(Date.now() / 1000);
    
    await program.methods
      .createEvent(
        fundedEventId,
        "https://example.com/funded-event",
        new anchor.BN(now - 86400), // Started 1 day ago
        new anchor.BN(now - 3600), // Ended 1 hour ago
        100,
        250
      )
      .accountsPartial({
        event: fundedEventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Fund the escrow account
    const escrowPda = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), fundedEventPda.toBuffer()],
      program.programId
    )[0];

    const transferTx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: organizer.publicKey,
        toPubkey: escrowPda,
        lamports: 1 * anchor.web3.LAMPORTS_PER_SOL, // 1 SOL
      })
    );

    await provider.sendAndConfirm(transferTx);

    // Attempt to close (should fail due to funds in escrow)
    try {
      await program.methods
        .closeEvent()
        .accountsPartial({
          event: fundedEventPda,
          escrow: escrowPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([organizer])
        .rpc();

      assert.fail("Transaction should have failed");
    } catch (err) {
      assert.include(err.message, "OutstandingFunds");
    }
  });
});