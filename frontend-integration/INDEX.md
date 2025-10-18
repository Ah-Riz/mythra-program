# Mythra Platform - Frontend Integration Index

**Complete guide and resources for building a Next.js frontend for the Mythra Platform smart contract.**

---

## 📁 Directory Structure

```
frontend-integration/
├── lib/                          # Core integration code
│   ├── program.ts               # ⭐ Main program client & utilities
│   └── providers.tsx            # ⭐ Wallet provider setup
│
├── components/                   # Ready-to-use React components
│   ├── WalletButton.tsx         # Wallet connection UI
│   ├── CreateEventForm.tsx      # Event creation form
│   └── ContributeToCampaign.tsx # Campaign contribution UI
│
├── docs/                         # Complete documentation
│   ├── FRONTEND_INTEGRATION_GUIDE.md  # ⭐ Full API reference
│   └── SETUP_CHECKLIST.md       # Step-by-step setup
│
├── examples/                     # (Future: Code examples)
├── package.json.template         # Required dependencies
├── README.md                     # ⭐ Quick start guide
└── INDEX.md                      # This file
```

---

## 🚀 Quick Links

### Essential Files
1. **[README.md](./README.md)** - Start here! Quick setup guide
2. **[FRONTEND_INTEGRATION_GUIDE.md](./docs/FRONTEND_INTEGRATION_GUIDE.md)** - Complete API documentation
3. **[SETUP_CHECKLIST.md](./docs/SETUP_CHECKLIST.md)** - Step-by-step checklist
4. **[lib/program.ts](./lib/program.ts)** - Core client implementation
5. **[lib/providers.tsx](./lib/providers.tsx)** - Wallet provider

### Components
- **[WalletButton.tsx](./components/WalletButton.tsx)** - Wallet connection
- **[CreateEventForm.tsx](./components/CreateEventForm.tsx)** - Create events
- **[ContributeToCampaign.tsx](./components/ContributeToCampaign.tsx)** - Contribute to campaigns

---

## 📖 Documentation Guide

### For New Developers

1. **Read [README.md](./README.md)** first
   - Quick setup instructions
   - Basic concepts
   - Example usage

2. **Follow [SETUP_CHECKLIST.md](./docs/SETUP_CHECKLIST.md)**
   - Step-by-step setup
   - Testing workflow
   - Common issues

3. **Reference [FRONTEND_INTEGRATION_GUIDE.md](./docs/FRONTEND_INTEGRATION_GUIDE.md)**
   - Complete API reference
   - All available methods
   - Best practices
   - Troubleshooting

### For Experienced Developers

- Jump to **[lib/program.ts](./lib/program.ts)** to see the implementation
- Review **MythraClient** class for all available methods
- Copy components and customize as needed

---

## 🎯 What You Can Build

With this integration, you can build:

### ✅ Event Management
- Create events
- Update event details
- Close events
- List all events

### ✅ Crowdfunding
- Create campaigns
- Accept contributions
- Display campaign progress
- Finalize campaigns (Funded/Failed)
- Process refunds

### ✅ Budget & Voting
- Submit budget proposals
- Display budget details
- Vote on budgets (proportional voting)
- Finalize voting results
- Release milestone funds

### ✅ Profit Distribution
- Calculate profit distribution (60/35/5)
- Allow backers to claim profits
- Allow organizer to claim profits
- Display claimable amounts

### ✅ User Dashboard
- Show user's events
- Show user's contributions
- Show user's voting history
- Show claimable profits

---

## 🔑 Key Information

### Program Details
```
Program ID:  3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd
Network:     Devnet (for testing)
Explorer:    https://explorer.solana.com/address/3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd?cluster=devnet
```

### Environment Variables
```env
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_PROGRAM_ID=3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd
NEXT_PUBLIC_RPC_ENDPOINT=https://api.devnet.solana.com
```

### Required Dependencies
```json
{
  "@solana/web3.js": "^1.95.0",
  "@solana/wallet-adapter-react": "^0.15.35",
  "@solana/wallet-adapter-react-ui": "^0.9.35",
  "@solana/wallet-adapter-wallets": "^0.19.32",
  "@coral-xyz/anchor": "^0.30.0"
}
```

---

## 📚 MythraClient Methods

### Events
- `createEvent(params)` - Create new event
- `getEvent(organizer, eventId)` - Fetch event data

### Campaigns
- `createCampaign(params)` - Create crowdfunding campaign
- `contribute(params)` - Contribute SOL to campaign
- `getCampaign(organizer, eventId)` - Fetch campaign data
- `getCampaignContributions(organizer, eventId)` - Get all contributors
- `getUserContribution(organizer, eventId, contributor)` - Get specific contribution

### Budget & Voting
- `submitBudget(params)` - Submit budget proposal
- `voteOnBudget(params)` - Vote on budget (approve/reject)

### Profit Distribution
- `claimBackerProfit(params)` - Claim backer's proportional profit
- `claimOrganizerProfit(params)` - Claim organizer's 35% profit

### PDA Helpers
- `getEventPDA(organizer, eventId)` - Derive event address
- `getCampaignPDA(eventPda)` - Derive campaign address
- `getContributionPDA(campaignPda, contributor)` - Derive contribution address
- `getCampaignEscrowPDA(campaignPda)` - Derive escrow address
- `getBudgetPDA(campaignPda)` - Derive budget address

### Utilities
- `lamportsToSol(lamports)` - Convert lamports to SOL
- `solToLamports(sol)` - Convert SOL to lamports
- `shortenAddress(address)` - Format address for display

