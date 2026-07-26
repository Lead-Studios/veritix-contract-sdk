# Security Memo Validation Guide

This document explains the input sanitization enforced by `MemoValidationService` to prevent smart contract panics caused by malformed or oversized memo strings on Stellar.

## Architecture

1. **Memo Validation Service**:
   - `src/utils/validation/memo.service.ts`: Exposes `validate()` to check byte length against the 28-byte Stellar limit.

2. **Validation Schemas**:
   - `memoValidationResultSchema` ensures the output structure is consistent.

3. **Testing**:
   - Covered in `tests/utils/validation/memo.service.spec.ts`.
