#!/bin/bash

# Script to update all test files to use custom provider from .env
# This fixes the issue where tests use public RPC instead of Helius API

set -e

echo "🔧 Fixing test files to use custom RPC provider..."

# Array of test files to update
TEST_FILES=(
  "tests/close-event.ts"
  "tests/create-ticket-tier.ts"
  "tests/mark-ticket-used.ts"
  "tests/refund-ticket.ts"
  "tests/register-mint.ts"
  "tests/transfer_tickets.ts"
  "tests/update-event.ts"
  "tests/withdraw-funds.ts"
)

for file in "${TEST_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  Updating $file..."
    
    # Add imports if not present
    if ! grep -q "initializeProvider" "$file"; then
      # Add import after chai import
      sed -i.bak '/import.*chai/a\
import { initializeProvider } from "./utils/provider";\
import { setupTestEnvironment, postTestCleanup } from "./utils/test-setup";
' "$file"
    fi
    
    # Replace AnchorProvider.env() with initializeProvider()
    sed -i.bak 's/const provider = anchor\.AnchorProvider\.env();/const provider = initializeProvider();/' "$file"
    
    # Remove anchor.setProvider(provider); line as initializeProvider() handles it
    sed -i.bak '/^  anchor\.setProvider(provider);$/d' "$file"
    
    # Add before/afterEach hooks after program declaration
    if ! grep -q "setupTestEnvironment" "$file"; then
      sed -i.bak '/const program = anchor\.workspace/a\
\
  // Setup test environment\
  before(async () => {\
    await setupTestEnvironment(provider);\
  });\
\
  // Add delay between tests for rate limiting\
  afterEach(async () => {\
    await postTestCleanup(provider);\
  });
' "$file"
    fi
    
    # Remove backup files
    rm -f "${file}.bak"
    
    echo "    ✅ Updated $file"
  else
    echo "    ⚠️  File not found: $file"
  fi
done

echo ""
echo "✅ All test files updated successfully!"
echo ""
echo "Now your tests will use the Helius RPC URL from .env"
echo "Run: anchor test --skip-local-validator --provider.cluster devnet"
