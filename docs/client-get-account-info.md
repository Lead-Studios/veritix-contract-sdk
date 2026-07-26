# Client Account Info Guide

This document describes the `getAccountInfo()` method provided by the core `VeriTixClient` to fetch Stellar account state.

## Architecture

1. **Account Core Module**:
   - `src/core/account/account.service.ts`: Exposes `getAccountInfo(accountId)` to fetch account data from the configured Horizon node.

2. **Validation Schemas**:
   - `accountInfoSchema` ensures the data returned from Horizon conforms to the SDK's internal typings.

3. **Testing**:
   - Covered in `tests/core/account/account.service.spec.ts`.
