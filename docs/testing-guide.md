# Testing Guide

This guide explains how to write and run both **unit tests** (fully mocked,
no network required) and **integration tests** (live Stellar Testnet) for the
`@veritix/contract-sdk`.

---

## Table of Contents

- [Test structure](#test-structure)
- [Unit tests](#unit-tests)
  - [Mock helpers](#mock-helpers)
  - [Mocking Soroban RPC responses](#mocking-soroban-rpc-responses)
  - [Mocking `buildContractCall`](#mocking-buildcontractcall)
  - [Writing a new unit test](#writing-a-new-unit-test)
- [Integration tests](#integration-tests)
  - [Required environment variables](#required-environment-variables)
  - [Funding test accounts with Friendbot](#funding-test-accounts-with-friendbot)
  - [XDR fixture pattern](#xdr-fixture-pattern)
  - [Running integration tests](#running-integration-tests)
- [Coverage thresholds](#coverage-thresholds)
- [Running tests](#running-tests)

---

## Test structure

```
tests/
├── helpers/
│   ├── mocks.ts          # createMockClient / createMockServer / createMockKeypair
│   └── env.ts            # requireEnv() — safe env-var loader for integration tests
├── fixtures/
│   ├── escrow.xdr.ts     # Captured Soroban XDR responses for escrow tests
│   └── dispute.xdr.ts    # Captured Soroban XDR responses for dispute tests
├── integration/
│   ├── dispute-flow.integration.test.ts
│   └── ticket-purchase.integration.test.ts
├── utils/
│   ├── requestCache.test.ts
│   ├── transaction.test.ts
│   └── …
└── *.test.ts             # Module-level unit tests (token, escrow, dispute, …)
```

Unit tests live alongside the source they exercise or in `tests/`.
Integration tests live under `tests/integration/` and always have the suffix
`.integration.test.ts`.

---

## Unit tests

Unit tests run entirely in-process with Jest.  **No real network calls are
made.**  All Soroban RPC interactions are replaced with `jest.fn()` mocks or
`jest.spyOn()` intercepts.

### Mock helpers

`tests/helpers/mocks.ts` provides three factory functions:

```ts
import {
  createMockClient,
  createMockServer,
  createMockKeypair,
} from '../helpers/mocks';
```

#### `createMockServer(overrides?)`

Returns a plain object that satisfies the `SorobanRpc.Server` interface, with
every method pre-wired to sensible default resolved values.

```ts
const server = createMockServer({
  // Override only the methods you care about:
  simulateTransaction: jest.fn().mockResolvedValue({
    result: { retval: nativeToScVal(42n, { type: 'i128' }) },
    latestLedger: 1000,
    minResourceFee: '100',
    transactionData: '',
    events: [],
  }),
});
```

Default implementations provided:

| Method | Default return value |
|---|---|
| `getLatestLedger` | `{ sequence: 1000 }` |
| `simulateTransaction` | `{ result: null }` |
| `sendTransaction` | `{ hash: 'mock-hash', status: 'PENDING' }` |
| `getTransaction` | `{ status: 'SUCCESS', ledger: 1000 }` |

#### `createMockClient(overrides?)`

Wraps `createMockServer` and injects the mock server into a fully-constructed
`VeriTixClient`.  The client is pre-marked as connected so you can call module
methods directly without calling `client.connect()`.

```ts
const client = createMockClient({
  simulateTransaction: jest.fn().mockResolvedValue(/* … */),
});

const balance = await client.token.balance('GABC…');
```

#### `createMockKeypair()`

Returns a deterministic `Keypair` (same secret key every time) so tests can
assert on the public key without hard-coding it.

```ts
const keypair = createMockKeypair();
console.log(keypair.publicKey()); // always the same Gxxx… address
```

---

### Mocking Soroban RPC responses

The key integration point between the SDK and the network is
`server.simulateTransaction`.  Mock it with `jest.fn()` returning a
well-shaped success or error response.

#### Success response shape

```ts
import { nativeToScVal } from '@stellar/stellar-sdk';

function simSuccess(retval: ReturnType<typeof nativeToScVal>) {
  return {
    result: { retval },
    latestLedger: 1000,
    minResourceFee: '100',
    transactionData: '',
    events: [],
  };
}
```

#### Error response shape

```ts
function simError(errorMessage: string) {
  return {
    error: errorMessage,
    latestLedger: 1000,
    events: [],
  };
}
```

#### Example — assert balance returns correct value

```ts
import { nativeToScVal } from '@stellar/stellar-sdk';
import { createMockClient } from '../helpers/mocks';

describe('TokenModule.balance', () => {
  it('returns the balance reported by the contract', async () => {
    const mockSimulate = jest
      .fn()
      .mockResolvedValue(simSuccess(nativeToScVal(5_000_000n, { type: 'i128' })));

    const client = createMockClient({ simulateTransaction: mockSimulate });

    const balance = await client.token.balance('GABC…');

    expect(balance).toBe(5_000_000n);
    expect(mockSimulate).toHaveBeenCalledTimes(1);
  });
});
```

#### Example — assert error is mapped to `VeriTixError`

```ts
import { VeriTixError } from '../../src/utils/errors';
import { createMockClient } from '../helpers/mocks';

it('throws VeriTixError when simulateTransaction returns an error', async () => {
  const mockSimulate = jest.fn().mockResolvedValue(simError('ContractError(1)'));

  const client = createMockClient({ simulateTransaction: mockSimulate });

  await expect(client.escrow.getEscrow(1n)).rejects.toBeInstanceOf(VeriTixError);
});
```

---

### Mocking `buildContractCall`

Some tests need to prevent `buildContractCall` from touching a real account
object.  Use `jest.mock` at the top of the test file:

```ts
jest.mock('../../src/utils/transaction', () => ({
  ...jest.requireActual('../../src/utils/transaction'),
  buildContractCall: jest.fn().mockResolvedValue({}),
}));
```

This replaces only `buildContractCall` while keeping all other exports
(e.g. `simulateTransaction`, `submitTransaction`) real.

---

### Writing a new unit test

1. Create `tests/<module>.test.ts` (or add to an existing file).
2. Import the factories from `tests/helpers/mocks.ts`.
3. Mock `simulateTransaction` (and optionally `sendTransaction` /
   `getTransaction`) to return the values your test needs.
4. Call the SDK method under test.
5. Assert on the return value **and** on `mockSimulate.mock.calls` to confirm
   the correct RPC arguments were sent.

```ts
import { nativeToScVal } from '@stellar/stellar-sdk';
import { createMockClient } from '../helpers/mocks';

// Build a success response helper inline or import from a shared fixture file
function simSuccess(retval: ReturnType<typeof nativeToScVal>) {
  return {
    result: { retval },
    latestLedger: 1000,
    minResourceFee: '100',
    transactionData: '',
    events: [],
  };
}

describe('MyNewModule.myMethod', () => {
  it('calls the contract method with the correct args and returns the parsed result', async () => {
    const mockSimulate = jest
      .fn()
      .mockResolvedValue(simSuccess(nativeToScVal(true)));

    const client = createMockClient({ simulateTransaction: mockSimulate });

    const result = await client.myModule.myMethod('some-arg');

    expect(result).toBe(true);
    expect(mockSimulate).toHaveBeenCalledTimes(1);
  });
});
```

---

## Integration tests

Integration tests exercise the full SDK against a live Stellar **Testnet**
deployment.  They require funded accounts and a deployed contract — they must
never be run against Mainnet.

### Required environment variables

Copy `.env.example` to `.env` and fill in all values before running:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `CONTRACT_ID` | Bech32-encoded Soroban contract ID deployed on Testnet |
| `STELLAR_SECRET_KEY` | Secret key (`S…`) for the buyer / claimant account |
| `RESOLVER_SECRET_KEY` | Secret key for the designated dispute resolver |
| `ORGANIZER_SECRET_KEY` | Secret key for the event organizer (escrow beneficiary) |

> **Security:** Never commit real secret keys to source control.  The `.gitignore` already excludes `.env`.

### Funding test accounts with Friendbot

Before running integration tests for the first time, fund each test account
using the Stellar Testnet Friendbot:

```bash
# Replace GXXX… with each account's public key
curl "https://friendbot.stellar.org?addr=GXXX…"
```

Or programmatically inside a `beforeAll`:

```ts
import fetch from 'node-fetch'; // or the built-in fetch in Node 18+

async function fundAccount(publicKey: string): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
  if (!res.ok) throw new Error(`Friendbot failed for ${publicKey}: ${await res.text()}`);
}

beforeAll(async () => {
  await fundAccount(keypair.publicKey());
});
```

Each Friendbot request gives the account **10 000 XLM** on Testnet, which is
more than enough for a full test suite run.

### XDR fixture pattern

Replaying captured Soroban responses keeps unit tests fast and deterministic
without needing a live network.  Use this pattern:

**Step 1 — Capture a real response** (run once against Testnet):

```ts
const raw = await server.simulateTransaction(tx);
console.log(JSON.stringify(raw, null, 2));
```

**Step 2 — Save it as a fixture** in `tests/fixtures/<module>.xdr.ts`:

```ts
// tests/fixtures/escrow.xdr.ts
export const GET_ESCROW_SUCCESS = {
  result: {
    retval: '…base64-encoded-xdr…',
  },
  latestLedger: 1234567,
  minResourceFee: '100',
  transactionData: '…',
  events: [],
};
```

**Step 3 — Use the fixture in a unit test**:

```ts
import { GET_ESCROW_SUCCESS } from '../fixtures/escrow.xdr';

const mockSimulate = jest.fn().mockResolvedValue(GET_ESCROW_SUCCESS);
const client = createMockClient({ simulateTransaction: mockSimulate });
```

This approach lets the entire test suite run offline while preserving
realistic XDR payloads.

### Skipping gracefully when env vars are missing

Each integration test file should skip its suite when the required env vars
are not set, so CI passes even without a configured Testnet environment:

```ts
import { requireEnv } from '../helpers/env';

function loadEnv() {
  try {
    return {
      contractId: requireEnv('CONTRACT_ID'),
      secret: requireEnv('STELLAR_SECRET_KEY'),
    };
  } catch {
    return null; // env not configured — skip tests
  }
}

describe('MyModule — integration', () => {
  const env = loadEnv();

  if (!env) {
    it.skip('skipped — env vars not set', () => {/* empty */});
    return;
  }

  // … your tests …
});
```

### Running integration tests

```bash
# Unit tests only (default CI run)
npm test

# Integration tests only (requires .env)
npm run test:integration
```

> Integration tests have a generous Jest timeout of **120 000 ms** (2 minutes)
> because Testnet transactions can take several seconds to confirm.  Set
> `jest.setTimeout(120_000)` inside the `describe` block.

---

## Coverage thresholds

The project targets the following Jest coverage thresholds (configured in
`jest.config.ts`):

| Metric | Target |
|---|---|
| Statements | ≥ 80 % |
| Branches | ≥ 75 % |
| Functions | ≥ 80 % |
| Lines | ≥ 80 % |

When adding a new module, aim to cover:

- Every public method with at least one happy-path test.
- Every thrown `VeriTixError` code with a test that triggers it.
- Edge cases: empty arrays, `0n` amounts, read-only client writes, invalid
  addresses.

Check coverage locally:

```bash
npm test -- --coverage
```

---

## Running tests

```bash
# Run all unit tests
npm test

# Run tests matching a pattern
npm test -- --testPathPattern=token

# Run a single file
npx jest tests/token.test.ts

# Run with coverage report
npm test -- --coverage

# Run integration tests (requires .env)
npm run test:integration

# Watch mode during development
npm test -- --watch
```
