# Mark Ticket Used Instruction - Implementation Guide

## Overview
Complete Anchor instruction implementation for `mark_ticket_used` that handles ticket check-in/redemption. This instruction validates ownership, marks tickets as used, and records check-in details including timestamp and gate operator.

## Files Modified/Created

### Modified Files
- **`lib.rs`** - Added `mark_ticket_used` instruction handler
- **`errors.rs`** - Added 3 new error codes for ticket usage
- **`state/ticket.rs`** - Added `checked_in_ts` and `gate_operator` fields
- **`instructions/register_mint.rs`** - Initialize new ticket fields
- **`instructions/mod.rs`** - Exported mark_ticket_used module

### New Files
- **`instructions/mark_ticket_used.rs`** - Mark ticket used instruction logic
- **`tests/mark-ticket-used.ts`** - Comprehensive test suite (8 tests)

## Key Features

### ✅ Enhanced Ticket Structure
```rust
pub struct Ticket {
    pub owner: Pubkey,          // 32 bytes - ticket owner (immutable)
    pub event: Pubkey,          // 32 bytes - event reference
    pub tier: Pubkey,           // 32 bytes - tier reference
    pub mint: Pubkey,           // 32 bytes - NFT mint
    pub used: bool,             // 1 byte - redemption status
    pub checked_in_ts: i64,     // 8 bytes - check-in timestamp
    pub gate_operator: Pubkey,  // 32 bytes - scanner/operator
    pub bump: u8,               // 1 byte
}
// Total: 178 bytes (from 138 bytes)
```

### ✅ Validations

#### 1. Ownership Verification
```rust
constraint = ticket.owner == owner.key() @ UnauthorizedTicketUse
```
- Only the registered ticket owner can check in
- Owner must be a signer
- Prevents unauthorized usage

#### 2. NFT Possession Check
```rust
constraint = owner_token_account.mint == ticket.mint
constraint = owner_token_account.owner == owner.key()
constraint = owner_token_account.amount == 1
```
- Owner must currently hold the NFT
- Prevents check-in after transferring the NFT

#### 3. Single-Use Enforcement
```rust
require!(!ticket.used, TicketAlreadyUsed)
```
- Ticket can only be marked as used once
- Prevents double check-ins

### ✅ Check-In Data
Records comprehensive check-in information:
- **used**: Set to `true`
- **checked_in_ts**: Unix timestamp of check-in
- **gate_operator**: Pubkey of scanner/operator

### ✅ Event Emission
```rust
#[event]
pub struct TicketUsed {
    pub ticket_pubkey: Pubkey,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub event: Pubkey,
    pub tier: Pubkey,
    pub gate_operator: Pubkey,
    pub checked_in_ts: i64,
}
```

### ✅ Custom Errors
```rust
#[error_code]
pub enum EventError {
    // ... existing errors ...
    
    #[msg("Ticket has already been used")]
    TicketAlreadyUsed,
    
    #[msg("Only the ticket owner can use this ticket")]
    UnauthorizedTicketUse,
    
    #[msg("Owner does not hold the ticket NFT")]
    TicketNotOwned,
}
```

## Test Coverage (8 Tests - All Passing ✅)

### 1. **Successful Check-In** (2 tests)
- ✅ Marks a valid ticket as used
- ✅ Records the gate operator correctly

### 2. **Non-Owner Attempt** (1 test)
- ✅ Fails when non-owner tries to use ticket

### 3. **Post-Transfer Attempt** (2 tests)
- ✅ Fails when original owner tries to use after transferring NFT
- ✅ Fails when new owner tries to use ticket after transfer

### 4. **Double Check-In Prevention** (1 test)
- ✅ Fails when trying to use an already used ticket

### 5. **Event Emission** (1 test)
- ✅ Emits TicketUsed event with correct data

### 6. **Edge Cases** (1 test)
- ✅ Records accurate check-in timestamp

## Usage Examples

### TypeScript Client

