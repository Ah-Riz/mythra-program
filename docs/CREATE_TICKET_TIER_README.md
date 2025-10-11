# Create Ticket Tier Instruction - Implementation Guide

## Overview
Complete Anchor instruction implementation for `create_ticket_tier` with PDA management, cumulative supply tracking, authorization checks, and comprehensive validation.

## Files Modified/Created

### Modified Files
- **`lib.rs`** - Added `create_ticket_tier` instruction handler
- **`errors.rs`** - Added 4 new error codes for tier operations
- **`state/event.rs`** - Added `allocated_supply` field for supply tracking
- **`instructions/mod.rs`** - Exported create_ticket_tier module
- **`instructions/create_event.rs`** - Initialize `allocated_supply` to 0

### New Files
- **`state/ticket_tier.rs`** - TicketTier account struct
- **`instructions/create_ticket_tier.rs`** - Create ticket tier instruction logic
- **`tests/create-ticket-tier.ts`** - Comprehensive test suite (13 tests)

## Key Features

### ✅ PDA Derivation
```rust
seeds = [b"tier", event.key().as_ref(), tier_id.as_bytes()]
```
- Unique tier per event + tier_id combination
- Prevents duplicate tiers
- Scoped to parent event

### ✅ TicketTier Account Structure
```rust
pub struct TicketTier {
    pub event: Pubkey,              // 32 bytes - reference to parent event
    pub price_lamports: u64,        // 8 bytes
    pub max_supply: u32,            // 4 bytes
    pub metadata_uri: String,       // 4 + len bytes
    pub royalty_bps: u16,           // 2 bytes (basis points)
    pub tier_index: u8,             // 1 byte
    pub bump: u8,                   // 1 byte
}
```

### ✅ Supply Tracking
**Event Account Enhancement:**
```rust
pub struct Event {
    // ... existing fields ...
    pub allocated_supply: u32,    // NEW: cumulative supply across all tiers
    // ...
}
```

**Supply Validation Logic:**
```rust
let new_allocated = event.allocated_supply
    .checked_add(max_supply)
    .ok_or(EventError::ExceedsTotalSupply)?;

require!(
    new_allocated <= event.total_supply,
    EventError::ExceedsTotalSupply
);

event.allocated_supply = new_allocated; // Update after validation
```

### ✅ Authorization
- **has_one Constraint**: Enforces only event authority can create tiers
- **Signer Check**: Authority must sign the transaction
- **Custom Error**: `UnauthorizedTierCreation` for non-authority attempts

### ✅ Validations

#### 1. Price Validation
```rust
price_lamports > 0
```
- Tickets cannot be free
- Error: `InvalidPrice`

#### 2. Cumulative Supply Check
```rust
allocated_supply + max_supply <= total_supply
```
- Prevents over-allocation across all tiers
- Error: `ExceedsTotalSupply`

#### 3. Metadata URI Length
```rust
metadata_uri.len() <= 200
```
- Maximum 200 characters
- Error: `MetadataUriTooLong`

#### 4. Duplicate Prevention
- Anchor's `init` constraint prevents duplicate tier_id
- Error: "already in use"

### ✅ Event Emission
```rust
#[event]
pub struct TicketTierCreated {
    pub event_pubkey: Pubkey,
    pub tier_pubkey: Pubkey,
    pub tier_id: String,
    pub price_lamports: u64,
    pub max_supply: u32,
    pub metadata_uri: String,
    pub tier_index: u8,
    pub timestamp: i64,
}
```

### ✅ Custom Errors
```rust
#[error_code]
pub enum EventError {
    // ... existing errors ...
    
    #[msg("Cumulative tier supply exceeds event total supply")]
    ExceedsTotalSupply,
    
    #[msg("Ticket price must be greater than zero")]
    InvalidPrice,
    
    #[msg("Tier with this ID already exists")]
    DuplicateTier,
    
    #[msg("Only the event authority can create tiers")]
    UnauthorizedTierCreation,
}
```

## Test Coverage (13 Tests - All Passing ✅)

### 1. **Valid Tier Creation** (3 tests)
- ✅ Creates a ticket tier with valid parameters
- ✅ Creates multiple tiers for the same event
- ✅ Creates tier with exact remaining supply

### 2. **Exceeding Total Supply** (2 tests)
- ✅ Fails when tier max_supply exceeds event total_supply
- ✅ Fails when cumulative supply across tiers exceeds total_supply

### 3. **Invalid Price** (1 test)
- ✅ Fails when price_lamports is zero

### 4. **Unauthorized Attempts** (1 test)
- ✅ Fails when non-authority tries to create tier

### 5. **Duplicate Tier PDAs** (1 test)
- ✅ Fails when creating tier with duplicate tier_id

### 6. **Metadata URI Validation** (2 tests)
- ✅ Fails when metadata URI exceeds 200 characters
- ✅ Succeeds with metadata URI at exactly 200 characters

### 7. **Event Emission** (1 test)
- ✅ Emits TicketTierCreated event with correct data

### 8. **Edge Cases** (2 tests)
- ✅ Handles very small max_supply (1)
- ✅ Handles zero royalty_bps

