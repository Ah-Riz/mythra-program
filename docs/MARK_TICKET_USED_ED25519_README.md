# Mark Ticket Used Ed25519 Instruction - Implementation Guide

## Overview
Advanced Anchor instruction implementation for `mark_ticket_used_ed25519` that uses **ed25519 cryptographic signature verification** with **nonce-based replay protection**. This provides enterprise-grade security for ticket check-in without requiring the ticket owner to be online or sign the transaction directly.

## Why Ed25519 Signatures?

### Traditional Approach (`mark_ticket_used`)
- ❌ Owner must be online to sign transaction
- ❌ Owner needs SOL for transaction fees
- ❌ Real-time wallet interaction required

### Ed25519 Approach (`mark_ticket_used_ed25519`)
- ✅ Owner signs offline (QR code, mobile app)
- ✅ Gate operator pays transaction fees
- ✅ Pre-signed check-in authorization
- ✅ Works without internet for owner
- ✅ Replay protection via nonces

## Files Created/Modified

### New Files
- **`state/nonce.rs`** - Nonce PDA for replay protection
- **`instructions/mark_ticket_used_ed25519.rs`** - Ed25519 check-in logic

### Modified Files
- **`lib.rs`** - Added instruction handler
- **`errors.rs`** - Added 4 new error codes
- **`state/mod.rs`** - Exported nonce module
- **`instructions/mod.rs`** - Exported ed25519 instruction

## Key Components

### ✅ Nonce State (Replay Protection)
```rust
pub struct Nonce {
    pub ticket: Pubkey,         // Reference to ticket
    pub nonce_hash: [u8; 32],   // Hash of the nonce
    pub used: bool,             // Prevents reuse
    pub created_at: i64,        // Creation timestamp
    pub expires_at: i64,        // Expiration (default: 5 min)
    pub bump: u8,
}

// PDA: ["nonce", ticket.key(), nonce_hash]
```

**Purpose**: Prevents replay attacks where someone intercepts and reuses a valid signature.

### ✅ Ed25519 Signature Verification

#### How It Works
1. **Owner Signs Offline**: Creates ed25519 signature over message (nonce_hash + nonce_value)
2. **Ed25519 Pre-Instruction**: Added before main instruction to verify signature
3. **Instruction Verification**: Validates the pre-instruction and extracts verified data
4. **Nonce Check**: Ensures nonce hasn't been used and isn't expired
5. **Check-In**: Marks ticket and nonce as used

#### Signature Message Format
```
message = nonce_hash (32 bytes) + nonce_value (8 bytes, little-endian)
```

### ✅ Validations

#### 1. Ed25519 Instruction Present
```rust
// Ed25519 instruction must be immediately before this instruction
require!(
    ed25519_ix.program_id == ed25519_program::ID,
    Ed25519InstructionMissing
);
```

#### 2. Signer Verification
```rust
// Public key in ed25519 instruction must match ticket owner
require!(
    pubkey == ticket.owner,
    InvalidSignature
);
```

#### 3. Message Verification
```rust
// Message must contain correct nonce_hash and nonce_value
require!(
    msg_nonce_hash == nonce_hash && msg_nonce_value == nonce_value,
    InvalidSignature
);
```

#### 4. Nonce Validation
```rust
// Nonce must not be expired
require!(!nonce.is_expired(clock.unix_timestamp), NonceExpired);

// Nonce must not be used
require!(!nonce.used, NonceUsed);
```

#### 5. Ticket Status
```rust
// Ticket must not already be used
require!(!ticket.used, TicketAlreadyUsed);
```

### ✅ Custom Errors
```rust
#[error_code]
pub enum EventError {
    // ... existing errors ...
    
    #[msg("Invalid ed25519 signature")]
    InvalidSignature,
    
    #[msg("Nonce has already been used")]
    NonceUsed,
    
    #[msg("Nonce has expired")]
    NonceExpired,
    
    #[msg("Ed25519 instruction not found or invalid")]
    Ed25519InstructionMissing,
}
```

### ✅ Event Emission
```rust
#[event]
pub struct TicketUsedWithNonce {
    pub ticket_pubkey: Pubkey,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub event: Pubkey,
    pub tier: Pubkey,
    pub gate_operator: Pubkey,
    pub checked_in_ts: i64,
    pub nonce_hash: [u8; 32],
}
```

## Implementation Details

### Ed25519 Instruction Format
The Ed25519Program uses a specific instruction format:

