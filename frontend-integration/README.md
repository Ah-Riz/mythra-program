# Mythra Platform - Frontend Integration Package

This directory contains everything you need to integrate the Mythra Platform smart contract with your Next.js frontend.

---

## 📦 What's Included

```
frontend-integration/
├── lib/
│   ├── program.ts          # Core program connection & client
│   └── providers.tsx       # Wallet provider setup
├── components/
│   ├── WalletButton.tsx    # Wallet connection UI
│   ├── CreateEventForm.tsx # Create event component
│   └── ContributeToCampaign.tsx # Contribute component
├── docs/
│   └── FRONTEND_INTEGRATION_GUIDE.md # Complete documentation
├── examples/
│   └── (example implementations)
├── package.json.template   # Dependencies list
└── README.md              # This file
```

---

## 🚀 Quick Start

### 1. Create Next.js App

```bash
npx create-next-app@latest mythra-frontend
cd mythra-frontend
```

### 2. Install Dependencies

```bash
npm install @solana/web3.js \
            @solana/wallet-adapter-react \
            @solana/wallet-adapter-react-ui \
            @solana/wallet-adapter-wallets \
            @solana/wallet-adapter-base \
            @coral-xyz/anchor
```

### 3. Copy Integration Files

```bash
# From the mythra-program directory
cp -r frontend-integration/lib your-frontend-project/
cp -r frontend-integration/components your-frontend-project/
```

### 4. Copy Program Files

```bash
# Copy IDL
mkdir -p your-frontend-project/lib/idl
cp target/idl/mythra_program.json your-frontend-project/lib/idl/

# Copy types
mkdir -p your-frontend-project/lib/types
cp target/types/mythra_program.ts your-frontend-project/lib/types/
```

### 5. Setup Environment

Create `.env.local`:

```env
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_PROGRAM_ID=3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd
NEXT_PUBLIC_RPC_ENDPOINT=https://api.devnet.solana.com
```

### 6. Configure Layout

Update `app/layout.tsx`:

```typescript
import { SolanaProvider } from '@/lib/providers';
import '@solana/wallet-adapter-react-ui/styles.css';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SolanaProvider>
          {children}
        </SolanaProvider>
      </body>
    </html>
  );
}
```

### 7. Use Components

```typescript
import { WalletButton } from '@/components/WalletButton';
import { CreateEventForm } from '@/components/CreateEventForm';

export default function HomePage() {
  return (
    <div>
      <WalletButton />
      <CreateEventForm />
    </div>
  );
}
```

---

## 📖 Documentation

See **[FRONTEND_INTEGRATION_GUIDE.md](./docs/FRONTEND_INTEGRATION_GUIDE.md)** for:
- Complete API reference
- All available methods
- Best practices
- Error handling
- Troubleshooting

---

## 🔑 Key Concepts

### Program ID
```
3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd
```

### Network
- **Devnet**: For testing (uses this)
- **Mainnet**: For production (coming soon)

### MythraClient Class

The main interface for all operations:

```typescript
import { MythraClient } from '@/lib/program';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import IDL from '@/lib/idl/mythra_program.json';

const { connection } = useConnection();
const wallet = useWallet();
const client = new MythraClient(connection, wallet as any, IDL);

// Create event
await client.createEvent({...});

// Create campaign
await client.createCampaign({...});

// Contribute
await client.contribute({...});
```

---

## 🎯 Available Operations

### Events
- ✅ `createEvent()` - Create new event
- ✅ `getEvent()` - Fetch event data

### Campaigns
- ✅ `createCampaign()` - Create crowdfunding campaign
- ✅ `contribute()` - Contribute to campaign
- ✅ `getCampaign()` - Fetch campaign data
- ✅ `getCampaignContributions()` - Get all contributors
- ✅ `getUserContribution()` - Get specific contribution

### Budget & Voting
- ✅ `submitBudget()` - Submit budget proposal
- ✅ `voteOnBudget()` - Vote on budget

### Profit Distribution
- ✅ `claimBackerProfit()` - Claim backer profit
- ✅ `claimOrganizerProfit()` - Claim organizer profit

---

## 🔧 Utility Functions

