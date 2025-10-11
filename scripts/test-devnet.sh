#!/bin/bash
set -e

echo "========================================="
echo "Mythra Program - Devnet Testing"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Set cluster to devnet
echo "Setting cluster to devnet..."
solana config set --url https://api.devnet.solana.com

WALLET_PUBKEY=$(solana address)
BALANCE=$(solana balance | awk '{print $1}')

echo "Wallet: $WALLET_PUBKEY"
echo "Balance: $BALANCE SOL"
echo ""

# Check if we need airdrop
MIN_BALANCE=3
if (( $(echo "$BALANCE < $MIN_BALANCE" | bc -l) )); then
    echo -e "${YELLOW}Low balance. Requesting airdrop...${NC}"
    solana airdrop 2 || echo "Airdrop failed or rate limited. Please request manually."
    echo ""
fi

echo "Running tests on devnet..."
echo -e "${YELLOW}This will take longer than localnet due to network latency${NC}"
echo ""

# Run tests without starting local validator
anchor test --skip-local-validator --provider.cluster devnet

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}All Tests Passed on Devnet!${NC}"
    echo -e "${GREEN}=========================================${NC}"
else
    echo ""
    echo "Some tests failed. Check output above for details."
    exit 1
fi