## Usage Examples

### TypeScript Client

#### Basic Tier Creation
```typescript
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

const program = anchor.workspace.MythraProgram;

// Get event PDA
const [eventPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("event"),
    organizer.publicKey.toBuffer(),
    Buffer.from("event-001"),
  ],
  program.programId
);

// Derive tier PDA
const [tierPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("tier"),
    eventPda.toBuffer(),
    Buffer.from("vip-tier"),
  ],
  program.programId
);

// Create VIP tier
const tx = await program.methods
  .createTicketTier(
    "vip-tier",                                     // tier_id
    "https://example.com/vip-metadata.json",        // metadata_uri
    new anchor.BN(2_000_000_000),                   // price: 2 SOL
    100,                                            // max_supply
    500,                                            // royalty_bps: 5%
    0                                               // tier_index
  )
  .accounts({
    tier: tierPda,
    event: eventPda,
    authority: organizer.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

console.log("Tier created:", tx);
```

#### Create Multiple Tiers
```typescript
const tiers = [
  {
    id: "vip",
    metadata: "https://example.com/vip.json",
    price: 2_000_000_000,      // 2 SOL
    supply: 100,
    royalty: 500,              // 5%
    index: 0
  },
  {
    id: "regular",
    metadata: "https://example.com/regular.json",
    price: 1_000_000_000,      // 1 SOL
    supply: 400,
    royalty: 300,              // 3%
    index: 1
  },
  {
    id: "early-bird",
    metadata: "https://example.com/early.json",
    price: 500_000_000,        // 0.5 SOL
    supply: 500,
    royalty: 200,              // 2%
    index: 2
  }
];

for (const tier of tiers) {
  const [tierPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tier"), eventPda.toBuffer(), Buffer.from(tier.id)],
    program.programId
  );

  await program.methods
    .createTicketTier(
      tier.id,
      tier.metadata,
      new anchor.BN(tier.price),
      tier.supply,
      tier.royalty,
      tier.index
    )
    .accounts({
      tier: tierPda,
      event: eventPda,
      authority: organizer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
    
  console.log(`Created tier: ${tier.id}`);
}
```

#### Check Remaining Supply
```typescript
// Fetch event to check remaining allocatable supply
const eventAccount = await program.account.event.fetch(eventPda);
const remainingSupply = eventAccount.totalSupply - eventAccount.allocatedSupply;

console.log(`Allocated: ${eventAccount.allocatedSupply}/${eventAccount.totalSupply}`);
console.log(`Remaining: ${remainingSupply}`);
```

#### Listen for TicketTierCreated Events
```typescript
const listener = program.addEventListener("ticketTierCreated", (event) => {
  console.log("New tier created!");
  console.log("Event:", event.eventPubkey.toString());
  console.log("Tier:", event.tierPubkey.toString());
  console.log("Tier ID:", event.tierId);
  console.log("Price:", event.priceLamports.toString(), "lamports");
  console.log("Max Supply:", event.maxSupply);
  console.log("Metadata:", event.metadataUri);
  console.log("Tier Index:", event.tierIndex);
});

// Remember to remove listener when done
await program.removeEventListener(listener);
```

## Error Handling

### Supply Validation Errors
```typescript
try {
  await program.methods.createTicketTier(...).rpc();
} catch (error) {
  if (error.message.includes("ExceedsTotalSupply")) {
    console.error("Cumulative tier supply exceeds event total supply");
    // Check current allocated supply and adjust
    const event = await program.account.event.fetch(eventPda);
    console.log(`Already allocated: ${event.allocatedSupply}`);
    console.log(`Total supply: ${event.totalSupply}`);
    console.log(`Available: ${event.totalSupply - event.allocatedSupply}`);
  }
}
```

### Authorization Errors
```typescript
try {
  await program.methods.createTicketTier(...).rpc();
} catch (error) {
  if (error.message.includes("UnauthorizedTierCreation")) {
    console.error("Only event authority can create tiers");
  }
}
```

### Price Validation Errors
```typescript
try {
  await program.methods.createTicketTier(...).rpc();
} catch (error) {
  if (error.message.includes("InvalidPrice")) {
    console.error("Price must be greater than zero");
  }
}
```

### Duplicate Tier Errors
```typescript
try {
  await program.methods.createTicketTier(...).rpc();
} catch (error) {
  if (error.message.includes("already in use")) {
    console.error("Tier with this ID already exists");
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

### Run Only Tier Creation Tests
```bash
anchor test -- --grep "create_ticket_tier"
```

### Run Specific Test Categories
```bash
# Supply validation tests
anchor test -- --grep "exceeding total supply"

# Authorization tests
anchor test -- --grep "unauthorized attempts"

