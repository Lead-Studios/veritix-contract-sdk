# Error Handling Guide

## VeriTixErrorCode Decision Tree

This guide helps you handle every possible VeriTixErrorCode.

### Network Errors
- **NETWORK_TIMEOUT**: Transaction submission timed out
- **NETWORK_UNREACHABLE**: Network connection lost

### Validation Errors
- **INVALID_AMOUNT**: Amount must be positive
- **INVALID_ADDRESS**: Stellar address format invalid

### Transaction Errors
- **TX_FAILED**: Transaction execution failed
- **INSUFFICIENT_BALANCE**: Not enough balance

### Retry Strategy
Use exponential backoff with jitter for transient errors.

### Example
```typescript
try {
  await client.transfer(amount, recipient);
} catch (error) {
  handleVeriTixError(error);
}
```
