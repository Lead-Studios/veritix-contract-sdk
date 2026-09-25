/**
 * @module utils/polling/polling.types
 * Shared types for the configurable polling service (issue #602).
 *
 * Every watch helper (`watchTransaction`, `watchEscrow`) builds on
 * {@link PollingService} rather than owning its own `setTimeout` loop, so
 * interval, timeout, and cancellation semantics live in one place.
 */

/** Terminal or transient status of a polled hash. */
export enum PollStatus {
  /** The polled transaction reached a terminal success state. */
  SUCCESS = 'SUCCESS',
  /** The polled transaction has not been seen yet — safe to retry. */
  NOT_FOUND = 'NOT_FOUND',
  /** The polled transaction reached a terminal failed state. */
  FAILED = 'FAILED',
  /** The polled transaction is still pending. */
  PENDING = 'PENDING',
}

/** Result of a single {@link PollingService.checkStatus} call. */
export interface PollStatusResult {
  /** The status observed for the hash. */
  status: PollStatus;
  /** The hash that was polled. */
  hash: string;
}

/** Caller-facing options accepted by every watch helper. */
export interface PollingOptions {
  /** Milliseconds between polls. Defaults to `1000`. */
  intervalMs?: number;
  /** Milliseconds after which polling gives up. Defaults to `60000`. */
  timeoutMs?: number;
  /** Optional signal used to cancel polling early. */
  signal?: AbortSignalLike;
}

/** Resolved, validated polling configuration. */
export interface PollingConfig {
  intervalMs: number;
  timeoutMs: number;
}

/**
 * Structural stand-in for the DOM `AbortSignal` so the SDK keeps compiling
 * under the ES2020-only `tsconfig` (which ships no DOM lib). Any object with
 * `aborted`/`addEventListener` works, as does a real `AbortSignal`.
 */
export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

/** Error thrown when {@link PollingService} exceeds its configured timeout. */
export class PollingTimeoutError extends Error {
  public readonly hash: string;

  constructor(hash: string, timeoutMs: number) {
    super(`Polling of ${hash} timed out after ${timeoutMs}ms`);
    this.name = 'PollingTimeoutError';
    this.hash = hash;
    Object.setPrototypeOf(this, PollingTimeoutError.prototype);
  }
}

/** Error thrown when polling is cancelled via its abort signal. */
export class PollingAbortedError extends Error {
  public readonly hash: string;

  constructor(hash: string) {
    super(`Polling of ${hash} was aborted`);
    this.name = 'PollingAbortedError';
    this.hash = hash;
    Object.setPrototypeOf(this, PollingAbortedError.prototype);
  }
}