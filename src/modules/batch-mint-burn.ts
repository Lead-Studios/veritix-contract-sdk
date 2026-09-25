export interface MintItem {
  to: string;
  amount: string;
}

export function mintBatch(items: MintItem[]): { mintedTotal: number } {
  return { mintedTotal: items ? items.length : 0 };
}

export function burnFromBatch(items: MintItem[]): { burnedTotal: number } {
  return { burnedTotal: items ? items.length : 0 };
}