---

## 🛠️ Development Workflow

### 1. Setup (5-10 minutes)
```bash
# Create Next.js app
npx create-next-app@latest mythra-frontend

# Install dependencies
npm install @solana/web3.js @solana/wallet-adapter-react @coral-xyz/anchor

# Copy integration files
cp -r frontend-integration/lib mythra-frontend/
cp -r frontend-integration/components mythra-frontend/
```

### 2. Configure (2-3 minutes)
```bash
# Copy IDL and types
cp target/idl/mythra_program.json mythra-frontend/lib/idl/
cp target/types/mythra_program.ts mythra-frontend/lib/types/

# Create .env.local
echo "NEXT_PUBLIC_SOLANA_NETWORK=devnet" > mythra-frontend/.env.local
```

### 3. Build (Ongoing)
- Import components or build custom UI
- Use MythraClient for all program interactions
- Handle errors and loading states
- Test on devnet before production

---

## 🎨 UI Frameworks

These components work with:
- ✅ **Tailwind CSS** (used in examples)
- ✅ **Material-UI** (mui)
- ✅ **Chakra UI**
- ✅ **Ant Design**
- ✅ **shadcn/ui**
- ✅ Any CSS framework

Simply adjust the `className` props or styles as needed.

---

## 🔧 Customization

### Using Your Own Components

Don't want to use the provided components? No problem!

Just use the `MythraClient` class directly:

```typescript
import { MythraClient } from '@/lib/program';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

export function MyCustomComponent() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const client = new MythraClient(connection, wallet, IDL);
  
  // Now use any method
  const handleAction = async () => {
    await client.createEvent({...});
  };
}
```

### Custom Styling

```typescript
// Replace Tailwind classes with your own
<button className="your-custom-button-class">
  Create Event
</button>
```

---

## 📊 Feature Roadmap

### Provided Now
- ✅ Wallet connection
- ✅ Event creation
- ✅ Campaign creation
- ✅ Contribution flow
- ✅ All program methods

### Build Yourself
- ⬜ Event listing/discovery
- ⬜ Campaign browsing
- ⬜ User dashboard
- ⬜ Voting interface
- ⬜ Profit claiming UI
- ⬜ Admin panel
- ⬜ Analytics dashboard

All the building blocks are provided in `lib/program.ts`!

---

## 🎓 Learning Resources

### Solana
- **Docs**: https://docs.solana.com
- **Cookbook**: https://solanacookbook.com
- **Discord**: https://discord.gg/solana

### Wallet Adapter
- **GitHub**: https://github.com/solana-labs/wallet-adapter
- **Docs**: https://github.com/solana-labs/wallet-adapter/tree/master/packages

### Anchor
- **Book**: https://book.anchor-lang.com
- **Discord**: https://discord.gg/anchor

### Next.js
- **Docs**: https://nextjs.org/docs
- **Examples**: https://github.com/vercel/next.js/tree/canary/examples

---

## 🐛 Getting Help

### Check These First
1. **[Troubleshooting Section](./docs/FRONTEND_INTEGRATION_GUIDE.md#troubleshooting)** in the guide
2. **[Common Issues](./docs/SETUP_CHECKLIST.md#-common-issues-fixed)** in the checklist
3. **Console Logs** - Most errors have helpful messages
4. **Explorer** - Check transaction details

### Still Stuck?
- Review test files in `/tests` directory for working examples
- Check if program is deployed: [View on Explorer](https://explorer.solana.com/address/3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd?cluster=devnet)
- Verify you're on devnet
- Ensure wallet has SOL (use faucet)

---

## ✨ Best Practices

### 1. Error Handling
Always wrap program calls in try-catch:
```typescript
try {
  await client.createEvent({...});
} catch (error) {
  console.error(error);
  // Show user-friendly message
}
```

### 2. Loading States
Provide feedback during transactions:
```typescript
const [loading, setLoading] = useState(false);
setLoading(true);
// ... transaction
setLoading(false);
```

### 3. Transaction Confirmation
Wait for confirmation before updating UI:
```typescript
const signature = await client.createEvent({...});
await connection.confirmTransaction(signature);
```

### 4. Caching
Use React Query or SWR for data fetching:
```typescript
const { data: campaign } = useQuery({
  queryKey: ['campaign', organizer, eventId],
  queryFn: () => client.getCampaign(organizer, eventId),
});
```

---

## 🚀 Production Checklist

Before deploying to production:

- [ ] Test all features on devnet
- [ ] Use paid RPC provider (Helius/QuickNode)
- [ ] Add proper error handling
- [ ] Implement loading states
- [ ] Add success notifications
- [ ] Mobile responsive design
- [ ] Security audit
- [ ] Performance optimization
- [ ] SEO optimization
- [ ] Analytics setup

---

## 📈 Next Steps

1. ✅ **Setup** - Follow [README.md](./README.md)
2. ✅ **Build** - Create your UI using the components
3. ✅ **Test** - Verify everything works on devnet
4. ✅ **Deploy** - Launch your frontend
5. ✅ **Monitor** - Track usage and performance

---

## 🎉 You're Ready!

Everything you need is in this directory:
- ✅ Core program client
- ✅ Wallet integration
- ✅ Component examples
- ✅ Complete documentation
- ✅ Setup checklists

**Start building your Mythra Platform frontend now!** 🚀

For questions or issues, refer to the documentation or join the Solana Discord.

---

**Built for developers, by developers.** ❤️
