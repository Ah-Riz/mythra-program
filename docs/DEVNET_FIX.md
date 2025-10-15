# Devnet Testing Fix - RPC Configuration Issue

## Problem Identified

Tests were experiencing **429 Too Many Requests** errors and hanging on devnet because:

1. **Tests used `AnchorProvider.env()`** which reads from:
   - `Anchor.toml` (`cluster = "localnet"`)
   - Solana CLI config (`https://api.devnet.solana.com` - public, rate-limited)

2. **Tests NEVER used the custom RPC URL from `.env`** file (Helius API key)

3. The public Solana devnet RPC (`https://api.devnet.solana.com`) has strict rate limits:
   - ~5-10 requests per second
   - Causes 429 errors with multiple concurrent tests

## Solution Implemented

### 1. Created Custom Provider (`tests/utils/provider.ts`)
- Reads `DEVNET_RPC_URL` from `.env` file
- Uses Helius API key for higher rate limits (100 req/sec free tier)
- Properly configures connection timeouts

### 2. Updated Test Files
Changed from:
```typescript
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
```

To:
```typescript
import { initializeProvider } from "./utils/provider";
import { setupTestEnvironment, postTestCleanup } from "./utils/test-setup";

const provider = initializeProvider();

before(async () => {
  await setupTestEnvironment(provider);
});

afterEach(async () => {
  await postTestCleanup(provider);  // Adds 200ms delay between tests
});
```

### 3. Files Updated
- ✅ `tests/mythra-program.ts`
- ✅ `tests/close-event.ts`
- ✅ `tests/create-ticket-tier.ts`
- ⏳ `tests/mark-ticket-used.ts` - **Need to update**
- ⏳ `tests/refund-ticket.ts` - **Need to update**
- ⏳ `tests/register-mint.ts` - **Need to update**
- ⏳ `tests/transfer_tickets.ts` - **Need to update**
- ⏳ `tests/update-event.ts` - **Need to update**
- ⏳ `tests/withdraw-funds.ts` - **Need to update**

## How to Update Remaining Files

For each remaining test file, make these changes:

### Step 1: Add imports
```typescript
import { initializeProvider } from "./utils/provider";
import { setupTestEnvironment, postTestCleanup } from "./utils/test-setup";
```

### Step 2: Replace provider initialization
Replace:
```typescript
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
```

With:
```typescript
const provider = initializeProvider();
```

### Step 3: Add test hooks
After `const program = ...` line, add:
```typescript
// Setup test environment
before(async () => {
  await setupTestEnvironment(provider);
});

// Add delay between tests for rate limiting
afterEach(async () => {
  await postTestCleanup(provider);
});
```

## Configuration Required

### `.env` file must have:
```bash
SOLANA_NETWORK=devnet
DEVNET_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY
```

### Get Helius API Key:
1. Go to https://www.helius.dev/
2. Sign up (free tier: 100 requests/second)
3. Create a project
4. Copy API key
5. Update `DEVNET_RPC_URL` in `.env`

## Benefits

- ✅ No more 429 rate limit errors
- ✅ Faster test execution (higher rate limits)
- ✅ Automatic balance checking and airdrops
- ✅ Rate limiting delays between tests
- ✅ Better error handling and retries

## Testing

After updating all files:
```bash
# Run on devnet
anchor test --skip-local-validator --provider.cluster devnet

# Or run specific test
anchor test --skip-local-validator --provider.cluster devnet tests/create-event.ts
```

## Notes

- Public Solana RPC: 5-10 req/sec (causes issues)
- Helius free tier: 100 req/sec (works great)
- QuickNode free tier: 25 req/sec (also works)
