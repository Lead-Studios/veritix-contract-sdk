# Escrow Batch Status Guide

This document describes the `batchGetEscrowStatus()` RPC method provided by the SDK to optimize UI rendering of multiple escrows.

## Architecture

1. **Escrow Module**:
   - `src/modules/escrow/escrow.service.ts`: Implements the batch lookup logic returning partial escrow state (only `status` fields) instead of full serialization.

2. **Validation Schemas & Interfaces**:
   - `batchEscrowStatusResultSchema` and `BatchEscrowStatusResult` defined in `src/modules/escrow/escrow.schemas.ts`.

3. **Testing**:
   - `tests/modules/escrow/escrow.service.spec.ts`: Validates that valid IDs return statuses and invalid IDs map to `failedIds`.
