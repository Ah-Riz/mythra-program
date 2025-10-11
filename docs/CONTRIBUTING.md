# Contributing to Mythra Program

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. **Fork the repository**
2. **Clone your fork**
   ```bash
   git clone https://github.com/your-username/mythra-program.git
   cd mythra-program
   ```
3. **Install dependencies**
   ```bash
   yarn install
   ```
4. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

## Development Workflow

### Creating a Branch

```bash
# Create a feature branch
git checkout -b feature/your-feature-name

# Or a bugfix branch
git checkout -b fix/bug-description
```

### Making Changes

1. **Write code** following the project's style
2. **Add tests** for new features
3. **Update documentation** if needed
4. **Test locally**
   ```bash
   anchor build
   anchor test
   ```

### Commit Messages

Follow conventional commits format:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test changes
- `refactor`: Code refactoring
- `chore`: Build/tooling changes

**Examples:**
```
feat(tickets): add batch ticket minting
fix(refund): correct escrow calculation
docs(readme): update deployment instructions
test(events): add edge case for event creation
```

### Testing

#### Local Testing
```bash
# Run all tests
anchor test

# Run specific test file
anchor test tests/your-test.ts

# Fast iteration (skip build)
anchor test --skip-build
```

#### Devnet Testing
```bash
# Set to devnet
export SOLANA_NETWORK=devnet

# Deploy and test
./scripts/deploy.sh
anchor test --skip-local-validator --provider.cluster devnet
```

### Code Style

#### Rust (Program Code)
- Follow [Rust conventions](https://doc.rust-lang.org/1.0.0/style/)
- Use `cargo fmt` before committing
- Ensure `cargo clippy` passes

#### TypeScript (Tests)
- Use Prettier for formatting: `yarn lint:fix`
- Use descriptive variable names
- Add comments for complex logic

### Pull Request Process

1. **Update your fork**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

3. **Create Pull Request**
   - Go to the original repository
   - Click "New Pull Request"
   - Select your branch
   - Fill out the PR template

4. **PR Checklist**
   - [ ] All tests pass locally
   - [ ] Code follows style guidelines
   - [ ] Documentation updated
   - [ ] Commit messages follow conventions
   - [ ] No sensitive data (keys, secrets) included
   - [ ] PR description explains changes

### PR Review Process

- Maintainers will review your PR
- Address any requested changes
- Once approved, maintainers will merge

## What to Contribute

### Good First Issues

Look for issues labeled `good first issue`:
- Documentation improvements
- Test coverage improvements
- Bug fixes
- Code cleanup

### Feature Requests

Before working on a major feature:
1. Check existing issues
2. Create an issue to discuss
3. Wait for maintainer approval
4. Start implementation

### Bug Reports

When reporting bugs:
- Use the bug report template
- Include steps to reproduce
- Provide error messages/logs
- Specify environment (OS, versions)

## Code Review Guidelines

### For Contributors

- Be open to feedback
- Respond to review comments
- Update PR based on feedback
- Ask questions if unclear

### For Reviewers

- Be respectful and constructive
- Explain reasoning for changes
- Approve when ready
- Test changes if possible

## Documentation

Update docs when:
- Adding new features
- Changing APIs
- Fixing bugs that affect usage
- Improving setup process

Documentation files:
- `README.md` - Main project docs
- Instruction-specific READMEs
- Code comments
- Test descriptions

## Testing Requirements

### Required Tests

- **Unit tests** for new functions
- **Integration tests** for instructions
- **Edge cases** for validations
- **Error cases** for error handling

### Test Coverage

Aim for:
- 90%+ coverage for new code
- All happy paths tested
- All error paths tested
- Edge cases covered

## Security

### Reporting Security Issues

**DO NOT** open public issues for security vulnerabilities.

Instead:
1. Email maintainers privately
2. Provide detailed description
3. Include steps to reproduce
4. Wait for acknowledgment

### Security Best Practices

- Never commit private keys
- Never commit `.env` files
- Use environment variables
- Follow Solana security guidelines
- Test on devnet first

## Community

### Communication Channels

- **GitHub Issues** - Bug reports, feature requests
- **Pull Requests** - Code contributions
- **Discussions** - General questions, ideas

### Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- No harassment or discrimination

## License

By contributing, you agree that your contributions will be licensed under the ISC License.

## Questions?

If you have questions:
1. Check existing documentation
2. Search closed issues
3. Open a new issue
4. Ask in discussions

---

Thank you for contributing! 🎉
