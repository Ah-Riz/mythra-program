# Security Policy

## Sensitive Data Protection

### Files That Should NEVER Be Committed

The following files contain sensitive information and are excluded via `.gitignore`:

#### 🔑 Keypairs
- `*.json` (with exceptions for package.json, tsconfig.json, etc.)
- `.test-keypairs/`
- `id.json`
- `target/deploy/*-keypair.json`

#### 🔐 Environment Variables
- `.env`
- `.env.local`
- `.env.*.local`

#### 📝 Logs
- `*.log`
- `devnet-test-output.log`
- `devnet-test-run.log`

### Before Committing - Checklist

Run this checklist before every commit:

```bash
# 1. Check for sensitive files
git status

# 2. Verify .env is not staged
git diff --cached | grep -i "\.env"

# 3. Check for keypairs
find . -name "*.json" -type f | grep -v node_modules | grep -v package.json | grep -v tsconfig.json | grep -v Cargo.lock

# 4. Review all changes
git diff --cached
```

### Emergency: Committed Sensitive Data

If you accidentally committed sensitive data:

#### Option 1: Revert Commit (if not pushed)
```bash
git reset --soft HEAD~1
git reset HEAD .env  # or the sensitive file
git commit -m "your message"
```

#### Option 2: Remove from History (if pushed)
```bash
# Install BFG Repo-Cleaner
brew install bfg  # macOS
# or download from: https://rtyley.github.io/bfg-repo-cleaner/

# Remove sensitive file from history
bfg --delete-files .env
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (coordinate with team first!)
git push origin --force --all
```

#### Option 3: Rotate Compromised Credentials

If credentials were exposed:
1. **Immediately generate new wallet keypair**
   ```bash
   solana-keygen new -o ~/.config/solana/new-id.json
   ```
2. **Transfer funds** from old wallet to new
3. **Update all deployments** with new authority
4. **Revoke compromised credentials**

## Wallet Security

### Development Wallets

For local development:
```bash
# Create a dev-only wallet
solana-keygen new -o ~/.config/solana/dev-id.json

# Use it
export WALLET_PATH=~/.config/solana/dev-id.json
```

**Never** use production wallets for development!

### Production Wallets

For mainnet:
- ✅ Use hardware wallet (Ledger)
- ✅ Enable multi-sig for critical operations
- ✅ Store backup phrase in secure location (not digital)
- ✅ Use separate wallet for upgrade authority
- ✅ Regular security audits

## Program Security

### Before Mainnet Deployment

Required steps:

1. **Security Audit**
   - Hire professional auditors
   - Review Anchor best practices
   - Check for common vulnerabilities

2. **Testing**
   - 100% test coverage
   - Fuzzing tests
   - Stress testing on devnet

3. **Upgrade Authority**
   - Set to multi-sig
   - Document upgrade process
   - Have emergency procedures

4. **Program Verification**
   - Verify on Solana Explorer
   - Publish source code
   - Document program operations

### Upgrade Authority Management

```bash
# Check current authority
solana program show <PROGRAM_ID>

# Set multi-sig authority (recommended)
solana program set-upgrade-authority <PROGRAM_ID> --new-upgrade-authority <MULTISIG_ADDRESS>

# Revoke upgrade authority (irreversible!)
solana program set-upgrade-authority <PROGRAM_ID> --final
```

## RPC Security

### Using Paid RPC Providers

When using paid providers:

```bash
# Store API keys in .env
HELIUS_API_KEY=your_key_here
QUICKNODE_ENDPOINT=your_endpoint_here

# Never hardcode in source
# ❌ Bad
const rpc = "https://api.helius-rpc.com/?api-key=abc123"

# ✅ Good
const rpc = process.env.HELIUS_API_KEY 
  ? `https://api.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  : "https://api.devnet.solana.com"
```

### Rate Limiting

Implement rate limiting for public endpoints:
- Use retry logic with exponential backoff
- Implement request queuing
- Monitor RPC usage

## Smart Contract Security

### Common Vulnerabilities

1. **Arithmetic Overflow**
   - Use checked math operations
   - Validate numeric inputs

2. **Unauthorized Access**
   - Check signer constraints
   - Validate account ownership

3. **Account Confusion**
   - Verify PDA derivation
   - Check account types

4. **Reentrancy**
   - Follow checks-effects-interactions
   - Use proper locks

### Anchor Security Features

- ✅ `#[account]` constraints
- ✅ `has_one` for ownership checks
- ✅ `constraint` for custom validation
- ✅ Type safety with Rust
- ✅ Automatic account validation

## Reporting Security Issues

### Do NOT Create Public Issues

If you discover a security vulnerability:

1. **Email maintainers** privately at [security@example.com]
2. **Provide details**:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)
3. **Wait for response** before public disclosure
4. **Coordinated disclosure** after fix is deployed

### Bug Bounty (if applicable)

- Critical: $X,XXX
- High: $X,XXX
- Medium: $XXX
- Low: $XX

Contact [security@example.com] for details.

## Security Best Practices

### For Developers

- [ ] Use `.env` for all sensitive data
- [ ] Never commit keypairs or secrets
- [ ] Review `.gitignore` regularly
- [ ] Use devnet for testing
- [ ] Follow Anchor best practices
- [ ] Keep dependencies updated
- [ ] Use `cargo audit` for Rust deps
- [ ] Use `yarn audit` for JS deps

### For Deployment

- [ ] Test on devnet first
- [ ] Verify program hash
- [ ] Set proper upgrade authority
- [ ] Document deployment process
- [ ] Have rollback plan
- [ ] Monitor program health
- [ ] Set up alerts

### For Operations

- [ ] Regular security audits
- [ ] Monitor transactions
- [ ] Track account changes
- [ ] Log access attempts
- [ ] Review permissions
- [ ] Update dependencies
- [ ] Backup critical data

## Compliance

### Data Protection

- No personal data stored on-chain
- Metadata URIs should use IPFS or decentralized storage
- Follow local regulations (GDPR, CCPA, etc.)

### Financial Regulations

- Consult legal counsel for token operations
- Follow AML/KYC requirements if applicable
- Understand local securities laws

## Resources

- [Solana Security Best Practices](https://docs.solana.com/developing/programming-model/security)
- [Anchor Security](https://book.anchor-lang.com/anchor_references/security.html)
- [Rust Security](https://anssi-fr.github.io/rust-guide/)
- [OWASP Smart Contract Top 10](https://owasp.org/www-project-smart-contract-top-10/)

## Updates

This security policy is reviewed and updated regularly. Last updated: [Date]

---

**Stay secure! 🔒**
