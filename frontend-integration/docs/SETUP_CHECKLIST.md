# Frontend Integration Setup Checklist

Complete this checklist to successfully integrate Mythra Platform with your Next.js frontend.

---

## ✅ Pre-requisites

- [ ] Node.js 18+ installed
- [ ] Next.js 13+ project created
- [ ] Basic understanding of React
- [ ] Solana wallet installed (Phantom/Solflare)

---

## 📦 Installation

- [ ] Install @solana/web3.js
- [ ] Install @solana/wallet-adapter-react
- [ ] Install @solana/wallet-adapter-react-ui
- [ ] Install @solana/wallet-adapter-wallets
- [ ] Install @coral-xyz/anchor

```bash
npm install @solana/web3.js @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets @solana/wallet-adapter-base @coral-xyz/anchor
```

---

## 📁 File Setup

- [ ] Copy `lib/program.ts` to your project
- [ ] Copy `lib/providers.tsx` to your project
- [ ] Copy components to your project (optional)
- [ ] Copy IDL: `target/idl/mythra_program.json` → `lib/idl/`
- [ ] Copy types: `target/types/mythra_program.ts` → `lib/types/`

---

## ⚙️ Configuration

- [ ] Create `.env.local` file
- [ ] Add `NEXT_PUBLIC_SOLANA_NETWORK=devnet`
- [ ] Add `NEXT_PUBLIC_PROGRAM_ID=3STUXGoh2tGAcsLofsZM8seXdNH6K1AoijdNvxTCMULd`
- [ ] Add `NEXT_PUBLIC_RPC_ENDPOINT` (optional)

---

## 🎨 Layout Setup

### For App Router (Next.js 13+)

- [ ] Import `SolanaProvider` in `app/layout.tsx`
- [ ] Import wallet CSS: `@solana/wallet-adapter-react-ui/styles.css`
- [ ] Wrap children with `<SolanaProvider>`

### For Pages Router

- [ ] Import `SolanaProvider` in `pages/_app.tsx`
- [ ] Import wallet CSS
- [ ] Wrap Component with `<SolanaProvider>`

---

## 🔧 Update program.ts

- [ ] Import your IDL type
- [ ] Update `MythraProgram` type (replace `any`)
- [ ] Verify `PROGRAM_ID` is correct

```typescript
// In lib/program.ts
import { MythraProgram as MythraProgramType } from './types/mythra_program';

export type MythraProgram = MythraProgramType;
```

---

## 🧪 Testing

- [ ] Create a test page with wallet button
- [ ] Verify wallet connects successfully
- [ ] Test creating an event
- [ ] Verify transaction appears on explorer
- [ ] Test error handling

---

## 📝 Implementation Checklist

### Basic Features

- [ ] Wallet connection
- [ ] Create event functionality
- [ ] Create campaign functionality
- [ ] Contribute to campaign
- [ ] Display campaign progress

### Advanced Features

- [ ] Budget submission
- [ ] Voting interface
- [ ] Profit claiming
- [ ] Event listing
- [ ] User dashboard

---

## 🎯 Testing Workflow

1. **Wallet Connection**
   - [ ] Click wallet button
   - [ ] Select wallet (Phantom/Solflare)
   - [ ] Approve connection
   - [ ] Verify connected state

2. **Create Event**
   - [ ] Fill event form
   - [ ] Submit transaction
   - [ ] Approve in wallet
   - [ ] Verify on explorer

3. **Create Campaign**
   - [ ] Enter event ID
   - [ ] Set funding goal
   - [ ] Submit transaction
   - [ ] Verify campaign created

4. **Contribute**
   - [ ] Enter event ID and organizer
   - [ ] Set contribution amount
   - [ ] Submit transaction
   - [ ] Verify balance updated

---

## 🚀 Deployment Checklist

### Before Production

- [ ] Test on devnet thoroughly
- [ ] Handle all error cases
- [ ] Add loading states
- [ ] Add success/error notifications
- [ ] Mobile responsive design
- [ ] SEO optimization

### RPC Configuration

- [ ] Use paid RPC provider (Helius/QuickNode)
- [ ] Configure rate limiting
- [ ] Add retry logic
- [ ] Monitor performance

### Security

- [ ] Never expose private keys
- [ ] Validate all inputs
- [ ] Simulate transactions before sending
- [ ] Add transaction amount confirmations
- [ ] Implement proper error messages

---

## 📊 Performance Optimization

- [ ] Implement caching (React Query)
- [ ] Lazy load components
- [ ] Optimize images
- [ ] Code splitting
- [ ] Monitor bundle size

---

## 🐛 Common Issues Fixed

- [ ] Wallet CSS imported
- [ ] SolanaProvider wraps app
- [ ] Using `.accountsPartial()` not `.accounts()`
- [ ] Environment variables prefixed with `NEXT_PUBLIC_`
- [ ] IDL and types copied correctly

---

## ✨ Optional Enhancements

- [ ] Add toast notifications (react-hot-toast)
- [ ] Add loading skeletons
- [ ] Add transaction history
- [ ] Add user profile
- [ ] Add analytics
- [ ] Add dark mode

---

## 📚 Documentation

- [ ] Add JSDoc comments to functions
- [ ] Create user guide
- [ ] Document API endpoints
- [ ] Create deployment guide
- [ ] Add troubleshooting guide

---

## 🎉 Launch Checklist

- [ ] All tests passing
- [ ] No console errors
- [ ] Mobile tested
- [ ] Different wallets tested
- [ ] Error handling tested
- [ ] User feedback collected
- [ ] Performance optimized
- [ ] Security reviewed

---

**Once all items are checked, you're ready to launch!** 🚀

For questions, refer to:
- [FRONTEND_INTEGRATION_GUIDE.md](./FRONTEND_INTEGRATION_GUIDE.md)
- [README.md](../README.md)
- Solana Discord
