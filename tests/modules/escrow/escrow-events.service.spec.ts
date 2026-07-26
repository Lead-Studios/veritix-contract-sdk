import { EscrowEventsService } from '../../../src/modules/escrow/escrow-events.service';
import type { EscrowEventPayload } from '../../../src/modules/escrow/escrow-events.types';

describe('EscrowEventsService', () => {
  let service: EscrowEventsService;

  beforeEach(() => {
    service = new EscrowEventsService();
  });

  afterEach(() => {
    service.stopWatching();
  });

  it('should emit escrow_event at specified interval', (done) => {
    service.on('escrow_event', (payload: EscrowEventPayload) => {
      expect(payload.escrowId).toBe('test_escrow_id');
      expect(payload.eventType).toBe('FUNDED');
      done();
    });

    service.watchEscrowStatus('test_escrow_id', { pollingIntervalMs: 1000 });
  });
});
