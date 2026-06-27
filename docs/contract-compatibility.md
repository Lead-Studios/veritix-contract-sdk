# Contract Compatibility

This document describes which versions of the `veritix-contract` Soroban smart contract are
supported by each release of the `@veritix/contract-sdk`, and how to handle version mismatches.

---

## Compatibility Matrix

| SDK version | Contract version | Notes |
|-------------|-----------------|-------|
| `0.1.x`     | `1.0.x`         | Initial release — escrow, dispute, split, recurring, admin, batch |

---

## Checking the Deployed Contract Version

Use `client.getContractMetadata()` to retrieve metadata from the live contract, including the
version field when it is exposed:

```ts
import { VeriTixClient, getTestnetConfig } from '@veritix/contract-sdk';
import { Keypair } from '@stellar/stellar-sdk';

const client = new VeriTixClient(getTestnetConfig(process.env.CONTRACT_ID!));
await client.connect();

const metadata = await client.getContractMetadata();
console.log('Contract ID:', metadata.contractId);
console.log('Network:',     metadata.network);
// name / symbol / decimal / totalSupply are also available
```

If the contract exposes a dedicated `version` entry-point, you can call it via
`client.simulate('version', [])` and inspect the return value.

---

## What to Do When Versions Do Not Match

If the SDK and the deployed contract are out of sync you may see:

- Unexpected `UNKNOWN` errors from `parseSorobanError`.
- Method calls that return incorrect or missing data.
- XDR deserialisation failures.

**Recommended steps:**

1. Check the deployed contract version against the matrix above.
2. If the contract is newer, upgrade to the latest SDK release:
   ```bash
   npm install @veritix/contract-sdk@latest
   ```
3. If the contract is older, pin the SDK to the compatible version:
   ```bash
   npm install @veritix/contract-sdk@0.1.x
   ```
4. If you manage the contract deployment, redeploy with the version that matches your SDK.

---

## Breaking Changes Between Contract Versions

### Contract `1.0.x` → SDK `0.1.x`

- Initial public interface — no prior version to migrate from.
- All entry-points documented in the [README](../README.md) are stable.

### Future Versions

Breaking changes will be documented here with:

- Which entry-points were added, changed, or removed.
- Which SDK methods are affected.
- A migration guide.

---

## Keeping in Sync

Subscribe to [releases](https://github.com/Lead-Studios/veritix-contract-sdk/releases) on GitHub
to be notified of new SDK versions. Each release tag notes the minimum compatible contract version.
