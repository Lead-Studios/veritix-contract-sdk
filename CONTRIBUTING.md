# Contributing to @veritix/contract-sdk

Thank you for helping build the VeriTix SDK! This document describes how to pick up a stub module and implement it correctly.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Implementing a Module Stub](#implementing-a-module-stub)
- [Writing Tests](#writing-tests)
- [Code Style](#code-style)
- [Submitting a Pull Request](#submitting-a-pull-request)

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| A Stellar Testnet account | [Stellar Laboratory](https://laboratory.stellar.org) |

---

## Development Setup

```bash
# 1. Fork and clone the repo
git clone https://github.com/veritix/contract-sdk.git
cd contract-sdk

# 2. Install dependencies
npm install

# 3. Copy the env example and fill in your values
cp .env.example .env

# 4. Build to verify the TypeScript compiles
npm run build

# 5. Run the existing test suite
npm test
```

---

## Project Structure

```
src/
  client.ts          ← Main VeriTixClient class
  modules/           ← One file per contract feature area
  types/index.ts     ← Shared TypeScript interfaces (do not edit lightly)
  utils/
    errors.ts        ← VeriTixError + parseSorobanError
    network.ts       ← getTestnetConfig, getMainnetConfig, getHorizonUrl
    transaction.ts   ← buildContractCall, simulateTransaction, submitTransaction
  index.ts           ← Public barrel export
tests/               ← Jest test files mirroring src/modules/
```

---

## Implementing a Module Stub

Each method in `src/modules/*.ts` currently contains a `// TODO: implement` comment and throws `new Error('not implemented')`.  Here is the standard pattern to follow when implementing one:

### 1. Implement the transaction utils first

All write operations go through three utility functions that live in `src/utils/transaction.ts`:

```
buildContractCall  →  simulateTransaction  →  submitTransaction
```

These must be completed before module write methods can work.

### 2. Implement a read method

```ts
// Example: EscrowModule.getEscrow
async getEscrow(id: bigint): Promise<EscrowRecord | null> {
  const account = await this.server.getAccount(this.config.sourceAddress);
  const tx = await buildContractCall(
    this.server,
    account,
    this.config.contractId,
    'get_escrow',
    [nativeToScVal(id, { type: 'u64' })],
    this.config.networkPassphrase,
  );
  const { transaction } = await simulateTransaction(this.server, tx);
  // Parse the ScVal return value into an EscrowRecord
  // Return null if the contract returns void / None
  ...
}
```

### 3. Implement a write method

```ts
// Example: EscrowModule.createEscrow
async createEscrow(params: CreateEscrowParams): Promise<TransactionResult> {
  if (!this.keypair) throw new Error('keypair required for write operations');
  const account = await this.server.getAccount(this.keypair.publicKey());
  const tx = await buildContractCall(...);
  const { transaction } = await simulateTransaction(this.server, tx);
  return submitTransaction(this.server, transaction, this.keypair);
}
```

### 4. Wrap errors

Catch raw RPC errors and pass them through `parseSorobanError`:

```ts
} catch (err) {
  throw parseSorobanError(err);
}
```

---

## Writing Tests

- Tests live in `tests/` and mirror `src/modules/`.
- Each stub test already exists; replace the `rejects.toThrow('not implemented')` assertion with real expectations.
- Use [Jest mocks](https://jestjs.io/docs/mock-functions) to avoid hitting the live network in unit tests.
- Integration tests (hitting Testnet) should be placed in a separate `tests/integration/` directory and skipped in CI unless `INTEGRATION=true` is set.

Run tests:

```bash
npm test               # unit tests only
npm test -- --watch    # watch mode
```

---

## Code Style

- **Prettier** handles formatting: `npm run format`
- **ESLint** handles linting: `npm run lint`
- All public API methods must have JSDoc comments with `@param`, `@returns`, and `@throws` tags.
- Prefer `bigint` for token amounts and IDs; never use `number` for amounts.
- Use `_prefix` for intentionally unused parameters (satisfies `no-unused-vars`).

---

## Submitting a Pull Request

1. Branch from `main`: `git checkout -b feat/implement-token-module`
2. Implement and test your change.
3. Run `npm run build && npm test && npm run lint` — all must pass.
4. Open a PR against `main` with a clear description of what was implemented.
5. Reference the relevant module in the PR title, e.g. `feat(token): implement mint and burn`.

---

Happy building! 🚀