# Duplicate prevention tests
anchor test -- --grep "duplicate tier"
```

## Architecture Notes

### Supply Tracking Design
The `allocated_supply` field in the Event account acts as a running total:

```
Event created:     allocated_supply = 0, total_supply = 1000
After Tier 1 (+100): allocated_supply = 100
After Tier 2 (+400): allocated_supply = 500
After Tier 3 (+500): allocated_supply = 1000 ✓
Try Tier 4 (+1):   ❌ ExceedsTotalSupply
```

### PDA Hierarchy
```
Event PDA: ["event", organizer, event_id]
  ├── Tier 1 PDA: ["tier", event, "vip"]
  ├── Tier 2 PDA: ["tier", event, "regular"]
  └── Tier 3 PDA: ["tier", event, "early-bird"]
```

### Space Calculation
Dynamic allocation based on metadata URI length:
```rust
TicketTier::space(metadata_uri_len) = 
    8 (discriminator) + 
    32 (event) + 
    8 (price_lamports) + 
    4 (max_supply) + 
    4 + metadata_uri_len + 
    2 (royalty_bps) + 
    1 (tier_index) + 
    1 (bump)
```

## Security Considerations

### ✅ Implemented
1. **Authorization**: Only event authority can create tiers via `has_one` constraint
2. **Supply Overflow**: Uses `checked_add` to prevent arithmetic overflow
3. **Supply Cap**: Validates cumulative supply never exceeds event total
4. **Price Floor**: Prevents free tickets (price must be > 0)
5. **Duplicate Prevention**: Anchor's `init` ensures unique tier_id per event

### 🔒 Best Practices
1. **Tier Ordering**: Use `tier_index` to maintain display order
2. **Royalty Caps**: Consider limiting `royalty_bps` to reasonable maximum (e.g., 5000 = 50%)
3. **Price Validation**: Consider minimum price threshold to prevent dust attacks
4. **Tier Limits**: Consider maximum number of tiers per event
5. **Metadata Standards**: Follow NFT metadata standards for `metadata_uri`

## Common Use Cases

### 1. Tiered Pricing Structure
```typescript
// Premium tier: Limited supply, high price
await createTier("vip", 5_000_000_000, 50);

// Standard tier: Medium supply, medium price
await createTier("standard", 2_000_000_000, 300);

// Budget tier: Large supply, low price
await createTier("budget", 500_000_000, 650);
```

### 2. Early Bird Discounts
```typescript
// Early bird: Lower price, limited supply
await createTier("early-bird", 800_000_000, 200);

// Regular: Normal price, remaining supply
await createTier("regular", 1_000_000_000, 800);
```

### 3. Dynamic Tier Creation
```typescript
// Start with one tier
await createTier("general-admission", 1_000_000_000, 800);

// Later add VIP tier if demand is high
const event = await program.account.event.fetch(eventPda);
if (event.allocatedSupply < event.totalSupply) {
  await createTier("vip", 3_000_000_000, 200);
}
```

## Test Results

```
  create_ticket_tier
    valid tier creation
      ✔ creates a ticket tier with valid parameters
      ✔ creates multiple tiers for the same event
      ✔ creates tier with exact remaining supply
    exceeding total supply
      ✔ fails when tier max_supply exceeds event total_supply
      ✔ fails when cumulative supply across tiers exceeds total_supply
    invalid price
      ✔ fails when price_lamports is zero
    unauthorized attempts
      ✔ fails when non-authority tries to create tier
    duplicate tier PDAs
      ✔ fails when creating tier with duplicate tier_id
    metadata URI validation
      ✔ fails when metadata URI exceeds 200 characters
      ✔ succeeds with metadata URI at exactly 200 characters
    event emission
      ✔ emits TicketTierCreated event with correct data
    edge cases
      ✔ handles very small max_supply (1)
      ✔ handles zero royalty_bps

  13 passing ✅
```

## Relationship with Other Instructions

### create_event → create_ticket_tier
1. **create_event** sets `total_supply` (maximum tickets available)
2. **create_ticket_tier** allocates portions of total_supply to tiers
3. Event's `allocated_supply` tracks cumulative allocations

### Example Flow
```typescript
// 1. Create event with total supply of 1000
await createEvent("concert-2024", 1000);

// 2. Create tiers that sum to 1000
await createTicketTier("vip", ..., 100);      // allocated: 100/1000
await createTicketTier("regular", ..., 400);  // allocated: 500/1000
await createTicketTier("budget", ..., 500);   // allocated: 1000/1000 ✓

// 3. Try to create another tier
await createTicketTier("extra", ..., 1);      // ❌ ExceedsTotalSupply
```

## Future Enhancements

Consider adding:
1. **Update Tier**: Instruction to modify tier metadata/price
2. **Deactivate Tier**: Ability to disable tier sales
3. **Tier Capacity**: Track sold vs available per tier
4. **Transfer Allocation**: Move supply between tiers
5. **Tier Groups**: Organize tiers into categories

## Next Steps

1. **Build & Test**: `anchor build && anchor test`
2. **Deploy**: `anchor deploy --provider.cluster devnet`
3. **Create Tiers**: Use TypeScript examples above
4. **Monitor**: Listen for TicketTierCreated events
5. **Extend**: Implement ticket minting using tier data

## Support

For issues:
1. Verify event authority is correct signer
2. Check cumulative supply doesn't exceed total
3. Ensure price > 0 lamports
4. Confirm tier_id is unique per event
5. Review test suite for usage patterns
