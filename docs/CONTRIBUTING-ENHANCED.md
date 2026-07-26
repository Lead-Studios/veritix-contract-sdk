# Enhanced Contribution Guidelines

## Module Conventions

All SDK modules follow a strict structure for consistency:

```
src/modules/mymodule/
├── mymodule.types.ts      # Module-specific types and interfaces
├── mymodule.schemas.ts     # Zod validation schemas
├── mymodule.service.ts     # Business logic and contract calls
└── mymodule.ts             # Public API exports (index pattern)
```

## Code Patterns

### Read Methods
- Must be `async`
- Should return `null` if entity not found
- Wrap errors with `parseSorobanError(err)`

### Write Methods
- Must check for `this.keypair` before signing
- Must call `simulateTransaction()` before `submitTransaction()`
- Return `TransactionResult` with tx hash and ledger

### Error Handling
```ts
try {
  return await this.submit(...);
} catch (err) {
  throw parseSorobanError(err);
}
```

## PR Checklist

Before submitting a pull request:

- [ ] All tests pass: `npm test`
- [ ] Code formatted: `npm run format`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] CHANGELOG.md updated (if src/ changed)
- [ ] JSDoc added to all public methods
- [ ] No console.log or debugger statements
- [ ] No hardcoded test keys or credentials

## Security Review

PRs touching authentication, signing, or secret handling require:

- [ ] No secret keys hardcoded anywhere
- [ ] No secrets logged to console
- [ ] KeyPairs properly redacted in toString/toJSON
- [ ] Sensitive config validated at initialization
