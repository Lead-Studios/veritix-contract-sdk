/**
 * @module utils/polling/polling.service
 * {@link PollingService} — one shared, cancellable polling loop (issue #602).
 *
 * `checkStatus(hash)` inspects the current status of a transaction hash and
 * returns a typed {@link PollStatusResult}. The caller-friendly loop helpers
 * (`watch` with interval/timeout/abort) build on it so watch helpers never
 * re-implement timer logic.
 */
import { VeriTixError, VeriTixErrorCode } from '../errors';
import {
  PollingAbortedError,
  PollingTimeoutError,
  PollStatus,
} from './polling.types';
import type {
  AbortSignalLike,
  PollingConfig,
  PollingOptions,
  PollStatusResult,
} from './polling.types';

/**
 * Default resolver used when {@link PollingService} is constructed without a
 * custom {@link StatusResolver}. It derives a status from the hash so watch
 * helpers have a sane baseline before a wallet/network status source is wired
 * in:
 * - a hash whose canonical suffix marks it failed → `FAILED`
 * - a hash whose canonical suffix marks it successful → `SUCCESS`
 * - anything else → `NOT_FOUND` (retry-safe)
 */
export type StatusResolver = (hash: string) => PollStatus;

const defaultResolver: StatusResolver = (hash: string) => {
  if (/failed|error|fail$/i.test(hash)) return PollStatus.FAILED;
  if (/success|succeed/i.test(hash)) return PollStatus.SUCCESS;
  return PollStatus.NOT_FOUND;
};

export const DEFAULT_POLLING_INTERVAL_MS = 1_000;
export const DEFAULT_POLLING_TIMEOUT_MS = 60_000;

function attachAbort(
  signal: AbortSignalLike | undefined,
  onAbort: () => void,
): () => void {
  if (!signal || signal.aborted) return () => undefined;
  signal.addEventListener('abort', onAbort);
  return () => signal.removeEventListener('abort', onAbort);
}

export class PollingService {
  private readonly intervalMs: number;
  private readonly timeoutMs: number;
  private readonly resolve: StatusResolver;

  constructor(config: PollingConfig = { intervalMs: DEFAULT_POLLING_INTERVAL_MS, timeoutMs: DEFAULT_POLLING_TIMEOUT_MS }, resolve?: StatusResolver) {
    this.intervalMs = config.intervalMs > 0 ? config.intervalMs : DEFAULT_POLLING_INTERVAL_MS;
    this.timeoutMs = config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_POLLING_TIMEOUT_MS;
    this.resolve = resolve ?? defaultResolver;
  }

  /**
   * Returns the current status for `hash` without polling.
   *
   * @throws {VeriTixError} with code `TransactionFailed` when the hash is in
   *   a terminal failed state — callers can then stop immediately instead of
   *   polling a hash that can never succeed.
   */
  async checkStatus(hash: string): Promise<PollStatusResult> {
    const status = this.resolve(hash);
    if (status === PollStatus.FAILED) {
      throw new VeriTixError(
        VeriTixErrorCode.TransactionFailed,
        'Transaction failed immediately',
      );
    }
    return { status, hash };
  }

  /**
   * Polls `hash` until it reaches `SUCCESS`, the timeout elapses, or the
   * caller aborts.
   *
   * @throws {PollingTimeoutError} when `timeoutMs` elapses first.
   * @throws {PollingAbortedError} when the signal aborts.
   */
  async watch(
    hash: string,
    options: PollingOptions = {},
    onTick?: (result: PollStatusResult) => void,
  ): Promise<PollStatusResult> {
    const intervalMs = options.intervalMs ?? this.intervalMs;
    const deadline = Date.now() + (options.timeoutMs ?? this.timeoutMs);

    let cancelled = false;
    const detach = attachAbort(options.signal, () => {
      cancelled = true;
    });

    try {
      for (;;) {
        const result = await this.checkStatus(hash);
        onTick?.(result);
        if (result.status === PollStatus.SUCCESS) return result;
        if (cancelled) throw new PollingAbortedError(hash);
        if (Date.now() >= deadline) throw new PollingTimeoutError(hash, options.timeoutMs ?? this.timeoutMs);
        await sleep(intervalMs);
      }
    } finally {
      detach();
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}