# Mythra Program

A Solana program for event ticketing with NFT-based tickets, built with Anchor Framework.

## Features

- ✅ Create events with multiple ticket tiers
- ✅ Mint NFT-based tickets
- ✅ Transfer tickets with royalty support
- ✅ Mark tickets as used for event entry
- ✅ Refund mechanism
- ✅ Escrow-based payment system
- ✅ Platform fee distribution

## Prerequisites

- **Rust** 1.70+
- **Solana CLI** 1.18+
- **Anchor CLI** 0.31.1+
- **Node.js** 18+
- **Yarn** 1.22+

## Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd mythra-program

# Install dependencies
yarn install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# nano .env  # or use your favorite editor
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```bash
# Network: localnet, devnet, testnet, mainnet-beta
SOLANA_NETWORK=localnet

# RPC URLs (optional - defaults will be used if not set)
LOCALNET_RPC_URL=http://127.0.0.1:8899
DEVNET_RPC_URL=https://api.devnet.solana.com

# Program IDs (will be auto-populated after deployment)
LOCALNET_PROGRAM_ID=your_program_id_here
DEVNET_PROGRAM_ID=your_program_id_here

# Wallet path
WALLET_PATH=~/.config/solana/id.json

# Test configuration
TEST_TIMEOUT=1000000
AIRDROP_AMOUNT=5
MIN_BALANCE=2
```

### For Paid RPC Providers

If using Helius, Quicknode, or other paid providers:

```bash
# Add to .env
HELIUS_API_KEY=your_helius_api_key
# OR
QUICKNODE_ENDPOINT=your_quicknode_endpoint
```

## Usage

### Local Development

```bash
# Start local validator (in separate terminal)
solana-test-validator

# Build the program
anchor build

# Run tests
anchor test

# Deploy locally
./scripts/deploy.sh
# or
anchor deploy
```

### Devnet Deployment

```bash
# Set network to devnet in .env
echo "SOLANA_NETWORK=devnet" > .env

# Make sure you have SOL on devnet
solana config set --url devnet
solana airdrop 5

# Deploy to devnet
./scripts/deploy.sh

# Run tests on devnet
SOLANA_NETWORK=devnet anchor test --skip-local-validator --provider.cluster devnet
```

### Quick Scripts

```bash
# Make scripts executable
chmod +x scripts/*.sh

# Deploy to current network (from .env)
./scripts/deploy.sh

# Deploy specifically to devnet (legacy script)
./scripts/deploy-devnet.sh

# Test on devnet
./scripts/test-devnet.sh

# Pre-fund test keypairs (if hitting airdrop limits)
./scripts/fund-test-keypairs.sh
```

## Project Structure

```
mythra-program/
├── programs/
│   └── mythra-program/
│       └── src/
│           ├── lib.rs              # Program entry point
│           ├── instructions/       # Instruction handlers
│           ├── state/              # Account state definitions
│           └── errors.rs           # Custom error definitions
├── tests/
│   ├── utils/                      # Test utilities
│   │   ├── config.ts              # Environment configuration
│   │   ├── devnet-helpers.ts      # Devnet testing helpers
│   │   └── test-setup.ts          # Common test setup
│   ├── create-event.ts
│   ├── create-ticket-tier.ts
│   ├── register-mint.ts
│   ├── mark-ticket-used.ts
│   ├── transfer_tickets.ts
│   ├── refund-ticket.ts
│   ├── withdraw-funds.ts
│   ├── close-event.ts
│   └── update-event.ts
├── scripts/
│   ├── deploy.sh                  # Universal deployment script
│   ├── deploy-devnet.sh           # Legacy devnet deployment
│   ├── test-devnet.sh             # Devnet testing
│   └── fund-test-keypairs.sh      # Pre-fund test accounts
├── .env                           # Environment config (DO NOT COMMIT)
├── .env.example                   # Template for .env
├── Anchor.toml                    # Anchor configuration
└── README.md                      # This file
```

## Program Instructions

### Event Management

- **`create_event`** - Create a new event
- **`update_event`** - Update event details
- **`close_event`** - Close an event after it ends

### Ticket Tier Management

- **`create_ticket_tier`** - Create a pricing tier for an event

### Ticket Operations

