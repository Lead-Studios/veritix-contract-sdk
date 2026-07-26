# Deprecated Symbols

This document lists every symbol in `@veritix/contract-sdk` that has been
marked `@deprecated`.  Each entry includes the deprecation reason, the
recommended replacement, and the version in which the deprecated symbol is
scheduled for removal.

Contributors **must not** copy deprecated patterns into new code.  If you
encounter a symbol marked `@deprecated` while working on the codebase, prefer
the replacement shown below.

---

## `buildContractCall` — unused `server` parameter

| | |
|---|---|
| **Symbol** | `buildContractCall(server, sourceAccount, contractId, method, args, networkPassphrase)` |
| **File** | `src/utils/transaction.ts` |
| **Deprecated since** | v1.x |
| **Target removal** | v2.0.0 |

### What is deprecated

The first parameter `server: SorobanRpc.Server` is **not used** inside
`buildContractCall`.  It was included in the original signature to mirror the
shape of `simulateTransaction`, but the build phase only needs the
`sourceAccount`, `contractId`, `method`, `args`, and `networkPassphrase`.
Keeping an unused parameter in a public API is misleading and forces callers to
construct (or mock) a server object when they do not need one.

The parameter is currently silenced with `void server;` at the top of the
function body.

### Internal pattern to avoid

```ts
// ❌  Do NOT copy this pattern into new builder helpers
export async function buildContractCall(
  server: SorobanRpc.Server,  // ← unused, will be removed
  sourceAccount: Account,
  …
) {
  void server; // ← signals the parameter is intentionally ignored
  …
}
```

### Migration path

A new overload `buildContractCallV2` will be introduced that omits the
`server` parameter entirely:

```ts
// ✅  Future API (v2.0.0)
export async function buildContractCallV2(
  sourceAccount: Account,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  networkPassphrase: string,
): Promise<Transaction>
```

Until `buildContractCallV2` is available, keep calling `buildContractCall` as
before — the deprecation warning is informational.  When upgrading to v2,
remove the `server` argument from every call-site.

**Search pattern for call-sites:**

```bash
grep -rn "buildContractCall(" src/ tests/
```

---

## `Keypair.random()` for simulation source accounts

| | |
|---|---|
| **Symbol** | Use of `Keypair.random()` to generate a throwaway simulation account |
| **File** | Previously scattered across module helpers; replaced by `DUMMY_PUBLIC_KEY` |
| **Deprecated since** | v1.x |
| **Target removal** | Already removed — do not reintroduce |

### What was deprecated

Early versions of some module helpers called `Keypair.random()` to produce a
temporary source account for read-only Soroban simulations.  Generating a new
Ed25519 keypair on every call wastes CPU and produces non-deterministic
transaction envelopes that are harder to test.

### What replaced it

`DUMMY_PUBLIC_KEY` (exported from `src/utils/network.ts`) is a static,
deterministic public key derived from a fixed 32-byte seed (`0x11 * 32`).
It is a valid Ed25519 key with a correct Stellar checksum but is not funded
on any network, making it safe to use as the source for simulations.

```ts
// ✅  Correct pattern
import { DUMMY_PUBLIC_KEY } from '../utils/network';

const sourceAccount = new Account(DUMMY_PUBLIC_KEY, '0');
const tx = await buildContractCall(server, sourceAccount, …);
```

```ts
// ❌  Do NOT use Keypair.random() for simulation source accounts
const sourceAccount = new Account(Keypair.random().publicKey(), '0');
```

---

## Adding new deprecations

When you deprecate a symbol:

1. Add a `@deprecated` JSDoc tag to the symbol with:
   - A short reason.
   - The replacement or migration path.
   - The target removal version (e.g. `Target removal: v2.0.0`).

2. Add an entry to this file following the template above.

3. If the symbol is exported from `src/index.ts`, mark it there too.

4. Open a tracking issue (or reference an existing one) so the removal is
   scheduled in the correct milestone.
