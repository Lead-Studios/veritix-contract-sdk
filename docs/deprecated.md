# Deprecated Symbols

This file catalogues every symbol in `@veritix/contract-sdk` that has been marked
`@deprecated`.  Each entry lists the version the symbol was deprecated in, the version
it will be **removed** in, and the recommended replacement.

For the full deprecation policy see the
[Migration Guide — Deprecation Policy](./migration-guide.md#deprecation-policy) section.

---

## Table of Contents

- [buildContractCall — `server` parameter](#buildcontractcall--server-parameter)
- [createRevenueSplit()](#createrevenuesplit)
- [RevenueSplitParams](#revenuesplitp-arams)
- [WatchOptions (re-export from `./client`)](#watchoptions-re-export-from-client)

---

## `buildContractCall` — `server` parameter

| Field | Value |
|-------|-------|
| **Symbol** | `server: SorobanRpc.Server` — first parameter of `buildContractCall` |
| **File** | `src/utils/transaction.ts` |
| **Deprecated in** | 0.2.0 |
| **Removed in** | 0.3.0 |
| **Replacement** | Pass `server` only to `simulateTransaction` — it is not needed at build time |

### Details

`buildContractCall` accepts a `SorobanRpc.Server` as its first argument, but the parameter
is silently ignored inside the function body.  The `server` reference is only needed during
the simulation step (i.e. when calling `simulateTransaction`), not when building the
unsigned transaction envelope.

The parameter was originally included to match a planned API that was never implemented.
It will be **removed** in 0.3.0 and callers should stop passing it (or pass `undefined`
as a transitional measure once the signature changes to accept `SorobanRpc.Server | undefined`).

### Migration

```ts
// ❌ Before (0.x — still works but server arg is ignored)
const tx = await buildContractCall(
  server,              // ← this value is ignored
  sourceAccount,
  contractId,
  method,
  args,
  networkPassphrase,
);

// ✅ After (0.3.0 — server parameter removed)
// Pass server only to simulateTransaction where it is actually used:
const tx = await buildContractCall(
  sourceAccount,
  contractId,
  method,
  args,
  networkPassphrase,
);
const { transaction, simulatedFee } = await simulateTransaction(server, tx);
```

---

## `createRevenueSplit()`

| Field | Value |
|-------|-------|
| **Symbol** | `SplitterModule.createRevenueSplit(params: RevenueSplitParams)` |
| **File** | `src/modules/splitter.ts` |
| **Deprecated in** | 0.2.0 |
| **Removed in** | 0.3.0 |
| **Replacement** | `SplitterModule.createSplit({ recipients, totalAmount })` |

### Details

`createRevenueSplit` is a convenience wrapper that hard-codes a three-party split between
an organizer, artist, and platform address.  The generic `createSplit` method accepts any
number of recipients via a `recipients: SplitRecipient[]` array and is strictly more
powerful.  The `createRevenueSplit` method (and its associated `RevenueSplitParams` type)
will be removed in 0.3.0.

### Migration

```ts
// ❌ Before (deprecated since 0.2.0)
await client.splitter.createRevenueSplit({
  organizer:    'GORG…',
  organizerBps: 6_000,
  artist:       'GART…',
  artistBps:    3_000,
  platform:     'GPLT…',
  totalAmount:  20_000_000n,
});

// ✅ After — use createSplit directly
await client.splitter.createSplit({
  recipients: [
    { address: 'GORG…', shareBps: 6_000 },
    { address: 'GART…', shareBps: 3_000 },
    { address: 'GPLT…', shareBps: 1_000 },  // 10_000 - 6_000 - 3_000
  ],
  totalAmount: 20_000_000n,
});
```

---

## `RevenueSplitParams`

| Field | Value |
|-------|-------|
| **Symbol** | `interface RevenueSplitParams` |
| **File** | `src/types/index.ts` |
| **Deprecated in** | 0.2.0 |
| **Removed in** | 0.3.0 |
| **Replacement** | `SplitRecipient[]` array passed to `CreateSplitParams.recipients` |

### Details

`RevenueSplitParams` is the parameter type for the deprecated
[`createRevenueSplit()`](#createrevenuesplit) method.  It models a fixed three-party split
with named `organizer`, `artist`, and `platform` roles.  The generic `SplitRecipient`
interface is more flexible and should be used instead.

### Migration

```ts
// ❌ Before — RevenueSplitParams
import type { RevenueSplitParams } from '@veritix/contract-sdk';

const params: RevenueSplitParams = {
  organizer: 'GORG…', organizerBps: 6_000,
  artist:    'GART…', artistBps:    3_000,
  platform:  'GPLT…',
  totalAmount: 20_000_000n,
};

// ✅ After — SplitRecipient[] + CreateSplitParams
import type { SplitRecipient, CreateSplitParams } from '@veritix/contract-sdk';

const recipients: SplitRecipient[] = [
  { address: 'GORG…', shareBps: 6_000 },
  { address: 'GART…', shareBps: 3_000 },
  { address: 'GPLT…', shareBps: 1_000 },
];
const params: CreateSplitParams = { recipients, totalAmount: 20_000_000n };
```

---

## `WatchOptions` re-export from `./client`

| Field | Value |
|-------|-------|
| **Symbol** | `export type { WatchOptions } from './client'` |
| **File** | `src/index.ts` (barrel) |
| **Deprecated in** | 0.2.0 |
| **Removed in** | 0.3.0 |
| **Replacement** | Import `WatchOptions` from `@veritix/contract-sdk` directly (sourced from `./types/index`) |

### Details

`WatchOptions` is defined in `src/types/index.ts` and was also re-exported from
`src/client.ts`, resulting in a duplicate export in the public barrel (`src/index.ts`).
The re-export from `./client` was always redundant — the canonical export is the one sourced
from `./types/index`.

For consumers this is **transparent** — importing `WatchOptions` from `@veritix/contract-sdk`
continues to work.  The internal re-export path via `./client` will be cleaned up in 0.3.0.

### Migration

No consumer-facing code change is required.  If you imported the interface using a deep
import path, switch to the barrel export:

```ts
// ❌ Deep import (never part of the public API)
import type { WatchOptions } from '@veritix/contract-sdk/src/client';

// ✅ Public barrel export (unchanged, works today and after 0.3.0)
import type { WatchOptions } from '@veritix/contract-sdk';
```

---

## Summary table

| Symbol | Kind | Deprecated | Removed | Replacement |
|--------|------|-----------|---------|-------------|
| `buildContractCall` `server` param | Function parameter | 0.2.0 | 0.3.0 | Remove arg; pass `server` only to `simulateTransaction` |
| `SplitterModule.createRevenueSplit()` | Method | 0.2.0 | 0.3.0 | `SplitterModule.createSplit({ recipients, totalAmount })` |
| `RevenueSplitParams` | Interface | 0.2.0 | 0.3.0 | `SplitRecipient[]` + `CreateSplitParams` |
| `WatchOptions` from `./client` re-export | Type export | 0.2.0 | 0.3.0 | Import from `@veritix/contract-sdk` (no change for consumers) |
