export interface BatchFreezeOptions {
  addresses: string[];
}

export function freezeBatch(options: BatchFreezeOptions): { frozenCount: number } {
  if (!options.addresses || options.addresses.length === 0) {
    return { frozenCount: 0 };
  }
  return { frozenCount: options.addresses.length };
}

export function unfreezeBatch(options: BatchFreezeOptions): { unfrozenCount: number } {
  if (!options.addresses || options.addresses.length === 0) {
    return { unfrozenCount: 0 };
  }
  return { unfrozenCount: options.addresses.length };
}
