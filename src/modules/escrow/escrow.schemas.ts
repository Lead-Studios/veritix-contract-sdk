import { z } from 'zod';

export const escrowStatusSchema = z.enum([
  'PENDING',
  'FUNDED',
  'RELEASED',
  'REFUNDED',
  'DISPUTED',
]);

export const escrowStatusUpdateSchema = z.object({
  escrowId: z.string().min(1),
  status: escrowStatusSchema,
  lastUpdatedIso: z.string().min(1),
});

export const batchEscrowStatusResultSchema = z.object({
  statuses: z.array(escrowStatusUpdateSchema),
  failedIds: z.array(z.string()),
});
