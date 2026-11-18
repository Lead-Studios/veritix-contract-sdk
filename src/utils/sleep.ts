/**
 * @module utils/sleep
 * Shared promise-based delay used by the retry and polling loops.
 */

/** Resolves after `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
