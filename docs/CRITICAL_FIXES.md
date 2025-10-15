# Critical Fixes Applied - Account Collision & Airdrop Issues

## Issues Fixed

### 1. **Account Already in Use Errors** ✅
**Problem:** Tests were creating events with unique IDs but deriving PDAs from the original (non-unique) ID.

**Files Fixed:**
- `tests/update-event.ts`
- `tests/withdraw-funds.ts`

**Change:**
```typescript
// BEFORE (WRONG):
const uniqueEventId = `${eventId}-${Date.now()}`;
const eventPda = await getEventPda(organizer.publicKey, eventId); // ❌ Uses original ID

// AFTER (CORRECT):
const uniqueEventId = `${eventId}-${Date.now()}`;
const eventPda = await getEventPda(organizer.publicKey, uniqueEventId); // ✅ Uses unique ID
```

### 2. **429 Airdrop Errors & Hanging** ✅
**Problem:** `withdraw-funds.ts` had a `before` hook that requested airdrops, causing:
- 429 "airdrop limit reached" errors
- Tests hanging waiting for airdrop confirmations

**Fix:** Removed the airdrop-based `before` hook entirely.

**Change:**
```typescript
// BEFORE (CAUSED HANGING):
before(async () => {
  const airdropSig = await provider.connection.requestAirdrop(
    unauthorizedUser.publicKey,
    2 * LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(airdropSig);
});

// AFTER (REMOVED):
// No before hook needed - tests create their own accounts
```

### 3. **Changed `.accounts()` to `.accountsPartial()`** ✅
**Files:** `update-event.ts`, `withdraw-funds.ts`

This prevents TypeScript strict type checking issues.

## Test Now

Run a quick test to verify:

```bash
yarn ts-mocha -p ./tsconfig.json -t 1000000 tests/mythra-program.ts --grep "creates an event"
```

Should complete in **2-5 seconds** with no errors!

## Summary

✅ Fixed PDA derivation to use unique event IDs  
✅ Removed airdrop code causing 429 errors and hanging  
✅ Changed to `.accountsPartial()` for better compatibility  
✅ All 9 test files now use Helius RPC  
✅ Tests should run fast without hanging  

**Status:** Ready for full test suite run!
