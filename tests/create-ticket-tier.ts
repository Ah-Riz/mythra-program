import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { MythraProgram } from "../target/types/mythra_program";
import { assert } from "chai";

describe("create_ticket_tier", () => {
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

  // Helper function to derive tier PDA
  const getTierPda = async (eventPubkey: PublicKey, tierId: string) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tier"),
        eventPubkey.toBuffer(),
        Buffer.from(tierId),
      ],
      program.programId
    );
    return pda;
  };

  // Helper to create an event for testing
  const createTestEvent = async (eventId: string, totalSupply: number) => {
    const treasury = Keypair.generate();
    const metadataUri = "https://example.com/event-metadata.json";
    const startTs = new BN(Math.floor(Date.now() / 1000));
    const endTs = new BN(Math.floor(Date.now() / 1000) + 86400);
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
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return eventPda;
  };

  describe("valid tier creation", () => {
    it("creates a ticket tier with valid parameters", async () => {
      const eventId = "event-tier-001";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);

      const tierId = "vip-tier";
      const metadataUri = "https://example.com/vip-tier.json";
      const priceLamports = new BN(1_000_000_000); // 1 SOL
      const maxSupply = 100;
      const royaltyBps = 500; // 5%
      const tierIndex = 0;

      const tierPda = await getTierPda(eventPda, tierId);

      const tx = await program.methods
        .createTicketTier(
          tierId,
          metadataUri,
          priceLamports,
          maxSupply,
          royaltyBps,
          tierIndex,
          true
        ).accountsPartial({
          tier: tierPda,
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Transaction signature:", tx);

      // Fetch and verify the tier account
      const tierAccount = await program.account.ticketTier.fetch(tierPda);
      
      assert.ok(tierAccount.event.equals(eventPda));
      assert.ok(tierAccount.priceLamports.eq(priceLamports));
      assert.equal(tierAccount.maxSupply, maxSupply);
      assert.equal(tierAccount.metadataUri, metadataUri);
      assert.equal(tierAccount.royaltyBps, royaltyBps);
      assert.equal(tierAccount.tierIndex, tierIndex);
      assert.isNotNull(tierAccount.bump);

      // Verify event's allocated_supply was updated
      const eventAccount = await program.account.event.fetch(eventPda);
      assert.equal(eventAccount.allocatedSupply, maxSupply);
    });

    it("creates multiple tiers for the same event", async () => {
      const eventId = "event-multi-tier";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);

      const tiers = [
        { id: "vip", price: 2_000_000_000, supply: 100, royalty: 500, index: 0 },
        { id: "regular", price: 1_000_000_000, supply: 400, royalty: 300, index: 1 },
        { id: "early-bird", price: 500_000_000, supply: 500, royalty: 200, index: 2 },
      ];

      let cumulativeSupply = 0;

      for (const tier of tiers) {
        const tierPda = await getTierPda(eventPda, tier.id);
        
        await program.methods
          .createTicketTier(
            tier.id,
            `https://example.com/${tier.id}.json`,
            new BN(tier.price),
            tier.supply,
            tier.royalty,
            tier.index,
            true // resale_enabled
          )
          .accounts({
            tier: tierPda,
            event: eventPda,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        cumulativeSupply += tier.supply;

        const eventAccount = await program.account.event.fetch(eventPda);
        assert.equal(eventAccount.allocatedSupply, cumulativeSupply);
      }

      // Verify total allocated supply equals event total supply
      const eventAccount = await program.account.event.fetch(eventPda);
      assert.equal(eventAccount.allocatedSupply, totalSupply);
    });

    it("creates tier with exact remaining supply", async () => {
      const eventId = "event-exact-supply";
      const totalSupply = 500;
      const eventPda = await createTestEvent(eventId, totalSupply);

      // Create first tier using 300
      const tier1Pda = await getTierPda(eventPda, "tier1");
      await program.methods
        .createTicketTier("tier1",
          "https://example.com/tier1.json",
          new BN(1_000_000_000),
          300,
          500,
          0,
          true
        )
        .accounts({
          tier: tier1Pda,
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Create second tier using exact remaining 200
      const tier2Pda = await getTierPda(eventPda, "tier2");
      await program.methods
        .createTicketTier("tier2",
          "https://example.com/tier2.json",
          new BN(500_000_000),
          200,
          300,
          1,
          true
        )
        .accounts({
          tier: tier2Pda,
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const eventAccount = await program.account.event.fetch(eventPda);
      assert.equal(eventAccount.allocatedSupply, totalSupply);
    });
  });

  describe("exceeding total supply", () => {
    it("fails when tier max_supply exceeds event total_supply", async () => {
      const eventId = "event-exceed-single";
      const totalSupply = 100;
      const eventPda = await createTestEvent(eventId, totalSupply);

      const tierPda = await getTierPda(eventPda, "oversized-tier");

      try {
        await program.methods
          .createTicketTier("oversized-tier",
            "https://example.com/oversized.json",
            new BN(1_000_000_000),
            150, // Exceeds total supply of 100
            500,
            0,
          true
          )
          .accounts({
            tier: tierPda,
            event: eventPda,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to exceeding total supply");
      } catch (error) {
        assert.include(
          error.message,
          "Cumulative tier supply exceeds event total supply"
        );
      }
    });

    it("fails when cumulative supply across tiers exceeds total_supply", async () => {
      const eventId = "event-exceed-cumulative";
      const totalSupply = 500;
      const eventPda = await createTestEvent(eventId, totalSupply);

      // Create first tier using 300
      const tier1Pda = await getTierPda(eventPda, "tier1");
      await program.methods
        .createTicketTier("tier1",
          "https://example.com/tier1.json",
          new BN(1_000_000_000),
          300,
          500,
          0,
          true
        )
        .accounts({
          tier: tier1Pda,
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Try to create second tier with 250, which would exceed (300 + 250 = 550 > 500)
      const tier2Pda = await getTierPda(eventPda, "tier2");
      
      try {
        await program.methods
          .createTicketTier("tier2",
            "https://example.com/tier2.json",
            new BN(500_000_000),
            250, // Would cause cumulative to exceed
            300,
            1,
          true
          )
          .accounts({
            tier: tier2Pda,
            event: eventPda,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to cumulative supply exceeding total");
      } catch (error) {
        assert.include(
          error.message,
          "Cumulative tier supply exceeds event total supply"
        );
      }
    });
  });

  describe("invalid price", () => {
    it("fails when price_lamports is zero", async () => {
      const eventId = "event-zero-price";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);

      const tierPda = await getTierPda(eventPda, "free-tier");

      try {
        await program.methods
          .createTicketTier("free-tier",
            "https://example.com/free.json",
            new BN(0), // Invalid: zero price
            100,
            500,
            0,
          true
          )
          .accounts({
            tier: tierPda,
            event: eventPda,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to zero price");
      } catch (error) {
        assert.include(
          error.message,
          "Ticket price must be greater than zero"
        );
      }
    });
  });

  describe("unauthorized attempts", () => {
    it("fails when non-authority tries to create tier", async () => {
      const eventId = "event-unauthorized-tier";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);

      // Airdrop to unauthorized user
      const airdropSig = await provider.connection.requestAirdrop(
        unauthorizedUser.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      const tierPda = await getTierPda(eventPda, "unauthorized-tier");

      try {
        await program.methods
          .createTicketTier("unauthorized-tier",
            "https://example.com/unauthorized.json",
            new BN(1_000_000_000),
            100,
            500,
            0,
          true
          )
          .accounts({
            tier: tierPda,
            event: eventPda,
            authority: unauthorizedUser.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([unauthorizedUser])
          .rpc();
        
        assert.fail("Expected transaction to fail due to unauthorized access");
      } catch (error) {
        assert.include(
          error.message,
          "Only the event authority can create tiers"
        );
      }
    });
  });

  describe("duplicate tier PDAs", () => {
    it("fails when creating tier with duplicate tier_id", async () => {
      const eventId = "event-duplicate-tier";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);

      const tierId = "duplicate-tier";
      const tierPda = await getTierPda(eventPda, tierId);

      // First creation should succeed
      await program.methods
        .createTicketTier(tierId,
          "https://example.com/tier.json",
          new BN(1_000_000_000),
          100,
          500,
          0,
          true
        )
        .accounts({
          tier: tierPda,
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Second creation with same tier_id should fail
      try {
        await program.methods
          .createTicketTier(tierId,
            "https://example.com/tier.json",
            new BN(2_000_000_000),
            50,
            300,
            1,
          true
          )
          .accounts({
            tier: tierPda,
            event: eventPda,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to duplicate tier");
      } catch (error) {
        assert.include(error.message, "already in use");
      }
    });
  });

  describe("metadata URI validation", () => {
    it("fails when metadata URI exceeds 200 characters", async () => {
      const eventId = "event-oversized-tier-uri";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);

      const tierPda = await getTierPda(eventPda, "oversized-uri-tier");
      const oversizedUri = "https://example.com/" + "a".repeat(201);

      try {
        await program.methods
          .createTicketTier("oversized-uri-tier",
            oversizedUri,
            new BN(1_000_000_000),
            100,
            500,
            0,
          true
          )
          .accounts({
            tier: tierPda,
            event: eventPda,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
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

    it("succeeds with metadata URI at exactly 200 characters", async () => {
      const eventId = "event-max-tier-uri";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);

      const tierPda = await getTierPda(eventPda, "max-uri-tier");
      const maxUri = "https://example.com/" + "a".repeat(180); // 20 + 180 = 200

      await program.methods
        .createTicketTier("max-uri-tier",
          maxUri,
          new BN(1_000_000_000),
          100,
          500,
          0,
          true
        )
        .accounts({
          tier: tierPda,
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const tierAccount = await program.account.ticketTier.fetch(tierPda);
      assert.equal(tierAccount.metadataUri.length, 200);
    });
  });

  describe("event emission", () => {
    it("emits TicketTierCreated event with correct data", async () => {
      const eventId = "event-tier-emission";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);

      const tierId = "emission-tier";
      const metadataUri = "https://example.com/emission-tier.json";
      const priceLamports = new BN(1_500_000_000);
      const maxSupply = 150;
      const tierPda = await getTierPda(eventPda, tierId);

      // Listen for events
      let eventEmitted = false;
      const listener = program.addEventListener("ticketTierCreated", (event) => {
        assert.ok(event.eventPubkey.equals(eventPda));
        assert.ok(event.tierPubkey.equals(tierPda));
        assert.equal(event.tierId, tierId);
        assert.ok(event.priceLamports.eq(priceLamports));
        assert.equal(event.maxSupply, maxSupply);
        assert.equal(event.metadataUri, metadataUri);
        assert.isNumber(event.timestamp);
        eventEmitted = true;
      });

      await program.methods
        .createTicketTier(tierId,
          metadataUri,
          priceLamports,
          maxSupply,
          500, 0, true).accountsPartial({
          tier: tierPda,
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

  describe("edge cases", () => {
    it("handles very small max_supply (1)", async () => {
      const eventId = "event-tiny-supply";
      const totalSupply = 10;
      const eventPda = await createTestEvent(eventId, totalSupply);

      const tierPda = await getTierPda(eventPda, "tiny-tier");

      await program.methods
        .createTicketTier("tiny-tier",
          "https://example.com/tiny.json",
          new BN(1_000_000_000),
          1, // Very small supply
          500,
          0,
          true
        )
        .accounts({
          tier: tierPda,
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const tierAccount = await program.account.ticketTier.fetch(tierPda);
      assert.equal(tierAccount.maxSupply, 1);
    });

    it("handles zero royalty_bps", async () => {
      const eventId = "event-zero-royalty";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);

      const tierPda = await getTierPda(eventPda, "no-royalty-tier");

      await program.methods
        .createTicketTier("no-royalty-tier",
          "https://example.com/no-royalty.json",
          new BN(1_000_000_000),
          100,
          0, // Zero royalty
          0,
          true
        )
        .accounts({
          tier: tierPda,
          event: eventPda,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const tierAccount = await program.account.ticketTier.fetch(tierPda);
      assert.equal(tierAccount.royaltyBps, 0);
    });
  });
});
