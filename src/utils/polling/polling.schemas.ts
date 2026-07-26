import { z } from 'zod';

export const txStatusSchema = z.enum([
  'SUCCESS',
  'FAILED',
  'NOT_FOUND',
]);

export const pollingConfigSchema = z.object({
  maxRetries: z.number().int().min(1),
  intervalMs: z.number().int().min(500),
});

export const pollingResultSchema = z.object({
  status: txStatusSchema,
  hash: z.string().min(1),
  error: z.string().optional(),
});