#### Basic Ticket Check-In
```typescript
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";

const program = anchor.workspace.MythraProgram;

// 1. Get ticket PDA
const [ticketPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("ticket"), mint.toBuffer()],
  program.programId
);

// 2. Get owner's token account
const ownerTokenAccount = await getAssociatedTokenAddress(
  mint,
  owner.publicKey
);

// 3. Mark ticket as used
const tx = await program.methods
  .markTicketUsed()
  .accounts({
    ticket: ticketPda,
    ownerTokenAccount: ownerTokenAccount,
    owner: owner.publicKey,
    gateOperator: gateOperator.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([owner])
  .rpc();

console.log("Ticket checked in:", tx);

// 4. Verify ticket is used
const ticketAccount = await program.account.ticket.fetch(ticketPda);
console.log("Used:", ticketAccount.used); // true
console.log("Checked in at:", new Date(ticketAccount.checkedInTs * 1000));
console.log("Gate operator:", ticketAccount.gateOperator.toString());
```

#### Gate Scanner Application
```typescript
// Mobile/web app for gate operators to scan and check in tickets
async function checkInTicket(
  mintAddress: string,
  ownerPublicKey: string,
  gateOperatorKeypair: Keypair
) {
  try {
    const mint = new PublicKey(mintAddress);
    const owner = new PublicKey(ownerPublicKey);
    
    const [ticketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), mint.toBuffer()],
      program.programId
    );
    
    // Check if ticket is already used
    const ticketBefore = await program.account.ticket.fetch(ticketPda);
    if (ticketBefore.used) {
      throw new Error("Ticket already used!");
    }
    
    // Verify owner holds the NFT
    const ownerTokenAccount = await getAssociatedTokenAddress(mint, owner);
    const tokenAccountInfo = await connection.getTokenAccountBalance(ownerTokenAccount);
    
    if (tokenAccountInfo.value.uiAmount !== 1) {
      throw new Error("Owner does not hold the ticket NFT!");
    }
    
    // Mark as used
    const tx = await program.methods
      .markTicketUsed()
      .accounts({
        ticket: ticketPda,
        ownerTokenAccount: ownerTokenAccount,
        owner: owner,
        gateOperator: gateOperatorKeypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc(); // Note: Owner must sign, not gate operator
    
    return {
      success: true,
      transaction: tx,
      checkedInAt: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
```

#### Check Ticket Status
```typescript
async function getTicketStatus(mint: PublicKey) {
  const [ticketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ticket"), mint.toBuffer()],
    program.programId
  );
  
  try {
    const ticket = await program.account.ticket.fetch(ticketPda);
    
    return {
      exists: true,
      used: ticket.used,
      owner: ticket.owner.toString(),
      checkedInTs: ticket.checkedInTs.toNumber(),
      gateOperator: ticket.gateOperator.toString(),
      event: ticket.event.toString(),
      tier: ticket.tier.toString(),
    };
  } catch {
    return { exists: false };
  }
}
```

#### Batch Check-In
```typescript
async function batchCheckIn(
  tickets: Array<{ mint: PublicKey; owner: PublicKey }>,
  gateOperator: PublicKey
) {
  const results = [];
  
  for (const { mint, owner } of tickets) {
    const [ticketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), mint.toBuffer()],
      program.programId
    );
    
    const ownerTokenAccount = await getAssociatedTokenAddress(mint, owner);
    
    try {
      const tx = await program.methods
        .markTicketUsed()
        .accounts({
          ticket: ticketPda,
          ownerTokenAccount: ownerTokenAccount,
          owner: owner,
          gateOperator: gateOperator,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      
      results.push({
        mint: mint.toString(),
        success: true,
        tx,
      });
    } catch (error) {
      results.push({
        mint: mint.toString(),
        success: false,
        error: error.message,
      });
    }
  }
  
  return results;
}
```

