# Splitter BPS Validation Guide

This document explains the input validation logic added to `SplitterModule.createRevenueSplit` to prevent the platform from receiving a negative revenue share on Stellar.

## Architecture

1. **Splitter Service**:
   - `src/modules/splitter/splitter.service.ts`: Exposes `createRevenueSplit()` and enforces that `organizerBps + artistBps <= 10000`.

2. **Validation Schemas**:
   - `splitConfigSchema` ensures the input types are integers between 0 and 10000.

3. **Testing**:
   - Covered in `tests/modules/splitter/splitter.service.spec.ts`.
