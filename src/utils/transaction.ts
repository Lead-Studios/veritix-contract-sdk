/// <reference types="node" />
/**
 * @module TransactionUtils
 *
 * Provides transaction building and execution utilities for the VeriTix SDK.
 * Handles contract call construction, transaction simulation, submission,
 * and Soroban RPC communication with the Stellar network.
 */

import {
  Account,
  BASE_FEE,
  Contract,
  Keypair,
  SorobanRpc,
  Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';

import type { FeeEstimate, TransactionResult } from '../types/index';
import { parseSorobanError, VeriTixError, VeriTixErrorCode } from './errors';
import { DUMMY_PUBLIC_KEY } from './network';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A prepared (built, simulated, and assembled) transaction ready to be signed
 * and submitted.
 */
export interface PreparedTransaction {
  /** The assembled `Transaction` object, ready for signing */
  transaction: Transaction;
  /** Fee in stroops as returned by the simulation */
  simulatedFee: string;
}

/** Maximum number of polling attempts before throwing a TIMEOUT error. */
const MAX_POLL_ATTEMPTS = 20;
/** Milliseconds between each polling attempt. */
const POLL_INTERVAL_MS = 2_000;

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Builds an unsigned Soroban `invokeHostFunction` transaction that calls a
 * single contract method.
 */
export async function buildContractCall(
  server: SorobanRpc.Server | unknown,
  sourceAccount: Account,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  networkPassphrase: string,
): Promise<Transaction> {
  void server;

  const operation = new Contract(contractId).call(method, ...args);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  return tx as Transaction;
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

/**
 * Assembles a simulated Soroban transaction back into a signable
 * `TransactionBuilder` (see {@link SorobanRpc.assembleTransaction}).
 */
export function assembleTransaction(
  raw: Transaction,
  simulation: SorobanRpc.Api.SimulateTransactionResponse,
): TransactionBuilder {
  return SorobanRpc.assembleTransaction(raw, simulation);
}

// ---------------------------------------------------------------------------
// Simulate
// ---------------------------------------------------------------------------

/**
 * Simulates a transaction against the Soroban RPC and returns the assembled
 * (fee-bumped + footprint-populated) version, ready for signing.
 */
export async function simulateTransaction(
  server: SorobanRpc.Server | { simulateTransaction(tx: Transaction): Promise<unknown> },
  tx: Transaction,
): Promise<PreparedTransaction> {
  const result = (await server.simulateTransaction(tx)) as SorobanRpc.Api.SimulateTransactionResponse;

  if (SorobanRpc.Api.isSimulationError(result)) {
    throw parseSorobanError(result.error);
  }

  const assembled = SorobanRpc.assembleTransaction(tx, result).build();

  return {
    transaction: assembled as Transaction,
    simulatedFee: result.minResourceFee,
  };
}

// ---------------------------------------------------------------------------
// Fee estimation
// ---------------------------------------------------------------------------

const STROOPS_PER_XLM = 10_000_000n;

/**
 * Estimates the transaction fee for a contract call without submitting it.
 */
export async function estimateFee(
  server: SorobanRpc.Server,
  contractId: string,
  networkPassphrase: string,
  method: string,
  args: xdr.ScVal[],
): Promise<FeeEstimate> {
  const sourceAccount = new Account(DUMMY_PUBLIC_KEY, '0');

  const tx = await buildContractCall(
    server,
    sourceAccount,
    contractId,
    method,
    args,
    networkPassphrase,
  );

  const { simulatedFee } = await simulateTransaction(server, tx);
  const latestLedger = await server.getLatestLedger();

  const feeLumensBI = BigInt(simulatedFee);
  const whole = feeLumensBI / STROOPS_PER_XLM;
  const remainder = feeLumensBI % STROOPS_PER_XLM;
  const feeXLM = `${whole}.${remainder.toString().padStart(7, '0')}`;

  return {
    feeLumens: simulatedFee,
    feeXLM,
    estimatedLedger: latestLedger.sequence,
  };
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

/**
 * Options for {@link submitTransaction} retry behaviour.
 */
export interface SubmitTransactionOptions {
  /** Maximum number of retry attempts for retriable failures. Default 3. */
  maxRetries?: number;
  /** Base delay in ms between retries. Default 1000. */
  retryDelayMs?: number;
  /** Maximum poll attempts before declaring TIMEOUT. Default 20. */
  maxPollAttempts?: number;
}

/**
 * Signs a prepared transaction with the given `Keypair`, submits it to Soroban RPC,
 * and polls until confirmed in a ledger.
 */
export async function submitTransaction(
  server: SorobanRpc.Server | {
    sendTransaction(tx: Transaction): Promise<{ status: string; hash?: string; errorResult?: { toXDR(encoding?: string): string } }>;
    getTransaction(hash: string): Promise<{ status: string; ledger?: number; resultXdr?: { toXDR(encoding?: string): string } | null }>;
  },
  tx: Transaction,
  keypair: Keypair | undefined,
  options: SubmitTransactionOptions | number = {},
): Promise<TransactionResult> {
  if (!keypair) {
    throw new VeriTixError(
      VeriTixErrorCode.ReadOnlyClient,
      'This client is read-only. Provide a Keypair to enable write operations.',
    );
  }

  const opts: SubmitTransactionOptions =
    typeof options === 'number' ? { maxPollAttempts: options } : options;

  const maxRetries = opts.maxRetries ?? 3;
  const retryDelayMs = opts.retryDelayMs ?? 1_000;
  const maxPollAttempts = opts.maxPollAttempts ?? MAX_POLL_ATTEMPTS;

  // 1. Sign
  tx.sign(keypair);

  // 2. Submit with retry
  let sendResponse: { status: string; hash?: string; errorResult?: { toXDR(encoding?: string): string } } | undefined;
  let lastSubmitError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      sendResponse = await server.sendTransaction(tx);

      if (sendResponse.status !== 'ERROR') {
        break;
      }

      const errXdr = sendResponse.errorResult?.toXDR?.('base64') ?? '';
      const isRateLimit =
        errXdr.includes('RATE_LIMIT') ||
        errXdr.toLowerCase().includes('too many requests');

      if (!isRateLimit || attempt === maxRetries) {
        throw parseSorobanError(errXdr || 'Transaction submission failed');
      }
    } catch (err) {
      lastSubmitError = err;
      if (attempt === maxRetries) throw err;
    }

    const jitter = retryDelayMs * 0.2 * (Math.random() * 2 - 1);
    await sleep(retryDelayMs + jitter);
  }

  if (!sendResponse || sendResponse.status === 'ERROR') {
    throw lastSubmitError instanceof VeriTixError
      ? lastSubmitError
      : parseSorobanError('Transaction submission failed');
  }

  const hash = sendResponse.hash;
  const expectedHash = Buffer.from(tx.hash()).toString('hex');
  if (!hash || hash !== expectedHash) {
    throw new VeriTixError(
      VeriTixErrorCode.UnexpectedTransactionHash,
      `Transaction hash mismatch: expected ${expectedHash}, got ${hash}`,
    );
  }

  // 3. Poll until confirmed
  for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const response = await server.getTransaction(hash);

    if (response.status === 'NOT_FOUND') {
      continue;
    }

    if (response.status === 'FAILED') {
      throw new VeriTixError(
        VeriTixErrorCode.TransactionFailed,
        `Transaction failed on-chain: ${hash}`,
        response.resultXdr?.toXDR?.('base64'),
      );
    }

    if (response.status === 'SUCCESS') {
      return {
        hash,
        ledger: response.ledger ?? 0,
        successful: true,
      };
    }
  }

  throw new VeriTixError(
    VeriTixErrorCode.WatchTimeout,
    `Transaction ${hash} not confirmed after ${maxPollAttempts} polling attempts (TIMEOUT)`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
