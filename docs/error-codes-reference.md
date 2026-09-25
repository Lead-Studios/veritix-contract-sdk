# VeriTix Error Codes Reference Guide

## VeriTixErrorCode Summary

| Error Code | Category | Description | Handling Strategy |
| :--- | :--- | :--- | :--- |
| `UNAUTHORIZED` | Auth | Caller is not authorized for this operation | Verify admin signature or keypair authorization |
| `INVALID_BATCH_SIZE` | Batch | Batch array length exceeds maximum capacity (100) | Chunk request into batches of 100 or smaller |
| `ESCROW_EXPIRED` | Escrow | Target escrow instance has passed expiration ledger | Trigger auto-release or refund handler |
| `INSUFFICIENT_FUNDS` | Payment | Account lacks balance to complete transfer | Top up balance before re-attempting tx |
| `CONTRACT_PAUSED` | Lifecycle | Operations paused by contract admin | Wait for contract unpause event |