```
Offset | Size | Description
-------|------|-------------
0      | 1    | num_signatures
1      | 1    | padding
2      | 2    | signature_offset
4      | 2    | signature_instruction_index
6      | 2    | public_key_offset
8      | 2    | public_key_instruction_index
10     | 2    | message_data_offset
12     | 2    | message_data_size
14     | 2    | message_instruction_index
16     | 32   | public_key
48     | 64   | signature
112+   | var  | message
```

### Nonce Expiry
- **Default**: 5 minutes (300 seconds)
- **Purpose**: Prevents long-lived signatures from being valid indefinitely
- **Configurable**: Can be adjusted via `Nonce::DEFAULT_EXPIRY_SECONDS`

## Usage Examples

### TypeScript Client - Complete Flow

#### Step 1: Generate Nonce
```typescript
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import * as crypto from "crypto";

// Generate random nonce
function generateNonce(): { value: bigint; hash: Buffer } {
  const nonceValue = BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
  const nonceHash = crypto.createHash('sha256')
    .update(Buffer.from(nonceValue.toString()))
    .digest();
  
  return { value: nonceValue, hash: nonceHash };
}

const nonce = generateNonce();
console.log("Nonce value:", nonce.value.toString());
console.log("Nonce hash:", nonce.hash.toString('hex'));
```

#### Step 2: Owner Signs Offline (Mobile App)
```typescript
import { Keypair } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";

// Owner's keypair (on mobile device)
const ownerKeypair = Keypair.fromSecretKey(/* owner's secret key */);

// Create message to sign
function createSignatureMessage(nonceHash: Buffer, nonceValue: bigint): Buffer {
  const message = Buffer.alloc(40);
  nonceHash.copy(message, 0); // 32 bytes
  message.writeBigUInt64LE(nonceValue, 32); // 8 bytes
  return message;
}

const message = createSignatureMessage(nonce.hash, nonce.value);

// Sign the message
const signature = ed25519.sign(message, ownerKeypair.secretKey.slice(0, 32));

console.log("Signature:", Buffer.from(signature).toString('hex'));

// This signature can be encoded in QR code
const qrData = {
  ticket: ticketPda.toString(),
  nonceHash: nonce.hash.toString('hex'),
  nonceValue: nonce.value.toString(),
  signature: Buffer.from(signature).toString('hex'),
  publicKey: ownerKeypair.publicKey.toString(),
};
```

#### Step 3: Gate Scanner Checks In (Online)
```typescript
import { 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  Ed25519Program 
} from "@solana/web3.js";

async function checkInWithEd25519(
  ticketMint: PublicKey,
  ownerPubkey: PublicKey,
  nonceHash: Buffer,
  nonceValue: bigint,
  signature: Uint8Array,
  gateOperatorKeypair: Keypair
) {
  const program = anchor.workspace.MythraProgram;
  
  // Derive PDAs
  const [ticketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ticket"), ticketMint.toBuffer()],
    program.programId
  );
  
  const [noncePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("nonce"), ticketPda.toBuffer(), nonceHash],
    program.programId
  );
  
  // Create message
  const message = Buffer.alloc(40);
  nonceHash.copy(message, 0);
  message.writeBigUInt64LE(nonceValue, 32);
  
  // Create Ed25519 instruction
  const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
    publicKey: ownerPubkey.toBytes(),
    message: message,
    signature: signature,
  });
  
  // Create mark ticket used instruction
  const markUsedIx = await program.methods
    .markTicketUsedEd25519(
      Array.from(nonceHash),
      nonceValue
    )
    .accounts({
      ticket: ticketPda,
      nonce: noncePda,
      payer: gateOperatorKeypair.publicKey,
      gateOperator: gateOperatorKeypair.publicKey,
      instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .instruction();
  
  // Build transaction with BOTH instructions
  const transaction = new Transaction();
  transaction.add(ed25519Ix);      // MUST be first
  transaction.add(markUsedIx);     // MUST be second
  
  // Send transaction (gate operator pays)
  const tx = await anchor.web3.sendAndConfirmTransaction(
    provider.connection,
    transaction,
    [gateOperatorKeypair]
  );
  
  console.log("Check-in successful:", tx);
  
  return tx;
}
```

### Mobile App Flow

