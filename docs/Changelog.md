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
- Type coverage check in CI (`npm run type-coverage`, requires ≥95% typed coverage) (#291)
- `type-coverage` devDependency and `npm run type-coverage` script (#291)
- npm provenance attestations on release (`--provenance` flag, SLSA Level 3 supply-chain security) (#293)
- `id-token: write` permission in release workflow to enable provenance (#293)
- Changelog validation step in CI — fails if `src/` is modified without updating `CHANGELOG.md` (#294)
- GitHub Actions docs deployment workflow (`.github/workflows/docs.yml`) — deploys TypeDoc to GitHub Pages on release (#295)
- `npm run docs:serve` script for local doc preview on http://localhost:8080 (#295)
- API docs published to https://lead-studios.github.io/veritix-contract-sdk/ (#295)
- `TicketPurchaseModule` — ticket checkout with availability validation and receipt retrieval (#52)
- `PurchaseRequest`, `Receipt`, `BillingDetails`, `AddressDetails` types for ticket checkout (#52)
- `TicketAnalyticsModule` — ticket order totals, hourly/daily/weekly/monthly/yearly breakdowns, and CSV/XLS export (#49)
- `TicketOrder`, `TicketPeriod`, `ExportFormat` types for ticket analytics (#49)
- `RevenueAnalyticsModule` — event revenue and profit totals with daily/weekly/monthly/yearly filters (#48)
- `TicketSale`, `RevenuePeriod` types and `TRANSACTION_CHARGE_RATE` constant for revenue analytics (#48)
- `CollaboratorModule` — add, retrieve, update, and remove event collaborators (#46)
- `Collaborator`, `CollaboratorUpdate` types and `MAX_COLLABORATORS_PER_EVENT` constant (#46)

### Fixed
- `BatchModule.freezeBatch`/`unfreezeBatch` — added typed batch freezing/unfreezing with size validation (#425)
- `EscrowModule.triggerAutoRelease` — now pre-flights `auto_release_after_ledger` eligibility before submitting (#426)
- `RecurringModule.executeAllDue` — routes `RECURRING_INTERVAL_NOT_ELAPSED` failures to `skipped[]` instead of `failed[]` (#427)
### Changed
- `VeriTixClient.healthCheck()` — returns `rpcReachable`, `contractFound`, and `latencyMs` for a lightweight RPC/contract health probe (#439)
- `VeriTixClient` constructor now validates `config.contractId` as a Soroban contract ID (#433)
- `TokenModule.transfer` now pre-flights an on-chain balance check and throws `INSUFFICIENT_BALANCE` when the sender lacks funds (#434)

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

