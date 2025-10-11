#!/bin/bash
set -e

echo "========================================="
echo "Mythra Program - Devnet Deployment"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if solana CLI is installed
if ! command -v solana &> /dev/null; then
    echo -e "${RED}Error: solana CLI not found${NC}"
    echo "Install from: https://docs.solana.com/cli/install-solana-cli-tools"
    exit 1
fi

# Check if anchor CLI is installed
if ! command -v anchor &> /dev/null; then
    echo -e "${RED}Error: anchor CLI not found${NC}"
    echo "Install from: https://www.anchor-lang.com/docs/installation"
    exit 1
fi

echo "✓ Prerequisites checked"
echo ""

# Set cluster to devnet
echo "Setting cluster to devnet..."
solana config set --url https://api.devnet.solana.com
echo ""

# Get current wallet
WALLET=$(solana config get | grep "Keypair Path" | awk '{print $3}')
WALLET_PUBKEY=$(solana address)

echo "Wallet: $WALLET_PUBKEY"
echo ""

# Check balance
BALANCE=$(solana balance | awk '{print $1}')
echo "Current balance: $BALANCE SOL"

# Minimum required balance (10 SOL for deployment + fees)
MIN_BALANCE=10

if (( $(echo "$BALANCE < $MIN_BALANCE" | bc -l) )); then
    echo -e "${YELLOW}Warning: Balance is low. Recommended minimum: $MIN_BALANCE SOL${NC}"
    echo "You can request an airdrop:"
    echo "  solana airdrop 5"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "Building program..."
anchor build

echo ""
echo "Running tests locally first..."
anchor test --skip-deploy

if [ $? -ne 0 ]; then
    echo -e "${RED}Tests failed! Fix tests before deploying to devnet.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ All tests passed${NC}"
echo ""

# Check if program keypair exists
PROGRAM_KEYPAIR="./target/deploy/mythra_program-keypair.json"

if [ ! -f "$PROGRAM_KEYPAIR" ]; then
    echo -e "${YELLOW}Program keypair not found. Generating new one...${NC}"
    solana-keygen new --outfile "$PROGRAM_KEYPAIR" --no-bip39-passphrase
    echo ""
fi

PROGRAM_ID=$(solana-keygen pubkey "$PROGRAM_KEYPAIR")
echo "Program ID: $PROGRAM_ID"
echo ""

# Update Anchor.toml with program ID
echo "Updating Anchor.toml with program ID..."
sed -i.bak "s/mythra_program = \".*\"/mythra_program = \"$PROGRAM_ID\"/" Anchor.toml
echo ""

# Rebuild with new program ID
echo "Rebuilding with updated program ID..."
anchor build
echo ""

# Deploy
echo "Deploying to devnet..."
echo -e "${YELLOW}This may take a few minutes...${NC}"
anchor deploy --provider.cluster devnet

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}Deployment Successful!${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo "Program ID: $PROGRAM_ID"
    echo "Cluster: devnet"
    echo ""
    echo "Verify deployment:"
    echo "  solana program show $PROGRAM_ID --url devnet"
    echo ""
    echo "Run tests on devnet:"
    echo "  anchor test --skip-local-validator --provider.cluster devnet"
    echo ""
    echo "View on Solana Explorer:"
    echo "  https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
    echo ""
else
    echo -e "${RED}Deployment failed!${NC}"
    exit 1
fi
