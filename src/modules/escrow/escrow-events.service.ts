import { EventEmitter } from 'events';
import { watchOptionsSchema, escrowEventPayloadSchema } from './escrow-events.schemas';
import type { WatchOptions, EscrowEventPayload } from './escrow-events.types';

export class EscrowEventsService extends EventEmitter {
  private isWatching = false;
  private timer: NodeJS.Timeout | null = null;

  public watchEscrowStatus(escrowId: string, options?: WatchOptions): void {
    const opts = watchOptionsSchema.parse(options || {});
    this.isWatching = true;

    // Simulate polling
    this.timer = setInterval(() => {
      if (!this.isWatching) return;
      
      const payload: EscrowEventPayload = {
        escrowId,
        eventType: 'FUNDED',
        timestampIso: new Date().toISOString(),
        txHash: '0xabc123...',
      };

      this.emit('escrow_event', escrowEventPayloadSchema.parse(payload));
    }, opts.pollingIntervalMs);
  }

  public stopWatching(): void {
    this.isWatching = false;
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}
