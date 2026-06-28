# Ticket Purchase — End-to-End NestJS Integration Guide

This guide shows how to integrate the `@veritix/contract-sdk` into a NestJS backend that manages ticket sales via on-chain escrow.

---

## 1. Installation

```bash
npm install @veritix/contract-sdk @stellar/stellar-sdk
```

---

## 2. Create a `VeriTixModule`

Wrap the client in a NestJS module so it can be injected as a singleton provider.

```ts
// veritix/veritix.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Keypair } from '@stellar/stellar-sdk';
import { VeriTixClient, getTestnetConfig } from '@veritix/contract-sdk';
import { VeriTixService } from './veritix.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: VeriTixClient,
      useFactory: async (config: ConfigService) => {
        const client = new VeriTixClient(
          getTestnetConfig(config.getOrThrow('CONTRACT_ID')),
          Keypair.fromSecret(config.getOrThrow('STELLAR_SECRET_KEY')),
        );
        await client.connect();
        return client;
      },
      inject: [ConfigService],
    },
    VeriTixService,
  ],
  exports: [VeriTixService],
})
export class VeriTixModule {}
```

---

## 3. Service Methods

### 3.1 `createTicketEscrow` — Lock funds at purchase

```ts
// veritix/veritix.service.ts
import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { VeriTixClient, VeriTixError, VeriTixErrorCode, assertValidAddress } from '@veritix/contract-sdk';

@Injectable()
export class VeriTixService {
  constructor(private readonly client: VeriTixClient) {}

  /**
   * Lock ticket price in escrow on behalf of a buyer.
   * Funds are released to the organizer on event completion.
   */
  async createTicketEscrow(
    orderId: string,
    buyerAddress: string,
    organizerAddress: string,
    priceXLM: number,
    eventLedger: number,
  ) {
    assertValidAddress(buyerAddress, 'buyerAddress');
    assertValidAddress(organizerAddress, 'organizerAddress');

    try {
      const result = await this.client.escrow.createEscrow({
        beneficiary: organizerAddress,
        amount: BigInt(Math.round(priceXLM * 10_000_000)), // XLM → stroops
        expiryLedger: eventLedger + 17_280,               // ~1 day buffer
        memos: [`order:${orderId}`],
      });

      const confirmed = await this.client.watchTransaction(result.hash, {
        intervalMs: 2_000,
        timeoutMs: 30_000,
      });

      return { escrowId: result.returnValue, txHash: confirmed.hash };
    } catch (err) {
      this.handleError(err);
    }
  }

  // -------------------------------------------------------------------------

  /**
   * Batch-release all escrows for a completed event (organizer receives funds).
   */
  async confirmEventCompletion(eventId: string, escrowIds: bigint[]) {
    const results = await Promise.allSettled(
      escrowIds.map((id) => this.client.escrow.releaseEscrow(id)),
    );

    const failed = results
      .map((r, i) => (r.status === 'rejected' ? escrowIds[i] : null))
      .filter(Boolean) as bigint[];

    if (failed.length > 0) {
      throw new InternalServerErrorException(
        `Event ${eventId}: failed to release escrows: ${failed.join(', ')}`,
      );
    }
  }

  // -------------------------------------------------------------------------

  /**
   * Batch-refund all escrows for a cancelled event (buyers reclaim funds).
   */
  async cancelEvent(eventId: string, escrowIds: bigint[]) {
    const results = await Promise.allSettled(
      escrowIds.map((id) => this.client.escrow.refundEscrow(id)),
    );

    const failed = results
      .map((r, i) => (r.status === 'rejected' ? escrowIds[i] : null))
      .filter(Boolean) as bigint[];

    if (failed.length > 0) {
      throw new InternalServerErrorException(
        `Event ${eventId}: failed to refund escrows: ${failed.join(', ')}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Error mapping
  // -------------------------------------------------------------------------

  private handleError(err: unknown): never {
    if (err instanceof VeriTixError) {
      switch (err.code) {
        case VeriTixErrorCode.InvalidAddress:
          throw new BadRequestException(err.message);
        case VeriTixErrorCode.AccountFrozen:
          throw new BadRequestException('Buyer or organizer account is frozen.');
        case VeriTixErrorCode.ContractPaused:
          throw new InternalServerErrorException('Contract is currently paused.');
        case VeriTixErrorCode.WatchTimeout:
          throw new InternalServerErrorException('Transaction confirmation timed out.');
        default:
          throw new InternalServerErrorException(`Contract error [${err.code}]: ${err.message}`);
      }
    }
    throw new InternalServerErrorException('Unexpected error.');
  }
}
```

---

## 4. Controller Example

```ts
// tickets/tickets.controller.ts
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { VeriTixService } from '../veritix/veritix.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly veritix: VeriTixService) {}

  @Post('purchase')
  @HttpCode(HttpStatus.CREATED)
  async purchase(
    @Body()
    body: {
      orderId: string;
      buyerAddress: string;
      organizerAddress: string;
      priceXLM: number;
      eventLedger: number;
    },
  ) {
    return this.veritix.createTicketEscrow(
      body.orderId,
      body.buyerAddress,
      body.organizerAddress,
      body.priceXLM,
      body.eventLedger,
    );
  }

  @Post('confirm-event')
  async confirmEvent(@Body() body: { eventId: string; escrowIds: string[] }) {
    await this.veritix.confirmEventCompletion(
      body.eventId,
      body.escrowIds.map(BigInt),
    );
    return { ok: true };
  }

  @Post('cancel-event')
  async cancelEvent(@Body() body: { eventId: string; escrowIds: string[] }) {
    await this.veritix.cancelEvent(body.eventId, body.escrowIds.map(BigInt));
    return { ok: true };
  }
}
```

---

## 5. Environment Variables

```env
# .env
CONTRACT_ID=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
STELLAR_SECRET_KEY=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

---

## 6. Error Handling Reference

| `VeriTixErrorCode`    | HTTP status | Meaning                                      |
|-----------------------|-------------|----------------------------------------------|
| `INVALID_ADDRESS`     | 400         | Malformed Stellar public key supplied        |
| `ACCOUNT_FROZEN`      | 400         | Buyer or organizer account is frozen         |
| `CONTRACT_PAUSED`     | 503         | Admin has paused the contract                |
| `ESCROW_NOT_EXPIRED`  | 409         | Refund requested before expiry ledger        |
| `WATCH_TIMEOUT`       | 504         | RPC confirmation took longer than configured |
| `TRANSACTION_FAILED`  | 502         | Stellar network rejected the transaction     |
