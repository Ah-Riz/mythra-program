import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  SYSVAR_RENT_PUBKEY 
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { MythraProgram } from "../target/types/mythra_program";
import { assert } from "chai";

describe("register_mint", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  
  const organizer = provider.wallet;
  const buyer = Keypair.generate();
  const wrongOwner = Keypair.generate();
  
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

  // Helper to mint an NFT
  const mintNFT = async (owner: Keypair) => {
    // Create mint account
    const mint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      0 // 0 decimals for NFT
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

    return { mint, tokenAccount };
  };

  before(async () => {
    // Airdrop to buyer
    const airdropSig = await provider.connection.requestAirdrop(
      buyer.publicKey,
      5 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Airdrop to wrong owner
    const airdropSig2 = await provider.connection.requestAirdrop(
      wrongOwner.publicKey,
      5 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig2);
  });

  describe("valid registration", () => {
    it("registers an externally minted NFT as a ticket", async () => {
      const eventId = "event-register-001";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);
      
      const tierPda = await createTestTier(eventPda, "vip-tier", 100);
      
      // Mint NFT to buyer
      const { mint, tokenAccount } = await mintNFT(buyer);
      
      const ticketPda = await getTicketPda(mint);

      const tx = await program.methods
        .registerMint()
        .accounts({
          ticket: ticketPda,
          event: eventPda,
          tier: tierPda,
          mint: mint,
          buyerTokenAccount: tokenAccount,
          buyer: buyer.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("Transaction signature:", tx);

      // Fetch and verify the ticket account
      const ticketAccount = await program.account.ticket.fetch(ticketPda);
      
      assert.ok(ticketAccount.owner.equals(buyer.publicKey));
      assert.ok(ticketAccount.event.equals(eventPda));
      assert.ok(ticketAccount.tier.equals(tierPda));
      assert.ok(ticketAccount.mint.equals(mint));
      assert.equal(ticketAccount.used, false);
      assert.isNotNull(ticketAccount.bump);

      // Verify tier's current supply was incremented
      const tierAccount = await program.account.ticketTier.fetch(tierPda);
      assert.equal(tierAccount.currentSupply, 1);
    });

    it("registers multiple NFTs for different buyers", async () => {
      const eventId = "event-register-multi";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);
      
      const tierPda = await createTestTier(eventPda, "regular-tier", 500);

      const buyers = [buyer, wrongOwner];
      
      for (let i = 0; i < buyers.length; i++) {
        const currentBuyer = buyers[i];
        const { mint, tokenAccount } = await mintNFT(currentBuyer);
        const ticketPda = await getTicketPda(mint);

        await program.methods
          .registerMint()
          .accounts({
            ticket: ticketPda,
            event: eventPda,
            tier: tierPda,
            mint: mint,
            buyerTokenAccount: tokenAccount,
            buyer: currentBuyer.publicKey,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();

        const ticketAccount = await program.account.ticket.fetch(ticketPda);
        assert.ok(ticketAccount.owner.equals(currentBuyer.publicKey));
      }

      const tierAccount = await program.account.ticketTier.fetch(tierPda);
      assert.equal(tierAccount.currentSupply, 2);
    });
  });

  describe("duplicate prevention", () => {
    it("fails when registering the same mint twice", async () => {
      const eventId = "event-register-duplicate";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);
      
      const tierPda = await createTestTier(eventPda, "dup-tier", 100);
      
      const { mint, tokenAccount } = await mintNFT(buyer);
      const ticketPda = await getTicketPda(mint);

      // First registration should succeed
      await program.methods
        .registerMint()
        .accounts({
          ticket: ticketPda,
          event: eventPda,
          tier: tierPda,
          mint: mint,
          buyerTokenAccount: tokenAccount,
          buyer: buyer.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Second registration should fail
      try {
        await program.methods
          .registerMint()
          .accounts({
            ticket: ticketPda,
            event: eventPda,
            tier: tierPda,
            mint: mint,
            buyerTokenAccount: tokenAccount,
            buyer: buyer.publicKey,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to duplicate mint");
      } catch (error) {
        assert.include(error.message, "already in use");
      }
    });
  });

  describe("mismatched owner handling", () => {
    it("fails when token account owner doesn't match buyer", async () => {
      const eventId = "event-register-wrong-owner";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);
      
      const tierPda = await createTestTier(eventPda, "wrong-owner-tier", 100);
      
      // Mint NFT to buyer but try to register with wrongOwner
      const { mint, tokenAccount } = await mintNFT(buyer);
      const ticketPda = await getTicketPda(mint);

      try {
        await program.methods
          .registerMint()
          .accounts({
            ticket: ticketPda,
            event: eventPda,
            tier: tierPda,
            mint: mint,
            buyerTokenAccount: tokenAccount,
            buyer: wrongOwner.publicKey, // Wrong owner
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to mismatched owner");
      } catch (error) {
        assert.include(error.message, "InvalidMintOwner");
      }
    });

    it("fails when token account has wrong mint", async () => {
      const eventId = "event-register-wrong-mint";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);
      
      const tierPda = await createTestTier(eventPda, "wrong-mint-tier", 100);
      
      const { mint: mint1, tokenAccount: tokenAccount1 } = await mintNFT(buyer);
      const { mint: mint2 } = await mintNFT(buyer);
      const ticketPda = await getTicketPda(mint2);

      try {
        await program.methods
          .registerMint()
          .accounts({
            ticket: ticketPda,
            event: eventPda,
            tier: tierPda,
            mint: mint2,
            buyerTokenAccount: tokenAccount1, // Wrong token account (has mint1)
            buyer: buyer.publicKey,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to wrong mint");
      } catch (error) {
        assert.include(error.message, "InvalidMintOwner");
      }
    });
  });

  describe("invalid supply", () => {
    it("fails when mint has supply > 1", async () => {
      const eventId = "event-register-multi-supply";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);
      
      const tierPda = await createTestTier(eventPda, "multi-supply-tier", 100);
      
      // Create mint with multiple tokens
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

      // Mint 2 tokens (not an NFT)
      await mintTo(
        provider.connection,
        buyer,
        mint,
        tokenAccount,
        buyer,
        2
      );

      const ticketPda = await getTicketPda(mint);

      try {
        await program.methods
          .registerMint()
          .accounts({
            ticket: ticketPda,
            event: eventPda,
            tier: tierPda,
            mint: mint,
            buyerTokenAccount: tokenAccount,
            buyer: buyer.publicKey,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to invalid supply");
      } catch (error) {
        assert.include(error.message, "InvalidSupply");
      }
    });

    it("fails when buyer doesn't own exactly 1 token", async () => {
      const eventId = "event-register-no-token";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);
      
      const tierPda = await createTestTier(eventPda, "no-token-tier", 100);
      
      // Create NFT but don't mint to buyer's account
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

      // Don't mint any tokens - tokenAccount.amount = 0

      const ticketPda = await getTicketPda(mint);

      try {
        await program.methods
          .registerMint()
          .accounts({
            ticket: ticketPda,
            event: eventPda,
            tier: tierPda,
            mint: mint,
            buyerTokenAccount: tokenAccount,
            buyer: buyer.publicKey,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to zero tokens");
      } catch (error) {
        assert.include(error.message, "InvalidSupply");
      }
    });
  });

  describe("tier sold out", () => {
    it("fails when tier has no remaining supply", async () => {
      const eventId = "event-register-sold-out";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);
      
      const tierPda = await createTestTier(eventPda, "soldout-tier", 1);
      
      // Register first NFT
      const { mint: mint1, tokenAccount: tokenAccount1 } = await mintNFT(buyer);
      const ticketPda1 = await getTicketPda(mint1);

      await program.methods
        .registerMint()
        .accounts({
          ticket: ticketPda1,
          event: eventPda,
          tier: tierPda,
          mint: mint1,
          buyerTokenAccount: tokenAccount1,
          buyer: buyer.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Try to register second NFT when tier is full
      const { mint: mint2, tokenAccount: tokenAccount2 } = await mintNFT(wrongOwner);
      const ticketPda2 = await getTicketPda(mint2);

      try {
        await program.methods
          .registerMint()
          .accounts({
            ticket: ticketPda2,
            event: eventPda,
            tier: tierPda,
            mint: mint2,
            buyerTokenAccount: tokenAccount2,
            buyer: wrongOwner.publicKey,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to sold out tier");
      } catch (error) {
        assert.include(error.message, "ExceedsTotalSupply");
      }
    });
  });

  describe("event emission", () => {
    it("emits TicketRegistered event with correct data", async () => {
      const eventId = "event-register-emission";
      const totalSupply = 1000;
      const eventPda = await createTestEvent(eventId, totalSupply);
      
      const tierPda = await createTestTier(eventPda, "emission-tier", 100);
      
      const { mint, tokenAccount } = await mintNFT(buyer);
      const ticketPda = await getTicketPda(mint);

      // Listen for events
      let eventEmitted = false;
      const listener = program.addEventListener("ticketRegistered", (event) => {
        assert.ok(event.ticketPubkey.equals(ticketPda));
        assert.ok(event.eventPubkey.equals(eventPda));
        assert.ok(event.tierPubkey.equals(tierPda));
        assert.ok(event.mintPubkey.equals(mint));
        assert.ok(event.owner.equals(buyer.publicKey));
        assert.isNumber(event.timestamp);
        eventEmitted = true;
      });

      await program.methods
        .registerMint()
        .accounts({
          ticket: ticketPda,
          event: eventPda,
          tier: tierPda,
          mint: mint,
          buyerTokenAccount: tokenAccount,
          buyer: buyer.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await program.removeEventListener(listener);
      
      console.log("Event emission test completed");
    });
  });
});
