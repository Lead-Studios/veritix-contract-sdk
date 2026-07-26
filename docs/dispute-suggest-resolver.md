# Dispute Suggest Resolver Guide

This document covers the implementation of the `suggestResolver` functionality within the Veritix SDK.

## Architecture

1. **Dispute Module**:
   - `src/modules/dispute/dispute.service.ts`: Exposes `suggestResolver(category)` to fetch scored resolvers from the off-chain Veritix registry.

2. **Validation Schemas**:
   - `suggestResolverResultSchema` ensures the data returned from the registry conforms to the SDK's internal `DisputeResolver` typing.

3. **Testing**:
   - Covered in `tests/modules/dispute/dispute.service.spec.ts`.