### PDA Derivation
```typescript
import { getEventPDA, getCampaignPDA } from '@/lib/program';

const [eventPda] = getEventPDA(organizerPubkey, "event-123");
const [campaignPda] = getCampaignPDA(eventPda);
```

### Conversion Helpers
```typescript
import { lamportsToSol, solToLamports, shortenAddress } from '@/lib/program';

const sol = lamportsToSol(1000000000); // 1 SOL
const lamports = solToLamports(5); // 5 SOL in lamports
const short = shortenAddress(pubkey); // "Ab12...xy89"
```

---

## 📦 Component Library

### WalletButton
Simple wallet connection button with Phantom, Solflare support.

### CreateEventForm
Full form for creating events with validation and error handling.

### ContributeToCampaign
Component for contributing SOL to campaigns with progress display.

---

## 🎨 Styling

Components use Tailwind CSS. To customize:

```typescript
// Modify className props
<button className="bg-blue-600 hover:bg-blue-700 ...">
  Your Custom Button
</button>
```

Or create your own styled components using the `MythraClient` methods.

---

## ⚡ Performance Tips

### 1. Use React Query for Caching

```bash
npm install @tanstack/react-query
```

```typescript
import { useQuery } from '@tanstack/react-query';

function useCampaign(organizer: string, eventId: string) {
  return useQuery({
    queryKey: ['campaign', organizer, eventId],
    queryFn: () => client.getCampaign(organizer, eventId),
    refetchInterval: 10000,
  });
}
```

### 2. Use Paid RPC for Production

```env
# Helius (recommended)
NEXT_PUBLIC_RPC_ENDPOINT=https://devnet.helius-rpc.com/?api-key=YOUR_KEY

# Or QuickNode
NEXT_PUBLIC_RPC_ENDPOINT=https://your-endpoint.quiknode.pro/YOUR_KEY/
```

---

## 🐛 Troubleshooting

### Wallet Not Connecting?
1. Check if wallet extension is installed
2. Verify `SolanaProvider` wraps your app
3. Import wallet CSS: `@solana/wallet-adapter-react-ui/styles.css`

### Transaction Failing?
1. Check wallet has enough SOL
2. Use devnet faucet: https://faucet.solana.com
3. Verify correct network (devnet vs mainnet)
4. Check program is deployed: https://explorer.solana.com/address/3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd?cluster=devnet

### Account Not Found?
1. Verify PDA derivation is correct
2. Ensure account was created on-chain first
3. Check organizer pubkey is correct

---

## 📚 Resources

- **Program Explorer**: https://explorer.solana.com/address/3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd?cluster=devnet
- **Solana Docs**: https://docs.solana.com
- **Wallet Adapter**: https://github.com/solana-labs/wallet-adapter
- **Anchor Docs**: https://book.anchor-lang.com

---

## 🤝 Support

- Check `/docs/FRONTEND_INTEGRATION_GUIDE.md` for detailed docs
- Review test files in `/tests` for usage examples
- Join Solana Discord for help

---

## 📝 Example Usage

### Simple Event Creation

```typescript
'use client';

import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { MythraClient } from '@/lib/program';
import IDL from '@/lib/idl/mythra_program.json';

export default function CreateEvent() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);

  const createEvent = async () => {
    if (!wallet.publicKey) return;

    setLoading(true);
    try {
      const client = new MythraClient(connection, wallet as any, IDL);
      
      const signature = await client.createEvent({
        eventId: `event-${Date.now()}`,
        metadataUri: 'https://example.com/metadata.json',
        startTs: Math.floor(Date.now() / 1000) + 86400,
        endTs: Math.floor(Date.now() / 1000) + 172800,
        totalSupply: 100,
        platformSplitBps: 500,
        treasury: wallet.publicKey,
      });

      alert(`Event created! Tx: ${signature}`);
    } catch (error) {
      console.error(error);
      alert('Failed to create event');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={createEvent} disabled={loading || !wallet.connected}>
      {loading ? 'Creating...' : 'Create Event'}
    </button>
  );
}
```

---

**Ready to build? Start with the [Integration Guide](./docs/FRONTEND_INTEGRATION_GUIDE.md)!** 🚀
