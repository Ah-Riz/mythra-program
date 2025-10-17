# Phase 2 Testing Guide

## ✅ Test Files Created

### Phase 1: Crowdfunding Core
1. **create-campaign.ts** - Campaign creation tests
2. **contribute.ts** - Contribution flow tests  
3. **finalize-campaign.ts** - Campaign finalization tests
4. **claim-refund.ts** - Refund mechanism tests

### Phase 2: Budget & Voting
5. **submit-budget.ts** - Budget submission tests
6. **vote-on-budget.ts** - Voting mechanism tests
7. **finalize-budget-vote.ts** - Vote finalization tests
8. **crowdfunding-complete-flow.ts** - END-TO-END FULL FLOW TEST

---

## 🚀 Running Tests on Localnet

### Step 1: Start Local Validator

**Terminal 1:**
```bash
cd /Users/ahmadrizkimaulana/Projects/web3/mythra/mythra-program
solana-test-validator
```

Keep this terminal running!

---

### Step 2: Run Tests

**Terminal 2:**

#### Option A: Run All Crowdfunding Tests
```bash
cd /Users/ahmadrizkimaulana/Projects/web3/mythra/mythra-program

ANCHOR_PROVIDER_URL=http://localhost:8899 \
ANCHOR_WALLET=~/.config/solana/id.json \
yarn ts-mocha -p ./tsconfig.json -t 1000000 \
  tests/create-campaign.ts \
  tests/contribute.ts \
  tests/finalize-campaign.ts \
  tests/claim-refund.ts \
  tests/submit-budget.ts \
  tests/vote-on-budget.ts \
  tests/finalize-budget-vote.ts
```

#### Option B: Run Complete Flow Test (Recommended)
```bash
ANCHOR_PROVIDER_URL=http://localhost:8899 \
ANCHOR_WALLET=~/.config/solana/id.json \
yarn ts-mocha -p ./tsconfig.json -t 1000000 \
  tests/crowdfunding-complete-flow.ts
```

#### Option C: Run Individual Test File
```bash
# Test budget submission
ANCHOR_PROVIDER_URL=http://localhost:8899 \
ANCHOR_WALLET=~/.config/solana/id.json \
yarn ts-mocha -p ./tsconfig.json -t 1000000 \
  tests/submit-budget.ts

# Test voting
ANCHOR_PROVIDER_URL=http://localhost:8899 \
ANCHOR_WALLET=~/.config/solana/id.json \
yarn ts-mocha -p ./tsconfig.json -t 1000000 \
  tests/vote-on-budget.ts
```

---

## 📋 Test Coverage

### submit-budget.ts
- ✅ Valid budget submission with 3 milestones
- ✅ Budget exceeds campaign funds (should fail)
- ✅ Milestone percentages don't sum to 100% (should fail)

### vote-on-budget.ts
- ✅ Contributor votes YES
- ✅ Contributor votes NO
- ✅ Linear voting power (1 SOL = 1 vote)
- ✅ Double vote prevention
- ✅ Non-contributor cannot vote

### finalize-budget-vote.ts
- ✅ Approved budget (votes_for > votes_against)
- ✅ Rejected budget (votes_against > votes_for)
- ✅ Cannot finalize before voting period ends

### crowdfunding-complete-flow.ts
- ✅ **Full end-to-end flow:**
  1. Create event
  2. Create campaign
  3. 3 backers contribute (total 16 SOL)
  4. Finalize campaign as FUNDED
  5. Organizer submits budget (12 SOL)
  6. Backers vote (2 YES, 1 NO → APPROVED)
  7. Finalize budget vote
  8. Release milestone 1 (50% = 6 SOL)
  9. Verify all state updates

---

## 🐛 Troubleshooting

### Error: "fetch failed"
**Problem:** Local validator not running  
**Solution:** Start `solana-test-validator` in Terminal 1

### Error: "Account not found"
**Problem:** Need to rebuild after code changes  
**Solution:** 
```bash
anchor build
```

### Error: "Timeout"
**Problem:** Test taking too long  
**Solution:** Already set to 1000000ms timeout (16 minutes)

### Tests pass but some fail
**Problem:** Timing issues with milestone unlocks  
**Solution:** Check `unlockDate` in test - may need longer delays

---

## 🎯 Expected Results

### All Tests Passing:
```
submit_budget
  ✔ Submits a valid budget with 3 milestones
  ✔ Fails if budget exceeds campaign funds
  ✔ Fails if milestone percentages don't sum to 100%

vote_on_budget
  ✔ Contributor votes YES on budget
  ✔ Contributor votes NO on budget
  ✔ Third contributor votes YES (majority achieved)
  ✔ Fails if contributor tries to vote twice
  ✔ Fails if non-contributor tries to vote

finalize_budget_vote
  ✔ Finalizes approved budget (votes_for > votes_against)
  ✔ Finalizes rejected budget (votes_against > votes_for)
  ✔ Fails if voting period hasn't ended yet

Crowdfunding Complete Flow
  ✔ Complete crowdfunding flow: Campaign → Budget → Vote → Milestone Release

✅ 14 passing tests
```

---

## 📊 What Gets Tested

### State Management
- Campaign creation and funding
- Budget submission with milestones
- Vote tallying (linear voting power)
- Milestone release tracking
- Escrow fund transfers

### Business Logic
- Goal-based campaign finalization
- Time-limited voting (3 days)
- Simple majority approval (votes_for > votes_against)
- Milestone percentage validation (must sum to 100%)
- Budget cannot exceed raised funds

### Security
- Only contributors can vote
- One vote per contributor
- Only organizer can submit budget
- Only organizer can release milestones
- Milestones can't be released twice
- Milestones only unlock at specified times

### Edge Cases
- Campaign fails (refunds available)
- Budget rejected (can revise)
- Voting period enforcement
- Multiple contributors with different voting power

---

## 🎉 Success Criteria

All Phase 1 + Phase 2 features are considered working if:

1. ✅ Campaigns can be created and funded
2. ✅ Multiple contributors can participate
3. ✅ Campaigns finalize correctly (funded/failed)
4. ✅ Budgets can be submitted with valid milestones
5. ✅ Contributors can vote with proportional power
6. ✅ Votes finalize after time period
7. ✅ Milestones release funds correctly
8. ✅ All escrow transfers work
9. ✅ All error cases are handled
10. ✅ Complete flow test passes

---

## 📝 Notes

- **Voting Period**: Set to 3 days in production, but tests may use shorter periods
- **Milestone Unlock**: In tests, unlock times are set to seconds for faster testing
- **Gas Costs**: Tests automatically handle transaction fees
- **Escrow Safety**: All funds held in PDA until released

---

## 🔄 Next Steps After Testing

Once all tests pass:

1. **Deploy to Devnet** - Test with real network conditions
2. **Create Frontend** - Build UI for campaign creation and voting
3. **Phase 3** - Integrate with ticket system
4. **Phase 4** - Implement profit distribution
5. **Security Audit** - Professional review before mainnet

---

**Built with Anchor Framework on Solana** ⚡