#### Listen for Check-Ins
```typescript
// Real-time monitoring of ticket check-ins
const listener = program.addEventListener("ticketUsed", (event) => {
  console.log("Ticket checked in!");
  console.log("Ticket:", event.ticketPubkey.toString());
  console.log("Owner:", event.owner.toString());
  console.log("Event:", event.event.toString());
  console.log("Time:", new Date(event.checkedInTs * 1000));
  console.log("Operator:", event.gateOperator.toString());
  
  // Update dashboard, send notifications, etc.
  updateDashboard({
    ticketId: event.ticketPubkey.toString(),
    timestamp: event.checkedInTs,
  });
});

// Remember to remove listener
await program.removeEventListener(listener);
```

## Error Handling

### Ticket Already Used
```typescript
try {
  await program.methods.markTicketUsed().rpc();
} catch (error) {
  if (error.message.includes("TicketAlreadyUsed")) {
    console.error("This ticket has already been checked in");
    // Show timestamp of original check-in
    const ticket = await program.account.ticket.fetch(ticketPda);
    console.log("Original check-in:", new Date(ticket.checkedInTs * 1000));
  }
}
```

### Unauthorized Usage
```typescript
try {
  await program.methods.markTicketUsed().rpc();
} catch (error) {
  if (error.message.includes("UnauthorizedTicketUse")) {
    console.error("Only the ticket owner can check in");
  }
}
```

### NFT Not Owned
```typescript
try {
  await program.methods.markTicketUsed().rpc();
} catch (error) {
  if (error.message.includes("TicketNotOwned")) {
    console.error("Owner does not currently hold the ticket NFT");
    console.log("Ticket may have been transferred");
  }
}
```

## Building & Testing

### Build the Program
```bash
anchor build
```

### Run All Tests
```bash
anchor test
```

### Run Only Mark Ticket Used Tests
```bash
anchor test -- --grep "mark_ticket_used"
```

### Run Specific Test Categories
```bash
# Check-in tests
anchor test -- --grep "successful check-in"

# Security tests
anchor test -- --grep "non-owner attempt"

# Transfer tests
anchor test -- --grep "post-transfer"

# Double check-in prevention
anchor test -- --grep "double check-in"
```

## Architecture Notes

### Non-Transferable Tickets
The current implementation enforces **non-transferable tickets**:
- `ticket.owner` is set at registration and is immutable
- Only the original owner can check in, even if NFT is transferred
- This prevents ticket scalping and unauthorized transfers

**Why this design?**
1. **Anti-Scalping**: Prevents secondary market manipulation
2. **KYC Compliance**: Ensures ticket user matches registered identity
3. **Fraud Prevention**: Reduces risk of stolen ticket usage

### If You Need Transferable Tickets
To allow transfers, you would need to:
1. Add an `update_ticket_owner` instruction
2. Update `ticket.owner` when NFT is transferred
3. Add authorization checks (e.g., event organizer approval)

### Check-In Flow
```
1. Gate Scanner
   ├── Scans QR code (contains mint address)
   ├── Fetches ticket PDA
   └── Checks ticket.used status

2. Validation
   ├── Verify owner holds NFT
   ├── Verify ticket not used
   └── Verify owner signature

3. Check-In
   ├── Set ticket.used = true
   ├── Record timestamp
   ├── Record gate operator
   └── Emit TicketUsed event

4. Confirmation
   ├── Display success message
   ├── Update attendance count
   └── Log for analytics
```

## Security Considerations

### ✅ Implemented
1. **Owner Signature Required**: Owner must sign the transaction
2. **NFT Possession Check**: Owner must currently hold the NFT
3. **Single-Use**: Ticket can only be marked as used once
4. **Immutable Owner**: Ticket owner cannot be changed
5. **Audit Trail**: Records timestamp and gate operator

### 🔒 Best Practices
1. **Secure Gate Devices**: Protect devices running scanner apps
2. **Network Security**: Use HTTPS for all API calls
3. **Rate Limiting**: Prevent spam check-in attempts
4. **Offline Mode**: Cache ticket data for offline validation
5. **Backup Scanner**: Have redundant check-in systems

## Common Use Cases

### 1. Event Entrance
```typescript
// Attendee arrives at gate
const result = await checkInTicket(
  ticketMint,
  attendee.publicKey,
  gateOperator
);

if (result.success) {
  console.log("Welcome! Entry granted.");
  openGate();
} else {
  console.log("Entry denied:", result.error);
  alertSecurity();
}
```

