# Stellar Payment Flow Guide

End-to-end XLM payment flow for event ticket escrow.

## 1. Create Ticket Escrow

```typescript
const escrow = await client.escrow.createTicketEscrow({
  buyerId: 'GBUYER...',
  eventId: 'event_123',
  amountXlm: '100.00',
  refundDeadline: Math.floor(Date.now() / 1000) + 86400,
});
console.log(`Escrow ID: ${escrow.id}`);
```

## 2. Display Payment Instructions

```typescript
console.log(`Pay ${escrow.amount} XLM to ${escrow.address}`);
console.log(`Memo: ${escrow.memo}`);
```

## 3. Poll Order Status

```typescript
const checkStatus = setInterval(async () => {
  const status = await client.watchEscrow(escrow.id);
  if (status.confirmed) {
    clearInterval(checkStatus);
    console.log('Payment confirmed!');
  }
}, 5000);
```

## 4. Release Escrow

```typescript
await client.escrow.releaseEscrow(escrow.id);
console.log('Ticket issued, escrow released');
```

## 5. Handle Refunds

```typescript
await client.escrow.refundEscrow(escrow.id);
```

## 6. Handle Disputes

```typescript
await client.dispute.openDispute({
  escrowId: escrow.id,
  reason: 'Event cancelled',
});
```
