# Mythra Platform - Actor-Based Test Suite

Actor-based integration tests for Mythra Protocol on Solana Devnet.

## 🎭 Test Structure

Tests are organized by actor/user role to simulate real-world usage patterns:

```
tests/
├── actors/
│   ├── event-organizer.test.ts    # Event creators & managers
│   ├── customer.test.ts            # Ticket buyers & attendees  
│   ├── investor-dao.test.ts        # Crowdfunding contributors & voters
│   └── mythra-platform.test.ts     # Platform operations & analytics
└── utils/
    ├── provider.ts                 # Solana connection setup
    ├── config.ts                   # Test configuration
    └── devnet-helpers.ts           # Helper functions
```

---

## 🚀 Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Actor Tests
```bash
# Event organizer tests
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/actors/event-organizer.test.ts

# Customer tests  
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/actors/customer.test.ts

# Investor/DAO tests
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/actors/investor-dao.test.ts

# Platform tests
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/actors/mythra-platform.test.ts
```

---

## 🎯 Test Coverage by Actor

### 1. 🎭 Event Organizer
**Actions tested:**
- ✅ Create events
- ✅ Create ticket tiers (VIP, General Admission)
- ✅ Update event metadata
- ✅ View event statistics
- ✅ Track revenue and sales

**Use case:** Event creators setting up and managing their events

---

### 2. 🎫 Customer (Ticket Buyer)
**Actions tested:**
- ✅ Browse events and pricing
- ✅ Purchase tickets (NFT minting + payment)
- ✅ View owned tickets
- ✅ Transfer tickets to friends
- ✅ Request refunds

**Use case:** End users buying and managing their tickets

---

### 3. 💰 Investor/DAO
**Actions tested:**
- ✅ Discover crowdfunding campaigns
- ✅ Contribute funds to events
- ✅ Vote on budget proposals
- ✅ Track investment returns
- ✅ Participate in governance

**Use case:** Investors funding events through crowdfunding

---

### 4. 🏛️ Mythra Platform
**Actions tested:**
- ✅ Track platform revenue
- ✅ Verify tickets at gates
- ✅ Prevent fraud (double-entry)
- ✅ Generate analytics
- ✅ Monitor system health

**Use case:** Platform-level operations and monitoring

---

## 🌐 Network Configuration

All tests run on **Solana Devnet** using the deployed program:

```
Program ID: 3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd
Network: Devnet
RPC: https://devnet.helius-rpc.com/
```

Configuration is loaded from `.env` file.

---

## 📊 Test Scenarios

### Event Organizer Flow
1. Create event → Create tiers → Update metadata → View stats

### Customer Flow
1. Browse events → Check prices → Purchase ticket → Verify ownership

### Investor Flow
1. Find campaign → Contribute funds → Vote on budget → Track ROI

### Platform Flow
1. Track revenue → Verify tickets → Mark as used → Generate analytics

---

## 🔧 Prerequisites

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Update with your RPC endpoint
```

---

## 📝 Writing New Tests

To add tests for a new actor:

```typescript
import { initializeProvider } from "../utils/provider";

describe("🎭 New Actor Tests", () => {
  const provider = initializeProvider();
  const program = anchor.workspace.MythraProgram;
  
  before(async () => {
    // Setup
  });
  
  it("should perform action", async () => {
    // Test implementation
  });
});
```

---

## 🎨 Test Output

Tests include detailed console output:

```
========================================
🎭 EVENT ORGANIZER TEST SUITE
========================================
Network: Devnet
Program ID: 3STUXGoh...
========================================

📅 Creating new event...
✅ Event created successfully
   Event ID: organizer-event-1234567890
   Transaction: 2tpMaZ...

🎟️  Creating VIP ticket tier...
✅ VIP tier created successfully
   Price: 2 SOL
   Max Supply: 100 tickets
```

---

## 🧪 Integration with Next.js

These tests simulate the exact API calls that the Next.js frontend will make:

```typescript
// Frontend will use same pattern:
const tx = await program.methods
  .createEvent(...)
  .accountsPartial({...})
  .rpc();
```

---

## ⚙️ Environment Variables

Required in `.env`:

```env
SOLANA_NETWORK=devnet
DEVNET_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
DEVNET_PROGRAM_ID=3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd
TEST_TIMEOUT=1000000
```

---

## 🐛 Troubleshooting

**Tests failing with "Account not found"?**
- Ensure program is deployed on devnet
- Check program ID in `.env` matches deployed program

**Rate limit errors?**
- Use a paid RPC endpoint (Helius, QuickNode)
- Reduce concurrent test runs

**Insufficient funds?**
- Fund test wallets from devnet faucet: https://faucet.solana.com

---

## 📦 Test Dependencies

- `@coral-xyz/anchor` - Solana framework
- `@solana/web3.js` - Solana web3 library
- `@solana/spl-token` - SPL token operations
- `chai` - Assertions
- `mocha` - Test runner
- `ts-mocha` - TypeScript support

---

## 🎯 Success Criteria

All tests should:
- ✅ Run on Solana Devnet
- ✅ Use real program deployment
- ✅ Simulate actual user flows
- ✅ Include proper assertions
- ✅ Output clear results
- ✅ Be maintainable & documented

---

**Ready to test? Run `npm test` to execute the full suite! 🚀**
