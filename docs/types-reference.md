# Types Reference

Complete reference for every exported TypeScript interface and enum in `@veritix/contract-sdk`.

---

## Network

### `StellarNetwork`

```ts
type StellarNetwork = 'testnet' | 'mainnet';
```

Identifies which Stellar network the SDK connects to.

---

### `NetworkConfig`

Mirrors no contract struct — used only by the SDK client to initialise a connection.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `network` | `StellarNetwork` | ✅ | `"testnet"` or `"mainnet"` |
| `contractId` | `string` | ✅ | Bech32-encoded Soroban contract ID (e.g. `"CXXX…"`) |
| `rpcUrl` | `string` | ✅ | Soroban RPC endpoint URL |
| `networkPassphrase` | `string` | ✅ | Stellar network passphrase used for signing |
| `retries` | `number` | ❌ | Connect retry attempts on transient failure (default `3`) |
| `retryDelayMs` | `number` | ❌ | Base delay in ms between retries, doubles each attempt (default `1000`) |

---

### `ContractMetadata`

Returned by `VeriTixClient.getContractMetadata()`.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Human-readable token name |
| `symbol` | `string` | Token ticker symbol |
| `decimal` | `number` | Number of decimal places |
| `totalSupply` | `bigint` | Total token supply in smallest denomination (stroops) |
| `contractId` | `string` | Soroban contract ID |
| `network` | `StellarNetwork` | Network the contract is deployed on |

---

## Escrow

### `EscrowRecord`

Mirrors the `EscrowRecord` struct in the VeriTix Soroban contract.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `bigint` | Unique numeric identifier |
| `depositor` | `string` | Stellar address of the depositor |
| `beneficiary` | `string` | Stellar address of the intended beneficiary |
| `amount` | `bigint` | Token amount held in escrow (in stroops) |
| `released` | `boolean` | Whether funds were released to the beneficiary |
| `refunded` | `boolean` | Whether funds were refunded to the depositor |
| `expiryLedger` | `number` | Ledger sequence after which the depositor may reclaim funds |
| `memos` | `string[]` | Optional free-form memo strings attached to the escrow |

---

### `TicketEscrowParams`

Parameters for `EscrowModule.createTicketEscrow()`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `organizer` | `string` | ✅ | Stellar address of the event organizer / ticket beneficiary |
| `ticketPrice` | `bigint` | ✅ | Ticket price to lock in escrow (in stroops) |
| `eventLedger` | `number` | ✅ | Ledger sequence number when the event occurs |
| `ticketRef` | `string` | ✅ | Unique ticket reference ID stored on-chain |
| `bufferLedgers` | `number` | ❌ | Additional ledger buffer beyond `eventLedger` (default `5000`) |

---

### `BatchSettlementResult`

Returned by `EscrowModule.settleEvent()`.

| Field | Type | Description |
|-------|------|-------------|
| `settled` | `number` | Number of escrows successfully settled |
| `failed` | `bigint[]` | Escrow IDs that failed to settle |
| `txHashes` | `string[]` | Transaction hashes for all submitted settlement transactions |

---

## Split

### `SplitRecipient`

A single recipient entry within a `SplitRecord`.

| Field | Type | Description |
|-------|------|-------------|
| `address` | `string` | Stellar account address of the recipient |
| `shareBps` | `number` | Share in **basis points** (1 bps = 0.01%). All recipients in a split must sum to exactly **10 000** bps. |

> **Note:** `shareBps` uses basis points, not percentages. A 25% share is `2500`, a 50% share is `5000`.

---

### `SplitRecord`

Mirrors the `SplitRecord` struct in the VeriTix Soroban contract.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `bigint` | Unique numeric identifier |
| `sender` | `string` | Stellar address that initiated the split |
| `recipients` | `SplitRecipient[]` | Ordered list of recipients with their basis-point shares |
| `totalAmount` | `bigint` | Total amount to distribute (in stroops) |
| `distributed` | `boolean` | Whether the full amount has been distributed |
| `cancelled` | `boolean` | Whether the split was cancelled before distribution |

---

### `RevenueSplitParams`

Parameters for `SplitterModule.createRevenueSplit()`.

| Field | Type | Description |
|-------|------|-------------|
| `organizer` | `string` | Stellar address of the organizer |
| `organizerBps` | `number` | Organizer's share in basis points |
| `artist` | `string` | Stellar address of the artist |
| `artistBps` | `number` | Artist's share in basis points |
| `platform` | `string` | Stellar address of the platform |
| `totalAmount` | `bigint` | Total amount to split (in stroops) |

> The platform share is computed automatically as `10 000 - organizerBps - artistBps`. All three must not exceed 10 000 total.

---

## Dispute

### `DisputeStatus` (enum)

```ts
enum DisputeStatus {
  Open                   = 'Open',
  ResolvedForBeneficiary = 'ResolvedForBeneficiary',
  ResolvedForDepositor   = 'ResolvedForDepositor',
}
```

| Value | Description |
|-------|-------------|
| `Open` | Dispute has been opened and is awaiting resolution |
| `ResolvedForBeneficiary` | Resolver ruled in favour of the escrow beneficiary |
| `ResolvedForDepositor` | Resolver ruled in favour of the escrow depositor |

---

### `DisputeRecord`

Mirrors the `DisputeRecord` struct in the VeriTix Soroban contract.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `bigint` | Unique numeric identifier |
| `escrowId` | `bigint` | The escrow ID this dispute is attached to |
| `claimant` | `string` | Stellar address of the party that opened the dispute |
| `resolver` | `string` | Stellar address of the designated resolver / arbitrator |
| `status` | `DisputeStatus` | Current lifecycle state of the dispute |
| `openedAt` | `number` | Ledger sequence number when the dispute was opened |

---

## Recurring Payment

### `RecurringRecord`

Mirrors the `RecurringRecord` struct in the VeriTix Soroban contract.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `bigint` | Unique numeric identifier |
| `payer` | `string` | Stellar address of the payer |
| `payee` | `string` | Stellar address of the payee |
| `amount` | `bigint` | Amount charged per interval (in stroops) |
| `interval` | `number` | Charge interval in ledger count (e.g. `17280` ≈ 1 day at 5 s/ledger) |
| `active` | `boolean` | Whether this recurring payment is still active |
| `lastChargedLedger` | `number` | Ledger sequence when the most recent charge executed |

---

## Generic Helpers

### `TransactionResult`

Minimal representation of a submitted Stellar transaction.

| Field | Type | Description |
|-------|------|-------------|
| `hash` | `string` | Stellar transaction hash (hex-encoded) |
| `ledger` | `number` | Final ledger sequence the transaction was included in |
| `successful` | `boolean` | Whether the transaction succeeded |
| `returnValue` | `unknown` | Optional decoded return value from the contract invocation |

---

### `SimulationResult`

Returned by `VeriTixClient.simulate()`.

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether the simulated call would succeed |
| `returnValue` | `unknown` | Decoded return value from the contract (if successful) |
| `estimatedFee` | `string` | Estimated transaction fee in stroops |
| `error` | `string` | Error message if the simulation failed |

---

### `FeeEstimate`

Returned by `estimateFee()`.

| Field | Type | Description |
|-------|------|-------------|
| `feeLumens` | `string` | Raw fee in stroops |
| `feeXLM` | `string` | Fee converted to XLM (7 decimal places) |
| `estimatedLedger` | `number` | Latest ledger sequence at the time of estimation |

---

## See Also

- [README](../README.md) — Quick start and module reference
- [CONTRIBUTING.md](../CONTRIBUTING.md) — Development guide
