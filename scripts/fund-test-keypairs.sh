#!/bin/bash
# Pre-fund test keypairs to avoid airdrop limits

echo "Generating and funding test keypairs..."

# Create test keypairs directory if it doesn't exist
mkdir -p .test-keypairs

# Generate keypairs for test actors (reusable across tests)
KEYPAIRS=("buyer1" "buyer2" "buyer3" "gate-operator" "unauthorized")

for name in "${KEYPAIRS[@]}"; do
    if [ ! -f ".test-keypairs/${name}.json" ]; then
        solana-keygen new --outfile ".test-keypairs/${name}.json" --no-bip39-passphrase --silent
        echo "Generated ${name} keypair"
    fi
    
    PUBKEY=$(solana-keygen pubkey ".test-keypairs/${name}.json")
    BALANCE=$(solana balance $PUBKEY --url devnet 2>/dev/null | awk '{print $1}' || echo "0")
    
    echo "${name}: $PUBKEY (Balance: $BALANCE SOL)"
    
    # Fund if balance is low
    if (( $(echo "$BALANCE < 2" | bc -l) )); then
        echo "  Funding ${name}..."
        # Transfer from main wallet instead of airdrop
        solana transfer $PUBKEY 2 --url devnet --allow-unfunded-recipient --fee-payer ~/.config/solana/id.json
    fi
done

echo ""
echo "✅ All test keypairs funded"
echo ""
echo "Update your tests to use these keypairs:"
echo "  const buyer = loadKeypair('.test-keypairs/buyer1.json');"
