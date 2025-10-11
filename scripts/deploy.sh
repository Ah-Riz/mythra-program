#!/bin/bash
set -e

# Load environment variables from .env
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)
fi

# Default to localnet if not set
NETWORK=${SOLANA_NETWORK:-localnet}

echo "========================================="
echo "Mythra Program - Deployment"
echo "========================================="
echo "Network: $NETWORK"
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

# Set RPC URL based on network
case "$NETWORK" in
    localnet)
        RPC_URL=${LOCALNET_RPC_URL:-http://127.0.0.1:8899}
        ;;
    devnet)
        RPC_URL=${DEVNET_RPC_URL:-https://api.devnet.solana.com}
        ;;
    testnet)
        RPC_URL=${TESTNET_RPC_URL:-https://api.testnet.solana.com}
        ;;
    mainnet-beta)
        RPC_URL=${MAINNET_RPC_URL:-https://api.mainnet-beta.solana.com}
        ;;
    *)
        echo -e "${RED}Error: Invalid network '$NETWORK'${NC}"
        echo "Valid options: localnet, devnet, testnet, mainnet-beta"
        exit 1
        ;;
esac

# Set cluster
echo "Setting cluster to $NETWORK..."
solana config set --url "$RPC_URL"
echo ""

# Get current wallet
WALLET_PATH=${WALLET_PATH:-~/.config/solana/id.json}
WALLET_PUBKEY=$(solana address)

echo "Wallet: $WALLET_PUBKEY"
echo "Wallet Path: $WALLET_PATH"
echo ""

# Check balance (skip for localnet)
if [ "$NETWORK" != "localnet" ]; then
    BALANCE=$(solana balance | awk '{print $1}')
    echo "Current balance: $BALANCE SOL"
    
    # Minimum required balance
    MIN_BALANCE=${MIN_BALANCE:-10}
    
    if (( $(echo "$BALANCE < $MIN_BALANCE" | bc -l) )); then
        echo -e "${YELLOW}Warning: Balance is low. Recommended minimum: $MIN_BALANCE SOL${NC}"
        
        if [ "$NETWORK" = "devnet" ] || [ "$NETWORK" = "testnet" ]; then
            echo "You can request an airdrop:"
            echo "  solana airdrop ${AIRDROP_AMOUNT:-5}"
        fi
        
        echo ""
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

echo ""
echo "Building program..."
anchor build

# Run tests on localnet before deploying
if [ "$NETWORK" = "localnet" ]; then
    echo ""
    echo "Running tests locally first..."
    anchor test --skip-deploy
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Tests failed! Fix tests before deploying.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ All tests passed${NC}"
fi

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

# Update Anchor.toml with program ID for the network
echo "Updating Anchor.toml with program ID..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "/\[programs.$NETWORK\]/,/\[/ s/mythra_program = \".*\"/mythra_program = \"$PROGRAM_ID\"/" Anchor.toml
else
    # Linux
    sed -i "/\[programs.$NETWORK\]/,/\[/ s/mythra_program = \".*\"/mythra_program = \"$PROGRAM_ID\"/" Anchor.toml
fi

# Update .env with program ID
ENV_VAR="${NETWORK^^}_PROGRAM_ID"
ENV_VAR="${ENV_VAR//-/_}"
if grep -q "^${ENV_VAR}=" .env 2>/dev/null; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/^${ENV_VAR}=.*/${ENV_VAR}=${PROGRAM_ID}/" .env
    else
        sed -i "s/^${ENV_VAR}=.*/${ENV_VAR}=${PROGRAM_ID}/" .env
    fi
    echo "Updated .env: ${ENV_VAR}=${PROGRAM_ID}"
else
    echo "${ENV_VAR}=${PROGRAM_ID}" >> .env
    echo "Added to .env: ${ENV_VAR}=${PROGRAM_ID}"
fi
echo ""

# Rebuild with new program ID
echo "Rebuilding with updated program ID..."
anchor build
echo ""

# Deploy
echo "Deploying to $NETWORK..."
if [ "$NETWORK" != "localnet" ]; then
    echo -e "${YELLOW}This may take a few minutes...${NC}"
fi

if [ "$NETWORK" = "localnet" ]; then
    anchor deploy
else
    anchor deploy --provider.cluster "$NETWORK"
fi

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}Deployment Successful!${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo "Program ID: $PROGRAM_ID"
    echo "Cluster: $NETWORK"
    echo "RPC URL: $RPC_URL"
    echo ""
    
    echo "Verify deployment:"
    if [ "$NETWORK" = "localnet" ]; then
        echo "  solana program show $PROGRAM_ID"
    else
        echo "  solana program show $PROGRAM_ID --url $NETWORK"
    fi
    echo ""
    
    echo "Run tests:"
    if [ "$NETWORK" = "localnet" ]; then
        echo "  anchor test"
    else
        echo "  SOLANA_NETWORK=$NETWORK anchor test --skip-local-validator --provider.cluster $NETWORK"
    fi
    echo ""
    
    if [ "$NETWORK" != "localnet" ]; then
        echo "View on Solana Explorer:"
        echo "  https://explorer.solana.com/address/$PROGRAM_ID?cluster=$NETWORK"
        echo ""
    fi
else
    echo -e "${RED}Deployment failed!${NC}"
    exit 1
fi
