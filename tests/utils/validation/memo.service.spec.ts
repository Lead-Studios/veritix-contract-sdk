import { MemoValidationService } from '../../../src/utils/validation/memo.service';

describe('MemoValidationService', () => {
  let service: MemoValidationService;

  beforeEach(() => {
    service = new MemoValidationService();
  });

  it('should validate short memos successfully', () => {
    const result = service.validate({ memo: 'Invoice #123', enforceMaxLength: true });
    expect(result.isValid).toBe(true);
    expect(result.sanitizedMemo).toBe('Invoice #123');
  });

  it('should invalidate memos exceeding 28 bytes', () => {
    const longMemo = 'This memo is way too long and will definitely exceed twenty eight bytes';
    const result = service.validate({ memo: longMemo, enforceMaxLength: true });
    
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('exceeds max length');
    expect(result.sanitizedMemo.length).toBe(28);
  });
});
