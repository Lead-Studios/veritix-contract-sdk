import { z } from 'zod';

export const signerSchema = z.object({
  key: z.string().min(1),
  weight: z.number().int().min(0),
});

export const balanceSchema = z.object({
  assetType: z.string().min(1),
  balance: z.string().min(1),
});

export const accountInfoSchema = z.object({
  accountId: z.string().min(1),
  sequenceNumber: z.string().min(1),
  balances: z.array(balanceSchema),
  signers: z.array(signerSchema),
});
