export interface FeeComponents {
  baseFee: number;
  computeCost: number;
  storageCost: number;
}

export interface FeeEstimate {
  transactionId: string;
  totalFeeXlm: string;
  totalFeeStroops: string;
  components: FeeComponents;
}
