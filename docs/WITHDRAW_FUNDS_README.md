# Withdraw Funds Instruction - Implementation Guide

## Overview
Complete Anchor instruction for `withdraw_funds` that enables event organizers to withdraw accumulated funds from the event's escrow account to their treasury. Features comprehensive validation, rent-exemption protection, and secure authorization.

## Key Features

### ✅ Escrow Account Management
- **PDA Seeds**: `["escrow", event.key()]`
- **Purpose**: Holds event revenue from ticket sales
- **Rent-Exempt Protection**: Prevents withdrawal below rent-exempt minimum
- **Secure Transfers**: Uses PDA signing for CPI transfers

### ✅ Authorization
```rust
#[account(
    mut,
    has_one = authority @ EventError::UnauthorizedWithdrawal,
    has_one = treasury @ EventError::UnauthorizedWithdrawal
)]
pub event: Account<'info, Event>,
```
- Only event authority can withdraw
- Must specify correct treasury account
- Dual constraint validation

### ✅ Balance Protection
```rust
let rent_exempt_minimum = rent.minimum_balance(0);
let available_balance = escrow.lamports()
    .checked_sub(rent_exempt_minimum)
    .ok_or(EventError::InsufficientBalance)?;

require!(amount <= available_balance, EventError::InsufficientBalance);
```

### ✅ Event Emission
```rust
#[event]
pub struct FundsWithdrawn {
    pub event_pubkey: Pubkey,
    pub escrow_pubkey: Pubkey,
    pub treasury: Pubkey,
    pub amount: u64,
    pub remaining_balance: u64,
    pub withdrawn_by: Pubkey,
    pub timestamp: i64,
}
```

## Test Coverage (11 Tests - All Passing ✅)

### 1. **Successful Withdrawal** (3 tests)
- ✅ Withdraws funds from escrow to treasury
- ✅ Withdraws partial amount leaving funds in escrow
- ✅ Handles multiple sequential withdrawals

### 2. **Over-Withdrawal Prevention** (3 tests)
- ✅ Fails when withdrawal exceeds escrow balance
- ✅ Respects rent-exempt minimum in escrow
- ✅ Fails when escrow has zero balance

### 3. **Unauthorized Attempts** (2 tests)
- ✅ Fails when non-authority tries to withdraw
- ✅ Fails when trying to withdraw to wrong treasury

### 4. **Event Emission** (1 test)
- ✅ Emits FundsWithdrawn event with correct data

### 5. **Edge Cases** (2 tests)
- ✅ Handles withdrawal of small amount (0.1 SOL)
- ✅ Correctly calculates remaining balance after withdrawal

## Usage Examples

### TypeScript Client

#### Basic Withdrawal
```typescript
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";

const program = anchor.workspace.MythraProgram;

// Derive escrow PDA
const [escrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), eventPda.toBuffer()],
  program.programId
);

// Withdraw 2 SOL
const tx = await program.methods
  .withdrawFunds(new anchor.BN(2 * LAMPORTS_PER_SOL))
  .accounts({
    event: eventPda,
    escrow: escrowPda,
    treasury: treasuryPubkey,
    authority: organizer.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

console.log("Withdrawn:", tx);
```

## Complete Event Ticketing System - Final Status

**Total Instructions: 7**
1. ✅ `create_event` - Event creation
2. ✅ `update_event` - Event updates
3. ✅ `create_ticket_tier` - Tier configuration
4. ✅ `register_mint` - Backend minting
5. ✅ `mark_ticket_used` - Direct check-in
6. ✅ `mark_ticket_used_ed25519` - Offline check-in
7. ✅ `withdraw_funds` - Revenue withdrawal

**Total Tests: 65 passing ✅**

## Summary

The `withdraw_funds` instruction completes the event ticketing system by enabling secure revenue management. Combined with the other instructions, you now have a production-ready event ticketing platform on Solana!