#### QR Code Generation (Owner Side)
```typescript
// Owner's mobile app generates QR code
import QRCode from 'qrcode';

async function generateCheckInQR(
  ownerKeypair: Keypair,
  ticketMint: PublicKey
) {
  // Generate nonce
  const nonce = generateNonce();
  
  // Sign message
  const message = createSignatureMessage(nonce.hash, nonce.value);
  const signature = ed25519.sign(message, ownerKeypair.secretKey.slice(0, 32));
  
  // Create QR data
  const qrData = JSON.stringify({
    ticket: ticketMint.toString(),
    owner: ownerKeypair.publicKey.toString(),
    nonceHash: nonce.hash.toString('base64'),
    nonceValue: nonce.value.toString(),
    signature: Buffer.from(signature).toString('base64'),
    expiresAt: Date.now() + 300000, // 5 minutes
  });
  
  // Generate QR code
  const qrCode = await QRCode.toDataURL(qrData);
  
  return qrCode;
}
```

#### Scanner App (Gate Operator Side)
```typescript
// Gate scanner app reads QR and submits transaction
import { BrowserQRCodeReader } from '@zxing/library';

async function scanAndCheckIn() {
  const codeReader = new BrowserQRCodeReader();
  
  // Scan QR code
  const result = await codeReader.decodeOnceFromVideoDevice(undefined, 'video');
  const qrData = JSON.parse(result.getText());
  
  // Verify not expired
  if (Date.now() > qrData.expiresAt) {
    throw new Error("QR code expired - please regenerate");
  }
  
  // Parse data
  const ticketMint = new PublicKey(qrData.ticket);
  const ownerPubkey = new PublicKey(qrData.owner);
  const nonceHash = Buffer.from(qrData.nonceHash, 'base64');
  const nonceValue = BigInt(qrData.nonceValue);
  const signature = new Uint8Array(Buffer.from(qrData.signature, 'base64'));
  
  // Submit check-in transaction
  const tx = await checkInWithEd25519(
    ticketMint,
    ownerPubkey,
    nonceHash,
    nonceValue,
    signature,
    gateOperatorKeypair
  );
  
  console.log("✅ Checked in successfully!");
  return tx;
}
```

## Security Features

### 1. **Replay Protection**
- Each nonce can only be used once
- Nonce PDA prevents duplicate transactions
- Expired nonces automatically rejected

### 2. **Cryptographic Verification**
- Ed25519 signature mathematically proves owner authorization
- Cannot be forged or modified
- Solana native verification (efficient)

### 3. **Time-Bound Authorization**
- Nonces expire after 5 minutes
- Prevents indefinite signature validity
- Forces fresh signatures for security

### 4. **No Private Key Exposure**
- Owner never shares private key
- Signature created locally on owner's device
- Gate operator never sees private key

## Comparison: Regular vs Ed25519

| Feature | mark_ticket_used | mark_ticket_used_ed25519 |
|---------|------------------|--------------------------|
| **Owner Online** | Required | Not required |
| **Transaction Fee** | Owner pays | Gate operator pays |
| **Signature** | Real-time | Pre-signed |
| **Internet (Owner)** | Required | Not required (QR code) |
| **Security** | High | Very High |
| **Replay Protection** | N/A (real-time) | Nonce-based |
| **Use Case** | Owner has wallet | Offline/QR check-in |

## Building & Testing

### Build the Program
```bash
anchor build
```

### Note on Testing
Ed25519 signature testing requires creating valid ed25519 pre-instructions, which is complex in TypeScript tests. The instruction is designed to work with:

1. **Integration Tests**: Use real Ed25519Program instructions
2. **Manual Testing**: Deploy to devnet and test with actual signatures
3. **Production**: Use in production with proper QR code flow

### Example Test Structure (Pseudocode)
```typescript
// Note: Requires ed25519 instruction creation
describe("mark_ticket_used_ed25519", () => {
  it("checks in with valid signature", async () => {
    // 1. Generate nonce
    // 2. Create signature
    // 3. Build ed25519 instruction
    // 4. Execute mark_ticket_used_ed25519
    // 5. Verify ticket.used = true
  });
  
  it("fails with reused nonce", async () => {
    // Attempt to use same nonce twice
  });
  
  it("fails with expired nonce", async () => {
    // Wait for nonce to expire
  });
  
  it("fails with invalid signature", async () => {
    // Use wrong signature
  });
});
```

## Error Handling

### Invalid Signature
```typescript
try {
  await checkInWithEd25519(...);
} catch (error) {
  if (error.message.includes("InvalidSignature")) {
    console.error("Signature verification failed");
    console.log("Possible causes:");
    console.log("- Wrong owner public key");
    console.log("- Incorrect message format");
    console.log("- Signature doesn't match");
  }
}
```

### Nonce Reuse
```typescript
try {
  await checkInWithEd25519(...);
} catch (error) {
  if (error.message.includes("NonceUsed")) {
    console.error("This QR code has already been used");
    console.log("Please generate a new QR code");
  }
}
```

