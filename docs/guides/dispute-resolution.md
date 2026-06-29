# Dispute Resolution

This guide explains how disputes work in the VeriTix escrow system, who is allowed to do what, and how to wire the dispute lifecycle into a backend service. It covers the three parties involved, the contract-level `DisputeModule` exposed by this SDK, status mapping for user-facing messages, and a webhook-style pattern for keeping a database in sync with on-chain dispute events.

## 1. The three parties

Every dispute involves exactly three roles:

| Role | Who | What they can do |
|---|---|---|
| **Claimant** | The party who opens the dispute (usually the escrow depositor/buyer, but can be the beneficiary) | Calls `openDispute` |
| **Resolver** | A pre-designated arbitrator address, set when the escrow itself was created | Calls `resolveDispute` |
| **Beneficiary** | The other side of the escrow (e.g. the event organizer) | Affected by the ruling; cannot open or resolve the dispute themselves |

A dispute can only be opened by someone who is **not** the resolver — the SDK enforces this client-side (`resolver === claimant` throws before any transaction is built), and the contract enforces it again on-chain.

## 2. When a buyer opens a dispute vs. when an organizer does

Either side of an escrow can be the one to raise a dispute — the contract doesn't hard-code "only buyers can dispute." In practice:

- **Buyer opens a dispute** when the ticket/item wasn't delivered, doesn't match what was promised, or the organizer is unresponsive. The buyer is the claimant; funds in escrow are frozen until a resolver rules.
- **Organizer opens a dispute** when the buyer is fraudulently claiming non-delivery, attempting a chargeback-style reversal, or violating event terms (e.g. reselling a non-transferable ticket). The organizer is the claimant in this case.

In both cases the mechanics are identical — only the *reason* differs, which is why `evidence` exists as a free-text field (capped at 128 bytes) for the claimant to briefly state their case before a human resolver reviews it.

A dispute cannot be opened if:
- One is already open on that escrow (`DISPUTE_ALREADY_OPEN`)
- The escrow has already been settled/released (`ESCROW_ALREADY_SETTLED`)

## 3. How the backend calls `openDispute` on behalf of a user

Your NestJS backend should never hold a user's private key directly in request bodies. Instead, typical patterns are:

1. The backend holds a **service keypair** representing itself as a relay, **or**
2. The user signs the transaction client-side and the backend only submits it, **or**
3. For custodial setups, the backend retrieves a per-user keypair from a secrets vault and constructs the `VeriTixClient` per-request.

Below is a minimal example of pattern (3) — a `DisputeService` that wraps the SDK's `DisputeModule`:

```typescript
// dispute.service.ts
import { Injectable } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { VeriTixClient } from '@veritix/contract-sdk';

@Injectable()
export class DisputeService {
  constructor(private readonly config: VeriTixConfigService) {}

  async openDispute(
    userSecretKey: string,
    escrowId: bigint,
    resolverAddress: string,
    evidence?: string,
  ) {
    const keypair = Keypair.fromSecret(userSecretKey);
    const client = new VeriTixClient(this.config.networkConfig, keypair);

    try {
      const result = await client.dispute.openDispute(
        escrowId,
        resolverAddress,
        evidence,
      );
      return result;
    } catch (error) {
      // See section 4 for how to map this to a user-facing response
      throw this.toHttpError(error);
    }
  }
}
```

```typescript
// dispute.controller.ts
import { Body, Controller, Post, Req } from '@nestjs/common';
import { DisputeService } from './dispute.service';

@Controller('disputes')
export class DisputeController {
  constructor(private readonly disputeService: DisputeService) {}

  @Post('open')
  async open(@Req() req: AuthenticatedRequest, @Body() dto: OpenDisputeDto) {
    // userSecretKey would come from a secrets vault keyed by req.user.userId,
    // never from the request body itself.
    const userSecretKey = await this.vault.getSecret(req.user.userId);

    return this.disputeService.openDispute(
      userSecretKey,
      BigInt(dto.escrowId),
      dto.resolverAddress,
      dto.evidence,
    );
  }
}
```

> **Security note:** never accept a raw secret key in a request body from the client. The example above assumes the backend retrieves the key from a vault scoped to the authenticated user — this is the kind of mistake this guide exists to prevent.

## 4. How the resolver interface works

`resolveDispute` is the only method that changes a dispute's outcome, and it must be called by the resolver — not the claimant, not the beneficiary.

```typescript
async resolveDispute(
  disputeId: bigint,
  forBeneficiary: boolean,
  note?: string,
): Promise<TransactionResult>
```

- `disputeId` — the dispute to rule on.
- `forBeneficiary` — `true` rules in favor of the beneficiary (funds release to them), `false` rules in favor of the depositor (funds return to them).
- `note` — optional free text (max 128 bytes) explaining the ruling, stored on-chain.

> **Known SDK gotcha:** the JSDoc comment above `resolveDispute` in `dispute.ts` shows an outdated example (`resolveDispute({ disputeId, resolution: DisputeStatus.ResolvedForBeneficiary })`), but the actual method signature takes `(disputeId, forBeneficiary, note?)` as shown above. Use the real signature, not the doc comment's example.

Before submitting the resolution, the SDK re-fetches the dispute and validates:
- It exists at all → otherwise throws `DisputeNotFound`
- Its status is still `Open` → otherwise throws `DisputeAlreadyResolved`

Backend example:

```typescript
async resolveDispute(
  resolverSecretKey: string,
  disputeId: bigint,
  forBeneficiary: boolean,
  note?: string,
) {
  const keypair = Keypair.fromSecret(resolverSecretKey);
  const client = new VeriTixClient(this.config.networkConfig, keypair);

  return client.dispute.resolveDispute(disputeId, forBeneficiary, note);
}
```

