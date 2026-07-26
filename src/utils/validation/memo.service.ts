import { MAX_MEMO_LENGTH, memoValidationResultSchema } from './memo.schemas';
import type { MemoValidationOptions, MemoValidationResult } from './memo.types';

export class MemoValidationService {
  /**
   * Validates and sanitizes a memo string to prevent contract panic on oversize.
   */
  public validate(options: MemoValidationOptions): MemoValidationResult {
    const { memo, enforceMaxLength } = options;
    const byteLength = Buffer.byteLength(memo, 'utf8');

    if (enforceMaxLength && byteLength > MAX_MEMO_LENGTH) {
      return memoValidationResultSchema.parse({
        isValid: false,
        sanitizedMemo: memo.substring(0, MAX_MEMO_LENGTH),
        error: `Memo exceeds max length of ${MAX_MEMO_LENGTH} bytes.`,
      });
    }

    return memoValidationResultSchema.parse({
      isValid: true,
      sanitizedMemo: memo,
    });
  }
}
