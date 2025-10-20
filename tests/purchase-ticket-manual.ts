import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  TransactionInstruction,
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

describe("purchase_ticket_manual", () => {
  const provider = initializeProvider();
  const program = anchor.workspace.MythraProgram as Program<MythraProgram>;
  
  const organizer = provider.wallet;
  const buyer = Keypair.generate();
  
  before(async () => {
    console.log("\n🔧 Manual Purchase Ticket Test");
    
    // Fund buyer from organizer
    const transferTx = new anchor.web3.Transaction();
    transferTx.add(
      SystemProgram.transfer({
        fromPubkey: organizer.publicKey,
        toPubkey: buyer.publicKey,
        lamports: 5 * anchor.web3.LAMPORTS_PER_SOL,
      })
    );
    await provider.sendAndConfirm(transferTx);
    console.log(`✅ Buyer funded`);
  });
  
  it("purchases ticket with manual instruction", async () => {
    console.log("\n🎫 Test: Manual Instruction Build");
    
    // 1. Create event
    const eventId = `test-${Date.now()}`;
    const treasury = Keypair.generate();
    
    const [eventPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("event"), organizer.publicKey.toBuffer(), Buffer.from(eventId)],
      program.programId
    );
    
    await program.methods
      .createEvent(
        eventId,
        "https://example.com/event.json",
        new BN(Math.floor(Date.now() / 1000) + 3600),
        new BN(Math.floor(Date.now() / 1000) + 86400),
        1000,
        250
      )
      .accounts({
        event: eventPda,
        organizer: organizer.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("✅ Event created");
    
    // 2. Create tier
    const tierId = "vip";
    const [tierPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tier"), eventPda.toBuffer(), Buffer.from(tierId)],
      program.programId
    );
    
    await program.methods
      .createTicketTier(
        tierId,
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
    
    console.log("✅ Tier created");
    
    // 3. Mint NFT
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
    
    await mintTo(
      provider.connection,
      buyer,
      mint,
      tokenAccount,
      buyer,
      1
    );
    
    console.log(`✅ NFT minted`);
    
    // 4. Build purchase_ticket instruction MANUALLY
    const [ticketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), mint.toBuffer()],
      program.programId
    );
    
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket_escrow"), eventPda.toBuffer()],
      program.programId
    );
    
    // Get the instruction discriminator
    const discriminator = Buffer.from([90, 91, 173, 20, 72, 109, 15, 146]);
    
    // Build instruction manually
    const keys = [
      { pubkey: ticketPda, isSigner: false, isWritable: true },
      { pubkey: eventPda, isSigner: false, isWritable: true },
      { pubkey: tierPda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: tokenAccount, isSigner: false, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: buyer.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];
    
    const instruction = new TransactionInstruction({
      keys,
      programId: program.programId,
      data: discriminator, // No args, just discriminator
    });
    
    const escrowBefore = await provider.connection.getBalance(escrowPda);
    console.log(`Escrow before: ${(escrowBefore / 1e9).toFixed(4)} SOL`);
    
    // Send transaction
    const tx = new anchor.web3.Transaction().add(instruction);
    const txSig = await provider.sendAndConfirm(tx, [buyer]);
    
    console.log(`✅ Purchase TX: ${txSig}`);
    
    // 5. Verify
    const ticketAccount = await program.account.ticket.fetch(ticketPda);
    assert.ok(ticketAccount.owner.equals(buyer.publicKey));
    assert.ok(ticketAccount.mint.equals(mint));
    assert.equal(ticketAccount.used, false);
    
    const tierAccount = await program.account.ticketTier.fetch(tierPda);
    assert.equal(tierAccount.currentSupply, 1);
    
    const escrowAfter = await provider.connection.getBalance(escrowPda);
    console.log(`Escrow after: ${(escrowAfter / 1e9).toFixed(4)} SOL`);
    assert.equal(escrowAfter - escrowBefore, 1_000_000_000);
    
    console.log("✅ All verifications passed! Instruction works correctly!");
  });
});
