# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

**Versioning policy:**
- **Major** — breaking API change (renamed/removed methods or types)
- **Minor** — new method, module, or non-breaking feature addition
- **Patch** — bug fix, documentation update, or internal refactor with no API change

---

## [Unreleased]

### Added
- `isValidStellarAddress(address)` — validates a Stellar Ed25519 public key (#150)
- `assertValidAddress(address, fieldName)` — throws `VeriTixError(INVALID_ADDRESS)` for invalid addresses (#150)
- `VeriTixClient.watchTransaction(hash, options?)` — polls RPC for transaction confirmation (#154)
- `WatchOptions` type (`intervalMs`, `timeoutMs`) for `watchTransaction` (#154)
- `VeriTixErrorCode.InvalidAddress`, `WatchTimeout`, `TransactionFailed` error codes
- GitHub Actions CI workflow (`.github/workflows/ci.yml`)
- GitHub Actions release workflow (`.github/workflows/release.yml`)

---

## [0.1.0] — 2024-01-01 — Initial scaffold

### Added

#### Client
- `VeriTixClient` — main SDK entry point with typed EventEmitter events
- `connect()` — connects to Soroban RPC with exponential-backoff retries
- `disconnect()` — releases server connection
- `simulate(method, args)` — dry-runs a contract call without spending XLM
- `getCurrentLedger()` — returns current ledger sequence (5 s cache)
- `getContractMetadata()` — returns token name, symbol, decimals, totalSupply
- `isConnected()`, `isReadOnly()` — connection state helpers

#### Modules
- **token** — `balance`, `allowance`, `mint`, `burn`, `transfer`, `approve`, `name`, `symbol`, `decimals`, `totalSupply`
- **escrow** — `createEscrow`, `releaseEscrow`, `refundEscrow`, `getEscrow`
- **dispute** — `openDispute`, `resolveDispute`, `getDispute`
- **splitter** — `createSplit`, `distribute`, `getSplit`
- **recurring** — `setup`, `execute`, `cancel`, `getRecurring`
- **admin** — `setAdmin`, `freeze`, `unfreeze`, `clawback`, `pause`, `unpause`
- **batch** — `mintBatch`, `transferBatch`, `freezeBatch`

#### Types
- `NetworkConfig`, `StellarNetwork`, `ContractMetadata`
- `EscrowRecord`, `TicketEscrowParams`, `BatchSettlementResult`
- `SplitRecord`, `SplitRecipient`, `RevenueSplitParams`
- `DisputeRecord`, `DisputeStatus`
- `RecurringRecord`
- `TransactionResult`, `SimulationResult`, `FeeEstimate`

#### Utilities
- `getTestnetConfig`, `getMainnetConfig`, `getHorizonUrl`
- `TESTNET_PASSPHRASE`, `MAINNET_PASSPHRASE`
- `VeriTixError`, `VeriTixErrorCode`, `parseSorobanError`
- ScVal helpers: `addressToScVal`, `bigintToScVal`, `boolToScVal`, `stringToScVal`, and inverse converters
- XDR struct parsers: `parseEscrowRecord`, `parseSplitRecord`, `parseDisputeRecord`, `parseRecurringRecord`

[Unreleased]: https://github.com/Lead-Studios/veritix-contract-sdk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Lead-Studios/veritix-contract-sdk/releases/tag/v0.1.0
