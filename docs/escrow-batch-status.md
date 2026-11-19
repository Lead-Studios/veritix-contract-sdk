# Escrow Batch Status Guide

> **Status:** the SDK does **not** provide a `batchGetEscrowStatus()` method. Earlier versions of
> this page described one; it was never implemented.

To read several escrows in one call use `getEscrowsBatch()`. It returns one entry per id, or
`null` for an id that does not exist:

```ts
const records = await client.escrow.getEscrowsBatch([1n, 2n, 3n]);

records.forEach((record, i) => {
  if (!record) return console.warn(`escrow ${i + 1} not found`);
  console.log(record.released ? 'released' : record.refunded ? 'refunded' : 'open');
});
```

For a single escrow, `client.escrow.isSettled(id)` returns whether it is released or refunded.
