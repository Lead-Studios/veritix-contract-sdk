# Escrow Watch Status Guide

> **Status:** the SDK does **not** provide a `watchEscrowStatus()` event emitter. Earlier versions
> of this page described one; it was never implemented.

Use `client.watchEscrow()`, an async iterator that yields when an escrow's state changes and
completes once it is settled (released or refunded):

```ts
for await (const record of client.watchEscrow(escrowId, { intervalMs: 2_000, timeoutMs: 120_000 })) {
  console.log('escrow update:', record.released ? 'released' : record.refunded ? 'refunded' : 'changed');
}
```

It throws `VeriTixError` with code `WatchTimeout` if the timeout elapses before the escrow
settles. The first observation is only a baseline; read the current state with
`client.escrow.getEscrow(id)` first if you need it.
