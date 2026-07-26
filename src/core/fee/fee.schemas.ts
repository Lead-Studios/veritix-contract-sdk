import { z } from 'zod';

export const feeComponentsSchema = z.object({
  baseFee: z.number().int().min(0),
  computeCost: z.number().int().min(0),
  storageCost: z.number().int().min(0),
});

export const feeEstimateSchema = z.object({
  transactionId: z.string().min(1),
  totalFeeXlm: z.string().min(1),
  totalFeeStroops: z.string().min(1),
  components: feeComponentsSchema,
});