- **`register_mint`** - Mint a new ticket NFT
- **`transfer_ticket`** - Transfer ticket with royalty handling
- **`mark_ticket_used`** - Mark ticket as used (check-in)
- **`refund_ticket`** - Process refund for unused ticket

### Financial Operations

- **`withdraw_funds`** - Withdraw accumulated funds from escrow

## Testing

### Local Testing

```bash
# Run all tests
anchor test

# Run specific test file
anchor test tests/create-event.ts

# Run with skip build (faster for iterations)
anchor test --skip-build

# Run with skip deploy (use existing deployment)
anchor test --skip-build --skip-deploy
```

### Devnet Testing

```bash
# Set to devnet
export SOLANA_NETWORK=devnet

# Run tests on devnet
anchor test --skip-local-validator --provider.cluster devnet

# Or use the helper script
./scripts/test-devnet.sh
```

### Test Results

- **Localnet**: 79/79 tests passing ✅
- **Devnet**: 35/35 tests passing (44 blocked by airdrop limits) ⚠️

See `DEVNET_TEST_RESULTS.md` for detailed devnet test analysis.

## Documentation

Detailed documentation for each instruction:

- [CREATE_EVENT_README.md](./CREATE_EVENT_README.md) - Event creation
- [CREATE_TICKET_TIER_README.md](./CREATE_TICKET_TIER_README.md) - Ticket tier management
- [REGISTER_MINT_README.md](./REGISTER_MINT_README.md) - Ticket minting
- [MARK_TICKET_USED_README.md](./MARK_TICKET_USED_README.md) - Check-in system
- [UPDATE_EVENT_README.md](./UPDATE_EVENT_README.md) - Event updates
- [WITHDRAW_FUNDS_README.md](./WITHDRAW_FUNDS_README.md) - Fund withdrawal
- [DEVNET_DEPLOYMENT_GUIDE.md](./DEVNET_DEPLOYMENT_GUIDE.md) - Devnet deployment guide
- [DEVNET_TEST_RESULTS.md](./DEVNET_TEST_RESULTS.md) - Devnet test analysis

## Security Considerations

### For Development

- ✅ `.env` is gitignored - never commit it
- ✅ Program keypairs are gitignored
- ✅ Test keypairs are gitignored
- ✅ Use devnet/testnet for testing, not mainnet

### For Production

- 🔒 Conduct security audit before mainnet deployment
- 🔒 Set proper upgrade authority
- 🔒 Use hardware wallet for upgrade authority
- 🔒 Test thoroughly on devnet/testnet
- 🔒 Verify program on Solana Explorer
- 🔒 Consider using multi-sig for critical operations

## Common Issues

### Airdrop Rate Limit (Devnet)

**Problem**: `429 Too Many Requests` when requesting airdrops

**Solutions**:
1. Wait 24 hours for limit reset
2. Use web faucet: https://faucet.solana.com
3. Pre-fund test keypairs: `./scripts/fund-test-keypairs.sh`
4. Use paid RPC provider (Helius, Quicknode)

### Account Not Provided Error

**Problem**: `Error: Account 'tier' not provided`

**Solution**: Use `.accountsPartial()` instead of `.accounts()` for method calls

### Clock Drift Issues

**Problem**: Timestamp assertions failing on devnet

**Solution**: Already handled with 30s tolerance in tests

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write/update tests
5. Ensure all tests pass
6. Submit a pull request

## License

ISC

## Support

- [Solana Discord](https://discord.gg/solana)
- [Anchor Discord](https://discord.gg/anchor)
- [Solana Stack Exchange](https://solana.stackexchange.com/)

## Deployment Status

### Localnet
- Status: ✅ Deployed
- Program ID: `AtJRC2ETky4gPYQtKQAWyRiCQmQtgVa5zkt4sJMuM88A`
- Tests: 79/79 passing

### Devnet
- Status: ✅ Deployed
- Program ID: `3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd`
- Tests: 35/79 passing (limited by airdrop)
- Explorer: [View on Solana Explorer](https://explorer.solana.com/address/3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd?cluster=devnet)

### Mainnet
- Status: ❌ Not deployed
- Coming soon after full devnet validation

---

**Built with ❤️ using [Anchor Framework](https://www.anchor-lang.com/)**
