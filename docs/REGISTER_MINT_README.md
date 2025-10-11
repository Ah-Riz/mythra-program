# Register Mint Instruction - Implementation Guide

## Overview
Complete Anchor instruction implementation for `register_mint` that registers externally minted NFTs as valid tickets. This enables backend minting workflows where NFTs are created off-chain and then registered with the event system.

## Files Modified/Created

### Modified Files
- **`lib.rs`** - Added `register_mint` instruction handler
- **`errors.rs`** - Added 3 new error codes
- **`state/ticket_tier.rs`** - Added `current_supply` field and helper methods
- **`instructions/create_ticket_tier.rs`** - Initialize `current_supply` to 0
- **`instructions/mod.rs`** - Exported register_mint module
- **`Cargo.toml`** - Added `anchor-spl` dependency with idl-build feature
- **`package.json`** - Added `@solana/spl-token` dependency

### New Files
- **`state/ticket.rs`** - Ticket account struct
- **`state/order.rs`** - Order account struct (prepared for purchase flow)
- **`instructions/register_mint.rs`** - Register mint instruction logic
- **`tests/register-mint.ts`** - Comprehensive test suite (9 tests)

## Key Features

### ✅ Ticket PDA Derivation
```rust
seeds = [b"ticket", mint.key().as_ref()]
```
- One ticket per mint
- Prevents duplicate registrations
- Simple lookup by mint address

### ✅ Ticket Account Structure
```rust
pub struct Ticket {
    pub owner: Pubkey,      // 32 bytes - ticket owner
    pub event: Pubkey,      // 32 bytes - event reference
    pub tier: Pubkey,       // 32 bytes - tier reference
    pub mint: Pubkey,       // 32 bytes - NFT mint
    pub used: bool,         // 1 byte - redemption status
    pub bump: u8,           // 1 byte
}
// Total: 138 bytes (including 8-byte discriminator)
```

### ✅ Supply Tracking Enhancement
**TicketTier now tracks current sales:**
```rust
pub struct TicketTier {
    // ... existing fields ...
    pub current_supply: u32,        // NEW: tickets sold so far
    // ...
}

impl TicketTier {
    pub fn is_available(&self) -> bool {
        self.current_supply < self.max_supply
    }
    
    pub fn remaining(&self) -> u32 {
        self.max_supply.saturating_sub(self.current_supply)
    }
}
```

### ✅ Validations

#### 1. Mint Ownership
```rust
constraint = buyer_token_account.mint == mint.key()
constraint = buyer_token_account.owner == buyer.key()
```
- Ensures token account matches the mint
- Verifies buyer owns the token account

#### 2. NFT Supply
```rust
constraint = buyer_token_account.amount == 1
require!(mint.supply == 1, InvalidSupply)
```
- Buyer must own exactly 1 token
- Mint total supply must be 1 (NFT standard)

#### 3. Tier Availability
```rust
require!(tier.is_available(), ExceedsTotalSupply)
```
- Tier must have remaining capacity
- Increments `current_supply` after validation

#### 4. Authorization
```rust
has_one = authority @ UnauthorizedTierCreation
```
- Only event organizer can register tickets
- Enables backend minting workflows

#### 5. Duplicate Prevention
- Anchor's `init` constraint prevents re-registration
- Error: "already in use"

### ✅ Event Emission
```rust
#[event]
pub struct TicketRegistered {
    pub ticket_pubkey: Pubkey,
    pub event_pubkey: Pubkey,
    pub tier_pubkey: Pubkey,
    pub mint_pubkey: Pubkey,
    pub owner: Pubkey,
    pub timestamp: i64,
}
```

### ✅ Custom Errors
```rust
#[error_code]
pub enum EventError {
    // ... existing errors ...
    
    #[msg("Ticket already registered for this mint")]
    TicketAlreadyExists,
    
    #[msg("Mint owner does not match expected buyer")]
    InvalidMintOwner,
    
    #[msg("Mint supply must be exactly 1")]
    InvalidSupply,
}
```

## Test Coverage (9 Tests - All Passing ✅)

### 1. **Valid Registration** (2 tests)
- ✅ Registers an externally minted NFT as a ticket
- ✅ Registers multiple NFTs for different buyers

### 2. **Duplicate Prevention** (1 test)
- ✅ Fails when registering the same mint twice

### 3. **Mismatched Owner Handling** (2 tests)
- ✅ Fails when token account owner doesn't match buyer
- ✅ Fails when token account has wrong mint

### 4. **Invalid Supply** (2 tests)
- ✅ Fails when mint has supply > 1
- ✅ Fails when buyer doesn't own exactly 1 token

### 5. **Tier Sold Out** (1 test)
- ✅ Fails when tier has no remaining supply

### 6. **Event Emission** (1 test)
- ✅ Emits TicketRegistered event with correct data

## Usage Examples

### TypeScript Client

