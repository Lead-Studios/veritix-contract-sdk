import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const escrow = readFileSync(join(__dirname, '..', 'src', 'modules', 'escrow.ts'), 'utf8');

describe('escrow id encoding (#974/#975)', () => {
  it('encodes is_escrow_settled ids as u32', () => {
    expect(escrow).toMatch(/is_escrow_settled', \[bigintToScVal\(id, 'u32'\)\]/);
  });

  it('encodes get_escrow_age ids as u32', () => {
    expect(escrow).toMatch(/get_escrow_age', \[bigintToScVal\(id, 'u32'\)\]/);
  });

  it('no longer encodes escrow ids as u64', () => {
    expect(escrow).not.toMatch(/bigintToScVal\(id, 'u64'\)/);
  });
});
