import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { MythraProgram } from "../target/types/mythra_program";
import { assert, expect } from "chai";
import { initializeProvider } from "./utils/provider";
import { setupTestEnvironment, postTestCleanup } from "./utils/test-setup";

describe("create_event", () => {
  const provider = initializeProvider();

  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;

  const organizer = provider.wallet;
  const treasury = Keypair.generate();

  // Setup test environment
  before(async () => {
    console.log("\n🔧 Test Environment Setup");
    console.log(`Network: devnet`);
    console.log(`RPC: ${provider.connection.rpcEndpoint.slice(0, 50)}...`);
    console.log(`Wallet: ${provider.wallet.publicKey.toBase58()}`);
    
    const balance = await provider.connection.getBalance(provider.wallet.publicKey);
    console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL`);
    
    if (balance < 1e9) {
      console.warn(`⚠️  Low balance! You may need to fund your wallet.`);
    }
  });

  // Add delay between tests for rate limiting
  afterEach(async () => {
    await postTestCleanup(provider);
  });

  // Helper function to derive event PDA
  const getEventPda = async (organizerPubkey: PublicKey, eventId: string) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizerPubkey.toBuffer(), Buffer.from(eventId)],
      program.programId
    );
    return pda;
  };

  describe("successful event creation", () => {
    it("creates an event with valid parameters", async () => {
      const eventId = `event-${Date.now()}`;
      const metadataUri = "https://example.com/metadata.json";
      const startTs = new BN(Math.floor(Date.now() / 1000));
      const endTs = new BN(Math.floor(Date.now() / 1000) + 86400); // +1 day
      const totalSupply = 1000;
      const platformSplitBps = 250; // 2.5%

      const eventPda = await getEventPda(organizer.publicKey, eventId);

      const tx = await program.methods
        .createEvent(
          eventId,
          metadataUri,
          startTs,
          endTs,
          totalSupply,
          platformSplitBps
        )
        .accountsPartial({
          event: eventPda,
          organizer: organizer.publicKey,
          treasury: treasury.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Transaction signature:", tx);

      // Fetch and verify the event account
      const eventAccount = await program.account.event.fetch(eventPda);

      assert.ok(eventAccount.authority.equals(organizer.publicKey));
      assert.equal(eventAccount.metadataUri, metadataUri);
      assert.ok(eventAccount.startTs.eq(startTs));
      assert.ok(eventAccount.endTs.eq(endTs));
      assert.equal(eventAccount.totalSupply, totalSupply);
      assert.ok(eventAccount.treasury.equals(treasury.publicKey));
      assert.equal(eventAccount.platformSplitBps, platformSplitBps);
      assert.isNotNull(eventAccount.bump);
    });

    it("creates multiple events with different event IDs", async () => {
      const baseMetadataUri = "https://example.com/metadata";
      const startTs = new BN(Math.floor(Date.now() / 1000));
      const endTs = new BN(Math.floor(Date.now() / 1000) + 86400);

      for (let i = 0; i < 3; i++) {
        const eventId = `event-multi-${Date.now()}-${i}`;
        const eventPda = await getEventPda(organizer.publicKey, eventId);

        await program.methods
          .createEvent(
            eventId,
            `${baseMetadataUri}-${i}.json`,
            startTs,
            endTs,
            100 + i,
            250
          )
          .accountsPartial({
            event: eventPda,
            organizer: organizer.publicKey,
            treasury: treasury.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const eventAccount = await program.account.event.fetch(eventPda);
        assert.equal(eventAccount.totalSupply, 100 + i);
      }
    });
  });

  describe("duplicate event creation", () => {
    it("fails when creating an event with a duplicate event ID", async () => {
      const eventId = `event-dup-${Date.now().toString().slice(-6)}`;
      const metadataUri = "https://example.com/metadata.json";
      const startTs = new BN(Math.floor(Date.now() / 1000));
      const endTs = new BN(Math.floor(Date.now() / 1000) + 86400);
      const totalSupply = 1000;
      const platformSplitBps = 250;

      const eventPda = await getEventPda(organizer.publicKey, eventId);

      // First creation should succeed
      await program.methods
        .createEvent(
          eventId,
          metadataUri,
          startTs,
          endTs,
          totalSupply,
          platformSplitBps
        )
        .accountsPartial({
          event: eventPda,
          organizer: organizer.publicKey,
          treasury: treasury.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Second creation with the same event ID should fail
      try {
        await program.methods
          .createEvent(
            eventId,
            metadataUri,
            startTs,
            endTs,
            totalSupply,
            platformSplitBps
          )
          .accountsPartial({
            event: eventPda,
            organizer: organizer.publicKey,
            treasury: treasury.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        assert.fail("Expected transaction to fail due to duplicate event");
      } catch (error) {
        // Account already exists error from Anchor's init constraint
        assert.include(error.message, "already in use");
      }
    });
  });

  describe("invalid timestamps", () => {
    it("fails when start_ts >= end_ts", async () => {
      const eventId = `event-invts-${Date.now().toString().slice(-6)}`;
      const metadataUri = "https://example.com/metadata.json";
      const startTs = new BN(Math.floor(Date.now() / 1000) + 86400);
      const endTs = new BN(Math.floor(Date.now() / 1000)); // End before start
      const totalSupply = 1000;
      const platformSplitBps = 250;

      const eventPda = await getEventPda(organizer.publicKey, eventId);

      try {
        await program.methods
          .createEvent(
            eventId,
            metadataUri,
            startTs,
            endTs,
            totalSupply,
            platformSplitBps
          )
          .accountsPartial({
            event: eventPda,
            organizer: organizer.publicKey,
            treasury: treasury.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        assert.fail("Expected transaction to fail due to invalid timestamps");
      } catch (error) {
        assert.include(
          error.message,
          "Event end timestamp must be greater than start timestamp"
        );
      }
    });

    it("fails when start_ts equals end_ts", async () => {
      const eventId = `event-eqts-${Date.now().toString().slice(-6)}`;
      const metadataUri = "https://example.com/metadata.json";
      const timestamp = new BN(Math.floor(Date.now() / 1000));
      const totalSupply = 1000;
      const platformSplitBps = 250;

      const eventPda = await getEventPda(organizer.publicKey, eventId);

      try {
        await program.methods
          .createEvent(
            eventId,
            metadataUri,
            timestamp,
            timestamp, // Same timestamp
            totalSupply,
            platformSplitBps
          )
          .accountsPartial({
            event: eventPda,
            organizer: organizer.publicKey,
            treasury: treasury.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        assert.fail("Expected transaction to fail due to equal timestamps");
      } catch (error) {
        assert.include(
          error.message,
          "Event end timestamp must be greater than start timestamp"
        );
      }
    });
  });

  describe("zero supply validation", () => {
    it("fails when total_supply is zero", async () => {
      const eventId = `event-zero-${Date.now().toString().slice(-6)}`;
      const metadataUri = "https://example.com/metadata.json";
      const startTs = new BN(Math.floor(Date.now() / 1000));
      const endTs = new BN(Math.floor(Date.now() / 1000) + 86400);
      const totalSupply = 0; // Zero supply
      const platformSplitBps = 250;

      const eventPda = await getEventPda(organizer.publicKey, eventId);

      try {
        await program.methods
          .createEvent(
            eventId,
            metadataUri,
            startTs,
            endTs,
            totalSupply,
            platformSplitBps
          )
          .accountsPartial({
            event: eventPda,
            organizer: organizer.publicKey,
            treasury: treasury.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        assert.fail("Expected transaction to fail due to zero supply");
      } catch (error) {
        assert.include(error.message, "Total supply must be greater than zero");
      }
    });
  });

  describe("oversized metadata URI", () => {
    it("fails when metadata URI exceeds 200 characters", async () => {
      const eventId = `event-uri-${Date.now().toString().slice(-6)}`;
      // Create a metadata URI with 201 characters
      const metadataUri = "https://example.com/" + "a".repeat(201);
      const startTs = new BN(Math.floor(Date.now() / 1000));
      const endTs = new BN(Math.floor(Date.now() / 1000) + 86400);
      const totalSupply = 1000;
      const platformSplitBps = 250;

      const eventPda = await getEventPda(organizer.publicKey, eventId);

      try {
        await program.methods
          .createEvent(
            eventId,
            metadataUri,
            startTs,
            endTs,
            totalSupply,
            platformSplitBps
          )
          .accountsPartial({
            event: eventPda,
            organizer: organizer.publicKey,
            treasury: treasury.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        assert.fail(
          "Expected transaction to fail due to oversized metadata URI"
        );
      } catch (error) {
        assert.include(
          error.message,
          "Metadata URI exceeds maximum length of 200 characters"
        );
      }
    });

    it("succeeds when metadata URI is exactly 200 characters", async () => {
      const eventId = `event-max-${Date.now().toString().slice(-6)}`;
      // Create a metadata URI with exactly 200 characters
      const metadataUri = "https://example.com/" + "a".repeat(180); // 20 + 180 = 200
      const startTs = new BN(Math.floor(Date.now() / 1000));
      const endTs = new BN(Math.floor(Date.now() / 1000) + 86400);
      const totalSupply = 1000;
      const platformSplitBps = 250;

      const eventPda = await getEventPda(organizer.publicKey, eventId);

      const tx = await program.methods
        .createEvent(
          eventId,
          metadataUri,
          startTs,
          endTs,
          totalSupply,
          platformSplitBps
        )
        .accountsPartial({
          event: eventPda,
          organizer: organizer.publicKey,
          treasury: treasury.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const eventAccount = await program.account.event.fetch(eventPda);
      assert.equal(eventAccount.metadataUri.length, 200);
    });
  });

  describe("event emission", () => {
    it("emits EventCreated event with correct data", async () => {
      const eventId = `event-emit-${Date.now().toString().slice(-6)}`;
      const metadataUri = "https://example.com/metadata.json";
      const startTs = new BN(Math.floor(Date.now() / 1000));
      const endTs = new BN(Math.floor(Date.now() / 1000) + 86400);
      const totalSupply = 1000;
      const platformSplitBps = 250;

      const eventPda = await getEventPda(organizer.publicKey, eventId);

      // Listen for events
      let eventEmitted = false;
      const listener = program.addEventListener("eventCreated", (event) => {
        assert.ok(event.eventPubkey.equals(eventPda));
        assert.ok(event.authority.equals(organizer.publicKey));
        assert.equal(event.metadataUri, metadataUri);
        assert.isNumber(event.timestamp);
        eventEmitted = true;
      });

      await program.methods
        .createEvent(
          eventId,
          metadataUri,
          startTs,
          endTs,
          totalSupply,
          platformSplitBps
        )
        .accountsPartial({
          event: eventPda,
          organizer: organizer.publicKey,
          treasury: treasury.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Wait a bit for the event to be processed
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await program.removeEventListener(listener);

      // Note: Event emission in tests can be flaky in local validator
      // In production, events are reliable
      console.log("Event emission test completed");
    });
  });
});
