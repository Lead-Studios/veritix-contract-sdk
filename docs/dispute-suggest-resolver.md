# Dispute Resolver Lookup Guide

> **Status:** the SDK does **not** provide a `suggestResolver()` method. Earlier versions of this
> page described one; it was never implemented.

Use the existing `DisputeModule` reads instead (available as `client.dispute`):

```ts
// All disputes currently open
const open = await client.dispute.getOpenDisputes();

// Disputes assigned to a given resolver
const mine = await client.dispute.getDisputesByResolver(resolverAddress);

// State of one escrow's dispute
const dispute = await client.dispute.getDispute(escrowId);
```

Choosing a resolver (scoring, category matching) is left to your application.
