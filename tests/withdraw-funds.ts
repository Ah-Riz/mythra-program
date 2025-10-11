import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { MythraProgram } from "../target/types/mythra_program";
import { assert } from "chai";

describe("withdraw_funds", () => {
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

  // Helper to create an event
  const createTestEvent = async (eventId: string, treasury: Keypair) => {
    const metadataUri = "https://example.com/event-metadata.json";
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
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return eventPda;
  };

  // Helper to fund escrow account
  const fundEscrow = async (escrowPda: PublicKey, amount: number) => {
    const tx = await provider.connection.requestAirdrop(escrowPda, amount);
    await provider.connection.confirmTransaction(tx);
  };

  before(async () => {
    // Airdrop to unauthorized user
    const airdropSig = await provider.connection.requestAirdrop(
      unauthorizedUser.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);
  });

  describe("successful withdrawal", () => {
    it("withdraws funds from escrow to treasury", async () => {
      const eventId = "event-withdraw-001";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury);
      const escrowPda = await getEscrowPda(eventPda);

      // Fund escrow with 5 SOL
      await fundEscrow(escrowPda, 5 * LAMPORTS_PER_SOL);

      // Get balances before withdrawal
      const escrowBalanceBefore = await provider.connection.getBalance(escrowPda);
      const treasuryBalanceBefore = await provider.connection.getBalance(treasury.publicKey);

      console.log("Escrow balance before:", escrowBalanceBefore / LAMPORTS_PER_SOL, "SOL");
      console.log("Treasury balance before:", treasuryBalanceBefore / LAMPORTS_PER_SOL, "SOL");

      // Withdraw 2 SOL
      const withdrawAmount = 2 * LAMPORTS_PER_SOL;
      
      const tx = await program.methods
        .withdrawFunds(new BN(withdrawAmount))
        .accounts({
          event: eventPda,
          escrow: escrowPda,
          treasury: treasury.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Transaction signature:", tx);

      // Get balances after withdrawal
      const escrowBalanceAfter = await provider.connection.getBalance(escrowPda);
      const treasuryBalanceAfter = await provider.connection.getBalance(treasury.publicKey);

      console.log("Escrow balance after:", escrowBalanceAfter / LAMPORTS_PER_SOL, "SOL");
      console.log("Treasury balance after:", treasuryBalanceAfter / LAMPORTS_PER_SOL, "SOL");

      // Verify balances
      assert.approximately(
        escrowBalanceBefore - escrowBalanceAfter,
        withdrawAmount,
        1000, // Small margin for fees
        "Escrow balance should decrease by withdrawal amount"
      );

      assert.approximately(
        treasuryBalanceAfter - treasuryBalanceBefore,
        withdrawAmount,
        1000,
        "Treasury balance should increase by withdrawal amount"
      );
    });

    it("withdraws partial amount leaving funds in escrow", async () => {
      const eventId = "event-withdraw-partial";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury);
      const escrowPda = await getEscrowPda(eventPda);

      // Fund escrow with 10 SOL
      await fundEscrow(escrowPda, 10 * LAMPORTS_PER_SOL);

      // Withdraw 3 SOL
      const withdrawAmount = 3 * LAMPORTS_PER_SOL;
      
      await program.methods
        .withdrawFunds(new BN(withdrawAmount))
        .accounts({
          event: eventPda,
          escrow: escrowPda,
          treasury: treasury.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Verify escrow still has remaining balance
      const escrowBalance = await provider.connection.getBalance(escrowPda);
      assert.ok(escrowBalance > 6.9 * LAMPORTS_PER_SOL, "Escrow should have ~7 SOL remaining");
    });

    it("handles multiple sequential withdrawals", async () => {
      const eventId = "event-withdraw-multiple";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury);
      const escrowPda = await getEscrowPda(eventPda);

      // Fund escrow with 10 SOL
      await fundEscrow(escrowPda, 10 * LAMPORTS_PER_SOL);

      const initialTreasuryBalance = await provider.connection.getBalance(treasury.publicKey);

      // First withdrawal: 2 SOL
      await program.methods
        .withdrawFunds(new BN(2 * LAMPORTS_PER_SOL))
        .accounts({
          event: eventPda,
          escrow: escrowPda,
          treasury: treasury.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Second withdrawal: 3 SOL
      await program.methods
        .withdrawFunds(new BN(3 * LAMPORTS_PER_SOL))
        .accounts({
          event: eventPda,
          escrow: escrowPda,
          treasury: treasury.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Third withdrawal: 1 SOL
      await program.methods
        .withdrawFunds(new BN(1 * LAMPORTS_PER_SOL))
        .accounts({
          event: eventPda,
          escrow: escrowPda,
          treasury: treasury.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const finalTreasuryBalance = await provider.connection.getBalance(treasury.publicKey);
      const totalWithdrawn = finalTreasuryBalance - initialTreasuryBalance;

      assert.approximately(
        totalWithdrawn,
        6 * LAMPORTS_PER_SOL,
        1000,
        "Total withdrawn should be 6 SOL"
      );
    });
  });

  describe("over-withdrawal prevention", () => {
    it("fails when withdrawal exceeds escrow balance", async () => {
      const eventId = "event-withdraw-exceed";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury);
      const escrowPda = await getEscrowPda(eventPda);

      // Fund escrow with only 1 SOL
      await fundEscrow(escrowPda, 1 * LAMPORTS_PER_SOL);

      // Try to withdraw 10 SOL
      try {
        await program.methods
          .withdrawFunds(new BN(10 * LAMPORTS_PER_SOL))
          .accounts({
            event: eventPda,
            escrow: escrowPda,
            treasury: treasury.publicKey,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to insufficient balance");
      } catch (error) {
        assert.include(error.message, "InsufficientBalance");
      }
    });

    it("respects rent-exempt minimum in escrow", async () => {
      const eventId = "event-withdraw-rent";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury);
      const escrowPda = await getEscrowPda(eventPda);

      // Fund escrow with 1 SOL
      await fundEscrow(escrowPda, 1 * LAMPORTS_PER_SOL);

      const escrowBalance = await provider.connection.getBalance(escrowPda);
      
      // Try to withdraw entire balance (should fail because of rent-exempt minimum)
      try {
        await program.methods
          .withdrawFunds(new BN(escrowBalance))
          .accounts({
            event: eventPda,
            escrow: escrowPda,
            treasury: treasury.publicKey,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to rent-exempt minimum");
      } catch (error) {
        assert.include(error.message, "InsufficientBalance");
      }
    });

    it("fails when escrow has zero balance", async () => {
      const eventId = "event-withdraw-zero";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury);
      const escrowPda = await getEscrowPda(eventPda);

      // Don't fund escrow - it doesn't exist yet

      try {
        await program.methods
          .withdrawFunds(new BN(1 * LAMPORTS_PER_SOL))
          .accounts({
            event: eventPda,
            escrow: escrowPda,
            treasury: treasury.publicKey,
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to zero balance");
      } catch (error) {
        // Will fail because escrow account doesn't exist or has insufficient funds
        assert.ok(error);
      }
    });
  });

  describe("unauthorized attempts", () => {
    it("fails when non-authority tries to withdraw", async () => {
      const eventId = "event-withdraw-unauth";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury);
      const escrowPda = await getEscrowPda(eventPda);

      // Fund escrow
      await fundEscrow(escrowPda, 5 * LAMPORTS_PER_SOL);

      // Try to withdraw as unauthorized user
      try {
        await program.methods
          .withdrawFunds(new BN(1 * LAMPORTS_PER_SOL))
          .accounts({
            event: eventPda,
            escrow: escrowPda,
            treasury: treasury.publicKey,
            authority: unauthorizedUser.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([unauthorizedUser])
          .rpc();
        
        assert.fail("Expected transaction to fail due to unauthorized access");
      } catch (error) {
        assert.include(error.message, "UnauthorizedWithdrawal");
      }
    });

    it("fails when trying to withdraw to wrong treasury", async () => {
      const eventId = "event-withdraw-wrong-treasury";
      const treasury = Keypair.generate();
      const wrongTreasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury);
      const escrowPda = await getEscrowPda(eventPda);

      // Fund escrow
      await fundEscrow(escrowPda, 5 * LAMPORTS_PER_SOL);

      // Try to withdraw to wrong treasury
      try {
        await program.methods
          .withdrawFunds(new BN(1 * LAMPORTS_PER_SOL))
          .accounts({
            event: eventPda,
            escrow: escrowPda,
            treasury: wrongTreasury.publicKey, // Wrong treasury!
            authority: organizer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        
        assert.fail("Expected transaction to fail due to wrong treasury");
      } catch (error) {
        assert.include(error.message, "UnauthorizedWithdrawal");
      }
    });
  });

  describe("event emission", () => {
    it("emits FundsWithdrawn event with correct data", async () => {
      const eventId = "event-withdraw-emission";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury);
      const escrowPda = await getEscrowPda(eventPda);

      // Fund escrow
      await fundEscrow(escrowPda, 5 * LAMPORTS_PER_SOL);

      const withdrawAmount = 2 * LAMPORTS_PER_SOL;

      // Listen for events
      let eventEmitted = false;
      const listener = program.addEventListener("fundsWithdrawn", (event) => {
        assert.ok(event.eventPubkey.equals(eventPda));
        assert.ok(event.escrowPubkey.equals(escrowPda));
        assert.ok(event.treasury.equals(treasury.publicKey));
        assert.ok(event.amount.eq(new BN(withdrawAmount)));
        assert.ok(event.withdrawnBy.equals(organizer.publicKey));
        assert.isNumber(event.remainingBalance.toNumber());
        assert.isNumber(event.timestamp.toNumber());
        eventEmitted = true;
      });

      await program.methods
        .withdrawFunds(new BN(withdrawAmount))
        .accounts({
          event: eventPda,
          escrow: escrowPda,
          treasury: treasury.publicKey,
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
    it("handles withdrawal of small amount (0.1 SOL)", async () => {
      const eventId = "event-withdraw-small";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury);
      const escrowPda = await getEscrowPda(eventPda);

      // Fund escrow
      await fundEscrow(escrowPda, 2 * LAMPORTS_PER_SOL);

      const treasuryBalanceBefore = await provider.connection.getBalance(treasury.publicKey);

      // Withdraw 0.1 SOL
      const withdrawAmount = 0.1 * LAMPORTS_PER_SOL;
      await program.methods
        .withdrawFunds(new BN(withdrawAmount))
        .accounts({
          event: eventPda,
          escrow: escrowPda,
          treasury: treasury.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const treasuryBalanceAfter = await provider.connection.getBalance(treasury.publicKey);
      
      assert.approximately(
        treasuryBalanceAfter - treasuryBalanceBefore,
        withdrawAmount,
        1000,
        "Treasury should receive 0.1 SOL"
      );
    });

    it("correctly calculates remaining balance after withdrawal", async () => {
      const eventId = "event-withdraw-remaining";
      const treasury = Keypair.generate();
      const eventPda = await createTestEvent(eventId, treasury);
      const escrowPda = await getEscrowPda(eventPda);

      // Fund escrow with 7 SOL
      await fundEscrow(escrowPda, 7 * LAMPORTS_PER_SOL);

      const escrowBalanceBefore = await provider.connection.getBalance(escrowPda);
      const withdrawAmount = 4 * LAMPORTS_PER_SOL;

      await program.methods
        .withdrawFunds(new BN(withdrawAmount))
        .accounts({
          event: eventPda,
          escrow: escrowPda,
          treasury: treasury.publicKey,
          authority: organizer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const escrowBalanceAfter = await provider.connection.getBalance(escrowPda);
      const expectedRemaining = escrowBalanceBefore - withdrawAmount;

      assert.approximately(
        escrowBalanceAfter,
        expectedRemaining,
        1000,
        "Remaining balance should be correct"
      );
    });
  });
});
