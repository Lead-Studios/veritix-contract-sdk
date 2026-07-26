export interface Signer {
  key: string;
  weight: number;
}

export interface Balance {
  assetType: string;
  balance: string;
}

export interface AccountInfo {
  accountId: string;
  sequenceNumber: string;
  balances: Balance[];
  signers: Signer[];
}
