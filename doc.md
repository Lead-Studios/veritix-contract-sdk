# Documentation for Veritix Contract SDK

## Overview

The **Veritix Contract SDK** provides a TypeScript/JavaScript client for interacting with Veritix smart contracts on the Stellar Soroban network. It abstracts low‑level Soroban RPC calls, offers type‑safe helpers, and includes utilities for handling payments, splitters, recurring modules, and more.

## Goals

- Simplify contract interaction for developers.
- Provide client‑side validation utilities.
- Ensure compatibility with both testnet and mainnet environments.
- Offer clear error handling and mapping via `parseSorobanError`.

## Getting Started

1. **Installation**
   ```bash
   npm install @veritix/contract-sdk
   ```
2. **Configuration**
   Create a `.env` file (or use environment variables) with:
   ```dotenv
   NEXT_PUBLIC_SOROBAN_RPC_URL=https://testnet.soroban.network
   NEXT_PUBLIC_NETWORK_PASSPHRASE=Test S");
   ```
3. **Usage Example**
   ```typescript
   import { VeritixClient } from "@veritix/contract-sdk";

   const client = new VeritixClient({
     rpcUrl: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL!,
     networkPassphrase: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!,
   });

   // Example: creating a payment split
   const result = await client.splitter.createSplit({
     recipients: [
       { address: "G...", basisPoints: 5000 },
       { address: "G...", basisPoints: 5000 },
     ],
   });
   console.log(result);
   ```

## Modules

- **RecurringModule** – Manage recurring payments (create, cancel, pause, resume, query). 
- **SplitterModule** – Validate and create payment splits, ensuring basis‑point constraints. 
- **Utility Functions** – Validation helpers, error parsing, and ledger queries.

## Testing

Run the test suite with:
```bash
npm test
```
The SDK includes comprehensive unit tests for each module under `tests/`.

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Ensure all tests pass (`npm test`).
4. Submit a pull request with a clear description.

## License

MIT © Veritix
