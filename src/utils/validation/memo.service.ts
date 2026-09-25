/**
 * @module utils/validation/memo.service
 * {@link MemoValidationService} — validates memo type and byte length
 * (issue #603).
 *
 * Stellar memos have hard limits — a `MEMO_TEXT` caps at 28 bytes — that are
 * easy to exceed from free-form user input. This service centralises the
 * check, reporting the limit and the supplied length, and returns a
 * sanitised, truncated value so a UI can still persist a usable memo.
 */
import { MEMO_MAX_BYTES } from './memo.types';
import type { MemoValidationOptions, MemoValidationResult } from './memo.types';

export class MemoValidationService {
  /**
   * Validates `options.memo`.
   *
   * When the memo exceeds the 28-byte limit (and `enforceMaxLength` is set),
   * the result is marked invalid with an error naming the limit and the memo
   * is truncated to the first 28 bytes, keeping `sanitizedMemo` usable.
   */
  validate(options: MemoValidationOptions): MemoValidationResult {
    const memo = typeof options.memo === 'string' ? options.memo : '';
    const bytes = utf8ByteLength(memo);

    if (options.enforceMaxLength && bytes > MEMO_MAX_BYTES) {
      return {
        isValid: false,
        sanitizedMemo: truncateToBytes(memo, MEMO_MAX_BYTES),
        error: `Memo exceeds max length of ${MEMO_MAX_BYTES} bytes (got ${bytes})`,
      };
    }

    return { isValid: true, sanitizedMemo: memo };
  }
}

/** Returns the number of UTF-8 bytes in `value` without a TextEncoder. */
function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.codePointAt(i)!;
    if (code > 0xffff) i++; // consumed a surrogate pair
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/** Truncates `value` so its UTF-8 byte length is at most `maxBytes`. */
function truncateToBytes(value: string, maxBytes: number): string {
  let bytes = 0;
  const chars: string[] = [];
  for (const char of Array.from(value)) {
    const size = utf8ByteLength(char);
    if (bytes + size > maxBytes) break;
    bytes += size;
    chars.push(char);
  }
  return chars.join('');
}