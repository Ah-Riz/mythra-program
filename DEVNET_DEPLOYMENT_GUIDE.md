# Devnet Deployment Guide

## Pre-Deployment Checklist

### ✅ **Current Status**
- All 79 tests passing on localnet
- Proper rent calculation using dynamic space allocation
- PDA derivation correctly implemented
- Account validation in place

---

## 🔍 **Critical Areas to Monitor on Devnet**

### **1. Account Rent Exemption** ⚠️ HIGH PRIORITY
**Issue**: Devnet enforces strict rent requirements
**Risk**: Accounts may be garbage collected

**Current Implementation (GOOD):**
```rust
// Event account - dynamic space based on metadata_uri
space = Event::space(metadata_uri.len())
// Automatically ensures rent exemption
```

**What to Check:**
- Minimum balance for Event: ~0.002 SOL (varies with metadata_uri length)
- Minimum balance for TicketTier: ~0.001 SOL
- Minimum balance for Ticket: ~0.001 SOL
- Escrow account: Should maintain rent-exempt minimum

**Action Items:**
- [x] Space calculation is dynamic ✅
- [ ] Need to monitor actual rent costs on devnet
- [ ] Add rent validation in tests

---

### **2. Transaction Size & Compute Units** ⚠️ MEDIUM PRIORITY
**Issue**: Devnet has stricter transaction limits (1232 bytes max)
**Risk**: Complex transactions might fail

**Current Implementation:**
```rust
// Single instruction per transaction - GOOD
// No CPI loops - GOOD
// Minimal account passing - GOOD
```

**Potential Issues:**
- `create_event` with MAX_METADATA_URI_LENGTH (200 chars) = ~280 bytes ✅
- `register_mint` with NFT metadata creation = ~400 bytes ✅
- `transfer_ticket` with royalty payment = ~350 bytes ✅

**Action Items:**
- [x] Instructions are reasonably sized ✅
- [ ] Test with maximum-length metadata URIs
- [ ] Monitor compute unit consumption

---

### **3. Clock & Timestamp Validation** ⚠️ MEDIUM PRIORITY
**Issue**: Devnet clock can drift from system time
**Risk**: Time-based validations might fail unexpectedly

**Current Implementation:**
```rust
// Using Clock sysvar - CORRECT
let clock = Clock::get()?;
ticket.checked_in_ts = clock.unix_timestamp;
```

**Test Fix Applied:**
```typescript
// Already implemented tolerance in mark-ticket-used.ts
const tolerance = 10; // 10 seconds tolerance
assert.ok(checkedInTs >= beforeTime - tolerance);
```

**Action Items:**
- [x] Clock tolerance added to tests ✅
- [ ] Consider increasing tolerance to 30s for devnet
- [ ] Add logging to track actual clock differences

---

### **4. RPC Rate Limiting** ⚠️ MEDIUM PRIORITY
**Issue**: Public devnet RPC has rate limits
**Risk**: Tests might fail with 429 errors

**Current Test Configuration:**
```json
// tsconfig.json - timeout set in test script
"test": "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
// 1000000ms = 16.6 minutes total timeout ✅
```

**Action Items:**
- [x] Global timeout is generous ✅
- [ ] Add per-test delays (100-200ms between tests)
- [ ] Implement retry logic for RPC failures
- [ ] Consider using paid RPC provider (Helius, Quicknode)

---

### **5. SOL Airdrop Limitations** ⚠️ HIGH PRIORITY
**Issue**: Devnet airdrops limited to 2 SOL per request, rate limited
**Risk**: Tests might fail due to insufficient funds

**Current Implementation:**
```typescript
// Tests use provider.wallet for most operations
// Some tests create new keypairs (buyers, gate operators)
```

**Estimated SOL Needed per Full Test Run:**
- Event creation (79 tests × ~0.01 SOL) = ~0.79 SOL
- Ticket minting (79 tests × ~0.002 SOL) = ~0.16 SOL
- Transaction fees (79 tests × ~0.00001 SOL) = ~0.0008 SOL
- **Total: ~1 SOL per test run** ✅

**Action Items:**
- [ ] Request 5 SOL airdrop before testing
- [ ] Implement SOL balance checks before test runs
- [ ] Reuse keypairs across tests to reduce airdrop needs

---

### **6. Program Deployment** ⚠️ HIGH PRIORITY
**Issue**: Devnet program deployment requires proper keypair and sufficient SOL
**Risk**: Deployment might fail or program might not be fully initialized

**Current Configuration:**
```toml
[programs.localnet]
mythra_program = "AtJRC2ETky4gPYQtKQAWyRiCQmQtgVa5zkt4sJMuM88A"
```

**Action Items:**
- [ ] Generate new program keypair for devnet
- [ ] Ensure deployer has 10+ SOL for deployment
- [ ] Add devnet program ID to Anchor.toml
- [ ] Verify program deployment with `solana program show`

---

### **7. Account Initialization Delays** ⚠️ LOW PRIORITY
**Issue**: Devnet might have confirmation delays
**Risk**: Tests might read uninitialized accounts

**Current Implementation:**
```typescript
// Using .rpc() which waits for confirmation by default ✅
const tx = await program.methods.createEvent(...).rpc();
```