Only addresses that were set as the `resolver` at dispute-open time can successfully submit this call — the contract rejects anyone else with an authorization error (mapped to `ADMIN_UNAUTHORIZED` by the SDK's error parser).

## 5. Mapping `DisputeStatus` to user-facing messages

```typescript
export enum DisputeStatus {
  Open = 'Open',
  ResolvedForBeneficiary = 'ResolvedForBeneficiary',
  ResolvedForDepositor = 'ResolvedForDepositor',
}
```

Suggested mapping for API responses or UI copy:

| `DisputeStatus` | User-facing message (claimant view) | User-facing message (beneficiary view) |
|---|---|---|
| `Open` | "Your dispute is under review by the resolver." | "A dispute has been opened against this escrow and is awaiting resolution." |
| `ResolvedForBeneficiary` | "The dispute was resolved in favor of the other party. Funds have been released to them." | "The dispute was resolved in your favor. Funds have been released to you." |
| `ResolvedForDepositor` | "The dispute was resolved in your favor. Your funds have been returned." | "The dispute was resolved in favor of the depositor. Funds have been returned to them." |

A small helper keeps this logic in one place instead of scattered across controllers:

```typescript
function describeDisputeStatus(
  status: DisputeStatus,
  viewerRole: 'claimant' | 'beneficiary',
): string {
  const messages: Record<DisputeStatus, Record<'claimant' | 'beneficiary', string>> = {
    [DisputeStatus.Open]: {
      claimant: 'Your dispute is under review by the resolver.',
      beneficiary: 'A dispute has been opened against this escrow and is awaiting resolution.',
    },
    [DisputeStatus.ResolvedForBeneficiary]: {
      claimant: 'The dispute was resolved in favor of the other party. Funds have been released to them.',
      beneficiary: 'The dispute was resolved in your favor. Funds have been released to you.',
    },
    [DisputeStatus.ResolvedForDepositor]: {
      claimant: 'The dispute was resolved in your favor. Your funds have been returned.',
      beneficiary: 'The dispute was resolved in favor of the depositor. Funds have been returned to them.',
    },
  };

  return messages[status][viewerRole];
}
```

## 6. Webhook-style flow: listening to contract events and syncing the database

The SDK doesn't push events to your backend — your backend has to actively poll or subscribe to the Soroban RPC ledger stream, detect dispute-related contract events, and update your own database to keep it consistent with on-chain state.

A typical flow looks like this:
Example polling-based listener:

```typescript
// dispute-sync.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VeriTixClient } from '@veritix/contract-sdk';

@Injectable()
export class DisputeSyncService {
  private readonly logger = new Logger(DisputeSyncService.name);

  constructor(
    private readonly client: VeriTixClient,
    private readonly disputeRepository: DisputeRepository,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async syncOpenDisputes() {
    const openDisputeIds = await this.client.dispute.getOpenDisputes();

    for (const id of openDisputeIds) {
      const onChain = await this.client.dispute.getDispute(id);
      if (!onChain) continue;

      const existing = await this.disputeRepository.findByOnChainId(id);

      if (!existing) {
        await this.disputeRepository.create({
          onChainId: id,
          status: onChain.status,
          openedAtLedger: onChain.openedAt,
        });
        this.logger.log(`New dispute detected: ${id}`);
        // notify parties here
        continue;
      }

      if (existing.status !== onChain.status) {
        await this.disputeRepository.updateStatus(existing.id, onChain.status);
        this.logger.log(`Dispute ${id} status changed to ${onChain.status}`);
        // notify parties of the resolution here
      }
    }
  }
}
```

This polling approach is simple and resilient — it doesn't depend on a persistent event-stream connection — but it means status changes are detected on the next poll cycle, not instantly. If your application needs near-real-time updates, replace the `@Cron` polling with a Soroban RPC event subscription and keep the same upsert logic in the callback.

## 7. Full example: end-to-end dispute lifecycle

```typescript
import { Keypair } from '@stellar/stellar-sdk';
import { VeriTixClient, DisputeStatus } from '@veritix/contract-sdk';

async function disputeLifecycleExample() {
  const buyerKeypair = Keypair.fromSecret(process.env.BUYER_SECRET!);
  const resolverKeypair = Keypair.fromSecret(process.env.RESOLVER_SECRET!);

  const buyerClient = new VeriTixClient(networkConfig, buyerKeypair);
  const resolverClient = new VeriTixClient(networkConfig, resolverKeypair);

  // 1. Buyer opens a dispute
  await buyerClient.dispute.openDispute(
    1n,
    resolverKeypair.publicKey(),
    'Ticket was never delivered',
  );

  // 2. Backend (or anyone) can check dispute status
  const isOpen = await buyerClient.dispute.isDisputeOpen(1n);
  console.log('Dispute open?', isOpen); // true

  // 3. Resolver reviews evidence (off-chain) and rules
  await resolverClient.dispute.resolveDispute(
    1n,
    /* forBeneficiary */ false,
    'Evidence supports non-delivery; funds returned to depositor',
  );

  // 4. Anyone can fetch the final record
  const finalRecord = await buyerClient.dispute.getDispute(1n);
  console.log('Final status:', finalRecord?.status); // DisputeStatus.ResolvedForDepositor
}
```

## Summary

- **Claimant** opens, **resolver** rules, **beneficiary** is affected — never the other way around.
- The backend should hold or retrieve signing keys through a secrets vault, never accept them from request bodies.
- Always check live dispute status with `isDisputeOpen` / `getDispute` before assuming a cached DB value is current.
- Use `describeDisputeStatus`-style mapping so user-facing copy lives in one place, not scattered across controllers.
- Sync your database to on-chain state via polling or event subscription — the chain is always the source of truth, the DB is a read-optimized mirror of it.