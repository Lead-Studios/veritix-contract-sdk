# @veritix/contract-sdk

> A TypeScript/JavaScript client SDK for the **VeriTix Soroban smart contract** deployed on the [Stellar](https://stellar.org) network.

The SDK wraps every contract entry-point in a typed, promise-based API so you can integrate VeriTix escrow, payment splitting, dispute resolution, and recurring payments into your application without writing Soroban XDR by hand.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Read-only Mode](#read-only-mode)
- [Module Reference](#module-reference)
  - [token](#token)
  - [escrow](#escrow)
  - [dispute](#dispute)
  - [splitter](#splitter)
  - [recurring](#recurring)
  - [admin](#admin)
  - [batch](#batch)
- [Error Handling](#error-handling)
- [API Reference](#api-reference)
- [Contributing](#contributing)
- [License](#license)

---

## Installation

```bash
npm install @veritix/contract-sdk
```

> **Peer dependency:** `@stellar/stellar-sdk ^12` is installed automatically as a dependency.

---

## Quick Start

```ts
import { Keypair } from '@stellar/stellar-sdk';
import {
  VeriTixClient,
  getTestnetConfig,
  VeriTixError,
} from '@veritix/contract-sdk';

// 1. Build network config
const config = getTestnetConfig(process.env.CONTRACT_ID!);

// 2. Load signing keypair (keep your secret key out of source control!)
const keypair = Keypair.fromSecret(process.env.STELLAR_SECRET_KEY!);

// 3. Create and connect the client
const client = new VeriTixClient(config, keypair);
await client.connect();

// 4. Create a ticket escrow
try {
  const result = await client.escrow.createEscrow({
    beneficiary: 'GABC…',
    amount: 10_000_000n,   // 1 XLM in stroops
    expiryLedger: 1_500_000,
    memos: ['Ticket #42'],
  });
  console.log('Escrow created, tx hash:', result.hash);
} catch (err) {
  if (err instanceof VeriTixError) {
    console.error(`Contract error [${err.code}]:`, err.message);
  }
}
```

---

## Configuration

Use the built-in helpers to avoid copy-pasting passphrase strings:

```ts
import { getTestnetConfig, getMainnetConfig, getHorizonUrl } from '@veritix/contract-sdk';

const testnet = getTestnetConfig('C…');   // Testnet RPC + passphrase
const mainnet = getMainnetConfig('C…');   // Mainnet RPC + passphrase

const horizonUrl = getHorizonUrl('testnet');  // https://horizon-testnet.stellar.org
```

Or supply a fully custom `NetworkConfig`:

```ts
import type { NetworkConfig } from '@veritix/contract-sdk';

const custom: NetworkConfig = {
  network: 'testnet',
  contractId: 'C…',
  rpcUrl: 'https://my-rpc-node.example.com',
  networkPassphrase: 'Test SDF Network ; September 2015',
};
```

---

## Read-only Mode

Omit the `Keypair` to create a read-only client. All read operations work normally; write operations throw `VeriTixError` with code `READ_ONLY_CLIENT`.

```ts
// No keypair — read-only
const client = new VeriTixClient(getTestnetConfig(process.env.CONTRACT_ID!));
await client.connect();

console.log(client.isReadOnly()); // true

// Read operations work fine
const escrow = await client.escrow.getEscrow(1n);

// Write operations throw
await client.escrow.releaseEscrow(1n); // ✗ throws VeriTixError READ_ONLY_CLIENT
```

---

## Module Reference

All modules are accessed as properties on a connected `VeriTixClient` instance.

### token

Implements the SEP-41 token interface.

| Method | Description |
|--------|-------------|
| `balance(address)` | Returns the token balance for an address (stroops) |
| `allowance(from, spender)` | Returns the approved allowance (stroops) |
| `mint({ to, amount })` | Mints new tokens — admin only |
| `burn({ from, amount })` | Burns tokens from an account |
| `transfer({ from, to, amount })` | Transfers tokens between accounts |
| `approve({ from, spender, amount, expirationLedger })` | Approves a spender allowance |

### escrow

| Method | Description |
|--------|-------------|
| `createEscrow({ beneficiary, amount, expiryLedger, memos? })` | Locks funds in a new escrow |
| `releaseEscrow(id)` | Releases funds to the beneficiary |
| `refundEscrow(id)` | Refunds funds to the depositor after expiry |
| `getEscrow(id)` | Fetches an `EscrowRecord` by ID |

### dispute

| Method | Description |
|--------|-------------|
| `openDispute({ escrowId, resolver })` | Opens a dispute and freezes the escrow |
| `resolveDispute({ disputeId, resolution })` | Resolves an open dispute — resolver only |
| `getDispute(id)` | Fetches a `DisputeRecord` by ID |

### splitter

| Method | Description |
|--------|-------------|
| `createSplit({ recipients, totalAmount })` | Creates a new split instruction |
| `distribute(id)` | Distributes funds to all recipients |
| `getSplit(id)` | Fetches a `SplitRecord` by ID |

> Recipient shares must be specified in **basis points** and must sum to exactly **10 000**.

### recurring

| Method | Description |
|--------|-------------|
| `setup({ payee, amount, interval })` | Creates a recurring payment authorisation |
| `execute(id)` | Executes a due charge |
| `cancel(id)` | Cancels an active recurring payment |
| `getRecurring(id)` | Fetches a `RecurringRecord` by ID |
| `executeAllDue(payer)` | Executes all due payments for a payer, returns `{ executed, skipped, failed }` |

### admin

| Method | Description |
|--------|-------------|
| `setAdmin(newAdmin)` | Transfers the admin role |
| `freeze(address)` | Freezes an account |
| `unfreeze(address)` | Unfreezes an account |
| `clawback(from, amount)` | Claws back tokens from an account |
| `pause()` | Pauses the contract |
| `unpause()` | Unpauses the contract |

### batch

| Method | Description |
|--------|-------------|
| `mintBatch(entries)` | Mints tokens to multiple recipients at once |
| `transferBatch(entries)` | Executes multiple transfers atomically |
| `freezeBatch(addresses)` | Freezes multiple accounts in one call |

---

## Error Handling

All SDK methods throw `VeriTixError` on contract-level failures.

```ts
import { VeriTixError, VeriTixErrorCode, parseSorobanError } from '@veritix/contract-sdk';

try {
  await client.escrow.releaseEscrow(99n);
} catch (err) {
  if (err instanceof VeriTixError) {
    switch (err.code) {
      case VeriTixErrorCode.EscrowNotFound:
        console.error('No such escrow.');
        break;
      case VeriTixErrorCode.EscrowAlreadySettled:
        console.warn('Escrow was already settled — nothing to do.');
        break;
      default:
        throw err;   // re-throw unexpected errors
    }
  }
}
```

You can also call `parseSorobanError(rawError)` directly if you're working with the Stellar SDK at a lower level.

---

## API Reference

Full TypeDoc-generated API documentation is published at:

> **https://veritix.github.io/contract-sdk/**

To generate docs locally:

```bash
npm run docs:generate
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to pick up a module stub and implement it.

---

## License

MIT © VeriTix Contributors
