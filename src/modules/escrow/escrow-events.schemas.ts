import { z } from 'zod';

export const escrowEventTypeSchema = z.enum([
  'CREATED',
  'FUNDED',
  'RELEASE_REQUESTED',
  'RELEASED',
  'DISPUTED',
  'REFUNDED',
]);

export const escrowEventPayloadSchema = z.object({
  escrowId: z.string().min(1),
  eventType: escrowEventTypeSchema,
  timestampIso: z.string().min(1),
  txHash: z.string().min(1),
});

export const watchOptionsSchema = z.object({
  pollingIntervalMs: z.number().int().min(1000).optional().default(5000),
  maxEvents: z.number().int().min(1).optional(),
});
