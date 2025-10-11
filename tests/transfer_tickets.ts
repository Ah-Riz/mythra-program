import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MythraProgram } from "../target/types/mythra_program";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { assert } from "chai";

describe("transfer_ticket", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  const connection = provider.connection;

  // Test accounts
  const organizer = anchor.web3.Keypair.generate();
  const buyer = anchor.web3.Keypair.generate();
  const recipient = anchor.web3.Keypair.generate();
  const treasury = anchor.web3.Keypair.generate();
  const platformTreasury = anchor.web3.Keypair.generate();

  // PDA seeds
  const eventId = "test-event";
  const tierId = "vip";
  const [eventPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(eventId)],
    program.programId
  );

  // Token accounts
  let mint: anchor.web3.PublicKey;
  let buyerTokenAccount: anchor.web3.PublicKey;
  let recipientTokenAccount: anchor.web3.PublicKey;

  before(async () => {
    // Airdrop SOL to accounts
    const airdropPromises = [
      connection.requestAirdrop(organizer.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL),
      connection.requestAirdrop(buyer.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL),
      connection.requestAirdrop(recipient.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL),
      connection.requestAirdrop(treasury.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL),
      connection.requestAirdrop(platformTreasury.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL),
    ];
    
    const signatures = await Promise.all(airdropPromises);
    await Promise.all(signatures.map(sig => connection.confirmTransaction(sig)));

    // Create event
    await program.methods
      .createEvent(
        eventId,
        "https://example.com/event",
        new anchor.BN(Math.floor(Date.now() / 1000) + 86400), // Start in 1 day
        new anchor.BN(Math.floor(Date.now() / 1000) + 172800), // End in 2 days
        1000, // total_supply
        250 // platform_split_bps (2.5%)
      )
      .accounts({
        event: eventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();

    // Create ticket tier with resale enabled
    await program.methods
      .createTicketTier(
        tierId,
        "https://example.com/tier/vip",
        new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL), // 1 SOL
        100, // max_supply
        500, // 5% royalty
        0, // tier_index
        true // resale_enabled
      )
      .accounts({
        event: eventPda,
        tier: PublicKey.findProgramAddressSync(
          [Buffer.from("tier"), eventPda.toBuffer(), Buffer.from(tierId)],
          program.programId
        )[0],
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();

    // Create mint and token accounts for testing
    mint = await createMint(
      connection,
      organizer,
      organizer.publicKey,
      null,
      0 // 0 decimals for NFTs
    );

    // Create token accounts
    buyerTokenAccount = (await getOrCreateAssociatedTokenAccount(
      connection,
      buyer,
      mint,
      buyer.publicKey
    )).address;

    recipientTokenAccount = (await getOrCreateAssociatedTokenAccount(
      connection,
      recipient,
      mint,
      recipient.publicKey
    )).address;

    // Mint NFT to buyer
    await mintTo(
      connection,
      organizer,
      mint,
      buyerTokenAccount,
      organizer,
      1 // amount
    );
  });

  it("successfully transfers a ticket", async () => {
    // Register the ticket first
    await program.methods
      .registerMint()
      .accounts({
        ticket: PublicKey.findProgramAddressSync(
          [Buffer.from("ticket"), mint.toBuffer()],
          program.programId
        )[0],
        event: eventPda,
        tier: PublicKey.findProgramAddressSync(
          [Buffer.from("tier"), eventPda.toBuffer(), Buffer.from(tierId)],
          program.programId
        )[0],
        mint: mint,
        buyer: buyer.publicKey,
        buyerTokenAccount: buyerTokenAccount,
        authority: organizer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();

    // Transfer with royalty
    const salePrice = new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL); // 2 SOL
    
    // Build transaction manually to ensure platformTreasury is writable
    const transferIx = await program.methods
      .transferTicket(salePrice)
      .accounts({
        ticket: PublicKey.findProgramAddressSync(
          [Buffer.from("ticket"), mint.toBuffer()],
          program.programId
        )[0],
        event: eventPda,
        tier: PublicKey.findProgramAddressSync(
          [Buffer.from("tier"), eventPda.toBuffer(), Buffer.from(tierId)],
          program.programId
        )[0],
        mint: mint,
        senderTokenAccount: buyerTokenAccount,
        recipientTokenAccount: recipientTokenAccount,
        sender: buyer.publicKey,
        recipient: recipient.publicKey,
        platformTreasury: platformTreasury.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    // Manually fix platformTreasury to be writable (Anchor bug workaround)
    const platformTreasuryIndex = transferIx.keys.findIndex(
      k => k.pubkey.equals(platformTreasury.publicKey)
    );
    if (platformTreasuryIndex >= 0) {
      transferIx.keys[platformTreasuryIndex].isWritable = true;
    }

    const tx = new anchor.web3.Transaction().add(transferIx);
    await provider.sendAndConfirm(tx, [buyer]);

    // Verify ticket owner was updated
    const ticket = await program.account.ticket.fetch(
      PublicKey.findProgramAddressSync(
        [Buffer.from("ticket"), mint.toBuffer()],
        program.programId
      )[0]
    );

    assert.isTrue(ticket.owner.equals(recipient.publicKey), "Ticket owner not updated");
  });

  it("fails to transfer when resale is disabled", async () => {
    // Create a new ticket tier with resale disabled
    const noResaleTierId = "no-resale";
    await program.methods
      .createTicketTier(
        noResaleTierId,
        "https://example.com/tier/no-resale",
        new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL),
        100,
        0, // no royalty
        1, // tier_index
        false // resale_disabled
      )
      .accounts({
        event: eventPda,
        tier: PublicKey.findProgramAddressSync(
          [Buffer.from("tier"), eventPda.toBuffer(), Buffer.from(noResaleTierId)],
          program.programId
        )[0],
        authority: organizer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();

    // Create a new mint for this test
    const testMint = await createMint(
      connection,
      organizer,
      organizer.publicKey,
      null,
      0
    );

    const testBuyerTokenAccount = (await getOrCreateAssociatedTokenAccount(
      connection,
      buyer,
      testMint,
      buyer.publicKey
    )).address;

    const testRecipientTokenAccount = (await getOrCreateAssociatedTokenAccount(
      connection,
      recipient,
      testMint,
      recipient.publicKey
    )).address;

    // Mint NFT to buyer
    await mintTo(
      connection,
      organizer,
      testMint,
      testBuyerTokenAccount,
      organizer,
      1
    );

    // Register the ticket
    await program.methods
      .registerMint()
      .accounts({
      
        ticket: PublicKey.findProgramAddressSync(
          [Buffer.from("ticket"), testMint.toBuffer()],
          program.programId
        )[0],
        event: eventPda,
        tier: PublicKey.findProgramAddressSync(
          [Buffer.from("tier"), eventPda.toBuffer(), Buffer.from(noResaleTierId)],
          program.programId
        )[0],
        mint: testMint,
        buyer: buyer.publicKey,
        buyerTokenAccount: testBuyerTokenAccount,
        authority: organizer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();

    // Attempt to transfer (should fail)
    try {
      await program.methods
        .transferTicket(new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL))
        .accounts({
          ticket: PublicKey.findProgramAddressSync(
            [Buffer.from("ticket"), testMint.toBuffer()],
            program.programId
          )[0],
          event: eventPda,
          tier: PublicKey.findProgramAddressSync(
            [Buffer.from("tier"), eventPda.toBuffer(), Buffer.from(noResaleTierId)],
            program.programId
          )[0],
          mint: testMint,
          senderTokenAccount: testBuyerTokenAccount,
          recipientTokenAccount: testRecipientTokenAccount,
          sender: buyer.publicKey,
          recipient: recipient.publicKey,
          platformTreasury: platformTreasury.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      assert.fail("Transaction should have failed");
    } catch (err) {
      assert.include(err.message, "ResaleDisabled");
    }
  });

  it("properly handles royalty payments", async () => {
    // This test verifies that royalty payments are correctly calculated and transferred
    // Similar to the first test but with specific royalty amount checks
    const royaltyMint = await createMint(
      connection,
      organizer,
      organizer.publicKey,
      null,
      0
    );

    const royaltyBuyerTokenAccount = (await getOrCreateAssociatedTokenAccount(
      connection,
      buyer,
      royaltyMint,
      buyer.publicKey
    )).address;

    const royaltyRecipientTokenAccount = (await getOrCreateAssociatedTokenAccount(
      connection,
      recipient,
      royaltyMint,
      recipient.publicKey
    )).address;

    // Mint NFT to buyer
    await mintTo(
      connection,
      organizer,
      royaltyMint,
      royaltyBuyerTokenAccount,
      organizer,
      1
    );

    // Register the ticket
    await program.methods
      .registerMint()
      .accounts({
      
        ticket: PublicKey.findProgramAddressSync(
          [Buffer.from("ticket"), royaltyMint.toBuffer()],
          program.programId
        )[0],
        event: eventPda,
        tier: PublicKey.findProgramAddressSync(
          [Buffer.from("tier"), eventPda.toBuffer(), Buffer.from(tierId)], // Using the VIP tier with 5% royalty
          program.programId
        )[0],
        mint: royaltyMint,
        buyer: buyer.publicKey,
        buyerTokenAccount: royaltyBuyerTokenAccount,
        authority: organizer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();

    // Get initial balances
    const initialBuyerBalance = await connection.getBalance(buyer.publicKey);
    const initialTreasuryBalance = await connection.getBalance(platformTreasury.publicKey);

    // Transfer with royalty
    const salePrice = new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL); // 10 SOL
    const expectedRoyalty = salePrice.muln(5).divn(100); // 5% of 10 SOL = 0.5 SOL

    // Build transaction manually to ensure platformTreasury is writable
    const royaltyTransferIx = await program.methods
      .transferTicket(salePrice)
      .accounts({
        ticket: PublicKey.findProgramAddressSync(
          [Buffer.from("ticket"), royaltyMint.toBuffer()],
          program.programId
        )[0],
        event: eventPda,
        tier: PublicKey.findProgramAddressSync(
          [Buffer.from("tier"), eventPda.toBuffer(), Buffer.from(tierId)],
          program.programId
        )[0],
        mint: royaltyMint,
        senderTokenAccount: royaltyBuyerTokenAccount,
        recipientTokenAccount: royaltyRecipientTokenAccount,
        sender: buyer.publicKey,
        recipient: recipient.publicKey,
        platformTreasury: platformTreasury.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    // Manually fix platformTreasury to be writable (Anchor bug workaround)
    const royaltyPlatformTreasuryIndex = royaltyTransferIx.keys.findIndex(
      k => k.pubkey.equals(platformTreasury.publicKey)
    );
    if (royaltyPlatformTreasuryIndex >= 0) {
      royaltyTransferIx.keys[royaltyPlatformTreasuryIndex].isWritable = true;
    }

    const royaltyTx = new anchor.web3.Transaction().add(royaltyTransferIx);
    await provider.sendAndConfirm(royaltyTx, [buyer]);

    // Get final balances
    const finalBuyerBalance = await connection.getBalance(buyer.publicKey);
    const finalTreasuryBalance = await connection.getBalance(platformTreasury.publicKey);

    // Calculate actual royalty paid (approximate due to transaction fees)
    const actualRoyalty = new anchor.BN(finalTreasuryBalance).sub(new anchor.BN(initialTreasuryBalance));
    const royaltyDifference = actualRoyalty.sub(expectedRoyalty).abs();
    
    // Allow for small differences due to transaction fees
    const tolerance = new anchor.BN(5000); // 0.000005 SOL tolerance
    assert.isTrue(
      royaltyDifference.lte(tolerance),
      `Royalty amount mismatch. Expected ~${expectedRoyalty.toString()}, got ${actualRoyalty.toString()}`
    );
  });
});