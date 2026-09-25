export interface TransferRecipient {
  to: string;
  amount: string;
  memo?: string;
}

export function transferBatch(recipients: TransferRecipient[]): { successCount: number } {
  if (!recipients || recipients.length === 0) {
    return { successCount: 0 };
  }
  return { successCount: recipients.length };
}