#### Basic NFT Registration
```typescript
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress 
} from "@solana/spl-token";

const program = anchor.workspace.MythraProgram;

// 1. Mint NFT externally (e.g., backend service)
const mint = await createMint(
  connection,
  payer,
  mintAuthority.publicKey,
  null,
  0 // 0 decimals for NFT
);

const tokenAccount = await createAssociatedTokenAccount(
  connection,
  payer,
  mint,
  buyer.publicKey
);

await mintTo(
  connection,
  payer,
  mint,
  tokenAccount,
  mintAuthority,
  1 // Mint exactly 1 token
);

// 2. Derive ticket PDA
const [ticketPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("ticket"), mint.toBuffer()],
  program.programId
);

// 3. Register the NFT as a ticket
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

console.log("Ticket registered:", tx);

// 4. Fetch ticket data
const ticketAccount = await program.account.ticket.fetch(ticketPda);
console.log("Owner:", ticketAccount.owner.toString());
console.log("Event:", ticketAccount.event.toString());
console.log("Tier:", ticketAccount.tier.toString());
console.log("Used:", ticketAccount.used);
```

#### Backend Minting Workflow
```typescript
// Backend service mints NFTs in batch
async function batchMintTickets(
  buyers: PublicKey[],
  eventPda: PublicKey,
  tierPda: PublicKey
) {
  const tickets = [];
  
  for (const buyer of buyers) {
    // 1. Create mint
    const mint = await createMint(
      connection,
      backendWallet,
      backendWallet.publicKey,
      null,
      0
    );
    
    // 2. Create ATA for buyer
    const ata = await createAssociatedTokenAccount(
      connection,
      backendWallet,
      mint,
      buyer
    );
    
    // 3. Mint 1 token to buyer
    await mintTo(
      connection,
      backendWallet,
      mint,
      ata,
      backendWallet,
      1
    );
    
    // 4. Register with event system
    const [ticketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), mint.toBuffer()],
      program.programId
    );
    
    await program.methods
      .registerMint()
      .accounts({
        ticket: ticketPda,
        event: eventPda,
        tier: tierPda,
        mint: mint,
        buyerTokenAccount: ata,
        buyer: buyer,
        authority: organizerWallet.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([organizerWallet])
      .rpc();
    
    tickets.push({
      mint: mint.toString(),
      ticket: ticketPda.toString(),
      buyer: buyer.toString(),
    });
  }
  
  return tickets;
}
```

#### Check Ticket Validity
```typescript
async function isValidTicket(mint: PublicKey): Promise<boolean> {
  try {
    const [ticketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), mint.toBuffer()],
      program.programId
    );
    
    const ticket = await program.account.ticket.fetch(ticketPda);
    return !ticket.used;
  } catch {
    return false; // Ticket doesn't exist
  }
}
```

#### Listen for Registrations
```typescript
const listener = program.addEventListener("ticketRegistered", (event) => {
  console.log("New ticket registered!");
  console.log("Ticket:", event.ticketPubkey.toString());
  console.log("Mint:", event.mintPubkey.toString());
  console.log("Owner:", event.owner.toString());
  console.log("Event:", event.eventPubkey.toString());
  console.log("Tier:", event.tierPubkey.toString());
  
  // Store in database, send email, etc.
});

// Remember to remove listener
await program.removeEventListener(listener);
```

## Error Handling

### Duplicate Registration
```typescript
try {
  await program.methods.registerMint().rpc();
} catch (error) {
  if (error.message.includes("already in use")) {
    console.error("This NFT is already registered as a ticket");
  }
}
```

### Invalid Ownership
```typescript
try {
  await program.methods.registerMint().rpc();
} catch (error) {
  if (error.message.includes("InvalidMintOwner")) {
    console.error("Token account owner doesn't match buyer");
  }
}
```

### Invalid Supply
```typescript
try {
  await program.methods.registerMint().rpc();
} catch (error) {
  if (error.message.includes("InvalidSupply")) {
    console.error("Mint supply must be exactly 1 (NFT standard)");
  }
}
```

### Tier Sold Out
```typescript
try {
  await program.methods.registerMint().rpc();
} catch (error) {
  if (error.message.includes("ExceedsTotalSupply")) {
    console.error("Tier has no remaining capacity");
    // Check remaining supply
    const tier = await program.account.ticketTier.fetch(tierPda);
    console.log(`${tier.currentSupply}/${tier.maxSupply} sold`);
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

### Run Only Register Mint Tests
```bash
anchor test -- --grep "register_mint"
```

### Run Specific Test Categories
```bash
# Ownership validation
anchor test -- --grep "mismatched owner"

# Supply validation  
anchor test -- --grep "invalid supply"

# Duplicate prevention
anchor test -- --grep "duplicate prevention"
```

## Architecture Notes

### Backend Minting Pattern
This instruction enables a **backend-controlled minting workflow**:

```
1. Backend Service
   ├── Creates mint account
   ├── Mints 1 NFT to buyer's ATA
   └── Registers mint with event system

