import { z } from 'zod';

export const splitConfigSchema = z.object({
  organizerBps: z.number().int().min(0).max(10000),
  artistBps: z.number().int().min(0).max(10000),
});

export const bpsValidationResultSchema = z.object({
  isValid: z.boolean(),
  platformBps: z.number().int(),
  error: z.string().optional(),
});
