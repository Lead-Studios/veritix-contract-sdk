# Client Estimate Fee Guide

This document covers the `estimateFee()` functionality, which allows clients to preview transaction costs on Stellar before finalizing a signature.

## Architecture

1. **Fee Service**:
   - `src/core/fee/fee.service.ts`: Exposes `estimateFee(txPayload)` to calculate the expected XLM and Stroops cost.

2. **Validation Schemas**:
   - `feeEstimateSchema` validates the API return type to strictly contain compute, storage, and base fee breakdowns.

3. **Testing**:
   - Covered in `tests/core/fee/fee.service.spec.ts`.
