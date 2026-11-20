import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (file: string): string => readFileSync(join(__dirname, '..', 'src', file), 'utf8');

describe('public exports', () => {
  it('exports VeriTixClientExtended from the package entry point', () => {
    expect(src('index.ts')).toMatch(
      /export \{ VeriTixClientExtended \} from '\.\/client-extended';/,
    );
  });
});

describe('client dead helper removal', () => {
  const client = src('client.ts');

  it('no longer defines the unused toScVal helper', () => {
    expect(client).not.toMatch(/function toScVal\(/);
  });

  it('no longer references the unimported addressToScVal identifier', () => {
    expect(client).not.toMatch(/addressToScVal\(/);
  });
});
