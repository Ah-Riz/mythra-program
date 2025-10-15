import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { MythraProgram } from "../target/types/mythra_program";
import { assert } from "chai";
import { initializeProvider } from "./utils/provider";

describe("refund_ticket", () => {
  const provider = initializeProvider();

  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  
  before(async () => {
    console.log("\n🔧 Test Environment Setup");
    const balance = await provider.connection.getBalance(provider.wallet.publicKey);
    console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL`);
  });
  
  const organizer = provider.wallet;
  const buyer = Keypair.generate();
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

  // Helper function to derive escrow PDA
  const getEscrowPda = async (eventPubkey: PublicKey) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        eventPubkey.toBuffer(),
      ],
      program.programId
    );
    return pda;
  };

  // Helper to create a future event
  const createTestEvent = async (eventId: string, treasury: Keypair, daysInFuture: number = 1) => {
    const metadataUri = "https://example.com/event-metadata.json";
    const startTs = new BN(Math.floor(Date.now() / 1000) + (daysInFuture * 86400)); // Future event
    const endTs = new BN(Math.floor(Date.now() / 1000) + ((daysInFuture + 1) * 86400));
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
    const mint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      0
    );

    const tokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      owner,
      mint,
      owner.publicKey
    );

    await mintTo(
      provider.connection,
      owner,
      mint,
      tokenAccount,
      owner,
      1
    );

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

  // Helper to fund escrow account
  const fundEscrow = async (escrowPda: PublicKey, amount: number) => {
    const tx = await provider.connection.requestAirdrop(escrowPda, amount);
    await provider.connection.confirmTransaction(tx);
  };

  before(async () => {
    // Airdrop to buyer
    const airdropSig = await provider.connection.requestAirdrop(
      buyer.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Airdrop to unauthorized user
    const airdropSig2 = await provider.connection.requestAirdrop(
      unauthorizedUser.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig2);
  });

  describe("valid refund", () => {
    it("successfully refunds a ticket before event starts", async () => {
      const eventId = `event-${Date.now().toString().slice(-8)}`;
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury, 2); // 2 days in future
      
      const tierPda = await createTestTier(eventPda, "refund-tier", 100);
      const escrowPda = await getEscrowPda(eventPda);
      
      // Fund escrow for refunds
      await fundEscrow(escrowPda, 5 * LAMPORTS_PER_SOL);
      
      const { mint, tokenAccount, ticketPda } = await mintAndRegisterTicket(
        buyer,
        eventPda,
        tierPda
      );

      // Get balances before refund
      const buyerBalanceBefore = await provider.connection.getBalance(buyer.publicKey);
      
      // Verify NFT exists
      const tokenAccountBefore = await getAccount(provider.connection, tokenAccount);
      assert.equal(Number(tokenAccountBefore.amount), 1);

      const refundAmount = 1 * LAMPORTS_PER_SOL;
      
      // Create a new transaction
      const tx = new anchor.web3.Transaction();
      
      // Add refund instruction
      const refundIx = await program.methods
        .refundTicket(new BN(refundAmount))
        .accounts({
          ticket: ticketPda,
          event: eventPda,
          tier: tierPda,
          escrow: escrowPda,
          mint: mint,
          buyerTokenAccount: tokenAccount,
          buyer: buyer.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
      
      tx.add(refundIx);
      
      // Send the transaction with both signers
      const txSig = await anchor.web3.sendAndConfirmTransaction(
        provider.connection,
        tx,
        [buyer, organizer.payer], // Both buyer and organizer need to sign
        { skipPreflight: true }
      );
      
      console.log("Transaction signature:", txSig);

      console.log("Transaction signature:", tx);

      // Verify ticket is marked as refunded
      const ticketAccount = await program.account.ticket.fetch(ticketPda);
      assert.equal(ticketAccount.refunded, true);
      assert.ok(ticketAccount.refundTs.toNumber() > 0);
      assert.equal(ticketAccount.used, false);

      // Verify buyer received refund
      const buyerBalanceAfter = await provider.connection.getBalance(buyer.publicKey);
      assert.approximately(
        buyerBalanceAfter - buyerBalanceBefore,
        refundAmount,
        10000, // Small margin for fees
        "Buyer should receive refund amount"
      );

      // Verify NFT was burned (supply should be 0)
      const mintAccount = await provider.connection.getAccountInfo(mint);
      if (mintAccount) {
        // Mint account still exists but supply should be 0
        const mintData = await provider.connection.getTokenSupply(mint);
        assert.equal(Number(mintData.value.amount), 0, "NFT should be burned");
      }
    });

    it("refunds correct amount from escrow", async () => {
      const eventId = `event-${Date.now().toString().slice(-8)}`;
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury, 1);
      
      const tierPda = await createTestTier(eventPda, "amount-tier", 100);
      const escrowPda = await getEscrowPda(eventPda);
      
      await fundEscrow(escrowPda, 10 * LAMPORTS_PER_SOL);
      
      const { mint, tokenAccount, ticketPda } = await mintAndRegisterTicket(
        buyer,
        eventPda,
        tierPda
      );

      const escrowBalanceBefore = await provider.connection.getBalance(escrowPda);
      const refundAmount = 0.5 * LAMPORTS_PER_SOL;
      
      // Create a new transaction for the refund
      const refundTx = new anchor.web3.Transaction();
      
      const refundIx = await program.methods
        .refundTicket(new BN(refundAmount))
        .accounts({
          ticket: ticketPda,
          event: eventPda,
          tier: tierPda,
          escrow: escrowPda,
          mint: mint,
          buyerTokenAccount: tokenAccount,
          buyer: buyer.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
      
      refundTx.add(refundIx);
      
      // Send the transaction with both signers
      await anchor.web3.sendAndConfirmTransaction(
        provider.connection,
        refundTx,
        [buyer, organizer.payer], // Both buyer and organizer need to sign
        { skipPreflight: true }
      );

      const escrowBalanceAfter = await provider.connection.getBalance(escrowPda);
      
      assert.approximately(
        escrowBalanceBefore - escrowBalanceAfter,
        refundAmount,
        1000,
        "Escrow balance should decrease by refund amount"
      );
    });
  });

  describe("post-check-in rejection", () => {
    it("fails to refund a ticket that has been used", async () => {
      const eventId = `event-${Date.now().toString().slice(-8)}`;
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury, 1);
      
      const tierPda = await createTestTier(eventPda, "used-tier", 100);
      const escrowPda = await getEscrowPda(eventPda);
      
      await fundEscrow(escrowPda, 5 * LAMPORTS_PER_SOL);
      
      const { mint, tokenAccount, ticketPda } = await mintAndRegisterTicket(
        buyer,
        eventPda,
        tierPda
      );

      // Check in the ticket first
      const gateOperator = Keypair.generate();
      // Need to implement the check-in logic here
      // This is just a placeholder - you'll need to implement the actual check-in
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

      // Try to refund after check-in - should fail
      try {
        await program.methods
          .refundTicket(new BN(1 * LAMPORTS_PER_SOL))
          .accounts({
            ticket: ticketPda,
            event: eventPda,
            tier: tierPda,
            escrow: escrowPda,
            mint: mint,
            buyerTokenAccount: tokenAccount,
            buyer: buyer.publicKey,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to ticket already used");
      } catch (error) {
        assert.include(error.message, "TicketUsedCannotRefund");
      }
    });
  });

  describe("double refund prevention", () => {
    it("fails when trying to refund the same ticket twice", async () => {
      const eventId = `event-${Date.now().toString().slice(-8)}`;
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury, 1);
      
      const tierPda = await createTestTier(eventPda, "double-tier", 100);
      const escrowPda = await getEscrowPda(eventPda);
      
      await fundEscrow(escrowPda, 5 * LAMPORTS_PER_SOL);
      
      const { mint, tokenAccount, ticketPda } = await mintAndRegisterTicket(
        buyer,
        eventPda,
        tierPda
      );

      // First refund - should succeed
      const refundTx1 = new anchor.web3.Transaction();
      const refundIx1 = await program.methods
        .refundTicket(new BN(1 * LAMPORTS_PER_SOL))
        .accounts({
          ticket: ticketPda,
          event: eventPda,
          tier: tierPda,
          escrow: escrowPda,
          mint: mint,
          buyerTokenAccount: tokenAccount,
          buyer: buyer.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
      
      refundTx1.add(refundIx1);
      
      // Send the transaction with both signers
      await anchor.web3.sendAndConfirmTransaction(
        provider.connection,
        refundTx1,
        [buyer, organizer.payer], // Both buyer and organizer need to sign
        { skipPreflight: true }
      );

      // Verify ticket is refunded
      const ticketAccount = await program.account.ticket.fetch(ticketPda);
      assert.equal(ticketAccount.refunded, true);

      // Second refund attempt - should fail
      try {
        const refundTx2 = new anchor.web3.Transaction();
        const refundIx2 = await program.methods
          .refundTicket(new BN(1 * LAMPORTS_PER_SOL))
          .accounts({
            ticket: ticketPda,
            event: eventPda,
            tier: tierPda,
            escrow: escrowPda,
            mint: mint,
            buyerTokenAccount: tokenAccount,
            buyer: buyer.publicKey,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction();
        
        refundTx2.add(refundIx2);
        
        await anchor.web3.sendAndConfirmTransaction(
          provider.connection,
          refundTx2,
          [buyer, organizer.payer],
          { skipPreflight: true }
        );
          
        assert.fail("Should not be able to refund the same ticket twice");
      } catch (error) {
        // Check for error code 6016 (AlreadyRefunded) or the error name
        const errorMsg = error.message || error.toString();
        const hasCorrectError = errorMsg.includes("AlreadyRefunded") || errorMsg.includes("6016");
        assert.isTrue(hasCorrectError, `Expected AlreadyRefunded error (code 6016) but got: ${errorMsg}`);
      }
    });
  });

  describe("unauthorized attempts", () => {
    it("fails when non-authority tries to process refund", async () => {
      const eventId = `event-${Date.now().toString().slice(-8)}`;
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury, 1);
      
      const tierPda = await createTestTier(eventPda, "unauth-tier", 100);
      const escrowPda = await getEscrowPda(eventPda);
      
      await fundEscrow(escrowPda, 5 * LAMPORTS_PER_SOL);
      
      const { mint, tokenAccount, ticketPda } = await mintAndRegisterTicket(
        buyer,
        eventPda,
        tierPda
      );

      // Try to refund as unauthorized user
      try {
        await program.methods
          .refundTicket(new BN(1 * LAMPORTS_PER_SOL))
          .accounts({
            ticket: ticketPda,
            event: eventPda,
            tier: tierPda,
            escrow: escrowPda,
            mint: mint,
            buyerTokenAccount: tokenAccount,
            buyer: buyer.publicKey,
            authority: unauthorizedUser.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([unauthorizedUser])
          .rpc();
        
        assert.fail("Expected transaction to fail due to unauthorized refund");
      } catch (error) {
        assert.include(error.message, "UnauthorizedRefund");
      }
    });
  });

  describe("event timing validation", () => {
    it("fails to refund after event has started", async () => {
      const eventId = `event-${Date.now().toString().slice(-8)}`;
      const treasury = Keypair.generate();
      
      // Create event that starts in the past
      const metadataUri = "https://example.com/event-metadata.json";
      const startTs = new BN(Math.floor(Date.now() / 1000) - 3600); // 1 hour ago
      const endTs = new BN(Math.floor(Date.now() / 1000) + 86400); // Tomorrow
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
          treasury: treasury.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      const tierPda = await createTestTier(eventPda, "started-tier", 100);
      const escrowPda = await getEscrowPda(eventPda);
      
      await fundEscrow(escrowPda, 5 * LAMPORTS_PER_SOL);
      
      const { mint, tokenAccount, ticketPda } = await mintAndRegisterTicket(
        buyer,
        eventPda,
        tierPda
      );

      // Try to refund after event started - should fail
      try {
        await program.methods
          .refundTicket(new BN(1 * LAMPORTS_PER_SOL))
          .accounts({
            ticket: ticketPda,
            event: eventPda,
            tier: tierPda,
            escrow: escrowPda,
            mint: mint,
            buyerTokenAccount: tokenAccount,
            buyer: buyer.publicKey,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to event already started");
      } catch (error) {
        assert.include(error.message, "EventAlreadyStarted");
      }
    });
  });

  describe("event emission", () => {
    it("emits TicketRefunded event with correct data", async () => {
      const eventId = `event-${Date.now().toString().slice(-8)}`;
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury, 1);
      
      const tierPda = await createTestTier(eventPda, "emission-tier", 100);
      const escrowPda = await getEscrowPda(eventPda);
      
      await fundEscrow(escrowPda, 5 * LAMPORTS_PER_SOL);
      
      const { mint, tokenAccount, ticketPda } = await mintAndRegisterTicket(
        buyer,
        eventPda,
        tierPda
      );

      const refundAmount = 1.5 * LAMPORTS_PER_SOL;

      // Listen for events
      let eventEmitted = false;
      const listener = program.addEventListener("ticketRefunded", (event) => {
        assert.ok(event.ticketPubkey.equals(ticketPda));
        assert.ok(event.eventPubkey.equals(eventPda));
        assert.ok(event.tierPubkey.equals(tierPda));
        assert.ok(event.mintPubkey.equals(mint));
        assert.ok(event.owner.equals(buyer.publicKey));
        assert.ok(event.refundAmount.eq(new BN(refundAmount)));
        assert.ok(event.refundedBy.equals(organizer.publicKey));
        assert.isNumber(event.timestamp.toNumber());
        eventEmitted = true;
      });

      // Create a new transaction for the refund
      const refundTx = new anchor.web3.Transaction();
      
      const refundIx = await program.methods
        .refundTicket(new BN(refundAmount))
        .accounts({
          ticket: ticketPda,
          event: eventPda,
          tier: tierPda,
          escrow: escrowPda,
          mint: mint,
          buyerTokenAccount: tokenAccount,
          buyer: buyer.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
      
      refundTx.add(refundIx);
      
      // Send the transaction with both signers
      await anchor.web3.sendAndConfirmTransaction(
        provider.connection,
        refundTx,
        [buyer, organizer.payer], // Both buyer and organizer need to sign
        { skipPreflight: true }
      );

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await program.removeEventListener(listener);
      
      console.log("Event emission test completed");
    });
  });

  describe("edge cases", () => {
    it("fails when escrow has insufficient funds for refund", async () => {
      const eventId = `event-${Date.now().toString().slice(-8)}`;
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury, 1);
      
      const tierPda = await createTestTier(eventPda, "insufficient-tier", 100);
      const escrowPda = await getEscrowPda(eventPda);
      
      // Fund escrow with very little
      await fundEscrow(escrowPda, 0.01 * LAMPORTS_PER_SOL);
      
      const { mint, tokenAccount, ticketPda } = await mintAndRegisterTicket(
        buyer,
        eventPda,
        tierPda
      );

      // Try to refund more than escrow has
      try {
        await program.methods
          .refundTicket(new BN(10 * LAMPORTS_PER_SOL))
          .accounts({
            ticket: ticketPda,
            event: eventPda,
            tier: tierPda,
            escrow: escrowPda,
            mint: mint,
            buyerTokenAccount: tokenAccount,
            buyer: buyer.publicKey,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to insufficient escrow balance");
      } catch (error) {
        assert.include(error.message, "InsufficientBalance");
      }
    });
  });
});