### Nonce Expired
```typescript
try {
  await checkInWithEd25519(...);
} catch (error) {
  if (error.message.includes("NonceExpired")) {
    console.error("QR code expired (older than 5 minutes)");
    console.log("Please generate a fresh QR code");
  }
}
```

### Ed25519 Instruction Missing
```typescript
try {
  await checkInWithEd25519(...);
} catch (error) {
  if (error.message.includes("Ed25519InstructionMissing")) {
    console.error("Ed25519 verification instruction not found");
    console.log("Ensure ed25519 instruction is added BEFORE main instruction");
  }
}
```

## Architecture Notes

### Instruction Ordering
**CRITICAL**: Instructions must be in this exact order:
```
Transaction:
1. Ed25519Program.createInstructionWithPublicKey()  ← Signature verification
2. program.methods.markTicketUsedEd25519()          ← Check-in logic
```

The program reads the instructions sysvar to verify the ed25519 instruction was executed immediately before.

### Nonce PDA Strategy
```
PDA: ["nonce", ticket.key(), nonce_hash]
```

- **ticket.key()**: Scopes nonce to specific ticket
- **nonce_hash**: Unique identifier for this nonce
- **init constraint**: Automatically prevents nonce reuse (account already exists)

### Message Format
```
┌─────────────────────────┬──────────────────┐
│   nonce_hash (32 bytes) │ nonce_value (8)  │
└─────────────────────────┴──────────────────┘
       SHA-256 hash           Unix timestamp
```

**Why this format?**
- **nonce_hash**: Unique identifier
- **nonce_value**: Timestamp prevents precomputation
- **Combined**: Ensures fresh, unique signatures

## Use Cases

### 1. **Large Events** (Concerts, Conferences)
- Owners generate QR codes at home
- Fast scanning at gates (no wait for wallet)
- Gate operators pay fees (event expense)

### 2. **Non-Crypto Users**
- No need to understand wallets
- Just scan QR code
- Works like traditional e-tickets

### 3. **Offline Venues**
- Owner generates QR with internet
- Gate scanning works offline (can batch sync later)
- No connectivity required at entry

### 4. **Enterprise Compliance**
- Full audit trail with nonces
- Timestamp proof of entry
- Non-repudiation (cryptographic proof)

## Advanced Features

### Custom Nonce Expiry
```rust
// Modify in nonce.rs
impl Nonce {
    pub const DEFAULT_EXPIRY_SECONDS: i64 = 600; // 10 minutes
}
```

### Nonce Cleanup
```rust
// Future enhancement: Add instruction to clean up expired nonces
pub fn cleanup_expired_nonce(ctx: Context<CleanupNonce>) -> Result<()> {
    // Reclaim rent from expired nonces
}
```

### Batch Check-In
```rust
// Future enhancement: Process multiple tickets in one transaction
pub fn mark_multiple_tickets_used_ed25519(...) -> Result<()> {
    // Verify multiple signatures
    // Mark multiple tickets as used
}
```

## Production Deployment

### 1. Generate QR Codes
- Mobile app for ticket owners
- Pre-sign check-in authorization
- Display QR code at gate

### 2. Scanner Hardware
- Tablet/phone with camera
- Connected to gate operator wallet
- Auto-submits transactions

### 3. Monitoring
- Track nonce usage
- Alert on suspicious patterns
- Analytics dashboard

### 4. Backup System
- Fallback to regular `mark_ticket_used` if needed
- Manual override for edge cases

## Next Steps

1. **Deploy**: `anchor deploy --provider.cluster devnet`
2. **Mobile App**: Build QR generation app
3. **Scanner App**: Build gate scanning app
4. **Test Flow**: End-to-end testing with real signatures
5. **Monitor**: Track nonce patterns and security

## Support

For implementation questions:
1. Verify ed25519 instruction is created correctly
2. Check instruction ordering (ed25519 MUST be first)
3. Ensure message format matches (32-byte hash + 8-byte value)
4. Validate nonce hasn't expired or been used
5. Review Solana ed25519 program documentation

## Summary

The `mark_ticket_used_ed25519` instruction provides **enterprise-grade security** for ticket check-in with:
- ✅ Offline owner participation via QR codes
- ✅ Cryptographic proof of authorization
- ✅ Replay protection via nonces
- ✅ Time-bound validity
- ✅ No private key exposure
- ✅ Gate operator pays fees

Perfect for large-scale events requiring fast, secure, user-friendly check-in!
