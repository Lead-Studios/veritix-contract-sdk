/**
 * @module utils/validation/memo.types
 * Shared types for memo validation (issue #603).
 *
 * Stellar MEMO_TEXT is capped at 28 bytes, so length checks are byte-based —
 * multi-byte (non-ASCII) characters count more than a single code unit.
 */

/** Maximum byte length of a Stellar `MEMO_TEXT` value. */
export const MEMO_MAX_BYTES = 28;

/** Expected memo types supported by the SDK. */
export type MemoType = 'text' | 'none' | 'hash' | 'return';

/** Options accepted by {@link MemoValidationService.validate}. */
export interface MemoValidationOptions {
  /** The memo value supplied by the user. */
  memo: string;
  /** When `true`, reject memos whose UTF-8 byte length exceeds 28. */
  enforceMaxLength?: boolean;
  /** When `true`, enforce the memo type. Defaults to `'text'`. */
  type?: MemoType;
}

/** Result of {@link MemoValidationService.validate}. */
export interface MemoValidationResult {
  /** Whether the memo passed validation. */
  isValid: boolean;
  /** The memo with invalid characters stripped; truncated to 28 bytes. */
  sanitizedMemo: string;
  /** Human-readable reason when `isValid` is `false`; `undefined` otherwise. */
  error?: string;
}

/**
 * Thrown when a memo exceeds {@link MEMO_MAX_BYTES}. Carries the byte length
 * so callers can render an accurate message.
 */
export class MemoTooLongError extends Error {
  /** Number of UTF-8 bytes in the offending memo. */
  public readonly byteLength: number;

  constructor(byteLength: number, maxBytes = MEMO_MAX_BYTES) {
    super(`Memo exceeds max length of ${maxBytes} bytes (got ${byteLength})`);
    this.name = 'MemoTooLongError';
    this.byteLength = byteLength;
    Object.setPrototypeOf(this, MemoTooLongError.prototype);
  }
}