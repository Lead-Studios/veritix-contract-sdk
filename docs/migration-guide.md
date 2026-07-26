# Migration Guide

This document helps you upgrade between published versions of `@veritix/contract-sdk`.
Each section covers the breaking changes introduced in that release, a step-by-step migration
path, and relevant code examples.

For a complete list of every change (including non-breaking additions and bug fixes) see the
[CHANGELOG.md](../CHANGELOG.md) at the repository root.

---

## Table of Contents

- [0.x → 0.1.0](#0x--010)
  - [Constructor signature](#1-constructor-signature)
  - [Module access pattern](#2-module-access-pattern)
  - [Error handling](#3-error-handling)
  - [New types introduced](#4-new-types-introduced)
  - [Static factory: VeriTixClient.fromEnvironment()](#5-static-factory-veritixclientfromenvironment)
  - [Unreleased additions (preview)](#6-unreleased-additions-preview)
- [Detecting incompatible contract deployments](#detecting-incompatible-contract-deployments)
- [Deprecation policy](#deprecation-policy)
- [Full changelog](#full-changelog)

---

## 0.x → 0.1.0

Version 0.1.0 is the **initial public scaffold** of the SDK. If you were using a pre-release
or internal build (labelled `0.0.x` or `0.x`), the changes below are all **breaking** and
require code changes before upgrading.

### 1. Constructor signature

**Before (0.x)**

Earlier pre-release builds accepted positional string arguments directly:

```ts
// Old — no longer works
const client = new VeriTixClient(rpcUrl, contractId, secretKey, passphrase);
```

**After (0.1.0)**

The constructor now takes a typed `NetworkConfig` object as its first argument and an
optional `Keypair` as its second argument. Omitting the `Keypair` produces a read-only client.

```ts
import { Keypair } from '@stellar/stellar-sdk';
import { VeriTixClient, getTestnetConfig } from '@veritix/contract-sdk';

// Build config with the network helper
const config = getTestnetConfig('CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');

// Write-capable client
const keypair = Keypair.fromSecret(process.env.STELLAR_SECRET_KEY!);
const client = new VeriTixClient(config, keypair);

// Read-only client (no keypair)
const readOnly = new VeriTixClient(config);
console.log(readOnly.isReadOnly()); // true
```

Use `getTestnetConfig(contractId)` or `getMainnetConfig(contractId)` to construct a
`NetworkConfig` without spelling out the RPC URL or network passphrase yourself. For
custom networks supply the object directly:

```ts
import type { NetworkConfig } from '@veritix/contract-sdk';

const custom: NetworkConfig = {
  network: 'testnet',
  contractId: 'CXXXXXXX…',
  rpcUrl: 'https://my-rpc.example.com',
  networkPassphrase: 'Test SDF Network ; September 2015',
  retries: 5,          // optional — default 3
  retryDelayMs: 500,   // optional — default 1000
};
```

---

### 2. Module access pattern

**Before (0.x)**

Modules were instantiated separately and passed a server or connection object:

```ts
// Old — no longer works
import { EscrowModule } from '@veritix/contract-sdk/modules/escrow';

const escrow = new EscrowModule(server, contractId, keypair);
await escrow.createEscrow({ … });
```

**After (0.1.0)**

All modules are now owned by `VeriTixClient` and exposed as **read-only properties** on
the connected client instance. You must call `connect()` before invoking any module method.

```ts
await client.connect();

// All seven modules accessed as properties
client.token      // SEP-41 token operations
client.escrow     // escrow lifecycle
client.dispute    // dispute resolution
client.splitter   // payment splitting
client.recurring  // subscription payments
client.admin      // admin / governance
client.batch      // batch token operations
```

Example:

```ts
// Create an escrow
const result = await client.escrow.createEscrow({
  beneficiary: 'GABC…',
  amount: 10_000_000n,  // 1 XLM in stroops
  expiryLedger: 1_500_000,
  memos: ['Ticket #42'],
});
console.log('tx hash:', result.hash);
```

---

### 3. Error handling

**Before (0.x)**

Errors were plain JavaScript `Error` objects or raw Soroban XDR errors with no structured
code property:

```ts
// Old
try {
  await escrow.release(id);
} catch (err) {
  console.error(err.message); // unstructured string
}
```

**After (0.1.0)**

All contract-level failures throw `VeriTixError`, which carries a typed `code` from the
`VeriTixErrorCode` enum. Use `instanceof` checks and `switch` on `err.code` for precise
handling:

```ts
import { VeriTixError, VeriTixErrorCode } from '@veritix/contract-sdk';

try {
  await client.escrow.releaseEscrow(99n);
} catch (err) {
  if (err instanceof VeriTixError) {
    switch (err.code) {
      case VeriTixErrorCode.EscrowNotFound:
        console.error('No escrow with that ID.');
        break;
      case VeriTixErrorCode.EscrowAlreadySettled:
        console.warn('Escrow already settled — nothing to do.');
        break;
      case VeriTixErrorCode.ReadOnlyClient:
        console.error('Provide a Keypair to perform write operations.');
        break;
      default:
        throw err; // re-throw unexpected errors
    }
  }
}
```

You can also call `parseSorobanError(rawError)` if you are working with the Stellar SDK at
a lower level and need to convert a raw RPC error into a `VeriTixError`.

---

### 4. New types introduced

The following TypeScript types are **new in 0.1.0** and replace any ad-hoc interfaces you
may have defined locally:

| Type | Description |
|------|-------------|
| `NetworkConfig` | Constructor config object (network, contractId, rpcUrl, passphrase) |
| `StellarNetwork` | `"testnet" \| "mainnet"` |
| `ContractMetadata` | Token name, symbol, decimals, totalSupply, contractId, network |
| `EscrowRecord` | On-chain escrow state |
| `TicketEscrowParams` | Helper params for ticket-oriented escrow creation |
| `BatchSettlementResult` | Result of a batch escrow settlement |
| `SplitRecord` / `SplitRecipient` | Payment split state and per-recipient share |
| `DisputeRecord` / `DisputeStatus` | Dispute state and resolution enum |
| `RecurringRecord` | Subscription payment state |
| `TransactionResult` | Submitted transaction hash, ledger, success flag |
| `SimulationResult` | Dry-run result: success, returnValue, estimatedFee |
| `FeeEstimate` | Human-readable fee in stroops and XLM |
| `WatchOptions` | `intervalMs` and `timeoutMs` for polling helpers |

Update any local type aliases to import from `@veritix/contract-sdk` instead.

---

### 5. Static factory: VeriTixClient.fromEnvironment()

`VeriTixClient.fromEnvironment()` is a new static constructor (added in 0.1.0) that builds
a client entirely from environment variables. Use it in server processes to avoid
constructing `NetworkConfig` in application code:

```ts
// Required env var:
//   VERITIX_CONTRACT_ID=C…
//
// Optional env vars:
//   STELLAR_NETWORK=testnet | mainnet          (default: testnet)
//   VERITIX_RPC_URL=https://…                  (overrides network default)
//   VERITIX_NETWORK_PASSPHRASE=…               (overrides network default)
//   VERITIX_SECRET_KEY=S…                      (enables write operations)

const client = VeriTixClient.fromEnvironment();
await client.connect();
```

If `VERITIX_CONTRACT_ID` is absent or `STELLAR_NETWORK` / `VERITIX_SECRET_KEY` are
malformed, `fromEnvironment()` throws `VeriTixError` with code `InvalidAddress`.

---

### 6. Unreleased additions (preview)

The following symbols are **not yet released** — they live in the `[Unreleased]` section of
the CHANGELOG and will ship in the next minor version. They are documented here so you can
prepare your codebase ahead of the release.

#### Address validation helpers

Two new utility functions will be exported from `@veritix/contract-sdk`:

```ts
import { isValidStellarAddress, assertValidAddress } from '@veritix/contract-sdk';

// Returns a boolean — safe to use in conditional logic
if (!isValidStellarAddress(userInput)) {
  console.error('Not a valid Stellar public key');
}

// Throws VeriTixError(InvalidAddress) on failure — use for input guard-clauses
assertValidAddress(userInput, 'beneficiary');
```

#### watchTransaction

`client.watchTransaction(hash, options?)` polls the RPC for transaction confirmation and
resolves with a `TransactionResult` when the transaction is finalised:

```ts
import type { WatchOptions } from '@veritix/contract-sdk';

const options: WatchOptions = { intervalMs: 2_000, timeoutMs: 90_000 };
const tx = await client.watchTransaction(txHash, options);
console.log('Confirmed in ledger', tx.ledger);
```

Throws `VeriTixError(WatchTimeout)` if `timeoutMs` elapses without confirmation, or
`VeriTixError(TransactionFailed)` if the transaction is rejected on-chain.

#### watchEscrow

`client.watchEscrow(id, options?)` is an async generator that yields an `EscrowRecord` when
the escrow transitions to released or refunded state:

```ts
for await (const record of client.watchEscrow(escrowId, { timeoutMs: 120_000 })) {
  console.log('Escrow settled:', record.released ? 'released' : 'refunded');
  break; // stop after the first state change
}
```

#### New VeriTixErrorCodes

| Code | When thrown |
|------|-------------|
| `VeriTixErrorCode.InvalidAddress` | Address fails Ed25519 validation |
| `VeriTixErrorCode.WatchTimeout` | `watchTransaction` / `watchEscrow` timed out |
| `VeriTixErrorCode.TransactionFailed` | Transaction was rejected on-chain |

---

## Detecting incompatible contract deployments

When you upgrade the SDK you should verify that the on-chain contract your application
is pointing to is the version you expect. Use `getContractMetadata()` to read the
token name, symbol, decimals, total supply, and network directly from the deployed contract:

```ts
await client.connect();

const meta = await client.getContractMetadata();
console.log(meta);
// {
//   name: 'VeriTix',
//   symbol: 'VTX',
//   decimal: 7,
//   totalSupply: 1_000_000_000_000_000n,
//   contractId: 'CXXXXXXX…',
//   network: 'testnet',
// }
```

### Recommended compatibility check

Define the expected values your build was compiled against and assert them at startup:

```ts
import { VeriTixError, VeriTixErrorCode } from '@veritix/contract-sdk';

const EXPECTED = {
  name: 'VeriTix',
  symbol: 'VTX',
  decimal: 7,
} as const;

async function assertContractCompatible(client: VeriTixClient): Promise<void> {
  const meta = await client.getContractMetadata();

  if (meta.name !== EXPECTED.name || meta.symbol !== EXPECTED.symbol) {
    throw new VeriTixError(
      VeriTixErrorCode.ConnectionFailed,
      `Contract mismatch: expected ${EXPECTED.symbol} on ${client.config.network}, ` +
        `got name="${meta.name}" symbol="${meta.symbol}". ` +
        'Check that VERITIX_CONTRACT_ID points to the correct deployment.',
    );
  }

  if (meta.decimal !== EXPECTED.decimal) {
    throw new VeriTixError(
      VeriTixErrorCode.ConnectionFailed,
      `Decimal mismatch: SDK expects ${EXPECTED.decimal} decimal places but contract reports ${meta.decimal}. ` +
        'Amount arithmetic will be incorrect — upgrade the SDK or point to the correct contract.',
    );
  }
}

// Call once during application bootstrap
const client = new VeriTixClient(config, keypair);
await client.connect();
await assertContractCompatible(client);
```

### Environment-specific contracts

Use `client.config.network` to branch between test and production contracts inside the
same codebase:

```ts
const meta = await client.getContractMetadata();

if (meta.network === 'mainnet' && meta.totalSupply === 0n) {
  throw new Error('Mainnet contract has zero supply — deployment may be incomplete.');
}
```

---

## Deprecation policy

`@veritix/contract-sdk` follows a **1-minor-version deprecation window**:

1. **Announcement** — A method, type, or export is marked deprecated in the release it is
   scheduled for removal. The symbol is annotated with a `@deprecated` JSDoc tag in source
   and the tag includes the version it will be removed in and a migration suggestion:

   ```ts
   /**
    * @deprecated Since 0.2.0 — use {@link assertValidAddress} instead.
    * Will be removed in 0.3.0.
    */
   export function validateAddress(address: string): void { … }
   ```

2. **One minor version of grace** — The deprecated symbol continues to work without any
   behaviour change for the **entire next minor release** (e.g. deprecated in 0.2.0 → removed
   in 0.3.0). Patch releases within the grace window do **not** remove deprecated symbols.

3. **Removal** — The symbol is deleted in the first minor release after the grace window. The
   deletion is listed as a breaking change in the CHANGELOG under the `### Removed` heading
   and the corresponding major version is bumped if the project has reached 1.0.

4. **Tracking** — All currently deprecated symbols are catalogued in
   [`docs/deprecated.md`](./deprecated.md) with the version they were deprecated in, the
   version they will be removed in, and the recommended replacement.

5. **TypeScript warnings** — Because the `@deprecated` tag is emitted in `.d.ts` files,
   editors and tools that respect JSDoc (VS Code, WebStorm, `tsc --noUnusedLocals`) will
   show a strikethrough on call sites automatically.

### Summary table

| Phase | What happens |
|-------|-------------|
| Deprecated in `X.Y.0` | Symbol still works; JSDoc `@deprecated` tag added; listed in `docs/deprecated.md` |
| `X.(Y+1).0` (grace period) | Symbol still works; no behaviour change |
| `X.(Y+2).0` (removal) | Symbol deleted; listed as breaking in CHANGELOG |

---

## Full changelog

The authoritative record of every change — including non-breaking additions, bug fixes, and
internal refactors — is in the repository root:

➜ **[CHANGELOG.md](../CHANGELOG.md)**

Direct links to individual releases:

- [Unreleased](https://github.com/Lead-Studios/veritix-contract-sdk/compare/v0.1.0...HEAD) — work in progress
- [0.1.0](https://github.com/Lead-Studios/veritix-contract-sdk/releases/tag/v0.1.0) — initial scaffold
