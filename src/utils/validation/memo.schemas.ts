import { z } from 'zod';

// Stellar memos max length is 28 bytes
export const MAX_MEMO_LENGTH = 28;

export const memoValidationOptionsSchema = z.object({
  memo: z.string(),
  enforceMaxLength: z.boolean().default(true),
});

export const memoValidationResultSchema = z.object({
  isValid: z.boolean(),
  sanitizedMemo: z.string(),
  error: z.string().optional(),
});
