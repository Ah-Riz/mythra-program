# Create Event Instruction - Implementation Guide

## Overview
Complete Anchor instruction implementation for `create_event` with comprehensive validation, PDA management, and testing.

## Files Created

### 1. **Program Structure**
```
programs/mythra-program/src/
├── lib.rs                           # Main program entry point
├── errors.rs                        # Custom error definitions
├── state/
│   ├── mod.rs                       # State module exports
│   └── event.rs                     # Event account struct
└── instructions/
    ├── mod.rs                       # Instruction module exports
    └── create_event.rs              # Create event instruction logic
```

### 2. **Test Suite**
```
tests/
└── mythra-program.ts                # Comprehensive test suite
```

## Key Features

### ✅ PDA Derivation
- Seeds: `["event", organizer.key().as_ref(), event_id.as_bytes()]`
- Automatic bump calculation via Anchor's `init` constraint
- Prevents duplicate events (account already exists error)

### ✅ Event Account Structure
```rust
pub struct Event {
    pub authority: Pubkey,          // 32 bytes
    pub metadata_uri: String,       // 4 + len bytes
    pub start_ts: i64,              // 8 bytes
    pub end_ts: i64,                // 8 bytes
    pub total_supply: u32,          // 4 bytes
    pub treasury: Pubkey,           // 32 bytes
    pub platform_split_bps: u16,    // 2 bytes
    pub bump: u8,                   // 1 byte
}
```

### ✅ Validations
1. **Timestamp Validation**: `start_ts < end_ts`
2. **Supply Validation**: `total_supply > 0`
3. **Metadata URI**: Maximum 200 characters
4. **Duplicate Prevention**: Anchor's `init` constraint ensures unique PDAs
5. **Authority**: Organizer must be signer (enforced by `Signer<'info>`)

### ✅ Space Allocation
Dynamic space calculation based on metadata URI length:
```rust
8 (discriminator) + 32 (authority) + (4 + metadata_uri_len) + 
8 (start_ts) + 8 (end_ts) + 4 (total_supply) + 
32 (treasury) + 2 (platform_split_bps) + 1 (bump)
```

### ✅ Event Emission
```rust
#[event]
pub struct EventCreated {
    pub event_pubkey: Pubkey,
    pub authority: Pubkey,
    pub metadata_uri: String,
    pub timestamp: i64,
}
```

### ✅ Custom Errors
```rust
#[error_code]
pub enum EventError {
    InvalidTimestamps,      // end_ts must be > start_ts
    ZeroSupply,             // total_supply must be > 0
    DuplicateEvent,         // Event ID already exists (handled by init)
    MetadataUriTooLong,     // URI exceeds 200 chars
}
```

## Test Coverage

### 1. **Successful Creation Tests**
- ✅ Creates event with valid parameters
- ✅ Creates multiple events with different IDs
- ✅ Verifies all account fields are stored correctly

### 2. **Duplicate Event Test**
- ✅ Fails when creating event with duplicate event_id
- ✅ Error: "already in use" from Anchor's init constraint

### 3. **Invalid Timestamp Tests**
- ✅ Fails when `start_ts >= end_ts`
- ✅ Fails when `start_ts == end_ts`
- ✅ Error: "Event end timestamp must be greater than start timestamp"

### 4. **Zero Supply Test**
- ✅ Fails when `total_supply = 0`
- ✅ Error: "Total supply must be greater than zero"

### 5. **Metadata URI Tests**
- ✅ Fails when URI exceeds 200 characters
- ✅ Succeeds when URI is exactly 200 characters
- ✅ Error: "Metadata URI exceeds maximum length of 200 characters"

### 6. **Event Emission Test**
- ✅ Emits `EventCreated` with correct data
- ✅ Verifies event payload (pubkey, authority, metadata_uri, timestamp)

## Building & Testing

### Build the Program
```bash
anchor build
```

### Run Tests
```bash
anchor test
```

### Run Specific Test Suite
```bash
anchor test -- --grep "create_event"
```

### Run Individual Tests
```bash
# Test successful creation
anchor test -- --grep "creates an event with valid parameters"

# Test duplicate prevention
anchor test -- --grep "fails when creating an event with a duplicate event ID"

# Test timestamp validation
anchor test -- --grep "invalid timestamps"

# Test metadata URI limits
anchor test -- --grep "oversized metadata URI"
```

## Usage Example

### TypeScript Client
```typescript
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";

const program = anchor.workspace.MythraProgram;
const organizer = provider.wallet;
const treasury = Keypair.generate();

// Derive PDA
const [eventPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("event"),
    organizer.publicKey.toBuffer(),
    Buffer.from("event-001"),
  ],
  program.programId
);

// Create event
const tx = await program.methods
  .createEvent(
    "event-001",                                    // event_id
    "https://example.com/metadata.json",            // metadata_uri
    new anchor.BN(Math.floor(Date.now() / 1000)),   // start_ts
    new anchor.BN(Math.floor(Date.now() / 1000) + 86400), // end_ts
    1000,                                           // total_supply
    250                                             // platform_split_bps (2.5%)
  )
  .accounts({
    event: eventPda,
    organizer: organizer.publicKey,
    treasury: treasury.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

// Fetch event data
const eventAccount = await program.account.event.fetch(eventPda);
console.log("Event created:", eventAccount);
```

### Rust/Anchor CLI
```bash
anchor run create-event \
  --event-id "event-001" \
  --metadata-uri "https://example.com/metadata.json" \
  --start-ts 1609459200 \
  --end-ts 1609545600 \
  --total-supply 1000 \
  --platform-split-bps 250
```

## Security Considerations

### ✅ Implemented
1. **Signer Verification**: Organizer must sign the transaction
2. **PDA Uniqueness**: Events are scoped per organizer + event_id
3. **Input Validation**: All parameters validated before account creation
4. **Space Bounds**: Metadata URI limited to prevent DoS attacks
5. **Duplicate Prevention**: Automatic via Anchor's init constraint

### 🔒 Additional Recommendations
1. Consider adding organizer authorization checks for specific wallets
2. Implement event cancellation/update instructions with authority checks
3. Add time-based access controls (e.g., can't create events with past timestamps)
4. Consider adding event capacity limits per organizer

## Error Handling

All errors are properly typed and descriptive:

```typescript
try {
  await program.methods.createEvent(...).rpc();
} catch (error) {
  if (error.message.includes("InvalidTimestamps")) {
    console.error("Start time must be before end time");
  } else if (error.message.includes("ZeroSupply")) {
    console.error("Supply must be greater than zero");
  } else if (error.message.includes("already in use")) {
    console.error("Event with this ID already exists");
  } else if (error.message.includes("MetadataUriTooLong")) {
    console.error("Metadata URI too long (max 200 chars)");
  }
}
```

## Next Steps

1. **Build the program**: `anchor build`
2. **Run tests**: `anchor test`
3. **Deploy**: `anchor deploy --provider.cluster devnet`
4. **Integrate**: Use the TypeScript client code above

## Architecture Notes

### Modular Design
- Separate modules for errors, state, and instructions
- Easy to extend with additional instructions
- Clean separation of concerns

### Space Optimization
- Dynamic allocation based on actual metadata URI length
- No wasted space for unused capacity
- Properly accounts for Anchor discriminator (8 bytes)

### Testing Best Practices
- Comprehensive edge case coverage
- Clear test organization with describe blocks
- Proper error message validation
- Event emission verification

## Support

For issues or questions:
1. Check Anchor documentation: https://www.anchor-lang.com/
2. Review test suite for usage examples
3. Examine error messages for specific validation failures
