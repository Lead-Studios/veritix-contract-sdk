import { z } from 'zod';

export const disputeResolverSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1),
  score: z.number().min(0).max(100),
  completedDisputes: z.number().int().min(0),
  specialization: z.array(z.string()),
});

export const suggestResolverResultSchema = z.object({
  resolvers: z.array(disputeResolverSchema),
  registryUrl: z.string().url(),
});
