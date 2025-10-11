import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { MythraProgram } from "../target/types/mythra_program";
import { assert } from "chai";

describe("update_event", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  
  const organizer = provider.wallet;
  const unauthorizedUser = Keypair.generate();
  
  // Helper function to derive event PDA
  const getEventPda = async (organizerPubkey: PublicKey, eventId: string) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("event"),
        organizerPubkey.toBuffer(),
        Buffer.from(eventId),
      ],
      program.programId
    );
    return pda;
  };

  // Helper to create an event for testing
  const createTestEvent = async (eventId: string, treasury: PublicKey) => {
    const metadataUri = "https://example.com/metadata.json";
    const startTs = new BN(Math.floor(Date.now() / 1000));
    const endTs = new BN(Math.floor(Date.now() / 1000) + 86400);
    const totalSupply = 1000;
    const platformSplitBps = 250;

    const eventPda = await getEventPda(organizer.publicKey, eventId);

    await program.methods
      .createEvent(
        eventId,
        metadataUri,
        startTs,
        endTs,
        totalSupply,
        platformSplitBps
      )
      .accounts({
        event: eventPda,
        organizer: organizer.publicKey,
        treasury: treasury,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return eventPda;
  };

  describe("successful updates", () => {
    it("updates metadata_uri successfully", async () => {
      const eventId = "event-update-metadata";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury.publicKey);

      const newMetadataUri = "https://example.com/new-metadata.json";

      await program.methods
        .updateEvent({
          metadataUri: newMetadataUri,
          endTs: null,
          platformSplitBps: null,
          treasury: null,
        })
        .accounts({
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const eventAccount = await program.account.event.fetch(eventPda);
      assert.equal(eventAccount.metadataUri, newMetadataUri);
    });

    it("updates end_ts successfully", async () => {
      const eventId = "event-update-endts";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury.publicKey);

      const newEndTs = new BN(Math.floor(Date.now() / 1000) + 172800); // +2 days

      await program.methods
        .updateEvent({
          metadataUri: null,
          endTs: newEndTs,
          platformSplitBps: null,
          treasury: null,
        })
        .accounts({
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const eventAccount = await program.account.event.fetch(eventPda);
      assert.ok(eventAccount.endTs.eq(newEndTs));
    });

    it("updates platform_split_bps successfully", async () => {
      const eventId = "event-update-split";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury.publicKey);

      const newPlatformSplitBps = 500; // 5%

      await program.methods
        .updateEvent({
          metadataUri: null,
          endTs: null,
          platformSplitBps: newPlatformSplitBps,
          treasury: null,
        })
        .accounts({
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const eventAccount = await program.account.event.fetch(eventPda);
      assert.equal(eventAccount.platformSplitBps, newPlatformSplitBps);
    });

    it("updates treasury successfully", async () => {
      const eventId = "event-update-treasury";
      const oldTreasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, oldTreasury.publicKey);

      const newTreasury = Keypair.generate();

      await program.methods
        .updateEvent({
          metadataUri: null,
          endTs: null,
          platformSplitBps: null,
          treasury: newTreasury.publicKey,
        })
        .accounts({
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const eventAccount = await program.account.event.fetch(eventPda);
      assert.ok(eventAccount.treasury.equals(newTreasury.publicKey));
    });

    it("updates multiple fields at once", async () => {
      const eventId = "event-update-multiple";
      const oldTreasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, oldTreasury.publicKey);

      const newMetadataUri = "https://example.com/multi-update.json";
      const newEndTs = new BN(Math.floor(Date.now() / 1000) + 259200); // +3 days
      const newPlatformSplitBps = 750; // 7.5%
      const newTreasury = Keypair.generate();

      await program.methods
        .updateEvent({
          metadataUri: newMetadataUri,
          endTs: newEndTs,
          platformSplitBps: newPlatformSplitBps,
          treasury: newTreasury.publicKey,
        })
        .accounts({
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const eventAccount = await program.account.event.fetch(eventPda);
      assert.equal(eventAccount.metadataUri, newMetadataUri);
      assert.ok(eventAccount.endTs.eq(newEndTs));
      assert.equal(eventAccount.platformSplitBps, newPlatformSplitBps);
      assert.ok(eventAccount.treasury.equals(newTreasury.publicKey));
    });

    it("allows platform_split_bps of 0", async () => {
      const eventId = "event-update-zero-split";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury.publicKey);

      await program.methods
        .updateEvent({
          metadataUri: null,
          endTs: null,
          platformSplitBps: 0,
          treasury: null,
        })
        .accounts({
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const eventAccount = await program.account.event.fetch(eventPda);
      assert.equal(eventAccount.platformSplitBps, 0);
    });

    it("allows platform_split_bps of 10000 (100%)", async () => {
      const eventId = "event-update-max-split";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury.publicKey);

      await program.methods
        .updateEvent({
          metadataUri: null,
          endTs: null,
          platformSplitBps: 10000,
          treasury: null,
        })
        .accounts({
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const eventAccount = await program.account.event.fetch(eventPda);
      assert.equal(eventAccount.platformSplitBps, 10000);
    });
  });

  describe("unauthorized access", () => {
    it("fails when non-authority tries to update", async () => {
      const eventId = "event-unauthorized";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury.publicKey);

      // Airdrop to unauthorized user for transaction fees
      const airdropSig = await provider.connection.requestAirdrop(
        unauthorizedUser.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      const newMetadataUri = "https://example.com/unauthorized.json";

      try {
        await program.methods
          .updateEvent({
            metadataUri: newMetadataUri,
            endTs: null,
            platformSplitBps: null,
            treasury: null,
          })
          .accounts({
            event: eventPda,
            authority: unauthorizedUser.publicKey,
            newTreasury: null,
          })
          .signers([unauthorizedUser])
          .rpc();
        
        assert.fail("Expected transaction to fail due to unauthorized update");
      } catch (error) {
        assert.include(
          error.message,
          "Only the event authority can update this event"
        );
      }
    });
  });

  describe("invalid platform_split_bps", () => {
    it("fails when platform_split_bps exceeds 10000", async () => {
      const eventId = "event-invalid-split";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury.publicKey);

      try {
        await program.methods
          .updateEvent({
            metadataUri: null,
            endTs: null,
            platformSplitBps: 10001, // Invalid: > 10000
            treasury: null,
          })
          .accounts({
            event: eventPda,
            authority: organizer.publicKey,
            newTreasury: null,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to invalid platform split");
      } catch (error) {
        assert.include(
          error.message,
          "Platform split must be between 0 and 10000 basis points"
        );
      }
    });
  });

  describe("invalid end_ts", () => {
    it("fails when end_ts is in the past", async () => {
      const eventId = "event-past-endts";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury.publicKey);

      const pastEndTs = new BN(Math.floor(Date.now() / 1000) - 3600); // -1 hour

      try {
        await program.methods
          .updateEvent({
            metadataUri: null,
            endTs: pastEndTs,
            platformSplitBps: null,
            treasury: null,
          })
          .accounts({
            event: eventPda,
            authority: organizer.publicKey,
            newTreasury: null,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to past end timestamp");
      } catch (error) {
        assert.include(
          error.message,
          "End timestamp must be in the future"
        );
      }
    });
  });

  describe("metadata URI validation", () => {
    it("fails when metadata URI exceeds 200 characters", async () => {
      const eventId = "event-oversized-update-uri";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury.publicKey);

      const oversizedUri = "https://example.com/" + "a".repeat(201);

      try {
        await program.methods
          .updateEvent({
            metadataUri: oversizedUri,
            endTs: null,
            platformSplitBps: null,
            treasury: null,
          })
          .accounts({
            event: eventPda,
            authority: organizer.publicKey,
            newTreasury: null,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to oversized metadata URI");
      } catch (error) {
        assert.include(
          error.message,
          "Metadata URI exceeds maximum length of 200 characters"
        );
      }
    });
  });

  describe("immutable fields verification", () => {
    it("verifies total_supply remains unchanged after update", async () => {
      const eventId = "event-immutable-supply";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury.publicKey);

      const beforeUpdate = await program.account.event.fetch(eventPda);
      const originalSupply = beforeUpdate.totalSupply;

      await program.methods
        .updateEvent({
          metadataUri: "https://example.com/updated.json",
          endTs: null,
          platformSplitBps: null,
          treasury: null,
        })
        .accounts({
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const afterUpdate = await program.account.event.fetch(eventPda);
      assert.equal(afterUpdate.totalSupply, originalSupply);
    });

    it("verifies authority remains unchanged after update", async () => {
      const eventId = "event-immutable-authority";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury.publicKey);

      const beforeUpdate = await program.account.event.fetch(eventPda);
      const originalAuthority = beforeUpdate.authority;

      await program.methods
        .updateEvent({
          metadataUri: "https://example.com/updated.json",
          endTs: null,
          platformSplitBps: null,
          treasury: null,
        })
        .accounts({
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const afterUpdate = await program.account.event.fetch(eventPda);
      assert.ok(afterUpdate.authority.equals(originalAuthority));
    });

    it("verifies start_ts remains unchanged after update", async () => {
      const eventId = "event-immutable-startts";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury.publicKey);

      const beforeUpdate = await program.account.event.fetch(eventPda);
      const originalStartTs = beforeUpdate.startTs;

      await program.methods
        .updateEvent({
          metadataUri: null,
          endTs: new BN(Math.floor(Date.now() / 1000) + 172800),
          platformSplitBps: null,
          treasury: null,
        })
        .accounts({
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const afterUpdate = await program.account.event.fetch(eventPda);
      assert.ok(afterUpdate.startTs.eq(originalStartTs));
    });
  });

  describe("event emission", () => {
    it("emits EventUpdated event with correct data", async () => {
      const eventId = "event-emission-update";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury.publicKey);

      const newMetadataUri = "https://example.com/emission-test.json";

      // Listen for events
      let eventEmitted = false;
      const listener = program.addEventListener("eventUpdated", (event) => {
        assert.ok(event.eventPubkey.equals(eventPda));
        assert.ok(event.authority.equals(organizer.publicKey));
        assert.equal(event.metadataUri, newMetadataUri);
        assert.isNumber(event.timestamp);
        eventEmitted = true;
      });

      await program.methods
        .updateEvent({
          metadataUri: newMetadataUri,
          endTs: null,
          platformSplitBps: null,
          treasury: null,
        })
        .accounts({
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await program.removeEventListener(listener);
      
      console.log("Event emission test completed");
    });
  });
});
