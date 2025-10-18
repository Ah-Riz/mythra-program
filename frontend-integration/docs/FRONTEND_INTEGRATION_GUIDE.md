# Mythra Platform - Frontend Integration Guide

Complete guide for integrating Mythra Platform with your Next.js frontend application.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Setup Instructions](#setup-instructions)
3. [Core Concepts](#core-concepts)
4. [API Reference](#api-reference)
5. [Component Examples](#component-examples)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

- Node.js 18+
- Next.js 13+ (App Router or Pages Router)
- Basic understanding of React and Solana

### Installation

```bash
# Create Next.js app
npx create-next-app@latest mythra-frontend
cd mythra-frontend

# Install dependencies
npm install @solana/web3.js \
            @solana/wallet-adapter-react \
            @solana/wallet-adapter-react-ui \
            @solana/wallet-adapter-wallets \
            @solana/wallet-adapter-base \
            @coral-xyz/anchor
```

---

## Setup Instructions

### 1. Copy Integration Files

Copy the following files from `frontend-integration/` to your Next.js project:

```
frontend-integration/
├── lib/
│   ├── program.ts      →  your-project/lib/program.ts
│   └── providers.tsx   →  your-project/lib/providers.tsx
└── components/
    ├── WalletButton.tsx
    ├── CreateEventForm.tsx
    └── ContributeToCampaign.tsx
```

### 2. Copy Program Files

From your Solana project root:

```bash
# Copy IDL (Program Interface)
cp target/idl/mythra_program.json your-frontend-project/lib/idl/

# Copy TypeScript types
cp target/types/mythra_program.ts your-frontend-project/lib/types/
```

### 3. Setup Environment Variables

Create `.env.local`:

```env
# Network (devnet, mainnet-beta)
NEXT_PUBLIC_SOLANA_NETWORK=devnet

# RPC Endpoint (optional - uses public if not set)
NEXT_PUBLIC_RPC_ENDPOINT=https://api.devnet.solana.com

# Or use a paid RPC provider for better performance
# NEXT_PUBLIC_RPC_ENDPOINT=https://devnet.helius-rpc.com/?api-key=YOUR_KEY

# Program ID
NEXT_PUBLIC_PROGRAM_ID=3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd
```

### 4. Configure App Layout

For **App Router** (Next.js 13+), update `app/layout.tsx`:

```typescript
import { SolanaProvider } from '@/lib/providers';
import '@solana/wallet-adapter-react-ui/styles.css';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

For **Pages Router**, update `pages/_app.tsx`:

```typescript
import { SolanaProvider } from '@/lib/providers';
import '@solana/wallet-adapter-react-ui/styles.css';
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SolanaProvider>
      <Component {...pageProps} />
    </SolanaProvider>
  );
}
```

---

## Core Concepts

### Program Connection

The Mythra program is deployed on Solana devnet at:

```
Program ID: 3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd
Network: Devnet
Explorer: https://explorer.solana.com/address/3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd?cluster=devnet
```

### MythraClient Class

The `MythraClient` class provides a clean interface for all program operations:

```typescript
import { MythraClient } from '@/lib/program';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import IDL from '@/lib/idl/mythra_program.json';

// In your component
const { connection } = useConnection();
const wallet = useWallet();
const client = new MythraClient(connection, wallet as any, IDL);

// Now you can call methods
await client.createEvent({...});
await client.contribute({...});
```

### PDA (Program Derived Address) System

Mythra uses PDAs to deterministically derive account addresses:

- **Event PDA**: Derived from `["event", organizer, eventId]`
- **Campaign PDA**: Derived from `["campaign", eventPda]`
- **Contribution PDA**: Derived from `["contribution", campaignPda, contributor]`
- **Budget PDA**: Derived from `["budget", campaignPda]`

Helper functions are provided in `lib/program.ts`:

```typescript
import { getEventPDA, getCampaignPDA } from '@/lib/program';

const [eventPda, bump] = getEventPDA(organizerPubkey, "event-123");
const [campaignPda] = getCampaignPDA(eventPda);
```

---

## API Reference

### Event Operations

#### Create Event

```typescript
const signature = await client.createEvent({
  eventId: "my-event-123",
  metadataUri: "https://example.com/metadata.json",
  startTs: Math.floor(Date.now() / 1000) + 86400, // starts in 1 day
  endTs: Math.floor(Date.now() / 1000) + 172800,  // ends in 2 days
  totalSupply: 100,
  platformSplitBps: 500, // 5%
  treasury: treasuryPublicKey,
});
```

#### Get Event

```typescript
const event = await client.getEvent(organizerPubkey, "event-123");
console.log(event.totalSupply);
console.log(event.ticketsSold);
```

### Campaign Operations

#### Create Campaign

```typescript
const signature = await client.createCampaign({
  eventId: "my-event-123",
  fundingGoal: 20, // in SOL
  deadline: Math.floor(Date.now() / 1000) + 86400, // 1 day
});
```

#### Contribute to Campaign

```typescript
const signature = await client.contribute({
  organizer: organizerPublicKey,
  eventId: "event-123",
  amount: 5, // in SOL
});
```

#### Get Campaign Info

```typescript
const campaign = await client.getCampaign(organizerPubkey, "event-123");
console.log(`Goal: ${lamportsToSol(campaign.fundingGoal)} SOL`);
console.log(`Raised: ${lamportsToSol(campaign.totalRaised)} SOL`);
console.log(`Status: ${Object.keys(campaign.status)[0]}`);
```

### Budget & Voting

#### Submit Budget

```typescript
const signature = await client.submitBudget({
  eventId: "event-123",
  amount: 15, // in SOL
  description: "Event operational budget",
  milestones: [
    {
      description: "Venue & Setup",
      releasePercentage: 5000, // 50% (basis points)
      unlockDate: Math.floor(Date.now() / 1000) + 86400,
    },
    {
      description: "Marketing",
      releasePercentage: 3000, // 30%
      unlockDate: Math.floor(Date.now() / 1000) + 172800,
    },
    {
      description: "Operations",
      releasePercentage: 2000, // 20%
      unlockDate: Math.floor(Date.now() / 1000) + 259200,
    },
  ],
  votingPeriod: 86400, // 1 day in seconds
});
```

#### Vote on Budget

```typescript
const signature = await client.voteOnBudget({
  organizer: organizerPublicKey,
  eventId: "event-123",
  approve: true, // or false to reject
});
```

### Profit Distribution

#### Claim Backer Profit

```typescript
const signature = await client.claimBackerProfit({
  organizer: organizerPublicKey,
  eventId: "event-123",
});
```

#### Claim Organizer Profit

```typescript
const signature = await client.claimOrganizerProfit({
  eventId: "event-123",
});
```

### Utility Functions

#### Get User's Contribution

```typescript
const contribution = await client.getUserContribution(
  organizerPublicKey,
  "event-123",
  contributorPublicKey
);

if (contribution) {
  console.log(`Amount: ${lamportsToSol(contribution.amount)} SOL`);
  console.log(`Profit claimed: ${contribution.profitClaimed}`);
}
```

#### Get All Campaign Contributors

```typescript
const contributions = await client.getCampaignContributions(
  organizerPublicKey,
  "event-123"
);

contributions.forEach((contrib) => {
  console.log(`Contributor: ${contrib.account.contributor.toString()}`);
  console.log(`Amount: ${lamportsToSol(contrib.account.amount)} SOL`);
});
```

---

## Component Examples

### Basic Page Structure

```typescript
'use client';

import { WalletButton } from '@/components/WalletButton';
import { CreateEventForm } from '@/components/CreateEventForm';
import { useWallet } from '@solana/wallet-adapter-react';

export default function HomePage() {
  const wallet = useWallet();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Mythra Platform</h1>
          <WalletButton />
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        {wallet.connected ? (
          <CreateEventForm />
        ) : (
          <div className="text-center py-12">
            <h2 className="text-3xl font-bold mb-4">Connect Your Wallet</h2>
            <p className="text-gray-600 mb-8">
              Connect your wallet to start creating events and campaigns
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
```

### Displaying Campaign Progress

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { MythraClient, lamportsToSol } from '@/lib/program';
import IDL from '@/lib/idl/mythra_program.json';

export function CampaignProgress({ organizer, eventId }: { organizer: string; eventId: string }) {
  const { connection } = useConnection();
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCampaign = async () => {
      try {
        // Note: You need a wallet even just for reading
        // You can use a dummy wallet for read-only operations
        const dummyWallet = {
          publicKey: new PublicKey(organizer),
          signTransaction: async (tx: any) => tx,
          signAllTransactions: async (txs: any) => txs,
        };

        const client = new MythraClient(connection, dummyWallet as any, IDL);
        const data = await client.getCampaign(new PublicKey(organizer), eventId);
        
        setCampaign({
          ...data,
          goalSol: lamportsToSol(data.fundingGoal),
          raisedSol: lamportsToSol(data.totalRaised),
          progress: (lamportsToSol(data.totalRaised) / lamportsToSol(data.fundingGoal)) * 100,
        });
      } catch (error) {
        console.error('Error loading campaign:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCampaign();
  }, [organizer, eventId, connection]);

  if (loading) {
    return <div className="animate-pulse bg-gray-200 h-32 rounded-lg"></div>;
  }

  if (!campaign) {
    return <div className="text-red-600">Campaign not found</div>;
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-xl font-bold mb-4">Campaign Progress</h3>
      
      <div className="space-y-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Raised</span>
          <span className="font-bold">{campaign.raisedSol.toFixed(2)} SOL</span>
        </div>
        
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Goal</span>
          <span className="font-bold">{campaign.goalSol.toFixed(2)} SOL</span>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all"
            style={{ width: `${Math.min(campaign.progress, 100)}%` }}
          ></div>
        </div>
        
        <div className="text-center text-2xl font-bold text-blue-600">
          {campaign.progress.toFixed(1)}%
        </div>
        
        <div className="text-center text-sm text-gray-600 capitalize">
          Status: {Object.keys(campaign.status)[0]}
        </div>
      </div>
    </div>
  );
}
```

---

## Best Practices

### 1. Error Handling

Always wrap program calls in try-catch blocks:

```typescript
try {
  const signature = await client.createEvent({...});
  toast.success('Event created successfully!');
  router.push(`/events/${eventId}`);
} catch (error: any) {
  console.error('Error:', error);
  
  // Parse Anchor errors
  if (error.message.includes('0x')) {
    const errorCode = error.message.match(/0x[0-9a-f]+/i)?.[0];
    toast.error(`Transaction failed: ${errorCode}`);
  } else {
    toast.error(error.message || 'Unknown error');
  }
}
```

### 2. Transaction Confirmation

Wait for confirmation and provide feedback:

```typescript
const signature = await client.createEvent({...});

// Show pending state
toast.info('Transaction sent, waiting for confirmation...');

// Wait for confirmation
const confirmation = await connection.confirmTransaction(signature, 'confirmed');

if (confirmation.value.err) {
  toast.error('Transaction failed');
} else {
  toast.success('Transaction confirmed!');
}
```

### 3. Caching & Performance

Use React Query or SWR for data fetching:

```typescript
import { useQuery } from '@tanstack/react-query';

function useCampaign(organizer: string, eventId: string) {
  const { connection } = useConnection();
  
  return useQuery({
    queryKey: ['campaign', organizer, eventId],
    queryFn: async () => {
      const client = new MythraClient(connection, dummyWallet, IDL);
      return await client.getCampaign(new PublicKey(organizer), eventId);
    },
    refetchInterval: 10000, // Refetch every 10 seconds
  });
}
```

### 4. Wallet Connection State

Handle wallet connection properly:

```typescript
const { connected, connecting, publicKey } = useWallet();

if (connecting) {
  return <div>Connecting wallet...</div>;
}

if (!connected) {
  return <div>Please connect your wallet</div>;
}

// Your component logic
```

### 5. Network-Specific Configuration

Use environment-based configuration:

```typescript
const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
const EXPLORER_URL = NETWORK === 'mainnet-beta'
  ? 'https://explorer.solana.com'
  : `https://explorer.solana.com?cluster=${NETWORK}`;

// Link to explorer
<a href={`${EXPLORER_URL}/tx/${signature}`} target="_blank">
  View Transaction
</a>
```

---

## Troubleshooting

### Common Issues

#### 1. Wallet Not Connecting

**Problem**: Wallet adapter not working

**Solution**:
- Ensure CSS is imported: `import '@solana/wallet-adapter-react-ui/styles.css'`
- Check if SolanaProvider wraps your app
- Verify wallet extensions are installed (Phantom, Solflare)

#### 2. Transaction Fails with "Account Not Provided"

**Problem**: `.accounts()` method fails

**Solution**:
- Use `.accountsPartial()` instead of `.accounts()`
- This is required for newer Anchor versions

#### 3. Program Account Not Found

**Problem**: Cannot fetch account data

**Solution**:
- Verify correct PDA derivation
- Ensure the account has been created on-chain
- Check you're on the right network (devnet vs mainnet)

#### 4. Insufficient SOL

**Problem**: Transaction fails due to low balance

**Solution**:
- Get devnet SOL from faucet: https://faucet.solana.com
- Or use: `solana airdrop 2`

#### 5. Rate Limit Errors

**Problem**: Too many requests to public RPC

**Solution**:
- Use paid RPC provider (Helius, QuickNode)
- Add rate limiting to your app
- Cache responses when possible

### Debug Mode

Enable detailed logging:

```typescript
const provider = new AnchorProvider(
  connection,
  wallet,
  { 
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
    // Enable verbose logging
    skipPreflight: false,
  }
);

// Log all transactions
provider.connection.onLogs('all', (logs) => {
  console.log('Transaction logs:', logs);
});
```

---

## Additional Resources

- **Solana Docs**: https://docs.solana.com
- **Anchor Book**: https://book.anchor-lang.com
- **Wallet Adapter**: https://github.com/solana-labs/wallet-adapter
- **Program Explorer**: https://explorer.solana.com/address/3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd?cluster=devnet

---

## Support

For questions or issues:
1. Check the program's README.md
2. Review test files in `/tests` directory
3. Open an issue on GitHub
4. Join Solana Discord

---

**Happy Building! 🚀**
