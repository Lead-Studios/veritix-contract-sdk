# Testing Guide

This guide explains how to write unit tests (with mocked RPC) and integration tests (against
Stellar Testnet) for `@veritix/contract-sdk`.  Follow these conventions when contributing new
module methods or bug fixes.

---

## Table of Contents

- [Quick Reference](#quick-reference)
- [Unit Tests — Mocked RPC](#unit-tests--mocked-rpc)
  - [createMockClient](#createmockclient)
  - [createMockServer](#createmockserver)
  - [createMockKeypair](#createmockkeypair)
  - [Mocking Soroban RPC responses with jest.spyOn](#mocking-soroban-rpc-responses-with-jestspyon)
  - [Testing read methods](#testing-read-methods)
  - [Testing write methods](#testing-write-methods)
- [Integration Tests — Testnet](#integration-tests--testnet)
  - [Required environment variables](#required-environment-variables)
  - [Funding test accounts with Friendbot](#funding-test-accounts-with-friendbot)
  - [Running integration tests](#running-integration-tests)
- [XDR Fixture Pattern](#xdr-fixture-pattern)
  - [Capturing a response](#capturing-a-response)
  - [Replaying a fixture](#replaying-a-fixture)
- [Coverage Thresholds](#coverage-thresholds)
- [Checklist for New Module Methods](#checklist-for-new-module-methods)

---

## Quick Reference

| Scenario | Tool to use |
|----------|-------------|
| Unit test a read method | `createMockClient` + `jest.spyOn` on `simulateTransaction` |
| Unit test a write method | `createMockClient` + `createMockKeypair` + mock `sendTransaction` / `getTransaction` |
| Integration test on testnet | `.env.test` with funded keys, run via `npm run test:integration` |
| Replay a captured RPC response | XDR fixture in `tests/fixtures/` |

---

## Unit Tests — Mocked RPC

All unit tests live under `tests/` and run against a fully mocked Soroban RPC so they never
touch the network.  The helpers in `tests/helpers/mocks.ts` cover the three most common needs.

### createMockClient

`createMockClient(overrides?)` returns a `VeriTixClient` whose internal `server` is replaced
by a `jest.Mocked` object.  The client is already in the `connected = true` state, so you can
call module methods directly without calling `connect()`.

```ts
import { createMockClient } from './helpers/mocks';

const client = createMockClient();
// client.connected === true (injected by the helper)
// client.token, client.escrow, etc. all point at the mock server
```

Pass `overrides` to change specific mock method implementations:

```ts
const client = createMockClient({
  simulateTransaction: jest.fn().mockResolvedValue({
    result: { retval: nativeToScVal(42n, { type: 'i128' }) },
    latestLedger: 1000,
    minResourceFee: '100',
    transactionData: '',
    events: [],
  }),
});
```

### createMockServer

`createMockServer(overrides?)` returns a standalone mock server without wiring it to a client.
Use it when you need fine-grained control over module construction.

```ts
import { createMockServer, createMockConfig } from './helpers/mocks';
import { TokenModule } from '../src/modules/token';

const server = createMockServer({
  simulateTransaction: jest.fn().mockResolvedValue({ /* ... */ }),
});
const config = createMockConfig();
const module = new TokenModule(config, server);
```

Default mock method return values:

| Method | Default resolved value |
|--------|----------------------|
| `getLatestLedger` | `{ sequence: 1000 }` |
| `simulateTransaction` | `{ result: null }` |
| `sendTransaction` | `{ hash: 'mock-hash', status: 'PENDING' }` |
| `getTransaction` | `{ status: 'SUCCESS', ledger: 1000 }` |

### createMockKeypair

`createMockKeypair()` returns a deterministic `Keypair` derived from a fixed secret key.
Using the same keypair across tests makes assertions on `keypair.publicKey()` reproducible.

```ts
import { createMockKeypair } from './helpers/mocks';

const keypair = createMockKeypair();
console.log(keypair.publicKey()); // always the same public key
```

### Mocking Soroban RPC responses with jest.spyOn

For tests that go through the full module path (including `buildContractCall`) use
`jest.spyOn` directly on the mock server's method:

```ts
import { nativeToScVal } from '@stellar/stellar-sdk';
import { createMockClient } from './helpers/mocks';

describe('TokenModule.balance()', () => {
  it('returns parsed bigint from RPC response', async () => {
    const client = createMockClient();

    // Spy on the mock server that was injected into the token module
    const spy = jest.spyOn(
      (client.token as any).server,
      'simulateTransaction',
    ).mockResolvedValue({
      result: { retval: nativeToScVal(5_000_000n, { type: 'i128' }) },
      latestLedger: 1000,
      minResourceFee: '100',
      transactionData: '',
      events: [],
    });

    const balance = await client.token.balance('GABC…');

    expect(balance).toBe(5_000_000n);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
```

Alternatively, replace the server reference directly on the module (the pattern used in
`tests/token.test.ts`):

```ts
const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
const mockSimulate = jest.fn().mockResolvedValue(/* ... */);
(client.token as any).server = { simulateTransaction: mockSimulate };
```

Both patterns are acceptable; the `(client.module as any).server` pattern is slightly less
verbose for tests that only exercise one module.

### Testing read methods

Every module read method calls `simulateRead` internally, which calls
`server.simulateTransaction`.  A minimal read test looks like this:

```ts
import { nativeToScVal } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

function simSuccess(retval: ReturnType<typeof nativeToScVal>) {
  return {
    result: { retval },
    latestLedger: 1,
    minResourceFee: '100',
    transactionData: '',
    events: [],
  };
}

describe('TokenModule.decimals()', () => {
  it('returns number from RPC response', async () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    const mockSimulate = jest
      .fn()
      .mockResolvedValue(simSuccess(nativeToScVal(7, { type: 'u32' })));
    (client.token as any).server = { simulateTransaction: mockSimulate };

    expect(await client.token.decimals()).toBe(7);
  });
});
```

Always test the error path too — the module should surface a `VeriTixError` (not a raw RPC
error) when simulation fails:

```ts
it('throws VeriTixError on simulation failure', async () => {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
  (client.token as any).server = {
    simulateTransaction: jest.fn().mockResolvedValue({
      error: 'contract error: escrow not found',
    }),
  };

  await expect(client.token.balance(FAKE_ADDRESS)).rejects.toBeInstanceOf(VeriTixError);
});
```

### Testing write methods

Write methods require a `Keypair`.  Inject a mock server that returns `PENDING` from
`sendTransaction` and then `SUCCESS` from `getTransaction`:

```ts
import { Keypair, nativeToScVal } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';

it('mint() submits a transaction and returns the result', async () => {
  const keypair = Keypair.random();
  const client  = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);

  const mockServer = {
    getAccount:           jest.fn().mockResolvedValue({ id: keypair.publicKey(), sequenceNumber: () => '0', incrementSequenceNumber: () => {} }),
    simulateTransaction:  jest.fn().mockResolvedValue({
      result: { retval: nativeToScVal(null) },
      minResourceFee: '100',
      transactionData: { /* minimal assembled footprint */ },
      events: [],
    }),
    sendTransaction:      jest.fn().mockResolvedValue({ hash: 'abc123', status: 'PENDING' }),
    getTransaction:       jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 1001 }),
  };
  (client.token as any).server = mockServer;

  const result = await client.token.mint({ to: keypair.publicKey(), amount: 1_000_000n });

  expect(result.hash).toBe('abc123');
  expect(result.successful).toBe(true);
  expect(mockServer.sendTransaction).toHaveBeenCalledTimes(1);
});
```

Always verify that write methods throw `VeriTixError(ReadOnlyClient)` when no keypair is
supplied:

```ts
it('throws READ_ONLY_CLIENT without keypair', async () => {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT)); // no keypair
  await expect(
    client.token.mint({ to: FAKE_ADDRESS, amount: 1_000n }),
  ).rejects.toMatchObject({ code: VeriTixErrorCode.ReadOnlyClient });
});
```

---

## Integration Tests — Testnet

Integration tests live in `tests/integration/` and are excluded from the default `npm test`
run.  They connect to **Stellar Testnet** and require funded accounts.

### Required environment variables

Copy `.env.example` to `.env.test` and fill in the required values:

```bash
cp .env.example .env.test
```

| Variable | Required | Description |
|----------|----------|-------------|
| `VERITIX_CONTRACT_ID` | ✅ | Deployed Soroban contract ID on testnet |
| `STELLAR_NETWORK` | ✅ | Must be `testnet` |
| `VERITIX_SECRET_KEY` | ✅ | Secret key for the test admin account |
| `VERITIX_RPC_URL` | optional | Overrides the default testnet RPC URL |
| `VERITIX_NETWORK_PASSPHRASE` | optional | Overrides the default testnet passphrase |

> **Never commit** a `.env.test` file that contains real secret keys.  It is listed in
> `.gitignore` but be vigilant.

### Funding test accounts with Friendbot

Stellar Testnet provides a free faucet called **Friendbot** that funds any account with
10 000 XLM.  Call it once per account before running integration tests:

```ts
// Fund an account via HTTP (used in integration test setup)
async function fundWithFriendbot(publicKey: string): Promise<void> {
  const url = `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Friendbot failed: ${response.status} ${await response.text()}`);
  }
}

// Usage in beforeAll / beforeEach
beforeAll(async () => {
  const keypair = Keypair.random();
  await fundWithFriendbot(keypair.publicKey());
  // Now the account exists on testnet and can sign transactions
});
```

Alternatively use the Horizon SDK helper:

```ts
import { StellarTomlResolver, Friendbot } from '@stellar/stellar-sdk';

const server = new Horizon.Server('https://horizon-testnet.stellar.org');
await server.friendbot(keypair.publicKey()).call();
```

### Running integration tests

```bash
# Run all integration tests (requires .env.test to be populated)
npm run test:integration

# Run a single integration test file
npx jest tests/integration/ticket-purchase.integration.test.ts --config jest.integration.config.ts
```

Integration tests use a separate Jest config (`jest.integration.config.ts`) so that they are
never picked up by the default `npm test` run in CI.

---

## XDR Fixture Pattern

Capturing a live Soroban RPC response as an XDR fixture lets you replay exact responses in
unit tests, which is far more realistic than crafting return values by hand.

### Capturing a response

1. Run your integration test or a one-off script against testnet with logging enabled.
2. Intercept the raw `SimulateTransactionResponse` from `server.simulateTransaction()`.
3. Encode the `.result.retval` field to base64 XDR and save it to
   `tests/fixtures/<module>.xdr.ts`:

```ts
// tests/fixtures/escrow.xdr.ts — example captured fixture
export const GET_ESCROW_XDR =
  'AAAAEQAAAAEAAAAGAAAADwAAAA9lc2Nyb3dfaWQ…';  // base64 ScVal XDR
```

### Replaying a fixture

In a unit test, decode the fixture back to an `xdr.ScVal` and return it from the mock:

```ts
import { xdr } from '@stellar/stellar-sdk';
import { GET_ESCROW_XDR } from '../fixtures/escrow.xdr';

const retval = xdr.ScVal.fromXDR(GET_ESCROW_XDR, 'base64');

(client.escrow as any).server = {
  simulateTransaction: jest.fn().mockResolvedValue({
    result: { retval },
    latestLedger: 1,
    minResourceFee: '100',
    transactionData: '',
    events: [],
  }),
};

const escrow = await client.escrow.getEscrow(1n);
expect(escrow.id).toBe(1n);
```

This pattern is used in `tests/fixtures/dispute.xdr.ts` and `tests/fixtures/escrow.xdr.ts`.
Follow the same convention for new module fixtures.

---

## Coverage Thresholds

The project enforces minimum test coverage via Jest's `coverageThreshold` setting in
`jest.config.ts`.  Aim for the following when contributing:

| Metric | Target |
|--------|--------|
| Statements | ≥ 80 % |
| Branches | ≥ 75 % |
| Functions | ≥ 80 % |
| Lines | ≥ 80 % |

Run coverage locally before submitting a PR:

```bash
npm run test:coverage
```

Focus coverage on:
- All happy-path return values from read methods.
- The `READ_ONLY_CLIENT` guard in every write method.
- Input validation errors (`InvalidAmount`, `BatchTooLarge`, etc.).
- Error propagation when `simulateTransaction` returns an error response.

You do not need to cover unreachable branches inside `@stellar/stellar-sdk` internals.

---

## Checklist for New Module Methods

Before opening a PR for a new or changed module method, verify:

- [ ] At least one unit test for the happy path (mock RPC returns valid data).
- [ ] Unit test that write method throws `VeriTixError(ReadOnlyClient)` without a `Keypair`.
- [ ] Unit test for each input validation rule (`InvalidAmount`, `BatchTooLarge`, etc.).
- [ ] Unit test that surfaces the correct `VeriTixErrorCode` when RPC returns a contract panic.
- [ ] Method has JSDoc with `@param`, `@returns`, and at least one `@example`.
- [ ] `@deprecated` tag added (with replacement hint and removal version) if the method
  supersedes an older one — see [docs/deprecated.md](./deprecated.md).
- [ ] `npm test` passes with no regressions.
- [ ] `npm run test:coverage` shows coverage at or above the thresholds above for the files
  you changed.