### 2. VIP Section Access
```typescript
// Check ticket tier before granting VIP access
const ticket = await program.account.ticket.fetch(ticketPda);
const tier = await program.account.ticketTier.fetch(ticket.tier);

if (tier.tierIndex === 0) { // VIP tier
  await markTicketUsed();
  grantVIPAccess();
} else {
  console.log("This ticket is not for VIP section");
}
```

### 3. Multi-Day Event
```typescript
// For multi-day events, check if ticket is for today
const ticket = await program.account.ticket.fetch(ticketPda);

if (ticket.used) {
  const checkedInDate = new Date(ticket.checkedInTs * 1000);
  const today = new Date();
  
  if (isSameDay(checkedInDate, today)) {
    console.log("Already checked in today");
  } else {
    console.log("Checked in on different day - allow re-entry");
    // Implement day-specific logic
  }
}
```

## Test Results

```
  mark_ticket_used
    successful check-in
      ✔ marks a valid ticket as used
      ✔ records the gate operator correctly
    non-owner attempt
      ✔ fails when non-owner tries to use ticket
    post-transfer attempt
      ✔ fails when original owner tries to use after transferring NFT
      ✔ fails when new owner tries to use ticket after transfer
    double check-in prevention
      ✔ fails when trying to use an already used ticket
    event emission
      ✔ emits TicketUsed event with correct data
    edge cases
      ✔ records accurate check-in timestamp

  8 passing ✅
```

## Integration with Other Instructions

### Complete Ticket Lifecycle
```
1. create_event          → Event created
2. create_ticket_tier    → Tier created
3. register_mint         → Ticket registered (used=false)
4. mark_ticket_used      → Ticket checked in (used=true)
```

### Ticket State Machine
```
┌─────────────┐
│  Registered │  (used=false, checked_in_ts=0)
└──────┬──────┘
       │
       │ mark_ticket_used
       ▼
┌─────────────┐
│     Used    │  (used=true, checked_in_ts=timestamp)
└─────────────┘
       │
       │ (Terminal state)
       ▼
```

## Analytics & Reporting

### Track Check-Ins
```typescript
// Count check-ins by listening to events
let checkInCount = 0;

const listener = program.addEventListener("ticketUsed", (event) => {
  checkInCount++;
  console.log(`Total check-ins: ${checkInCount}`);
  
  // Store in database
  db.checkIns.insert({
    ticket: event.ticketPubkey.toString(),
    event: event.event.toString(),
    timestamp: event.checkedInTs,
    operator: event.gateOperator.toString(),
  });
});
```

### Generate Reports
```typescript
// Fetch all tickets for an event and generate report
async function generateAttendanceReport(eventPda: PublicKey) {
  const allTickets = await getAllTicketsForEvent(eventPda);
  
  const report = {
    total: allTickets.length,
    checkedIn: allTickets.filter(t => t.used).length,
    pending: allTickets.filter(t => !t.used).length,
    checkInRate: 0,
  };
  
  report.checkInRate = (report.checkedIn / report.total) * 100;
  
  return report;
}
```

## Future Enhancements

Consider adding:
1. **Re-Entry**: Allow multiple check-ins for multi-day events
2. **Partial Usage**: Track session-based usage (e.g., workshop attendance)
3. **Transfer Support**: Enable ticket ownership transfers
4. **Revocation**: Allow organizers to revoke tickets
5. **Offline Mode**: Support offline check-in with sync

## Next Steps

1. **Build & Test**: `anchor build && anchor test`
2. **Deploy**: `anchor deploy --provider.cluster devnet`
3. **Scanner App**: Build mobile/web scanner application
4. **Gate Integration**: Connect to physical gate systems
5. **Monitor**: Track check-ins and generate reports

## Support

For issues:
1. Verify owner is signing the transaction
2. Confirm owner holds the NFT
3. Check ticket hasn't been used already
4. Ensure ticket PDA derivation is correct
5. Review test suite for examples