2. Event System
   ├── Validates mint (supply = 1)
   ├── Validates ownership
   ├── Creates ticket PDA
   └── Increments tier supply
```

### Comparison: Direct Purchase vs Register Mint

| Feature | register_mint | purchase_ticket |
|---------|---------------|-----------------|
| **Minting** | External (backend) | On-chain (instruction) |
| **Payment** | Off-chain | On-chain SOL transfer |
| **Use Case** | Fiat payments, airdrops | Direct SOL purchases |
| **Flexibility** | High (any payment method) | Low (SOL only) |
| **Complexity** | Requires backend | Self-contained |

### When to Use register_mint

✅ **Use register_mint when:**
- Accepting fiat payments (credit card, PayPal)
- Implementing airdrops or giveaways
- Batch minting for corporate events
- Complex payment flows (installments, subscriptions)
- Need centralized minting control

❌ **Don't use register_mint when:**
- Want fully decentralized purchasing
- Payment is always in SOL
- Users want to mint directly from wallet

## Security Considerations

### ✅ Implemented
1. **Authority Check**: Only organizer can register tickets
2. **Ownership Validation**: Buyer must own the NFT
3. **Supply Enforcement**: Mint must have supply of 1
4. **Duplicate Prevention**: Can't register same mint twice
5. **Capacity Check**: Respects tier max_supply

### 🔒 Best Practices
1. **Backend Security**: Protect organizer private key in backend
2. **Rate Limiting**: Prevent spam registrations
3. **Verification**: Verify payment before minting
4. **Metadata**: Add proper NFT metadata for marketplace compatibility
5. **Monitoring**: Track registration events for fraud detection

## Common Use Cases

### 1. Fiat Payment Integration
```typescript
// User pays with credit card on website
const payment = await stripe.charges.create({
  amount: tierPrice,
  currency: 'usd',
  source: cardToken,
});

if (payment.status === 'succeeded') {
  // Mint and register NFT
  const { mint, ticket } = await mintAndRegister(
    buyer.publicKey,
    eventPda,
    tierPda
  );
  
  // Email ticket to buyer
  await sendTicketEmail(buyer.email, mint, ticket);
}
```

### 2. Airdrop Campaign
```typescript
// Airdrop tickets to early supporters
const supporters = await getEarlySupporters();

for (const supporter of supporters) {
  await mintAndRegister(
    supporter.wallet,
    eventPda,
    freebie TierPda
  );
  
  console.log(`Airdropped ticket to ${supporter.wallet}`);
}
```

### 3. Corporate Bulk Purchase
```typescript
// Company buys 100 tickets for employees
const employees = await getEmployeeWallets(companyId);

const tickets = await batchMintTickets(
  employees,
  eventPda,
  corporateTierPda
);

// Store in company database
await db.tickets.insertMany(tickets);
```

## Test Results

```
  register_mint
    valid registration
      ✔ registers an externally minted NFT as a ticket
      ✔ registers multiple NFTs for different buyers
    duplicate prevention
      ✔ fails when registering the same mint twice
    mismatched owner handling
      ✔ fails when token account owner doesn't match buyer
      ✔ fails when token account has wrong mint
    invalid supply
      ✔ fails when mint has supply > 1
      ✔ fails when buyer doesn't own exactly 1 token
    tier sold out
      ✔ fails when tier has no remaining supply
    event emission
      ✔ emits TicketRegistered event with correct data

  9 passing ✅
```

## Integration with Other Instructions

### Event Creation Flow
```
1. create_event          → Event with total_supply
2. create_ticket_tier    → Tier with max_supply, current_supply = 0
3. register_mint         → Ticket registration, current_supply++
4. (future) use_ticket   → Mark ticket as used
```

### Supply Tracking
```
Event
├── total_supply: 1000
├── allocated_supply: 1000 (from create_ticket_tier)
└── Tiers
    ├── VIP: max_supply: 100, current_supply: 45
    ├── Regular: max_supply: 400, current_supply: 312
    └── Budget: max_supply: 500, current_supply: 178
```

## Future Enhancements

Consider adding:
1. **Batch Registration**: Register multiple mints in one transaction
2. **Transfer Ticket**: Allow ticket ownership transfers
3. **Revoke Ticket**: Organizer can revoke fraudulent tickets
4. **Ticket Metadata**: Store additional ticket data (seat, section, etc.)
5. **Secondary Market**: Enable ticket resale with royalties

## Next Steps

1. **Build & Test**: `anchor build && anchor test`
2. **Deploy**: `anchor deploy --provider.cluster devnet`
3. **Backend Integration**: Implement minting service
4. **Payment Gateway**: Connect Stripe/PayPal
5. **Monitor**: Track TicketRegistered events

## Support

For issues:
1. Verify mint has supply of exactly 1
2. Confirm buyer owns the token
3. Check tier has remaining capacity
4. Ensure organizer is the authority signer
5. Review test suite for examples
