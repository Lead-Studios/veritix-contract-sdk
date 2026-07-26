# Fix Tx Polling Guide

This document describes the fix for `submitTransaction` polling to correctly differentiate `FAILED` statuses from `NOT_FOUND`.

## Architecture

1. **Polling Service**:
   - `src/utils/polling/polling.service.ts`: Exposes `checkStatus()` which now throws immediately if a transaction explicitly fails on ledger, rather than retrying indefinitely until max timeout.

2. **Validation Schemas**:
   - `txStatusSchema` strictly enforces the state machine.

3. **Testing**:
   - Covered in `tests/utils/polling/polling.service.spec.ts`.
