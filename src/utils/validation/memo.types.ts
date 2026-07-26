export interface MemoValidationOptions {
  memo: string;
  enforceMaxLength: boolean;
}

export interface MemoValidationResult {
  isValid: boolean;
  sanitizedMemo: string;
  error?: string;
}