**Action Items:**
- [x] Default confirmation strategy is adequate ✅
- [ ] Add explicit `confirmTransaction` for critical operations
- [ ] Increase commitment level to 'confirmed' or 'finalized' if needed

---

## 🛠️ **Recommended Fixes to Implement**

### **Fix #1: Enhanced Test Helper with Retry Logic**
```typescript
// Add to tests/utils/devnet-helpers.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      console.log(`Attempt ${i + 1} failed, retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Should not reach here");
}
```

### **Fix #2: SOL Balance Checker**
```typescript
// Add to test setup
export async function ensureSufficientBalance(
  provider: AnchorProvider,
  minBalance: number = 2_000_000_000 // 2 SOL
) {
  const balance = await provider.connection.getBalance(provider.wallet.publicKey);
  console.log(`Current balance: ${balance / 1e9} SOL`);
  
  if (balance < minBalance) {
    console.log(`Requesting airdrop...`);
    const airdropSig = await provider.connection.requestAirdrop(
      provider.wallet.publicKey,
      minBalance - balance
    );
    await provider.connection.confirmTransaction(airdropSig);
    console.log(`Airdrop successful`);
  }
}
```

### **Fix #3: Increase Clock Tolerance**
```typescript
// Update mark-ticket-used.ts line 532
const tolerance = 30; // Increased from 10 to 30 for devnet
```

### **Fix #4: Add Test Delays**
```typescript
// Add between test suites
afterEach(async () => {
  await new Promise(resolve => setTimeout(resolve, 200));
});
```

---

## 📝 **Devnet Configuration Steps**

### **Step 1: Update Anchor.toml**
```toml
[programs.localnet]
mythra_program = "AtJRC2ETky4gPYQtKQAWyRiCQmQtgVa5zkt4sJMuM88A"

[programs.devnet]
mythra_program = "<NEW_PROGRAM_ID_FOR_DEVNET>"

[provider]
cluster = "devnet"  # Changed from localnet
wallet = "~/.config/solana/id.json"
```

### **Step 2: Generate Devnet Program Keypair**
```bash
solana-keygen new -o target/deploy/mythra_program-keypair.json
```

### **Step 3: Fund Deployer Wallet**
```bash
solana airdrop 5 --url devnet
solana airdrop 5 --url devnet  # Request twice for 10 SOL
```

### **Step 4: Deploy to Devnet**
```bash
anchor build
anchor deploy --provider.cluster devnet
```

### **Step 5: Verify Deployment**
```bash
solana program show <PROGRAM_ID> --url devnet
```

### **Step 6: Run Tests on Devnet**
```bash
anchor test --skip-local-validator --provider.cluster devnet
```

---

## 🚨 **Expected Issues & Solutions**

### **Issue 1: "Account does not exist"**
**Cause**: RPC lag or account not confirmed
**Solution**: Add retry logic and increase confirmation commitment

### **Issue 2: "insufficient funds"**
**Cause**: Airdrop limits or high rent costs
**Solution**: Fund wallet manually or use faucet multiple times

### **Issue 3: "Transaction simulation failed"**
**Cause**: Program not fully deployed or incorrect program ID
**Solution**: Verify deployment, check program ID in Anchor.toml matches deployed program

### **Issue 4: "RPC request timeout"**
**Cause**: Public RPC rate limiting
**Solution**: Use paid RPC provider or add delays between requests

### **Issue 5: "Clock drift errors"**
**Cause**: Devnet clock behind/ahead of system time
**Solution**: Increase tolerance in timestamp assertions

---

## 📊 **Monitoring During Tests**

### **Metrics to Track:**
1. **Success Rate**: How many tests pass on first run?
2. **Retry Count**: How often do retries succeed?
3. **SOL Consumption**: Total SOL used for full test suite
4. **Average Test Duration**: Compare to localnet baseline
5. **RPC Errors**: Track 429 or timeout errors
6. **Clock Drift**: Log actual vs expected timestamps

### **Logging Strategy:**
```typescript
// Add to each test file
const DEVNET = process.env.ANCHOR_PROVIDER_URL?.includes('devnet');

if (DEVNET) {
  console.log('Running on DEVNET - Enhanced monitoring enabled');
}
```

---

## ✅ **Go/No-Go Criteria**

### **Ready to Deploy if:**
- [x] All 79 tests pass on localnet ✅
- [ ] Deployer wallet has 10+ SOL on devnet
- [ ] Devnet configuration added to Anchor.toml
- [ ] Retry logic implemented
- [ ] SOL balance checker added
- [ ] Clock tolerance increased

### **Block Deployment if:**
- [ ] Any critical test fails on localnet
- [ ] Program size exceeds Solana limits (>10MB)
- [ ] Compute unit usage exceeds 200k per instruction
- [ ] Rent calculation issues found

---

## 🎯 **Next Steps**

1. **Implement preventive fixes** (see Fix #1-#4 above)
2. **Update Anchor.toml for devnet**
3. **Deploy program to devnet**
4. **Run tests and document all failures**
5. **Iterate on fixes based on actual errors**
6. **Document final devnet-specific configuration**

---

## 📚 **Resources**

- [Solana Devnet Faucet](https://faucet.solana.com/)
- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana RPC Providers](https://solana.com/rpc)
- [Program Deployment Guide](https://docs.solana.com/cli/deploy-a-program)
