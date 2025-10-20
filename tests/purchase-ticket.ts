import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { MythraProgram } from "../target/types/mythra_program";
import { assert } from "chai";
import { initializeProvider } from "./utils/provider";

describe("purchase_ticket", () => {
  const provider = initializeProvider();
  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  
  before(async () => {
    console.log("\n🔧 Test Environment Setup: purchase_ticket");
    const balance = await provider.connection.getBalance(provider.wallet.publicKey);
    console.log(`Organizer Balance: ${(balance / 1e9).toFixed(4)} SOL`);
  });
  
  const organizer = provider.wallet;
  const buyer = Keypair.generate();
  const buyer2 = Keypair.generate();
  
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
        Buffer.from("ticket_escrow"),
        eventPubkey.toBuffer(),
      ],
      program.programId
    );
    return pda;
  };

  // Helper to create an event
  const createTestEvent = async (eventId: string, totalSupply: number) => {
    const treasury = Keypair.generate();
    const metadataUri = "https://example.com/event-metadata.json";
    const startTs = new BN(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
    const endTs = new BN(Math.floor(Date.now() / 1000) + 86400); // 1 day from now
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
      .accountsPartial({
        event: eventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return eventPda;
  };

  // Helper to create a tier
  const createTestTier = async (
    eventPda: PublicKey, 
    tierId: string, 
    maxSupply: number,
    priceLamports: BN = new BN(1_000_000_000) // 1 SOL default
  ) => {
    const tierPda = await getTierPda(eventPda, tierId);
    
    await program.methods
      .createTicketTier(
        tierId,
        "https://example.com/tier.json",
        priceLamports,
        maxSupply,
        500, // 5% royalty
        0,
        true
      )
      .accountsPartial({
        tier: tierPda,
        event: eventPda,
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tierPda;
  };

  // Helper to mint an NFT
  const mintNFT = async (owner: Keypair) => {
    const mint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      0 // 0 decimals for NFT
    );

    const tokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      owner,
      mint,
      owner.publicKey
    );

    // Mint exactly 1 token (NFT)
    await mintTo(
      provider.connection,
      owner,
      mint,
      tokenAccount,
      owner,
      1
    );

    return { mint, tokenAccount };
  };

  before(async () => {
    console.log("\n💰 Funding test buyers...");
    
    try {
      // Try small airdrops first (devnet has rate limits)
      const airdropSig = await provider.connection.requestAirdrop(
        buyer.publicKey,
        1 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);
      console.log(`Buyer 1: ${buyer.publicKey.toBase58()}`);

      const airdropSig2 = await provider.connection.requestAirdrop(
        buyer2.publicKey,
        1 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig2);
      console.log(`Buyer 2: ${buyer2.publicKey.toBase58()}`);
    } catch (error) {
      console.log("⚠️ Airdrop failed (rate limit), using organizer to fund buyers...");
      
      // Fallback: Transfer from organizer
      const transferTx = new anchor.web3.Transaction();
      transferTx.add(
        SystemProgram.transfer({
          fromPubkey: organizer.publicKey,
          toPubkey: buyer.publicKey,
          lamports: 3 * anchor.web3.LAMPORTS_PER_SOL,
        })
      );
      transferTx.add(
        SystemProgram.transfer({
          fromPubkey: organizer.publicKey,
          toPubkey: buyer2.publicKey,
          lamports: 3 * anchor.web3.LAMPORTS_PER_SOL,
        })
      );
      
      await provider.sendAndConfirm(transferTx);
      console.log("✅ Transferred from organizer");
    }
    
    const buyer1Balance = await provider.connection.getBalance(buyer.publicKey);
    const buyer2Balance = await provider.connection.getBalance(buyer2.publicKey);
    console.log(`Buyer 1 balance: ${(buyer1Balance / 1e9).toFixed(4)} SOL`);
    console.log(`Buyer 2 balance: ${(buyer2Balance / 1e9).toFixed(4)} SOL`);
    console.log("✅ Funding completed\n");
  });

  describe("successful purchase", () => {
    it("purchases a ticket with payment and NFT registration", async () => {
      console.log("\n🎫 Test: Successful Purchase");
      
      const eventId = `event-${Date.now().toString().slice(-8)}`;
      const eventPda = await createTestEvent(eventId, 1000);
      
      const tierPrice = new BN(2_000_000_000); // 2 SOL
      const tierPda = await createTestTier(eventPda, "vip", 100, tierPrice);
      
      // Mint NFT first
      const { mint, tokenAccount } = await mintNFT(buyer);
      console.log(`NFT Mint: ${mint.toBase58()}`);
      
      const ticketPda = await getTicketPda(mint);
      const escrowPda = await getEscrowPda(eventPda);
      
      // Get initial balances
      const buyerBalanceBefore = await provider.connection.getBalance(buyer.publicKey);
      const escrowBalanceBefore = await provider.connection.getBalance(escrowPda);
      
      console.log(`Buyer balance before: ${(buyerBalanceBefore / 1e9).toFixed(4)} SOL`);
      console.log(`Escrow balance before: ${(escrowBalanceBefore / 1e9).toFixed(4)} SOL`);

      // Purchase ticket
      const tx = await program.methods
        .purchaseTicket()
        .accountsPartial({
          ticket: ticketPda,
          event: eventPda,
          tier: tierPda,
          mint: mint,
          buyerTokenAccount: tokenAccount,
          ticketEscrow: escrowPda,
          buyer: buyer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();

      console.log(`✅ Transaction: ${tx}`);

      // Verify balances changed
      const buyerBalanceAfter = await provider.connection.getBalance(buyer.publicKey);
      const escrowBalanceAfter = await provider.connection.getBalance(escrowPda);
      
      console.log(`Buyer balance after: ${(buyerBalanceAfter / 1e9).toFixed(4)} SOL`);
      console.log(`Escrow balance after: ${(escrowBalanceAfter / 1e9).toFixed(4)} SOL`);
      
      // Verify payment was transferred
      const paymentReceived = escrowBalanceAfter - escrowBalanceBefore;
      assert.equal(paymentReceived, tierPrice.toNumber(), "Escrow should receive tier price");
      
      // Verify ticket was created
      const ticketAccount = await program.account.ticket.fetch(ticketPda);
      assert.ok(ticketAccount.owner.equals(buyer.publicKey), "Ticket owner should be buyer");
      assert.ok(ticketAccount.event.equals(eventPda), "Ticket event should match");
      assert.ok(ticketAccount.tier.equals(tierPda), "Ticket tier should match");
      assert.ok(ticketAccount.mint.equals(mint), "Ticket mint should match");
      assert.equal(ticketAccount.used, false, "Ticket should not be used");
      assert.equal(ticketAccount.refunded, false, "Ticket should not be refunded");
      
      // Verify tier supply incremented
      const tierAccount = await program.account.ticketTier.fetch(tierPda);
      assert.equal(tierAccount.currentSupply, 1, "Tier current supply should be 1");
      
      // Verify event revenue tracked
      const eventAccount = await program.account.event.fetch(eventPda);
      assert.equal(
        eventAccount.ticketRevenue.toString(), 
        tierPrice.toString(), 
        "Event ticket revenue should match tier price"
      );
      
      console.log("✅ All assertions passed");
    });

    it("handles multiple purchases correctly", async () => {
      console.log("\n🎫 Test: Multiple Purchases");
      
      const eventId = `event-${Date.now().toString().slice(-8)}`;
      const eventPda = await createTestEvent(eventId, 1000);
      
      const tierPrice = new BN(1_500_000_000); // 1.5 SOL
      const tierPda = await createTestTier(eventPda, "regular", 500, tierPrice);
      
      const buyers = [buyer, buyer2];
      const escrowPda = await getEscrowPda(eventPda);
      
      for (let i = 0; i < buyers.length; i++) {
        const currentBuyer = buyers[i];
        const { mint, tokenAccount } = await mintNFT(currentBuyer);
        const ticketPda = await getTicketPda(mint);

        await program.methods
          .purchaseTicket()
          .accountsPartial({
            ticket: ticketPda,
            event: eventPda,
            tier: tierPda,
            mint: mint,
            buyerTokenAccount: tokenAccount,
            ticketEscrow: escrowPda,
            buyer: currentBuyer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([currentBuyer])
          .rpc();

        const ticketAccount = await program.account.ticket.fetch(ticketPda);
        assert.ok(ticketAccount.owner.equals(currentBuyer.publicKey));
        console.log(`✅ Buyer ${i + 1} purchased successfully`);
      }

      // Verify tier supply
      const tierAccount = await program.account.ticketTier.fetch(tierPda);
      assert.equal(tierAccount.currentSupply, 2, "Tier should have 2 tickets sold");
      
      // Verify total revenue
      const eventAccount = await program.account.event.fetch(eventPda);
      const expectedRevenue = tierPrice.toNumber() * 2;
      assert.equal(
        eventAccount.ticketRevenue.toNumber(), 
        expectedRevenue,
        "Event revenue should be sum of all ticket prices"
      );
      
      console.log("✅ Multiple purchases completed");
    });
  });

  describe("validation errors", () => {
    it("fails when NFT supply is not exactly 1", async () => {
      console.log("\n❌ Test: Invalid NFT Supply");
      
      const eventId = `event-${Date.now().toString().slice(-8)}`;
      const eventPda = await createTestEvent(eventId, 1000);
      const tierPda = await createTestTier(eventPda, "invalid-supply", 100);
      
      // Create mint with 2 tokens (not an NFT)
      const mint = await createMint(
        provider.connection,
        buyer,
        buyer.publicKey,
        null,
        0
      );

      const tokenAccount = await createAssociatedTokenAccount(
        provider.connection,
        buyer,
        mint,
        buyer.publicKey
      );

      // Mint 2 tokens
      await mintTo(
        provider.connection,
        buyer,
        mint,
        tokenAccount,
        buyer,
        2
      );

      const ticketPda = await getTicketPda(mint);
      const escrowPda = await getEscrowPda(eventPda);

      try {
        await program.methods
          .purchaseTicket()
          .accountsPartial({
            ticket: ticketPda,
            event: eventPda,
            tier: tierPda,
            mint: mint,
            buyerTokenAccount: tokenAccount,
            ticketEscrow: escrowPda,
            buyer: buyer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([buyer])
          .rpc();
        
        assert.fail("Expected transaction to fail due to invalid supply");
      } catch (error) {
        assert.include(error.message, "InvalidSupply");
        console.log("✅ Correctly rejected invalid supply");
      }
    });

    it("fails when buyer doesn't own the NFT", async () => {
      console.log("\n❌ Test: Buyer Doesn't Own NFT");
      
      const eventId = `event-${Date.now().toString().slice(-8)}`;
      const eventPda = await createTestEvent(eventId, 1000);
      const tierPda = await createTestTier(eventPda, "not-owned", 100);
      
      // Create NFT but don't mint tokens to account
      const mint = await createMint(
        provider.connection,
        buyer,
        buyer.publicKey,
        null,
        0
      );

      const tokenAccount = await createAssociatedTokenAccount(
        provider.connection,
        buyer,
        mint,
        buyer.publicKey
      );

      // Don't mint any tokens - amount = 0

      const ticketPda = await getTicketPda(mint);
      const escrowPda = await getEscrowPda(eventPda);

      try {
        await program.methods
          .purchaseTicket()
          .accountsPartial({
            ticket: ticketPda,
            event: eventPda,
            tier: tierPda,
            mint: mint,
            buyerTokenAccount: tokenAccount,
            ticketEscrow: escrowPda,
            buyer: buyer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([buyer])
          .rpc();
        
        assert.fail("Expected transaction to fail - buyer doesn't own NFT");
      } catch (error) {
        assert.include(error.message, "TicketNotOwned");
        console.log("✅ Correctly rejected - buyer doesn't own NFT");
      }
    });

    it("fails when tier is sold out", async () => {
      console.log("\n❌ Test: Tier Sold Out");
      
      const eventId = `event-${Date.now().toString().slice(-8)}`;
      const eventPda = await createTestEvent(eventId, 1000);
      const tierPda = await createTestTier(eventPda, "soldout", 1); // Max 1 ticket
      const escrowPda = await getEscrowPda(eventPda);
      
      // Purchase first ticket
      const { mint: mint1, tokenAccount: tokenAccount1 } = await mintNFT(buyer);
      const ticketPda1 = await getTicketPda(mint1);

      await program.methods
        .purchaseTicket()
        .accountsPartial({
          ticket: ticketPda1,
          event: eventPda,
          tier: tierPda,
          mint: mint1,
          buyerTokenAccount: tokenAccount1,
          ticketEscrow: escrowPda,
          buyer: buyer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();

      console.log("First ticket purchased successfully");

      // Try to purchase second ticket when tier is full
      const { mint: mint2, tokenAccount: tokenAccount2 } = await mintNFT(buyer2);
      const ticketPda2 = await getTicketPda(mint2);

      try {
        await program.methods
          .purchaseTicket()
          .accountsPartial({
            ticket: ticketPda2,
            event: eventPda,
            tier: tierPda,
            mint: mint2,
            buyerTokenAccount: tokenAccount2,
            ticketEscrow: escrowPda,
            buyer: buyer2.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([buyer2])
          .rpc();
        
        assert.fail("Expected transaction to fail - tier sold out");
      } catch (error) {
        assert.include(error.message, "ExceedsTotalSupply");
        console.log("✅ Correctly rejected - tier sold out");
      }
    });

    it("fails when trying to register same NFT twice", async () => {
      console.log("\n❌ Test: Duplicate Purchase");
      
      const eventId = `event-${Date.now().toString().slice(-8)}`;
      const eventPda = await createTestEvent(eventId, 1000);
      const tierPda = await createTestTier(eventPda, "duplicate", 100);
      const escrowPda = await getEscrowPda(eventPda);
      
      const { mint, tokenAccount } = await mintNFT(buyer);
      const ticketPda = await getTicketPda(mint);

      // First purchase should succeed
      await program.methods
        .purchaseTicket()
        .accountsPartial({
          ticket: ticketPda,
          event: eventPda,
          tier: tierPda,
          mint: mint,
          buyerTokenAccount: tokenAccount,
          ticketEscrow: escrowPda,
          buyer: buyer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();

      console.log("First purchase succeeded");

      // Second purchase with same NFT should fail
      try {
        await program.methods
          .purchaseTicket()
          .accountsPartial({
            ticket: ticketPda,
            event: eventPda,
            tier: tierPda,
            mint: mint,
            buyerTokenAccount: tokenAccount,
            ticketEscrow: escrowPda,
            buyer: buyer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([buyer])
          .rpc();
        
        assert.fail("Expected transaction to fail - duplicate purchase");
      } catch (error) {
        assert.include(error.message, "already in use");
        console.log("✅ Correctly rejected duplicate purchase");
      }
    });

    it("fails when buyer has insufficient funds", async () => {
      console.log("\n❌ Test: Insufficient Funds");
      
      const poorBuyer = Keypair.generate();
      
      // Airdrop minimal SOL (not enough for ticket + fees)
      const airdropSig = await provider.connection.requestAirdrop(
        poorBuyer.publicKey,
        0.5 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);
      
      const eventId = `event-${Date.now().toString().slice(-8)}`;
      const eventPda = await createTestEvent(eventId, 1000);
      
      // Expensive tier: 5 SOL
      const expensivePrice = new BN(5_000_000_000);
      const tierPda = await createTestTier(eventPda, "expensive", 100, expensivePrice);
      const escrowPda = await getEscrowPda(eventPda);
      
      const { mint, tokenAccount } = await mintNFT(poorBuyer);
      const ticketPda = await getTicketPda(mint);

      try {
        await program.methods
          .purchaseTicket()
          .accountsPartial({
            ticket: ticketPda,
            event: eventPda,
            tier: tierPda,
            mint: mint,
            buyerTokenAccount: tokenAccount,
            ticketEscrow: escrowPda,
            buyer: poorBuyer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([poorBuyer])
          .rpc();
        
        assert.fail("Expected transaction to fail - insufficient funds");
      } catch (error) {
        assert.include(error.message.toLowerCase(), "insufficient");
        console.log("✅ Correctly rejected - insufficient funds");
      }
    });
  });

  describe("event emission", () => {
    it("emits TicketPurchased event with correct data", async () => {
      console.log("\n📡 Test: Event Emission");
      
      const eventId = `event-${Date.now().toString().slice(-8)}`;
      const eventPda = await createTestEvent(eventId, 1000);
      
      const tierPrice = new BN(1_000_000_000);
      const tierPda = await createTestTier(eventPda, "emission", 100, tierPrice);
      const escrowPda = await getEscrowPda(eventPda);
      
      const { mint, tokenAccount } = await mintNFT(buyer);
      const ticketPda = await getTicketPda(mint);

      // Listen for events
      let eventEmitted = false;
      const listener = program.addEventListener("ticketPurchased", (event) => {
        console.log("Event received:", event);
        assert.ok(event.ticketPubkey.equals(ticketPda));
        assert.ok(event.eventPubkey.equals(eventPda));
        assert.ok(event.tierPubkey.equals(tierPda));
        assert.ok(event.mintPubkey.equals(mint));
        assert.ok(event.buyer.equals(buyer.publicKey));
        assert.equal(event.pricePaid.toString(), tierPrice.toString());
        assert.isNumber(event.timestamp);
        eventEmitted = true;
      });

      await program.methods
        .purchaseTicket()
        .accountsPartial({
          ticket: ticketPda,
          event: eventPda,
          tier: tierPda,
          mint: mint,
          buyerTokenAccount: tokenAccount,
          ticketEscrow: escrowPda,
          buyer: buyer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await program.removeEventListener(listener);
      
      console.log("✅ Event emission test completed");
    });
  });
});
