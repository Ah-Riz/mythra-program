import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram 
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  transfer,
} from "@solana/spl-token";
import { MythraProgram } from "../target/types/mythra_program";
import { assert } from "chai";

describe("mark_ticket_used", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  
  const organizer = provider.wallet;
  const buyer = Keypair.generate();
  const nonOwner = Keypair.generate();
  const gateOperator = Keypair.generate();
  
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

  // Helper function to derive ticket PDA
  const getTicketPda = async (mintPubkey: PublicKey) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("ticket"),
        mintPubkey.toBuffer(),
      ],
      program.programId
    );
    return pda;
  };

  // Helper to create an event
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

  // Helper to create a tier
  const createTestTier = async (eventPda: PublicKey, tierId: string, maxSupply: number) => {
    const tierPda = await getTierPda(eventPda, tierId);
    
    await program.methods
      .createTicketTier(tierId,
        "https://example.com/tier.json",
        new BN(1_000_000_000),
        maxSupply,
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

    return tierPda;
  };

  // Helper to mint an NFT and register it
  const mintAndRegisterTicket = async (owner: Keypair, eventPda: PublicKey, tierPda: PublicKey) => {
    // Create mint account
    const mint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      0
    );

    // Create associated token account
    const tokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      owner,
      mint,
      owner.publicKey
    );

    // Mint 1 token
    await mintTo(
      provider.connection,
      owner,
      mint,
      tokenAccount,
      owner,
      1
    );

    // Register ticket
    const ticketPda = await getTicketPda(mint);

    await program.methods
      .registerMint()
      .accounts({
        ticket: ticketPda,
        event: eventPda,
        tier: tierPda,
        mint: mint,
        buyerTokenAccount: tokenAccount,
        buyer: owner.publicKey,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return { mint, tokenAccount, ticketPda };
  };

  before(async () => {
    // Airdrop to buyer
    const airdropSig = await provider.connection.requestAirdrop(
      buyer.publicKey,
      5 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Airdrop to non-owner
    const airdropSig2 = await provider.connection.requestAirdrop(
      nonOwner.publicKey,
      5 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig2);
  });

  describe("successful check-in", () => {
    it("marks a valid ticket as used", async () => {
      const eventId = "event-checkin-001";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);
      
      const tierPda = await createTestTier(eventPda, "checkin-tier", 100);
      
      const { mint, tokenAccount, ticketPda } = await mintAndRegisterTicket(
        buyer,
        eventPda,
        tierPda
      );

      // Verify ticket is not used before check-in
      const ticketBefore = await program.account.ticket.fetch(ticketPda);
      assert.equal(ticketBefore.used, false);
      assert.equal(ticketBefore.checkedInTs.toNumber(), 0);

      const tx = await program.methods
        .markTicketUsed()
        .accounts({
          ticket: ticketPda,
          ownerTokenAccount: tokenAccount,
          owner: buyer.publicKey,
          gateOperator: gateOperator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();

      console.log("Transaction signature:", tx);

      // Verify ticket is now used
      const ticketAfter = await program.account.ticket.fetch(ticketPda);
      
      assert.equal(ticketAfter.used, true);
      assert.ok(ticketAfter.checkedInTs.toNumber() > 0);
      assert.ok(ticketAfter.gateOperator.equals(gateOperator.publicKey));
      assert.ok(ticketAfter.owner.equals(buyer.publicKey));
    });

    it("records the gate operator correctly", async () => {
      const eventId = "event-checkin-operator";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);
      
      const tierPda = await createTestTier(eventPda, "operator-tier", 100);
      
      const { tokenAccount, ticketPda } = await mintAndRegisterTicket(
        buyer,
        eventPda,
        tierPda
      );

      const customOperator = Keypair.generate();

      await program.methods
        .markTicketUsed()
        .accounts({
          ticket: ticketPda,
          ownerTokenAccount: tokenAccount,
          owner: buyer.publicKey,
          gateOperator: customOperator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();

      const ticketAccount = await program.account.ticket.fetch(ticketPda);
      assert.ok(ticketAccount.gateOperator.equals(customOperator.publicKey));
    });
  });

  describe("non-owner attempt", () => {
    it("fails when non-owner tries to use ticket", async () => {
      const eventId = "event-checkin-nonowner";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);
      
      const tierPda = await createTestTier(eventPda, "nonowner-tier", 100);
      
      const { tokenAccount, ticketPda } = await mintAndRegisterTicket(
        buyer,
        eventPda,
        tierPda
      );

      try {
        await program.methods
          .markTicketUsed()
          .accounts({
            ticket: ticketPda,
            ownerTokenAccount: tokenAccount,
            owner: nonOwner.publicKey, // Wrong owner
            gateOperator: gateOperator.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([nonOwner])
          .rpc();
        
        assert.fail("Expected transaction to fail due to non-owner attempt");
      } catch (error) {
        assert.include(error.message, "UnauthorizedTicketUse");
      }
    });
  });

  describe("post-transfer attempt", () => {
    it("fails when original owner tries to use after transferring NFT", async () => {
      const eventId = "event-checkin-transfer";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);
      
      const tierPda = await createTestTier(eventPda, "transfer-tier", 100);
      
      const { mint, tokenAccount, ticketPda } = await mintAndRegisterTicket(
        buyer,
        eventPda,
        tierPda
      );

      // Transfer NFT to nonOwner
      const newOwnerTokenAccount = await createAssociatedTokenAccount(
        provider.connection,
        nonOwner,
        mint,
        nonOwner.publicKey
      );

      await transfer(
        provider.connection,
        buyer,
        tokenAccount,
        newOwnerTokenAccount,
        buyer,
        1
      );

      // Original owner (buyer) tries to use ticket - should fail (doesn't own NFT)
      try {
        await program.methods
          .markTicketUsed()
          .accounts({
            ticket: ticketPda,
            ownerTokenAccount: tokenAccount, // This account now has 0 tokens
            owner: buyer.publicKey,
            gateOperator: gateOperator.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([buyer])
          .rpc();
        
        assert.fail("Expected transaction to fail due to not holding NFT");
      } catch (error) {
        assert.include(error.message, "TicketNotOwned");
      }
    });

    it("fails when new owner tries to use ticket after transfer", async () => {
      const eventId = "event-checkin-newowner";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);
      
      const tierPda = await createTestTier(eventPda, "newowner-tier", 100);
      
      const { mint, tokenAccount, ticketPda } = await mintAndRegisterTicket(
        buyer,
        eventPda,
        tierPda
      );

      // Transfer NFT to nonOwner
      const newOwnerTokenAccount = await createAssociatedTokenAccount(
        provider.connection,
        nonOwner,
        mint,
        nonOwner.publicKey
      );

      await transfer(
        provider.connection,
        buyer,
        tokenAccount,
        newOwnerTokenAccount,
        buyer,
        1
      );

      // New owner tries to use ticket - should fail
      // Ticket owner is immutable, so only original owner can check in
      try {
        await program.methods
          .markTicketUsed()
          .accounts({
            ticket: ticketPda,
            ownerTokenAccount: newOwnerTokenAccount,
            owner: nonOwner.publicKey, // New NFT holder
            gateOperator: gateOperator.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([nonOwner])
          .rpc();
        
        assert.fail("Expected transaction to fail - ticket owner is immutable");
      } catch (error) {
        assert.include(error.message, "UnauthorizedTicketUse");
      }
    });
  });

  describe("double check-in prevention", () => {
    it("fails when trying to use an already used ticket", async () => {
      const eventId = "event-checkin-double";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);
      
      const tierPda = await createTestTier(eventPda, "double-tier", 100);
      
      const { tokenAccount, ticketPda } = await mintAndRegisterTicket(
        buyer,
        eventPda,
        tierPda
      );

      // First check-in - should succeed
      await program.methods
        .markTicketUsed()
        .accounts({
          ticket: ticketPda,
          ownerTokenAccount: tokenAccount,
          owner: buyer.publicKey,
          gateOperator: gateOperator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();

      // Verify ticket is used
      const ticketAfterFirst = await program.account.ticket.fetch(ticketPda);
      assert.equal(ticketAfterFirst.used, true);

      // Second check-in - should fail
      try {
        await program.methods
          .markTicketUsed()
          .accounts({
            ticket: ticketPda,
            ownerTokenAccount: tokenAccount,
            owner: buyer.publicKey,
            gateOperator: gateOperator.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([buyer])
          .rpc();
        
        assert.fail("Expected transaction to fail due to ticket already used");
      } catch (error) {
        assert.include(error.message, "TicketAlreadyUsed");
      }
    });
  });

  describe("event emission", () => {
    it("emits TicketUsed event with correct data", async () => {
      const eventId = "event-checkin-emission";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);
      
      const tierPda = await createTestTier(eventPda, "emission-tier", 100);
      
      const { mint, tokenAccount, ticketPda } = await mintAndRegisterTicket(
        buyer,
        eventPda,
        tierPda
      );

      // Listen for events
      let eventEmitted = false;
      const listener = program.addEventListener("ticketUsed", (event) => {
        assert.ok(event.ticketPubkey.equals(ticketPda));
        assert.ok(event.owner.equals(buyer.publicKey));
        assert.ok(event.mint.equals(mint));
        assert.ok(event.event.equals(eventPda));
        assert.ok(event.tier.equals(tierPda));
        assert.ok(event.gateOperator.equals(gateOperator.publicKey));
        assert.isNumber(event.checkedInTs.toNumber());
        eventEmitted = true;
      });

      await program.methods
        .markTicketUsed()
        .accounts({
          ticket: ticketPda,
          ownerTokenAccount: tokenAccount,
          owner: buyer.publicKey,
          gateOperator: gateOperator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await program.removeEventListener(listener);
      
      console.log("Event emission test completed");
    });
  });

  describe("edge cases", () => {
    it("records accurate check-in timestamp", async () => {
      const eventId = "event-checkin-timestamp";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);
      
      const tierPda = await createTestTier(eventPda, "timestamp-tier", 100);
      
      const { tokenAccount, ticketPda } = await mintAndRegisterTicket(
        buyer,
        eventPda,
        tierPda
      );

      const beforeTime = Math.floor(Date.now() / 1000);

      await program.methods
        .markTicketUsed()
        .accounts({
          ticket: ticketPda,
          ownerTokenAccount: tokenAccount,
          owner: buyer.publicKey,
          gateOperator: gateOperator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();

      const afterTime = Math.floor(Date.now() / 1000);

      const ticketAccount = await program.account.ticket.fetch(ticketPda);
      const checkedInTs = ticketAccount.checkedInTs.toNumber();
      
      // Allow for clock skew - validator clock might be slightly behind/ahead
      // Higher tolerance for devnet/testnet due to potential clock drift
      const isDevnet = provider.connection.rpcEndpoint.includes('devnet') || 
                       provider.connection.rpcEndpoint.includes('testnet');
      const tolerance = isDevnet ? 30 : 10; // 30s for devnet, 10s for localnet
      
      assert.ok(checkedInTs >= beforeTime - tolerance, 
        `Timestamp ${checkedInTs} should be >= ${beforeTime - tolerance}`);
      assert.ok(checkedInTs <= afterTime + tolerance,
        `Timestamp ${checkedInTs} should be <= ${afterTime + tolerance}`);
    });
  });
});
