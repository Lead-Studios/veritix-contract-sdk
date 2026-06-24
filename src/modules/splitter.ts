/**
 * @module modules/splitter
 * Payment splitter operations exposed by the VeriTix Soroban contract.
 */

import { SorobanRpc, Keypair, Account } from '@stellar/stellar-sdk';
import { addressToScVal, scValToBigint } from '../utils/scval';
import { buildContractCall, simulateTransaction, submitTransaction } from '../utils/transaction';
import { parseSorobanError, VeriTixError, VeriTixErrorCode } from '../utils/errors';
import type {
  NetworkConfig,
  SplitRecord,
  SplitRecipient,
  TransactionResult,
  RevenueSplitParams,
} from '../types/index';

export interface CreateSplitParams {
  recipients: SplitRecipient[];
  totalAmount: bigint;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class SplitterModule {
  private readonly config: NetworkConfig;
  private readonly server: SorobanRpc.Server;
  private readonly keypair: Keypair | undefined;

  constructor(config: NetworkConfig, server: SorobanRpc.Server, keypair?: Keypair) {
    this.config = config;
    this.server = server;
    this.keypair = keypair;
  }

  async getSplit(_id: bigint): Promise<SplitRecord | null> {
    // TODO: implement
    void this.config;
    void this.server;
    throw new Error('SplitterModule.getSplit: not implemented');
  }

  async getSplitsBySender(_sender: string): Promise<bigint[]> {
    return [];
  }

  async getSplitsForRecipient(address: string): Promise<bigint[]> {
    const sourceAccount = new Account(Keypair.random().publicKey(), '0');
    const tx = await buildContractCall(
      this.server,
      sourceAccount,
      this.config.contractId,
      'get_splits_for_recipient',
      [addressToScVal(address)],
      this.config.networkPassphrase,
    );
    const rawResult = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(rawResult)) {
      throw parseSorobanError(rawResult.error);
    }
    const retval = rawResult.result?.retval;
    if (!retval) return [];
    const vec = (retval as any).vec as any[];
    return vec.map((v) => scValToBigint(v));
  }

  validateRecipients(recipients: SplitRecipient[]): ValidationResult {
    const errors: string[] = [];
    recipients.forEach((r, i) => {
      if (r.shareBps <= 0) errors.push(`Recipient #${i + 1} has non-positive shareBps`);
    });
    const seen = new Set<string>();
    recipients.forEach((r) => {
      const lc = r.address.toLowerCase();
      if (seen.has(lc)) errors.push(`Duplicate address: ${r.address}`);
      seen.add(lc);
    });
    if (recipients.length > 20) errors.push(`Too many recipients: ${recipients.length} (max 20)`);
    const totalBps = recipients.reduce((sum, r) => sum + r.shareBps, 0);
    if (totalBps !== 10_000) errors.push(`Total basis points must equal 10 000, got ${totalBps}`);
    return { valid: errors.length === 0, errors };
  }

  async createSplit(params: CreateSplitParams): Promise<TransactionResult> {
    if (!this.keypair) {
      throw new VeriTixError(VeriTixErrorCode.ReadOnlyClient, 'A Keypair is required for write operations.');
    }
    const totalBps = params.recipients.reduce((s, r) => s + r.shareBps, 0);
    if (totalBps !== 10_000) {
      throw new VeriTixError(VeriTixErrorCode.SplitInvalidShares, 'Recipient shares must sum to 10 000 basis points.');
    }
    // TODO: build & submit contract call
    void simulateTransaction;
    void submitTransaction;
    throw new Error('SplitterModule.createSplit: not implemented');
  }

  async createRevenueSplit(params: RevenueSplitParams): Promise<TransactionResult> {
    const { organizer, organizerBps, artist, artistBps, platform, totalAmount } = params;
    const totalBps = organizerBps + artistBps;
    if (totalBps >= 10_000) {
      throw new VeriTixError(VeriTixErrorCode.SplitInvalidShares, 'organizerBps + artistBps must be < 10 000.');
    }
    const recipients: SplitRecipient[] = [
      { address: organizer, shareBps: organizerBps },
      { address: artist, shareBps: artistBps },
      { address: platform, shareBps: 10_000 - totalBps },
    ];
    return this.createSplit({ recipients, totalAmount });
  }

  async distribute(_id: bigint): Promise<TransactionResult> {
    throw new Error('SplitterModule.distribute: not implemented');
  }
}
