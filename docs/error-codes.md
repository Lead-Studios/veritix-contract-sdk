# Error Code Reference

All SDK methods throw a `VeriTixError` when a contract-level or client-side failure occurs.
Each error has a `code` property matching one of the `VeriTixErrorCode` enum values below.

```ts
import { VeriTixError, VeriTixErrorCode } from '@veritix/contract-sdk';

try {
  await client.escrow.releaseEscrow(1n);
} catch (err) {
  if (err instanceof VeriTixError) {
    console.error(err.code, err.message);
  }
}
```

---

## Error Code Table

### Escrow

| Code | Value | Thrown by | Cause | How to handle |
|------|-------|-----------|-------|---------------|
| `EscrowNotFound` | `ESCROW_NOT_FOUND` | `escrow.getEscrow`, `releaseEscrow`, `refundEscrow` | The escrow ID does not exist on-chain | Verify the ID is correct; treat as a user error |
| `EscrowAlreadySettled` | `ESCROW_ALREADY_SETTLED` | `escrow.releaseEscrow`, `refundEscrow` | The escrow was already released or refunded | Check `EscrowRecord.released / refunded` before calling; safe to ignore |
| `EscrowNotExpired` | `ESCROW_NOT_EXPIRED` | `escrow.refundEscrow` | The current ledger is still before `expiryLedger` | Wait until the ledger advances past `expiryLedger` before retrying |
| `EscrowUnauthorized` | `ESCROW_UNAUTHORIZED` | `escrow.releaseEscrow`, `refundEscrow` | Caller is not the depositor or beneficiary | Ensure the signing `Keypair` matches the expected party |

### Dispute

| Code | Value | Thrown by | Cause | How to handle |
|------|-------|-----------|-------|---------------|
| `DisputeAlreadyOpen` | `DISPUTE_ALREADY_OPEN` | `dispute.openDispute` | A dispute already exists for this escrow | Check `DisputeRecord.status` first; safe to ignore if `Open` |
| `DisputeNotFound` | `DISPUTE_NOT_FOUND` | `dispute.getDispute`, `resolveDispute` | The dispute ID does not exist | Verify the ID; treat as a user error |
| `DisputeAlreadyResolved` | `DISPUTE_ALREADY_RESOLVED` | `dispute.resolveDispute` | Dispute was already resolved | No further action required |
| `DisputeInvalidState` | `DISPUTE_INVALID_STATE` | `dispute.resolveDispute` | Dispute state does not permit this operation | Refresh the dispute record and re-evaluate |

### Split

| Code | Value | Thrown by | Cause | How to handle |
|------|-------|-----------|-------|---------------|
| `SplitNotFound` | `SPLIT_NOT_FOUND` | `splitter.getSplit`, `distribute` | The split ID does not exist | Verify the ID; treat as a user error |
| `SplitInvalidShares` | `SPLIT_INVALID_SHARES` | `splitter.createSplit` | Recipient `shareBps` values do not sum to 10 000 | Recalculate shares so they sum exactly to 10 000 BPS |
| `SplitAlreadyDistributed` | `SPLIT_ALREADY_DISTRIBUTED` | `splitter.distribute` | Funds were already distributed | Check `SplitRecord.distributed`; no retry needed |

### Recurring

| Code | Value | Thrown by | Cause | How to handle |
|------|-------|-----------|-------|---------------|
| `RecurringNotFound` | `RECURRING_NOT_FOUND` | `recurring.getRecurring`, `execute`, `cancel` | Recurring record does not exist | Verify the ID; treat as a user error |
| `RecurringIntervalNotElapsed` | `RECURRING_INTERVAL_NOT_ELAPSED` | `recurring.execute` | Charge interval has not yet passed | Wait until the next interval and retry |

### Token

| Code | Value | Thrown by | Cause | How to handle |
|------|-------|-----------|-------|---------------|
| `InvalidAmount` | `INVALID_AMOUNT` | `token.mint`, `burn`, `transfer` | Amount is zero or negative | Validate amount > 0n before calling |
| `InsufficientBalance` | `INSUFFICIENT_BALANCE` | `token.transfer`, `burn` | Account balance is too low | Check balance via `token.balance(address)` first |
| `InsufficientAllowance` | `INSUFFICIENT_ALLOWANCE` | `token.transfer` | Spender allowance is insufficient | Call `token.approve` with an adequate amount first |

### Admin

| Code | Value | Thrown by | Cause | How to handle |
|------|-------|-----------|-------|---------------|
| `AdminUnauthorized` | `ADMIN_UNAUTHORIZED` | `admin.*` | Caller is not the contract admin | Ensure the correct admin `Keypair` is used |
| `AccountFrozen` | `ACCOUNT_FROZEN` | `token.transfer`, `token.burn` | Target account has been frozen | Contact the admin to unfreeze; do not retry |
| `ContractPaused` | `CONTRACT_PAUSED` | All write methods | Contract is paused by the admin | Wait for the contract to be unpaused; retry later |

### Client-side / General

| Code | Value | Thrown by | Cause | How to handle |
|------|-------|-----------|-------|---------------|
| `ConnectionFailed` | `CONNECTION_FAILED` | `client.connect()` | RPC endpoint unreachable after all retries | Check network/RPC URL; retry with backoff |
| `ReadOnlyClient` | `READ_ONLY_CLIENT` | Any write method | No `Keypair` was provided at construction | Re-instantiate `VeriTixClient` with a `Keypair` |
| `BatchTooLarge` | `BATCH_TOO_LARGE` | `batch.*` | Batch exceeds the maximum allowed size | Split the batch into smaller chunks |
| `WatchTimeout` | `WATCH_TIMEOUT` | `client.watchEscrow()` | Escrow did not settle within `timeoutMs` | Increase `timeoutMs` or implement manual polling |
| `Unauthorized` | `UNAUTHORIZED` | Various | General authorisation failure | Check that the signing key matches the expected account |
| `Unknown` | `UNKNOWN` | Any method | Panic string could not be mapped to a known code | Log `err.rawMessage` and report as a bug |

---

## Accessing Raw Error Information

Every `VeriTixError` exposes:

- `code` — the `VeriTixErrorCode` enum value
- `message` — a human-readable description
- `rawMessage` — the original panic string from the Soroban RPC (useful for debugging)

```ts
catch (err) {
  if (err instanceof VeriTixError) {
    console.error('[code]', err.code);
    console.error('[message]', err.message);
    console.error('[raw]', err.rawMessage);
  }
}
```

You can also call `parseSorobanError(rawError)` directly when working at the Stellar SDK level.
