#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

NETWORK=$1

if [ -z "$NETWORK" ]; then
    echo "Usage: ./scripts/switch-network.sh <network>"
    echo "Networks: localnet, devnet, testnet, mainnet-beta"
    exit 1
fi

# Validate network
case "$NETWORK" in
    localnet|devnet|testnet|mainnet-beta)
        ;;
    *)
        echo "Invalid network: $NETWORK"
        echo "Valid options: localnet, devnet, testnet, mainnet-beta"
        exit 1
        ;;
esac

echo "Switching to $NETWORK..."

# Update .env file
if [ -f .env ]; then
    # Check if SOLANA_NETWORK exists
    if grep -q "^SOLANA_NETWORK=" .env; then
        # Update existing
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/^SOLANA_NETWORK=.*/SOLANA_NETWORK=$NETWORK/" .env
        else
            sed -i "s/^SOLANA_NETWORK=.*/SOLANA_NETWORK=$NETWORK/" .env
        fi
    else
        # Add if missing
        echo "SOLANA_NETWORK=$NETWORK" >> .env
    fi
else
    echo "Error: .env file not found"
    echo "Create one from template: cp .env.example .env"
    exit 1
fi

# Update solana CLI config
case "$NETWORK" in
    localnet)
        RPC_URL="http://127.0.0.1:8899"
        ;;
    devnet)
        RPC_URL="https://api.devnet.solana.com"
        ;;
    testnet)
        RPC_URL="https://api.testnet.solana.com"
        ;;
    mainnet-beta)
        RPC_URL="https://api.mainnet-beta.solana.com"
        ;;
esac

solana config set --url "$RPC_URL"

echo -e "${GREEN}✓ Switched to $NETWORK${NC}"
echo ""
echo "Current configuration:"
solana config get
echo ""

# Show balance
echo "Wallet balance:"
solana balance
echo ""

# Show program ID from .env
ENV_VAR="${NETWORK^^}_PROGRAM_ID"
ENV_VAR="${ENV_VAR//-/_}"
if grep -q "^${ENV_VAR}=" .env; then
    PROGRAM_ID=$(grep "^${ENV_VAR}=" .env | cut -d'=' -f2)
    echo "Program ID ($NETWORK): $PROGRAM_ID"
    
    if [ "$NETWORK" != "localnet" ]; then
        echo "View on explorer: https://explorer.solana.com/address/$PROGRAM_ID?cluster=$NETWORK"
    fi
else
    echo -e "${YELLOW}⚠ No program ID set for $NETWORK${NC}"
    echo "Deploy first: ./scripts/deploy.sh"
fi
